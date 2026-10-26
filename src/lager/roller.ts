import type { LagerClient } from './client.js';
import type { Moduler } from './moduler.js';

/**
 * Hvem må hvad gennem MCP. To lag, der begge skal sige ja, og lageret håndhæver
 * desuden altid sine egne roller:
 *
 *  1. Gatewayens roller (X-MCP-Roles, fra personens Entra-grupper i hosts.json `roles`):
 *       lager-laes   læse: opslag, lister, overblik
 *       lager-skriv  læse og skrive (inkl. lager-laes)
 *     LAGER_ROLLER bestemmer, hvor de kommer fra:
 *       - "gateway": pr. kald fra X-MCP-Roles; HTTP kræver LAGER_TRUST_FORWARDED_USER=true.
 *         Uden en kendt rolle afvises kaldet (403), som Intempus-serveren.
 *       - en fast rolle ("lager-laes" eller "lager-skriv"): den samme for alle kald (stdio,
 *         en instans til ét formål). Standard "lager-skriv", så en installation uden roller
 *         i gatewayen virker som før.
 *     LAGER_ENABLE_WRITES=true er stadig hovedafbryderen: uden den skriver ingen.
 *
 *  2. Lagerets egne roller fra /me (vaerktoejsbruger, lageransvarlig, kiosk pr. lager).
 *     Den lageransvarliges værktøjer (lager_ansvarlig_*, scenario_* og alt under /ansvarlig)
 *     vises kun for den, der er lageransvarlig på mindst ét lager; en konto, der kun er kiosk,
 *     ser kun lager_me. Det er synlighed og en ekstra vagt: lageret afviser selv (403).
 */
export const GATEWAY_ROLLER = ['lager-laes', 'lager-skriv'] as const;
export type GatewayRolle = (typeof GATEWAY_ROLLER)[number];

/** Roller kommer pr. kald fra gatewayen (LAGER_ROLLER=gateway). */
export function rollerFraGateway(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LAGER_ROLLER ?? '').trim().toLowerCase() === 'gateway';
}

