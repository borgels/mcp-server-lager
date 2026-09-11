/**
 * Klient mod bcc's lager-API (/api/lager/*). Identiteten er brugerens UPN i
 * X-MCP-User, verificeret af gatewayen; bcc slår personen op og bruger hendes
 * egne roller, så kostpriser og ansvarlig-ruter følger rollen, ikke serveren.
 */
export interface LagerClientOptions {
  baseUrl?: string;
  apiToken?: string;
  user?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

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

  constructor(options: LagerClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.LAGER_BASE_URL ?? '').replace(/\/+$/, '');
    this.apiToken = options.apiToken ?? process.env.LAGER_API_TOKEN ?? '';
    this.user = options.user ?? process.env.LAGER_DEFAULT_USER ?? '';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.LAGER_TIMEOUT_MS ?? 30_000);
    this.fetchFn = options.fetchFn ?? fetch;
    if (!this.baseUrl) throw new Error('LAGER_BASE_URL mangler');
    if (!this.apiToken) throw new Error('LAGER_API_TOKEN mangler');
    if (!this.user) throw new Error('Ingen bruger: X-MCP-User fra gatewayen eller LAGER_DEFAULT_USER');
  }

  async get<T>(path: string, query: Record<string, string | number | boolean | null | undefined> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/lager${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    return this.send<T>('GET', url);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>('POST', new URL(`${this.baseUrl}/api/lager${path}`), body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>('PUT', new URL(`${this.baseUrl}/api/lager${path}`), body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.send<T>('DELETE', new URL(`${this.baseUrl}/api/lager${path}`));
  }

  private async send<T>(method: string, url: URL, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'X-MCP-User': this.user,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      // Hver skrivning får sin egen nøgle: bcc gør det samme kald to gange til ét resultat.
      headers['Idempotency-Key'] = `mcp-${crypto.randomUUID()}`;
    }
    const res = await this.fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    const text = await res.text();
    let data: unknown = undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
    if (!res.ok) {
      const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
      throw new LagerApiError(res.status, msg);
    }
    return data as T;
  }
}
