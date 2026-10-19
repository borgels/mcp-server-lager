import { createHmac, randomBytes } from 'node:crypto';

/**
 * Én Idempotency-Key pr. tool-kald (#113): samme kald, også når klienten prøver
 * igen efter 429 eller en forbigående 5xx, giver samme nøgle, så appen laver ét
 * resultat og ingen dublet.
 *
 * Nøglen afledes af brugeren, sessionen, JSON-RPC-id'et, værktøjet og argumenterne.
 * Sessionen er transportens session-id, eller en tilfældig værdi pr. server-instans:
 * JSON-RPC-id'er starter forfra i hver session, og uden den ville samme kald i to
 * samtaler (fx «aflever T-00012» som kald nr. 3) blive slået sammen til ét.
 *
 * Sender klienten sin egen nøgle i `_meta.idempotencyKey`, bruges den i stedet for
 * session og id, så en agent, der gentager hele tool-kaldet, også får ét resultat.
 * Appens nøgler er (endnu) globale og permanente: samme klientnøgle med samme input
 * senere giver stille det gamle resultat.
 *
 * Nøglen er en HMAC med serverens hemmelighed (MCP_IDEMPOTENS_HEMMELIGHED), så en,
 * der kalder API'et direkte, ikke kan beregne en brugers nøgle på forhånd og sende
 * den først. HTTP-transporten kræver hemmeligheden; uden den (stdio) bruges en
 * tilfældig pr. proces, og klientnøgler gælder så kun, mens processen kører.
 */
export type NoegleGrundlag = {
  hemmelighed: string;
  user: string;
  tool: string;
  input: unknown;
  requestId?: string | number;
  session: string;
  klientNoegle?: string;
};

/** JSON med sorterede nøgler, så { a, b } og { b, a } giver samme hash. */
export function kanonisk(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(kanonisk).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${kanonisk(o[k])}`)
    .join(',')}}`;
}

export function toolNoegle(g: NoegleGrundlag): string {
  const dele = g.klientNoegle
    ? ['klient', g.user, g.tool, g.klientNoegle, kanonisk(g.input)]
    : ['kald', g.user, g.session, String(g.requestId ?? ''), g.tool, kanonisk(g.input)];
  return `mcp-${createHmac('sha256', g.hemmelighed).update(dele.join('\u0000'), 'utf8').digest('hex').slice(0, 40)}`;
}

/** Mindste længde på MCP_IDEMPOTENS_HEMMELIGHED. */
export const HEMMELIGHED_MIN = 32;
const PROCESSENS = randomBytes(32).toString('hex');

/** Serverens hemmelighed: MCP_IDEMPOTENS_HEMMELIGHED, ellers en tilfældig pr. proces. */
export function idempotensHemmelighed(env: NodeJS.ProcessEnv = process.env): string {
  return env.MCP_IDEMPOTENS_HEMMELIGHED || PROCESSENS;
}

/** Klientens egen nøgle fra `_meta`, hvis den er en rimelig streng. */
export function klientNoegleFra(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const v = (meta as Record<string, unknown>).idempotencyKey;
  return typeof v === 'string' && v.length >= 8 && v.length <= 200 ? v : undefined;
}
