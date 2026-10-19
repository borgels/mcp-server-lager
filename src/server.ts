import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LagerClient, type LagerClientOptions } from './lager/client.js';
import { ModulCache } from './lager/moduler.js';
import { registerLagerTools } from './tools/lager.js';
import { registerLagerResources } from './resources.js';
import { registerLagerPrompts } from './prompts.js';

export interface CreateServerOptions {
  client?: LagerClient;
  clientOptions?: LagerClientOptions;
  /** Installationens moduler (fra /me): værktøjer for moduler, der er slået fra, skjules og afvises. */
  moduler?: ModulCache;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'lager', version: '0.2.0' });
  const client = options.client ?? new LagerClient(options.clientOptions);
  registerLagerTools(server, client, { moduler: options.moduler });
  registerLagerResources(server, client);
  registerLagerPrompts(server);
  return server;
}

/** Som createServer, men henter modulerne først (cachet), så værktøjslisten allerede er rigtig. */
export async function createServerMedModuler(options: CreateServerOptions & { moduler: ModulCache }): Promise<McpServer> {
  const client = options.client ?? new LagerClient(options.clientOptions);
  await options.moduler.hent(client);
  return createServer({ ...options, client });
}
