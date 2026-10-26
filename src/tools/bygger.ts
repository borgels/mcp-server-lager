/**
 * Fra katalogets ToolSpec og OpenAPI-kortet til et zod-skema og et kald:
 * hvert felt i værktøjet ved, om det er en sti-parameter, en forespørgsel
 * eller en del af kroppen, og hvad det hedder i API'et.
 */
import { z } from 'zod/v4';
import type { LagerClient } from '../lager/client.js';
import { encodePathParam } from '../path-params.js';
import {
  erFlag, kraevOperation, kropsskema, modulerFor, splitOp, SPEC, tilZod, udenVaerktoejGrund,
  type JsonSkema, type OpenApiDoc, type OpNoegle,
} from '../openapi/spec.js';
import { FAELLES_ALIAS, FAELLES_BESKRIVELSER, type Input, type Sender, type ToolSpec } from './katalog.js';

type Plads = { hvor: 'path' | 'query' | 'body'; api: string; flag?: boolean };
export type Plan = { op: OpNoegle; felter: Record<string, Plads>; krop: boolean };

/** MCP's egen bekræftelse: et felt, der aldrig sendes til lageret. */
export const BEKRAEFTET = 'bekraeftet';
export const BEKRAEFTET_TEKST = 'Skal være true: brugeren har i samtalen udtrykkeligt sagt ja til netop denne handling, efter du har vist, hvad den gør (hvilken enhed, periode eller hvad der ellers rammes). Spørg først, og sæt det aldrig på eget initiativ. Det sendes ikke til lageret.';
export type Bygget = {
  shape: Record<string, z.ZodType>;
  skriv: boolean;
  sletter: boolean;
  /** idempotentHint: samme kald igen ændrer intet ud over det første. */
  idempotent: boolean;
  /** openWorldHint. */
  aabenVerden: boolean;
  moduler: string[];
  /**
   * Den lageransvarliges værktøj: navnet er lager_ansvarlig_*, eller en operation ligger
   * under /ansvarlig/ (fx scenario_*). Skjules for en værktøjsbruger (src/lager/roller.ts).
   */
  ansvarlig: boolean;
  /** Kaldet kræver bekraeftet: true, brugerens udtrykkelige ja (ToolSpec.bekraeftes). */
  bekraeftes: boolean;
  ops: OpNoegle[];
  send: (client: LagerClient) => Sender;
  vaelg: (input: Input) => OpNoegle;
};

/**
 * Ret felter efter en sti: «a», «a.b» eller «a.b.c» (gennem $ref og linjer). skjul fjerner
 * feltet; forbyd lader det stå, men som et felt, der altid afvises med beskeden (fx et
 * forældet asbest: at skrælle det af i stilhed kunne gøre en regel bredere). Stier,
 * der rammer et felt, lægges i `fundne`, så byg() kan afvise en sti, der intet rammer.
 */
function medRettedeFelter(s: JsonSkema, skjul: string[], forbyd: Record<string, string>, doc: OpenApiDoc, fundne: Set<string>): JsonSkema {
  const slaa = (o: JsonSkema): JsonSkema => (o.$ref ? doc.components?.schemas?.[o.$ref.replace('#/components/schemas/', '')] ?? o : o);
  const ret = (o: JsonSkema, led: string[], sti: string, blad: (r: JsonSkema, felt: string) => JsonSkema): JsonSkema => {
    const r = slaa(o);
    const [a, ...rest] = led as [string, ...string[]];
    const p = r.properties?.[a];
    if (!p) return r;
    if (!rest.length) {
      fundne.add(sti);
      return blad(r, a);
    }
    const ny = p.type === 'array' && p.items ? { ...p, items: ret(p.items, rest, sti, blad) } : ret(p, rest, sti, blad);
    return { ...r, properties: { ...r.properties, [a]: ny } };
  };
  let ud = s;
  for (const sti of skjul) {
    if (!sti.includes('.')) continue;
    ud = ret(ud, sti.split('.'), sti, (r, felt) => {
      const { [felt]: _vaek, ...props } = r.properties ?? {};
      return { ...r, properties: props, required: (r.required ?? []).filter((x) => x !== felt) };
    });
  }
  for (const [sti, besked] of Object.entries(forbyd)) {
    ud = ret(ud, sti.split('.'), sti, (r, felt) => ({
      ...r,
      properties: { ...r.properties, [felt]: { 'x-forbudt': besked, description: besked } },
      required: (r.required ?? []).filter((x) => x !== felt),
    }));
  }
  return ud;
}

