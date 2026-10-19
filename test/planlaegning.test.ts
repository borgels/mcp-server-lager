// Scenarier, skabeloner, egenskaber, varer pr. lokation, batterier og klimaalarmer
// (#27, #28) gennem en rigtig MCP-klient.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { KATALOG, UDEN_VAERKTOEJ } from '../src/tools/katalog.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Kald = [URL, RequestInit];

async function forbind(fetchFn: typeof fetch) {
  const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn, sleepFn: async () => {} });
  const server = createServer({ client });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0' });
  await mcp.connect(b);
  return mcp;
}
const kald = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => c as unknown as Kald);
const tekst = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

describe('scenarier', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('læser, validerer og sammenligner med scenarieId', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_scenarier', arguments: { lagerId: 1, status: 'kladde' } });
    await mcp.callTool({ name: 'scenario_hent', arguments: { scenarieId: 4, dybde: 3 } });
    await mcp.callTool({ name: 'scenario_valider', arguments: { scenarieId: 4 } });
    await mcp.callTool({ name: 'scenario_sammenlign', arguments: { ider: '4,7' } });
    await mcp.callTool({ name: 'lager_lokationer', arguments: { rod: '12', scenarieId: 4 } });
    await mcp.callTool({ name: 'lager_lokation_visning', arguments: { lokationId: 12, slags: 'oppefra', scenarieId: 4 } });
    expect(kald(fetchFn).map(([u]) => u.toString())).toEqual([
      'https://lager.test/api/lager/scenarier?lager=1&status=kladde',
      'https://lager.test/api/lager/scenarier/4?dybde=3',
      'https://lager.test/api/lager/scenarier/4/valider',
      'https://lager.test/api/lager/scenarier/sammenlign?ider=4%2C7',
      'https://lager.test/api/lager/lokationer?rod=12&plan=4',
      'https://lager.test/api/lager/lokationer/12/visning?slags=oppefra&plan=4',
    ]);
  });

  it('opret, tilføj ting med børn, flyt og fjern: kroppen og en Idempotency-Key pr. skrivning', async () => {
    const fetchFn = vi.fn(async () => svar(201, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'scenario_opret', arguments: { rodId: 12, navn: 'To reoler ved væggen' } });
    const ting = await mcp.callTool({ name: 'scenario_tilfoej_ting', arguments: {
      scenarieId: 4, parentId: 12, type: 'reol', navn: 'Ny reol', geometri: { x_mm: 0, y_mm: 0, bredde_mm: 1000, dybde_mm: 400, hoejde_mm: 2000 },
      boern: [{ type: 'hylde', antal: 5 }], koebspris: 899,
    } });
    expect(ting.isError).toBeFalsy();
    await mcp.callTool({ name: 'scenario_flyt', arguments: { scenarieId: 4, flytninger: [{ lokationId: 30, geometri: { x_mm: 1000, rotation: 90 } }, { tingId: 2, fjern: true }] } });
    await mcp.callTool({ name: 'scenario_fjern_ting', arguments: { scenarieId: 4, tingId: 2 } });
    const k = kald(fetchFn);
    expect(k.map(([u, i]) => `${i.method} ${u.pathname}`)).toEqual([
      'POST /api/lager/ansvarlig/scenarier',
      'POST /api/lager/ansvarlig/scenarier/4/ting',
      'POST /api/lager/ansvarlig/scenarier/4/flyt',
      'DELETE /api/lager/ansvarlig/scenarier/4/ting/2',
    ]);
    expect(JSON.parse(String(k[1]![1].body))).toEqual({
      parentId: 12, type: 'reol', navn: 'Ny reol', geometri: { x_mm: 0, y_mm: 0, bredde_mm: 1000, dybde_mm: 400, hoejde_mm: 2000 },
      boern: [{ type: 'hylde', antal: 5 }], koebspris: 899,
    });
    expect(JSON.parse(String(k[2]![1].body))).toEqual({ flytninger: [{ lokationId: 30, geometri: { x_mm: 1000, rotation: 90 } }, { tingId: 2, fjern: true }] });
    for (const [, i] of k.slice(0, 3)) expect((i.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^mcp-/);
    // Sletningerne har ingen nøgle (idempotente af natur) og ingen krop.
    expect((k[3]![1].headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
  });

  it('vedtag er aldrig et værktøj; scenariets skrivninger er bag skrive-flaget', async () => {
    expect(KATALOG.some((s) => s.op === 'POST /ansvarlig/scenarier/{id}/vedtag')).toBe(false);
    expect(UDEN_VAERKTOEJ['POST /ansvarlig/scenarier/{id}/vedtag']).toBeDefined();
    process.env.LAGER_ENABLE_WRITES = 'false';
    const fetchFn = vi.fn(async () => svar(201, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    expect((await mcp.listTools()).tools.map((t) => t.name)).not.toContain('scenario_vedtag');
    const r = await mcp.callTool({ name: 'scenario_opret', arguments: { rodId: 12, navn: 'x' } });
    expect(r.isError).toBe(true);
    expect(tekst(r)).toContain('LAGER_ENABLE_WRITES');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('hints: sletning og flyt er destruktive, PUT og kvittering idempotente, POST ikke', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const a = (n: string) => tools.find((t) => t.name === n)!.annotations;
    expect(a('scenario_slet')).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    expect(a('scenario_flyt')).toMatchObject({ destructiveHint: true, idempotentHint: false });
    expect(a('scenario_tilfoej_ting')).toMatchObject({ destructiveHint: false, idempotentHint: false });
    expect(a('scenario_ret')).toMatchObject({ destructiveHint: false, idempotentHint: true });
    expect(a('lager_ansvarlig_forbrugsvare_beholdning_saet')).toMatchObject({ destructiveHint: false, idempotentHint: true });
    expect(a('lager_ansvarlig_iot_alarm_kvitter')).toMatchObject({ destructiveHint: false, idempotentHint: true });
    expect(a('lager_ansvarlig_iot_styr')).toMatchObject({ destructiveHint: false, idempotentHint: true });
    expect(a('lager_batteri_opladet')).toMatchObject({ destructiveHint: false, idempotentHint: false });
    expect(a('lager_ansvarlig_iot_alarmregel_fjern')).toMatchObject({ destructiveHint: true });
    expect(a('scenario_hent')).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(a('lager_ansvarlig_iot_skift')).toMatchObject({ destructiveHint: false, openWorldHint: true });
    expect(a('lager_ansvarlig_iot_styr')).toMatchObject({ openWorldHint: true });
    expect(a('lager_ansvarlig_model_egenskaber')).toMatchObject({ destructiveHint: true, idempotentHint: true, openWorldHint: false });
    expect(a('lager_ansvarlig_forbrugsvare_egenskaber')).toMatchObject({ destructiveHint: true });
    for (const n of ['lager_ansvarlig_iot_skift', 'lager_ansvarlig_iot_styr']) expect(tools.find((t) => t.name === n)!.description).toContain('Bekræft med brugeren før du tænder, slukker eller ændrer');
  });

  it('skabelon og forsikring: id eller nøgle, og altid JSON (format er skjult)', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    expect(Object.keys(tools.find((t) => t.name === 'lager_ansvarlig_forsikring')!.inputSchema.properties!)).not.toContain('format');
    expect(Object.keys(tools.find((t) => t.name === 'lager_lokation_visning')!.inputSchema.properties!)).not.toContain('format');
    await mcp.callTool({ name: 'lager_skabelon', arguments: { skabelonId: 'reol-5' } });
    await mcp.callTool({ name: 'lager_ansvarlig_forsikring', arguments: { rod: 12 } });
    expect(kald(fetchFn).map(([u]) => u.toString())).toEqual([
      'https://lager.test/api/lager/skabeloner/reol-5',
      'https://lager.test/api/lager/ansvarlig/forsikring?rod=12',
    ]);
  });
});

describe('egenskaber og varer pr. lokation', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('lager_find gentager egenskab i forespørgslen', async () => {
    const fetchFn = vi.fn(async () => svar(200, { fund: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_find', arguments: { skabelon: 'kabel', egenskab: ['stik_a|stik_b=USB-C', 'laengde_m>=2'] } });
    expect(r.isError).toBeFalsy();
    const [url] = kald(fetchFn)[0]!;
    expect(url.searchParams.getAll('egenskab')).toEqual(['stik_a|stik_b=USB-C', 'laengde_m>=2']);
    expect(url.searchParams.get('skabelon')).toBe('kabel');
  });

  it('beholdning pr. lokation, flyt og egenskaber', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_forbrugsvare_beholdninger', arguments: { forbrugsvareId: 9 } });
    await mcp.callTool({ name: 'lager_ansvarlig_forbrugsvare_beholdning_saet', arguments: { forbrugsvareId: 9, lokationId: 40, talt: 12, minimum: null } });
    await mcp.callTool({ name: 'lager_ansvarlig_forbrugsvare_flyt', arguments: { forbrugsvareId: 9, fra: 40, til: 41, antal: 5 } });
    await mcp.callTool({ name: 'lager_ansvarlig_model_egenskaber', arguments: { modelId: 12, kategoriskabelon: 'kabel', egenskaber: { stik_a: 'USB-C', laengde_m: 2 } } });
    const k = kald(fetchFn);
    expect(k.map(([u, i]) => `${i.method} ${u.pathname}`)).toEqual([
      'GET /api/lager/forbrugsvarer/9/beholdninger',
      'PUT /api/lager/ansvarlig/forbrugsvarer/9/beholdninger',
      'POST /api/lager/ansvarlig/forbrugsvarer/9/flyt',
      'PUT /api/lager/ansvarlig/modeller/12/egenskaber',
    ]);
    expect(JSON.parse(String(k[1]![1].body))).toEqual({ lokationId: 40, talt: 12, minimum: null });
    expect(JSON.parse(String(k[2]![1].body))).toEqual({ fra: 40, til: 41, antal: 5 });
    expect(JSON.parse(String(k[3]![1].body))).toEqual({ kategoriskabelon: 'kabel', egenskaber: { stik_a: 'USB-C', laengde_m: 2 } });
  });

  it('bilag på en enhed er et link i kroppen, ikke i forespørgslen', async () => {
    const fetchFn = vi.fn(async () => svar(201, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_enhed_dokument_tilfoej', arguments: { tag: 'T-00012', navn: 'Manual', url: 'https://example.com/manual.pdf', slags: 'manual' } });
    const [url, init] = kald(fetchFn)[0]!;
    expect(url.search).toBe('');
    expect(JSON.parse(String(init.body))).toEqual({ navn: 'Manual', url: 'https://example.com/manual.pdf', slags: 'manual' });
  });
});

describe('batterier, alarmer og styring', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('læser og skriver med de rigtige stier', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_batterier', arguments: { status: 'overskredet,snart' } });
    await mcp.callTool({ name: 'lager_batteri_opladet', arguments: { tag: 'T-00055' } });
    await mcp.callTool({ name: 'lager_iot_alarmer', arguments: { lokationId: 5, aktive: true } });
    await mcp.callTool({ name: 'lager_ansvarlig_iot_alarm_kvitter', arguments: { alarmId: 3 } });
    await mcp.callTool({ name: 'lager_ansvarlig_iot_alarmregel_opret', arguments: { lokationId: 5, slags: 'over', metrik: 'fugt', graense: 70, varighedMin: 30 } });
    await mcp.callTool({ name: 'lager_ansvarlig_iot_styr', arguments: { enhedId: 8, handling: 'hastighed', vaerdi: 60 } });
    expect(kald(fetchFn).map(([u, i]) => `${i.method} ${u.pathname}${u.search}`)).toEqual([
      'GET /api/lager/batterier?status=overskredet%2Csnart',
      'POST /api/lager/batterier/T-00055/opladet',
      'GET /api/lager/iot/alarmer?lokation=5&aktive=1',
      'POST /api/lager/iot/alarmer/3/kvitter',
      'POST /api/lager/iot/alarmregler',
      'POST /api/lager/iot/enheder/8/styr',
    ]);
    expect(JSON.parse(String(kald(fetchFn)[5]![1].body))).toEqual({ handling: 'hastighed', vaerdi: 60 });
  });

  it('en tom 2xx-krop giver tom tekst, ikke undefined', async () => {
    process.env.LAGER_ENABLE_WRITES = 'true';
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_ansvarlig_iot_alarm_kvitter', arguments: { alarmId: 3 } });
    expect(r.isError).toBeFalsy();
    expect((r as { content: { type: string; text: unknown }[] }).content[0]).toEqual({ type: 'text', text: '' });
  });

  it('YAML og anden tekst kommer ud som den er', async () => {
    const fetchFn = vi.fn(async () => new Response('alias: Udsugning\n', { status: 200, headers: { 'content-type': 'text/yaml' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_iot_lokation_automationer', arguments: { lokationId: 5 } });
    expect(tekst(r)).toBe('alias: Udsugning\n');
  });
});

describe('resources og prompten planlaeg', () => {
  it('lager://scenarie, validering, plan og skabeloner', async () => {
    const fetchFn = vi.fn(async () => svar(200, { scenarie: { id: 4 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.readResource({ uri: 'lager://scenarie/4' });
    expect(JSON.parse((r.contents[0] as { text: string }).text)).toEqual({ scenarie: { id: 4 } });
    await mcp.readResource({ uri: 'lager://scenarie/4/validering' });
    await mcp.readResource({ uri: 'lager://lokation/12/plan' });
    await mcp.readResource({ uri: 'lager://skabeloner' });
    expect(kald(fetchFn).map(([u]) => `${u.pathname}${u.search}`)).toEqual([
      '/api/lager/scenarier/4',
      '/api/lager/scenarier/4/valider',
      '/api/lager/lokationer/12/visning?slags=oppefra',
      '/api/lager/skabeloner',
    ]);
    await expect(mcp.readResource({ uri: 'lager://scenarie/..' })).rejects.toThrow();
  });

  it('planlaeg guider gennem scenarier og vedtager intet', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const p = await mcp.getPrompt({ name: 'planlaeg', arguments: { rum: 'R1', maal: 'plads til 40 kasser mere', alternativer: '3' } });
    const t = (p.messages[0]!.content as { text: string }).text;
    for (const v of ['scenario_opret', 'scenario_tilfoej_ting', 'scenario_valider', 'scenario_sammenlign', 'lager_skabeloner']) expect(t).toContain(v);
    expect(t).toContain('Lav 3 forslag');
    expect(t).toContain('vedtag intet');
    const en = await mcp.getPrompt({ name: 'planlaeg', arguments: { rum: 'R1', maal: 'et bord', alternativer: '1' } });
    expect((en.messages[0]!.content as { text: string }).text).not.toContain('scenario_sammenlign');
  });
});
