// Lokationstræet, evner og IoT (#28) og resources for lokation og klima (#27) gennem en rigtig MCP-klient.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { LagerClient } from '../src/lager/client.js';
import { KATALOG } from '../src/tools/katalog.js';
import { byg } from '../src/tools/bygger.js';

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
const kaldet = (f: ReturnType<typeof vi.fn>, n = 0) => f.mock.calls[n] as unknown as Kald;

describe('lokationstræet', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('læser træet, én lokation, en kode, hvor er og belægning', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    for (const [name, args] of [
      ['lager_lokationer', { lagerId: 1, rod: 'B', dybde: 2, evne: 'opladning' }],
      ['lager_lokation', { lokationId: 12, rekursivt: true }],
      ['lager_lokation_kode', { kode: 'B-03' }],
      ['lager_hvor_er', { q: 'borehammer' }],
      ['lager_belaegning', { rod: '12' }],
      ['lager_lokation_evner', { lokationId: 12, modelId: 4 }],
    ] as const) {
      const r = await mcp.callTool({ name, arguments: args });
      expect(r.isError, name).toBeFalsy();
    }
    expect(fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].toString())).toEqual([
      'https://lager.test/api/lager/lokationer?lager=1&rod=B&dybde=2&evne=opladning',
      'https://lager.test/api/lager/lokationer/12?rekursivt=1',
      'https://lager.test/api/lager/lokationer/kode/B-03',
      'https://lager.test/api/lager/lokationer/soeg?q=borehammer',
      'https://lager.test/api/lager/lokationer/belaegning?rod=12',
      'https://lager.test/api/lager/lokationer/12/evner?model=4',
    ]);
  });

  it('opret sender felterne fra allOf, men ikke planId; frie objekter beholder nøglerne', async () => {
    const fetchFn = vi.fn(async () => svar(201, { lokation: { id: 40 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    const felter = Object.keys(tools.find((t) => t.name === 'lager_ansvarlig_lokation_opret')!.inputSchema.properties!);
    expect(felter).toEqual(expect.arrayContaining(['type', 'kode', 'navn', 'geometri', 'egenskaber', 'parentId', 'lagerId']));
    expect(felter).not.toContain('planId');
    const r = await mcp.callTool({ name: 'lager_ansvarlig_lokation_opret', arguments: {
      type: 'reol', kode: 'R-12', parentId: 3, geometri: { bredde_mm: 1200, montering: 'mod_vaeg' }, egenskaber: { farve: 'blaa' },
    } });
    expect(r.isError).toBeFalsy();
    const [url, init] = kaldet(fetchFn);
    expect([init.method, url.pathname]).toEqual(['POST', '/api/lager/ansvarlig/lokationer']);
    expect(JSON.parse(String(init.body))).toEqual({ type: 'reol', kode: 'R-12', parentId: 3, geometri: { bredde_mm: 1200, montering: 'mod_vaeg' }, egenskaber: { farve: 'blaa' } });
    // type kan udelades med skabelon (id eller nøgle); børnene beholder Geometri-felterne.
    fetchFn.mockClear();
    const fra = await mcp.callTool({ name: 'lager_ansvarlig_lokation_opret', arguments: {
      skabelon: 'reol-5', parentId: 3, boern: [{ type: 'hylde', z_mm: 400, boern: [{ type: 'bin', celle_x: 1 }] }],
    } });
    expect(fra.isError).toBeFalsy();
    expect(JSON.parse(String(kaldet(fetchFn)[1].body))).toEqual({ skabelon: 'reol-5', parentId: 3, boern: [{ type: 'hylde', z_mm: 400, boern: [{ type: 'bin', celle_x: 1 }] }] });
    const medId = await mcp.callTool({ name: 'lager_ansvarlig_lokation_opret', arguments: { skabelon: 7 } });
    expect(medId.isError).toBeFalsy();
    const forkert = await mcp.callTool({ name: 'lager_ansvarlig_lokation_opret', arguments: { type: 'reolen' } });
    expect(forkert.isError).toBe(true);
  });

  it('flyt og nedlæg: stien har lokationen, nedlæg er destruktiv', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_ansvarlig_lokation_flyt', arguments: { lokationId: 12, parentId: 7, version: 3 } });
    await mcp.callTool({ name: 'lager_ansvarlig_lokation_nedlaeg', arguments: { lokationId: 9, flytIndholdTil: 12 } });
    await mcp.callTool({ name: 'lager_ansvarlig_lokation_evne_saet', arguments: { lokationId: 12, noegle: 'opladning', parametre: { system: 'X' } } });
    const kald = fetchFn.mock.calls.map((c) => [(c as unknown as Kald)[1].method, (c as unknown as Kald)[0].pathname, JSON.parse(String((c as unknown as Kald)[1].body))]);
    expect(kald).toEqual([
      ['POST', '/api/lager/ansvarlig/lokationer/12/flyt', { parentId: 7, version: 3 }],
      ['POST', '/api/lager/ansvarlig/lokationer/9/nedlaeg', { flytIndholdTil: 12 }],
      ['PUT', '/api/lager/ansvarlig/lokationer/12/evner/opladning', { parametre: { system: 'X' } }],
    ]);
    const { tools } = await mcp.listTools();
    const hint = (n: string) => tools.find((t) => t.name === n)!.annotations?.destructiveHint;
    expect(hint('lager_ansvarlig_lokation_nedlaeg')).toBe(true);
    expect(hint('lager_ansvarlig_lokation_evne_fjern')).toBe(true);
    expect(hint('lager_ansvarlig_lokation_flyt')).toBe(false);
  });
});

describe('IoT', () => {
  beforeEach(() => { process.env.LAGER_ENABLE_WRITES = 'true'; });

  it('enheder, målinger og dugpunkt', async () => {
    const fetchFn = vi.fn(async () => svar(200, {}));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.callTool({ name: 'lager_iot_enheder', arguments: { lokationId: 5, nedlagte: true } });
    await mcp.callTool({ name: 'lager_iot_enhed', arguments: { enhedId: 4 } });
    await mcp.callTool({ name: 'lager_iot_lokation_maalinger', arguments: { lokationId: 5, oploesning: 'dag', fra: '2026-10-12T00:00:00Z' } });
    await mcp.callTool({ name: 'lager_iot_enhed_maalinger', arguments: { enhedId: 4, metrik: 'temperatur' } });
    await mcp.callTool({ name: 'lager_iot_lokation_dugpunkt', arguments: { lokationId: 5 } });
    expect(fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].toString())).toEqual([
      'https://lager.test/api/lager/iot/enheder?lokation=5&nedlagte=1',
      'https://lager.test/api/lager/iot/enheder/4',
      'https://lager.test/api/lager/iot/lokationer/5/maalinger?oploesning=dag&fra=2026-10-12T00%3A00%3A00Z',
      'https://lager.test/api/lager/iot/enheder/4/maalinger?metrik=temperatur',
      'https://lager.test/api/lager/iot/lokationer/5/dugpunkt',
    ]);
  });

  it('tænd/sluk er en skrivning uden destructiveHint, kun taend eller sluk, og kræver modulet iot', async () => {
    const fetchFn = vi.fn(async () => svar(200, { ok: true }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    const { tools } = await mcp.listTools();
    expect(tools.find((t) => t.name === 'lager_ansvarlig_iot_skift')!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byg(KATALOG.find((s) => s.navn === 'lager_ansvarlig_iot_skift')!).moduler).toEqual(['iot']);
    const forkert = await mcp.callTool({ name: 'lager_ansvarlig_iot_skift', arguments: { enhedId: 4, handling: 'blink' } });
    expect(forkert.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    await mcp.callTool({ name: 'lager_ansvarlig_iot_skift', arguments: { enhedId: 4, handling: 'taend' } });
    const [url, init] = kaldet(fetchFn);
    expect([init.method, url.pathname, JSON.parse(String(init.body))]).toEqual(['POST', '/api/lager/iot/enheder/4/skift', { handling: 'taend' }]);
  });
});

describe('resources for lokation og klima', () => {
  it('lager://lokation/{id} og lager://rum/{id}/klima', async () => {
    const fetchFn = vi.fn(async () => svar(200, { inde: { temperatur: 8, fugt: 80, dugpunkt: 4.7 } }));
    const mcp = await forbind(fetchFn as unknown as typeof fetch);
    await mcp.readResource({ uri: 'lager://lokation/12' });
    const r = await mcp.readResource({ uri: 'lager://rum/5/klima' });
    expect(JSON.parse((r.contents[0] as { text: string }).text)).toMatchObject({ inde: { dugpunkt: 4.7 } });
    expect(fetchFn.mock.calls.map((c) => (c as unknown as Kald)[0].pathname)).toEqual(['/api/lager/lokationer/12', '/api/lager/iot/lokationer/5/klima']);
    await expect(mcp.readResource({ uri: 'lager://lokation/..' })).rejects.toThrow();
  });
});
