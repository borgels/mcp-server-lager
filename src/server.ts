import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LagerClient, type LagerClientOptions } from './lager/client.js';
import { ModulCache } from './lager/moduler.js';
import { konfigureredeRoller, LagerrolleCache, type Adgang, type GatewayRolle } from './lager/roller.js';
import { registerLagerTools } from './tools/lager.js';
import { registerLagerResources } from './resources.js';
import { registerLagerPrompts } from './prompts.js';

export interface CreateServerOptions {
  client?: LagerClient;
  clientOptions?: LagerClientOptions;
  /** Installationens moduler (fra /me): værktøjer for moduler, der er slået fra, skjules og afvises. */
  moduler?: ModulCache;
  /** Personens adgang (gatewayens roller og lagerets roller): værktøjer, hun ikke må bruge, skjules og afvises. */
  adgang?: Adgang;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'lager', version: '0.3.0' });
  const client = options.client ?? new LagerClient(options.clientOptions);
  registerLagerTools(server, client, { moduler: options.moduler, adgang: options.adgang });
  registerLagerResources(server, client);
  registerLagerPrompts(server);
  return server;
}

/**
 * Som createServer, men henter først (cachet) installationens moduler og personens roller i
 * lageret fra /me, så værktøjslisten allerede passer til hende. `roller` er gatewayens
 * (X-MCP-Roles); uden dem de konfigurerede (LAGER_ROLLER).
 */
export async function createServerMedModuler(
  options: CreateServerOptions & { moduler: ModulCache; lagerroller?: LagerrolleCache; roller?: readonly GatewayRolle[] },
): Promise<McpServer> {
  const client = options.client ?? new LagerClient(options.clientOptions);
  const roller = options.roller ?? konfigureredeRoller();
  // Ét /me giver både personens roller og modulerne; ModulCache spørger kun, hvis det ikke gav dem.
  const lager = options.lagerroller ? await options.lagerroller.hent(client, (m) => options.moduler.saet(m)) : null;
  await options.moduler.hent(client);
  return createServer({ ...options, client, adgang: options.adgang ?? { roller, lager } });
}
