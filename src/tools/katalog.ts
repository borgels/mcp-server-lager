/**
 * Værktøjskataloget: navn, titel, beskrivelse og eksempler er håndplukket, så en
 * LLM kan finde og forstå dem. Parametre, typer, påkrævede felter og moduler
 * kommer fra lager-API'ets OpenAPI (openapi/lager.json) via `op`. test/openapi.test.ts
 * holder kataloget og kortet i takt: hver op findes, og hver operation i kortet har
 * et værktøj eller en grund til at mangle ét (UDEN_VAERKTOEJ).
 */
import { z } from 'zod/v4';
import type { LagerClient } from '../lager/client.js';
import { udenVaerktoejIKortet, type OpNoegle } from '../openapi/spec.js';

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
  /** API-felter, værktøjet ikke viser; «linjer.fotoId» rammer feltet på hver linje, «start.hvem.asbest» et felt længere nede. */
  skjul?: string[];
  /**
   * API-felter (stier som i skjul), der står i skemaet, men altid afvises med beskeden:
   * forældede felter, der ellers ville blive skrællet af i stilhed (fx hvem.asbest → alle).
   */
  forbyd?: Record<string, string>;
  /** Faste værdier i kroppen, som værktøjet ikke viser. */
  fast?: Record<string, unknown>;
  /** Indskrænk et felts enum-værdier, fx «afgoerelse.slags»: resten er appens. */
  begraens?: Record<string, string[]>;
  /** Felter, der også tager null (API'et: «null sletter et felt»). */
  nullbar?: string[];
  /** Markér værktøjet som destruktivt (destructiveHint), ud over DELETE. */
  destruktiv?: boolean;
  /**
   * Kassering, fejlregistrering, sletning, annullering og andet, der ikke kan fortrydes:
   * værktøjet kræver bekraeftet: true (brugerens udtrykkelige ja) og er destruktivt.
   * Feltet sendes ikke til lageret (bygger.ts, BEKRAEFTET). En funktion: kun når den siger ja
   * for kaldet (fx en afgørelse «savnet»); feltet er så valgfrit i skemaet og tjekkes ved kaldet.
   */
  bekraeftes?: boolean | ((input: Input) => boolean);
  /** openWorldHint: værktøjet rækker ud i den fysiske verden (fx Home Assistant), ikke kun lagerets data. */
  aabenVerden?: boolean;
  /** idempotentHint, når metoden ikke siger det: PUT, PATCH og DELETE er idempotente, POST ikke. */
  idempotent?: boolean;
  /** En POST, der kun læser (fx et forslag, der intet skriver): readOnlyHint, og ikke bag skrive-flaget. */
  laesende?: boolean;
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
  scenarieId: 'Scenariets id (se lager_scenarier).',
  tingId: 'Den planlagte tings id (se scenario_hent).',
  forbrugsvareId: 'Forbrugsvarens id (se lager_forbrugsvarer eller lager_ansvarlig_forbrugsvarer).',
  skabelonId: 'Skabelonens id eller nøgle (se lager_skabeloner).',
  kategoriskabelonId: 'Kategoriskabelonens id (se lager_kategoriskabeloner).',
  alarmId: 'Alarmens id (se lager_iot_alarmer).',
  alarmregelId: 'Alarmreglens id (se lager_iot_alarmregler).',
  placeringsregelId: 'Placeringsreglens id (se lager_placeringsregler).',
  procesflowId: 'Procesflowets id (se lager_procesflows).',
  forloebId: 'Forløbets id (se lager_procesforloeb).',
  udlaanId: 'Udlånets id (se lager_udlaan).',
  kanbanId: 'Kortets række-id (feltet id) fra lager_ansvarlig_kanban. Etikettens kode KB-… er de første 8 tegn af kortets offentlige id og ikke id\'et: find kortet i listen ud fra kode, og skær aldrig KB-… ned til et tal.',
  fra: 'ÅÅÅÅ-MM-DD',
  til: 'ÅÅÅÅ-MM-DD',
  dato: 'ÅÅÅÅ-MM-DD',
};

/** Forældede asbestfelter (#156): de afvises, så et kald aldrig skrælles af i stilhed (hvem: {} = alle). */
const ASBEST = "asbest er forældet; brug maerker: ['asbest'].";
const ASBEST_STANDARD = "asbestStandard er forældet; brug maerker: ['asbest'].";
const HVEM_ASBEST = "hvem.asbest er forældet; brug maerker: ['asbest'] (true) eller udenMaerker: ['asbest'] (false).";

/**
 * Mærkerne på en enhed eller model (#161): maerker erstatter listen, maerkerTilfoej og
 * maerkerFjern retter den. De to måder kan ikke blandes (lageret svarer 422); her afvises
 * det, før noget sendes.
 */
const MAERKER_TEKST = 'Læg mærker til med maerkerTilfoej (de andre bliver, så intet fjernes ved et uheld), og tag dem af med maerkerFjern; maerker ERSTATTER hele listen og bruges kun, når brugeren vil sætte hele listen: læs så først de nuværende mærker, og send den fulde liste. maerker kan ikke kombineres med maerkerTilfoej/maerkerFjern. Fjern kun et mærke efter brugerens udtrykkelige ja. Fjernes et mærke med et værn (retur eller certificering), svarer lageret 409 med fjernes: vis mærkerne, spørg brugeren og send aldrig bekraeft på eget initiativ.';
const MAERKER_BESKRIV: Record<string, string> = {
  maerkerTilfoej: 'Anbefalet til at lægge mærker til: nøglerne fra lager_saermaerker; de andre mærker bliver. Ikke sammen med maerker.',
  maerkerFjern: 'Mærker, der tages af (kun efter brugerens udtrykkelige ja); de andre bliver. Ikke sammen med maerker.',
  maerker: 'ERSTATTER hele listen; udelad det, og brug maerkerTilfoej/maerkerFjern, medmindre brugeren vil sætte hele listen. Ikke sammen med maerkerTilfoej/maerkerFjern.',
  bekraeft: 'Udelad det; ved 409 med fjernes: vis mærkerne, spørg brugeren og send aldrig bekraeft på eget initiativ. Kun true, når brugeren udtrykkeligt har sagt ja til at fjerne netop de mærker.',
};
const kunEnMaerkemaade = (op: OpNoegle) => async (send: Sender, i: Input) => {
  if (i.maerker !== undefined && (i.maerkerTilfoej !== undefined || i.maerkerFjern !== undefined)) {
    throw new Error('maerker kan ikke kombineres med maerkerTilfoej/maerkerFjern: brug maerkerTilfoej/maerkerFjern, eller maerker med hele listen.');
  }
  return send(op, i);
};

/** Kameraer sættes kun op i appen: en IoT-enhed med slags kamera afvises, før noget sendes (lageret afviser også, 403). */
const ikkeKamera = (op: OpNoegle) => async (send: Sender, i: Input) => {
  if (i.slags === 'kamera') throw new Error('Kameraer sættes kun op i lager-appen, ikke gennem MCP.');
  return send(op, i);
};

/** At slå et opsætningsobjekt fra (aktiv: false) kræver brugerens ja; det kan slås til igen. */
const deaktiverer = (i: Input): boolean => i.aktiv === false;
const DEAKTIVER_TEKST = ' aktiv: false slår det fra (det kan slås til igen) og kræver bekraeftet: true efter brugerens udtrykkelige ja.';

export const FAELLES_ALIAS: Record<string, string> = { lager: 'lagerId', projekt: 'projektId', model: 'modelId', lokation: 'lokationId' };

/**
 * Operationer i kortet, der med vilje ikke er et værktøj, med grunden: dem,
 * serveren her tager stilling til. Dem, lageret selv har markeret med
 * `x-mcp: { vaerktoej: false, grund }`, står ikke her (UDEN_VAERKTOEJ_I_KORTET).
 */
export const UDEN_VAERKTOEJ_HER: Partial<Record<OpNoegle, string>> = {
  'POST /auth/link': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/indloes': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/forny': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /auth/log-ud': 'Login med magic link: hører til appen, ikke til en agent.',
  'POST /overtag': 'Overtagelse kræver et foto og hører til telefonen; lager_tjek_ud med overtag: true dækker resten.',
  'GET /bestillinger/{id}': 'lager_bestillinger viser dem alle.',
  'GET /dokumenter/{id}': 'En fil; lager_opslag og lager_model giver dokumenternes adresser.',
  'GET /ansvarlig/etiketter/pladser': 'En PDF til printeren; hører til appen.',
  'GET /ansvarlig/saet/{tag}': 'lager_saet viser indholdet; priserne står på lager_ansvarlig_enheder.',
  'GET /ansvarlig/politik': 'Prispolitikken er appens indstilling.',
  'GET /ansvarlig/moduler': 'lager_me viser modulerne; at slå dem til og fra er appens indstilling.',
  'PUT /ansvarlig/moduler': 'At slå moduler til og fra er appens indstilling.',
  'GET /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'POST /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'DELETE /ansvarlig/adgang': 'Adgangsstyring hører til appen.',
  'GET /branding': 'Installationens navn, logo og farver til appen; intet for en agent.',
  'GET /me/mails': 'Mailvalg er personens eget valg i appen (altid opt-in).',
  'PUT /me/mails': 'Mailvalg er personens eget valg i appen (altid opt-in).',
  'GET /ansvarlig/etiketter/lokationer': 'En PDF eller PNG til printeren; hører til appen.',
  'GET /ansvarlig/etiketter/skabeloner': 'Etiketskabeloner og printere hører til appen ved printeren.',
  'POST /ansvarlig/etiketter/print': 'Print sker ved printeren fra appen, ikke fra en agent.',
  'POST /ansvarlig/lokationer/batch': 'Editorens gem: alt eller intet med en version pr. lokation; enkeltrettelser har deres egne værktøjer.',
  'GET /ansvarlig/eksport': 'Hele installationen som ZIP (binær): en sikkerhedskopi, der hentes i appen.',
  'POST /ansvarlig/eksport/indlaes': 'Indlæsning af en ZIP-eksport i en tom installation: binær upload og installationens opsætning i appen.',
  'POST /ansvarlig/import/csv': 'Masseimport af enheder, modeller eller varer (kræver lageransvarlig på alle lagre): installationens opsætning i appen, med tørkørslen vist linje for linje.',
  'POST /ansvarlig/lokationer/{id}/baggrund': 'Upload af et billede (binær krop) til plantegningens baggrund; hører til appens editor.',
  'GET /foto/{id}': 'En fil (foto eller dokument), ikke JSON; adresserne står i svarene fra de andre værktøjer.',
  'POST /ansvarlig/scenarier/{id}/vedtag': 'Vedtagelsen ændrer det rigtige træ og er et menneskes beslutning i appen: agenten arbejder kun i scenarier (kladder), som den lageransvarlige vedtager.',
  'DELETE /udlaan/{id}/link': 'Lånerens link hører til appen, hvor det laves og deles; en agent rører hverken linket eller dets token.',
  'GET /iot/kameraer/{id}/billede': 'Et stillbillede (binært), ikke JSON, og kun i lager-appen: backenden afviser kald gennem MCP-gatewayen (403).',
  'POST /iot/kameraer/{id}/live': 'En strømbillet til appens afspiller (kun med en session, ikke gennem MCP-gatewayen); intet for en agent.',
  'GET /iot/kameraer/{id}/live/{billet}': 'Live-video (binær strøm bag en billet); intet for en agent.',
  'GET /iot/kameraer/{id}/hls/{billet}': 'En del af en HLS-strøm (binær, bag en billet); intet for en agent.',
  'POST /ansvarlig/ai-indtag': 'Appens indtag med kamera og diktat: billedet går til driftens AI-udbyder. En agent er selv en model, der kan læse fotoet og sætningen, og forslaget gemmes alligevel med de andre værktøjer efter et menneskes ja.',
};

/**
 * Lagerets egne markeringer (x-mcp) i openapi/lager.json. Heriblandt koderne til et
 * lejet rum (POST /lokationer/{id}/lejet/koder og PUT /ansvarlig/lokationer/{id}/lejet/koder,
 * #199): adgangskoden og PIN'en må ALDRIG gå gennem MCP, hverken læst eller skrevet, og
 * backenden afviser gatewayen. Får de engang ikke lagerets markering, skal de stå i
 * UDEN_VAERKTOEJ_HER (test/openapi.test.ts kræver, at de altid er uden værktøj).
 */
export const UDEN_VAERKTOEJ_I_KORTET: Partial<Record<OpNoegle, string>> = udenVaerktoejIKortet();

/** Alle operationer i kortet, der med vilje ikke er et værktøj, med grunden. */
export const UDEN_VAERKTOEJ: Partial<Record<OpNoegle, string>> = { ...UDEN_VAERKTOEJ_I_KORTET, ...UDEN_VAERKTOEJ_HER };

