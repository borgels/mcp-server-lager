// Værktøjerne til placeringsregler, procesflows, udlån, kanban, stregkoder og
// indretning gennem en rigtig MCP-klient: de rigtige stier, forespørgsler og kroppe,
// og hints, der får klienten til at spørge brugeren før en frigivelse.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLagerResources, RESOURCE_OPS } from '../src/resources.js';
import { SPEC, type OpenApiDoc } from '../src/openapi/spec.js';
import { KATALOG } from '../src/tools/katalog.js';

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
    await mcp.callTool({ name: 'lager_ansvarlig_kanban_tilbagekald', arguments: { kanbanId: 12, bekraeftet: true } });
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

  it('bekraeft og certificeret har ingen standardværdi og sendes kun, når de er givet', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    for (const [navn, felt] of [['lager_procesforloeb_udfoer', 'certificeret'], ['lager_ansvarlig_placeringsregel_ret', 'bekraeft'], ['lager_ansvarlig_procesflow_ret', 'bekraeft'], ['lager_ansvarlig_procesflow_opret', 'bekraeft']] as const) {
      const skema = tools.find((t) => t.name === navn)!.inputSchema as { properties: Record<string, { default?: unknown }>; required?: string[] };
      expect(skema.properties[felt], `${navn}.${felt}`).toBeDefined();
      expect(skema.properties[felt]!.default, `${navn}.${felt}`).toBeUndefined();
      expect(skema.required ?? [], `${navn}.${felt}`).not.toContain(felt);
    }
    await mcp.callTool({ name: 'lager_procesforloeb_udfoer', arguments: { forloebId: 9, trin: 'rengoering' } });
    await mcp.callTool({ name: 'lager_ansvarlig_placeringsregel_ret', arguments: { placeringsregelId: 4, aktiv: false } });
    await mcp.callTool({ name: 'lager_ansvarlig_procesflow_ret', arguments: { procesflowId: 2, navn: 'Rengøring' } });
    const kroppe = fetchFn.mock.calls.map((c) => JSON.parse(String((c as unknown as Kald)[1].body)));
    expect(kroppe).toEqual([{ trin: 'rengoering' }, { aktiv: false }, { navn: 'Rengøring' }]);
  });

  it('asbestændringer kræver brugerens ja, og 409 må ikke besvares med bekraeft af sig selv', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    for (const navn of ['lager_ansvarlig_placeringsregel_ret', 'lager_ansvarlig_procesflow_ret', 'lager_ansvarlig_procesflow_opret']) {
      const t = tools.find((x) => x.name === navn)!;
      expect(t.annotations?.destructiveHint, navn).toBe(true);
      expect(t.description, navn).toMatch(/udtrykkelige ja/);
      expect(t.description, navn).toMatch(/409.*spørg brugeren.*aldrig bekraeft på eget initiativ/);
    }
    const flowRet = tools.find((x) => x.name === 'lager_ansvarlig_procesflow_ret')!.description!;
    for (const ord of ['steder', 'frigivesAf', 'tjekliste', 'certificering']) expect(flowRet).toContain(ord);
  });

  it('openWorldHint: påmindelsen mailer låneren, produktopslaget spørger eksterne kilder', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const hint = (n: string) => tools.find((t) => t.name === n)!.annotations;
    expect(hint('lager_udlaan_ret')?.openWorldHint).toBe(true);
    expect(hint('lager_ansvarlig_produktopslag')?.openWorldHint).toBe(true);
    expect(hint('lager_ansvarlig_produktopslag')?.readOnlyHint).toBe(true);
    expect(hint('lager_stregkode')?.openWorldHint).toBe(false);
  });

  it('kanbanId er række-id\'et fundet ud fra kode, aldrig KB-koden skåret til et tal', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    for (const navn of ['lager_ansvarlig_kanban_et', 'lager_ansvarlig_kanban_ret', 'lager_ansvarlig_kanban_tilbagekald']) {
      const t = tools.find((x) => x.name === navn)!;
      const id = (t.inputSchema as { properties: Record<string, { description?: string }> }).properties.kanbanId!;
      expect(id.description, navn).toMatch(/række-id.*lager_ansvarlig_kanban/);
      expect(id.description, navn).toMatch(/aldrig KB-… ned til et tal/);
    }
    expect(KATALOG.filter((k) => k.navn.includes('kanban')).flatMap((k) => k.eksempler).filter((e) => /KB-\d+\b/.test(e))).toEqual([]);
  });

  it('en resource på en sti markeret uden værktøj registreres ikke', async () => {
    const doc = structuredClone(SPEC) as OpenApiDoc;
    (doc.paths['/skabeloner'] as Record<string, unknown>)['x-mcp'] = { vaerktoej: 'false', grund: 'Test.' };
    const server = new McpServer({ name: 't', version: '0' });
    registerLagerResources(server, new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn: vi.fn() as unknown as typeof fetch }), doc);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const mcp = new Client({ name: 'test', version: '0' });
    await mcp.connect(b);
    expect((await mcp.listResources()).resources.map((r) => r.uri)).toEqual(['lager://lagre']);
    for (const op of Object.values(RESOURCE_OPS)) expect(SPEC.paths[op.split(' ')[1]!]?.get, op).toBeDefined();
  });
});
