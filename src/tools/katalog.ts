/**
 * Værktøjskataloget: navn, titel, beskrivelse og eksempler er håndplukket, så en
 * LLM kan finde og forstå dem. Parametre, typer, påkrævede felter og moduler
 * kommer fra lager-API'ets OpenAPI (openapi/lager.json) via `op`. test/openapi.test.ts
 * holder kataloget og kortet i takt: hver op findes, og hver operation i kortet har
 * et værktøj eller en grund til at mangle ét (UDEN_VAERKTOEJ).
 */
import { z } from 'zod/v4';
import type { LagerClient } from '../lager/client.js';
import type { OpNoegle } from '../openapi/spec.js';

export type Input = Record<string, unknown>;
export type Sender = (op: OpNoegle, input: Input) => Promise<unknown>;

export type ToolSpec = {
  navn: string;
  titel: string;
  /** Til LLM'en: hvad værktøjet gør, og hvornår det bruges. */
  beskrivelse: string;
  /** Én linje til lager_search_capabilities. */
  kort: string;
  eksempler: string[];
  /** Operationen i OpenAPI-kortet; skemaet bygges af dens parametre og krop. */
  op: OpNoegle;
  /** En anden operation, når feltet er sat (fx én model i stedet for listen). */
  medId?: { felt: string; op: OpNoegle };
  /** API-navn → værktøjets navn, ud over de faste (lager → lagerId, projekt → projektId, model → modelId). */
  alias?: Record<string, string>;
  /** API-felter, værktøjet ikke viser; «linjer.fotoId» rammer feltet på hver linje. */
  skjul?: string[];
  /** Faste værdier i kroppen, som værktøjet ikke viser. */
  fast?: Record<string, unknown>;
  /** Indskrænk et felts enum-værdier, fx «afgoerelse.slags»: resten er appens. */
  begraens?: Record<string, string[]>;
  /** Felter, der også tager null (API'et: «null sletter et felt»). */
  nullbar?: string[];
  /** Markér værktøjet som destruktivt (destructiveHint), ud over DELETE. */
  destruktiv?: boolean;
  /** Felter, værktøjet kræver, selv om API'et ikke gør. */
  kraev?: string[];
  /** Feltbeskrivelser (værktøjets navne), der går over kortets. */
  beskriv?: Record<string, string>;
  /** Felter, der lægges til eller går over kortets; kun API'ets egne felter sendes. */
  ekstra?: Record<string, z.ZodType>;
  efter?: (data: unknown, input: Input) => unknown;
  /** Eget forløb over én eller flere operationer (som også står i `ops`). */
  kald?: (send: Sender, input: Input, client: LagerClient) => Promise<unknown>;
  ops?: OpNoegle[];
};

/** Felter, der hedder det samme i alle værktøjer, og deres beskrivelse, når kortet ikke har én. */
export const FAELLES_BESKRIVELSER: Record<string, string> = {
  lagerId: 'Lager-id. Udelades, når du kun har adgang til ét lager (se lager_me).',
  projektId: 'Projektets id (se lager_projekter).',
  koder: 'Mærker (tags, fx T-00012) eller serienumre.',
  kode: 'Mærke (tag, fx T-00012) eller serienummer.',
  tag: 'Enhedens mærke, fx T-00012.',
  modelId: 'Modellens id (se lager_ansvarlig_modeller).',
  plads: 'Pladsens kode, fx A-12-3.',
  optaellingId: 'Optællingens id (se lager_ansvarlig_optaellinger).',
  bookingId: 'Bookingens id (se lager_bookinger eller lager_ansvarlig_pluk).',
  bestillingId: 'Bestillingens id (se lager_bestillinger).',
  afregningId: 'Afregningens id (se lager_ansvarlig_afregninger).',
  ukendtId: 'Det ukendte mærkes id i køen (se lager_ansvarlig_koe).',
  fra: 'ÅÅÅÅ-MM-DD',
  til: 'ÅÅÅÅ-MM-DD',
  dato: 'ÅÅÅÅ-MM-DD',
};

export const FAELLES_ALIAS: Record<string, string> = { lager: 'lagerId', projekt: 'projektId', model: 'modelId' };

