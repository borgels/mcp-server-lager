import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { writeAuditEvent } from './lager/audit.js';
import type { LagerClient } from './lager/client.js';
import { encodePathParam } from './path-params.js';

/**
 * Resources (#27): det, en klient kan lægge i konteksten uden et værktøjskald.
 * Samme rettigheder som værktøjerne: kaldet sker på vegne af brugeren.
 *
 *   lager://lagre          dine lagre, roller og installationens moduler
 *   lager://plads/{kode}   en plads (fx A-12-3) og enhederne, der hører til dér
 *   lager://enhed/{tag}    en enhed: hvad, hvem har den, hvor skal den stå
 *   lager://lokation/{id}  en lokation i træet med sti, mål, børn og indhold
 *   lager://rum/{id}/klima klimaet nu: temperatur, fugt og dugpunkt inde og ude
 */
export function registerLagerResources(server: McpServer, client: LagerClient): void {
  const laes = async (navn: string, uri: URL, fn: () => Promise<unknown>): Promise<ReadResourceResult> => {
    await writeAuditEvent({ user: client.user, tool: `resource:${navn}`, action: 'start', target: uri.href });
    try {
      const data = await fn();
      await writeAuditEvent({ user: client.user, tool: `resource:${navn}`, action: 'finish' });
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      await writeAuditEvent({ user: client.user, tool: `resource:${navn}`, action: 'error', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };
  const enkelt = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  server.registerResource(
    'lagre',
    'lager://lagre',
    { title: 'Mine lagre', description: 'Dine lagre med roller, installationens moduler og tal pr. lager.', mimeType: 'application/json' },
    (uri) =>
      laes('lagre', uri, async () => {
        const me = await client.get<{ lagre?: unknown; moduler?: unknown; ansvarlig?: unknown; tal?: unknown }>('/me');
        return { lagre: me.lagre, ansvarlig: me.ansvarlig, moduler: me.moduler, tal: me.tal };
      }),
  );

  server.registerResource(
    'plads',
    new ResourceTemplate('lager://plads/{kode}', { list: undefined }),
    { title: 'En plads', description: 'Pladsen (zone, reol, hylde, fx A-12-3) og de enheder, der hører til dér.', mimeType: 'application/json' },
    (uri, { kode }) => laes('plads', uri, () => client.get(`/pladser/${encodePathParam(enkelt(kode), 'kode')}`)),
  );

  server.registerResource(
    'enhed',
    new ResourceTemplate('lager://enhed/{tag}', { list: undefined }),
    { title: 'En enhed', description: 'Opslag på et mærke: hvad er det, hvem har det, hvor skal det stå, værnemidler og dokumenter.', mimeType: 'application/json' },
    (uri, { tag }) => laes('enhed', uri, () => client.get(`/opslag/${encodePathParam(enkelt(tag), 'tag')}`)),
  );

  server.registerResource(
    'lokation',
    new ResourceTemplate('lager://lokation/{id}', { list: undefined }),
    { title: 'En lokation', description: 'En lokation i lokationstræet (rum, reol, hylde, bin …) med sti, effektive mål, børn og indhold.', mimeType: 'application/json' },
    (uri, { id }) => laes('lokation', uri, () => client.get(`/lokationer/${encodePathParam(enkelt(id), 'id')}`)),
  );

  server.registerResource(
    'klima',
    new ResourceTemplate('lager://rum/{id}/klima', { list: undefined }),
    { title: 'Klimaet i et rum', description: 'Klimaet nu på en lokation (fx et rum eller en container): temperatur, fugt og dugpunkt inde og ude. Kræver modulet iot.', mimeType: 'application/json' },
    (uri, { id }) => laes('klima', uri, () => client.get(`/iot/lokationer/${encodePathParam(enkelt(id), 'id')}/dugpunkt`)),
  );
}
