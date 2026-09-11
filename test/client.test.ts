import { describe, expect, it, vi } from 'vitest';
import { LagerApiError, LagerClient } from '../src/lager/client.js';

const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('LagerClient', () => {
  it('sender internt token, brugeren og en idempotensnøgle på skrivninger', async () => {
    const fetchFn = vi.fn(async () => svar(201, { ok: true }));
    const c = new LagerClient({ baseUrl: 'https://bcc.test/', apiToken: 'tok', user: 'jens@onedanmark.dk', fetchFn: fetchFn as unknown as typeof fetch });
    await c.post('/flyt', { koder: ['OMM-00001'], projektId: 7 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://bcc.test/api/lager/flyt');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer tok');
    expect(h['X-MCP-User']).toBe('jens@onedanmark.dk');
    expect(h['Idempotency-Key']).toMatch(/^mcp-/);
    expect(init.method).toBe('POST');
  });
  it('lægger forespørgselsparametre på og springer tomme over', async () => {
    const fetchFn = vi.fn(async () => svar(200, { enheder: [] }));
    const c = new LagerClient({ baseUrl: 'https://bcc.test', apiToken: 'tok', user: 'u', fetchFn: fetchFn as unknown as typeof fetch });
    await c.get('/ansvarlig/enheder', { lager: 3, status: undefined, soeg: '' });
    const [url] = fetchFn.mock.calls[0] as unknown as [URL];
    expect(url.toString()).toBe('https://bcc.test/api/lager/ansvarlig/enheder?lager=3');
  });
  it('gør bcc\'s { error } til en fejl med status', async () => {
    const fetchFn = vi.fn(async () => svar(403, { error: 'Det kræver rollen lageransvarlig' }));
    const c = new LagerClient({ baseUrl: 'https://bcc.test', apiToken: 'tok', user: 'u', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(c.get('/ansvarlig/overblik')).rejects.toMatchObject({ status: 403, message: 'Det kræver rollen lageransvarlig' } satisfies Partial<LagerApiError>);
  });
  it('afviser at starte uden bruger', () => {
    expect(() => new LagerClient({ baseUrl: 'https://bcc.test', apiToken: 'tok', user: '' })).toThrow(/bruger/i);
  });
});
