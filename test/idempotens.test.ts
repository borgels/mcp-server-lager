// #113: én Idempotency-Key pr. tool-kald, genbrugt ved nye forsøg; Retry-After ved 429; forbigående 5xx.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient, retryAfterMs } from '../src/lager/client.js';
import { kanonisk, toolNoegle } from '../src/lager/idempotens.js';

const svar = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
type Kald = [URL, RequestInit];
const noegle = (c: unknown) => ((c as Kald)[1].headers as Record<string, string>)['Idempotency-Key'];

function klient(fetchFn: unknown, sleepFn = vi.fn(async (_ms: number) => {}), extra: Record<string, unknown> = {}) {
  return new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn: fetchFn as typeof fetch, sleepFn, ...extra });
}

async function forbind(client: LagerClient) {
  const server = createServer({ client });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0' });
  await mcp.connect(b);
  return mcp;
}

describe('LagerClient: nye forsøg', () => {
  it('429 med Retry-After: venter de sekunder og prøver igen med samme nøgle', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(svar(429, { error: 'For mange kald' }, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(svar(201, { ok: true }));
    const sleepFn = vi.fn(async (_ms: number) => {});
    const c = klient(fetchFn, sleepFn).medIdempotens('mcp-fast');
    await expect(c.post('/flyt', { koder: ['T-1'] })).resolves.toEqual({ ok: true });
    expect(sleepFn).toHaveBeenCalledWith(2000);
    expect(fetchFn.mock.calls.map(noegle)).toEqual(['mcp-fast', 'mcp-fast']);
  });

  it('forbigående 502/503/504 prøves igen med backoff, også uden medIdempotens med samme nøgle', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(svar(503, {}))
      .mockResolvedValueOnce(svar(502, {}))
      .mockResolvedValueOnce(svar(200, { ok: true }));
    const sleepFn = vi.fn(async (_ms: number) => {});
    await expect(klient(fetchFn, sleepFn).post('/flyt', {})).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [k1, k2, k3] = fetchFn.mock.calls.map(noegle);
    expect(k1).toMatch(/^mcp-/);
    expect([k2, k3]).toEqual([k1, k1]);
    for (const [ms] of sleepFn.mock.calls) expect(ms).toBeLessThanOrEqual(5000);
  });

  it('giver op efter maxRetries og giver appens fejl videre', async () => {
    const fetchFn = vi.fn(async () => svar(503, { error: 'Nede' }));
    await expect(klient(fetchFn, undefined, { maxRetries: 2 }).get('/mine')).rejects.toMatchObject({ status: 503, message: 'Nede' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('500, 4xx og et for langt Retry-After prøves ikke igen', async () => {
    for (const r of [svar(500, {}), svar(409, {}), svar(429, { error: 'For mange kald' }, { 'Retry-After': '120' })]) {
      const fetchFn = vi.fn(async () => r.clone());
      const e = (await klient(fetchFn).post("/flyt", {}).catch((x: unknown) => x)) as Error;
      expect(fetchFn).toHaveBeenCalledTimes(1);
      if (r.status === 429) expect(e.message).toBe('For mange kald (prøv igen om 120 s)');
    }
  });

  it('netværksfejl prøves igen, timeout ikke', async () => {
    const net = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(svar(200, { ok: 1 }));
    await expect(klient(net).get('/mine')).resolves.toEqual({ ok: 1 });
    const timeout = vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); });
    await expect(klient(timeout).get('/mine')).rejects.toThrow('timeout');
    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it('Retry-After som sekunder eller HTTP-dato', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs('snart')).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});

describe('nøglen pr. tool-kald', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('er stabil for samme kald og forskellig for andet id, værktøj, argumenter, bruger eller session', () => {
    const g = { user: 'u', tool: 'lager_aflever', input: { linjer: [{ kode: 'T-1' }], a: 1 }, requestId: 3, session: 's1' };
    const k = toolNoegle(g);
    expect(k).toMatch(/^mcp-[0-9a-f]{40}$/);
    expect(toolNoegle({ ...g, input: { a: 1, linjer: [{ kode: 'T-1' }] } })).toBe(k);
    for (const anden of [{ requestId: 4 }, { tool: 'lager_flyt_projekt' }, { input: { linjer: [{ kode: 'T-2' }] } }, { user: 'v' }, { session: 's2' }]) {
      expect(toolNoegle({ ...g, ...anden })).not.toBe(k);
    }
    // Klientens egen nøgle går forud for session og id.
    expect(toolNoegle({ ...g, klientNoegle: 'agent-123456', requestId: 9, session: 'x' })).toBe(toolNoegle({ ...g, klientNoegle: 'agent-123456' }));
    expect(kanonisk({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
  });

  it('et tool-kald bruger sin nøgle ved retry, og flere skrivninger i ét kald får -2, -3', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(svar(429, {}, { 'Retry-After': '0' }))
      .mockResolvedValue(svar(201, { linje: {} }));
    const mcp = await forbind(klient(fetchFn));
    const r = await mcp.callTool({ name: 'lager_ansvarlig_optaelling_scan', arguments: { optaellingId: 3, koder: ['T-1', 'T-2'] } });
    expect(r.isError).toBeFalsy();
    const [a, b, c] = fetchFn.mock.calls.map(noegle);
    expect(a).toMatch(/^mcp-[0-9a-f]{40}$/);
    expect([b, c]).toEqual([a, `${a}-2`]);
  });

  it('klientens _meta.idempotencyKey giver samme nøgle, når agenten gentager hele kaldet', async () => {
    const fetchFn = vi.fn(async () => svar(201, {}));
    const mcp = await forbind(klient(fetchFn));
    const args = { koder: ['T-00001'], projektId: 7 };
    await mcp.callTool({ name: 'lager_flyt_projekt', arguments: args, _meta: { idempotencyKey: 'agent-kald-1' } });
    await mcp.callTool({ name: 'lager_flyt_projekt', arguments: args, _meta: { idempotencyKey: 'agent-kald-1' } });
    await mcp.callTool({ name: 'lager_flyt_projekt', arguments: args });
    await mcp.callTool({ name: 'lager_flyt_projekt', arguments: args });
    const [k1, k2, k3, k4] = fetchFn.mock.calls.map(noegle);
    expect(k2).toBe(k1);
    expect(k3).not.toBe(k1);
    expect(k4).not.toBe(k3); // nyt JSON-RPC-id: et nyt kald
  });

  it('to servere (to sessioner) giver forskellige nøgler for samme id og argumenter', async () => {
    const fetchFn = vi.fn(async () => svar(201, {}));
    const args = { koder: ['T-00001'], projektId: 7 };
    await (await forbind(klient(fetchFn))).callTool({ name: 'lager_flyt_projekt', arguments: args });
    await (await forbind(klient(fetchFn))).callTool({ name: 'lager_flyt_projekt', arguments: args });
    const [k1, k2] = fetchFn.mock.calls.map(noegle);
    expect(k1).not.toBe(k2);
  });
});
