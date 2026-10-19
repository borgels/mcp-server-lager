/**
 * Klient mod lager-appens API (/api/lager/*). Identiteten er brugerens UPN i
 * X-MCP-User, verificeret af gatewayen; appen slår personen op og bruger hendes
 * egne roller, så kostpriser og ansvarlig-ruter følger rollen, ikke serveren.
 */
export interface LagerClientOptions {
  baseUrl?: string;
  apiToken?: string;
  user?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Hvor mange gange et kald prøves igen efter 429 eller en forbigående fejl (standard 3). */
  maxRetries?: number;
  /** Længste ventetid før et nyt forsøg; et længere Retry-After gives videre som fejl (standard 20 s). */
  maxVentMs?: number;
  /** Samlet frist for nye forsøg pr. tool-kald, regnet fra kaldets start (standard 25 s). */
  fristMs?: number;
  /** Til test: ventetiden mellem forsøg. */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Hvornår et kald prøves igen. Ikke alle skrive-ruter i appen gemmer svaret pr.
 * Idempotency-Key endnu, så en skrivning (alt andet end GET, også DELETE) prøves
 * kun igen, når den bevisligt ikke er udført:
 *  - 429: rate limit afviser, før ruten kører;
 *  - en forbindelsesfejl, før forespørgslen blev sendt (ECONNREFUSED, DNS).
 * Aldrig ved 502/503/504, timeout eller en fejl efter afsendelse: kaldet kan være
 * udført. Et GET prøves også igen ved 502/503/504 fra en proxy og ved netværksfejl.
 * Et svar med appens egen JSON { error } prøves aldrig igen (bortset fra 429):
 * så er det appen, der har svaret, ikke en proxy.
 */
const PROXY_5XX = new Set([502, 503, 504]);
const IKKE_SENDT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/** Fejlkoden fra undici (fetch failed → cause.code), også når den ligger et lag dybere. */
function fejlkode(e: unknown): string | undefined {
  for (let x = e, i = 0; x && typeof x === 'object' && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

type Query = Record<string, string | number | boolean | null | undefined | readonly (string | number)[]>;

export class LagerApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LagerApiError';
    this.status = status;
  }
}

export class LagerClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  readonly user: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly maxVentMs: number;
  private readonly fristMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  /** Sat af forKald: tool-kaldets nøgle og hvor mange skrivninger der er sendt med den. */
  private noegle?: { base: string; n: number };
  /** Sat af forKald: tidspunktet (ms), hvorefter tool-kaldet ikke prøver igen. */
  private frist?: number;

