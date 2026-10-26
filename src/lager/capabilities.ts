import { KATALOG } from '../tools/katalog.js';
import { byg } from '../tools/bygger.js';
import { slaaetFra, type Moduler } from './moduler.js';
import { afvisning, type Adgang } from './roller.js';

export type Capability = {
  tool: string;
  write: boolean;
  /** Den lageransvarliges værktøj (skjules for en værktøjsbruger). */
  ansvarlig: boolean;
  /** Kræver bekraeftet: true, brugerens udtrykkelige ja. */
  bekraeftes: boolean;
  summary: string;
  examples: string[];
  moduler: string[];
};

/** Kortet over serveren, så en klient kan finde det rigtige værktøj før første kald. Bygget af kataloget. */
export const CAPABILITIES: Capability[] = [
  { tool: 'lager_search_capabilities', write: false, ansvarlig: false, bekraeftes: false, summary: 'Søg i denne liste.', examples: ['hvilke værktøjer findes til forbrugsvarer'], moduler: [] },
  ...KATALOG.map((s) => {
    const b = byg(s);
    return { tool: s.navn, write: b.skriv, ansvarlig: b.ansvarlig, bekraeftes: b.bekraeftes, summary: s.kort, examples: s.eksempler, moduler: b.moduler };
  }),
];

export function searchCapabilities(query: string, limit = 20, moduler: Moduler | null = null, adgang?: Adgang): Capability[] {
  const q = query.trim().toLowerCase();
  const synlige = CAPABILITIES.filter((c) => slaaetFra(c.moduler, moduler).length === 0 && !(adgang && afvisning({ navn: c.tool, skriv: c.write, ansvarlig: c.ansvarlig }, adgang)));
  const alle = q ? synlige.filter((c) => `${c.tool} ${c.summary} ${c.examples.join(' ')}`.toLowerCase().includes(q)) : synlige;
  return alle.slice(0, limit);
}
