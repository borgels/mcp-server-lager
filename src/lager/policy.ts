/**
 * Læsende tools er altid på. Skrivende (tjek ud, aflever, flyt, bestil, forbrug,
 * modtag levering) kræver LAGER_ENABLE_WRITES=true på instansen. Afregningens
 * godkend og bogfør findes med vilje IKKE her: det er den lageransvarliges
 * klik i appen, med kvittering.
 */
export function writesEnabled(): boolean {
  return process.env.LAGER_ENABLE_WRITES === 'true';
}

export function assertWritesEnabled(tool: string): void {
  if (!writesEnabled()) {
    throw new Error(`Skrivning er slået fra på denne lager-MCP (${tool}). Sæt LAGER_ENABLE_WRITES=true i serverens miljø.`);
  }
}

export const READ_TOOL_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
export const WRITE_TOOL_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
