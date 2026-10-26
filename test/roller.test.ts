// Roller: gatewayens lager-laes/lager-skriv (X-MCP-Roles) og lagerets egne roller fra /me
// bestemmer, hvilke værktøjer personen ser og kan kalde. Og de nye skrivninger for den
// lageransvarlige: bekræftelse, kroppen og hvad der aldrig sendes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, createServerMedModuler } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { ModulCache } from '../src/lager/moduler.js';
import {
  afvisning, konfigureredeRoller, LagerrolleCache, lagerrollerFra, rollerForKald, tolkRoller, UKENDTE_LAGERROLLER, type Adgang, type Lagerroller,
} from '../src/lager/roller.js';
import { CAPABILITIES, searchCapabilities } from '../src/lager/capabilities.js';
import { assertHttpStartupConfig } from '../src/transports/startup.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Kald = [URL, RequestInit];
const tekst = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

const BRUGER: Lagerroller = { ansvarlig: false, medarbejder: true, kunKiosk: false };
const ANSVARLIG: Lagerroller = { ansvarlig: true, medarbejder: true, kunKiosk: false };
const KIOSK: Lagerroller = { ansvarlig: false, medarbejder: false, kunKiosk: true };

async function forbind(fetchFn: typeof fetch, adgang?: Adgang) {
  const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn });
  const server = createServer({ client, adgang });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0' });
  await mcp.connect(b);
  return mcp;
}
const navne = async (mcp: Client) => (await mcp.listTools()).tools.map((t) => t.name);

describe('gatewayens roller', () => {
  it('X-MCP-Roles tolkes til de kendte roller; ukendte og store bogstaver gør intet galt', () => {
    expect(tolkRoller('lager-skriv, intempus-admin ,LAGER-LAES')).toEqual(['lager-laes', 'lager-skriv']);
    expect(tolkRoller('')).toEqual([]);
    expect(tolkRoller(undefined)).toEqual([]);
  });

  it('uden LAGER_ROLLER er alle lager-skriv (som før rollerne); en ugyldig værdi stopper opstarten', () => {
    expect(konfigureredeRoller({})).toEqual(['lager-skriv']);
    expect(konfigureredeRoller({ LAGER_ROLLER: 'lager-laes' })).toEqual(['lager-laes']);
    expect(konfigureredeRoller({ LAGER_ROLLER: 'gateway' })).toEqual([]);
    expect(() => konfigureredeRoller({ LAGER_ROLLER: 'skriv' })).toThrow(/LAGER_ROLLER/);
    const ok = { LAGER_TRUST_FORWARDED_USER: 'true', MCP_IDEMPOTENS_HEMMELIGHED: 'x'.repeat(32) };
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { ...ok, LAGER_ROLLER: 'lager_skriv' })).toThrow(/LAGER_ROLLER/);
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { ...ok, LAGER_ROLLER: 'gateway' })).not.toThrow();
  });

  it('LAGER_ROLLER=gateway: rollerne kommer fra X-MCP-Roles, og kun bag en betroet gateway', () => {
    const gw = { LAGER_ROLLER: 'gateway', LAGER_TRUST_FORWARDED_USER: 'true' };
    expect(rollerForKald('lager-laes', gw)).toEqual(['lager-laes']);
    expect(rollerForKald('lager-laes,lager-skriv', gw)).toEqual(['lager-laes', 'lager-skriv']);
    expect(rollerForKald(undefined, gw)).toEqual([]);
    expect(rollerForKald('lager-skriv', { LAGER_ROLLER: 'gateway' })).toEqual([]);
    // Uden gateway-roller betyder headeren intet: en klient kan ikke give sig selv skriveadgang.
    expect(rollerForKald('lager-skriv', { LAGER_ROLLER: 'lager-laes' })).toEqual(['lager-laes']);
  });
});

