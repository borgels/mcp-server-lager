#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServerMedModuler } from '../server.js';
import { ModulCache } from '../lager/moduler.js';

const server = await createServerMedModuler({ moduler: new ModulCache() });
await server.connect(new StdioServerTransport());
