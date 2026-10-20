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
 * (paths og components.schemas), gemmes; operationernes `x-mcp` følger med. Kør derefter `npm test`: test/openapi.test.ts
 * siger, hvilke værktøjer der peger på noget, der er forsvundet, og hvilke nye
 * operationer der hverken har et værktøj eller en grund til at mangle ét.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fund } from './neutral.js';

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
// Står der en vært, en mailadresse, et forbudt navn eller «hos Fornavn», gemmes intet
// (scripts/neutral.ts): kortet rettes i backenden, ikke her.
const tekst = JSON.stringify(ud, null, 2);
const forbudt = fund(tekst);
if (forbudt.length) {
  console.error(`Kortet nævner ${forbudt.join(', ')}; ret det i backenden, før øjebliksbilledet gemmes.`);
  process.exit(1);
}
const fil = fileURLToPath(new URL('../openapi/lager.json', import.meta.url));
await writeFile(fil, `${tekst}\n`, 'utf8');
console.error(`Skrev ${fil}: ${Object.keys(ud.paths).length} stier, version ${ud.info.version}.`);