/** Operationer i kortet, der med vilje ikke er et værktøj, med grunden. */
export const UDEN_VAERKTOEJ: Partial<Record<OpNoegle, string>> = {
  'POST /auth/link': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/indloes': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/forny': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/log-ud': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /overtag': 'Overtagelse kræver et foto og hører til telefonen; lager_tjek_ud med overtag: true dækker resten.',
  'GET /bestillinger/{id}': 'lager_bestillinger viser dem alle.',
  'GET /dokumenter/{id}': 'En fil; lager_opslag og lager_model giver dokumenternes adresser.',
  'GET /ansvarlig/etiketter/pladser': 'En PDF til printeren; hører til appen.',
  'GET /ansvarlig/saet/{tag}': 'lager_saet viser indholdet; priserne står på lager_ansvarlig_enheder.',
  'GET /ansvarlig/priser': 'Prishistorik står på lager_ansvarlig_modeller med modelId.',
  'GET /ansvarlig/politik': 'Prispolitikken er appens indstilling.',
  'GET /ansvarlig/moduler': 'lager_me viser modulerne; at slå dem til og fra er appens indstilling.',
  'PUT /ansvarlig/moduler': 'At slå moduler til og fra er appens indstilling.',
  'GET /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'POST /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'DELETE /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'POST /ansvarlig/afgoer': 'Kassation og frigivelse af karantæne er den lageransvarliges afgørelse i appen.',
  'POST /ansvarlig/modtag': 'Registrering af nye enheder med mærke sker ved reolen med scanneren.',
  'POST /ansvarlig/enheder': 'Oprettelse af enheder sker ved reolen med scanneren og etiketprinteren.',
  'POST /ansvarlig/modeller': 'En ny model får sin første pris i appen.',
  'POST /ansvarlig/forbrugsvarer': 'En ny vare oprettes ved modtagelse (lager_ansvarlig_modtag_levering med ny).',
  'PUT /ansvarlig/forbrugsvarer/{id}': 'Beholdning og stamdata for varer rettes i appen.',
  'GET /ansvarlig/forbrugsvarer/{id}/bevaegelser': 'Detalje til appen; lager_ansvarlig_forbrugsvarer giver beholdningen.',
  'GET /ansvarlig/forbrug': 'Udtag pr. periode hører til afregningen i appen.',
  'POST /ansvarlig/forbrug': 'Udtag på vegne af andre, evt. bagudrettet, er en rettelse i appen.',
  'DELETE /ansvarlig/forbrug/{id}': 'Annullering af udtag er en rettelse i appen.',
  'PUT /ansvarlig/bestillinger/{id}': 'Forventet dato sættes, når listen sendes (lager_ansvarlig_send_bestillingsliste).',
  'POST /ansvarlig/perioder': 'Lejeperioder rettes i appen: de går direkte i afregningen.',
  'PUT /ansvarlig/perioder/{id}': 'Lejeperioder rettes i appen: de går direkte i afregningen.',
  'DELETE /ansvarlig/perioder/{id}': 'Lejeperioder rettes i appen: de går direkte i afregningen.',
  'POST /ansvarlig/saet/{tag}/oploes': 'At opløse et sæt er ikke til at fortryde; det sker i appen.',
};