  constructor(options: LagerClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.LAGER_BASE_URL ?? '').replace(/\/+$/, '');
    this.apiToken = options.apiToken ?? process.env.LAGER_API_TOKEN ?? '';
    this.user = options.user ?? process.env.LAGER_DEFAULT_USER ?? '';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.LAGER_TIMEOUT_MS ?? 30_000);
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxRetries = options.maxRetries ?? Number(process.env.LAGER_RETRY_MAX ?? 3);
    this.maxVentMs = options.maxVentMs ?? Number(process.env.LAGER_RETRY_MAX_VENT_MS ?? 20_000);
    this.fristMs = options.fristMs ?? Number(process.env.LAGER_RETRY_FRIST_MS ?? 25_000);
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    if (!this.baseUrl) throw new Error('LAGER_BASE_URL mangler');
    assertSafeBaseUrl(this.baseUrl);
    if (!this.apiToken) throw new Error('LAGER_API_TOKEN mangler');
    if (!this.user) throw new Error('Ingen bruger: X-MCP-User fra gatewayen eller LAGER_DEFAULT_USER');
  }

  /**
   * Samme klient for ét tool-kald: én samlet frist for nye forsøg, og med `noegle`
   * får skrivningerne tool-kaldets Idempotency-Key (#113): den første `noegle`, de
   * næste `noegle-2`, `noegle-3` … (fx én pr. kode i en scanning). Rækkefølgen er
   * værktøjets egen, så et gentaget kald giver de samme nøgler.
   */
  forKald(noegle?: string): LagerClient {
    const c = Object.create(this) as LagerClient;
    c.noegle = noegle ? { base: noegle, n: 0 } : undefined;
    c.frist = Date.now() + this.fristMs;
    return c;
  }

  /** Ét kald under /api/lager. En krop giver kaldet en Idempotency-Key. */
  async request<T>(method: string, path: string, options: { query?: Query; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/lager${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      // En liste gentager parameteren (fx egenskab=…&egenskab=…).
      if (Array.isArray(v)) for (const x of v) url.searchParams.append(k, String(x));
      else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return this.send<T>(method, url, options.body);
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private naesteNoegle(): string {
    if (!this.noegle) return `mcp-${crypto.randomUUID()}`;
    const n = ++this.noegle.n;
    return n === 1 ? this.noegle.base : `${this.noegle.base}-${n}`;
  }

  private async send<T>(method: string, url: URL, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'X-MCP-User': this.user,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      // Én nøgle pr. skrivning, den samme ved hvert nyt forsøg.
      headers['Idempotency-Key'] = this.naesteNoegle();
    }
    const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
    const laes = method === 'GET';
    const frist = this.frist ?? Date.now() + this.fristMs;
    // Et nyt forsøg kun, hvis der er forsøg og tid tilbage til at vente `ms`.
    const maa = (forsoeg: number, ms: number) => forsoeg < this.maxRetries && ms <= this.maxVentMs && Date.now() + ms <= frist;
    for (let forsoeg = 0; ; forsoeg++) {
      let res: Response;
      try {
        res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        const ikkeSendt = IKKE_SENDT.has(fejlkode(e) ?? '');
        const vent = backoff(forsoeg);
        if (!timeout && (laes || ikkeSendt) && maa(forsoeg, vent)) {
          await this.sleepFn(vent);
          continue;
        }
        throw e;
      }
      const text = await res.text();
      let data: unknown = undefined;
      try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
      const appensFejl = !!data && typeof data === 'object' && 'error' in data;
      if (res.status === 429 || (laes && PROXY_5XX.has(res.status) && !appensFejl)) {
        const ra = retryAfterMs(res.headers.get('retry-after'));
        const vent = ra !== undefined ? medJitter(ra) : backoff(forsoeg);
        if (maa(forsoeg, vent)) {
          await this.sleepFn(vent);
          continue;
        }
      }
      if (!res.ok) {
        const msg = appensFejl ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
        const efter = res.status === 429 ? retryAfterMs(res.headers.get('retry-after')) : undefined;
        throw new LagerApiError(res.status, efter !== undefined ? `${msg} (prøv igen om ${Math.ceil(efter / 1000)} s)` : msg);
      }
      return data as T;
    }
  }
}

/** Retry-After i sekunder eller som HTTP-dato → millisekunder; undefined, når den mangler eller er ugyldig. */
export function retryAfterMs(v: string | null, nu = Date.now()): number | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (/^\d+$/.test(t)) return Number(t) * 1000;
  const dato = Date.parse(t);
  return Number.isNaN(dato) ? undefined : Math.max(0, dato - nu);
}

/** Retry-After plus op til 10 % (mindst 250 ms), så kald, der venter på det samme, ikke vågner samtidig. */
function medJitter(ms: number): number {
  return ms + Math.round(Math.random() * Math.max(250, ms / 10));
}

/** 250 ms, 500 ms, 1 s … højst 5 s, med lidt tilfældighed, så ventende klienter ikke rammer samtidig. */
function backoff(forsoeg: number): number {
  const ms = Math.min(5_000, 250 * 2 ** forsoeg);
  return Math.round(ms / 2 + Math.random() * (ms / 2));
}

/** Værter, der altid må nås over http: loopback til lokale mocks. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** LAGER_INTERNAL_HOSTS: kommaseparerede værtsnavne på et privat (Docker-)netværk, eksakt match, ingen wildcards. */
export function internalHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.LAGER_INTERNAL_HOSTS ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * API-tokenet og brugeridentiteten må kun sendes over https. http:// er tilladt mod
 * loopback (lokale mocks) og mod værter, der står eksplicit i LAGER_INTERNAL_HOSTS,
 * fx backendens containernavn på det interne Docker-netværk.
 */
export function assertSafeBaseUrl(baseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`LAGER_BASE_URL er ikke en gyldig URL: ${baseUrl}`);
  }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && [...LOOPBACK_HOSTS, ...internalHosts(env)].includes(parsed.hostname)) return;
  throw new Error(
    `LAGER_BASE_URL skal bruge https:// (http:// kun mod loopback eller en vært i LAGER_INTERNAL_HOSTS); fik ${parsed.protocol}//${parsed.host}`,
  );
}
