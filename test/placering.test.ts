// Placeringsmotoren og zonerne i scenarier (lager-appens #159) og særhåndteringsmærkerne
// (lager-appens #160) gennem en rigtig MCP-klient.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { KATALOG } from '../src/tools/katalog.js';
import { byg } from '../src/tools/bygger.js';
import type { OpenApiDoc } from '../src/openapi/spec.js';

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
type Skema = { properties?: Record<string, Skema>; items?: Skema };
const felter = (s: unknown) => Object.keys((s as Skema).properties ?? {});

describe('placeringsmotoren', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('scenario_foreslaa_placering er en POST, der kun læser: virker uden skrive-flaget og er readOnly', async () => {
    process.env.LAGER_ENABLE_WRITES = 'false';
    const fetchFn = vi.fn(async () => svar(200, { score: 80, forslag: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const t = tools.find((x) => x.name === 'scenario_foreslaa_placering')!;
    expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    const krop = {
      ting: [{ enhed: 'T-00012', frekvens: 'daglig', gruppe: 'boring', zone: 'grovvaerktoej', zoneKrav: 'skal' }, { forbrugsvare: 9, maerker: ['asbest'] }],
      profiler: { 'kategori:Borehammer': { frekvens: 'ugentlig', vaegtKg: 6 } },
      maal: { stilling: 'staaende', arbejdspunkt: 40, vaegte: { zone: 5 } },
      omraade: 12,
    };
    const r = await mcp.callTool({ name: 'scenario_foreslaa_placering', arguments: { scenarieId: 4, ...krop } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(tekst(r))).toEqual({ score: 80, forslag: [] });
    const [url, init] = kald(fetchFn)[0]!;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/scenarier/4/placering']);
    expect(JSON.parse(String(init.body))).toEqual(krop);
    // Det forældede asbest står ikke i skemaet; maerker gør.
    const ting = (t.inputSchema.properties as Record<string, Skema>).ting!.items!;
    expect(felter(ting)).toContain('maerker');
    expect(felter(ting)).not.toContain('asbest');
  });

  it('scenario_vurder_placering læser med stilling', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'scenario_vurder_placering', arguments: { scenarieId: 4, stilling: 'siddende' } });
    expect(kald(fetchFn).map(([u, i]) => `${i.method} ${u.pathname}${u.search}`)).toEqual(['GET /api/lager/scenarier/4/placering?stilling=siddende']);
  });

  it('scenario_placer lægger linjerne i kladden med version og kilde; idempotent, ikke destruktiv, bag skrive-flaget', async () => {
    const fetchFn = vi.fn(async () => svar(200, { scenarie: { id: 4 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const t = tools.find((x) => x.name === 'scenario_placer')!;
    expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    expect(t.description).toMatch(/409/);
    expect(felter((t.inputSchema.properties as Record<string, Skema>).placeringer!.items)).not.toContain('asbest');
    const krop = { placeringer: [{ enhed: 'T-00012', lokationId: 30 }, { model: 12, antal: 2, lokationId: 31 }], version: 7, kilde: 'motor' };
    const r = await mcp.callTool({ name: 'scenario_placer', arguments: { scenarieId: 4, ...krop } });
    expect(r.isError).toBeFalsy();
    const [url, init] = kald(fetchFn)[0]!;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/ansvarlig/scenarier/4/placer']);
    expect(JSON.parse(String(init.body))).toEqual(krop);
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();

    process.env.LAGER_ENABLE_WRITES = 'false';
    const nej = await mcp.callTool({ name: 'scenario_placer', arguments: { scenarieId: 4, ...krop } });
    expect(nej.isError).toBe(true);
    expect(tekst(nej)).toContain('LAGER_ENABLE_WRITES');
  });

  it('et 409 fra scenario_placer (forældet version) kommer ud som fejl', async () => {
    const fetchFn = vi.fn(async () => svar(409, { error: 'Scenariet er ændret siden version 7' }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'scenario_placer', arguments: { scenarieId: 4, placeringer: [{ enhed: 'T-00012', lokationId: 30 }], version: 7 } });
    expect(r.isError).toBe(true);
    expect(tekst(r)).toContain('409');
  });

  it('zonerne: opret, ret og slet på scenariet', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'scenario_zone_opret', arguments: { scenarieId: 4, navn: 'Elektronik', formaal: 'lodning', evner: [{ evne: 'stroem' }], lokationer: [40] } });
    await mcp.callTool({ name: 'scenario_zone_ret', arguments: { scenarieId: 4, zoneId: 2, tilfoej: [41] } });
    await mcp.callTool({ name: 'scenario_zone_slet', arguments: { scenarieId: 4, zoneId: 2 } });
    const k = kald(fetchFn);
    expect(k.map(([u, i]) => `${i.method} ${u.pathname}`)).toEqual([
      'POST /api/lager/ansvarlig/scenarier/4/zoner',
      'PATCH /api/lager/ansvarlig/scenarier/4/zoner/2',
      'DELETE /api/lager/ansvarlig/scenarier/4/zoner/2',
    ]);
    expect(JSON.parse(String(k[0]![1].body))).toEqual({ navn: 'Elektronik', formaal: 'lodning', evner: [{ evne: 'stroem' }], lokationer: [40] });
    expect(JSON.parse(String(k[1]![1].body))).toEqual({ tilfoej: [41] });
    const { tools } = await mcp.listTools();
    expect(tools.find((x) => x.name === 'scenario_zone_slet')!.annotations).toMatchObject({ destructiveHint: true });
  });
});

describe('særhåndteringsmærker', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('lager_saermaerker læser listen; opret og ret er destruktive og sender bekraeft kun, når brugeren har sagt ja', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_saermaerker', arguments: { inklInaktive: true } });
    await mcp.callTool({ name: 'lager_ansvarlig_saermaerke_opret', arguments: { noegle: 'bly', navn: 'Bly', retur: 'karantaene', certificering: 'Blykursus', zoneregler: true } });
    await mcp.callTool({ name: 'lager_ansvarlig_saermaerke_ret', arguments: { noegle: 'bly', certificering: null } });
    const k = kald(fetchFn);
    expect(k.map(([u, i]) => `${i.method} ${u.pathname}${u.search}`)).toEqual([
      'GET /api/lager/saermaerker?inaktive=1',
      'POST /api/lager/ansvarlig/saermaerker',
      'PATCH /api/lager/ansvarlig/saermaerker/bly',
    ]);
    expect(JSON.parse(String(k[2]![1].body))).toEqual({ certificering: null });

    const { tools } = await mcp.listTools();
    for (const navn of ['lager_ansvarlig_saermaerke_opret', 'lager_ansvarlig_saermaerke_ret']) {
      expect(tools.find((x) => x.name === navn)!.annotations, navn).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    const ret = tools.find((x) => x.name === 'lager_ansvarlig_saermaerke_ret')!;
    expect(ret.description).toMatch(/bekræft altid med brugeren/);
    expect(ret.description).toMatch(/409.*spørg brugeren.*aldrig bekraeft på eget initiativ/);
    const bekraeft = (ret.inputSchema.properties as Record<string, { description?: string }>).bekraeft!;
    expect(bekraeft.description).toMatch(/^Udelad det/);
    expect(tools.find((x) => x.name === 'lager_ansvarlig_saermaerke_opret')!.description).toMatch(/udtrykkelige ja/);
  });

  it('frigivelsen: certificeret er brugerens bekræftelse, aldrig agentens egen', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const t = tools.find((x) => x.name === 'lager_procesforloeb_udfoer')!;
    expect(t.description).toMatch(/særhåndteringsmærker/);
    expect(t.description).toMatch(/sæt aldrig certificeret på eget initiativ/);
    const cert = (t.inputSchema.properties as Record<string, { description?: string; default?: unknown }>).certificeret!;
    expect(cert.description).toMatch(/Spørg brugeren; sæt det aldrig af dig selv/);
    expect(cert.default).toBeUndefined();
  });

  it('maerker afløser de forældede asbest, asbestStandard og hvem.asbest i skemaerne', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const skema = (n: string) => tools.find((x) => x.name === n)!.inputSchema as Skema;
    for (const n of ['lager_ansvarlig_ret_enhed', 'lager_ansvarlig_ret_model', 'scenario_tilfoej_ting']) {
      expect(felter(skema(n)), n).toContain('maerker');
      expect(felter(skema(n)), n).not.toContain('asbest');
      expect(felter(skema(n)), n).not.toContain('asbestStandard');
      expect(tools.find((x) => x.name === n)!.description, n).toMatch(/maerker/);
    }
    for (const n of ['lager_ansvarlig_placeringsregel_opret', 'lager_ansvarlig_placeringsregel_ret']) {
      const hvem = skema(n).properties!.hvem!;
      expect(felter(hvem), n).toEqual(expect.arrayContaining(['maerker', 'udenMaerker']));
      expect(felter(hvem), n).not.toContain('asbest');
    }
    const hvem = skema('lager_ansvarlig_procesflow_opret').properties!.start!.properties!.hvem!;
    expect(felter(hvem)).toContain('maerker');
    expect(felter(hvem)).not.toContain('asbest');
    // Rettelsens start er et frit objekt i kortet: beskrivelsen siger, at det er maerker.
    expect(tools.find((x) => x.name === 'lager_ansvarlig_procesflow_ret')!.description).toMatch(/start\.hvem.*maerker.*ikke det forældede asbest/);
  });

  it('skjul rammer felter flere led nede, også gennem $ref og linjer', () => {
    const doc = {
      info: { version: 't' },
      paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
        start: { $ref: '#/components/schemas/Start' },
        linjer: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['b'] } },
      } } } } } } } },
      components: { schemas: { Start: { type: 'object', properties: { hvem: { type: 'object', properties: { maerker: { type: 'array', items: { type: 'string' } }, asbest: { type: 'boolean' } } } } } } },
    } as unknown as OpenApiDoc;
    const b = byg({ navn: 'x', titel: 'x', beskrivelse: 'x', kort: 'x', eksempler: [], op: 'POST /x', skjul: ['start.hvem.asbest', 'linjer.b'] }, doc);
    expect(b.shape.start!.parse({ hvem: { maerker: ['bly'], asbest: true } })).toEqual({ hvem: { maerker: ['bly'] } });
    expect(b.shape.linjer!.parse([{ a: 'x' }])).toEqual([{ a: 'x' }]);
  });

  it('kataloget har værktøjer for feltsæt, forbrugsgrupper og e-conomic-varerne', () => {
    const navne = new Set(KATALOG.map((k) => k.navn));
    for (const n of ['lager_enhedsfelter', 'lager_ansvarlig_enhedsfelter_opret', 'lager_ansvarlig_enhedsfelter_ret', 'lager_ansvarlig_enhed_egenskaber',
      'lager_forbrugsgrupper', 'lager_ansvarlig_forbrugsgruppe_opret', 'lager_ansvarlig_forbrugsgruppe_ret', 'lager_ansvarlig_economic_varer']) expect(navne.has(n), n).toBe(true);
  });
});

