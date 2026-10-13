import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LagerClient } from '../src/lager/client.js';
import { createServer } from '../src/server.js';
import { assertHttpStartupConfig } from '../src/transports/startup.js';

describe('LAGER_BASE_URL', () => {
  const opts = { apiToken: 'tok', user: 'u' };
  it('requires https unless loopback', () => {
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://lager.example.com' })).toThrow(/https/);
    expect(() => new LagerClient({ ...opts, baseUrl: 'ftp://lager.example.com' })).toThrow(/https/);
    expect(() => new LagerClient({ ...opts, baseUrl: 'https://lager.example.com' })).not.toThrow();
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://localhost:8080' })).not.toThrow();
    expect(() => new LagerClient({ ...opts, baseUrl: 'http://127.0.0.1:8080' })).not.toThrow();
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
  it('accepts trust flag with token', () => {
    expect(() => assertHttpStartupConfig({ httpToken: 't' }, { LAGER_TRUST_FORWARDED_USER: 'true' })).not.toThrow();
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