export const KATALOG: ToolSpec[] = [
  // ---------------------------------------------------------------- læs: brugeren
  { navn: 'lager_me', titel: 'Hvem er jeg', op: 'GET /me',
    beskrivelse: 'Person, konto, lagre med roller (vaerktoejsbruger/lageransvarlig), installationens moduler (id → til/fra) og tal pr. lager. Asbest er ikke et modul: det er ét af særhåndteringsmærkerne (lager_saermaerker).',
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
  { navn: 'lager_lokationer', titel: 'Lokationstræet', op: 'GET /lokationer', alias: { plan: 'scenarieId' },
    beskrivelse: 'Lagerets lokationer (sted, bygning, rum, reol, hylde, bin …) som en flad liste, forælder før børn, med sti, geometri og antal. rod (id eller kode) og dybde afgrænser; evne giver kun lokationer, hvor evnen gælder (fx opladning). scenarieId lægger et scenaries planlagte lokationer ovenpå.',
    kort: 'Lokationstræet: rum, reoler, hylder og bins med sti og antal.', eksempler: ['hvilke reoler er der i hal B', 'hvor kan der lades batterier'],
    beskriv: { scenarieId: 'Læg dette scenaries planlagte lokationer oven på det rigtige træ (se lager_scenarier).' } },
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
  { navn: 'lager_lejemaal', titel: 'Lejemålet på et lejet rum', op: 'GET /lokationer/{id}/lejet', alias: { id: 'lokationId' },
    beskrivelse: 'Lejemålet på et depotrum eller en container: udbyder, anlæg, adresse, rum- eller containernummer, plads, adgangsmåder og -tider, kontakt, note og personerne med adgang. Kontrakten (nummer, pris pr. måned, periode, opsigelsesvarsel) kun for den lageransvarlige. lejemaal er null, når intet er skrevet. Koderne (adgangskode, PIN) står aldrig her og kan ikke hentes gennem dette værktøj: harAdgangskode og harPin siger kun, om de findes, og de ses i appen.',
    kort: 'Lejemålet på et depotrum eller en container: udbyder, adgang, kontakt og kontrakt (ingen koder).', eksempler: ['hvem udlejer depotrummet', 'hvornår kan jeg komme ind i containeren', 'hvad koster depotrummet om måneden'] },
  { navn: 'lager_evnetyper', titel: 'Evnetyper', op: 'GET /evnetyper',
    beskrivelse: 'Evnetyperne (opladning, udsugning, strøm …) med parametrenes skema: installationens og lagrenes egne.',
    kort: 'Evnetyperne og deres parametre.', eksempler: ['hvilke evner kan en lokation have'] },
  { navn: 'lager_ansvarlig_model_krav', titel: 'Lageransvarlig: modellens krav', op: 'GET /ansvarlig/modeller/{id}/krav', alias: { id: 'modelId' },
    beskrivelse: 'Modellens krav til evner, hårde og bløde (fx lades: batterisystem X; kræver udsugning).',
    kort: 'Lageransvarlig: en models krav til lokationens evner.', eksempler: ['hvad kræver model 12 af sin plads'] },
  { navn: 'lager_iot_enheder', titel: 'IoT-enheder', op: 'GET /iot/enheder',
    beskrivelse: 'Følere, kontakter, lys og ventilatorer på lokationerne (fra Home Assistant): dem på dine lagre, evt. under lokationId. Den lageransvarlige ser også forbindelsens status.',
    kort: 'IoT-enheder (følere, kontakter) på lokationerne.', eksempler: ['hvilke følere er der i containeren', 'er ventilatoren i skuret online'] },
  { navn: 'lager_iot_enhed', titel: 'Én IoT-enhed', op: 'GET /iot/enheder/{id}', alias: { id: 'enhedId' },
    beskrivelse: 'Én føler, kontakt, lys eller ventilator med lokation, placering i rummet og seneste værdi.',
    kort: 'Én IoT-enhed med lokation og seneste værdi.', eksempler: ['hvad måler føler 4'] },
  { navn: 'lager_iot_lokation_maalinger', titel: 'Målinger på en lokation', op: 'GET /iot/lokationer/{id}/maalinger', alias: { id: 'lokationId' },
    beskrivelse: 'Målingerne for alle enheder på lokationen og under den, rå eller pr. time/døgn (min, maks, middel), og dugpunktet af de indendørs følere. fra/til er ISO 8601.',
    kort: 'Målinger (temperatur, fugt …) for en lokation over tid.', eksempler: ['temperaturen i containeren den sidste uge', 'fugt i skuret i nat'],
    beskriv: { fra: 'ISO 8601, fx 2026-10-12T00:00:00Z', til: 'ISO 8601, standard nu' } },
  { navn: 'lager_iot_enhed_maalinger', titel: 'Målinger fra én IoT-enhed', op: 'GET /iot/enheder/{id}/maalinger', alias: { id: 'enhedId' },
    beskrivelse: 'Én enheds målinger, rå eller pr. time/døgn (min, maks, middel). fra/til er ISO 8601.',
    kort: 'Målinger fra én føler over tid.', eksempler: ['hvad har føler 4 målt i dag'],
    beskriv: { fra: 'ISO 8601, fx 2026-10-12T00:00:00Z', til: 'ISO 8601, standard nu' } },
  { navn: 'lager_iot_lokation_dugpunkt', titel: 'Klimaet nu og dugpunkt', op: 'GET /iot/lokationer/{id}/dugpunkt', alias: { id: 'lokationId' },
    beskrivelse: 'Klimaet nu på lokationen: temperatur, fugt og dugpunkt inde og ude. null, når en føler ikke har meldt både temperatur og fugt inden for en time.',
    kort: 'Klimaet nu: temperatur, fugt og dugpunkt inde og ude.', eksempler: ['er der risiko for kondens i containeren', 'hvad er dugpunktet i skuret'] },
  { navn: 'lager_iot_lokation_klima', titel: 'Klimapanelet', op: 'GET /iot/lokationer/{id}/klima', alias: { id: 'lokationId' },
    beskrivelse: 'Rummet nu inde og ude: hver føler med placering, temperatur, fugt, dugpunkt og batteri, luftkvaliteten (CO₂, VOC, PM, formaldehyd) med niveau og standardgrænser, og lokationens åbne alarmer.',
    kort: 'Klimapanelet: følerne, luftkvaliteten og åbne alarmer i et rum.', eksempler: ['hvordan er luften i værkstedet', 'er CO₂ for høj i kontoret'] },
  { navn: 'lager_iot_lokation_styring', titel: 'Styring på en lokation', op: 'GET /iot/lokationer/{id}/styring', alias: { id: 'lokationId' },
    beskrivelse: 'Lys, ventilationsanlæg og printere på lokationen og under den: tilstand (tændt, hastighed, forvalg, bypass, filteralarm), hvad hver kan styres med (til lager_ansvarlig_iot_styr), printernes status og koblingen mellem printer og udsugning.',
    kort: 'Lys, ventilation og printere på en lokation, og hvad de kan styres med.', eksempler: ['kører ventilationen i værkstedet', 'hvilket forvalg har anlægget'] },
  { navn: 'lager_iot_lokation_automationer', titel: 'Forslag til Home Assistant-automationer', op: 'GET /iot/lokationer/{id}/automationer', alias: { id: 'lokationId' },
    beskrivelse: 'Foreslåede Home Assistant-automationer som YAML: udsugning ved print og dugpunktsstyret ventilation. printer, udsugning og ventilation er IoT-enhedernes id (se lager_iot_lokation_styring). Brugeren sætter dem selv ind i Home Assistant.',
    kort: 'YAML-forslag til udsugning ved print og dugpunktsstyret ventilation.', eksempler: ['lav en automation, der ventilerer skuret, når det er tørt ude'] },
  { navn: 'lager_iot_alarmer', titel: 'Klimaalarmer', op: 'GET /iot/alarmer',
    beskrivelse: 'Klimaalarmerne på dine lagre, de åbne først, evt. under lokationId; aktive: kun åbne.',
    kort: 'Klimaalarmer (fugt, temperatur, offline …), de åbne først.', eksempler: ['er der alarmer i containeren', 'hvilke alarmer er åbne'] },
  { navn: 'lager_iot_alarmregler', titel: 'Alarmregler', op: 'GET /iot/alarmregler',
    beskrivelse: 'Alarmreglerne på dine lagre. Med lokationId: de regler, der gælder dér (på lokationen, under og over den, og på enhederne).',
    kort: 'Alarmreglerne, eller dem der gælder for en lokation.', eksempler: ['hvornår giver containeren alarm for fugt'] },

  // ---------------------------------------------------------------- læs: skabeloner, egenskaber, varer pr. lokation og visninger
  { navn: 'lager_skabeloner', titel: 'Skabelonbiblioteket', op: 'GET /skabeloner', alias: { inaktive: 'inklInaktive' },
    beskrivelse: 'Skabeloner for reoler, skabe, skuffer, bins …: indbyggede (fra producenternes datablade, mærket «verificér»), delte og lagrets egne, med mål og pris_ca. Nøglen eller id\'et bruges i scenario_tilfoej_ting og lager_ansvarlig_lokation_opret.',
    kort: 'Skabelonbiblioteket: reoler, skabe, skuffer og bins med mål.', eksempler: ['hvilke reoler findes der skabeloner for', 'en skuffereol på 60 cm'] },
  { navn: 'lager_skabelon', titel: 'En skabelon', op: 'GET /skabeloner/{id}', alias: { id: 'skabelonId' },
    beskrivelse: 'Én skabelon med mål, egenskaber og børn (hylder, skuffer …).',
    kort: 'Én skabelon med mål og børn.', eksempler: ['hvor mange hylder har skabelonen'] },
  { navn: 'lager_kategoriskabeloner', titel: 'Kategoriskabeloner', op: 'GET /kategoriskabeloner', alias: { inaktive: 'inklInaktive' },
    beskrivelse: 'Kategoriskabelonerne (kabel, adapter, komponent, strømforsyning …) med egenskabernes felter: installationens og lagrenes egne. Felterne bruges i lager_find.',
    kort: 'Kategoriskabeloner og deres egenskabsfelter.', eksempler: ['hvilke egenskaber har et kabel'] },
  { navn: 'lager_find', titel: 'Find på egenskaber', op: 'GET /find',
    beskrivelse: 'Find modeller og forbrugsvarer på egenskaber, fx skabelon: kabel, egenskab: ["stik_a|stik_b=USB-C", "stik_a|stik_b=DisplayPort", "laengde_m>=2"]. Felterne står i lager_kategoriskabeloner. Ingen priser.',
    kort: 'Find modeller og varer på egenskaber (stik, længde, effekt …).', eksempler: ['et kabel fra USB-C til DisplayPort på mindst 2 m', 'en 12 V strømforsyning'] },
  { navn: 'lager_forbrugsvare_beholdninger', titel: 'Hvor er varen', op: 'GET /forbrugsvarer/{id}/beholdninger', alias: { id: 'forbrugsvareId' },
    beskrivelse: 'Varens beholdning pr. lokation med fuld sti, antal eller niveau, og om stedet er lavt.',
    kort: 'Hvor er en forbrugsvare: beholdning pr. lokation.', eksempler: ['hvor ligger kabelbinderne'] },
  { navn: 'lager_ansvarlig_forbrugsvare_beholdninger', titel: 'Lageransvarlig: varens beholdninger', op: 'GET /ansvarlig/forbrugsvarer/{id}/beholdninger', alias: { id: 'forbrugsvareId' },
    beskrivelse: 'Varens beholdning pr. lokation på dine lagre med minimum, maks og bestil ved.',
    kort: 'Lageransvarlig: en vares beholdning og grænser pr. lokation.', eksempler: ['hvor er filtrene under minimum'] },
  { navn: 'lager_lokation_kodeforslag', titel: 'Kodeforslag', op: 'GET /lokationer/kodeforslag',
    beskrivelse: 'Næste ledige kode for en ny lokation af typen under parentId efter lagerets kodeskabelon (se lager_ansvarlig_kodeskabelon).',
    kort: 'Kodeforslag for en ny lokation.', eksempler: ['hvilken kode får en ny reol i hal B'] },
  { navn: 'lager_ansvarlig_kodeskabelon', titel: 'Lageransvarlig: kodeskabelon', op: 'GET /ansvarlig/kodeskabelon',
    beskrivelse: 'Lagerets kodeskabelon: null = frie koder, zone-reol-hylde = koder som A-12-3.',
    kort: 'Lageransvarlig: lagerets kodeskabelon.', eksempler: ['hvordan får nye lokationer deres kode'] },
  { navn: 'lager_lokation_visning', titel: 'Visningen af en lokation', op: 'GET /lokationer/{id}/visning',
    alias: { id: 'lokationId', plan: 'scenarieId' }, skjul: ['format'],
    beskrivelse: 'Scenen i mm: en reol, et skab eller en væg forfra/bagfra, en skuffe eller et rum oppefra, farvet efter belægning. Et rum oppefra er plantegningen med møbler, kollisioner og gange. q fremhæver fund; scenarieId lægger et scenarie ovenpå.',
    kort: 'Plantegning eller reol forfra: geometri, belægning, kollisioner og gange.', eksempler: ['tegn værkstedet oppefra', 'hvor er der gang mellem reolerne'],
    beskriv: { scenarieId: 'Læg dette scenarie ovenpå: planlagte og flyttede lokationer, uden det, der fjernes.' } },
  { navn: 'lager_ansvarlig_forsikring', titel: 'Lageransvarlig: forsikringsopgørelse', op: 'GET /ansvarlig/forsikring', skjul: ['format'],
    beskrivelse: 'Forsikringsopgørelsen for et rum, en bygning, et sted (rod) eller hele lageret: hver enhed med model, fabrikat, serienummer, købsdato og -pris, kvittering og anslået værdi i dag, og totaler pr. rum. Regneark og PDF hentes i appen.',
    kort: 'Lageransvarlig: forsikringsopgørelse med købspris og anslået værdi.', eksempler: ['hvad er værkstedet værd', 'mangler der kvitteringer'] },
  { navn: 'lager_ansvarlig_enhed_dokumenter', titel: 'Lageransvarlig: enhedens bilag', op: 'GET /ansvarlig/enheder/{tag}/dokumenter',
    beskrivelse: 'Enhedens egne bilag: kvittering, garanti, faktura, manual, attest, andet.',
    kort: 'Lageransvarlig: en enheds bilag (kvittering, garanti, manual).', eksempler: ['har T-00012 en kvittering', 'garantibevis for T-00012'] },
  { navn: 'lager_ansvarlig_lokation_dokumenter', titel: 'Lageransvarlig: lokationens dokumenter', op: 'GET /ansvarlig/lokationer/{id}/dokumenter', alias: { id: 'lokationId' },
    beskrivelse: 'Lokationens egne dokumenter, fx på et lejet depotrum eller en container: lejekontrakten, ordensreglerne, udbyderens plan.',
    kort: 'Lageransvarlig: en lokations dokumenter (lejekontrakt, ordensregler).', eksempler: ['har vi lejekontrakten på depotrummet', 'ordensreglerne for containeren'] },
  { navn: 'lager_ansvarlig_personer', titel: 'Lageransvarlig: personvælgeren', op: 'GET /ansvarlig/personer',
    beskrivelse: 'Lagerets personer med id, navn og mail, søgt på navn eller mail (q). Kun aktive personer fra din konto. Id\'et bruges i adgang på lager_ansvarlig_lejemaal_ret.',
    kort: 'Lageransvarlig: find en person på lageret (id, navn, mail).', eksempler: ['find Kim på lageret', 'hvem kan få adgang til depotrummet'] },
  { navn: 'lager_batterier', titel: 'Batterier', op: 'GET /batterier',
    beskrivelse: 'Batterierne på dine lagre: system, plads, seneste opladning, næste forfald og laderens hint, de forsinkede først. status: komma-liste af overskredet, snart, ukendt, ok, uden_interval.',
    kort: 'Batterier: hvornår de sidst er ladet, og hvilke der er forsinkede.', eksempler: ['hvilke batterier skal lades', 'batterier til system X'] },
  { navn: 'lager_batteri', titel: 'Ét batteri', op: 'GET /batterier/{tag}',
    beskrivelse: 'Ét batteri med opladningsloggen og værktøjerne, det passer i. For et værktøj: batterierne, der passer i det.',
    kort: 'Ét batteri med opladningslog, eller batterierne til et værktøj.', eksempler: ['hvornår er T-00055 sidst ladet', 'hvilke batterier passer til T-00012'] },

  // ---------------------------------------------------------------- læs: placeringsregler og procesflows
  { navn: 'lager_placeringsregler', titel: 'Placeringsregler', op: 'GET /placeringsregler',
    beskrivelse: 'Reglerne for, hvad der skal stå hvor (skal_staa), og hvad et sted kun er til (kun), udtrykt som evner på lokationerne: hvem de gælder (særhåndteringsmærker som asbest i hvem.maerker, kategorier), stederne og grunden. Installationens og lagrenes egne, også de indbyggede.',
    kort: 'Placeringsregler: hvad der skal stå hvor, og hvad et sted kun er til.', eksempler: ['hvor skal asbestudstyr stå', 'hvilke regler gælder for proceszonen'] },
  { navn: 'lager_placeringsafvigelser', titel: 'Placeringsafvigelser', op: 'GET /placeringsregler/afvigelser',
    beskrivelse: 'Enheder, der står et sted, reglerne (eller deres forløbs trin) ikke tillader, og enheder, hvis models hårde krav til evner ikke er opfyldt på hjemmepladsen. Kun til at læse; ret med lager_ansvarlig_saet_paa_plads eller i appen.',
    kort: 'Enheder, der står forkert efter placeringsreglerne eller modellens krav.', eksempler: ['står noget forkert', 'er asbestudstyret de rigtige steder'] },
  { navn: 'lager_procesflows', titel: 'Procesflows', op: 'GET /procesflows',
    beskrivelse: 'Procesflowene med trinene (fx karantæne → rengøring → frigivelse): hvornår de starter, hvor enheden skal stå i hvert trin, hvem der udfører det, tjekliste og certificering. Installationens og lagrenes egne.',
    kort: 'Procesflows: trinene fra retur til frigivelse (fx rengøring af asbestudstyr).', eksempler: ['hvordan frigives asbestudstyr', 'hvilke trin har rengøringsflowet'] },
  { navn: 'lager_procesforloeb', titel: 'Procesforløb', op: 'GET /procesforloeb',
    beskrivelse: 'Forløbene på dine lagre (de aktive som standard): enheden, flowet, trinnet nu og de næste. Trinnets nøgle bruges i lager_procesforloeb_udfoer.',
    kort: 'Aktive procesforløb: hvilke enheder er i karantæne eller klargøring, og på hvilket trin.', eksempler: ['hvad venter på rengøring', 'hvor langt er T-00012 i forløbet'] },
  { navn: 'lager_procesforloeb_log', titel: 'Et procesforløb med log', op: 'GET /procesforloeb/{id}', alias: { id: 'forloebId' },
    beskrivelse: 'Ét forløb med loggen: hvert trin med hvem, hvornår, noten, de afkrydsede punkter og certificeringen (dokumentationen, fx til asbest).',
    kort: 'Et procesforløbs log: hvem udførte hvert trin, og hvornår.', eksempler: ['hvem rengjorde T-00012', 'dokumentation for frigivelsen'] },
  { navn: 'lager_saermaerker', titel: 'Særhåndteringsmærker', op: 'GET /saermaerker', alias: { inaktive: 'inklInaktive' },
    beskrivelse: 'Særhåndteringsmærkerne (asbest, bly, PCB …) i rækkefølge: nøgle, navn, værnet ved retur (klargøring, karantæne eller intet), certificeringen ved frigivelse, og installationens placeringsregler og procesflows for hvert. Nøglerne bruges i maerker på enheder, modeller, scenarieting og i reglernes hvem.maerker.',
    kort: 'Særhåndteringsmærker (asbest, bly, PCB …) med regler, flows og certificering.', eksempler: ['hvilke særhåndteringsmærker har vi', 'hvad kræver frigivelse af asbestudstyr'] },

  // ---------------------------------------------------------------- læs: enhedsfelter, forbrugsgrupper og e-conomic
  { navn: 'lager_enhedsfelter', titel: 'Enhedernes feltsæt', op: 'GET /enhedsfelter', alias: { inaktive: 'inklInaktive' },
    beskrivelse: 'Feltsættene for enhedernes egne felter: installationens og lagrenes egne, med felterne. Felterne sættes med lager_ansvarlig_enhed_egenskaber.',
    kort: 'Feltsættene: hvilke egne felter enhederne har.', eksempler: ['hvilke felter kan en enhed have'] },
  { navn: 'lager_forbrugsgrupper', titel: 'Forbrugsgrupper', op: 'GET /forbrugsgrupper', alias: { inaktive: 'inklInaktive' },
    beskrivelse: 'Forbrugsvarernes grupper i rækkefølge (installationens liste) med nøgle, navn, og om de er aktive og fremhævet.',
    kort: 'Forbrugsvarernes grupper.', eksempler: ['hvilke varegrupper er der'] },
  { navn: 'lager_ansvarlig_economic_varer', titel: 'Lageransvarlig: varer i e-conomic', op: 'GET /ansvarlig/economic/varer',
    beskrivelse: 'Hvilken vare i e-conomic leje, salg og hver forbrugsgruppe faktureres på. produktnr null: forbruget i gruppen kan ikke lægges i e-conomic. Rettes i appen.',
    kort: 'Lageransvarlig: hvilke e-conomic-varer leje, salg og forbrugsgrupper faktureres på.', eksempler: ['hvilken vare faktureres leje på'] },

  // ---------------------------------------------------------------- læs: udlån, kanban, stregkoder og kameraer
  { navn: 'lager_udlaan', titel: 'Mine udlån', op: 'GET /udlaan',
    beskrivelse: 'Dine åbne udlån til personer uden konto: hvem har hvad, kontakten, forventet retur og påmindelsen. Lånerens link vises kun som «der er et» og udløbet. Et udlån lægges an af lager_tjek_ud med laaner og lukkes, når det sidste er afleveret.',
    kort: 'Dine udlån til personer uden konto: hvem har hvad, og hvornår det kommer retur.', eksempler: ['hvad har jeg lånt ud', 'hvornår kommer stigen retur'] },
  { navn: 'lager_udlaan_et', titel: 'Ét udlån', op: 'GET /udlaan/{id}', alias: { id: 'udlaanId' },
    beskrivelse: 'Ét af dine åbne udlån med enhederne, kontakten og forventet retur.',
    kort: 'Ét af dine udlån.', eksempler: ['vis udlån 3'] },
  { navn: 'lager_ansvarlig_udlaan', titel: 'Lageransvarlig: lagerets udlån', op: 'GET /ansvarlig/udlaan',
    beskrivelse: 'Lagerets åbne udlån til personer uden konto: hvem har lånt hvad af hvem, med kontakten. Rettes af den, der lånte ud.',
    kort: 'Lageransvarlig: alle åbne udlån til personer uden konto.', eksempler: ['hvad er lånt ud fra lageret'] },
  { navn: 'lager_ansvarlig_kanban', titel: 'Lageransvarlig: kanbankort', op: 'GET /ansvarlig/kanban', alias: { vare: 'forbrugsvareId' },
    beskrivelse: 'Kanbankortene (2-bin-genbestilling), der ikke er kaldt tilbage, med id, kode (KB-… på etiketten), vare, lokation, antal og status (åben genbestilling, scan). forbrugsvareId: kun kortene for den vare på alle dine lagre; ellers lagerId. Intet token. Id\'et (ikke koden) bruges i de andre kanbanværktøjer.',
    kort: 'Lageransvarlig: kanbankort til genbestilling og deres status.', eksempler: ['hvilke kanbankort er meldt tomme', 'har skruerne et kanbankort'] },
  { navn: 'lager_ansvarlig_kanban_et', titel: 'Lageransvarlig: ét kanbankort', op: 'GET /ansvarlig/kanban/{id}', alias: { id: 'kanbanId' }, beskriv: { kanbanId: FAELLES_BESKRIVELSER.kanbanId! },
    beskrivelse: 'Ét kanbankort (også et, der er kaldt tilbage), uden token. kanbanId er række-id\'et fra lager_ansvarlig_kanban, fundet ud fra kortets kode (KB-…).',
    kort: 'Lageransvarlig: ét kanbankort.', eksempler: ['vis kortet med koden KB-3f9a1c2e'] },
  { navn: 'lager_stregkode', titel: 'Slå en stregkode op', op: 'GET /stregkoder/{kode}',
    beskrivelse: 'Hvilken forbrugsvare har stregkoden (EAN-13, EAN-8, UPC-A, UPC-E eller GTIN-14) i lagerets selskab? Ingen priser. 404: ingen vare har den (se lager_ansvarlig_produktopslag for et navneforslag).',
    kort: 'Hvilken forbrugsvare har en stregkode (EAN/GTIN).', eksempler: ['hvad er 5701234567892'],
    beskriv: { kode: 'Stregkoden: EAN-13, EAN-8, UPC-A, UPC-E eller GTIN-14 (cifre).' } },
  // aabenVerden: stregkoden sendes til eksterne kilder.
  { navn: 'lager_ansvarlig_produktopslag', titel: 'Lageransvarlig: produktopslag på stregkode', op: 'GET /ansvarlig/produktopslag/{kode}', aabenVerden: true,
    beskrivelse: 'Forslag til en ny vares navn ud fra stregkoden hos installationens eksterne kilder (standard Open Food Facts og Open Products Facts). Stregkoden sendes til kilden; intet gemmes. forslag er null, når ingen kilde kender koden.',
    kort: 'Lageransvarlig: navneforslag til en ny vare ud fra stregkoden (eksterne kilder).', eksempler: ['hvad hedder varen med stregkode 5701234567892'],
    beskriv: { kode: 'Stregkoden: EAN-13, EAN-8, UPC-A, UPC-E eller GTIN-14 (cifre).' } },
  { navn: 'lager_iot_kameraer', titel: 'Kameraer', op: 'GET /iot/kameraer',
    beskrivelse: 'Kameraerne, du må se, på dine lagre: navn, lokation, og hvad hvert kan vise (billede, live-formater). Billedet og live-video ses i lager-appen, ikke her. Aldrig en adresse, et brugernavn eller et token.',
    kort: 'Kameraerne på lagrene, og hvad de kan vise (ses i appen).', eksempler: ['hvilke kameraer er der i containeren'] },

  // ---------------------------------------------------------------- læs: indretning (mål og pladser)
  { navn: 'lager_find_plads', titel: 'Find en plads', op: 'GET /lokationer/find-plads', alias: { rod: 'rodId', plan: 'scenarieId' },
    beskrivelse: 'Hvor er der plads til en ting? Hylder, skuffer, fag, bins og kasser, hvor en model (med mål, se lager_ansvarlig_model_maal) eller mål i mm passer: modellens egne faste pladser først, så de tætteste. Faste pladser til andre modeller og fulde pladser udelades; ukendte: true tager også pladser med, hvor et mål mangler, til sidst.',
    kort: 'Find hylder, skuffer og bins, hvor en model eller mål passer.', eksempler: ['hvor kan boremaskinen stå', 'en plads til en kasse på 40 × 30 × 20 cm'],
    beskriv: { rodId: 'Kun under denne lokation (lokations-id).', scenarieId: 'Regn på et scenarie: også planlagte hylder og kasser.' } },
  { navn: 'lager_lokation_passer', titel: 'Passer det her?', op: 'GET /lokationer/{id}/passer', alias: { id: 'lokationId', plan: 'scenarieId' },
    beskrivelse: 'Passer en model (med mål) eller mål i mm i lokationens indre mål? Drejes om den lodrette akse, hvis det hjælper. En fast plads passer kun til sin egen model, og en fuld plads ikke. passer er null, når bredde eller dybde mangler.',
    kort: 'Passer en model eller mål i en bestemt hylde, skuffe eller kasse.', eksempler: ['kan stigen ligge på hylde A-12-3', 'passer kassen i skuffe 2'],
    beskriv: { scenarieId: 'Regn på et scenaries træ.' } },
  { navn: 'lager_ansvarlig_skabelon_fravalg', titel: 'Lageransvarlig: fravalgte skabeloner', op: 'GET /ansvarlig/skabeloner/fravalg',
    beskrivelse: 'De indbyggede skabeloners familier med antal og eksempler, og hvad der er slået fra for installationen og lageret.',
    kort: 'Lageransvarlig: hvilke indbyggede skabeloner er slået fra.', eksempler: ['hvilke skabelonfamilier er slået fra'] },

  // ---------------------------------------------------------------- læs: scenarier (planlægning)
  { navn: 'lager_scenarier', titel: 'Scenarier', op: 'GET /scenarier',
    beskrivelse: 'Scenarierne (planer for et rum eller sted) på et lager: kladder først, med roden og antal ting, ændringer og planlagte lokationer.',
    kort: 'Scenarier: planer for indretning af et rum.', eksempler: ['hvilke planer er der for værkstedet'] },
  { navn: 'scenario_hent', titel: 'Et scenarie', op: 'GET /scenarier/{id}', alias: { id: 'scenarieId' },
    beskrivelse: 'Rodens undertræ med scenariet lagt på (planlagt, flyttet), det, der fjernes, de planlagte ting, indkøbslisten og version (til validering). Et vedtaget har resultatet.',
    kort: 'Et scenarie: træet med planen lagt på, ting og indkøbsliste.', eksempler: ['vis plan 4', 'hvad koster plan 4'] },
  { navn: 'scenario_valider', titel: 'Valider et scenarie', op: 'GET /scenarier/{id}/valider', alias: { id: 'scenarieId' },
    beskrivelse: 'Fejl (stopper en vedtagelse), advarsler (kollisioner, uden for rummet, smalle gange, vægt, hårde krav til evner, ændret siden) og hint (bløde krav).',
    kort: 'Valider et scenarie: fejl, advarsler og hint.', eksempler: ['kan plan 4 lade sig gøre', 'er der kollisioner i planen'] },
  { navn: 'scenario_sammenlign', titel: 'Sammenlign scenarier', op: 'GET /scenarier/sammenlign',
    beskrivelse: 'Sammenlign 2–3 scenarier: købspris, ny kapacitet (pladser, hyldeareal, rumfang, netto), flytninger, fjernelser, advarsler og fejl, og hvem der er bedst på hvert.',
    kort: 'Sammenlign 2–3 scenarier på pris, kapacitet og advarsler.', eksempler: ['hvilken plan giver mest hyldeplads', 'sammenlign plan 4 og 7'],
    beskriv: { ider: '2 eller 3 scenarie-id\'er, kommasepareret, fx «4,7».' } },
  // En POST, der intet skriver: forslaget er deterministisk og læses kun (laesende).
  { navn: 'scenario_foreslaa_placering', titel: 'Foreslå placeringer', op: 'POST /scenarier/{id}/placering', alias: { id: 'scenarieId' }, laesende: true,
    forbyd: { 'ting.asbest': ASBEST },
    beskrivelse: 'Placeringsmotoren: foreslå en plads i scenariet til hver ting (enhed, forbrugsvare, model eller planlagt ting) med score 0–100 og forklaring, eller grundene til, at der ingen er. Skriver intet; kræver lageransvarlig. Hårde krav brydes aldrig (placeringsregler for særhåndteringsmærker og karantæne, modellens hårde krav til evner, zonernes evner, faste pladser, mål, kapacitet, bæreevne, zoneKrav: skal). Bløde mål: pasform, grebshøjde efter frekvens, tunge ting lavt, grupper samlet, ønsket zone, nær maal.arbejdspunkt og færre flytninger. Giv det, interviewet har givet, pr. ting (frekvens, gruppe, zone, vaegtKg, maal, maerker) eller pr. kategori i profiler, og vægte og stilling i maal. Lav 2–3 bud med forskellige maal eller profiler, og læg de linjer, brugeren tager imod, i kladden med scenario_placer (med forslagets version).',
    kort: 'Placeringsmotoren: forslag til, hvor hver ting skal stå i et scenarie, med score.', eksempler: ['hvor skal elværktøjet stå i plan 4', 'foreslå en indretning af skruerne nær arbejdsbordet'],
    beskriv: { omraade: 'Pladserne under denne lokation (standard: scenariets rod).' } },
  { navn: 'scenario_vurder_placering', titel: 'Vurder placeringerne', op: 'GET /scenarier/{id}/placering', alias: { id: 'scenarieId' },
    beskrivelse: 'Vurder det, scenariet allerede placerer (enheder og forbrugsvarer i kladden og planlagte ting med en plads), med motorens mål: score og forklaring pr. ting og de hårde krav, en placering bryder.',
    kort: 'Vurder et scenaries placeringer: score og brudte krav pr. ting.', eksempler: ['hvor god er placeringen i plan 4', 'bryder plan 4 nogen krav'] },

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
    // «savnet» melder enheden savnet, når optællingen lukkes: brugerens udtrykkelige ja.
    bekraeftes: (i) => (i.afgoerelse as { slags?: unknown } | undefined)?.slags === 'savnet',
    beskrivelse: 'Afgør én afvigelse (linjeId fra status): savnet | ikke_vores | plads_flyttet | ok. «savnet» melder enheden savnet og kræver bekraeftet: true efter brugerens udtrykkelige ja. Kassation, «hos en person» og «opret enhed» afgøres i appen. Udføres først, når optællingen lukkes.',
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
  { navn: 'lager_ansvarlig_ret_model', titel: 'Lageransvarlig: ret model', op: 'PUT /ansvarlig/modeller/{id}', alias: { id: 'modelId' }, bekraeftes: deaktiverer,
    // asbestStandard er forældet (#156) og afvises: maerker erstatter det. maerker erstatter hele listen, så værktøjet er destruktivt.
    forbyd: { asbestStandard: ASBEST_STANDARD }, destruktiv: true,
    beskriv: MAERKER_BESKRIV, kald: kunEnMaerkemaade('PUT /ansvarlig/modeller/{id}'),
    beskrivelse: 'Ret en models stamdata, værnemidler og produktside, og de særhåndteringsmærker, en ny enhed af modellen får (nøglerne fra lager_saermaerker; de nuværende står på lager_ansvarlig_modeller med modelId). ' + MAERKER_TEKST + ' Det forældede asbestStandard afvises. Kun de felter, der sendes, ændres. Priser sættes med lager_ansvarlig_pris_saet.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret en models stamdata, værnemidler og produktside.', eksempler: ['model 12 kræver høreværn og briller', 'sæt eftersynsinterval på model 12 til 12 måneder'] },
  { navn: 'lager_ansvarlig_ret_enhed', titel: 'Lageransvarlig: ret enhed', op: 'PUT /ansvarlig/enheder/{tag}',
    // Købspris går på afregningsarket og forsikringen, og modellen bestemmer prisen: begge kræver brugerens ja.
    // asbest er forældet (#156) og afvises: maerker erstatter det. maerker erstatter hele listen, så værktøjet er destruktivt.
    forbyd: { asbest: ASBEST }, destruktiv: true, bekraeftes: (i) => i.modelId !== undefined || i.koebspris !== undefined, nullbar: ['serienummer', 'koebsdato', 'leverandoer', 'bilag', 'note', 'plads'],
    beskriv: MAERKER_BESKRIV, kald: kunEnMaerkemaade('PUT /ansvarlig/enheder/{tag}'),
    beskrivelse: 'Ret en enheds stamdata (serienummer, købsdato, leverandør, bilag, note, hjemmeplads) og særhåndteringsmærker (nøglerne fra lager_saermaerker; et nyt mærke skal være slået til; de nuværende står på lager_ansvarlig_enheder med tag). ' + MAERKER_TEKST + ' Det forældede asbest afvises. Står enheden derefter, hvor placeringsreglerne ikke tillader, gemmes rettelsen med en advarsel. null sletter et felt. Et skift af model (modelId; den bestemmer lejeprisen) eller købspris (afregningsark og forsikring) kræver bekraeftet: true efter brugerens udtrykkelige ja; enhedens egne felter med lager_ansvarlig_enhed_egenskaber.',
    kort: 'Lageransvarlig: ret en enheds stamdata.', eksempler: ['T-00012 har serienummer 4711', 'T-00012 står på A-12-3', 'T-00012 har været brugt i asbest'] },
  { navn: 'lager_ansvarlig_saet_tilfoej_del', titel: 'Lageransvarlig: læg del i sæt', op: 'POST /ansvarlig/saet/{tag}/dele',
    beskrivelse: 'Gør en enhed (kode) til del af sættet med mærket tag.',
    kort: 'Lageransvarlig: læg en enhed i et sæt.', eksempler: ['læg T-00040 i kassen T-00031'],
    beskriv: { tag: 'Sættets mærke (kassen).', kode: 'Delens mærke.' } },
  { navn: 'lager_ansvarlig_saet_fjern_del', titel: 'Lageransvarlig: tag del ud af sæt', op: 'DELETE /ansvarlig/saet/{tag}/dele/{del}', bekraeftes: true,
    beskrivelse: 'Delen bliver en almindelig enhed. Vis sæt og del, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: tag en del ud af et sæt.', eksempler: ['tag T-00040 ud af kassen T-00031'],
    beskriv: { tag: 'Sættets mærke (kassen).', del: 'Delens mærke.' } },
  { navn: 'lager_ansvarlig_saet_pakkeliste', titel: 'Lageransvarlig: sæt pakkeliste', op: 'PUT /ansvarlig/modeller/{id}/pakkeliste', alias: { id: 'modelId' },
    beskrivelse: 'Erstat pakkelisten for en sætmodel: linjer med delModelId eller fritekst og antal.',
    kort: 'Lageransvarlig: sæt pakkelisten for en sætmodel.', eksempler: ['borekassen skal have 1 borehammer og 1 sæt bor'] },

  // ---------------------------------------------------------------- skriv: register (modeller, enheder, varer), afgørelser, forbrug, perioder og priser
  { navn: 'lager_ansvarlig_model_opret', titel: 'Lageransvarlig: ny model', op: 'POST /ansvarlig/modeller',
    forbyd: { asbestStandard: ASBEST_STANDARD },
    beskriv: { bekraeft: MAERKER_BESKRIV.bekraeft!, maerker: 'Særhåndteringsmærkerne, en ny enhed af modellen får (nøglerne fra lager_saermaerker).' },
    beskrivelse: 'Opret en model (værktøjstype) i lagerets selskab med første pris (kostpris, salgspris, dagssats fra gyldigFra). Med kategoriskabelon (lager_kategoriskabeloner) kan kategori udelades, og egenskaber følger skabelonens felter. Findes varenummeret i selskabet, rettes den kendte model i stedet: slå op med lager_ansvarlig_modeller først, så du ikke retter en anden model ved et uheld. En pris (kostpris, salgspris, dagssats) på en kendt model afvises (409): sæt den med lager_ansvarlig_pris_saet. Enhederne oprettes bagefter med lager_ansvarlig_enhed_opret.',
    kort: 'Lageransvarlig: opret en model (værktøjstype) med første pris.', eksempler: ['opret Makita DHR243 borehammer med dagssats 95 kr', 'ny model: Hilti TE 30 med kategoriskabelonen borehammer'] },
  { navn: 'lager_ansvarlig_enhed_opret', titel: 'Lageransvarlig: nye enheder', op: 'POST /ansvarlig/enheder',
    forbyd: { asbest: ASBEST },
    beskriv: {
      bekraeft: 'Udelad det. Kun true, når brugeren efter et 409 udtrykkeligt har sagt ja til at oprette enheden uden et af modellens mærker med et værn (fx asbest).',
      accepter: 'Udelad det. Svarer lageret 409 med advarsler (pris, gentaget, dublet), så vis advarslerne og spørg brugeren; send kun de slags, brugeren udtrykkeligt har sagt ja til.',
    },
    beskrivelse: 'Opret en eller flere enheder (fysiske stykker værktøj) af en model på lageret; antal > 1 giver fortløbende mærker, og så kan tag og serienummer ikke angives. Uden tag får enheden lagerets næste mærke (svaret har tags). Købsdato, købspris, leverandør og bilag er valgfri; en plads (hjemmeplads) tjekkes mod placeringsreglerne. Lageret advarer (409) om en købspris langt fra modellens, en værdi skrevet to gange eller en mulig dublet: vis advarslerne og spørg brugeren, før du sender accepter.',
    kort: 'Lageransvarlig: opret enheder af en model (med mærke, serienummer, købsdata, plads).', eksempler: ['opret 3 borehamre af model 12 købt hos STARK i dag', 'opret T-00120 med serienummer 4711 på A-12-3'] },
  { navn: 'lager_ansvarlig_modtag_enhed', titel: 'Lageransvarlig: modtag enhed på lageret', op: 'POST /ansvarlig/modtag',
    forbyd: { asbest: ASBEST },
    beskriv: { maerker: 'Særhåndteringsmærker, modtagelsen sætter (nøglerne fra lager_saermaerker); de andre bliver, og intet fjernes.' },
    beskrivelse: 'Registrér en enhed (mærke) på lageret med hjemmeplads og evt. dagssats, fx en enhed, der er kommet tilbage fra service eller er flyttet hertil. Pladsen tjekkes mod placeringsreglerne (409 med grunden); en enhed i karantæne eller til klargøring skal frigives først, og udstyr med et særhåndteringsmærke, der er ude, afleveres i stedet (lager_aflever). Nye enheder oprettes med lager_ansvarlig_enhed_opret.',
    kort: 'Lageransvarlig: modtag en enhed på lageret med hjemmeplads.', eksempler: ['T-00012 er kommet hjem fra service og skal stå på A-12-3'] },
  { navn: 'lager_ansvarlig_frigiv', titel: 'Lageransvarlig: frigiv enhed', op: 'POST /ansvarlig/afgoer', fast: { handling: 'frigiv' },
    beskrivelse: 'Frigiv en enhed fra karantæne eller klargøring til lageret. Står den i et procesflow, er frigivelsen flowets sidste trin: forløbet skal stå på det, og trinnets tjekliste (tjekket) og certificering gælder. Spørg brugeren, om tjeklisten er gået igennem, før du sender tjekket eller certificeret.',
    kort: 'Lageransvarlig: frigiv en enhed fra karantæne eller klargøring.', eksempler: ['T-00012 er rengjort og kan frigives'],
    beskriv: { tjekket: 'Tjeklistens punkter, brugeren har bekræftet (fra procesflowets trin).', certificeret: 'Kun true, når brugeren har bekræftet certificeringen, trinnet kræver.' } },
  { navn: 'lager_ansvarlig_kasser', titel: 'Lageransvarlig: kassér enhed', op: 'POST /ansvarlig/afgoer', fast: { handling: 'kasser' }, skjul: ['tjekket', 'certificeret'], bekraeftes: true, kraev: ['note'],
    beskrivelse: 'Kassér en enhed i karantæne eller klargøring: den er væk fra lageret for altid. Kan ikke fortrydes. Vis brugeren enheden (lager_opslag) og grunden, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: kassér en enhed (kan ikke fortrydes; kræver brugerens ja).', eksempler: ['kassér T-00031, den er ødelagt'],
    beskriv: { note: 'Grunden til kassationen, fx «motor brændt af».' } },
  { navn: 'lager_ansvarlig_fejlregistrer', titel: 'Lageransvarlig: fejlregistrér enhed', op: 'POST /ansvarlig/enheder/{tag}/fejlregistrer', bekraeftes: true,
    forbyd: { krediter: 'At kreditere faktureret leje er bogføring og sker i lager-appen, ikke gennem MCP.' },
    beskriv: {
      perioder: 'Kun når lageret svarer 409 med aktivePerioder: annuller, eller flyt (med flytTil). Vis perioderne, og lad brugeren vælge.',
      flytTil: 'Enheden, perioderne flyttes til (samme lager), med perioder: flyt.',
      bekraeftHos: 'Kun true, når lageret har svaret 409, fordi enheden står hos en person, og brugeren udtrykkeligt har sagt ja.',
    },
    beskrivelse: 'Fejlregistrér en enhed, der er oprettet ved en fejl (fx en dublet): den får status fejlregistreret, og historikken bliver stående. Har den aktive lejeperioder, skal brugeren vælge at annullere dem eller flytte dem til en anden enhed; ikke-godkendte afregninger markeres til genberegning. Fakturerede perioder kan ikke krediteres herfra (det sker i appen). Solgt udstyr og en enhed i karantæne, klargøring eller et procesforløb kan ikke fejlregistreres. Vis enheden og konsekvensen, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: fejlregistrér en enhed, der er oprettet ved en fejl (kræver brugerens ja).', eksempler: ['T-00044 er oprettet to gange, fejlregistrér den', 'fejlregistrér T-00044 og flyt perioderne til T-00043'] },
  { navn: 'lager_ansvarlig_forbrugsvare_opret', titel: 'Lageransvarlig: ny forbrugsvare', op: 'POST /ansvarlig/forbrugsvarer',
    beskrivelse: 'Opret en forbrugsvare (fx kabelbindere, filtre, handsker) med første pris, gruppe (lager_forbrugsgrupper), enhed og beholdningsform (antal eller niveau); stregkoder (EAN) kan komme med. Går varenummeret igen i selskabet, rettes den vare i stedet, og en pris på en kendt vare afvises (409: sæt den med lager_ansvarlig_pris_saet); en stregkode, der står på en anden vare, giver 409, og intet ændres. Beholdning og lokation sættes bagefter med lager_ansvarlig_forbrugsvare_beholdning_saet; en levering modtages med lager_ansvarlig_modtag_levering.',
    kort: 'Lageransvarlig: opret en forbrugsvare med pris, gruppe og stregkoder.', eksempler: ['opret kabelbindere 200 mm, pose, kostpris 39 kr', 'ny vare: nitrilhandsker str. L i gruppen værnemidler'] },
  { navn: 'lager_ansvarlig_forbrugsvare_ret', titel: 'Lageransvarlig: ret forbrugsvare', op: 'PUT /ansvarlig/forbrugsvarer/{id}', alias: { id: 'forbrugsvareId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret en forbrugsvares stamdata (navn, varenummer, leverandør, gruppe, enhed, aktiv, beholdningsform) og evt. dens samlede beholdning: minimum og talt (en optælling) på lokationId, eller uden den det ene sted, varen står (409, når den står flere steder: brug så lager_ansvarlig_forbrugsvare_beholdning_saet pr. lokation). aktiv: false slår varen fra. Kun de felter, der sendes, ændres. Prisen sættes med lager_ansvarlig_pris_saet.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret en forbrugsvares stamdata, eller slå den fra.', eksempler: ['kabelbinderne hedder nu «Kabelbinder 200×4,8 mm»', 'slå vare 17 fra'] },
  { navn: 'lager_ansvarlig_forbrugsvare_bevaegelser', titel: 'Lageransvarlig: varens historik', op: 'GET /ansvarlig/forbrugsvarer/{id}/bevaegelser', alias: { id: 'forbrugsvareId' },
    beskrivelse: 'Beholdningens historik på én forbrugsvare: modtaget, udtag, optælling og regulering, med hvem og hvornår.',
    kort: 'Lageransvarlig: en forbrugsvares bevægelser (modtaget, udtag, optælling).', eksempler: ['hvorfor er der kun 3 filtre tilbage?'] },
  { navn: 'lager_ansvarlig_udtag', titel: 'Lageransvarlig: udtag i en periode', op: 'GET /ansvarlig/forbrug',
    beskrivelse: 'Udtag af forbrugsvarer på lageret i perioden fra–til (alle personer og projekter), evt. også de annullerede.',
    kort: 'Lageransvarlig: udtag af forbrugsvarer i en periode.', eksempler: ['hvad er der taget af forbrugsvarer i oktober?'] },
  { navn: 'lager_ansvarlig_udtag_registrer', titel: 'Lageransvarlig: registrér udtag for en anden', op: 'POST /ansvarlig/forbrug', bekraeftes: true,
    beskrivelse: 'Registrér et udtag af en forbrugsvare på et projekt på vegne af en person (personId, ellers dig selv), evt. bagudrettet (dato). Udtaget går i projektets afregning. Til et udtag, der ikke blev registreret; eget udtag er lager_forbrug. Skriv en begrundelse, vis vare, antal, person, projekt og dato, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: registrér et udtag på vegne af en anden, evt. bagudrettet.', eksempler: ['Kim tog 2 pakker filtre til sag 2620 i går'] },
  { navn: 'lager_ansvarlig_udtag_annuller', titel: 'Lageransvarlig: annullér udtag', op: 'DELETE /ansvarlig/forbrug/{id}', alias: { id: 'udtagId' }, bekraeftes: true,
    beskrivelse: 'Annullér et registreret udtag (id fra lager_ansvarlig_udtag) med en begrundelse; varen lægges tilbage i beholdningen, og et udtag, der ikke er faktureret, kommer ikke med i næste afregning. Er udtaget faktureret (på en bogført afregning), ville annulleringen kreditere det: lageret afviser det gennem MCP (403), og det sker i appen. Vis udtaget, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: annullér et udtag af en forbrugsvare (kræver brugerens ja).', eksempler: ['udtaget af 5 filtre var en fejl, annullér det'],
    beskriv: { udtagId: 'Udtagets id (se lager_ansvarlig_udtag).' } },
  { navn: 'lager_ansvarlig_periode_opret', titel: 'Lageransvarlig: ny lejeperiode', op: 'POST /ansvarlig/perioder',
    beskrivelse: 'Tast en lejeperiode for en enhed på et projekt (fra, evt. til): historik eller en udlevering, der ikke blev scannet. Perioden går direkte i afregningen, så tjek først lager_ansvarlig_perioder for enheden, og skriv en begrundelse.',
    kort: 'Lageransvarlig: tast en lejeperiode for en enhed på et projekt.', eksempler: ['T-00012 var på sag 2620 fra 1. til 10. september, det blev ikke scannet'] },
  { navn: 'lager_ansvarlig_periode_ret', titel: 'Lageransvarlig: ret lejeperiode', op: 'PUT /ansvarlig/perioder/{id}', alias: { id: 'periodeId' }, bekraeftes: true,
    beskrivelse: 'Ret en lejeperiodes fra, til, projekt eller person med en begrundelse (id fra lager_ansvarlig_perioder). Et andet projekt flytter lejen til en anden kunde. En afregnet periode kan ikke rettes (409); den annulleres i appen. En ændring går i den næste afregning. Vis før og efter, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: ret en lejeperiode (datoer, projekt, person).', eksempler: ['perioden for T-00012 sluttede den 8., ikke den 10.'],
    beskriv: { periodeId: 'Periodens id (se lager_ansvarlig_perioder).' } },
  { navn: 'lager_ansvarlig_periode_annuller', titel: 'Lageransvarlig: annullér lejeperiode', op: 'DELETE /ansvarlig/perioder/{id}', alias: { id: 'periodeId' }, bekraeftes: true,
    beskrivelse: 'Annullér en lejeperiode med en begrundelse (id fra lager_ansvarlig_perioder); en periode, der ikke er faktureret, kommer ikke med i næste afregning. Er den faktureret (på en bogført afregning), ville annulleringen kreditere det: lageret afviser det gennem MCP (403), og det sker i appen. Vis perioden, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: annullér en lejeperiode (kræver brugerens ja).', eksempler: ['perioden for T-00012 på sag 2659 er forkert, annullér den'],
    beskriv: { periodeId: 'Periodens id (se lager_ansvarlig_perioder).' } },
  { navn: 'lager_ansvarlig_saet_oploes', titel: 'Lageransvarlig: opløs sæt', op: 'POST /ansvarlig/saet/{tag}/oploes', bekraeftes: true,
    beskrivelse: 'Opløs sættet: alle dele bliver almindelige enheder, og kassen består. Kan ikke fortrydes (delene skal lægges i igen én ad gangen). Vis indholdet (lager_saet), og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: opløs et sæt i almindelige enheder (kræver brugerens ja).', eksempler: ['opløs sættet T-00100'] },
  { navn: 'lager_ansvarlig_bestilling_forventet', titel: 'Lageransvarlig: forventet dato på bestilling', op: 'PUT /ansvarlig/bestillinger/{id}', alias: { id: 'bestillingId' },
    beskrivelse: 'Sæt eller ret den forventede leveringsdato på en bestilling (null fjerner den).',
    kort: 'Lageransvarlig: ret forventet leveringsdato på en bestilling.', eksempler: ['filtrene kommer først på fredag'] },
  { navn: 'lager_ansvarlig_priser', titel: 'Lageransvarlig: priser og historik', op: 'GET /ansvarlig/priser', alias: { model: 'modelId', vare: 'forbrugsvareId' },
    beskrivelse: 'Prishistorikken (kostpris, salgspris, dagssats med gyldighed, kilde og hvem) for én model (modelId), én enhed (tag) eller én forbrugsvare; for en enhed også dagens sats. Uden emne: lagerets enheder uden pris i dag.',
    kort: 'Lageransvarlig: prishistorik for en model, enhed eller vare, eller enheder uden pris.', eksempler: ['hvad har dagssatsen for model 12 været?', 'hvilke enheder mangler pris?'] },
  { navn: 'lager_ansvarlig_pris_saet', titel: 'Lageransvarlig: sæt pris', op: 'POST /ansvarlig/priser', bekraeftes: true,
    beskrivelse: 'Sæt en ny pris fra gyldigFra på en model (modelId), en enhed (tag) eller en forbrugsvare (forbrugsvareId): kostpris, salgspris og/eller dagssats. Versioner med en anden gyldigFra bliver i historikken, men findes der allerede en version med samme gyldigFra, OVERSKRIVES den (upsert): slå op med lager_ansvarlig_priser først. Leje fra gyldigFra regnes med den nye dagssats, når afregningen beregnes; det bogførte røres ikke, men en gyldigFra bagud i tiden ændrer ikke-bogførte afregninger. Vis den nuværende og den nye pris, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: sæt en ny pris (kost, salg, dagssats) fra en dato.', eksempler: ['dagssatsen for model 12 er 110 kr fra 1. november', 'kabelbinderne koster nu 42 kr'] },

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
  { navn: 'lager_ansvarlig_lokation_nedlaeg', titel: 'Lageransvarlig: nedlæg lokation', op: 'POST /ansvarlig/lokationer/{id}/nedlaeg', alias: { id: 'lokationId' }, bekraeftes: true,
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
  { navn: 'lager_ansvarlig_evnetype_ret', titel: 'Lageransvarlig: ret evnetype', op: 'PATCH /ansvarlig/evnetyper/{id}', alias: { id: 'evnetypeId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret navn, beskrivelse, skema eller arv, eller slå typen fra (aktiv: false). Et nyt skema skal passe til det, der allerede er sat.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en evnetype fra.', eksempler: ['trykluft arves ikke'],
    beskriv: { evnetypeId: 'Evnetypens id (se lager_evnetyper).' } },
  { navn: 'lager_ansvarlig_model_krav_saet', titel: 'Lageransvarlig: sæt modellens krav', op: 'PUT /ansvarlig/modeller/{id}/krav', alias: { id: 'modelId' },
    beskrivelse: 'Erstat hele modellens kravliste (kun installationens evnetyper). Et hårdt krav må ikke brydes; et blødt er en anbefaling.',
    kort: 'Lageransvarlig: sæt en models krav til evner.', eksempler: ['model 12 skal lades på batterisystem X', 'model 30 kræver udsugning'] },
  { navn: 'lager_ansvarlig_iot_skift', titel: 'Lageransvarlig: tænd eller sluk', op: 'POST /iot/enheder/{id}/skift', alias: { id: 'enhedId' },
    idempotent: true, aabenVerden: true,
    beskrivelse: 'Tænd eller sluk en kontakt, et lys eller en ventilator gennem Home Assistant. Bekræft med brugeren før du tænder, slukker eller ændrer. Står i revisionsloggen. 503 uden forbindelse, 502 når Home Assistant afviser. Mere end tænd/sluk: lager_ansvarlig_iot_styr.',
    kort: 'Lageransvarlig: tænd eller sluk en kontakt, et lys eller en ventilator.', eksempler: ['tænd affugteren i containeren', 'sluk lyset i skuret'] },

  // ---------------------------------------------------------------- skriv: skabeloner, egenskaber og varer pr. lokation
  { navn: 'lager_ansvarlig_skabelon_opret', titel: 'Lageransvarlig: ny skabelon', op: 'POST /ansvarlig/skabeloner',
    beskrivelse: 'Ny egen skabelon (type, mål, børn) på et lager, eller delt i installationen (delt: true kræver lageransvarlig på alle lagre). kopiAf kopierer en skabelon som udgangspunkt.',
    kort: 'Lageransvarlig: opret en skabelon, evt. som kopi.', eksempler: ['lav en skabelon for vores 5-hylders reol'] },
  { navn: 'lager_ansvarlig_skabelon_ret', titel: 'Lageransvarlig: ret skabelon', op: 'PATCH /ansvarlig/skabeloner/{id}', alias: { id: 'skabelonId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret en egen skabelon; felterne, der er med, erstatter de nuværende. aktiv: false tager den ud af biblioteket. Lokationer oprettet fra den røres ikke.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en skabelon fra.', eksempler: ['skabelonen er 40 cm dyb'] },
  { navn: 'lager_ansvarlig_kategoriskabelon_opret', titel: 'Lageransvarlig: ny kategoriskabelon', op: 'POST /ansvarlig/kategoriskabeloner',
    beskrivelse: 'Ny kategoriskabelon med nøgle, navn og felter. Med lagerId lagerets egen; lagerId: null er hele installationens (kræver lageransvarlig på alle lagre).',
    kort: 'Lageransvarlig: opret en kategoriskabelon med egenskabsfelter.', eksempler: ['opret en kategori for sikringer med ampere'] },
  { navn: 'lager_ansvarlig_kategoriskabelon_ret', titel: 'Lageransvarlig: ret kategoriskabelon', op: 'PATCH /ansvarlig/kategoriskabeloner/{id}', alias: { id: 'kategoriskabelonId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret navn, beskrivelse eller felter, eller slå den fra (aktiv: false). Nøglen ligger fast; nye felter skal passe til de værdier, der er sat.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret en kategoriskabelon.', eksempler: ['kabler skal også have en farve'] },
  { navn: 'lager_ansvarlig_model_egenskaber', titel: 'Lageransvarlig: modellens egenskaber', op: 'PUT /ansvarlig/modeller/{id}/egenskaber', alias: { id: 'modelId' }, destruktiv: true,
    beskrivelse: 'Sæt modellens kategoriskabelon og egenskaber. egenskaber flettes ind i de gemte; null fjerner et felt. kategoriskabelon: null fjerner skabelonen og alle værdier: bekræft med brugeren først.',
    kort: 'Lageransvarlig: sæt en models kategori og egenskaber (stik, længde …).', eksempler: ['model 12 er et USB-C-kabel på 2 m'] },
  { navn: 'lager_ansvarlig_forbrugsvare_egenskaber', titel: 'Lageransvarlig: varens egenskaber', op: 'PUT /ansvarlig/forbrugsvarer/{id}/egenskaber', alias: { id: 'forbrugsvareId' }, destruktiv: true,
    beskrivelse: 'Sæt forbrugsvarens kategoriskabelon og egenskaber. egenskaber flettes ind i de gemte; null fjerner et felt. kategoriskabelon: null fjerner skabelonen og alle værdier: bekræft med brugeren først.',
    kort: 'Lageransvarlig: sæt en forbrugsvares kategori og egenskaber.', eksempler: ['modstandene er 10 kΩ'] },
  { navn: 'lager_ansvarlig_forbrugsvare_beholdning_saet', titel: 'Lageransvarlig: varens beholdning på en lokation', op: 'PUT /ansvarlig/forbrugsvarer/{id}/beholdninger', alias: { id: 'forbrugsvareId' },
    beskrivelse: 'Tildel varen en lokation, tæl op (talt eller niveau), sæt minimum og maks eller bestil ved, eller fjern tildelingen (fjern: true, kun når der intet er; bekræft med brugeren først). null fjerner en grænse.',
    kort: 'Lageransvarlig: tildel, tæl op eller sæt grænser for en vare på en lokation.', eksempler: ['der er 40 kabelbindere i bin K-17', 'filtrene skal bestilles under 5 på hylde A-12-3'] },
  { navn: 'lager_ansvarlig_forbrugsvare_flyt', titel: 'Lageransvarlig: flyt vare', op: 'POST /ansvarlig/forbrugsvarer/{id}/flyt', alias: { id: 'forbrugsvareId' },
    beskrivelse: 'Flyt varen mellem to lokationer på samme lager: antal (standard alt), eller niveauet (fra bliver tom). Summen er uændret.',
    kort: 'Lageransvarlig: flyt en forbrugsvare mellem to lokationer.', eksempler: ['flyt 20 filtre fra bin K-17 til K-18'],
    beskriv: { fra: 'Lokationen, varen flyttes fra (lokations-id).', til: 'Lokationen, varen flyttes til (lokations-id).' } },
  { navn: 'lager_ansvarlig_kodeskabelon_saet', titel: 'Lageransvarlig: sæt kodeskabelon', op: 'PUT /ansvarlig/kodeskabelon',
    beskrivelse: 'Sæt lagerets kodeskabelon (null = frie koder, zone-reol-hylde). Den styrer kun nye kodeforslag; ingen kode, der findes, ændres.',
    kort: 'Lageransvarlig: sæt lagerets kodeskabelon.', eksempler: ['nye lokationer skal have koder som A-12-3'] },
  { navn: 'lager_ansvarlig_enhed_dokument_tilfoej', titel: 'Lageransvarlig: bilag på enhed', op: 'POST /ansvarlig/enheder/{tag}/dokumenter',
    beskrivelse: 'Læg et link (https) som bilag på enheden: kvittering, garanti, faktura, manual, attest … Filer uploades i appen.',
    kort: 'Lageransvarlig: læg et link til manual, garanti eller kvittering på en enhed.', eksempler: ['læg manualen til T-00012 på enheden'] },
  { navn: 'lager_ansvarlig_lokation_dokument_tilfoej', titel: 'Lageransvarlig: dokument på lokation', op: 'POST /ansvarlig/lokationer/{id}/dokumenter', alias: { id: 'lokationId' },
    beskrivelse: 'Læg et link (https) som dokument på lokationen, fx lejekontrakten, ordensreglerne eller udbyderens plan på et depotrum eller en container. Filer uploades i appen.',
    kort: 'Lageransvarlig: læg et link til lejekontrakt eller ordensregler på en lokation.', eksempler: ['læg lejekontrakten på depotrummet', 'gem linket til udbyderens ordensregler'] },
  { navn: 'lager_ansvarlig_lejemaal_ret', titel: 'Lageransvarlig: ret lejemålet', op: 'PUT /ansvarlig/lokationer/{id}/lejet', alias: { id: 'lokationId' },
    beskrivelse: 'Ret lejemålet på et depotrum eller en container: udbyder, anlæg, adresse, rum- eller containernummer, plads, adgangsmåder og -tider, kontakt, kontrakt, note og adgang. Kun felterne, der er med, ændres; null tømmer et felt. adgang ERSTATTER listen af personer med adgang: læs først de nuværende med lager_lejemaal, find nye med lager_ansvarlig_personer, og send den fulde liste; fjern kun en person efter brugerens udtrykkelige ja. version (fra lager_lejemaal) afviser en rettelse oven i en andens (409). Koderne (adgangskode, PIN) sættes aldrig her, kun i appen.',
    kort: 'Lageransvarlig: ret lejemålet på et depotrum eller en container (ikke koderne).', eksempler: ['depotrummet er opsagt til 31. december', 'Kim skal have adgang til containeren', 'skriv udbyderens telefonnummer på depotrummet'],
    beskriv: { adgang: 'Personernes id\'er (fra lager_ansvarlig_personer); ERSTATTER hele listen, så send også dem, der allerede har adgang (se lager_lejemaal).', version: 'Lejemålets version fra lager_lejemaal (409, hvis det er ændret siden).' } },
  { navn: 'lager_batteri_opladet', titel: 'Batteriet er opladet', op: 'POST /batterier/{tag}/opladet',
    beskrivelse: 'Registrér, at batteriet er ladet op (en linje i vedligeholdsloggen); næste forfald flytter sig. Alle medarbejdere på batteriets lager.',
    kort: 'Registrér, at et batteri er ladet op.', eksempler: ['T-00055 er ladet op'] },

  // ---------------------------------------------------------------- skriv: scenarier (planlægning)
  // Agenten arbejder kun i kladder; vedtagelsen er et menneskes beslutning i appen (UDEN_VAERKTOEJ).
  { navn: 'scenario_opret', titel: 'Nyt scenarie', op: 'POST /ansvarlig/scenarier',
    beskrivelse: 'Nyt scenarie (en kladde) over en rod, fx det rum, der planlægges. Det starter som det rigtige træ; ændringer gemmes kun i scenariet.',
    kort: 'Opret et scenarie (en plan) for et rum.', eksempler: ['lav en plan for værkstedet med to nye reoler'],
    beskriv: { rodId: 'Lokationen (rum eller sted), der planlægges i.' } },
  { navn: 'scenario_ret', titel: 'Ret scenarie', op: 'PATCH /ansvarlig/scenarier/{id}', alias: { id: 'scenarieId' },
    beskrivelse: 'Omdøb, ret noten, arkivér (status: forkastet) eller gør til kladde igen. Et vedtaget scenarie er historik.',
    kort: 'Omdøb eller arkivér et scenarie.', eksempler: ['kald plan 4 «To reoler ved væggen»', 'forkast plan 7'] },
  { navn: 'scenario_slet', titel: 'Slet scenarie', op: 'DELETE /ansvarlig/scenarier/{id}', alias: { id: 'scenarieId' }, bekraeftes: true,
    beskrivelse: 'Slet et scenarie, der ikke er vedtaget, med dets planlagte lokationer, ting og ændringer. Det rigtige træ røres ikke. Bekræft med brugeren først.',
    kort: 'Slet et scenarie (en kladde).', eksempler: ['slet plan 7'] },
  { navn: 'scenario_tilfoej_ting', titel: 'Planlæg en ting', op: 'POST /ansvarlig/scenarier/{id}/ting', alias: { id: 'scenarieId' }, forbyd: { asbest: ASBEST },
    beskrivelse: 'Planlagt ting under parentId: skabelon (en lokation med hele undertræet, se lager_skabeloner), navn + type med geometri (en lokation i fritekst), eller modelId/navn (en ting, fx en printer på bordet). koebspris, url og vaegtKg er valgfri; en ting i fritekst kan få maerker (særhåndteringsmærker, se lager_saermaerker), som placeringsreglerne ser. Koder gives ved vedtagelsen.',
    kort: 'Tilføj en planlagt reol, et skab eller en ting i et scenarie.', eksempler: ['sæt en 5-hylders reol op ad nordvæggen i plan 4', 'en 3D-printer på bordet'] },
  { navn: 'scenario_flyt', titel: 'Flyt i scenariet', op: 'POST /ansvarlig/scenarier/{id}/flyt', alias: { id: 'scenarieId' }, destruktiv: true,
    beskrivelse: 'Flytninger, alt eller intet: en rigtig lokation (lokationId) får ny forælder eller x/y/z og rotation kun i scenariet, fjern: true nedlægger den ved vedtagelsen, nulstil: true glemmer ændringen. En planlagt (tingId) flyttes, eller slettes med fjern. Svaret er scenariet bagefter.',
    kort: 'Flyt, drej eller fjern lokationer og ting i et scenarie.', eksempler: ['flyt reol R1 1 m mod øst i plan 4', 'fjern det gamle skab i planen'] },
  { navn: 'scenario_fjern_ting', titel: 'Fjern planlagt ting', op: 'DELETE /ansvarlig/scenarier/{id}/ting/{tingId}', alias: { id: 'scenarieId' },
    beskrivelse: 'Fjern en planlagt ting; er den en planlagt lokation, går undertræet med.',
    kort: 'Fjern en planlagt ting fra et scenarie.', eksempler: ['tag printeren ud af plan 4'] },
  { navn: 'scenario_placer', titel: 'Placér i scenariet', op: 'POST /ansvarlig/scenarier/{id}/placer', alias: { id: 'scenarieId' }, idempotent: true, kraev: ['version'],
    forbyd: { 'placeringer.asbest': ASBEST },
    beskrivelse: 'Læg placeringer i scenariets kladde, alt eller intet: en enhed eller forbrugsvare får en ny plads i scenariet, en model bliver en planlagt ting på pladsen, en planlagt ting flyttes, og fjern: true tager en placering ud af kladden. Typisk forslagets placer-linjer fra scenario_foreslaa_placering, dem brugeren har taget imod, med kilde: motor. version er påkrævet: forslagets version, eller scenario_hent\'s (eller det seneste svars) ved en placering i hånden. Det rigtige træ røres ikke; vedtagelsen er et menneskes i appen. 409: scenariet er ændret siden version (lav et nyt forslag) eller ikke en kladde; 422: en placeringsregel eller et hårdt krav forbyder pladsen.',
    kort: 'Læg placeringer (fx motorens forslag) i et scenaries kladde.', eksempler: ['placér forslagets linjer i plan 4', 'skruerne skal stå i bin K-17 i planen'],
    beskriv: { version: 'Scenariets version: fra forslaget, fra scenario_hent eller fra det seneste svar. Et ændret scenarie svarer 409: lav et nyt forslag.' } },
  { navn: 'scenario_zone_opret', titel: 'Ny zone i scenariet', op: 'POST /ansvarlig/scenarier/{id}/zoner', alias: { id: 'scenarieId' },
    beskrivelse: 'Ny zone i scenariet: en etiket med et formål (fx elektronik, 3D-print, grovværktøj, en særzone) på lokationer, rigtige eller planlagte, med de evner, der følger med (fx strøm, udsugning; se lager_evnetyper). I scenariet gælder zonens evner for reglerne og placeringsmotoren; først en vedtagelse lægger dem på lokationerne. En lokation er i højst én zone pr. scenarie.',
    kort: 'Opret en zone (elektronik, 3D-print, grovværktøj …) i et scenarie.', eksempler: ['gør bordet ved vinduet til elektronikzone i plan 4'] },
  { navn: 'scenario_zone_ret', titel: 'Ret en zone i scenariet', op: 'PATCH /ansvarlig/scenarier/{id}/zoner/{zoneId}', alias: { id: 'scenarieId' },
    beskrivelse: 'Ret en zones navn, formål, evner eller lokationer: lokationer erstatter listen, tilfoej og fjern retter den. Nøglen ligger fast.',
    kort: 'Ret en zone i et scenarie.', eksempler: ['reol 3 hører også til grovværktøjszonen'],
    beskriv: { zoneId: 'Zonens id (se scenario_hent).' } },
  { navn: 'scenario_zone_slet', titel: 'Slet en zone i scenariet', op: 'DELETE /ansvarlig/scenarier/{id}/zoner/{zoneId}', alias: { id: 'scenarieId' },
    beskrivelse: 'Slet en zone i scenariet; det rigtige træ røres ikke. Bekræft med brugeren først.',
    kort: 'Slet en zone i et scenarie.', eksempler: ['fjern 3D-printzonen fra plan 4'],
    beskriv: { zoneId: 'Zonens id (se scenario_hent).' } },

  // ---------------------------------------------------------------- skriv: IoT-enhedernes opsætning og vedligeholdets opgavetyper
  { navn: 'lager_ansvarlig_iot_enhed_opret', titel: 'Lageransvarlig: map en Home Assistant-entitet', op: 'POST /iot/enheder',
    // Kameraer (hvem må se, strømmen) sættes kun op i appen; lageret afviser dem også gennem gatewayen (403).
    skjul: ['kameraAdgang', 'go2rtcStroem'], kald: ikkeKamera('POST /iot/enheder'),
    beskrivelse: 'Map en entitet fra installationens Home Assistant (haEntityId, fx sensor.skur_temperatur) til en lokation: en føler, kontakt, lys, ventilator, ventilation, klima eller printer, med navn, metrik, placering i mm og meta. Kræver lageransvarlig på alle installationens lagre; 409 hvis entiteten allerede er mappet. Kameraer sættes kun op i appen.',
    kort: 'Lageransvarlig: map en Home Assistant-føler eller -kontakt til en lokation (ikke kameraer).', eksempler: ['sensor.skur_temperatur er føleren i skuret', 'lyset i værkstedet er switch.vaerksted'] },
  { navn: 'lager_ansvarlig_iot_enhed_ret', titel: 'Lageransvarlig: ret IoT-enhed', op: 'PUT /iot/enheder/{id}', alias: { id: 'enhedId' },
    skjul: ['kameraAdgang', 'go2rtcStroem'], kald: ikkeKamera('PUT /iot/enheder/{id}'), bekraeftes: deaktiverer,
    beskrivelse: 'Ret en IoT-enheds felter (dem, der sendes): lokation, navn, metrik, placering, meta, eller en ny haEntityId (kræver lageransvarlig på alle lagre). Kameraer rettes kun i appen.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret en IoT-enhed (navn, lokation, metrik, placering).', eksempler: ['føleren i skuret hænger nu på nordvæggen'] },
  { navn: 'lager_ansvarlig_iot_enhed_fjern', titel: 'Lageransvarlig: fjern IoT-enhed', op: 'DELETE /iot/enheder/{id}', alias: { id: 'enhedId' }, bekraeftes: true,
    beskrivelse: 'Fjern en IoT-enhed: den slettes uden målinger, ellers nedlægges den, og historikken bliver. Kameraer fjernes kun i appen. Vis enheden, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: fjern en IoT-enhed (kræver brugerens ja).', eksempler: ['den gamle føler i containeren er pillet ned'] },
  { navn: 'lager_ansvarlig_vedligehold_typer', titel: 'Lageransvarlig: vedligeholdets opgavetyper', op: 'GET /ansvarlig/vedligehold/typer',
    beskrivelse: 'Opgavetyperne til vedligehold (eftersyn, kalibrering, rengøring … og installationens egne), og om du må rette dem.',
    kort: 'Lageransvarlig: vedligeholdets opgavetyper.', eksempler: ['hvilke opgavetyper har vi?'] },
  { navn: 'lager_ansvarlig_vedligehold_type_opret', titel: 'Lageransvarlig: ny opgavetype', op: 'POST /ansvarlig/vedligehold/typer',
    beskrivelse: 'Ny opgavetype til vedligehold (navn, evt. noegle og beskrivelse). Kræver lageransvarlig på alle installationens lagre.',
    kort: 'Lageransvarlig: opret en opgavetype til vedligehold.', eksempler: ['opret opgavetypen «trykprøvning»'] },
  { navn: 'lager_ansvarlig_vedligehold_type_ret', titel: 'Lageransvarlig: ret opgavetype', op: 'PUT /ansvarlig/vedligehold/typer/{id}', alias: { id: 'typeId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret en opgavetypes navn og beskrivelse, eller slå den fra. Kræver lageransvarlig på alle lagre; en indbygget type kan kun slås fra og til (409).' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en opgavetype fra.', eksempler: ['kalibrering hedder nu «kalibrering og justering»'],
    beskriv: { typeId: 'Opgavetypens id (se lager_ansvarlig_vedligehold_typer).' } },

  { navn: 'lager_ansvarlig_vedligehold_forfald', titel: 'Lageransvarlig: vedligehold, der forfalder', op: 'GET /ansvarlig/vedligehold/forfald',
    beskrivelse: 'Det, der forfalder: hver vedligeholdsopgave pr. enhed eller lokation med næste forfald og status (overskredet, snart, ukendt, ok), filtreret på enhed, model, lokation, type eller status.',
    kort: 'Lageransvarlig: eftersyn og andet vedligehold, der forfalder.', eksempler: ['hvad skal efterses denne måned?', 'hvilke eftersyn er overskredet?'] },
  { navn: 'lager_ansvarlig_vedligehold_log', titel: 'Lageransvarlig: vedligeholdsloggen', op: 'GET /ansvarlig/vedligehold/log',
    beskrivelse: 'Vedligeholdsloggen, nyeste først, for en enhed, en lokation eller en opgave.',
    kort: 'Lageransvarlig: udført vedligehold (servicehistorikken).', eksempler: ['hvornår blev T-00012 sidst efterset?'] },
  { navn: 'lager_ansvarlig_vedligehold_udfoert', titel: 'Lageransvarlig: registrér udført vedligehold', op: 'POST /ansvarlig/vedligehold/log',
    beskrivelse: 'Registrér udført vedligehold: med opgaveId lukkes en engangsopgave, eller næste forfald flyttes; uden opgave en linje i servicehistorikken for en enhed eller lokation (type eller typeId). udfoert er datoen (standard i dag); omkostning og bilag er valgfri.',
    kort: 'Lageransvarlig: registrér et udført eftersyn eller anden service.', eksempler: ['T-00012 er efterset i dag', 'filtrene i udsugningen er skiftet'] },
  { navn: 'lager_ansvarlig_vedligehold_opgaver', titel: 'Lageransvarlig: vedligeholdsopgaver', op: 'GET /ansvarlig/vedligehold/opgaver',
    medId: { felt: 'opgaveId', op: 'GET /ansvarlig/vedligehold/opgaver/{id}' }, alias: { id: 'opgaveId' },
    beskrivelse: 'Uden opgaveId: opgaverne på en enhed (med dens models), en model eller en lokation. Med opgaveId: den ene opgave.',
    kort: 'Lageransvarlig: vedligeholdsopgaver på en enhed, model eller lokation.', eksempler: ['hvilke eftersyn har model 12?'],
    beskriv: { opgaveId: 'Opgavens id (fra listen eller lager_ansvarlig_vedligehold_forfald).' } },
  { navn: 'lager_ansvarlig_vedligehold_opgave_opret', titel: 'Lageransvarlig: ny vedligeholdsopgave', op: 'POST /ansvarlig/vedligehold/opgaver',
    beskrivelse: 'Ny vedligeholdsopgave på netop én ting: en enhed (tag), en model (modelId: alle dens enheder) eller en lokation (lokationId, eller lokation som kode med lagerId). Type (typeId eller type fra lager_ansvarlig_vedligehold_typer), interval i måneder eller dage, eller uden interval en engangsdato (forfald, fx garanti), og varsel i dage.',
    kort: 'Lageransvarlig: opret et eftersyn eller anden vedligeholdsopgave.', eksempler: ['borehammerne (model 12) skal efterses hver 12. måned', 'udsugningen i værkstedet skal have skiftet filter hver 3. måned'] },
  { navn: 'lager_ansvarlig_vedligehold_opgave_ret', titel: 'Lageransvarlig: ret vedligeholdsopgave', op: 'PUT /ansvarlig/vedligehold/opgaver/{id}', alias: { id: 'opgaveId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret en vedligeholdsopgaves titel, interval, forfald, varsel eller note; modellens eftersyn skriver intervallet tilbage på modelkortet.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret en vedligeholdsopgave (interval, forfald).', eksempler: ['eftersynet af model 12 skal være hver 6. måned'] },
  { navn: 'lager_ansvarlig_vedligehold_opgave_fjern', titel: 'Lageransvarlig: slå vedligeholdsopgave fra', op: 'DELETE /ansvarlig/vedligehold/opgaver/{id}', alias: { id: 'opgaveId' }, bekraeftes: true,
    beskrivelse: 'Slå en vedligeholdsopgave fra; loggen bliver. Vis opgaven, og send først med bekraeftet: true, når brugeren udtrykkeligt har sagt ja.',
    kort: 'Lageransvarlig: slå en vedligeholdsopgave fra (kræver brugerens ja).', eksempler: ['vi efterser ikke længere stigerne'] },

  // ---------------------------------------------------------------- skriv: klima, alarmer og styring
  { navn: 'lager_ansvarlig_iot_styr', titel: 'Lageransvarlig: styr lys og ventilation', op: 'POST /iot/enheder/{id}/styr', alias: { id: 'enhedId' }, idempotent: true, aabenVerden: true,
    beskrivelse: 'Overstyr et lys, en kontakt eller et ventilationsanlæg gennem Home Assistant. Bekræft med brugeren før du tænder, slukker eller ændrer: taend, sluk, hastighed (vaerdi i %), forvalg (vaerdi, fx auto), lysstyrke (%), drift eller blaeser. Hvad enheden kan, står i lager_iot_lokation_styring. Kraftige eller lange forvalg (boost, ude …) kræver bekraeft: true efter brugerens ja. Står i revisionsloggen.',
    kort: 'Lageransvarlig: sæt hastighed, forvalg eller lysstyrke på lys og ventilation.', eksempler: ['sæt ventilationen i værkstedet på 60 %', 'sæt anlægget på auto'],
    beskriv: { bekraeft: 'true, når brugeren har bekræftet et kraftigt eller langt forvalg (boost, ude …).' } },
  { navn: 'lager_ansvarlig_iot_alarm_kvitter', titel: 'Lageransvarlig: kvittér for alarm', op: 'POST /iot/alarmer/{id}/kvitter', alias: { id: 'alarmId' }, idempotent: true,
    beskrivelse: 'Kvittér for en alarm: den er set. Den slutter først, når værdien er tilbage.',
    kort: 'Lageransvarlig: kvittér for en klimaalarm.', eksempler: ['kvittér for fugtalarmen i containeren'] },
  { navn: 'lager_ansvarlig_iot_alarmregel_opret', titel: 'Lageransvarlig: ny alarmregel', op: 'POST /iot/alarmregler',
    beskrivelse: 'Ny alarmregel på en lokation eller en IoT-enhed: over/under en grænse for en metrik (temperatur, fugt, co2 …), dugpunkt, offline eller batteri, med hysterese og varighed.',
    kort: 'Lageransvarlig: opret en alarmregel (fx fugt over 70 % i 30 min).', eksempler: ['alarm når fugten i containeren er over 70 % i en halv time'] },
  { navn: 'lager_ansvarlig_iot_alarmregel_ret', titel: 'Lageransvarlig: ret alarmregel', op: 'PUT /iot/alarmregler/{id}', alias: { id: 'alarmregelId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret grænse, hysterese, varighed, navn eller aktiv. Målet og slagsen står fast; slås reglen fra, slutter dens åbne alarmer.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en alarmregel fra.', eksempler: ['fugtgrænsen skal være 75 %'] },
  { navn: 'lager_ansvarlig_iot_alarmregel_fjern', titel: 'Lageransvarlig: fjern alarmregel', op: 'DELETE /iot/alarmregler/{id}', alias: { id: 'alarmregelId' }, bekraeftes: true,
    beskrivelse: 'Fjern reglen: slettes uden alarmer, ellers slås den fra, og historikken bliver. Bekræft med brugeren først.',
    kort: 'Lageransvarlig: fjern en alarmregel.', eksempler: ['fjern temperaturalarmen i skuret'] },
  { navn: 'lager_ansvarlig_iot_luftkvalitetsregler', titel: 'Lageransvarlig: standardregler for luftkvalitet', op: 'POST /iot/lokationer/{id}/luftkvalitetsregler', alias: { id: 'lokationId' }, idempotent: true,
    beskrivelse: 'Opret standardens alarmregler for luftkvalitet på lokationen: én over-regel pr. metrik, den måler (eller dem i metrikker). En metrik med en aktiv over-regel springes over.',
    kort: 'Lageransvarlig: opret standardalarmer for CO₂, VOC og partikler i et rum.', eksempler: ['giv værkstedet alarmer for luftkvalitet'] },

  // ---------------------------------------------------------------- skriv: placeringsregler og procesflows
  { navn: 'lager_ansvarlig_placeringsregel_opret', titel: 'Lageransvarlig: ny placeringsregel', op: 'POST /ansvarlig/placeringsregler', forbyd: { 'hvem.asbest': HVEM_ASBEST },
    beskrivelse: 'Ny placeringsregel: skal_staa (det, reglen gælder, skal stå et sted med evnerne) eller kun (stedet er kun til det). hvem: maerker (særhåndteringsmærker som asbest, se lager_saermaerker), udenMaerker og/eller kategorier; steder: evnetypernes nøgler (se lager_evnetyper). Med lagerId lagerets egen; lagerId: null er hele installationens (kræver lageransvarlig på alle lagre).',
    kort: 'Lageransvarlig: opret en placeringsregel (hvad skal stå hvor).', eksempler: ['batterier skal stå et sted med brandsikring'] },
  { navn: 'lager_ansvarlig_placeringsregel_ret', titel: 'Lageransvarlig: ret placeringsregel', op: 'PATCH /ansvarlig/placeringsregler/{id}', alias: { id: 'placeringsregelId' }, destruktiv: true, forbyd: { 'hvem.asbest': HVEM_ASBEST }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret en placeringsregel eller slå den fra (aktiv: false), også de indbyggede (fx særzonerne for et mærke). Nøglen ligger fast. hvem.maerker er særhåndteringsmærkerne (se lager_saermaerker). SÆRHÅNDTERING (asbest, bly, PCB …): enhver ændring af en regel, der dækker udstyr med et særhåndteringsmærke (aktiv, hvem, slags, steder), er sikkerhedsrelevant og kræver brugerens udtrykkelige ja, før du kalder: forklar, hvad ændringen gør ved værnet. Svarer lageret 409, så spørg brugeren og vent på svaret; send aldrig bekraeft på eget initiativ.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en placeringsregel fra.', eksempler: ['reglen for batterier gælder kun lager 2'],
    beskriv: { bekraeft: 'Udelad det. Kun true, når brugeren efter et 409 udtrykkeligt har sagt ja til netop denne ændring af en regel for et særhåndteringsmærke (fx asbest).' } },
  { navn: 'lager_ansvarlig_procesflow_opret', titel: 'Lageransvarlig: nyt procesflow', op: 'POST /ansvarlig/procesflows',
    destruktiv: true, forbyd: { 'start.hvem.asbest': HVEM_ASBEST },
    beskrivelse: 'Nyt procesflow: status (karantaene eller til_klargoering), hvornår det starter (ved retur, evt. kun skadet eller for særhåndteringsmærker i start.hvem.maerker, fx asbest, eller kategorier, eller manuelt) og trinene med sted, hvem der udfører dem, tjekliste og certificering. Det sidste trin er frigivelsen. Med lagerId lagerets eget; lagerId: null er hele installationens (kræver lageransvarlig på alle lagre). SÆRHÅNDTERING (asbest, bly, PCB …): et flow, der tager udstyr med et særhåndteringsmærke (start.hvem.maerker), bestemmer, hvordan det rengøres og frigives, og et for hele installationen kan gå forud for installationens flow for mærket (fx det indbyggede asbestflow). Forklar brugeren trin, steder, frigivesAf, tjekliste og certificering, og opret det kun efter brugerens udtrykkelige ja. Svarer lageret 409, så spørg brugeren og vent på svaret; send aldrig bekraeft på eget initiativ.',
    kort: 'Lageransvarlig: opret et procesflow (fx rengøring før frigivelse).', eksempler: ['skadet værktøj skal efterses før det kommer på hylden'],
    beskriv: { bekraeft: 'Udelad det. Kun true, når brugeren efter et 409 udtrykkeligt har sagt ja til et flow for et særhåndteringsmærke (fx asbest) for hele installationen.' } },
  { navn: 'lager_ansvarlig_procesflow_ret', titel: 'Lageransvarlig: ret procesflow', op: 'PATCH /ansvarlig/procesflows/{id}', alias: { id: 'procesflowId' }, destruktiv: true, bekraeftes: deaktiverer,
    beskrivelse: 'Ret et procesflow eller slå det fra (aktiv: false). I start.hvem bruges maerker og udenMaerker (særhåndteringsmærkernes nøgler, se lager_saermaerker), ikke det forældede asbest. Et trin, et aktivt forløb står på, kan ikke fjernes, og status kan ikke ændres med aktive forløb (409). SÆRHÅNDTERING (asbest, bly, PCB …): enhver ændring af et flow, der dækker udstyr med et særhåndteringsmærke (aktiv, start, trin, steder, frigivesAf, tjekliste, certificering), er sikkerhedsrelevant og kræver brugerens udtrykkelige ja, før du kalder: forklar, hvad ændringen gør ved værnet. Svarer lageret 409 om et mærke, så spørg brugeren og vent på svaret; send aldrig bekraeft på eget initiativ.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå et procesflow fra.', eksempler: ['rengøringen skal have et punkt mere på tjeklisten'],
    beskriv: { bekraeft: 'Udelad det. Kun true, når brugeren efter et 409 udtrykkeligt har sagt ja til netop denne ændring af et flow for et særhåndteringsmærke (fx asbest).' } },
  { navn: 'lager_ansvarlig_procesforloeb_start', titel: 'Lageransvarlig: start procesforløb', op: 'POST /ansvarlig/procesforloeb',
    beskrivelse: 'Start et flow i hånden på en enhed: enheden spærres med flowets status (karantæne eller klargøring), og forløbet står på første trin. Bekræft med brugeren først.',
    kort: 'Lageransvarlig: sæt en enhed i et procesflow (spærrer den).', eksempler: ['T-00012 skal rengøres før den lånes ud igen'],
    beskriv: { flow: 'Flowets id eller nøgle (se lager_procesflows).' } },
  { navn: 'lager_procesforloeb_udfoer', titel: 'Udfør et trin i procesforløbet', op: 'POST /procesforloeb/{id}/udfoer', alias: { id: 'forloebId' }, destruktiv: true,
    beskrivelse: 'Udfør trinnet, forløbet står på (trin = nøglen fra lager_procesforloeb). Tjeklistens påkrævede punkter (tjekket) og trinnets certificering skal med; et trin for den lageransvarlige kræver hende. Det sidste trin er frigivelsen: enheden kan bruges igen, og så kræver hvert af enhedens særhåndteringsmærker (fx asbest, se lager_saermaerker) sin certificering (certificeret). Sikkerhedsrelevant: bekræft altid med brugeren før kaldet, at trinnet er udført, hvert punkt, du krydser af, og certificeringen. Bed brugeren selv bekræfte, at certificeringen (trinnets og mærkernes) er i orden, og sæt aldrig certificeret på eget initiativ. Kryds aldrig noget af og bekræft aldrig en certificering, brugeren ikke selv har bekræftet. Står i loggen med brugerens navn.',
    kort: 'Udfør et trin i et procesforløb (rengøring, eftersyn, frigivelse).', eksempler: ['T-00012 er rengjort', 'frigiv T-00012 efter rengøringen'],
    beskriv: {
      tjekket: 'Nøglerne på de tjeklistepunkter, brugeren har bekræftet er udført.',
      certificeret: 'true kun når brugeren selv har bekræftet trinnets certificering og, ved frigivelsen, særhåndteringsmærkernes. Spørg brugeren; sæt det aldrig af dig selv.',
    } },
  // Særhåndteringsmærkerne er sikkerhedsværn: begge skrivninger er destruktive og kræver brugerens ja.
  { navn: 'lager_ansvarlig_saermaerke_opret', titel: 'Lageransvarlig: nyt særhåndteringsmærke', op: 'POST /ansvarlig/saermaerker', destruktiv: true,
    beskrivelse: 'Nyt særhåndteringsmærke (fx bly, PCB) for hele installationen (kræver lageransvarlig på alle lagre): værnet ved retur (retur: til_klargoering som standard, karantaene eller ingen), certificeringen, den, der frigiver, skal bekræfte, og zoneregler: true lægger to placeringsregler ind (udstyret står i en særzone for mærket eller i service, karantæne eller modtagelsen, og særzonen er kun til det). Sikkerhedsrelevant: forklar brugeren værnet, certificeringen og reglerne, og opret det kun efter brugerens udtrykkelige ja.',
    kort: 'Lageransvarlig: opret et særhåndteringsmærke (bly, PCB …) med værn og certificering.', eksempler: ['vi skal kunne mærke udstyr, der har været brugt i bly'] },
  { navn: 'lager_ansvarlig_saermaerke_ret', titel: 'Lageransvarlig: ret særhåndteringsmærke', op: 'PATCH /ansvarlig/saermaerker/{noegle}', destruktiv: true, bekraeftes: deaktiverer,
    beskrivelse: 'Ret et særhåndteringsmærke (også det indbyggede asbest): navn (null = standardnavnet igen), beskrivelse, retur, certificering, aktiv, sortering. Nøglen ligger fast. At slå det fra, give det et andet værn ved retur eller fjerne eller ændre certificeringen løsner værnet og er sikkerhedsrelevant: bekræft altid med brugeren, før du kalder, og forklar, hvad ændringen gør ved værnet. Er mærket i brug, svarer lageret 409 med antallene: vis dem, spørg brugeren og vent på svaret; send aldrig bekraeft på eget initiativ.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå et særhåndteringsmærke fra.', eksempler: ['asbestmærket skal hedde «Asbest (sanering)»', 'frigivelse af blyudstyr kræver certifikat B'],
    beskriv: { noegle: 'Mærkets nøgle (se lager_saermaerker).', bekraeft: 'Udelad det. Kun true, når brugeren efter et 409 udtrykkeligt har sagt ja til netop denne løsnelse af værnet for et mærke i brug.' } },
  { navn: 'lager_ansvarlig_enhedsfelter_opret', titel: 'Lageransvarlig: nyt feltsæt', op: 'POST /ansvarlig/enhedsfelter',
    beskrivelse: 'Nyt feltsæt for enhedernes egne felter (nøgle, navn, felter). Med lagerId lagerets enheder; lagerId: null alle enheder på installationen (kræver lageransvarlig på alle lagre).',
    kort: 'Lageransvarlig: opret et feltsæt for enhedernes egne felter.', eksempler: ['enhederne skal have et felt for kalibreringsdato'] },
  { navn: 'lager_ansvarlig_enhedsfelter_ret', titel: 'Lageransvarlig: ret feltsæt', op: 'PATCH /ansvarlig/enhedsfelter/{id}', alias: { id: 'feltsaetId' }, bekraeftes: deaktiverer,
    beskrivelse: 'Ret et feltsæt (også det indbyggede): navn, beskrivelse, felter, eller slå det fra (aktiv: false; værdierne på enhederne bliver stående). Nøglen ligger fast.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå et feltsæt fra.', eksempler: ['kalibreringsfeltet er ikke påkrævet'],
    beskriv: { feltsaetId: 'Feltsættets id (se lager_enhedsfelter).' } },
  { navn: 'lager_ansvarlig_enhed_egenskaber', titel: 'Lageransvarlig: enhedens egne felter', op: 'PUT /ansvarlig/enheder/{tag}/egenskaber',
    beskrivelse: 'Sæt enhedens egne felter efter feltsættene (se lager_enhedsfelter). Flettes ind i de gemte; null fjerner et felt.',
    kort: 'Lageransvarlig: sæt en enheds egne felter (feltsættene).', eksempler: ['T-00012 er kalibreret 2026-09-01'] },
  { navn: 'lager_ansvarlig_forbrugsgruppe_opret', titel: 'Lageransvarlig: ny forbrugsgruppe', op: 'POST /ansvarlig/forbrugsgrupper',
    beskrivelse: 'Ny forbrugsgruppe for hele installationen (kræver lageransvarlig på alle lagre): nøgle, navn, aktiv, fremhaevet, sortering.',
    kort: 'Lageransvarlig: opret en forbrugsgruppe.', eksempler: ['opret en gruppe for elartikler'] },
  { navn: 'lager_ansvarlig_forbrugsgruppe_ret', titel: 'Lageransvarlig: ret forbrugsgruppe', op: 'PATCH /ansvarlig/forbrugsgrupper/{noegle}', bekraeftes: deaktiverer,
    beskrivelse: 'Ret en forbrugsgruppe (også en indbygget): navn (null = standardnavnet igen), aktiv, fremhaevet, sortering. Nøglen ligger fast; slås den fra, bliver varerne i den.' + DEAKTIVER_TEKST,
    kort: 'Lageransvarlig: ret eller slå en forbrugsgruppe fra.', eksempler: ['værnemidler skal stå først'],
    beskriv: { noegle: 'Gruppens nøgle (se lager_forbrugsgrupper).' } },

  // ---------------------------------------------------------------- skriv: udlån, kanban og stregkoder
  // aabenVerden: paamind sender mail til låneren, en tredjepart uden konto.
  { navn: 'lager_udlaan_ret', titel: 'Ret et udlån', op: 'PATCH /udlaan/{id}', alias: { id: 'udlaanId' }, nullbar: ['forventetRetur', 'telefon', 'mail'], aabenVerden: true,
    beskrivelse: 'Ret et af dine åbne udlån: forventet retur (gælder også enhederne), kontakten (telefon, mail), og påmindelsen på mail til låneren. paamind: true sender låneren mail: kun efter brugerens udtrykkelige ja for netop dette udlån, og kræver en mail. Navnet rettes ikke; null sletter et felt.',
    kort: 'Ret forventet retur, kontakt eller påmindelse på et udlån.', eksempler: ['stigen kommer først retur fredag', 'mind låneren om boret'] },
  { navn: 'lager_ansvarlig_kanban_opret', titel: 'Lageransvarlig: nyt kanbankort', op: 'POST /ansvarlig/kanban',
    beskrivelse: 'Et nyt kanbankort til en forbrugsvare på en lokation, der står på varen (se lager_ansvarlig_forbrugsvare_beholdninger), med antallet, der genbestilles, når kassen er tom. Flere kort til samme sted er tilladt (to kasser). Etiketten med QR-koden trykkes fra appen.',
    kort: 'Lageransvarlig: opret et kanbankort (2-bin-genbestilling) til en vare.', eksempler: ['giv skruerne i bin K-17 et kanbankort på 500'] },
  { navn: 'lager_ansvarlig_kanban_ret', titel: 'Lageransvarlig: ret kanbankort', op: 'PATCH /ansvarlig/kanban/{id}', alias: { id: 'kanbanId' }, beskriv: { kanbanId: FAELLES_BESKRIVELSER.kanbanId! },
    beskrivelse: 'Ret kortets antal. En åben genbestilling beholder sit. kanbanId er række-id\'et fra lager_ansvarlig_kanban, fundet ud fra kortets kode (KB-…).',
    kort: 'Lageransvarlig: ret antallet på et kanbankort.', eksempler: ['kortet KB-3f9a1c2e skal bestille 1000'] },
  { navn: 'lager_ansvarlig_kanban_tilbagekald', titel: 'Lageransvarlig: kald kanbankort tilbage', op: 'DELETE /ansvarlig/kanban/{id}', alias: { id: 'kanbanId' }, bekraeftes: true, beskriv: { kanbanId: FAELLES_BESKRIVELSER.kanbanId! },
    beskrivelse: 'Kald kortet tilbage: det trykte kort virker ikke mere og kan ikke genoplives. En åben genbestilling bliver stående. kanbanId er række-id\'et fra lager_ansvarlig_kanban, fundet ud fra kortets kode (KB-…). Bekræft med brugeren først.',
    kort: 'Lageransvarlig: kald et kanbankort tilbage (det trykte kort holder op med at virke).', eksempler: ['kortet KB-3f9a1c2e er væk, kald det tilbage'] },
  { navn: 'lager_ansvarlig_forbrugsvare_stregkoder', titel: 'Lageransvarlig: varens stregkoder', op: 'PUT /ansvarlig/forbrugsvarer/{id}/stregkoder', alias: { id: 'forbrugsvareId' }, destruktiv: true,
    beskrivelse: 'Sæt forbrugsvarens stregkoder: listen er hele sættet og erstatter de gemte ([] fjerner alle; bekræft med brugeren før du fjerner nogen). Samme kode i to former er én; højst 20. 409: koden står på en anden vare.',
    kort: 'Lageransvarlig: sæt en forbrugsvares stregkoder (EAN/GTIN).', eksempler: ['kabelbinderne har stregkoden 5701234567892'] },

  // ---------------------------------------------------------------- skriv: indretning (mål og skabeloner)
  { navn: 'lager_ansvarlig_model_maal', titel: 'Lageransvarlig: modellens mål', op: 'PUT /ansvarlig/modeller/{id}/maal', alias: { id: 'modelId' },
    nullbar: ['bredde_mm', 'dybde_mm', 'hoejde_mm', 'omrids'],
    beskrivelse: 'Modellens mål i hele mm, som tingen ligger, og valgfrit et omrids set oppefra (til skum skåret efter værktøjet). Felterne, der er med, erstattes; null fjerner et mål. Bruges af lager_find_plads og lager_lokation_passer.',
    kort: 'Lageransvarlig: sæt en models mål (bredde, dybde, højde i mm).', eksempler: ['boremaskinen er 30 × 25 × 9 cm'] },
  { navn: 'lager_ansvarlig_skabelon_fravalg_saet', titel: 'Lageransvarlig: slå skabelon fra eller til', op: 'PUT /ansvarlig/skabeloner/fravalg',
    beskrivelse: 'Slå en indbygget skabelon (noegle) eller en hel familie fra eller til, for lageret eller hele installationen (installation: true kræver lageransvarlig på alle lagre). En fravalgt vises ikke i biblioteket og oprettes ikke direkte; som barn af en anden skabelon virker den stadig.',
    kort: 'Lageransvarlig: skjul eller vis indbyggede skabeloner i biblioteket.', eksempler: ['vi bruger ikke skuffereoler, skjul dem'] },
];
