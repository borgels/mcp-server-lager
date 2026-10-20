/**
 * Lager-API'ets OpenAPI som kilde for værktøjernes skemaer (#26).
 *
 * openapi/lager.json er et fastlåst øjebliksbillede af backendens
 * /api/lager/openapi.json (scripts/opdater-openapi.ts). Værktøjerne vælger
 * navn og beskrivelse selv, så de er til at forstå for en LLM; parametre,
 * typer, påkrævede felter og moduler kommer herfra.
 */
import { z } from 'zod/v4';
import snapshot from '../../openapi/lager.json' with { type: 'json' };

export type Metode = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type JsonSkema = {
  type?: string | string[];
  enum?: unknown[];
  items?: JsonSkema;
  properties?: Record<string, JsonSkema>;
  required?: string[];
  oneOf?: JsonSkema[];
  allOf?: JsonSkema[];
  additionalProperties?: boolean | JsonSkema;
  $ref?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
};
export type Parameter = { name: string; in: 'path' | 'query' | 'header'; required?: boolean; schema?: JsonSkema; description?: string };
export type Operation = {
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content?: { 'application/json'?: { schema?: JsonSkema } } };
  /** Lagerets egen stillingtagen: `vaerktoej: false` = ingen værktøj, med grunden. */
  'x-mcp'?: { vaerktoej?: boolean; grund?: string };
};
type PathItem = Partial<Record<Metode, Operation>> & { 'x-moduler'?: string[] };
export type OpenApiDoc = { info: { version: string }; paths: Record<string, PathItem>; components?: { schemas?: Record<string, JsonSkema> } };

export const SPEC = snapshot as unknown as OpenApiDoc;
export const METODER: readonly Metode[] = ['get', 'post', 'put', 'patch', 'delete'];

/** «METODE /sti», fx «GET /ansvarlig/optaelling/{id}». */
export type OpNoegle = `${'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} /${string}`;

export function splitOp(op: OpNoegle): { metode: Metode; sti: string } {
  const [m, sti] = op.split(' ') as [string, string];
  return { metode: m.toLowerCase() as Metode, sti };
}

export function operation(op: OpNoegle, doc: OpenApiDoc = SPEC): Operation | undefined {
  const { metode, sti } = splitOp(op);
  return doc.paths[sti]?.[metode];
}

export function kraevOperation(op: OpNoegle, doc: OpenApiDoc = SPEC): Operation {
  const o = operation(op, doc);
  if (!o) throw new Error(`${op} findes ikke i openapi/lager.json`);
  return o;
}

