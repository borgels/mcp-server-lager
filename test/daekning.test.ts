// De nye værktøjer (#25), modulerne, resources og prompts (#27) gennem en rigtig MCP-klient.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, createServerMedModuler } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { ModulCache } from '../src/lager/moduler.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Kald = [URL, RequestInit];

async function forbind(fetchFn: typeof fetch, moduler?: ModulCache) {
  const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn });
  const server = moduler ? await createServerMedModuler({ client, moduler }) : createServer({ client });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0' });
  await mcp.connect(b);
  return mcp;
}
const tekst = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

describe('nye værktøjer', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('lager_tilgaengelighed sender lager og periode som forespørgsel', async () => {
    const fetchFn = vi.fn(async () => svar(200, { kategorier: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_tilgaengelighed', arguments: { lagerId: 2, fra: '2026-10-20', til: '2026-10-24' } });
    expect(r.isError).toBeFalsy();
    const [url] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(url.toString()).toBe('https://lager.test/api/lager/tilgaengelighed?lager=2&fra=2026-10-20&til=2026-10-24');
  });

  it('lager_book poster kroppen med Idempotency-Key og kræver projektId, fra og til', async () => {
    const fetchFn = vi.fn(async () => svar(201, { booking: { id: 41 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const mangler = await mcp.callTool({ name: 'lager_book', arguments: { fra: '2026-10-20', til: '2026-10-24' } });
    expect(mangler.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const r = await mcp.callTool({ name: 'lager_book', arguments: { projektId: 7, kategori: 'Borehammer', antal: 2, fra: '2026-10-20', til: '2026-10-24' } });
    expect(r.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(url.pathname).toBe('/api/lager/bookinger');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^mcp-/);
    expect(JSON.parse(String(init.body))).toEqual({ projektId: 7, kategori: 'Borehammer', antal: 2, fra: '2026-10-20', til: '2026-10-24' });
  });

  it('lager_booking_status er PATCH på bookingen', async () => {
    const fetchFn = vi.fn(async () => svar(200, { booking: { id: 41, status: 'annulleret' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_booking_status', arguments: { bookingId: 41, status: 'annulleret' } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['PATCH', '/api/lager/bookinger/41']);
    expect(JSON.parse(String(init.body))).toEqual({ status: 'annulleret' });
  });

  it('optællingen: scan tager flere koder, gør op og luk poster uden felter', async () => {
    const fetchFn = vi.fn(async (u: URL) => svar(201, { linje: { kode: u.pathname } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.callTool({ name: 'lager_ansvarlig_optaelling_scan', arguments: { optaellingId: 3, koder: ['T-00012', 'T-00013'], plads: 'A-12-3' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(tekst(r)).scannet).toHaveLength(2);
    const bodies = fetchFn.mock.calls.map((c) => JSON.parse(String((c as unknown as Kald)[1].body)));
    expect(bodies).toEqual([{ kode: 'T-00012', plads: 'A-12-3' }, { kode: 'T-00013', plads: 'A-12-3' }]);
    expect((fetchFn.mock.calls[0] as unknown as Kald)[0].pathname).toBe('/api/lager/ansvarlig/optaelling/3/scan');
    fetchFn.mockClear();
    await mcp.callTool({ name: 'lager_ansvarlig_optaelling_luk', arguments: { optaellingId: 3 } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname, init.body]).toEqual(['POST', '/api/lager/ansvarlig/optaelling/3/luk', '{}']);
  });

  it('lager_ansvarlig_optaellinger vælger status med optaellingId', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_optaellinger', arguments: { lagerId: 1 } });
    await mcp.callTool({ name: 'lager_ansvarlig_optaellinger', arguments: { optaellingId: 9 } });
    const stier = fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].toString());
    expect(stier).toEqual(['https://lager.test/api/lager/ansvarlig/optaelling?lager=1', 'https://lager.test/api/lager/ansvarlig/optaelling/9']);
  });

  it('flag i forespørgslen sendes som 1 under API-navnet', async () => {
    const fetchFn = vi.fn(async () => svar(200, { modeller: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_modeller', arguments: { inklInaktive: true } });
    await mcp.callTool({ name: 'lager_ansvarlig_modeller', arguments: { inklInaktive: false } });
    const stier = fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].toString());
    expect(stier).toEqual(['https://lager.test/api/lager/ansvarlig/modeller?inaktive=1', 'https://lager.test/api/lager/ansvarlig/modeller']);
  });

  it('sæt på plads sender de faste felter og koderne som linjer', async () => {
    const fetchFn = vi.fn(async () => svar(201, { registreret: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_saet_paa_plads', arguments: { koder: ['T-00012'], plads: 'A-12-3' } });
    const [, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(JSON.parse(String(init.body))).toEqual({ slags: 'flyt', begrundelse: 'Sat på plads via MCP', linjer: ['T-00012'], plads: 'A-12-3' });
  });

  it('sætdele: tag ud er DELETE med begge mærker i stien', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_saet_fjern_del', arguments: { tag: 'T-00031', del: 'T-00040', bekraeftet: true } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname, init.body]).toEqual(['DELETE', '/api/lager/ansvarlig/saet/T-00031/dele/T-00040', undefined]);
    const r = await mcp.callTool({ name: 'lager_ansvarlig_saet_fjern_del', arguments: { tag: 'T-00031', del: '..', bekraeftet: true } });
    expect(r.isError).toBe(true);
  });

  it('optællingens afgørelse: kassation, hos_person og oprettet afvises uden at kalde appen', async () => {
    const fetchFn = vi.fn(async () => svar(200, { linje: { id: 5 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    for (const slags of ['kasseret', 'hos_person', 'oprettet']) {
      const r = await mcp.callTool({ name: 'lager_ansvarlig_optaelling_afgoer', arguments: { optaellingId: 3, linjeId: 5, afgoerelse: { slags } } });
      expect(r.isError, slags).toBe(true);
    }
    expect(fetchFn).not.toHaveBeenCalled();
    // «savnet» kræver brugerens ja; de andre afgørelser gør ikke.
    const udenJa = await mcp.callTool({ name: 'lager_ansvarlig_optaelling_afgoer', arguments: { optaellingId: 3, linjeId: 5, afgoerelse: { slags: 'savnet' } } });
    expect(udenJa.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const ok = await mcp.callTool({ name: 'lager_ansvarlig_optaelling_afgoer', arguments: { optaellingId: 3, linjeId: 5, afgoerelse: { slags: 'savnet' }, bekraeftet: true } });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(String((fetchFn.mock.calls[0] as unknown as Kald)[1].body))).toEqual({ linjeId: 5, afgoerelse: { slags: 'savnet' } });
    const { tools } = await mcp.listTools();
    const afgoer = tools.find((x) => x.name === 'lager_ansvarlig_optaelling_afgoer')!;
    const slagsSkema = (afgoer.inputSchema.properties!.afgoerelse as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(slagsSkema.slags!.enum).toEqual(['savnet', 'ikke_vores', 'plads_flyttet', 'ok']);
    expect(Object.keys(slagsSkema)).toEqual(['slags']);
    for (const n of ['lager_ansvarlig_optaelling_afgoer', 'lager_ansvarlig_optaelling_luk']) expect(tools.find((x) => x.name === n)!.annotations?.destructiveHint, n).toBe(true);
  });

  it('ret enhed: model og købspris kræver brugerens ja, og null sletter et felt', async () => {
    const fetchFn = vi.fn(async () => svar(200, { enhed: {} }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const felter = Object.keys(tools.find((x) => x.name === 'lager_ansvarlig_ret_enhed')!.inputSchema.properties!);
    expect(felter).toContain('koebspris');
    expect(felter).toContain('modelId');
    const udenJa = await mcp.callTool({ name: 'lager_ansvarlig_ret_enhed', arguments: { tag: 'T-00012', koebspris: 1 } });
    expect(udenJa.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const r = await mcp.callTool({ name: 'lager_ansvarlig_ret_enhed', arguments: { tag: 'T-00012', note: null, plads: 'A-12-3' } });
    expect(r.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['PUT', '/api/lager/ansvarlig/enheder/T-00012']);
    expect(JSON.parse(String(init.body))).toEqual({ note: null, plads: 'A-12-3' });
    await mcp.callTool({ name: 'lager_ansvarlig_ret_enhed', arguments: { tag: 'T-00012', modelId: 14, koebspris: 2799, bekraeftet: true } });
    expect(JSON.parse(String((fetchFn.mock.calls[1] as unknown as Kald)[1].body))).toEqual({ modelId: 14, koebspris: 2799 });
  });

  it('nye skrivninger er også spærret uden LAGER_ENABLE_WRITES', async () => {
    delete process.env.LAGER_ENABLE_WRITES;
    const fetchFn = vi.fn();
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    for (const [name, args] of [['lager_book', { projektId: 1, fra: '2026-10-20', til: '2026-10-21' }], ['lager_ansvarlig_optaelling_start', {}], ['lager_ansvarlig_ret_model', { modelId: 1, navn: 'x' }]] as const) {
      const r = await mcp.callTool({ name, arguments: args });
      expect(r.isError, name).toBe(true);
      expect(tekst(r)).toMatch(/LAGER_ENABLE_WRITES/);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('moduler', () => {
  const medMe = (moduler: Record<string, boolean>) =>
    vi.fn(async (u: URL) => (u.pathname === '/api/lager/me' ? svar(200, { lagre: [], moduler }) : svar(200, { ok: true })));

  it('skjuler værktøjer for moduler, der er slået fra', async () => {
    const mcp = await forbind(medMe({ booking: false, bestillinger: true }) as unknown as typeof fetch, new ModulCache());
    const navne = (await mcp.listTools()).tools.map((t) => t.name);
    expect(navne).not.toContain('lager_book');
    expect(navne).not.toContain('lager_tilgaengelighed');
    expect(navne).not.toContain('lager_ansvarlig_pluk');
    expect(navne).toContain('lager_bestil');
    expect(navne).toContain('lager_opslag');
    const sog = await mcp.callTool({ name: 'lager_search_capabilities', arguments: { query: 'book' } });
    expect(tekst(sog)).not.toContain('lager_book"');
  });

  it('afviser med en klar besked, når modulet slås fra efter opstart', async () => {
    let booking = true;
    const fetchFn = vi.fn(async (u: URL) => (u.pathname === '/api/lager/me' ? svar(200, { moduler: { booking } }) : svar(200, { ok: true })));
    const cache = new ModulCache(0);
    const mcp = await forbind(fetchFn as unknown as typeof fetch, cache);
    booking = false;
    const r = await mcp.callTool({ name: 'lager_tilgaengelighed', arguments: {} });
    expect(r.isError).toBe(true);
    expect(tekst(r)).toMatch(/modulet booking er slået fra/);
    expect(fetchFn.mock.calls.every((c) => (c as unknown as Kald)[0].pathname === '/api/lager/me')).toBe(true);
  });

  it('skjuler intet, når /me ikke kan nås', async () => {
    const fetchFn = vi.fn(async () => svar(500, { error: 'nede' }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, new ModulCache());
    expect((await mcp.listTools()).tools.map((t) => t.name)).toContain('lager_book');
  });
});

describe('resources og prompts', () => {
  it('lager://enhed/{tag} og lager://plads/{kode} læser opslag og plads', async () => {
    const fetchFn = vi.fn(async () => svar(200, { enhed: { tag: 'T-00012' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const r = await mcp.readResource({ uri: 'lager://enhed/T-00012' });
    expect(JSON.parse((r.contents[0] as { text: string }).text)).toEqual({ enhed: { tag: 'T-00012' } });
    await mcp.readResource({ uri: 'lager://plads/A-12-3' });
    const stier = fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].pathname);
    expect(stier).toEqual(['/api/lager/opslag/T-00012', '/api/lager/pladser/A-12-3']);
    const skabeloner = (await mcp.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate).sort();
    expect(skabeloner).toEqual(['lager://enhed/{tag}', 'lager://lokation/{id}', 'lager://lokation/{id}/plan', 'lager://plads/{kode}', 'lager://rum/{id}/klima', 'lager://scenarie/{id}', 'lager://scenarie/{id}/validering']);
  });

  it('lager://lagre giver lagre og moduler', async () => {
    const fetchFn = vi.fn(async () => svar(200, { person: { navn: 'x' }, lagre: [{ id: 1 }], moduler: { booking: true }, ansvarlig: false, tal: {} }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    expect((await mcp.listResources()).resources.map((r) => r.uri)).toEqual(['lager://lagre', 'lager://skabeloner']);
    const r = await mcp.readResource({ uri: 'lager://lagre' });
    expect(JSON.parse((r.contents[0] as { text: string }).text)).toMatchObject({ lagre: [{ id: 1 }], moduler: { booking: true } });
  });

  it('prompts findes og bruger argumenterne', async () => {
    const mcp = await forbind(vi.fn() as unknown as typeof fetch);
    const navne = (await mcp.listPrompts()).prompts.map((p) => p.name).sort();
    expect(navne).toEqual(['aflever-et-saet', 'daglig-runde', 'hvor-er', 'klimatjek', 'planlaeg', 'tael-en-reol']);
    const p = await mcp.getPrompt({ name: 'tael-en-reol', arguments: { omraade: 'A-12' } });
    expect((p.messages[0]!.content as { text: string }).text).toContain('lager_ansvarlig_optaelling_start (omraade: «A-12»)');
    const h = await mcp.getPrompt({ name: 'hvor-er', arguments: { hvad: 'T-00012' } });
    expect((h.messages[0]!.content as { text: string }).text).toContain('lager_opslag');
  });
});
