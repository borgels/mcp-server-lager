import type { LagerClient } from './client.js';

export type Moduler = Record<string, boolean>;

/**
 * Installationens moduler fra /me (`moduler`: id → til/fra). De gælder hele
 * installationen, ikke den enkelte bruger, så én cache pr. proces er nok.
 * Kan /me ikke nås, er svaret null, og intet skjules: appen afviser selv en
 * rute, hvis modul er slået fra.
 */
export class ModulCache {
  private data: Moduler | null = null;
  private tid = 0;
  private igang: Promise<Moduler | null> | null = null;

  constructor(private readonly ttlMs = Number(process.env.LAGER_MODULER_TTL_MS ?? 5 * 60_000)) {}

  /** Det senest kendte, uden at spørge appen. */
  senest(): Moduler | null {
    return this.data;
  }

  /** Modulerne fra et /me, der alligevel blev hentet (LagerrolleCache), så de ikke hentes igen. */
  saet(moduler: Moduler): void {
    this.data = moduler;
    this.tid = Date.now();
  }

  async hent(client: LagerClient): Promise<Moduler | null> {
    if (this.data && Date.now() - this.tid < this.ttlMs) return this.data;
    this.igang ??= client
      .get<{ moduler?: Moduler }>('/me')
      .then((me) => {
        if (me?.moduler && typeof me.moduler === 'object') {
          this.data = me.moduler;
          this.tid = Date.now();
        }
        return this.data;
      })
      .catch(() => this.data)
      .finally(() => {
        this.igang = null;
      });
    return this.igang;
  }
}

/** De af `kraevet`, der er slået fra; tom, når alt er til eller intet vides. */
export function slaaetFra(kraevet: readonly string[], moduler: Moduler | null): string[] {
  if (!moduler) return [];
  return kraevet.filter((m) => moduler[m] === false);
}

export function modulBesked(tool: string, fra: string[]): string {
  return `${tool} findes ikke i denne installation: modulet ${fra.join(', ')} er slået fra (se lager_me → moduler).`;
}
