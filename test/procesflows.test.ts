// Værktøjerne til placeringsregler, procesflows, udlån, kanban, stregkoder og
// indretning gennem en rigtig MCP-klient: de rigtige stier, forespørgsler og kroppe,
// og hints, der får klienten til at spørge brugeren før en frigivelse.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Kald = [URL, RequestInit];

async function forbind(fetchFn: typeof fetch) {
  const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn });
  const server = createServer({ client });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0' });
  await mcp.connect(b);
  return mcp;
}

describe('procesflows, udlån, kanban, stregkoder og indretning', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('lager_procesforloeb_udfoer poster trinnet med Idempotency-Key og er markeret destruktiv', async () => {
    const fetchFn = vi.fn(async () => svar(200, { forloeb: { id: 9 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const udfoer = tools.find((t) => t.name === 'lager_procesforloeb_udfoer')!;
    expect(udfoer.annotations?.destructiveHint).toBe(true);
    expect(udfoer.annotations?.readOnlyHint).toBe(false);
    const r = await mcp.callTool({ name: 'lager_procesforloeb_udfoer', arguments: { forloebId: 9, trin: 'rengoering', tjekket: ['stoevsuget'], certificeret: true } });
    expect(r.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/procesforloeb/9/udfoer']);
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^mcp-/);
    expect(JSON.parse(String(init.body))).toEqual({ trin: 'rengoering', tjekket: ['stoevsuget'], certificeret: true });
  });

  it('lager_find_plads sender model, mål, rod og scenarie som forespørgsel', async () => {
    const fetchFn = vi.fn(async () => svar(200, { pladser: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_find_plads', arguments: { lagerId: 2, modelId: 12, rodId: 40, scenarieId: 4, ukendte: true } });
    const [url] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(url.pathname).toBe('/api/lager/lokationer/find-plads');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lager: '2', model: '12', rod: '40', plan: '4', ukendte: '1' });
  });

  it('lager_ansvarlig_kanban filtrerer på vare; tilbagekald er DELETE på kortet', async () => {
    const fetchFn = vi.fn(async () => svar(200, { kort: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_kanban', arguments: { forbrugsvareId: 7 } });
    await mcp.callTool({ name: 'lager_ansvarlig_kanban_tilbagekald', arguments: { kanbanId: 12 } });
    const [liste] = fetchFn.mock.calls[0] as unknown as Kald;
    const [url, init] = fetchFn.mock.calls[1] as unknown as Kald;
    expect(liste.toString()).toBe('https://lager.test/api/lager/ansvarlig/kanban?vare=7');
    expect([init.method, url.pathname]).toEqual(['DELETE', '/api/lager/ansvarlig/kanban/12']);
  });

  it('lager_udlaan_ret tager null for at slette forventet retur', async () => {
    const fetchFn = vi.fn(async () => svar(200, { udlaan: { id: 3 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_udlaan_ret', arguments: { udlaanId: 3, forventetRetur: null } });
    expect(r.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['PATCH', '/api/lager/udlaan/3']);
    expect(JSON.parse(String(init.body))).toEqual({ forventetRetur: null });
  });

  it('stregkoden sti-kodes i opslaget', async () => {
    const fetchFn = vi.fn(async () => svar(200, { vare: null }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_stregkode', arguments: { kode: '5701234567892' } });
    const [url] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(url.pathname).toBe('/api/lager/stregkoder/5701234567892');
  });

  it('ingen værktøjer til lånerens link, kanbankortets token eller kameraernes billeder', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const navne = (await mcp.listTools()).tools.map((t) => t.name);
    for (const n of ['lager_udlaan_link', 'lager_udlaan_link_tilbagekald', 'lager_laan', 'lager_ansvarlig_kanban_link', 'lager_ansvarlig_kanban_etiketter', 'lager_kanban', 'lager_kanban_signal', 'lager_iot_kamera_billede', 'lager_iot_kamera_live']) {
      expect(navne, n).not.toContain(n);
    }
    expect(navne).toContain('lager_iot_kameraer');
  });
});
