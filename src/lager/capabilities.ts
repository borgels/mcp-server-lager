export type Capability = { tool: string; write: boolean; summary: string; examples: string[] };

/** Kortet over serveren, så en klient kan finde det rigtige værktøj før første kald. */
export const CAPABILITIES: Capability[] = [
  { tool: 'lager_search_capabilities', write: false, summary: 'Søg i denne liste.', examples: ['hvilke værktøjer findes til forbrugsvarer'] },
  { tool: 'lager_me', write: false, summary: 'Hvem er du, dine lagre, roller og lagrets tal.', examples: ['hvilke lagre har jeg adgang til'] },
  { tool: 'lager_projekter', write: false, summary: 'Projekter, du kan afhente til og booke på.', examples: ['hvilke sager kan jeg tage værktøj ud til'] },
  { tool: 'lager_mine', write: false, summary: 'Værktøj, du har ude, pr. projekt, med dagsleje.', examples: ['hvad har jeg ude lige nu'] },
  { tool: 'lager_opslag', write: false, summary: 'Slå et mærke (tag) eller serienummer op: hvad er det, hvem har det, værnemidler og dokumenter.', examples: ['hvem har OMM-00012', 'brugsanvisning til OMM-00012'] },
  { tool: 'lager_model', write: false, summary: 'En model for brugeren: navn, fotos, dokumenter, værnemidler (ingen priser).', examples: ['datablad for model 12'] },
  { tool: 'lager_forbrugsvarer', write: false, summary: 'Kataloget af forbrugsvarer med beholdning og salgspris.', examples: ['er der diamantklinger på lager'] },
  { tool: 'lager_bestillinger', write: false, summary: 'Dine bestillinger: klar, på vej, hentet.', examples: ['er min bestilling klar'] },
  { tool: 'lager_bookinger', write: false, summary: 'Dine bookinger.', examples: ['hvad har jeg booket til næste uge'] },
  { tool: 'lager_ansvarlig_overblik', write: false, summary: 'Lageransvarlig: tal, det der kræver handling, seneste bevægelser.', examples: ['hvad kræver handling på lageret'] },
  { tool: 'lager_ansvarlig_modeller', write: false, summary: 'Lageransvarlig: modeller med antal og priser, eller én model i dybden.', examples: ['modeller uden pris', 'alt om model 12'] },
  { tool: 'lager_ansvarlig_enheder', write: false, summary: 'Lageransvarlig: enheder på lageret filtreret på status, model, søgning; eller én enhed med historik.', examples: ['enheder på værksted', 'historik for OMM-00012'] },
  { tool: 'lager_ansvarlig_forbrugsvarer', write: false, summary: 'Lageransvarlig: forbrugsvarer med beholdning, minimum, kost- og salgspris.', examples: ['hvad er under minimum'] },
  { tool: 'lager_ansvarlig_bestillinger', write: false, summary: 'Lageransvarlig: bestillingslisten pr. leverandør og alle bestillinger.', examples: ['hvad skal bestilles hos STARK'] },
  { tool: 'lager_ansvarlig_perioder', write: false, summary: 'Lageransvarlig: lejeperioder pr. enhed eller i et vindue.', examples: ['lejeperioder i august for OMM-00012'] },
  { tool: 'lager_ansvarlig_afregninger', write: false, summary: 'Lageransvarlig: afregninger OMM → køber, eller én afregning pr. sag.', examples: ['status på septembers afregning'] },
  { tool: 'lager_ansvarlig_koe', write: false, summary: 'Lageransvarlig: ukendte mærker, karantæne, klargøring, afstemning.', examples: ['hvad står i karantæne'] },
  { tool: 'lager_saet', write: false, summary: 'Et sæts indhold: dele med/uden for sættet, pakkeliste, hvad der mangler.', examples: ['hvad er der i kasse OMM-00031', 'mangler der noget i sættet'] },
  { tool: 'lager_ansvarlig_pladser', write: false, summary: 'Lageransvarlig: zoner, reoler og hylder (Zone-Reol-Hylde) og de særlige zoner.', examples: ['hvilke pladser er der i zone A', 'hvad står i karantæne-zonen'] },
  { tool: 'lager_tjek_ud', write: true, summary: 'Tag værktøj med ud til et projekt (koder = tags).', examples: ['tag OMM-00012 og OMM-00013 med til sag 2602'] },
  { tool: 'lager_aflever', write: true, summary: 'Aflevér værktøj; svaret siger hvor det skal stå.', examples: ['aflever OMM-00012'] },
  { tool: 'lager_flyt_projekt', write: true, summary: 'Flyt udlejet værktøj til et andet projekt uden om lageret.', examples: ['flyt alt mit fra Nørrebro til Valby'] },
  { tool: 'lager_forbrug', write: true, summary: 'Køb forbrugsvarer til projektet; udsolgt bestilles via indkøb.', examples: ['tag 2 diamantklinger til sag 2602'] },
  { tool: 'lager_bestil', write: true, summary: 'Bestil forbrugsvarer via indkøb; koster først ved afhentning.', examples: ['bestil 10 partikelfiltre til sag 2588'] },
  { tool: 'lager_bestilling_hent', write: true, summary: 'Afhent en klar bestilling: udtaget koster på sagen.', examples: ['jeg henter bestilling 17'] },
  { tool: 'lager_bestilling_fortryd', write: true, summary: 'Fortryd en bestilling, indtil den er klar.', examples: ['fortryd bestilling 17'] },
  { tool: 'lager_ansvarlig_modtag_levering', write: true, summary: 'Lageransvarlig: modtag en levering; bestilte varer lægges til side til dem, der venter.', examples: ['modtag 10 filtre på faktura FA541127'] },
  { tool: 'lager_ansvarlig_saet_paa_plads', write: true, summary: 'Lageransvarlig: sæt enheder på en plads (hjemmeplads), fx A-12-3; reglerne for asbest og karantæne gælder.', examples: ['sæt OMM-00012 på A-12-3'] },
  { tool: 'lager_ansvarlig_send_bestillingsliste', write: true, summary: 'Lageransvarlig: send bestillingslisten for én leverandør til indkøb.', examples: ['send listen til STARK'] },
];

export function searchCapabilities(query: string, limit = 20): Capability[] {
  const q = query.trim().toLowerCase();
  const alle = q ? CAPABILITIES.filter((c) => `${c.tool} ${c.summary} ${c.examples.join(' ')}`.toLowerCase().includes(q)) : CAPABILITIES;
  return alle.slice(0, limit);
}