export const KATALOG: ToolSpec[] = [
  // ---------------------------------------------------------------- læs: brugeren
  { navn: 'lager_me', titel: 'Hvem er jeg', op: 'GET /me',
    beskrivelse: 'Person, konto, lagre med roller (vaerktoejsbruger/lageransvarlig), installationens moduler (id → til/fra) og tal pr. lager.',
    kort: 'Hvem er du, dine lagre, roller, moduler og lagrets tal.', eksempler: ['hvilke lagre har jeg adgang til'] },
  { navn: 'lager_projekter', titel: 'Projekter', op: 'GET /projekter',
    beskrivelse: 'Projekter, du kan afhente til og booke på, med sagsnummer og hvad du har ude.',
    kort: 'Projekter, du kan afhente til og booke på.', eksempler: ['hvilke sager kan jeg tage værktøj ud til'] },
  { navn: 'lager_mine', titel: 'Mine værktøjer', op: 'GET /mine',
    beskrivelse: 'Det, du har ude, pr. projekt, med dagsleje.',
    kort: 'Værktøj, du har ude, pr. projekt, med dagsleje.', eksempler: ['hvad har jeg ude lige nu'] },
  { navn: 'lager_opslag', titel: 'Slå et mærke op', op: 'GET /opslag/{kode}',
    beskrivelse: 'Hvad er det, hvem har det, hvor skal det stå (plads), værnemidler og dokumenter (brugsanvisning, datablad).',
    kort: 'Slå et mærke (tag) eller serienummer op: hvad er det, hvem har det, værnemidler og dokumenter.', eksempler: ['hvem har T-00012', 'brugsanvisning til T-00012', 'hvor er T-00012'] },
  { navn: 'lager_plads', titel: 'En plads på lageret', op: 'GET /pladser/{kode}',
    beskrivelse: 'Hyldeetiketten: pladsen (zone, reol, hylde) og de enheder, der hører til dér, med status.',
    kort: 'En plads (fx A-12-3) og enhederne, der hører til dér.', eksempler: ['hvad står på A-12-3'],
    beskriv: { kode: 'Pladsens kode, fx A-12-3 eller KAR.' } },
  { navn: 'lager_model', titel: 'Model for brugeren', op: 'GET /modeller/{id}', alias: { id: 'modelId' },
    beskrivelse: 'Navn, fotos, dokumenter og værnemidler for en model. Ingen priser.',
    kort: 'En model for brugeren: navn, fotos, dokumenter, værnemidler (ingen priser).', eksempler: ['datablad for model 12'] },
  { navn: 'lager_saet', titel: 'Sættets indhold', op: 'GET /saet/{tag}',
    beskrivelse: 'Dele med «med sættet»/«uden for», pakkelisten og hvad der mangler. Ingen priser.',
    kort: 'Et sæts indhold: dele med/uden for sættet, pakkeliste, hvad der mangler.', eksempler: ['hvad er der i kasse T-00031', 'mangler der noget i sættet'] },
  { navn: 'lager_forbrugsvarer', titel: 'Forbrugsvarer', op: 'GET /forbrugsvarer',
    beskrivelse: 'Kataloget: navn, varenr, gruppe, beholdning, salgspris. Udsolgt kan bestilles med lager_bestil.',
    kort: 'Kataloget af forbrugsvarer med beholdning og salgspris.', eksempler: ['er der diamantklinger på lager'],
    ekstra: { soeg: z.string().optional().describe('Filtrér på navn eller varenr.') },
    efter: (data, i) => {
      const q = String(i.soeg ?? '').toLowerCase();
      const d = data as { varer: { navn: string; varenr: string | null }[] };
      return q ? { varer: d.varer.filter((v) => v.navn.toLowerCase().includes(q) || (v.varenr ?? '').toLowerCase().includes(q)) } : d;
    } },
  { navn: 'lager_bestillinger', titel: 'Mine bestillinger', op: 'GET /bestillinger',
    beskrivelse: 'Klar til afhentning, på vej, hentet (30 dage).',
    kort: 'Dine bestillinger: klar, på vej, hentet.', eksempler: ['er min bestilling klar'] },
  { navn: 'lager_bookinger', titel: 'Bookinger', op: 'GET /bookinger',
    beskrivelse: 'Dine bookinger af værktøj til kommende dage; med projektId i stedet projektets åbne bookinger.',
    kort: 'Dine bookinger, eller et projekts.', eksempler: ['hvad har jeg booket til næste uge', 'hvad er booket til sag 2602'] },
  { navn: 'lager_tilgaengelighed', titel: 'Hvad kan bookes', op: 'GET /tilgaengelighed',
    beskrivelse: 'Kategorier med antal og ledige i perioden, og modellerne under hver. Brug den før lager_book.',
    kort: 'Hvad er ledigt i en periode, pr. kategori og model.', eksempler: ['er der en borehammer ledig i uge 43', 'hvor mange stilladser er ledige fra mandag'] },

  // ---------------------------------------------------------------- læs: lageransvarlig
  { navn: 'lager_ansvarlig_overblik', titel: 'Lageransvarlig: overblik', op: 'GET /ansvarlig/overblik',
    beskrivelse: 'Tal, det der kræver handling (afregninger, ukendte, karantæne, lav beholdning, forfaldne), åbne optællinger og seneste bevægelser.',
    kort: 'Lageransvarlig: tal, det der kræver handling, seneste bevægelser.', eksempler: ['hvad kræver handling på lageret'] },
  { navn: 'lager_ansvarlig_koe', titel: 'Lageransvarlig: kø', op: 'GET /ansvarlig/koe',
    beskrivelse: 'Det, der kræver afgørelse: ukendte mærker (afklares med lager_ansvarlig_afklar_ukendt), karantæne, klargøring, afstemning, afregninger.',
    kort: 'Lageransvarlig: ukendte mærker, karantæne, klargøring, afstemning.', eksempler: ['hvad står i karantæne', 'ukendte mærker'] },
  { navn: 'lager_ansvarlig_modeller', titel: 'Lageransvarlig: modeller', op: 'GET /ansvarlig/modeller',
    medId: { felt: 'modelId', op: 'GET /ansvarlig/modeller/{id}' }, alias: { id: 'modelId', inaktive: 'inklInaktive' },
    beskrivelse: 'Uden modelId: alle modeller med antal og priser (inkl. kostpris). Med modelId: modellen med fotos, dokumenter, prisversioner og enheder.',
    kort: 'Lageransvarlig: modeller med antal og priser, eller én model i dybden.', eksempler: ['modeller uden pris', 'alt om model 12'] },
  { navn: 'lager_ansvarlig_pakkeliste', titel: 'Lageransvarlig: pakkeliste', op: 'GET /ansvarlig/modeller/{id}/pakkeliste', alias: { id: 'modelId' },
    beskrivelse: 'Pakkelisten for en sætmodel: hvilke dele (model eller fritekst) og hvor mange.',
    kort: 'Lageransvarlig: pakkelisten for en sætmodel.', eksempler: ['hvad skal der være i en borekasse'] },
  { navn: 'lager_ansvarlig_enheder', titel: 'Lageransvarlig: enheder', op: 'GET /ansvarlig/enheder',
    medId: { felt: 'tag', op: 'GET /ansvarlig/enheder/{tag}' },
    beskrivelse: 'Uden tag: enheder filtreret på status, model og søgning. Med tag: enheden med fotos, historik, lejeperioder og salg.',
    kort: 'Lageransvarlig: enheder filtreret på status, model, søgning; eller én enhed med historik.', eksempler: ['enheder på værksted', 'historik for T-00012'] },
  { navn: 'lager_ansvarlig_forbrugsvarer', titel: 'Lageransvarlig: beholdning', op: 'GET /ansvarlig/forbrugsvarer',
    beskrivelse: 'Forbrugsvarer med beholdning, minimum, kost- og salgspris, sidst modtaget.',
    kort: 'Lageransvarlig: forbrugsvarer med beholdning, minimum, kost- og salgspris.', eksempler: ['hvad er under minimum'] },
  { navn: 'lager_ansvarlig_bestillinger', titel: 'Lageransvarlig: bestillinger', op: 'GET /ansvarlig/bestillinger',
    beskrivelse: 'Listen pr. leverandør (skal bestilles: brugernes bestillinger og varer under minimum) og alle bestillinger med status.',
    kort: 'Lageransvarlig: bestillingslisten pr. leverandør og alle bestillinger.', eksempler: ['hvad skal bestilles hos STARK'] },
  { navn: 'lager_ansvarlig_perioder', titel: 'Lageransvarlig: lejeperioder', op: 'GET /ansvarlig/perioder',
    beskrivelse: 'Lejeperioder pr. enhed (tag) eller i et vindue (fra/til).',
    kort: 'Lageransvarlig: lejeperioder pr. enhed eller i et vindue.', eksempler: ['lejeperioder i august for T-00012'] },
  { navn: 'lager_ansvarlig_afregninger', titel: 'Lageransvarlig: afregninger', op: 'GET /ansvarlig/afregninger',
    medId: { felt: 'afregningId', op: 'GET /ansvarlig/afregninger/{id}' }, alias: { id: 'afregningId' },
    beskrivelse: 'Uden afregningId: alle afregninger med status. Med afregningId: afregningen pr. sag med linjer og mangler. Godkendelse og bogføring sker i appen, ikke her.',
    kort: 'Lageransvarlig: afregninger udlejer → køber, eller én afregning pr. sag.', eksempler: ['status på septembers afregning'] },
  { navn: 'lager_ansvarlig_pladser', titel: 'Lageransvarlig: pladser', op: 'GET /ansvarlig/pladser',
    beskrivelse: 'Zoner (opbevaring og særlige: MOD, UDL, LAD, KLG, SRV, KAR, ASB-K, ASB-O), reoler og hylder med antal enheder.',
    kort: 'Lageransvarlig: zoner, reoler og hylder (Zone-Reol-Hylde) og de særlige zoner.', eksempler: ['hvilke pladser er der i zone A', 'hvad står i karantæne-zonen'] },
  { navn: 'lager_ansvarlig_pluk', titel: 'Lageransvarlig: plukliste', op: 'GET /ansvarlig/pluk',
    beskrivelse: 'Bookinger, der skal stå klar ved døren den dag (standard i dag). Sæt dem klar med lager_booking_status.',
    kort: 'Lageransvarlig: dagens plukliste af bookinger.', eksempler: ['hvad skal plukkes i dag', 'plukliste til i morgen'] },
  { navn: 'lager_ansvarlig_optaellinger', titel: 'Lageransvarlig: optællinger', op: 'GET /ansvarlig/optaelling',
    medId: { felt: 'optaellingId', op: 'GET /ansvarlig/optaelling/{id}' }, alias: { id: 'optaellingId' },
    beskrivelse: 'Uden optaellingId: lagerets optællinger, nyeste først. Med optaellingId: status med scannede linjer, udfald (fundet, forkert_plads, ude, savnes, uventet, ukendt), afvigelser og om den kan lukkes.',
    kort: 'Lageransvarlig: optællinger, eller én optællings status og afvigelser.', eksempler: ['hvordan står optællingen', 'hvad mangler i optællingen af reol B'] },

  // ---------------------------------------------------------------- skriv: brugeren
  { navn: 'lager_tjek_ud', titel: 'Tag værktøj med ud', op: 'POST /tjek-ud', skjul: ['fotoId'],
    beskrivelse: 'Udlevering til et projekt. Står et emne hos en kollega, kræver det overtag: true på linjen. retur: i_dag | i_morgen | om_14_dage | ingen | ÅÅÅÅ-MM-DD.',
    kort: 'Tag værktøj med ud til et projekt (koder = tags).', eksempler: ['tag T-00012 og T-00013 med til sag 2602'] },
  { navn: 'lager_aflever', titel: 'Aflevér værktøj', op: 'POST /aflever', skjul: ['linjer.fotoId'],
    beskrivelse: 'Retur til lageret; svaret siger hvor det skal stå. Skadet kræver en note. For et sæt: dele = de dele, der er med (se lager_saet); udelades, følger alle sættets dele med.',
    kort: 'Aflevér værktøj; svaret siger hvor det skal stå.', eksempler: ['aflever T-00012', 'aflever kassen T-00031 uden boret'] },
  { navn: 'lager_flyt_projekt', titel: 'Flyt til andet projekt', op: 'POST /flyt',
    beskrivelse: 'Udlejet værktøj flyttes til et andet projekt uden om lageret: custody uændret, lejen skifter projekt fra i dag. Egne emner; som lageransvarlig på lagerId alt på lageret.',
    kort: 'Flyt udlejet værktøj til et andet projekt uden om lageret.', eksempler: ['flyt alt mit fra Nørrebro til Valby'] },
  { navn: 'lager_forbrug', titel: 'Køb forbrugsvarer', op: 'POST /forbrug',
    beskrivelse: 'Udtag til projektet med dagens salgspris; en linje med bestil: true bestilles via indkøb og koster først ved afhentning.',
    kort: 'Køb forbrugsvarer til projektet; udsolgt bestilles via indkøb.', eksempler: ['tag 2 diamantklinger til sag 2602'] },
  { navn: 'lager_bestil', titel: 'Bestil via indkøb', op: 'POST /bestillinger',
    beskrivelse: 'Bestil forbrugsvarer, der er udsolgt. Klar efter typisk 2 til 3 dage; besked i appen.',
    kort: 'Bestil forbrugsvarer via indkøb; koster først ved afhentning.', eksempler: ['bestil 10 partikelfiltre til sag 2588'] },
  { navn: 'lager_bestilling_hent', titel: 'Afhent bestilling', op: 'POST /bestillinger/{id}/hent', alias: { id: 'bestillingId' },
    beskrivelse: 'Udtaget koster på sagen; beholdningen er ikke rørt.',
    kort: 'Afhent en klar bestilling: udtaget koster på sagen.', eksempler: ['jeg henter bestilling 17'] },
  { navn: 'lager_bestilling_fortryd', titel: 'Fortryd bestilling', op: 'DELETE /bestillinger/{id}', alias: { id: 'bestillingId' },
    beskrivelse: 'Indtil varen er klar. Den lageransvarlige kan altid (en klar vare går i beholdningen).',
    kort: 'Fortryd en bestilling, indtil den er klar.', eksempler: ['fortryd bestilling 17'] },
  { navn: 'lager_book', titel: 'Book værktøj', op: 'POST /bookinger',
    beskrivelse: 'Book en kategori, en model eller én bestemt enhed (tag) til et projekt i en periode. Se lager_tilgaengelighed først; en booking ud over det ledige afvises.',
    kort: 'Book værktøj til et projekt i en periode.', eksempler: ['book 2 borehammere til sag 2602 fra mandag til fredag'] },
  { navn: 'lager_booking_status', titel: 'Skift status på booking', op: 'PATCH /bookinger/{id}', alias: { id: 'bookingId' },
    beskrivelse: 'annulleret: din egen booking (eller som lageransvarlig). klar/aaben: den lageransvarliges plukliste. «udleveret» sættes kun af en udlevering.',
    kort: 'Annullér en booking, eller sæt den klar på pluklisten.', eksempler: ['annullér booking 41', 'booking 41 står klar'] },

  // ---------------------------------------------------------------- skriv: lageransvarlig
  { navn: 'lager_ansvarlig_modtag_levering', titel: 'Lageransvarlig: modtag levering', op: 'POST /ansvarlig/forbrugsvarer/modtag',
    beskrivelse: 'Bilag og linjer pr. vare (forbrugsvareId, eller ny: { navn, gruppe: forbrug|vaerne|arbtoj|vaerktoej }); en kostpris på linjen bliver dagens pris. Bestilte varer lægges til side til dem, der venter.',
    kort: 'Lageransvarlig: modtag en levering; bestilte varer lægges til side til dem, der venter.', eksempler: ['modtag 10 filtre på faktura FA541127'] },
  { navn: 'lager_ansvarlig_saet_paa_plads', titel: 'Lageransvarlig: sæt på plads', op: 'POST /ansvarlig/intern',
    alias: { linjer: 'koder' }, skjul: ['sted'], fast: { slags: 'flyt', begrundelse: 'Sat på plads via MCP' }, kraev: ['plads'],
    beskrivelse: 'Giver enhederne pladsen som hjemmeplads (lagerarbejde uden beregning). Afvises, hvis reglerne siger nej (asbest, karantæne).',
    kort: 'Lageransvarlig: sæt enheder på en plads (hjemmeplads), fx A-12-3; reglerne for asbest og karantæne gælder.', eksempler: ['sæt T-00012 på A-12-3'],
    beskriv: { plads: 'Pladsens kode, fx A-12-3 eller ASB-O.' } },
  { navn: 'lager_ansvarlig_send_bestillingsliste', titel: 'Lageransvarlig: send bestillingsliste', op: 'POST /ansvarlig/bestillinger/send',
    beskrivelse: 'Listen for én leverandør til indkøb: åbne bestillinger bliver «sendt», varer under minimum får en bestilling til lager. Svaret er teksten til indkøb.',
    kort: 'Lageransvarlig: send bestillingslisten for én leverandør til indkøb.', eksempler: ['send listen til STARK'] },
  { navn: 'lager_ansvarlig_afklar_ukendt', titel: 'Lageransvarlig: afklar ukendt mærke', op: 'POST /ansvarlig/ukendte/{id}', alias: { id: 'ukendtId' },
    beskrivelse: 'Et ukendt mærke fra køen (lager_ansvarlig_koe): tag = den enhed, det var (bevægelsen bogføres på den); tag: null afviser det.',
    kort: 'Lageransvarlig: afklar et ukendt mærke fra køen.', eksempler: ['det ukendte mærke 5 var T-00012'] },
  { navn: 'lager_ansvarlig_optaelling_start', titel: 'Lageransvarlig: start optælling', op: 'POST /ansvarlig/optaelling',
    beskrivelse: 'Start en optælling af et område (fx «Reol B» eller «A-12») eller hele lageret. Én åben pr. lager.',
    kort: 'Lageransvarlig: start en optælling af en reol eller hele lageret.', eksempler: ['start en optælling af reol A-12'] },
  { navn: 'lager_ansvarlig_optaelling_scan', titel: 'Lageransvarlig: scan til optælling', op: 'POST /ansvarlig/optaelling/{id}/scan', alias: { id: 'optaellingId' },
    beskrivelse: 'Registrér et eller flere mærker som fundet i optællingen, evt. med pladsen, de stod på. Samme kode igen opdaterer linjen. Svaret giver udfaldet pr. kode.',
    kort: 'Lageransvarlig: registrér scannede mærker i en optælling.', eksempler: ['T-00012, T-00013 og T-00020 står på A-12-3'],
    ekstra: {
      kode: z.string().min(1).optional().describe('Ét mærke (tag) eller serienummer.'),
      koder: z.array(z.string().min(1)).min(1).optional().describe('Flere mærker på én gang, fx alt på én hylde.'),
    },
    kald: async (send, i) => {
      const koder = [...(Array.isArray(i.koder) ? (i.koder as string[]) : []), ...(typeof i.kode === 'string' ? [i.kode] : [])];
      if (koder.length === 0) throw new Error('Angiv kode eller koder.');
      const linjer: unknown[] = [];
      for (const kode of koder) {
        try {
          linjer.push(await send('POST /ansvarlig/optaelling/{id}/scan', { ...i, kode }));
        } catch (e) {
          linjer.push({ kode, fejl: e instanceof Error ? e.message : String(e) });
        }
      }
      return { scannet: linjer };
    } },
  { navn: 'lager_ansvarlig_optaelling_goer_op', titel: 'Lageransvarlig: gør optællingen op', op: 'POST /ansvarlig/optaelling/{id}/goer-op', alias: { id: 'optaellingId' },
    beskrivelse: 'Når reolen er talt: det, der ikke blev scannet, bliver «savnes»-linjer. Svaret er status med de afvigelser, der skal afgøres.',
    kort: 'Lageransvarlig: gør en optælling op; det uscannede bliver «savnes».', eksempler: ['gør optællingen op'] },
  { navn: 'lager_ansvarlig_optaelling_afgoer', titel: 'Lageransvarlig: afgør afvigelse', op: 'POST /ansvarlig/optaelling/{id}/afgoer', alias: { id: 'optaellingId' },
    // Kassation, at give en enhed til en person og at oprette en enhed er menneskets afgørelse i appen.
    begraens: { 'afgoerelse.slags': ['savnet', 'ikke_vores', 'plads_flyttet', 'ok'] },
    skjul: ['afgoerelse.personId', 'afgoerelse.projektId', 'afgoerelse.note', 'afgoerelse.modelId'], destruktiv: true,
    beskrivelse: 'Afgør én afvigelse (linjeId fra status): savnet | ikke_vores | plads_flyttet | ok. Kassation, «hos en person» og «opret enhed» afgøres i appen. Udføres først, når optællingen lukkes.',
    kort: 'Lageransvarlig: afgør en afvigelse i en optælling.', eksempler: ['T-00020 er savnet', 'T-00031 står det rigtige sted nu'] },
  { navn: 'lager_ansvarlig_optaelling_luk', titel: 'Lageransvarlig: luk optælling', op: 'POST /ansvarlig/optaelling/{id}/luk', alias: { id: 'optaellingId' }, destruktiv: true,
    beskrivelse: 'Luk optællingen og udfør afgørelserne. Kræver at alle afvigelser har et svar. Bekræft med brugeren først.',
    kort: 'Lageransvarlig: luk en optælling og udfør afgørelserne.', eksempler: ['luk optællingen'] },
  { navn: 'lager_ansvarlig_ny_zone', titel: 'Lageransvarlig: ny zone', op: 'POST /ansvarlig/pladser/zoner',
    beskrivelse: 'Opret en zone (fx code «B», navn «Hal B»). slags udelades for almindelig opbevaring.',
    kort: 'Lageransvarlig: opret en zone.', eksempler: ['opret zone C for containeren'] },
  { navn: 'lager_ansvarlig_ny_reol', titel: 'Lageransvarlig: ny reol', op: 'POST /ansvarlig/pladser/reoler',
    beskrivelse: 'Opret en reol med hylder i en zone: zone A, reol 12, hylder 4 giver A-12-1 … A-12-4.',
    kort: 'Lageransvarlig: opret en reol med hylder (A-12-1 … A-12-N).', eksempler: ['ny reol 12 i zone A med 5 hylder'] },
  { navn: 'lager_ansvarlig_ret_model', titel: 'Lageransvarlig: ret model', op: 'PUT /ansvarlig/modeller/{id}', alias: { id: 'modelId' },
    beskrivelse: 'Ret en models stamdata, værnemidler og produktside. Kun de felter, der sendes, ændres. Priser rettes i appen.',
    kort: 'Lageransvarlig: ret en models stamdata, værnemidler og produktside.', eksempler: ['model 12 kræver høreværn og briller', 'sæt eftersynsinterval på model 12 til 12 måneder'] },
  { navn: 'lager_ansvarlig_ret_enhed', titel: 'Lageransvarlig: ret enhed', op: 'PUT /ansvarlig/enheder/{tag}',
    // Købspris går på afregningsarket, og model bestemmer prisen: økonomien rettes i appen.
    skjul: ['koebspris', 'modelId'], nullbar: ['serienummer', 'koebsdato', 'leverandoer', 'bilag', 'note', 'plads'],
    beskrivelse: 'Ret en enheds stamdata (serienummer, købsdato, leverandør, bilag, note, hjemmeplads, asbest). null sletter et felt. Model og købspris rettes i appen.',
    kort: 'Lageransvarlig: ret en enheds stamdata.', eksempler: ['T-00012 har serienummer 4711', 'T-00012 står på A-12-3'] },
  { navn: 'lager_ansvarlig_saet_tilfoej_del', titel: 'Lageransvarlig: læg del i sæt', op: 'POST /ansvarlig/saet/{tag}/dele',
    beskrivelse: 'Gør en enhed (kode) til del af sættet med mærket tag.',
    kort: 'Lageransvarlig: læg en enhed i et sæt.', eksempler: ['læg T-00040 i kassen T-00031'],
    beskriv: { tag: 'Sættets mærke (kassen).', kode: 'Delens mærke.' } },
  { navn: 'lager_ansvarlig_saet_fjern_del', titel: 'Lageransvarlig: tag del ud af sæt', op: 'DELETE /ansvarlig/saet/{tag}/dele/{del}',
    beskrivelse: 'Delen bliver en almindelig enhed.',
    kort: 'Lageransvarlig: tag en del ud af et sæt.', eksempler: ['tag T-00040 ud af kassen T-00031'],
    beskriv: { tag: 'Sættets mærke (kassen).', del: 'Delens mærke.' } },
  { navn: 'lager_ansvarlig_saet_pakkeliste', titel: 'Lageransvarlig: sæt pakkeliste', op: 'PUT /ansvarlig/modeller/{id}/pakkeliste', alias: { id: 'modelId' },
    beskrivelse: 'Erstat pakkelisten for en sætmodel: linjer med delModelId eller fritekst og antal.',
    kort: 'Lageransvarlig: sæt pakkelisten for en sætmodel.', eksempler: ['borekassen skal have 1 borehammer og 1 sæt bor'] },
];
