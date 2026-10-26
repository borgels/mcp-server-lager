#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServerMedModuler } from '../server.js';
import { ModulCache } from '../lager/moduler.js';
import { LagerrolleCache } from '../lager/roller.js';

// Én bruger (LAGER_DEFAULT_USER) med de konfigurerede roller (LAGER_ROLLER, standard lager-skriv).
const server = await createServerMedModuler({ moduler: new ModulCache(), lagerroller: new LagerrolleCache() });
await server.connect(new StdioServerTransport());
