import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LagerClient, type LagerClientOptions } from './lager/client.js';
import { registerLagerTools } from './tools/lager.js';

export interface CreateServerOptions {
  client?: LagerClient;
  clientOptions?: LagerClientOptions;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'lager', version: '0.1.0' });
  const client = options.client ?? new LagerClient(options.clientOptions);
  registerLagerTools(server, client);
  return server;
}
