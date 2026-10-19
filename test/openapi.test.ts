// Kataloget mod OpenAPI-øjebliksbilledet (#26): hvert værktøj peger på en
// operation, der findes, og hver operation i kortet har et værktøj eller en
// grund til at mangle ét. Når backenden får en ny rute, og øjebliksbilledet
// opdateres (npm run openapi:opdater), fejler testen her, indtil den er taget stilling til.
import { describe, expect, it } from 'vitest';
import { KATALOG, UDEN_VAERKTOEJ } from '../src/tools/katalog.js';
import { byg } from '../src/tools/bygger.js';
import { alleOperationer, operation, SPEC, splitOp, type OpNoegle } from '../src/openapi/spec.js';
import { CAPABILITIES } from '../src/lager/capabilities.js';
import { fund, goerNeutral } from '../scripts/neutral.js';

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
    expect(goerNeutral('zone-reol-hylde = ABC\'s A-12-3, «hos Fornavn», «hos Kim»')).toBe('zone-reol-hylde = A-12-3, «hos en kollega», «hos Kim»');
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

  it('læsende værktøjer bruger kun GET, skrivende aldrig', () => {
    for (const s of KATALOG) {
      const b = byg(s);
      const metoder = new Set(b.ops.map((op) => splitOp(op).metode));
      if (b.skriv) expect(metoder.has('get'), s.navn).toBe(false);
      else expect([...metoder], s.navn).toEqual(['get']);
    }
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
