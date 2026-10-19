import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';

/**
 * Prompts (#27): de faste forløb på lageret, som en bruger kan vælge i klienten.
 * De kalder ikke appen selv; de fortæller modellen, hvilke værktøjer der bruges
 * i hvilken rækkefølge, og hvor brugeren skal bekræfte.
 */
const besked = (tekst: string): GetPromptResult => ({ messages: [{ role: 'user', content: { type: 'text', text: tekst } }] });
const lagerTekst = (lagerId?: string) => (lagerId ? ` på lager ${lagerId} (lagerId: ${lagerId})` : '');

export const PROMPTS = ['daglig-runde', 'tael-en-reol', 'aflever-et-saet', 'hvor-er', 'planlaeg', 'klimatjek'] as const;

export function registerLagerPrompts(server: McpServer): void {
  server.registerPrompt(
    'daglig-runde',
    { title: 'Daglig runde', description: 'Den lageransvarliges morgen: hvad kræver handling, hvad skal plukkes, hvad skal bestilles.', argsSchema: { lagerId: z.string().optional().describe('Lager-id; udelades med ét lager.') } },
    ({ lagerId }) =>
      besked(
        `Tag den daglige runde${lagerTekst(lagerId)} som lageransvarlig.\n\n` +
          '1. lager_ansvarlig_overblik: tal, det der kræver handling, åbne optællinger.\n' +
          '2. lager_ansvarlig_koe: ukendte mærker, karantæne, klargøring, afstemning.\n' +
          '3. lager_ansvarlig_pluk (hvis værktøjet findes): bookinger, der skal stå klar i dag.\n' +
          '4. lager_ansvarlig_bestillinger: hvad skal bestilles, pr. leverandør.\n\n' +
          'Saml det i en kort liste ordnet efter, hvad der haster. Foreslå handlinger (fx afklar et ukendt mærke, sæt en booking klar, send en bestillingsliste), men udfør ingen skrivning, før jeg har sagt ja.',
      ),
  );

  server.registerPrompt(
    'tael-en-reol',
    {
      title: 'Tæl en reol',
      description: 'Optælling af en reol eller et område: start, scan, gør op, afgør afvigelser, luk.',
      argsSchema: { omraade: z.string().describe('Området, fx «A-12» eller «Reol B».'), lagerId: z.string().optional().describe('Lager-id; udelades med ét lager.') },
    },
    ({ omraade, lagerId }) =>
      besked(
        `Hjælp mig med at tælle ${omraade}${lagerTekst(lagerId)}.\n\n` +
          `1. Se med lager_ansvarlig_optaellinger, om der er en åben optælling. Ellers start én med lager_ansvarlig_optaelling_start (omraade: «${omraade}»).\n` +
          '2. Jeg læser mærkerne op hylde for hylde. Registrér dem med lager_ansvarlig_optaelling_scan (koder, og plads, når jeg siger hvilken hylde). Sig til, hvis et udfald er andet end «fundet».\n' +
          '3. Når jeg siger, at reolen er talt: lager_ansvarlig_optaelling_goer_op, og vis afvigelserne (savnes, forkert plads, uventet, ukendt).\n' +
          '4. Gå afvigelserne igennem med mig én ad gangen og afgør dem med lager_ansvarlig_optaelling_afgoer.\n' +
          '5. Luk med lager_ansvarlig_optaelling_luk først, når alle afvigelser har et svar, og jeg har bekræftet.',
      ),
  );

  server.registerPrompt(
    'aflever-et-saet',
    { title: 'Aflever et sæt', description: 'Aflevér en kasse eller et sæt: tjek indholdet mod pakkelisten, og aflevér med de dele, der er med.', argsSchema: { tag: z.string().describe('Sættets mærke, fx T-00031.') } },
    ({ tag }) =>
      besked(
        `Jeg vil aflevere sættet ${tag}.\n\n` +
          `1. Hent indholdet med lager_saet (tag: ${tag}): delene, pakkelisten og hvad der mangler.\n` +
          '2. Læs delene op for mig, og spørg, hvilke der er med i kassen nu, og om noget er skadet.\n' +
          `3. Aflevér med lager_aflever: én linje med kode ${tag}, dele = de dele, jeg har bekræftet, og skadet + note, hvis noget er skadet.\n` +
          '4. Fortæl mig, hvor kassen skal stå (svaret siger pladsen), og hvilke dele der stadig mangler.',
      ),
  );

  server.registerPrompt(
    'hvor-er',
    { title: 'Hvor er X?', description: 'Find et stykke værktøj: hvem har det, hvor skal det stå, eller hvad der er ledigt af slagsen.', argsSchema: { hvad: z.string().describe('Et mærke (fx T-00012), et serienummer eller en beskrivelse (fx «borehammer»).') } },
    ({ hvad }) =>
      besked(
        `Hvor er «${hvad}»?\n\n` +
          '- Ligner det et mærke eller serienummer: slå det op med lager_opslag. Svar med hvem der har det (og på hvilket projekt), eller pladsen, hvis det er hjemme.\n' +
          '- Er det en beskrivelse eller et sted: søg med lager_hvor_er (q), der giver enheder med hjemmepladsens fulde sti og lokationer med kode eller navn. Findes den ikke: lager_ansvarlig_enheder (soeg), hvis jeg er lageransvarlig, ellers lager_tilgaengelighed for i dag.\n' +
          '- Er der flere, så vis dem kort med status og plads, og spørg hvilken jeg mener.',
      ),
  );
  server.registerPrompt(
    'planlaeg',
    {
      title: 'Planlæg et rum',
      description: 'Indret eller omindret et rum i scenarier: læs rummet, lav et eller flere forslag med planlagte ting, valider og sammenlign. Vedtagelsen er et menneskes.',
      argsSchema: {
        rum: z.string().describe('Rummet eller stedet: lokations-id eller kode.'),
        maal: z.string().describe('Hvad planen skal opnå, fx «plads til 40 kasser mere» eller «et arbejdsbord ved vinduet».'),
        alternativer: z.string().optional().describe('Hvor mange forslag (1 til 3); standard 2.'),
        lagerId: z.string().optional().describe('Lager-id; udelades med ét lager.'),
      },
    },
    ({ rum, maal, alternativer, lagerId }) => {
      const n = Math.min(3, Math.max(1, Number.parseInt(alternativer ?? '2', 10) || 2));
      return besked(
        `Planlæg ${rum}${lagerTekst(lagerId)}. Målet: ${maal}.\n\n` +
          `1. Find rummet: lager_lokation (id) eller lager_lokation_kode (kode). Læs plantegningen med lager_lokation_visning (slags: oppefra) eller resourcen lager://lokation/{id}/plan: mål, vægge, døre, det, der står, og gangene. Se belægningen med lager_belaegning (rod) og evnerne (strøm, udsugning …) med lager_lokation_evner.\n` +
          '2. Se på lager_scenarier, om der allerede er en kladde for rummet. Find egnede skabeloner med lager_skabeloner (type, fx reol eller skab) og mål med lager_skabelon.\n' +
          `3. Lav ${n} forslag, hvert som sit eget scenarie med scenario_opret (rodId = rummet, et kort navn, der siger idéen). Byg dem med scenario_tilfoej_ting (skabelon eller navn + type med geometri i mm, parentId = rummet eller en planlagt lokation) og scenario_flyt (flyt, drej eller fjern det, der står). Brug koebspris, når du kender den.\n` +
          '4. Valider hvert forslag med scenario_valider og ret det, til der ingen fejl er; forklar de advarsler, der er tilbage (kollisioner, smalle gange, vægt, krav til evner).\n' +
          `5. ${n > 1 ? 'Sammenlign forslagene med scenario_sammenlign (ider kommasepareret) og vis' : 'Vis'} pris, ny kapacitet, flytninger og advarsler i en kort tabel med din anbefaling.\n\n` +
          'Du arbejder kun i scenarier: det rigtige træ ændres ikke. Vedtagelsen er den lageransvarliges beslutning i appen; sig, hvilket scenarie du anbefaler, men vedtag intet. Slet eller forkast ingen scenarier, jeg ikke selv har bedt om.',
      );
    },
  );

  server.registerPrompt(
    'klimatjek',
    { title: 'Klimatjek', description: 'Klimaet i et rum: følerne, dugpunkt, luftkvalitet, alarmer og ventilation, med forslag.', argsSchema: { rum: z.string().describe('Rummets lokations-id.') } },
    ({ rum }) =>
      besked(
        `Tjek klimaet i lokation ${rum}.\n\n` +
          `1. lager_iot_lokation_klima (lokationId: ${rum}): følerne, dugpunkt inde og ude, luftkvaliteten og de åbne alarmer.\n` +
          `2. lager_iot_alarmer (lokationId: ${rum}) og lager_iot_alarmregler (lokationId: ${rum}): hvad giver alarm, og hvad mangler en regel.\n` +
          `3. lager_iot_lokation_styring (lokationId: ${rum}): ventilation, lys og printere nu.\n\n` +
          'Sig kort, om der er risiko for kondens (inde-dugpunktet tæt på overfladetemperaturen) eller dårlig luft, og foreslå handlinger: ventilation (lager_ansvarlig_iot_styr), alarmregler (lager_ansvarlig_iot_alarmregel_opret eller lager_ansvarlig_iot_luftkvalitetsregler) eller en automation (lager_iot_lokation_automationer). Udfør ingen skrivning, før jeg har sagt ja.',
      ),
  );
}
