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

/** De moduler, stien kræver (x-moduler fra backendens rutekort). */
export function modulerFor(op: OpNoegle, doc: OpenApiDoc = SPEC): string[] {
  return doc.paths[splitOp(op).sti]?.['x-moduler'] ?? [];
}

export function kropsskema(o: Operation, doc: OpenApiDoc = SPEC): JsonSkema | undefined {
  const s = o.requestBody?.content?.['application/json']?.schema;
  return s ? opslaa(s, doc) : undefined;
}

function opslaa(s: JsonSkema, doc: OpenApiDoc): JsonSkema {
  if (!s.$ref) return s;
  const navn = s.$ref.replace('#/components/schemas/', '');
  const fundet = doc.components?.schemas?.[navn];
  if (!fundet) throw new Error(`Ukendt $ref ${s.$ref}`);
  return { ...fundet, description: s.description ?? fundet.description };
}

/** Et flag i forespørgslen ({ enum: ["1"] }): værktøjet tager en boolean, appen får «1». */
export function erFlag(s: JsonSkema | undefined): boolean {
  return !!s && s.type === 'string' && Array.isArray(s.enum) && s.enum.length === 1 && s.enum[0] === '1';
}

/** JSON Schema (den delmængde, kortet bruger) → zod. */
export function tilZod(skema: JsonSkema | undefined, doc: OpenApiDoc = SPEC): z.ZodType {
  if (!skema) return z.unknown();
  const s = opslaa(skema, doc);
  let t: z.ZodType;
  if (s.oneOf) {
    const dele = s.oneOf.map((x) => tilZod(x, doc));
    t = dele.length === 1 ? dele[0]! : z.union(dele as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  } else if (Array.isArray(s.type)) {
    const typer = s.type.filter((x) => x !== 'null');
    t = tilZod({ ...s, type: typer[0] }, doc);
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