/** Indskrænk enum-værdierne på «a.b» (eller «a») til de tilladte. */
function begraenset(s: JsonSkema, begraens: Record<string, string[]>, doc: OpenApiDoc): JsonSkema {
  const props = { ...(s.properties ?? {}) };
  for (const [sti, tilladt] of Object.entries(begraens)) {
    const [a, b] = sti.split('.') as [string, string | undefined];
    const p = props[a];
    if (!p) throw new Error(`begraens: ${sti} findes ikke`);
    const ret = (o: JsonSkema): JsonSkema => {
      const ukendte = tilladt.filter((v) => !(o.enum ?? []).includes(v));
      if (ukendte.length) throw new Error(`begraens: ${sti} har ikke ${ukendte.join(', ')}`);
      return { ...o, enum: tilladt };
    };
    if (!b) { props[a] = ret(p); continue; }
    const r = p.$ref ? doc.components?.schemas?.[p.$ref.replace('#/components/schemas/', '')] ?? p : p;
    const indre = r.properties?.[b];
    if (!indre) throw new Error(`begraens: ${sti} findes ikke`);
    props[a] = { ...r, properties: { ...r.properties, [b]: ret(indre) } };
  }
  return { ...s, properties: props };
}

function planFor(spec: ToolSpec, op: OpNoegle, doc: OpenApiDoc, fundne: Set<string> = new Set()): { plan: Plan; felter: Record<string, { skema: z.ZodType; paakraevet: boolean; beskrivelse?: string }> } {
  const o = kraevOperation(op, doc);
  // Lagerets egen stillingtagen (x-mcp) går forud for kataloget.
  const grund = udenVaerktoejGrund(op, doc);
  if (grund !== undefined) throw new Error(`${spec.navn}: ${op} er markeret uden værktøj i kortet (x-mcp): ${grund}`);
  const skjul = new Set(spec.skjul ?? []);
  const fast = spec.fast ?? {};
  const felter: Record<string, { skema: z.ZodType; paakraevet: boolean; beskrivelse?: string }> = {};
  const plan: Plan = { op, felter: {}, krop: !!o.requestBody };
  for (const p of o.parameters ?? []) {
    if (p.in !== 'path' && p.in !== 'query') continue;
    if (skjul.has(p.name)) { fundne.add(p.name); continue; }
    const navn = spec.alias?.[p.name] ?? (p.in === 'query' ? FAELLES_ALIAS[p.name] : undefined) ?? p.name;
    const flag = p.in === 'query' && erFlag(p.schema);
    plan.felter[navn] = { hvor: p.in, api: p.name, flag };
    felter[navn] = { skema: flag ? z.boolean() : tilZod(p.schema, doc), paakraevet: p.in === 'path' || !!p.required, beskrivelse: p.description ?? p.schema?.description };
  }
  const krop = kropsskema(o, doc);
  if (krop?.properties) {
    const s = begraenset(medRettedeFelter(krop, spec.skjul ?? [], spec.forbyd ?? {}, doc, fundne), spec.begraens ?? {}, doc);
    const req = new Set(s.required ?? []);
    for (const [api, ps] of Object.entries(s.properties ?? {})) {
      if (skjul.has(api)) { fundne.add(api); continue; }
      if (api in fast) continue;
      const navn = spec.alias?.[api] ?? api;
      plan.felter[navn] = { hvor: 'body', api };
      const skema = tilZod(ps, doc);
      felter[navn] = { skema: spec.nullbar?.includes(navn) ? skema.nullable() : skema, paakraevet: req.has(api), beskrivelse: ps.description };
    }
  }
  for (const k of spec.kraev ?? []) if (felter[k]) felter[k].paakraevet = true;
  return { plan, felter };
}

