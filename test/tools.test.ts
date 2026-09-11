import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { CAPABILITIES } from '../src/lager/capabilities.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function forbind(fetchFn: typeof fetch) {
  const server = createServer({ client: new LagerClient({ baseUrl: 'https://bcc.test', apiToken: 'tok', user: 'jens@onedanmark.dk', fetchFn }) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  return client;
}

describe('tools', () => {
  beforeEach(() => { delete process.env.LAGER_ENABLE_WRITES; });

  it('registrerer alle værktøjer fra kortet', async () => {
    const client = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await client.listTools();
    const navne = tools.map((t) => t.name).sort();
    expect(navne).toEqual(CAPABILITIES.map((c) => c.tool).sort());
  });

  it('læser gennem bcc med brugeren på', async () => {
    const fetchFn = vi.fn(async () => svar(200, { antal: 2, projekter: [] }));
    const client = await forbind(fetchFn as unknown as typeof fetch);
    const r = await client.callTool({ name: 'lager_mine', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as { text: string }[])[0]!.text)).toEqual({ antal: 2, projekter: [] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/lager/mine');
    expect((init.headers as Record<string, string>)['X-MCP-User']).toBe('jens@onedanmark.dk');
  });

  it('afviser skrivning, når writes er slået fra, og kalder ikke bcc', async () => {
    const fetchFn = vi.fn();
    const client = await forbind(fetchFn as unknown as typeof fetch);
    const r = await client.callTool({ name: 'lager_flyt_projekt', arguments: { koder: ['OMM-00001'], projektId: 7 } });
    expect(r.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skriver, når writes er slået til, og giver bcc\'s fejl videre', async () => {
    process.env.LAGER_ENABLE_WRITES = 'true';
    const fetchFn = vi.fn(async () => svar(409, { error: 'Står allerede på det projekt' }));
    const client = await forbind(fetchFn as unknown as typeof fetch);
    const r = await client.callTool({ name: 'lager_flyt_projekt', arguments: { koder: ['OMM-00001'], projektId: 7 } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]!.text).toContain('Står allerede på det projekt (HTTP 409)');
    const [, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ koder: ['OMM-00001'], projektId: 7 });
  });
});
