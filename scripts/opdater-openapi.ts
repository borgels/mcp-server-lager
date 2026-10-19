/**
 * Opdatér det fastlåste øjebliksbillede af lager-API'ets OpenAPI (openapi/lager.json),
 * som værktøjernes skemaer bygges af.
 *
 *   npm run openapi:opdater                      # fra $LAGER_BASE_URL/api/lager/openapi.json
 *   npm run openapi:opdater -- https://host       # fra en kørende backend
 *   npm run openapi:opdater -- ./openapi.json     # fra en fil
 *
 * Kortet er offentligt (det røber kun formen), men øjebliksbilledet skal kunne stå i
 * et offentligt repo: servers sættes til en pladsholder, og kun det, serveren bruger
 * (paths og components.schemas), gemmes. Kør derefter `npm test`: test/openapi.test.ts
 * siger, hvilke værktøjer der peger på noget, der er forsvundet, og hvilke nye
 * operationer der hverken har et værktøj eller en grund til at mangle ét.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const kilde = process.argv[2] ?? process.env.LAGER_BASE_URL;
if (!kilde) {
  console.error('Angiv en backend-URL eller en fil, eller sæt LAGER_BASE_URL.');
  process.exit(1);
}

async function hent(k: string): Promise<unknown> {
  if (/^https?:\/\//.test(k)) {
    const url = k.endsWith('.json') ? k : `${k.replace(/\/+$/, '')}/api/lager/openapi.json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(k, 'utf8'));
}

type Doc = { openapi: string; info?: { version?: string }; paths: Record<string, unknown>; components?: { schemas?: Record<string, unknown> } };

const doc = (await hent(kilde)) as Doc;
if (!doc?.paths) throw new Error('Det ligner ikke et OpenAPI-dokument (ingen paths).');
const ud = {
  openapi: doc.openapi,
  info: { title: 'Lager API (øjebliksbillede)', version: doc.info?.version ?? 'ukendt' },
  servers: [{ url: 'https://lager.example.com/api/lager' }],
  paths: Object.fromEntries(Object.entries(doc.paths).sort(([a], [b]) => a.localeCompare(b))),
  components: { schemas: doc.components?.schemas ?? {} },
};
// Teksterne i kortet kan nævne installationens eget eksempel («XYZ's A-12-3») eller en person
// («hos Fornavn»); her står kun formatet og en neutral person.
const tekst = JSON.stringify(ud, null, 2)
  .replace(/\b[A-ZÆØÅ]{2,}'s (?=A-12-3)/g, '')
  .replace(/«hos [A-ZÆØÅ][a-zæøå]+»/g, '«hos en kollega»');
// Kortet må ikke røbe en vært eller en mailadresse: kun pladsholderen og example.*.
const vaerter = [...tekst.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!).filter((h) => !/(^|\.)example\.(com|org|net)$/i.test(h));
const mails = [...tekst.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0]).filter((m) => !/@example\.(com|org|net)$/i.test(m));
if (vaerter.length || mails.length) {
  console.error(`Kortet nævner ${[...new Set([...vaerter, ...mails])].join(', ')}; ret det i backenden, før øjebliksbilledet gemmes.`);
  process.exit(1);
}
const fil = fileURLToPath(new URL('../openapi/lager.json', import.meta.url));
await writeFile(fil, `${tekst}\n`, 'utf8');
console.error(`Skrev ${fil}: ${Object.keys(ud.paths).length} stier, version ${ud.info.version}.`);
