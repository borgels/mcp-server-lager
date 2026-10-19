import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { assertAuthorized, assertForwardedUserRequiresToken, getHttpConfig, tokensEqual } from '../src/transports/http-helpers.js';

function req(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

const base = { host: '127.0.0.1', port: 0, maxBodyBytes: 1024 };

describe('http auth hardening', () => {
  it('compares tokens in constant time regardless of length', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
    expect(tokensEqual('abc', 'abd')).toBe(false);
    expect(tokensEqual('abc', 'abcdef')).toBe(false);
  });

  it('accepts the configured bearer token and rejects others', () => {
    const config = { ...base, httpToken: 'secret-token' };
    expect(() => assertAuthorized(req('Bearer secret-token'), config)).not.toThrow();
    expect(() => assertAuthorized(req('Bearer wrong'), config)).toThrow('Unauthorized');
    expect(() => assertAuthorized(req(), config)).toThrow('Unauthorized');
  });

  it('refuses forwarded-user trust without MCP_HTTP_TOKEN', () => {
    expect(() => assertForwardedUserRequiresToken(['X_TRUST'], {}, { X_TRUST: 'true' })).toThrow(/MCP_HTTP_TOKEN/);
    expect(() => assertForwardedUserRequiresToken(['X_TRUST'], { httpToken: 't' }, { X_TRUST: 'true' })).not.toThrow();
    expect(() => assertForwardedUserRequiresToken(['X_TRUST'], {}, { X_TRUST: 'false' })).not.toThrow();
    expect(() => assertForwardedUserRequiresToken(['X_TRUST'], {}, {})).not.toThrow();
  });
});

describe('token rotation', () => {
  it('accepts MCP_HTTP_TOKEN and MCP_HTTP_TOKEN_FORRIGE, nothing else', () => {
    const config = { ...base, httpToken: 'ny-token', httpTokenForrige: 'gammel-token' };
    expect(() => assertAuthorized(req('Bearer ny-token'), config)).not.toThrow();
    expect(() => assertAuthorized(req('Bearer gammel-token'), config)).not.toThrow();
    expect(() => assertAuthorized(req('Bearer andet'), config)).toThrow('Unauthorized');
    expect(() => assertAuthorized(req('gammel-token'), config)).toThrow('Unauthorized');
    expect(() => assertAuthorized(req(), config)).toThrow('Unauthorized');
  });

  it('reads both tokens from the environment', () => {
    process.env.MCP_HTTP_TOKEN = 'a';
    process.env.MCP_HTTP_TOKEN_FORRIGE = 'b';
    try {
      expect(getHttpConfig()).toMatchObject({ httpToken: 'a', httpTokenForrige: 'b' });
    } finally {
      delete process.env.MCP_HTTP_TOKEN;
      delete process.env.MCP_HTTP_TOKEN_FORRIGE;
    }
  });
});