describe('prompten planlaeg: interview, forslag, scenarier, validering og sammenligning', () => {
  it('interviewer, bruger placeringsmotoren og vedtager eller sletter intet', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const p = await mcp.getPrompt({ name: 'planlaeg', arguments: { rum: 'R1' } });
    const t = (p.messages[0]!.content as { text: string }).text;
    expect(t).toContain('Interview mig');
    for (const emne of ['Arbejdspladserne', 'Hvor ofte', 'samlet', 'Zoner', 'elektronik', '3D-print', 'grovværktøj', 'særhåndteringsmærke']) expect(t, emne).toContain(emne);
    for (const v of ['scenario_opret', 'scenario_zone_opret', 'scenario_foreslaa_placering', 'scenario_placer', 'scenario_valider', 'scenario_vurder_placering', 'scenario_sammenlign']) expect(t, v).toContain(v);
    expect(t).toContain('Lav 2 forslag');
    expect(t).toContain('vedtag intet');
    expect(t).toContain('Slet eller forkast ingen scenarier');
    expect(t).not.toContain('scenario_vedtag');
    // Forslaget skal godkendes, før det lægges i kladden.
    expect(t.indexOf('scenario_foreslaa_placering')).toBeLessThan(t.indexOf('scenario_placer ('));
    expect(t).toMatch(/kun de linjer, jeg har taget imod/);
  });
});
