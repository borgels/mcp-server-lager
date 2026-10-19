import { assertSafeBaseUrl } from '../lager/client.js';
import { HEMMELIGHED_MIN } from '../lager/idempotens.js';
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
  // Idempotensnøglerne er en HMAC med denne hemmelighed; uden den kunne de beregnes udefra,
  // og en tilfældig pr. proces ville give forskellige nøgler på hver instans bag gatewayen.
  if ((env.MCP_IDEMPOTENS_HEMMELIGHED ?? '').length < HEMMELIGHED_MIN) {
    throw new Error(`HTTP mode requires MCP_IDEMPOTENS_HEMMELIGHED (at least ${HEMMELIGHED_MIN} characters), the secret behind the Idempotency-Keys.`);
  }
}

/**
 * LagerClient bygges pr. request, så en ugyldig LAGER_BASE_URL ville først vise sig
 * som 500 på hvert kald. Tjek den én gang ved opstart i stedet.
 */
export function assertLagerBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = (env.LAGER_BASE_URL ?? '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('LAGER_BASE_URL mangler');
  assertSafeBaseUrl(baseUrl, env);
  return baseUrl;
}
