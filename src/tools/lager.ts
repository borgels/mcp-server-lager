import { randomUUID } from 'node:crypto';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { LagerApiError, type LagerClient } from '../lager/client.js';
import { writeAuditEvent } from '../lager/audit.js';
import { assertWritesEnabled, READ_TOOL_ANNOTATIONS, WRITE_TOOL_ANNOTATIONS } from '../lager/policy.js';
import { searchCapabilities } from '../lager/capabilities.js';
import { modulBesked, slaaetFra, type ModulCache } from '../lager/moduler.js';
import { klientNoegleFra, toolNoegle } from '../lager/idempotens.js';
import { KATALOG, type Input } from './katalog.js';
import { byg } from './bygger.js';

export interface RegisterOptions {
  /** Installationens moduler: værktøjer for moduler, der er slået fra, skjules og afvises. */
  moduler?: ModulCache;
}

export function registerLagerTools(server: McpServer, client: LagerClient, options: RegisterOptions = {}): void {
  const { moduler } = options;
  // Uden en transport-session: én tilfældig værdi pr. server-instans (pr. stdio-proces, pr. HTTP-kald).
  const instans = randomUUID();
  const json = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const fejl = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

  const run = async (tool: string, input: unknown, fn: () => Promise<unknown>, write: boolean, kraevet: string[]): Promise<CallToolResult> => {
    if (moduler && kraevet.length) {
      const fra = slaaetFra(kraevet, await moduler.hent(client));
      if (fra.length) return fejl(modulBesked(tool, fra));
    }
    if (write) {
      try {
        assertWritesEnabled(tool);
      } catch (e) {
        await writeAuditEvent({ user: client.user, tool, action: 'policy_denied', reason: (e as Error).message });
        return fejl((e as Error).message);
      }
    }
    await writeAuditEvent({ user: client.user, tool, action: 'start', target: input });
    try {
      const r = await fn();
      await writeAuditEvent({ user: client.user, tool, action: 'finish' });
      return json(r);
    } catch (e) {
      const msg = e instanceof LagerApiError ? `${e.message} (HTTP ${e.status})` : e instanceof Error ? e.message : String(e);
      await writeAuditEvent({ user: client.user, tool, action: 'error', error: msg });
      return fejl(msg);
    }
  };

  server.registerTool(
    'lager_search_capabilities',
    { title: "Søg i lager-MCP'ens værktøjer", description: 'Find det rigtige værktøj før første kald.', inputSchema: { query: z.string().trim().default(''), limit: z.number().int().min(1).max(50).default(20) }, annotations: READ_TOOL_ANNOTATIONS },
    async (input) => run('lager_search_capabilities', input, async () => searchCapabilities(String(input.query ?? ''), Number(input.limit ?? 20), moduler?.senest() ?? null), false, []),
  );

  const registrerede: { tool: RegisteredTool; moduler: string[] }[] = [];
  for (const spec of KATALOG) {
    const b = byg(spec);
    const annotations = !b.skriv ? READ_TOOL_ANNOTATIONS : b.sletter ? { ...WRITE_TOOL_ANNOTATIONS, destructiveHint: true } : WRITE_TOOL_ANNOTATIONS;
    const tool = server.registerTool(spec.navn, { title: spec.titel, description: spec.beskrivelse, inputSchema: b.shape, annotations }, async (input, extra) =>
      run(spec.navn, input, async () => {
        const i = input as Input;
        // Én Idempotency-Key pr. tool-kald, genbrugt ved hvert nyt forsøg (#113).
        const kald = b.skriv
          ? client.medIdempotens(toolNoegle({
            user: client.user, tool: spec.navn, input: i, requestId: extra.requestId,
            session: extra.sessionId ?? instans, klientNoegle: klientNoegleFra(extra._meta),
          }))
          : client;
        const send = b.send(kald);
        const data = spec.kald ? await spec.kald(send, i, kald) : await send(b.vaelg(i), i);
        return spec.efter ? spec.efter(data, i) : data;
      }, b.skriv, b.moduler),
    );
    registrerede.push({ tool, moduler: b.moduler });
  }

  // Kendes modulerne allerede, skjules værktøjerne for dem, der er slået fra.
  const kendte = moduler?.senest() ?? null;
  for (const r of registrerede) if (slaaetFra(r.moduler, kendte).length) r.tool.disable();
}