describe('lagerets roller fra /me', () => {
  it('ansvarlig, medarbejder og kun kiosk', () => {
    expect(lagerrollerFra({ ansvarlig: true, kunKiosk: false, lagre: [{ ansvarlig: true, medarbejder: true }] })).toEqual(ANSVARLIG);
    expect(lagerrollerFra({ lagre: [{ ansvarlig: false, medarbejder: true }] })).toEqual(BRUGER);
    expect(lagerrollerFra({ lagre: [{ kiosk: true, medarbejder: false }] })).toEqual(KIOSK);
    expect(lagerrollerFra({})).toBeNull();
  });

  it('afvisning: læs, skriv, lageransvarlig og kiosk', () => {
    const laes = { navn: 'lager_mine', skriv: false, ansvarlig: false };
    const tjekUd = { navn: 'lager_tjek_ud', skriv: true, ansvarlig: false };
    const opret = { navn: 'lager_ansvarlig_model_opret', skriv: true, ansvarlig: true };
    const overblik = { navn: 'lager_ansvarlig_overblik', skriv: false, ansvarlig: true };
    const me = { navn: 'lager_me', skriv: false, ansvarlig: false };
    expect(afvisning(laes, { roller: [], lager: BRUGER })).toMatch(/ingen lager-rolle/);
    expect(afvisning(me, { roller: [], lager: KIOSK })).toBeNull();
    expect(afvisning(laes, { roller: ['lager-laes'], lager: BRUGER })).toBeNull();
    expect(afvisning(tjekUd, { roller: ['lager-laes'], lager: ANSVARLIG })).toMatch(/lager-skriv/);
    expect(afvisning(tjekUd, { roller: ['lager-skriv'], lager: BRUGER })).toBeNull();
    expect(afvisning(opret, { roller: ['lager-skriv'], lager: BRUGER })).toMatch(/lageransvarlig/);
    expect(afvisning(overblik, { roller: ['lager-laes'], lager: BRUGER })).toMatch(/lageransvarlig/);
    expect(afvisning(overblik, { roller: ['lager-laes'], lager: ANSVARLIG })).toBeNull();
    expect(afvisning(opret, { roller: ['lager-skriv'], lager: ANSVARLIG })).toBeNull();
    expect(afvisning(laes, { roller: ['lager-skriv'], lager: KIOSK })).toMatch(/kiosk/);
    // Ukendte lagerroller (/me svarede ikke): intet skjules; lageret afgør.
    expect(afvisning(opret, { roller: ['lager-skriv'], lager: null })).toBeNull();
  });
});

