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

export const PROMPTS = ['daglig-runde', 'tael-en-reol', 'aflever-et-saet', 'hvor-er'] as const;

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
}
