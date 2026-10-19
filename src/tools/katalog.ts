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
  lokationId: 'Lokationens id i lokationstræet (se lager_lokationer, lager_lokation_kode eller lager_hvor_er).',
  enhedId: 'IoT-enhedens id (se lager_iot_enheder).',
  fra: 'ÅÅÅÅ-MM-DD',
  til: 'ÅÅÅÅ-MM-DD',
  dato: 'ÅÅÅÅ-MM-DD',
};

export const FAELLES_ALIAS: Record<string, string> = { lager: 'lagerId', projekt: 'projektId', model: 'modelId', lokation: 'lokationId' };

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
  'GET /branding': 'Installationens navn, logo og farver til appen; intet for en agent.',
  'GET /me/mails': 'Mailvalg er personens eget valg i appen (altid opt-in).',
  'PUT /me/mails': 'Mailvalg er personens eget valg i appen (altid opt-in).',
  'GET /ansvarlig/etiketter/lokationer': 'En PDF eller PNG til printeren; hører til appen.',
  'GET /ansvarlig/etiketter/skabeloner': 'Etiketskabeloner og printere hører til appen ved printeren.',
  'POST /ansvarlig/etiketter/print': 'Print sker ved printeren fra appen, ikke fra en agent.',
  'POST /ansvarlig/lokationer/batch': 'Editorens gem: alt eller intet med en version pr. lokation; enkeltrettelser har deres egne værktøjer.',
  'POST /iot/enheder': 'At mappe en Home Assistant-entitet til en lokation er installationens opsætning i appen.',
  'PUT /iot/enheder/{id}': 'At mappe en Home Assistant-entitet til en lokation er installationens opsætning i appen.',
  'DELETE /iot/enheder/{id}': 'At fjerne en IoT-enhed er installationens opsætning i appen.',
  'GET /ansvarlig/vedligehold/forfald': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'GET /ansvarlig/vedligehold/log': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'POST /ansvarlig/vedligehold/log': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'GET /ansvarlig/vedligehold/opgaver': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'POST /ansvarlig/vedligehold/opgaver': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'GET /ansvarlig/vedligehold/opgaver/{id}': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'PUT /ansvarlig/vedligehold/opgaver/{id}': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'DELETE /ansvarlig/vedligehold/opgaver/{id}': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'GET /ansvarlig/vedligehold/typer': 'Vedligehold får egne værktøjer i en senere runde; indtil da i appen.',
  'POST /ansvarlig/vedligehold/typer': 'Opgavetyper er installationens opsætning i appen.',
  'PUT /ansvarlig/vedligehold/typer/{id}': 'Opgavetyper er installationens opsætning i appen.',
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

  // ---------------------------------------------------------------- læs: lokationstræet, evner og IoT
  // Navnene er kortets operationId, hvor det har ét (test/openapi.test.ts holder dem i takt).
  { navn: 'lager_lokationer', titel: 'Lokationstræet', op: 'GET /lokationer', skjul: ['plan'],
    beskrivelse: 'Lagerets lokationer (sted, bygning, rum, reol, hylde, bin …) som en flad liste, forælder før børn, med sti, geometri og antal. rod (id eller kode) og dybde afgrænser; evne giver kun lokationer, hvor evnen gælder (fx opladning).',
    kort: 'Lokationstræet: rum, reoler, hylder og bins med sti og antal.', eksempler: ['hvilke reoler er der i hal B', 'hvor kan der lades batterier'] },
  { navn: 'lager_lokation', titel: 'En lokation', op: 'GET /lokationer/{id}', alias: { id: 'lokationId' },
    beskrivelse: 'Én lokation med sti, effektive mål, børn og indhold (enheder; en fast plads\' tilstand). rekursivt: enhederne i hele undertræet.',
    kort: 'En lokation med sti, mål, børn og indhold.', eksempler: ['hvad står på reol 12', 'hvad er der i skabet i værkstedet'] },
  { navn: 'lager_lokation_kode', titel: 'Slå en lokationskode op', op: 'GET /lokationer/kode/{kode}',
    beskrivelse: 'Lokationens etiket: koden (eller /p/<kode>-adressen fra QR-koden) slået op som lokation, med sti og indhold.',
    kort: 'Slå en lokations kode (etiketten) op: sti og indhold.', eksempler: ['hvad er B-03', 'hvad står i bin K-17'],
    beskriv: { kode: 'Lokationens kode, fx B-03, eller /p/<kode>-adressen fra etiketten.' } },
  { navn: 'lager_hvor_er', titel: 'Hvor er', op: 'GET /lokationer/soeg',
    beskrivelse: 'Hvor er X: et mærke, serienummer, en model eller fri tekst giver enheder med hjemmepladsens fulde sti og tilstand, og lokationer med kode eller navn. Alle ord skal passe.',
    kort: 'Hvor er X: enheder og lokationer med fuld sti.', eksempler: ['hvor er borehammeren', 'hvor står T-00012', 'hvor er værkstedet'],
    beskriv: { q: 'Det, der søges efter: mærke, serienummer, model eller fri tekst.' } },
  { navn: 'lager_belaegning', titel: 'Belægning', op: 'GET /lokationer/belaegning',
    beskrivelse: 'Pr. lokation, der kan bære enheder: antal, kapacitet, fyldgrad og tomme faste pladser, med en sum. rod (id eller kode) afgrænser til et undertræ.',
    kort: 'Belægning: fyldgrad og tomme pladser pr. lokation.', eksempler: ['hvor er der plads', 'hvor fuld er reol 12'] },
  { navn: 'lager_lokationstyper', titel: 'Lokationstyper', op: 'GET /lokationer/typer',
    beskrivelse: 'Typereglerne: hvem må være barn af hvem, og hvilke typer kan være en enheds plads. Med foraelder: forslag til koder for hver type, der må ligge dér. Brug den før lager_ansvarlig_lokation_opret.',
    kort: 'Lokationstyper: hvad må ligge i hvad, og kodeforslag.', eksempler: ['kan en bin ligge direkte i en reol', 'hvilken kode får en ny hylde i reol 12'] },
  { navn: 'lager_lokation_evner', titel: 'Lokationens evner', op: 'GET /lokationer/{id}/evner', alias: { id: 'lokationId' },
    beskrivelse: 'Lokationens evner (opladning, udsugning, strøm …): egne og arvede, med hvor de kommer fra. Med modelId: om modellens krav er opfyldt dér.',
    kort: 'En lokations evner, og om en models krav er opfyldt dér.', eksempler: ['kan batterierne lades på hylde A-12-3', 'har værkstedet udsugning'] },
  { navn: 'lager_evnetyper', titel: 'Evnetyper', op: 'GET /evnetyper',
    beskrivelse: 'Evnetyperne (opladning, udsugning, strøm …) med parametrenes skema: installationens og lagrenes egne.',
    kort: 'Evnetyperne og deres parametre.', eksempler: ['hvilke evner kan en lokation have'] },
  { navn: 'lager_ansvarlig_model_krav', titel: 'Lageransvarlig: modellens krav', op: 'GET /ansvarlig/modeller/{id}/krav', alias: { id: 'modelId' },
    beskrivelse: 'Modellens krav til evner, hårde og bløde (fx lades: batterisystem X; kræver udsugning).',
    kort: 'Lageransvarlig: en models krav til lokationens evner.', eksempler: ['hvad kræver model 12 af sin plads'] },
  { navn: 'lager_iot_enheder', titel: 'IoT-enheder', op: 'GET /iot/enheder',
    medId: { felt: 'enhedId', op: 'GET /iot/enheder/{id}' }, alias: { id: 'enhedId' },
    beskrivelse: 'Følere, kontakter, lys og ventilatorer på lokationerne (fra Home Assistant). Uden enhedId: dem på dine lagre, evt. under lokationId; med enhedId: den ene. Den lageransvarlige ser også forbindelsens status.',
    kort: 'IoT-enheder (følere, kontakter) på lokationerne.', eksempler: ['hvilke følere er der i containeren', 'er ventilatoren i skuret online'] },
  { navn: 'lager_iot_maalinger', titel: 'Målinger på en lokation', op: 'GET /iot/lokationer/{id}/maalinger', alias: { id: 'lokationId' },
    beskrivelse: 'Målingerne for alle enheder på lokationen og under den, rå eller pr. time/døgn (min, maks, middel), og dugpunktet af de indendørs følere. fra/til er ISO 8601.',
    kort: 'Målinger (temperatur, fugt …) for en lokation over tid.', eksempler: ['temperaturen i containeren den sidste uge', 'fugt i skuret i nat'],
    beskriv: { fra: 'ISO 8601, fx 2026-10-12T00:00:00Z', til: 'ISO 8601, standard nu' } },
  { navn: 'lager_iot_enhed_maalinger', titel: 'Målinger fra én IoT-enhed', op: 'GET /iot/enheder/{id}/maalinger', alias: { id: 'enhedId' },
    beskrivelse: 'Én enheds målinger, rå eller pr. time/døgn (min, maks, middel). fra/til er ISO 8601.',
    kort: 'Målinger fra én føler over tid.', eksempler: ['hvad har føler 4 målt i dag'],
    beskriv: { fra: 'ISO 8601, fx 2026-10-12T00:00:00Z', til: 'ISO 8601, standard nu' } },
  { navn: 'lager_dugpunkt', titel: 'Klimaet nu og dugpunkt', op: 'GET /iot/lokationer/{id}/dugpunkt', alias: { id: 'lokationId' },
    beskrivelse: 'Klimaet nu på lokationen: temperatur, fugt og dugpunkt inde og ude. null, når en føler ikke har meldt både temperatur og fugt inden for en time.',
    kort: 'Klimaet nu: temperatur, fugt og dugpunkt inde og ude.', eksempler: ['er der risiko for kondens i containeren', 'hvad er dugpunktet i skuret'] },

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

  // ---------------------------------------------------------------- skriv: lokationstræet, evner og IoT
  { navn: 'lager_ansvarlig_lokation_opret', titel: 'Lageransvarlig: ny lokation', op: 'POST /ansvarlig/lokationer',
    // Planlagte lokationer (scenarier) får egne værktøjer; her kun den rigtige verden.
    skjul: ['planId'],
    beskrivelse: 'Opret en lokation (rum, reol, hylde, bin …) under parentId; uden parentId under lagerets standardrod, parentId: null er et nyt sted. Typen skal kunne ligge i forælderen (se lager_lokationstyper), og koden skal være ledig. Et rum med bredde og dybde får sine fire vægge.',
    kort: 'Lageransvarlig: opret en lokation i træet.', eksempler: ['opret en reol R-12 i værkstedet', 'ny hylde i reol 12'] },
  { navn: 'lager_ansvarlig_lokation_ret', titel: 'Lageransvarlig: ret lokation', op: 'PATCH /ansvarlig/lokationer/{id}', alias: { id: 'lokationId' },
    beskrivelse: 'Ret navn, kode, type, geometri, egenskaber, kapacitet og fast plads. Kun felterne, der er med, ændres; null nulstiller. version (fra lager_lokation) afviser en rettelse oven i en andens.',
    kort: 'Lageransvarlig: ret en lokations navn, kode, mål eller kapacitet.', eksempler: ['reol 12 hedder nu Elværktøj', 'hylde A-12-3 kan rumme 6'] },
  { navn: 'lager_ansvarlig_lokation_flyt', titel: 'Lageransvarlig: flyt lokation', op: 'POST /ansvarlig/lokationer/{id}/flyt', alias: { id: 'lokationId' },
    beskrivelse: 'Flyt en lokation med alt under den til en ny forælder på samme lager (aldrig ind under sig selv). En beholder tager enhedens hjemmeplads og sættets dele med.',
    kort: 'Lageransvarlig: flyt en lokation med alt under den.', eksempler: ['flyt reol 12 til hal B', 'flyt kassen ind i skabet'],
    beskriv: { parentId: 'Den nye forælders id; null gør lokationen til en rod (et sted).' } },
  { navn: 'lager_ansvarlig_lokation_nedlaeg', titel: 'Lageransvarlig: nedlæg lokation', op: 'POST /ansvarlig/lokationer/{id}/nedlaeg', alias: { id: 'lokationId' }, destruktiv: true,
    beskrivelse: 'Nedlæg en lokation; koden frigives. Den skal være tom, eller indholdet flyttes til flytIndholdTil. Bekræft med brugeren først.',
    kort: 'Lageransvarlig: nedlæg en tom lokation, evt. med indholdet flyttet.', eksempler: ['nedlæg reol 9 og flyt indholdet til reol 12'] },
  { navn: 'lager_ansvarlig_lokation_evne_saet', titel: 'Lageransvarlig: sæt evne på lokation', op: 'PUT /ansvarlig/lokationer/{id}/evner/{noegle}', alias: { id: 'lokationId' },
    beskrivelse: 'Sæt lokationens egen evne (noegle fra lager_evnetyper). parametre flettes ind i de arvede (null fjerner et arvet felt); fravalgt: true fjerner en arvet evne her og under.',
    kort: 'Lageransvarlig: giv en lokation en evne (fx opladning), eller fravælg en arvet.', eksempler: ['hylde A-12-3 kan lade batterisystem X', 'der er ikke strøm i containeren'],
    beskriv: { noegle: 'Evnetypens nøgle, fx opladning (se lager_evnetyper).' } },
  { navn: 'lager_ansvarlig_lokation_evne_fjern', titel: 'Lageransvarlig: fjern evne fra lokation', op: 'DELETE /ansvarlig/lokationer/{id}/evner/{noegle}', alias: { id: 'lokationId' },
    beskrivelse: 'Fjern lokationens egen evne (eller fravalg); det arvede gælder så igen.',
    kort: 'Lageransvarlig: fjern en lokations egen evne.', eksempler: ['fjern opladning fra hylde A-12-3'],
    beskriv: { noegle: 'Evnetypens nøgle, fx opladning.' } },
  { navn: 'lager_ansvarlig_evnetype_opret', titel: 'Lageransvarlig: ny evnetype', op: 'POST /ansvarlig/evnetyper',
    beskrivelse: 'Ny evnetype med nøgle, navn og parametrenes skema. Med lagerId lagerets egen; lagerId: null er hele installationens (kræver lageransvarlig på alle lagre).',
    kort: 'Lageransvarlig: opret en evnetype.', eksempler: ['opret evnen trykluft'] },
  { navn: 'lager_ansvarlig_evnetype_ret', titel: 'Lageransvarlig: ret evnetype', op: 'PATCH /ansvarlig/evnetyper/{id}', alias: { id: 'evnetypeId' },
    beskrivelse: 'Ret navn, beskrivelse, skema eller arv, eller slå typen fra (aktiv: false). Et nyt skema skal passe til det, der allerede er sat.',
    kort: 'Lageransvarlig: ret eller slå en evnetype fra.', eksempler: ['trykluft arves ikke'],
    beskriv: { evnetypeId: 'Evnetypens id (se lager_evnetyper).' } },
  { navn: 'lager_ansvarlig_model_krav_saet', titel: 'Lageransvarlig: sæt modellens krav', op: 'PUT /ansvarlig/modeller/{id}/krav', alias: { id: 'modelId' },
    beskrivelse: 'Erstat hele modellens kravliste (kun installationens evnetyper). Et hårdt krav må ikke brydes; et blødt er en anbefaling.',
    kort: 'Lageransvarlig: sæt en models krav til evner.', eksempler: ['model 12 skal lades på batterisystem X', 'model 30 kræver udsugning'] },
  { navn: 'lager_ansvarlig_iot_skift', titel: 'Lageransvarlig: tænd eller sluk', op: 'POST /iot/enheder/{id}/skift', alias: { id: 'enhedId' },
    beskrivelse: 'Tænd eller sluk en kontakt, et lys eller en ventilator gennem Home Assistant. Står i revisionsloggen. 503 uden forbindelse, 502 når Home Assistant afviser.',
    kort: 'Lageransvarlig: tænd eller sluk en kontakt, et lys eller en ventilator.', eksempler: ['tænd affugteren i containeren', 'sluk lyset i skuret'] },
];
