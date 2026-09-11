import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';
import { LagerApiError, type LagerClient } from '../lager/client.js';
import { writeAuditEvent } from '../lager/audit.js';
import { assertWritesEnabled, READ_TOOL_ANNOTATIONS, WRITE_TOOL_ANNOTATIONS } from '../lager/policy.js';
import { searchCapabilities } from '../lager/capabilities.js';

const lagerId = z.number().int().optional().describe('Lager-id. Udelades, når du kun har adgang til ét lager (se lager_me).');
const projektId = z.number().int().describe('Projektets id (se lager_projekter).');
const koder = z.array(z.string().min(1)).min(1).describe('Mærker (tags, fx OMM-00012) eller serienumre.');
type Input = Record<string, unknown>;
type Fn = (input: Input) => Promise<unknown>;
const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function registerLagerTools(server: McpServer, client: LagerClient): void {
  const json = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const run = async (tool: string, input: unknown, fn: () => Promise<unknown>, write = false): Promise<CallToolResult> => {
    if (write) {
      try {
        assertWritesEnabled(tool);
      } catch (e) {
        await writeAuditEvent({ user: client.user, tool, action: 'policy_denied', reason: (e as Error).message });
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
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
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  };
  const read = (name: string, title: string, description: string, inputSchema: Record<string, z.ZodType>, fn: Fn) =>
    server.registerTool(name, { title, description, inputSchema, annotations: READ_TOOL_ANNOTATIONS }, async (input) => run(name, input, () => fn(input as Input)));
  const write = (name: string, title: string, description: string, inputSchema: Record<string, z.ZodType>, fn: Fn) =>
    server.registerTool(name, { title, description, inputSchema, annotations: WRITE_TOOL_ANNOTATIONS }, async (input) => run(name, input, () => fn(input as Input), true));

  // ---- læs
  read('lager_search_capabilities', 'Søg i lager-MCP\'ens værktøjer', 'Find det rigtige værktøj før første kald.', { query: z.string().trim().default(''), limit: z.number().int().min(1).max(50).default(20) }, async (i) => searchCapabilities(String(i.query ?? ''), Number(i.limit ?? 20)));
  read('lager_me', 'Hvem er jeg', 'Person, konto, lagre med roller (vaerktoejsbruger/lageransvarlig) og tal pr. lager.', {}, () => client.get('/me'));
  read('lager_projekter', 'Projekter', 'Projekter, du kan afhente til og booke på, med sagsnummer og hvad du har ude.', {}, () => client.get('/projekter'));
  read('lager_mine', 'Mine værktøjer', 'Det, du har ude, pr. projekt, med dagsleje.', {}, () => client.get('/mine'));
  read('lager_opslag', 'Slå et mærke op', 'Hvad er det, hvem har det, hvor skal det stå, værnemidler og dokumenter (brugsanvisning, datablad).', { kode: z.string().min(1).describe('Mærke (tag) eller serienummer.') }, (i) => client.get(`/opslag/${encodeURIComponent(String(i.kode))}`));
  read('lager_model', 'Model for brugeren', 'Navn, fotos, dokumenter og værnemidler for en model. Ingen priser.', { modelId: z.number().int() }, (i) => client.get(`/modeller/${Number(i.modelId)}`));
  read('lager_forbrugsvarer', 'Forbrugsvarer', 'Kataloget: navn, varenr, gruppe, beholdning, salgspris. Udsolgt kan bestilles med lager_bestil.', { lagerId, soeg: z.string().optional().describe('Filtrér på navn eller varenr.') }, async (i) => {
    const d = await client.get<{ varer: { navn: string; varenr: string | null }[] }>('/forbrugsvarer', { lager: num(i.lagerId) });
    const q = String(i.soeg ?? '').toLowerCase();
    return q ? { varer: d.varer.filter((v) => v.navn.toLowerCase().includes(q) || (v.varenr ?? '').toLowerCase().includes(q)) } : d;
  });
  read('lager_bestillinger', 'Mine bestillinger', 'Klar til afhentning, på vej, hentet (30 dage).', {}, () => client.get('/bestillinger'));
  read('lager_bookinger', 'Mine bookinger', 'Bookinger af værktøj til kommende dage.', {}, () => client.get('/bookinger'));
  read('lager_ansvarlig_overblik', 'Lageransvarlig: overblik', 'Tal, det der kræver handling (afregninger, ukendte, karantæne, lav beholdning, forfaldne), seneste bevægelser.', { lagerId }, (i) => client.get('/ansvarlig/overblik', { lager: num(i.lagerId) }));
  read('lager_ansvarlig_modeller', 'Lageransvarlig: modeller', 'Uden modelId: alle modeller med antal og priser. Med modelId: modellen med fotos, dokumenter, prisversioner og enheder.', { lagerId, modelId: z.number().int().optional(), inklInaktive: z.boolean().optional() }, (i) => i.modelId != null ? client.get(`/ansvarlig/modeller/${Number(i.modelId)}`, { lager: num(i.lagerId) }) : client.get('/ansvarlig/modeller', { lager: num(i.lagerId), inklInaktive: i.inklInaktive ? 1 : undefined }));
  read('lager_ansvarlig_enheder', 'Lageransvarlig: enheder', 'Uden tag: enheder filtreret på status (paa_lager, ude, karantaene, til_klargoering, til_service, savnet, kasseret, solgt), model og søgning. Med tag: enheden med fotos, historik, lejeperioder og salg.', { lagerId, tag: z.string().optional(), status: z.string().optional(), modelId: z.number().int().optional(), soeg: z.string().optional() }, (i) => i.tag ? client.get(`/ansvarlig/enheder/${encodeURIComponent(String(i.tag))}`) : client.get('/ansvarlig/enheder', { lager: num(i.lagerId), status: str(i.status), model: num(i.modelId), soeg: str(i.soeg) }));
  read('lager_ansvarlig_forbrugsvarer', 'Lageransvarlig: beholdning', 'Forbrugsvarer med beholdning, minimum, kost- og salgspris, sidst modtaget.', { lagerId }, (i) => client.get('/ansvarlig/forbrugsvarer', { lager: num(i.lagerId) }));
  read('lager_ansvarlig_bestillinger', 'Lageransvarlig: bestillinger', 'Listen pr. leverandør (skal bestilles: brugernes bestillinger og varer under minimum) og alle bestillinger med status.', { lagerId }, (i) => client.get('/ansvarlig/bestillinger', { lager: num(i.lagerId) }));
  read('lager_ansvarlig_perioder', 'Lageransvarlig: lejeperioder', 'Pr. enhed (tag) eller i et vindue (fra/til, ÅÅÅÅ-MM-DD); aabne=true for kun åbne.', { lagerId, tag: z.string().optional(), fra: z.string().optional(), til: z.string().optional(), aabne: z.boolean().optional() }, (i) => client.get('/ansvarlig/perioder', { lager: num(i.lagerId), tag: str(i.tag), fra: str(i.fra), til: str(i.til), aabne: i.aabne ? 1 : undefined }));
  read('lager_ansvarlig_afregninger', 'Lageransvarlig: afregninger', 'Uden id: alle afregninger med status. Med id: afregningen pr. sag med linjer og mangler. Godkendelse og bogføring sker i appen, ikke her.', { lagerId, afregningId: z.number().int().optional() }, (i) => i.afregningId != null ? client.get(`/ansvarlig/afregninger/${Number(i.afregningId)}`) : client.get('/ansvarlig/afregninger', { lager: num(i.lagerId) }));
  read('lager_ansvarlig_koe', 'Lageransvarlig: kø', 'Det, der kræver afgørelse: ukendte mærker, karantæne, klargøring, afstemning, afregninger.', { lagerId }, (i) => client.get('/ansvarlig/koe', { lager: num(i.lagerId) }));

  // ---- skriv (opt-in)
  write('lager_tjek_ud', 'Tag værktøj med ud', 'Udlevering til et projekt. Står et emne hos en kollega, kræver det overtag: true på linjen. retur: i_dag | i_morgen | om_14_dage | ingen | ÅÅÅÅ-MM-DD.', { lagerId, projektId, linjer: z.array(z.object({ kode: z.string().min(1), overtag: z.boolean().optional() })).min(1), retur: z.string().optional() }, (i) => client.post('/tjek-ud', { lagerId: i.lagerId, projektId: i.projektId, linjer: i.linjer, retur: i.retur }));
  write('lager_aflever', 'Aflevér værktøj', 'Retur til lageret; svaret siger hvor det skal stå. Skadet kræver en note.', { lagerId, linjer: z.array(z.object({ kode: z.string().min(1), skadet: z.boolean().optional(), note: z.string().optional() })).min(1) }, (i) => client.post('/aflever', { lagerId: i.lagerId, linjer: i.linjer }));
  write('lager_flyt_projekt', 'Flyt til andet projekt', 'Udlejet værktøj flyttes til et andet projekt uden om lageret: custody uændret, lejen skifter projekt fra i dag. Egne emner; som lageransvarlig på lagerId alt på lageret.', { koder, projektId, lagerId, note: z.string().optional() }, (i) => client.post('/flyt', { koder: i.koder, projektId: i.projektId, lagerId: i.lagerId, note: i.note }));
  write('lager_forbrug', 'Køb forbrugsvarer', 'Udtag til projektet med dagens salgspris; en linje med bestil: true bestilles via indkøb og koster først ved afhentning.', { lagerId, projektId, linjer: z.array(z.object({ vareId: z.number().int(), antal: z.number().int().min(1), bestil: z.boolean().optional() })).min(1) }, (i) => client.post('/forbrug', { lagerId: i.lagerId, projektId: i.projektId, linjer: i.linjer }));
  write('lager_bestil', 'Bestil via indkøb', 'Bestil forbrugsvarer, der er udsolgt. Klar efter typisk 2 til 3 dage; besked i appen.', { lagerId, projektId, linjer: z.array(z.object({ vareId: z.number().int(), antal: z.number().int().min(1) })).min(1) }, (i) => client.post('/bestillinger', { lagerId: i.lagerId, projektId: i.projektId, linjer: i.linjer }));
  write('lager_bestilling_hent', 'Afhent bestilling', 'Udtaget koster på sagen; beholdningen er ikke rørt.', { bestillingId: z.number().int() }, (i) => client.post(`/bestillinger/${Number(i.bestillingId)}/hent`, {}));
  write('lager_bestilling_fortryd', 'Fortryd bestilling', 'Indtil varen er klar. Den lageransvarlige kan altid (en klar vare går i beholdningen).', { bestillingId: z.number().int() }, (i) => client.delete(`/bestillinger/${Number(i.bestillingId)}`));
  write('lager_ansvarlig_modtag_levering', 'Lageransvarlig: modtag levering', 'Bilag og linjer pr. vare; en kostpris på linjen bliver dagens pris. Bestilte varer lægges til side til dem, der venter.', { lagerId, bilag: z.string().optional(), leverandoer: z.string().optional(), dato: z.string().optional(), linjer: z.array(z.object({ forbrugsvareId: z.number().int().optional(), ny: z.object({ navn: z.string(), gruppe: z.enum(['forbrug', 'vaerne', 'arbtoj', 'vaerktoej']), varenr: z.string().optional(), enhed: z.string().optional() }).optional(), antal: z.number().int().min(1), kostpris: z.number().optional() })).min(1) }, (i) => client.post('/ansvarlig/forbrugsvarer/modtag', { lagerId: i.lagerId, bilag: i.bilag, leverandoer: i.leverandoer, dato: i.dato, linjer: i.linjer }));
  write('lager_ansvarlig_send_bestillingsliste', 'Lageransvarlig: send bestillingsliste', 'Listen for én leverandør til indkøb: åbne bestillinger bliver «sendt», varer under minimum får en bestilling til lager. Svaret er teksten til indkøb.', { lagerId, leverandoer: z.string().nullable().optional(), forventet: z.string().optional() }, (i) => client.post('/ansvarlig/bestillinger/send', { lagerId: i.lagerId, leverandoer: i.leverandoer ?? null, forventet: i.forventet }));
}
