/**
 * Det offentlige øjebliksbillede må ikke røbe, hvem der kører lageret: ingen
 * værter, mailadresser, firma- eller personnavne. Bruges af opdater-openapi
 * (nægter at skrive) og test/openapi.test.ts.
 *
 * Forbudte ord står som SHA-256 (de første 16 hex-tegn) af ordet med små
 * bogstaver, så listen selv ikke nævner dem. Hvert ord og hvert ordpar i
 * teksten slås op. Tilføj et ord med:
 *   printf '%s' 'ord' | shasum -a 256 | cut -c1-16
 */
import { createHash } from 'node:crypto';

const FORBUDTE = new Set([
  '4f996e14d7f39fdf',
  '00582d5245a6ec07',
  '2af13b4237e2edd6',
  '5754048aa83c3b92',
  '4cb0f36b88f50f35',
  '34f9d6956520c88d',
]);

/** Neutrale eksempelnavne, der gerne må stå (fx «Kim (Sag 1001)»). */
const NEUTRALE_NAVNE = new Set(['Kim']);

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Installationens egne eksempler gjort neutrale: «XYZ's A-12-3» → «A-12-3», «hos Fornavn» → «hos en kollega». */
export function goerNeutral(tekst: string): string {
  return tekst
    .replace(/\b[A-ZÆØÅ]{2,}'s (?=A-12-3)/g, '')
    .replace(/«hos ([A-ZÆØÅ][a-zæøå]+)»/g, (hel, navn: string) => (NEUTRALE_NAVNE.has(navn) ? hel : '«hos en kollega»'));
}

/** Det, der ikke må stå i et offentligt kort; tom, når teksten er ren. */
export function fund(tekst: string): string[] {
  const ud: string[] = [];
  for (const m of tekst.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!/(^|\.)example\.(com|org|net)$/i.test(m[1]!)) ud.push(m[1]!);
  for (const m of tekst.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) if (!/@example\.(com|org|net)$/i.test(m[0])) ud.push(m[0]);
  for (const m of tekst.matchAll(/«hos ([A-ZÆØÅ][a-zæøå]+)»/g)) if (!NEUTRALE_NAVNE.has(m[1]!)) ud.push(m[0]);
  const ord = tekst.toLowerCase().split(/[^a-z0-9æøå.]+/).map((o) => o.replace(/^\.+|\.+$/g, '')).filter(Boolean);
  ord.forEach((o, i) => {
    if (FORBUDTE.has(hash(o))) ud.push(o);
    const par = i + 1 < ord.length ? `${o} ${ord[i + 1]}` : '';
    if (par && FORBUDTE.has(hash(par))) ud.push(par);
  });
  return [...new Set(ud)];
}
