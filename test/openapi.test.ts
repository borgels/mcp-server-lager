// Kataloget mod OpenAPI-øjebliksbilledet (#26): hvert værktøj peger på en
// operation, der findes, og hver operation i kortet har et værktøj eller en
// grund til at mangle ét. Når backenden får en ny rute, og øjebliksbilledet
// opdateres (npm run openapi:opdater), fejler testen her, indtil den er taget stilling til.
import { describe, expect, it } from 'vitest';
import { KATALOG, UDEN_VAERKTOEJ, UDEN_VAERKTOEJ_HER, UDEN_VAERKTOEJ_I_KORTET, type ToolSpec } from '../src/tools/katalog.js';
import { byg } from '../src/tools/bygger.js';
import { alleOperationer, operation, SPEC, splitOp, udenVaerktoejIKortet, type OpenApiDoc, type OpNoegle } from '../src/openapi/spec.js';
import { CAPABILITIES } from '../src/lager/capabilities.js';
import { fund } from '../scripts/neutral.js';

const brugte = new Set<OpNoegle>(KATALOG.flatMap((s) => byg(s).ops));

describe('OpenAPI-øjebliksbilledet', () => {
  it('har kun pladsholderen som server', () => {
    const doc = SPEC as unknown as { servers: { url: string }[] };
    expect(doc.servers.map((s) => s.url)).toEqual(['https://lager.example.com/api/lager']);
  });

  it('nævner ingen vært, mailadresse, forbudt navn eller «hos Fornavn»', () => {
    expect(fund(JSON.stringify(SPEC))).toEqual([]);
  });

  it('forbudslisten fanger værter, mails, personnavne og ordpar, men ikke neutrale eksempler', () => {
    expect(fund('se https://lager.intern.test og a@b.test')).toEqual(['lager.intern.test', 'a@b.test']);
    expect(fund('«hos Fornavn»')).toEqual(['«hos Fornavn»']);
    expect(fund('«hos Kim» (Sag 1001) og https://lager.example.com')).toEqual([]);
  });

  it('x-mcp: { vaerktoej: false, grund } giver ingen værktøj, og grunden er lagerets', () => {
    expect(Object.keys(UDEN_VAERKTOEJ_I_KORTET).length).toBeGreaterThan(0);
    for (const [op, grund] of Object.entries(UDEN_VAERKTOEJ_I_KORTET) as [OpNoegle, string][]) {
      const x = (operation(op) as { 'x-mcp'?: { vaerktoej?: boolean; grund?: string } })['x-mcp'];
      expect(x?.vaerktoej, op).toBe(false);
      expect(grund, op).toBe(x?.grund);
      expect(UDEN_VAERKTOEJ[op], op).toBe(grund);
      expect(brugte.has(op), op).toBe(false);
    }
    // Lånerens link og kanbankortets token og etiketter er aldrig et værktøj.
    expect(UDEN_VAERKTOEJ_I_KORTET['POST /udlaan/{id}/link']).toBeDefined();
    expect(UDEN_VAERKTOEJ_I_KORTET['GET /ansvarlig/kanban/{id}/link']).toBeDefined();
    expect([...brugte].filter((op) => /\/link$|^POST \/(laan|kanban)\b|\/kanban\/etiketter/.test(op))).toEqual([]);
  });

  it('UDEN_VAERKTOEJ_HER gentager ikke lagerets egne markeringer', () => {
    expect(Object.keys(UDEN_VAERKTOEJ_HER).filter((op) => op in UDEN_VAERKTOEJ_I_KORTET)).toEqual([]);
  });

  it('x-mcp på operationen eller stien, som boolean eller «false», giver ingen værktøj; en markering uden grund får en', () => {
    const doc = {
      info: { version: 't' },
      paths: {
        '/hemmelig': { post: { 'x-mcp': { vaerktoej: false, grund: 'Et token.' } } },
        '/tekst': { post: { 'x-mcp': { vaerktoej: ' False ', grund: 'Som tekst.' } } },
        '/sti': { 'x-mcp': { vaerktoej: false, grund: 'Hele stien.' }, get: {}, delete: {} },
        '/tom': { get: { 'x-mcp': { vaerktoej: false } } },
        '/aaben': { get: { 'x-mcp': { vaerktoej: true } }, post: { 'x-mcp': { vaerktoej: 'true' } } },
      },
    } as unknown as OpenApiDoc;
    expect(udenVaerktoejIKortet(doc)).toEqual({
      'POST /hemmelig': 'Et token.',
      'POST /tekst': 'Som tekst.',
      'GET /sti': 'Hele stien.',
      'DELETE /sti': 'Hele stien.',
      'GET /tom': expect.stringContaining('x-mcp'),
    });
  });

  it('byg() afviser en markeret operation, også bag medId og ops', () => {
    const doc = {
      info: { version: 't' },
      paths: {
        '/liste': { get: {} },
        '/liste/{id}': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] } },
        '/liste/{id}/token': { 'x-mcp': { vaerktoej: 'false', grund: 'Et token.' }, post: {} },
        '/aaben': { post: {} },
        '/hemmelig': { post: { 'x-mcp': { vaerktoej: false, grund: 'Hemmelig.' } } },
      },
    } as unknown as OpenApiDoc;
    const spec: ToolSpec = { navn: 'x', titel: 'x', beskrivelse: 'x', kort: 'x', eksempler: [], op: 'GET /liste' };
    expect(() => byg(spec, doc)).not.toThrow();
    expect(() => byg({ ...spec, op: 'POST /hemmelig' }, doc)).toThrow(/x-mcp.*Hemmelig/);
    expect(() => byg({ ...spec, medId: { felt: 'id', op: 'POST /liste/{id}/token' } }, doc)).toThrow(/x-mcp.*Et token/);
    expect(() => byg({ ...spec, op: 'POST /aaben', ops: ['POST /aaben', 'POST /hemmelig'] }, doc)).toThrow(/x-mcp/);
    // Og mod det rigtige kort: lånerens link og kanbankortets link kan ikke smugles ind.
    expect(() => byg({ ...spec, op: 'GET /udlaan', medId: { felt: 'udlaanId', op: 'POST /udlaan/{id}/link' } })).toThrow(/x-mcp/);
    expect(() => byg({ ...spec, op: 'GET /ansvarlig/kanban', ops: ['GET /ansvarlig/kanban/{id}/link'] })).toThrow(/x-mcp/);
  });

  it('kameraernes billede og strømme er ikke værktøjer, listen er', () => {
    expect([...brugte].filter((op) => op.includes('/iot/kameraer/'))).toEqual([]);
    expect(brugte.has('GET /iot/kameraer')).toBe(true);
  });

  it('frigivelsen i et procesforløb er destruktiv og beder om brugerens bekræftelse', () => {
    const s = KATALOG.find((k) => k.navn === 'lager_procesforloeb_udfoer')!;
    expect(byg(s).sletter).toBe(true);
    expect(s.beskrivelse).toMatch(/bekræft altid med brugeren/i);
    expect(s.beskrivelse).toMatch(/asbest/);
    for (const navn of ['lager_ansvarlig_placeringsregel_ret', 'lager_ansvarlig_procesflow_ret']) {
      const r = KATALOG.find((k) => k.navn === navn)!;
      expect(byg(r).sletter, navn).toBe(true);
      expect(r.beskrivelse, navn).toMatch(/udtrykkelige ja/);
    }
  });

  it('Skabelonbarn kender Geometri-felterne gennem allOf, uden at tillade ukendte nøgler', () => {
    const opret = byg(KATALOG.find((s) => s.navn === 'lager_ansvarlig_skabelon_opret')!);
    const boern = opret.shape.boern ?? opret.shape.children;
    expect(boern, 'skabelonens børn').toBeDefined();
    expect(boern!.safeParse([{ type: 'hylde', z_mm: 400 }]).success).toBe(true);
    const parsed = boern!.parse([{ type: 'hylde', z_mm: 400, ukendt: 1 }]) as Record<string, unknown>[];
    expect(parsed[0]).toEqual({ type: 'hylde', z_mm: 400 });
  });

  it('hver værktøjs operation findes i kortet', () => {
    const mangler = [...brugte].filter((op) => !operation(op));
    expect(mangler).toEqual([]);
  });

  it('hver operation i kortet har et værktøj eller en grund til at mangle ét', () => {
    const uden = alleOperationer().filter((op) => !brugte.has(op) && !UDEN_VAERKTOEJ[op]);
    expect(uden, 'lav et værktøj i src/tools/katalog.ts eller skriv en grund i UDEN_VAERKTOEJ').toEqual([]);
  });

  it('UDEN_VAERKTOEJ nævner kun operationer, der findes og ikke har et værktøj', () => {
    for (const op of Object.keys(UDEN_VAERKTOEJ) as OpNoegle[]) {
      expect(operation(op), op).toBeDefined();
      expect(brugte.has(op), op).toBe(false);
    }
  });

  it('læsende værktøjer bruger kun GET (eller en POST, der kun læser), skrivende aldrig', () => {
    for (const s of KATALOG) {
      const b = byg(s);
      const metoder = new Set(b.ops.map((op) => splitOp(op).metode));
      if (b.skriv) expect(metoder.has('get'), s.navn).toBe(false);
      else expect([...metoder], s.navn).toEqual([s.laesende ? 'post' : 'get']);
    }
    // Kun placeringsmotorens forslag er en POST, der intet skriver.
    expect(KATALOG.filter((s) => s.laesende).map((s) => s.navn)).toEqual(['scenario_foreslaa_placering']);
  });

  it('afregningens godkend, bogfør og afvis er aldrig et værktøj', () => {
    expect([...brugte].filter((op) => /afregninger\/\{id\}\/(godkend|til-economic|afvis|beregn)/.test(op))).toEqual([]);
    expect(alleOperationer().filter((op) => /\/(godkend|til-economic)$/.test(op))).toEqual([]);
  });

  it('navnene er unikke og står i kortet over værktøjer', () => {
    const navne = KATALOG.map((s) => s.navn);
    expect(new Set(navne).size).toBe(navne.length);
    expect(CAPABILITIES.map((c) => c.tool).sort()).toEqual(['lager_search_capabilities', ...navne].sort());
  });

  it('værktøjets navn er operationens operationId, når kortet har én', () => {
    const forkerte = KATALOG.filter((s) => {
      const id = (operation(s.op) as { operationId?: string } | undefined)?.operationId;
      return id !== undefined && id !== s.navn;
    }).map((s) => s.navn);
    expect(forkerte).toEqual([]);
  });

  it('operationId er unikke, og hvert lager_*-operationId er værktøjet med det navn, på den operation', () => {
    const ider = alleOperationer().flatMap((op) => {
      const id = (operation(op) as { operationId?: string }).operationId;
      return id ? [[op, id] as const] : [];
    });
    expect(ider.length).toBeGreaterThan(0);
    const navne = ider.map(([, id]) => id);
    expect(navne.filter((id, i) => navne.indexOf(id) !== i), 'dublerede operationId').toEqual([]);
    const forkerte = ider
      .filter(([, id]) => id.startsWith('lager_'))
      .filter(([op, id]) => {
        const spec = KATALOG.find((s) => s.navn === id);
        // Et værktøj med navnet skal bruge netop operationen; uden værktøj skal operationen have en grund.
        return spec ? !byg(spec).ops.includes(op) : UDEN_VAERKTOEJ[op] === undefined;
      })
      .map(([op, id]) => `${op} → ${id}`);
    expect(forkerte, 'et lager_*-operationId skal være navnet på værktøjet, der bruger operationen (eller stå i UDEN_VAERKTOEJ)').toEqual([]);
  });

  it('skemaerne kommer fra kortet: påkrævet, typer og flag', () => {
    const book = byg(KATALOG.find((s) => s.navn === 'lager_book')!);
    expect(Object.keys(book.shape).sort()).toEqual(['antal', 'fra', 'kategori', 'lagerId', 'model', 'note', 'projektId', 'tag', 'til'].sort());
    expect(book.shape.projektId!.safeParse(undefined).success).toBe(false);
    expect(book.shape.note!.safeParse(undefined).success).toBe(true);
    const modeller = byg(KATALOG.find((s) => s.navn === 'lager_ansvarlig_modeller')!);
    expect(modeller.shape.inklInaktive!.safeParse(true).success).toBe(true);
    expect(modeller.moduler).toEqual([]);
    expect(byg(KATALOG.find((s) => s.navn === 'lager_tilgaengelighed')!).moduler).toEqual(['booking']);
    const tjekUd = byg(KATALOG.find((s) => s.navn === 'lager_tjek_ud')!);
    expect(tjekUd.shape.fotoId).toBeUndefined();
  });
});
