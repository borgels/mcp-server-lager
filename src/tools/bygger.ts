/**
 * Fra katalogets ToolSpec og OpenAPI-kortet til et zod-skema og et kald:
 * hvert felt i værktøjet ved, om det er en sti-parameter, en forespørgsel
 * eller en del af kroppen, og hvad det hedder i API'et.
 */
import { z } from 'zod/v4';
import type { LagerClient } from '../lager/client.js';
import { encodePathParam } from '../path-params.js';
import {
  erFlag, kraevOperation, kropsskema, modulerFor, splitOp, SPEC, tilZod,
  type JsonSkema, type OpenApiDoc, type OpNoegle,
} from '../openapi/spec.js';
import { FAELLES_ALIAS, FAELLES_BESKRIVELSER, type Input, type Sender, type ToolSpec } from './katalog.js';

type Plads = { hvor: 'path' | 'query' | 'body'; api: string; flag?: boolean };
export type Plan = { op: OpNoegle; felter: Record<string, Plads> };
export type Bygget = {
  shape: Record<string, z.ZodType>;
  skriv: boolean;
  sletter: boolean;
  moduler: string[];
  ops: OpNoegle[];
  send: (client: LagerClient) => Sender;
  vaelg: (input: Input) => OpNoegle;
};

/** Fjern «a.b»-felter: b på a's objekt eller på a's linjer. */
function utenIndlejrede(s: JsonSkema, skjul: string[], doc: OpenApiDoc): JsonSkema {
  const dybe = skjul.filter((x) => x.includes('.'));
  if (!dybe.length || !s.properties) return s;
  const props = { ...s.properties };
  for (const sti of dybe) {
    const [a, b] = sti.split('.') as [string, string];
    const p = props[a];
    if (!p) continue;
    const fjern = (o: JsonSkema): JsonSkema => {
      const r = o.$ref ? doc.components?.schemas?.[o.$ref.replace('#/components/schemas/', '')] ?? o : o;
      const { [b]: _vaek, ...rest } = r.properties ?? {};
      return { ...r, properties: rest, required: (r.required ?? []).filter((x) => x !== b) };
    };
    props[a] = p.type === 'array' && p.items ? { ...p, items: fjern(p.items) } : fjern(p);
  }
  return { ...s, properties: props };
}

function planFor(spec: ToolSpec, op: OpNoegle, doc: OpenApiDoc): { plan: Plan; felter: Record<string, { skema: z.ZodType; paakraevet: boolean; beskrivelse?: string }> } {
  const o = kraevOperation(op, doc);
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
    const s = utenIndlejrede(krop, spec.skjul ?? [], doc);
    const req = new Set(s.required ?? []);
    for (const [api, ps] of Object.entries(s.properties ?? {})) {
      if (skjul.has(api) || api in fast) continue;
      const navn = spec.alias?.[api] ?? api;
      plan.felter[navn] = { hvor: 'body', api };
      felter[navn] = { skema: tilZod(ps, doc), paakraevet: req.has(api), beskrivelse: ps.description };
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
    const query: Record<string, string | number | boolean | undefined> = {};
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
        else query[p.api] = v as string | number | boolean;
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
    skriv: metode !== 'get',
    sletter: metode === 'delete',
    moduler: [...new Set(ops.flatMap((op) => modulerFor(op, doc)))].sort(),
    ops,
    send,
    vaelg,
  };
}
