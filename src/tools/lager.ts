import { randomUUID } from 'node:crypto';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { LagerApiError, type LagerClient } from '../lager/client.js';
import { writeAuditEvent } from '../lager/audit.js';
import { assertWritesEnabled, READ_TOOL_ANNOTATIONS, WRITE_TOOL_ANNOTATIONS } from '../lager/policy.js';
import { searchCapabilities } from '../lager/capabilities.js';
import { modulBesked, slaaetFra, type ModulCache } from '../lager/moduler.js';
import { idempotensHemmelighed, klientNoegleFra, toolNoegle } from '../lager/idempotens.js';
import { afvisning, konfigureredeRoller, type Adgang, type Krav } from '../lager/roller.js';
import { KATALOG, type Input } from './katalog.js';
import { BEKRAEFTET, byg } from './bygger.js';

export interface RegisterOptions {
  /** Installationens moduler: værktøjer for moduler, der er slået fra, skjules og afvises. */
  moduler?: ModulCache;
  /**
   * Personens adgang: gatewayens roller (lager-laes/lager-skriv) og lagerets roller fra /me.
   * Værktøjer, personen ikke må bruge, skjules og afvises (src/lager/roller.ts). Uden: de
   * konfigurerede roller (LAGER_ROLLER, standard lager-skriv), og lagerets roller ukendte.
   */
  adgang?: Adgang;
}

export function registerLagerTools(server: McpServer, client: LagerClient, options: RegisterOptions = {}): void {
  const { moduler } = options;
  const adgang: Adgang = options.adgang ?? { roller: konfigureredeRoller(), lager: null };
  // Uden en transport-session: én tilfældig værdi pr. server-instans (pr. stdio-proces, pr. HTTP-kald).
  const instans = randomUUID();
  // Tekst (fx YAML) som den er, en tom krop som ''; alt andet som JSON.
  const json = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: data === undefined ? '' : typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
  const fejl = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

  const run = async (tool: string, input: unknown, fn: () => Promise<unknown>, write: boolean, kraevet: string[], krav?: Krav): Promise<CallToolResult> => {
    // Rollerne først: et skjult værktøj, der alligevel kaldes, afvises, før lageret spørges.
    const nej = krav ? afvisning(krav, adgang) : null;
    if (nej) {
      await writeAuditEvent({ user: client.user, tool, action: 'policy_denied', reason: nej });
      return fejl(nej);
    }
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
    async (input) => run('lager_search_capabilities', input, async () => searchCapabilities(String(input.query ?? ''), Number(input.limit ?? 20), moduler?.senest() ?? null, adgang), false, []),
  );

  const registrerede: { tool: RegisteredTool; moduler: string[]; krav: Krav }[] = [];
  for (const spec of KATALOG) {
    const b = byg(spec);
    const krav: Krav = { navn: spec.navn, skriv: b.skriv, ansvarlig: b.ansvarlig };
    const annotations = !b.skriv ? { ...READ_TOOL_ANNOTATIONS, openWorldHint: b.aabenVerden } : { ...WRITE_TOOL_ANNOTATIONS, destructiveHint: b.sletter, idempotentHint: b.idempotent, openWorldHint: b.aabenVerden };
    const tool = server.registerTool(spec.navn, { title: spec.titel, description: spec.beskrivelse, inputSchema: b.shape, annotations }, async (input, extra) =>
      run(spec.navn, input, async () => {
        const i = input as Input;
        // Skemaet kræver det allerede (z.literal(true)); her også, så intet destruktivt sendes uden.
        if (b.bekraeftes && i[BEKRAEFTET] !== true) throw new Error(`${spec.navn} kræver ${BEKRAEFTET}: true, brugerens udtrykkelige ja.`);
        // Én frist for nye forsøg pr. tool-kald, og for en skrivning én Idempotency-Key,
        // den samme ved hvert nyt forsøg (#113).
        const kald = client.forKald(b.skriv
          ? toolNoegle({
            hemmelighed: idempotensHemmelighed(), user: client.user, tool: spec.navn, input: i, requestId: extra.requestId,
            session: extra.sessionId ?? instans, klientNoegle: klientNoegleFra(extra._meta),
          })
          : undefined);
        const send = b.send(kald);
        const data = spec.kald ? await spec.kald(send, i, kald) : await send(b.vaelg(i), i);
        return spec.efter ? spec.efter(data, i) : data;
      }, b.skriv, b.moduler, krav),
    );
    registrerede.push({ tool, moduler: b.moduler, krav });
  }

  // Kendes modulerne allerede, skjules værktøjerne for dem, der er slået fra; og værktøjerne,
  // personens roller ikke giver (gatewayens læs/skriv, lagerets lageransvarlig og kiosk).
  const kendte = moduler?.senest() ?? null;
  for (const r of registrerede) if (slaaetFra(r.moduler, kendte).length || afvisning(r.krav, adgang)) r.tool.disable();
}