describe('værktøjslisten følger rollen', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });
  afterEach(() => { delete process.env.LAGER_ENABLE_WRITES; });

  it('værktøjsbruger med lager-skriv: sine egne værktøjer, ingen lager_ansvarlig_* og ingen scenarieskrivning', async () => {
    const t = await navne(await forbind(vi.fn() as unknown as typeof fetch, { roller: ['lager-skriv'], lager: BRUGER }));
    expect(t).toContain('lager_tjek_ud');
    expect(t).toContain('lager_me');
    expect(t.filter((n) => n.startsWith('lager_ansvarlig_'))).toEqual([]);
    // Scenarierne kan læses af alle (/scenarier), men skrives kun af den lageransvarlige (/ansvarlig/scenarier).
    expect(t).toContain('scenario_hent');
    expect(t).not.toContain('scenario_opret');
  });

  it('lageransvarlig med kun lager-laes: læser alt, skriver intet', async () => {
    const t = await navne(await forbind(vi.fn() as unknown as typeof fetch, { roller: ['lager-laes'], lager: ANSVARLIG }));
    expect(t).toContain('lager_ansvarlig_overblik');
    expect(t).toContain('lager_ansvarlig_priser');
    const skrivende = new Set(CAPABILITIES.filter((c) => c.write).map((c) => c.tool));
    expect(t.filter((n) => skrivende.has(n))).toEqual([]);
  });

  it('lageransvarlig med lager-skriv ser alt, også de nye skrivninger', async () => {
    const t = await navne(await forbind(vi.fn() as unknown as typeof fetch, { roller: ['lager-skriv'], lager: ANSVARLIG }));
    expect(t.sort()).toEqual(CAPABILITIES.map((c) => c.tool).sort());
    for (const n of ['lager_ansvarlig_model_opret', 'lager_ansvarlig_enhed_opret', 'lager_ansvarlig_forbrugsvare_opret', 'lager_ansvarlig_forbrugsvare_ret', 'lager_ansvarlig_kasser', 'lager_ansvarlig_fejlregistrer', 'lager_ansvarlig_pris_saet']) expect(t, n).toContain(n);
  });

  it('en kioskkonto ser kun lager_me og søgningen', async () => {
    const t = await navne(await forbind(vi.fn() as unknown as typeof fetch, { roller: ['lager-skriv'], lager: KIOSK }));
    expect(t.sort()).toEqual(['lager_me', 'lager_search_capabilities']);
  });

  it('et skjult værktøj, der alligevel kaldes, afvises uden at spørge lageret', async () => {
    const fetchFn = vi.fn();
    const mcp = await forbind(fetchFn as unknown as typeof fetch, { roller: ['lager-skriv'], lager: BRUGER });
    const r = await mcp.callTool({ name: 'lager_ansvarlig_model_opret', arguments: { navn: 'Borehammer' } });
    expect(r.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const mcp2 = await forbind(fetchFn as unknown as typeof fetch, { roller: ['lager-laes'], lager: ANSVARLIG });
    const r2 = await mcp2.callTool({ name: 'lager_tjek_ud', arguments: { koder: ['T-00001'], projektId: 7 } });
    expect(r2.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('LAGER_ENABLE_WRITES er stadig hovedafbryderen, også med lager-skriv', async () => {
    delete process.env.LAGER_ENABLE_WRITES;
    const fetchFn = vi.fn();
    const mcp = await forbind(fetchFn as unknown as typeof fetch, { roller: ['lager-skriv'], lager: ANSVARLIG });
    const r = await mcp.callTool({ name: 'lager_ansvarlig_model_opret', arguments: { navn: 'Borehammer', kategori: 'Borehammer' } });
    expect(r.isError).toBe(true);
    expect(tekst(r)).toMatch(/LAGER_ENABLE_WRITES/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('søgningen viser kun det, personen må', () => {
    const bruger = searchCapabilities('', 500, null, { roller: ['lager-skriv'], lager: BRUGER }).map((c) => c.tool);
    expect(bruger).toContain('lager_tjek_ud');
    expect(bruger.filter((n) => n.startsWith('lager_ansvarlig_'))).toEqual([]);
    const laeser = searchCapabilities('forbrugsvare', 500, null, { roller: ['lager-laes'], lager: ANSVARLIG }).map((c) => c.tool);
    expect(laeser).toContain('lager_ansvarlig_forbrugsvarer');
    expect(laeser).not.toContain('lager_ansvarlig_forbrugsvare_opret');
  });

  it('createServerMedModuler henter roller og moduler med ét /me pr. person, cachet', async () => {
    const fetchFn = vi.fn(async () => svar(200, { lagre: [{ id: 1, ansvarlig: false, medarbejder: true }], ansvarlig: false, kunKiosk: false, moduler: { booking: true } }));
    const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'worker@example.com', fetchFn: fetchFn as unknown as typeof fetch });
    const moduler = new ModulCache();
    const lagerroller = new LagerrolleCache();
    const server = await createServerMedModuler({ client, moduler, lagerroller, roller: ['lager-skriv'] });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const mcp = new Client({ name: 'test', version: '0' });
    await mcp.connect(b);
    const t = await navne(mcp);
    expect(t).toContain('lager_tjek_ud');
    expect(t).not.toContain('lager_ansvarlig_overblik');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(moduler.senest()).toEqual({ booking: true });
    await createServerMedModuler({ client, moduler, lagerroller, roller: ['lager-skriv'] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('kan /me ikke nås: fail-closed for den lageransvarliges værktøjer; brugerens egne er der', async () => {
    const fetchFn = vi.fn(async () => svar(403, { error: 'Du har ikke adgang til et lager' }));
    const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'ny@example.com', fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 });
    const roller = await new LagerrolleCache().hent(client);
    expect(roller).toEqual(UKENDTE_LAGERROLLER);
    const adgang: Adgang = { roller: ['lager-skriv'], lager: roller };
    expect(afvisning({ navn: 'lager_ansvarlig_model_opret', skriv: true, ansvarlig: true }, adgang)).toMatch(/kunne ikke slås op/);
    expect(afvisning({ navn: 'lager_tjek_ud', skriv: true, ansvarlig: false }, adgang)).toBeNull();
    const t = await navne(await forbind(vi.fn() as unknown as typeof fetch, adgang));
    expect(t).toContain('lager_tjek_ud');
    expect(t.filter((n) => n.startsWith('lager_ansvarlig_'))).toEqual([]);
  });

  it('de sidst kendte roller bruges højst LAGER_ROLLER_MAKS_ALDER_MS, når /me fejler', async () => {
    let ok = true;
    const fetchFn = vi.fn(async () => (ok ? svar(200, { lagre: [{ ansvarlig: true, medarbejder: true }], ansvarlig: true, kunKiosk: false }) : svar(500, { error: 'nede' })));
    const client = new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'ansv@example.com', fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const cache = new LagerrolleCache(60_000, 5 * 60_000);
      expect((await cache.hent(client)).ansvarlig).toBe(true);
      ok = false;
      vi.setSystemTime(Date.now() + 2 * 60_000);
      expect(await cache.hent(client)).toMatchObject({ ansvarlig: true });
      vi.setSystemTime(Date.now() + 4 * 60_000);
      expect(await cache.hent(client)).toEqual(UKENDTE_LAGERROLLER);
      ok = true;
      expect((await cache.hent(client)).ansvarlig).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('den lageransvarliges nye skrivninger', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });
  afterEach(() => { delete process.env.LAGER_ENABLE_WRITES; });
  const ansvarlig: Adgang = { roller: ['lager-skriv'], lager: ANSVARLIG };

  it('kassering kræver bekraeftet: true og en note; bekraeftet sendes ikke til lageret', async () => {
    const fetchFn = vi.fn(async () => svar(200, { enhed: { tag: 'T-00031', status: 'kasseret' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    const uden = await mcp.callTool({ name: 'lager_ansvarlig_kasser', arguments: { tag: 'T-00031', note: 'Motor brændt af' } });
    expect(uden.isError).toBe(true);
    const falsk = await mcp.callTool({ name: 'lager_ansvarlig_kasser', arguments: { tag: 'T-00031', note: 'Motor brændt af', bekraeftet: false } });
    expect(falsk.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const ja = await mcp.callTool({ name: 'lager_ansvarlig_kasser', arguments: { tag: 'T-00031', note: 'Motor brændt af', bekraeftet: true } });
    expect(ja.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/ansvarlig/afgoer']);
    expect(JSON.parse(String(init.body))).toEqual({ handling: 'kasser', tag: 'T-00031', note: 'Motor brændt af' });
    const kasser = (await mcp.listTools()).tools.find((t) => t.name === 'lager_ansvarlig_kasser')!;
    expect(kasser.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    const frigiv = (await mcp.listTools()).tools.find((t) => t.name === 'lager_ansvarlig_frigiv')!;
    expect(frigiv.annotations).toMatchObject({ destructiveHint: false });
  });

  it('fejlregistrering: bekraeftet påkrævet, krediter afvises før noget sendes', async () => {
    const fetchFn = vi.fn(async () => svar(200, { enhed: { tag: 'T-00044' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    const kred = await mcp.callTool({ name: 'lager_ansvarlig_fejlregistrer', arguments: { tag: 'T-00044', begrundelse: 'Dublet', krediter: true, bekraeftet: true } });
    expect(kred.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const ok = await mcp.callTool({ name: 'lager_ansvarlig_fejlregistrer', arguments: { tag: 'T-00044', begrundelse: 'Dublet', perioder: 'flyt', flytTil: 'T-00043', bekraeftet: true } });
    expect(ok.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(url.pathname).toBe('/api/lager/ansvarlig/enheder/T-00044/fejlregistrer');
    expect(JSON.parse(String(init.body))).toEqual({ begrundelse: 'Dublet', perioder: 'flyt', flytTil: 'T-00043' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^mcp-/);
  });

  it('annullering af en lejeperiode er DELETE med begrundelsen i kroppen og en Idempotency-Key', async () => {
    const fetchFn = vi.fn(async () => svar(200, { periode: { id: 5, status: 'annulleret' } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    const r = await mcp.callTool({ name: 'lager_ansvarlig_periode_annuller', arguments: { periodeId: 5, begrundelse: 'Forkert sag', bekraeftet: true } });
    expect(r.isError).toBeFalsy();
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['DELETE', '/api/lager/ansvarlig/perioder/5']);
    expect(JSON.parse(String(init.body))).toEqual({ begrundelse: 'Forkert sag' });
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^mcp-/);
  });

  it('en DELETE uden krop sender stadig ingen krop', async () => {
    const fetchFn = vi.fn(async () => svar(200, { ok: true }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    await mcp.callTool({ name: 'scenario_slet', arguments: { scenarieId: 7, bekraeftet: true } });
    const [, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('ny model, nye enheder og en ny forbrugsvare sendes, som kortet siger', async () => {
    const fetchFn = vi.fn(async () => svar(201, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    expect((await mcp.callTool({ name: 'lager_ansvarlig_model_opret', arguments: { navn: 'Makita DHR243', kategori: 'Borehammer', dagssats: 95, gyldigFra: '2026-11-01' } })).isError).toBeFalsy();
    expect((await mcp.callTool({ name: 'lager_ansvarlig_enhed_opret', arguments: { modelId: 12, antal: 3, leverandoer: 'STARK' } })).isError).toBeFalsy();
    expect((await mcp.callTool({ name: 'lager_ansvarlig_forbrugsvare_opret', arguments: { navn: 'Kabelbindere 200 mm', enhed: 'pose', kostpris: 39 } })).isError).toBeFalsy();
    expect((await mcp.callTool({ name: 'lager_ansvarlig_forbrugsvare_ret', arguments: { forbrugsvareId: 17, aktiv: false } })).isError).toBe(true);
    expect((await mcp.callTool({ name: 'lager_ansvarlig_forbrugsvare_ret', arguments: { forbrugsvareId: 17, aktiv: false, bekraeftet: true } })).isError).toBeFalsy();
    const kald = fetchFn.mock.calls.map((c) => c as unknown as Kald).map(([u, i]) => [i.method, u.pathname, JSON.parse(String(i.body))]);
    expect(kald).toEqual([
      ['POST', '/api/lager/ansvarlig/modeller', { navn: 'Makita DHR243', kategori: 'Borehammer', dagssats: 95, gyldigFra: '2026-11-01' }],
      ['POST', '/api/lager/ansvarlig/enheder', { modelId: 12, antal: 3, leverandoer: 'STARK' }],
      ['POST', '/api/lager/ansvarlig/forbrugsvarer', { navn: 'Kabelbindere 200 mm', enhed: 'pose', kostpris: 39 }],
      ['PUT', '/api/lager/ansvarlig/forbrugsvarer/17', { aktiv: false }],
    ]);
    // Det forældede asbest-felt afvises, så intet skrælles af i stilhed.
    expect((await mcp.callTool({ name: 'lager_ansvarlig_enhed_opret', arguments: { modelId: 12, asbest: true } })).isError).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('priser: historikken med modelId som ?model=, og en ny pris med gyldighed', async () => {
    const fetchFn = vi.fn(async () => svar(200, { versioner: [] }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    await mcp.callTool({ name: 'lager_ansvarlig_priser', arguments: { modelId: 12 } });
    const udenJa = await mcp.callTool({ name: 'lager_ansvarlig_pris_saet', arguments: { modelId: 12, gyldigFra: '2026-11-01', dagssats: 110 } });
    expect(udenJa.isError).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await mcp.callTool({ name: 'lager_ansvarlig_pris_saet', arguments: { modelId: 12, gyldigFra: '2026-11-01', dagssats: 110, bekraeftet: true } });
    const [laes] = fetchFn.mock.calls[0] as unknown as Kald;
    expect(laes.toString()).toBe('https://lager.test/api/lager/ansvarlig/priser?model=12');
    const [url, init] = fetchFn.mock.calls[1] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/ansvarlig/priser']);
    expect(JSON.parse(String(init.body))).toEqual({ modelId: 12, gyldigFra: '2026-11-01', dagssats: 110 });
  });

  it('en IoT-enhed med slags kamera afvises, før noget sendes', async () => {
    const fetchFn = vi.fn(async () => svar(201, { enhed: { id: 1 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    expect((await mcp.callTool({ name: 'lager_ansvarlig_iot_enhed_opret', arguments: { lokationId: 3, haEntityId: 'camera.port', slags: 'kamera' } })).isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await mcp.callTool({ name: 'lager_ansvarlig_iot_enhed_opret', arguments: { lokationId: 3, haEntityId: 'sensor.skur', slags: 'sensor' } })).isError).toBeFalsy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('projekter: flyt og tilføj kræver brugerens ja; et afregnet vindue (409) vises med afregning og dato', async () => {
    const fetchFn = vi.fn(async () => svar(409, { error: 'Dagene fra 2026-10-01 falder i afregning OMM-2026-10, der er bogført', afregning: { id: 7, nummer: 'OMM-2026-10', status: 'bogfoert' }, afregnetTil: '2026-10-31' }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    const krop = { projektId: 2620, tilProjektId: 2659, fra: '2026-10-15', tags: ['T-00012'], begrundelse: 'Gik videre' };
    expect((await mcp.callTool({ name: 'lager_ansvarlig_projekt_flyt', arguments: krop })).isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    const r = await mcp.callTool({ name: 'lager_ansvarlig_projekt_flyt', arguments: { ...krop, bekraeftet: true } });
    expect(r.isError).toBe(true);
    expect(tekst(r)).toContain('der er bogført (HTTP 409)');
    expect(tekst(r)).toContain('"nummer": "OMM-2026-10"');
    expect(tekst(r)).toContain('"afregnetTil": "2026-10-31"');
    const [url, init] = fetchFn.mock.calls[0] as unknown as Kald;
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/ansvarlig/projekter/2620/flyt']);
    expect(JSON.parse(String(init.body))).toEqual({ tilProjektId: 2659, fra: '2026-10-15', tags: ['T-00012'], begrundelse: 'Gik videre' });
    expect((await mcp.callTool({ name: 'lager_ansvarlig_projekt_tilfoej', arguments: { projektId: 2620, tags: ['T-00012'], fra: '2026-10-01', begrundelse: 'x' } })).isError).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('kreditering kan ikke sendes: krediter og krediteretManuelt afvises på perioderne og fejlregistreringen', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch, ansvarlig);
    const kald = [
      ['lager_ansvarlig_periode_annuller', { periodeId: 5, begrundelse: 'x', krediter: true, bekraeftet: true }],
      ['lager_ansvarlig_periode_annuller', { periodeId: 5, begrundelse: 'x', krediteretManuelt: true, bekraeftet: true }],
      ['lager_ansvarlig_periode_ret', { periodeId: 5, begrundelse: 'x', til: '2026-10-01', krediteretManuelt: true, bekraeftet: true }],
      ['lager_ansvarlig_fejlregistrer', { tag: 'T-1', begrundelse: 'x', krediteretManuelt: true, bekraeftet: true }],
    ] as const;
    for (const [name, args] of kald) expect((await mcp.callTool({ name, arguments: args })).isError, name).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
