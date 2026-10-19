import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { assertSafeBaseUrl, LagerClient } from '../src/lager/client.js';
import { createServer } from '../src/server.js';
import { isBackendReachable } from '../src/transports/http-helpers.js';
import { assertHttpStartupConfig, assertLagerBaseUrl } from '../src/transports/startup.js';

describe('LAGER_BASE_URL', () => {
  const opts = { apiToken: 'tok', user: 'u' };
  it('requires https unless loopback', () => {
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://lager.example.com' })).toThrow(/https/);
    expect(() => new LagerClient({ ...opts, baseUrl: 'ftp://lager.example.com' })).toThrow(/https/);
    expect(() => new LagerClient({ ...opts, baseUrl: 'https://lager.example.com' })).not.toThrow();
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://localhost:8080' })).not.toThrow();
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://127.0.0.1:8080' })).not.toThrow();
  });

  it('allows http only to hosts listed exactly in LAGER_INTERNAL_HOSTS', () => {
    const env = { LAGER_INTERNAL_HOSTS: ' lager-backend , Other-Host ' };
    expect(() => assertSafeBaseUrl('http://lager-backend:3000', env)).not.toThrow();
    expect(() => assertSafeBaseUrl('http://other-host', env)).not.toThrow();
    expect(() => assertSafeBaseUrl('http://lager-backend:3000', {})).toThrow(/LAGER_INTERNAL_HOSTS/);
    // Eksakt match: ingen suffikser, præfikser eller wildcards.
    expect(() => assertSafeBaseUrl('http://lager-backend.evil.com', env)).toThrow();
    expect(() => assertSafeBaseUrl('http://x.lager-backend', env)).toThrow();
    expect(() => assertSafeBaseUrl('http://anything', { LAGER_INTERNAL_HOSTS: '*' })).toThrow();
    expect(() => assertSafeBaseUrl('http://lager-backend@evil.com', env)).toThrow();
    // Listen gør ikke andre skemaer lovlige.
    expect(() => assertSafeBaseUrl('ftp://lager-backend', env)).toThrow();
  });

  it('is checked once at startup', () => {
    expect(() => assertLagerBaseUrl({})).toThrow(/LAGER_BASE_URL mangler/);
    expect(() => assertLagerBaseUrl({ LAGER_BASE_URL: 'http://lager-backend:3000' })).toThrow(/https/);
    expect(assertLagerBaseUrl({ LAGER_BASE_URL: 'http://lager-backend:3000/', LAGER_INTERNAL_HOSTS: 'lager-backend' })).toBe('http://lager-backend:3000');
    expect(() => assertLagerBaseUrl({ LAGER_BASE_URL: 'not a url' })).toThrow(/gyldig URL/);
  });
});

describe('/readyz', () => {
  it('counts any HTTP response as reachable and sends no token', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 401 }));
    expect(await isBackendReachable('http://lager-backend:3000', fetchFn as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://lager-backend:3000/api/lager/openapi.json');
    expect(init.headers).toBeUndefined();
  });
  it('reports unreachable on network errors', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await isBackendReachable('http://lager-backend:3000', fetchFn as unknown as typeof fetch)).toBe(false);
  });
});

describe('HTTP startup', () => {
  it('refuses HTTP mode without LAGER_TRUST_FORWARDED_USER=true', () => {
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, {})).toThrow(/LAGER_TRUST_FORWARDED_USER=true/);
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { LAGER_TRUST_FORWARDED_USER: 'false', LAGER_DEFAULT_USER: 'x' })).toThrow();
  });
  it('refuses trusted forwarded user without MCP_HTTP_TOKEN', () => {
    expect(() => assertHttpStartupConfig({}, { LAGER_TRUST_FORWARDED_USER: 'true' })).toThrow(/MCP_HTTP_TOKEN/);
  });
  it('accepts trust flag with token and an idempotency secret of at least 32 characters', () => {
    const hemmelighed = 'x'.repeat(32);
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { LAGER_TRUST_FORWARDED_USER: 'true', MCP_IDEMPOTENS_HEMMELIGHED: hemmelighed })).not.toThrow();
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { LAGER_TRUST_FORWARDED_USER: 'true' })).toThrow(/MCP_IDEMPOTENS_HEMMELIGHED/);
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { LAGER_TRUST_FORWARDED_USER: 'true', MCP_IDEMPOTENS_HEMMELIGHED: 'kort' })).toThrow(/MCP_IDEMPOTENS_HEMMELIGHED/);
  });
});

describe('id path guard', () => {
  it.each([
    ['lager_opslag', { kode: '..' }],
    ['lager_saet', { tag: '.' }],
    ['lager_ansvarlig_enheder', { tag: '%2e%2e' }],
  ])('%s refuses dot-segment ids', async (name, args) => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const server = createServer({ client: new LagerClient({ baseUrl: 'https://lager.test', apiToken: 'tok', user: 'u', fetchFn: fetchFn as unknown as typeof fetch }) });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const mcp = new Client({ name: 't', version: '0' });
    await Promise.all([server.connect(st), mcp.connect(ct)]);
    const result = await mcp.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