/** Alle operationer i kortet som «METODE /sti». */
export function alleOperationer(doc: OpenApiDoc = SPEC): OpNoegle[] {
  return Object.entries(doc.paths).flatMap(([sti, item]) =>
    METODER.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${sti}` as OpNoegle),
  );
}

/**
 * Operationerne, lageret selv har markeret `x-mcp: { vaerktoej: false, grund }`
 * (fx lånerens link, kanbankortets token): ingen værktøj, med lagerets grund.
 * De tæller som UDEN_VAERKTOEJ, og et værktøj må ikke bruge dem.
 */
export function udenVaerktoejIKortet(doc: OpenApiDoc = SPEC): Partial<Record<OpNoegle, string>> {
  const ud: Partial<Record<OpNoegle, string>> = {};
  for (const op of alleOperationer(doc)) {
    const x = operation(op, doc)?.['x-mcp'];
    if (x?.vaerktoej === false) ud[op] = x.grund?.trim() || 'Lageret har markeret operationen som uden værktøj (x-mcp).';
  }
  return ud;
}

/** De moduler, stien kræver (x-moduler fra backendens rutekort). */
export function modulerFor(op: OpNoegle, doc: OpenApiDoc = SPEC): string[] {
  return doc.paths[splitOp(op).sti]?.['x-moduler'] ?? [];
}

export function kropsskema(o: Operation, doc: OpenApiDoc = SPEC): JsonSkema | undefined {
  const s = o.requestBody?.content?.['application/json']?.schema;
  return s ? opslaa(s, doc) : undefined;
}

function opslaa(s: JsonSkema, doc: OpenApiDoc): JsonSkema {
  if (s.allOf) return flet(s, doc);
  if (!s.$ref) return s;
  const navn = s.$ref.replace('#/components/schemas/', '');
  const fundet = doc.components?.schemas?.[navn];
  if (!fundet) throw new Error(`Ukendt $ref ${s.$ref}`);
  const r = { ...fundet, description: s.description ?? fundet.description };
  return r.allOf ? flet(r, doc) : r;
}

/** allOf → ét objekt: delenes felter og påkrævede samlet, det ydre skemas oveni. */
function flet(s: JsonSkema, doc: OpenApiDoc): JsonSkema {
  const { allOf = [], ...ydre } = s;
  const dele = allOf.map((x) => opslaa(x, doc));
  const properties = Object.assign({}, ...dele.map((d) => d.properties ?? {}), ydre.properties ?? {});
  const required = [...new Set([...dele.flatMap((d) => d.required ?? []), ...(ydre.required ?? [])])];
  return { ...ydre, type: 'object', properties, ...(required.length ? { required } : {}) };
}

/** Et flag i forespørgslen ({ enum: ["1"] }): værktøjet tager en boolean, appen får «1». */
export function erFlag(s: JsonSkema | undefined): boolean {
  return !!s && s.type === 'string' && Array.isArray(s.enum) && s.enum.length === 1 && s.enum[0] === '1';
}

const refCache = new WeakMap<OpenApiDoc, { faerdige: Map<string, z.ZodType>; paaVej: Set<string> }>();

/**
 * Et $ref bygges én gang pr. kort. Et skema, der peger på sig selv (fx en
 * skabelons børn, der har børn), bliver z.lazy på den samme instans, så både
 * validering og JSON Schema til klienten kan følge kredsen uden at gå i ring.
 */
function refTilZod(skema: JsonSkema, doc: OpenApiDoc): z.ZodType {
  const navn = skema.$ref!.replace('#/components/schemas/', '');
  let c = refCache.get(doc);
  if (!c) refCache.set(doc, (c = { faerdige: new Map(), paaVej: new Set() }));
  const { faerdige, paaVej } = c;
  let t = faerdige.get(navn);
  if (!t) {
    if (paaVej.has(navn)) {
      t = z.lazy(() => faerdige.get(navn)!);
    } else {
      const fundet = doc.components?.schemas?.[navn];
      if (!fundet) throw new Error(`Ukendt $ref ${skema.$ref}`);
      paaVej.add(navn);
      try {
        t = tilZod(fundet, doc);
      } finally {
        paaVej.delete(navn);
      }
      faerdige.set(navn, t);
    }
  }
  return skema.description ? t.describe(skema.description) : t;
}

/** JSON Schema (den delmængde, kortet bruger) → zod. */
export function tilZod(skema: JsonSkema | undefined, doc: OpenApiDoc = SPEC): z.ZodType {
  if (!skema) return z.unknown();
  if (skema.$ref && !skema.allOf) return refTilZod(skema, doc);
  const s = opslaa(skema, doc);
  let t: z.ZodType;
  if (s.oneOf) {
    const dele = s.oneOf.map((x) => tilZod(x, doc));
    t = dele.length === 1 ? dele[0]! : z.union(dele as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  } else if (Array.isArray(s.type)) {
    const typer = s.type.filter((x) => x !== 'null');
    const enkelt = (type: string | undefined) => tilZod({ ...s, description: undefined, type, ...(s.enum ? { enum: s.enum.filter((x) => x !== null) } : {}) }, doc);
    // Fx ["integer", "string"] (id eller nøgle): begge typer.
    const dele = typer.map(enkelt);
    t = dele.length > 1 ? z.union(dele as [z.ZodType, z.ZodType, ...z.ZodType[]]) : enkelt(typer[0]);
    if (s.type.includes('null')) t = t.nullable();
  } else if (s.enum && s.enum.every((x) => typeof x === 'string')) {
    t = z.enum(s.enum as [string, ...string[]]);
  } else {
    switch (s.type) {
      case 'string': {
        let x = z.string();
        if (s.minLength != null) x = x.min(s.minLength);
        t = x;
        break;
      }
      case 'integer':
      case 'number': {
        let x = s.type === 'integer' ? z.number().int() : z.number();
        if (s.minimum != null) x = x.min(s.minimum);
        if (s.maximum != null) x = x.max(s.maximum);
        t = x;
        break;
      }
      case 'boolean':
        t = z.boolean();
        break;
      case 'null':
        t = z.null();
        break;
      case 'array':
        t = z.array(tilZod(s.items, doc));
        break;
      case 'object': {
        // Uden felter (fx egenskaber, parametre, meta): et frit objekt, så nøglerne ikke skrælles af.
        if (!s.properties || s.additionalProperties) {
          const v = typeof s.additionalProperties === 'object' ? tilZod(s.additionalProperties, doc) : z.unknown();
          t = z.record(z.string(), v);
          break;
        }
        const req = new Set(s.required ?? []);
        const shape: Record<string, z.ZodType> = {};
        for (const [k, v] of Object.entries(s.properties ?? {})) shape[k] = req.has(k) ? tilZod(v, doc) : tilZod(v, doc).optional();
        t = z.object(shape);
        break;
      }
      default:
        t = z.unknown();
    }
  }
  return s.description ? t.describe(s.description) : t;
}
