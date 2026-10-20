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
export type Plan = { op: OpNoegle; felter: Record<string, Plads> };
export type Bygget = {
  shape: Record<string, z.ZodType>;
  skriv: boolean;
  sletter: boolean;
  /** idempotentHint: samme kald igen ændrer intet ud over det første. */
  idempotent: boolean;
  /** openWorldHint. */
  aabenVerden: boolean;
  moduler: string[];
  ops: OpNoegle[];
  send: (client: LagerClient) => Sender;
  vaelg: (input: Input) => OpNoegle;
};

/** Fjern «a.b»- og «a.b.c»-felter: det sidste led på objektet (eller linjerne) under de første. */
function utenIndlejrede(s: JsonSkema, skjul: string[], doc: OpenApiDoc): JsonSkema {
  const slaa = (o: JsonSkema): JsonSkema => (o.$ref ? doc.components?.schemas?.[o.$ref.replace('#/components/schemas/', '')] ?? o : o);
  const fjern = (o: JsonSkema, led: string[]): JsonSkema => {
    const r = slaa(o);
    const [a, ...rest] = led as [string, ...string[]];
    if (!rest.length) {
      const { [a]: _vaek, ...props } = r.properties ?? {};
      return { ...r, properties: props, required: (r.required ?? []).filter((x) => x !== a) };
    }
    const p = r.properties?.[a];
    if (!p) return r;
    const ny = p.type === 'array' && p.items ? { ...p, items: fjern(p.items, rest) } : fjern(p, rest);
    return { ...r, properties: { ...r.properties, [a]: ny } };
  };
  let ud = s;
  for (const sti of skjul) if (sti.includes('.') && ud.properties) ud = fjern(ud, sti.split('.'));
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

function planFor(spec: ToolSpec, op: OpNoegle, doc: OpenApiDoc): { plan: Plan; felter: Record<string, { skema: z.ZodType; paakraevet: boolean; beskrivelse?: string }> } {
  const o = kraevOperation(op, doc);
  // Lagerets egen stillingtagen (x-mcp) går forud for kataloget.
  const grund = udenVaerktoejGrund(op, doc);
  if (grund !== undefined) throw new Error(`${spec.navn}: ${op} er markeret uden værktøj i kortet (x-mcp): ${grund}`);
  const skjul = new Set(spec.skjul ?? []);
  const fast = spec.fast ?? {};
  const felter: Record<string, { skema: z.ZodType; paakraevet: boolean; beskrivelse?: string }> = {};
  const plan: Plan = { op, felter: {} };
  for (const p of o.parameters ?? []) {
    if (p.in !== 'path' && p.in !== 'query') continue;
    if (skjul.has(p.name)) continue;
    const navn = spec.alias?.[p.name] ?? (p.in === 'query' ? FAELLES_ALIAS[p.name] : undefined) ?? p.name;
    const flag = p.in === 'query' && erFlag(p.schema);
    plan.felter[navn] = { hvor: p.in, api: p.name, flag };
    felter[navn] = { skema: flag ? z.boolean() : tilZod(p.schema, doc), paakraevet: p.in === 'path' || !!p.required, beskrivelse: p.description ?? p.schema?.description };
  }
  const krop = kropsskema(o, doc);
  if (krop?.properties) {
    const s = begraenset(utenIndlejrede(krop, spec.skjul ?? [], doc), spec.begraens ?? {}, doc);
    const req = new Set(s.required ?? []);
    for (const [api, ps] of Object.entries(s.properties ?? {})) {
      if (skjul.has(api) || api in fast) continue;
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
  const hoved = planFor(spec, spec.op, doc);
  const alt = spec.medId ? planFor(spec, spec.medId.op, doc) : undefined;
  const planer = new Map<OpNoegle, Plan>([[spec.op, hoved.plan]]);
  if (alt && spec.medId) planer.set(spec.medId.op, alt.plan);
  for (const op of spec.ops ?? []) if (!planer.has(op)) planer.set(op, planFor(spec, op, doc).plan);

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
    const body = m === 'get' || m === 'delete' ? undefined : krop;
    return client.request(m.toUpperCase(), sti2, { query, body });
  };

  return {
    shape,
    skriv: metode !== 'get' && !spec.laesende,
    sletter: metode === 'delete' || !!spec.destruktiv,
    idempotent: metode === 'get' || !!spec.laesende || (spec.idempotent ?? metode !== 'post'),
    aabenVerden: !!spec.aabenVerden,
    moduler: [...new Set(ops.flatMap((op) => modulerFor(op, doc)))].sort(),
    ops,
    send,
    vaelg,
  };
}