export function byg(spec: ToolSpec, doc: OpenApiDoc = SPEC): Bygget {
  const fundne = new Set<string>();
  const hoved = planFor(spec, spec.op, doc, fundne);
  const alt = spec.medId ? planFor(spec, spec.medId.op, doc, fundne) : undefined;
  const planer = new Map<OpNoegle, Plan>([[spec.op, hoved.plan]]);
  if (alt && spec.medId) planer.set(spec.medId.op, alt.plan);
  for (const op of spec.ops ?? []) if (!planer.has(op)) planer.set(op, planFor(spec, op, doc, fundne).plan);
  // Som begraens: en sti, der ikke rammer noget felt i nogen af operationerne, er en fejl i kataloget.
  const forgaeves = [...(spec.skjul ?? []), ...Object.keys(spec.forbyd ?? {})].filter((sti) => !fundne.has(sti));
  if (forgaeves.length) throw new Error(`${spec.navn}: skjul/forbyd ${forgaeves.join(', ')} findes ikke`);

  // Med to operationer vælger feltet operationen, så intet er påkrævet.
  const samlet = { ...(alt?.felter ?? {}), ...hoved.felter };
  const shape: Record<string, z.ZodType> = {};
  for (const [navn, f] of Object.entries(samlet)) {
    const beskrivelse = spec.beskriv?.[navn] ?? f.beskrivelse ?? FAELLES_BESKRIVELSER[navn];
    let t = alt ? f.skema.optional() : f.paakraevet ? f.skema : f.skema.optional();
    if (beskrivelse) t = t.describe(beskrivelse);
    shape[navn] = t;
  }
  Object.assign(shape, spec.ekstra ?? {});
  if (spec.bekraeftes) {
    if (shape[BEKRAEFTET]) throw new Error(`${spec.navn}: ${BEKRAEFTET} findes allerede i skemaet`);
    shape[BEKRAEFTET] = z.literal(true, { error: `${spec.navn} kræver ${BEKRAEFTET}: true, brugerens udtrykkelige ja.` }).describe(BEKRAEFTET_TEKST);
  }

  const ops = [...planer.keys()];
  const { metode } = splitOp(spec.op);
  const vaelg = (input: Input): OpNoegle => (spec.medId && input[spec.medId.felt] != null ? spec.medId.op : spec.op);

  const send = (client: LagerClient): Sender => async (op, input) => {
    const plan = planer.get(op);
    if (!plan) throw new Error(`${spec.navn} bruger ikke ${op}`);
    const { metode: m, sti } = splitOp(op);
    const query: Record<string, string | number | boolean | undefined | (string | number)[]> = {};
    const krop: Record<string, unknown> = { ...(spec.fast ?? {}) };
    let sti2 = sti;
    for (const [navn, p] of Object.entries(plan.felter)) {
      const v = input[navn];
      if (p.hvor === 'path') {
        if (v === undefined || v === null || v === '') throw new Error(`${navn} mangler`);
        sti2 = sti2.replace(`{${p.api}}`, encodePathParam(v, navn));
      } else if (v === undefined) {
        continue;
      } else if (p.hvor === 'query') {
        if (p.flag) query[p.api] = v ? '1' : undefined;
        else query[p.api] = v as string | number | boolean | (string | number)[];
      } else {
        krop[p.api] = v;
      }
    }
    // POST/PUT/PATCH sender altid en krop, så klienten giver kaldet en Idempotency-Key.
    // DELETE kun, når operationen har en krop (fx en begrundelse for en annullering).
    const body = m === 'get' || (m === 'delete' && !plan.krop) ? undefined : krop;
    return client.request(m.toUpperCase(), sti2, { query, body });
  };

  return {
    shape,
    skriv: metode !== 'get' && !spec.laesende,
    sletter: metode === 'delete' || !!spec.destruktiv || !!spec.bekraeftes,
    idempotent: metode === 'get' || !!spec.laesende || (spec.idempotent ?? metode !== 'post'),
    aabenVerden: !!spec.aabenVerden,
    moduler: [...new Set(ops.flatMap((op) => modulerFor(op, doc)))].sort(),
    ansvarlig: spec.navn.startsWith('lager_ansvarlig_') || ops.some((op) => splitOp(op).sti.startsWith('/ansvarlig/')),
    bekraeftes: !!spec.bekraeftes,
    ops,
    send,
    vaelg,
  };
}
