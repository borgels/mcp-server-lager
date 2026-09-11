import { createHash, randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';

export interface AuditEvent {
  requestId?: string;
  user: string;
  tool: string;
  action: 'start' | 'finish' | 'error' | 'policy_denied';
  target?: unknown;
  reason?: string;
  error?: string;
}

/** Én JSONL-linje pr. hændelse; argumenterne hashes, aldrig gemmes. Gatewayen har den hash-kædede log. */
export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  const path = process.env.LAGER_AUDIT_LOG;
  if (!path) return;
  const record = {
    timestamp: new Date().toISOString(),
    requestId: event.requestId ?? randomUUID(),
    user: event.user,
    tool: event.tool,
    action: event.action,
    targetHash: event.target === undefined ? undefined : createHash('sha256').update(JSON.stringify(event.target)).digest('hex'),
    reason: event.reason,
    error: event.error,
  };
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
}