/** En kommasepareret liste → de kendte roller i fast rækkefølge; ukendte ignoreres. */
export function tolkRoller(v: string | undefined | null): GatewayRolle[] {
  const oensket = new Set((v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  return GATEWAY_ROLLER.filter((r) => oensket.has(r));
}

/** De faste roller (når de ikke kommer fra gatewayen). Standard lager-skriv: som før rollerne. */
export function konfigureredeRoller(env: NodeJS.ProcessEnv = process.env): GatewayRolle[] {
  if (rollerFraGateway(env)) return [];
  const r = tolkRoller(env.LAGER_ROLLER ?? 'lager-skriv');
  if ((env.LAGER_ROLLER ?? '').trim() && r.length === 0) {
    throw new Error(`LAGER_ROLLER=${env.LAGER_ROLLER}: brug gateway, lager-laes eller lager-skriv`);
  }
  return r.length ? r : ['lager-skriv'];
}

/**
 * Rollerne for ét HTTP-kald: fra X-MCP-Roles med LAGER_ROLLER=gateway (headeren sættes kun af
 * gatewayen ud fra det verificerede token; HTTP kræver LAGER_TRUST_FORWARDED_USER=true og
 * MCP_HTTP_TOKEN), ellers de konfigurerede. Tom liste = ingen adgang (kaldet afvises med 403).
 */
export function rollerForKald(xMcpRoles: string | undefined, env: NodeJS.ProcessEnv = process.env): GatewayRolle[] {
  if (!rollerFraGateway(env)) return konfigureredeRoller(env);
  return env.LAGER_TRUST_FORWARDED_USER === 'true' ? tolkRoller(xMcpRoles) : [];
}

/** Lagerets roller for personen, som /me siger dem. */
export type Lagerroller = {
  /** Lageransvarlig på mindst ét lager. */
  ansvarlig: boolean;
  /** Værktøjsbruger eller lageransvarlig på mindst ét lager. */
  medarbejder: boolean;
  /** Kun kiosk: en delt skærm, ikke en medarbejder. */
  kunKiosk: boolean;
  /**
   * /me kunne ikke slås op (fejl, ingen lagre, eller de sidst kendte roller er ældre end
   * LAGER_ROLLER_MAKS_ALDER_MS): fail-closed. Brugerens egne værktøjer vises (lageret afgør),
   * men den lageransvarliges skjules og afvises, til /me svarer igen.
   */
  ukendt?: boolean;
};

/** Rollerne, når /me ikke kan slås op: ingen lageransvarlig-værktøjer (fail-closed). */
export const UKENDTE_LAGERROLLER: Lagerroller = Object.freeze({ ansvarlig: false, medarbejder: true, kunKiosk: false, ukendt: true });

export type Adgang = {
  /** Gatewayens roller for kaldet. */
  roller: readonly GatewayRolle[];
  /**
   * Lagerets roller fra /me. null = ikke slået op (createServer uden roller, fx stdio-tests): intet
   * skjules, lageret afgør. Kunne /me ikke slås op, er det UKENDTE_LAGERROLLER (fail-closed).
   */
  lager: Lagerroller | null;
};

/** Må kaldet skrive efter gatewayens roller? (LAGER_ENABLE_WRITES gælder ovenpå.) */
export function maaSkrive(a: Pick<Adgang, 'roller'>): boolean {
  return a.roller.includes('lager-skriv');
}

/** Må kaldet læse? lager-skriv giver også læsning. */
export function maaLaese(a: Pick<Adgang, 'roller'>): boolean {
  return a.roller.includes('lager-laes') || a.roller.includes('lager-skriv');
}

/** Hvad værktøjet kræver, udledt af kataloget og kortet (bygger.ts). */
export type Krav = { navn: string; skriv: boolean; ansvarlig: boolean };

/** Altid synlige: man skal kunne se, hvem man er, og hvad man har. */
const ALTID = new Set(['lager_me', 'lager_search_capabilities']);

/**
 * Hvorfor værktøjet ikke er til personen, eller null, når det er. Teksten går til
 * klienten, når et skjult værktøj alligevel kaldes.
 */
export function afvisning(k: Krav, a: Adgang): string | null {
  if (ALTID.has(k.navn)) return null;
  if (!maaLaese(a)) return `${k.navn}: du har ingen lager-rolle i gatewayen (lager-laes eller lager-skriv).`;
  if (k.skriv && !maaSkrive(a)) return `${k.navn} skriver, og du har kun læseadgang til lageret gennem MCP (gatewayens rolle lager-skriv mangler).`;
  if (a.lager?.kunKiosk) return `${k.navn}: kioskkontoen kan kun bruges på kioskskærmen.`;
  if (k.ansvarlig && a.lager?.ukendt) return `${k.navn} kræver rollen lageransvarlig, og dine roller i lageret kunne ikke slås op lige nu (/me). Prøv igen om lidt.`;
  if (k.ansvarlig && a.lager && !a.lager.ansvarlig) return `${k.navn} kræver rollen lageransvarlig, og du er ikke lageransvarlig på noget lager (se lager_me).`;
  return null;
}

type Me = { moduler?: Moduler; lagre?: { ansvarlig?: boolean; medarbejder?: boolean; kiosk?: boolean }[]; ansvarlig?: boolean; kunKiosk?: boolean };

/** /me → lagerets roller; null, når svaret ikke har lagrene. */
export function lagerrollerFra(me: Me | undefined | null): Lagerroller | null {
  if (!me || !Array.isArray(me.lagre)) return null;
  const ansvarlig = me.ansvarlig ?? me.lagre.some((l) => l.ansvarlig === true);
  const medarbejder = me.lagre.some((l) => l.medarbejder === true || l.ansvarlig === true);
  return { ansvarlig, medarbejder, kunKiosk: me.kunKiosk ?? !medarbejder };
}

/**
 * Lagerets roller pr. bruger, kort cachet (standard 60 s, LAGER_ROLLER_TTL_MS): værktøjslisten
 * bygges pr. HTTP-kald, og en rolle, personen mister i lageret, skal hurtigt forsvinde her.
 * Et opslag giver også installationens moduler (samme /me), så ModulCache ikke spørger igen.
 *
 * Svarer /me ikke (eller uden lagre), bruges de sidst kendte roller højst LAGER_ROLLER_MAKS_ALDER_MS
 * (standard 5 minutter) fra det svar, de kom fra; derefter, og når intet er kendt,
 * UKENDTE_LAGERROLLER (fail-closed for den lageransvarliges værktøjer).
 */
export class LagerrolleCache {
  private readonly data = new Map<string, { roller: Lagerroller; tid: number }>();
  private readonly igang = new Map<string, Promise<Lagerroller>>();

  constructor(
    private readonly ttlMs = Number(process.env.LAGER_ROLLER_TTL_MS ?? 60_000),
    private readonly maksAlderMs = Number(process.env.LAGER_ROLLER_MAKS_ALDER_MS ?? 5 * 60_000),
  ) {}

  async hent(client: LagerClient, vedModuler?: (m: Moduler) => void): Promise<Lagerroller> {
    const noegle = client.user.toLowerCase();
    const kendt = this.data.get(noegle);
    if (kendt && Date.now() - kendt.tid < this.ttlMs) return kendt.roller;
    let p = this.igang.get(noegle);
    // De sidst kendte roller, mens de ikke er for gamle; ellers fail-closed.
    const reserve = (): Lagerroller => (kendt && Date.now() - kendt.tid < this.maksAlderMs ? kendt.roller : UKENDTE_LAGERROLLER);
    if (!p) {
      p = client
        .get<Me>('/me')
        .then((me) => {
          if (me?.moduler && typeof me.moduler === 'object') vedModuler?.(me.moduler);
          const roller = lagerrollerFra(me);
          if (roller) this.data.set(noegle, { roller, tid: Date.now() });
          // Et svar uden lagre caches ikke: næste kald spørger igen.
          return roller ?? reserve();
        })
        // Kan /me ikke nås (eller svarer 403: ingen lagre): de sidst kendte roller en kort tid, så fail-closed.
        .catch(() => reserve())
        .finally(() => this.igang.delete(noegle));
      this.igang.set(noegle, p);
    }
    return p;
  }
}
