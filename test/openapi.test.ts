// Kataloget mod OpenAPI-øjebliksbilledet (#26): hvert værktøj peger på en
// operation, der findes, og hver operation i kortet har et værktøj eller en
// grund til at mangle ét. Når backenden får en ny rute, og øjebliksbilledet
// opdateres (npm run openapi:opdater), fejler testen her, indtil den er taget stilling til.
import { describe, expect, it } from 'vitest';
import { KATALOG, UDEN_VAERKTOEJ } from '../src/tools/katalog.js';
import { byg } from '../src/tools/bygger.js';
import { alleOperationer, operation, SPEC, splitOp, type OpNoegle } from '../src/openapi/spec.js';
import { CAPABILITIES } from '../src/lager/capabilities.js';

const brugte = new Set<OpNoegle>(KATALOG.flatMap((s) => byg(s).ops));

describe('OpenAPI-øjebliksbilledet', () => {
  it('har kun pladsholderen som server', () => {
    const doc = SPEC as unknown as { servers: { url: string }[] };
    expect(doc.servers.map((s) => s.url)).toEqual(['https://lager.example.com/api/lager']);
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
