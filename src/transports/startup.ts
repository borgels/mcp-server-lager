import { assertForwardedUserRequiresToken, type HttpConfig } from './http-helpers.js';

/**
 * HTTP mode serves many people, so the acting user must come from the
 * gateway-verified X-MCP-User header. A static LAGER_DEFAULT_USER would make
 * every HTTP caller act as that one person, so HTTP mode refuses to start
 * unless LAGER_TRUST_FORWARDED_USER=true — which in turn requires
 * MCP_HTTP_TOKEN so only the gateway can supply that header.
 * (stdio keeps using LAGER_DEFAULT_USER.)
 */
export function assertHttpStartupConfig(
  config: Pick<HttpConfig, 'httpToken'>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.LAGER_TRUST_FORWARDED_USER !== 'true') {
    throw new Error(
      'HTTP mode requires LAGER_TRUST_FORWARDED_USER=true (users come from the gateway via X-MCP-User). ' +
        'LAGER_DEFAULT_USER is only honoured by the stdio transport.',
    );
  }
  assertForwardedUserRequiresToken(['LAGER_TRUST_FORWARDED_USER'], config, env);
}
