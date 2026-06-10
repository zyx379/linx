/**
 * 运行统计 + 审计（内存，进程级）
 */
interface AuditEntry {
  at: string;
  ip: string;
  endpoint: string;
  project?: string;
  ok: boolean;
  detail?: string;
  ms?: number;
}

const startedAt = Date.now();
let totalCalls = 0;
let errorCalls = 0;
const recent: AuditEntry[] = [];
const MAX_RECENT = 200;

export function recordCall(entry: Omit<AuditEntry, 'at'>): void {
  totalCalls++;
  if (!entry.ok) errorCalls++;
  recent.unshift({ at: new Date().toISOString(), ...entry });
  if (recent.length > MAX_RECENT) recent.pop();
}

export function getStats() {
  return {
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    totalCalls,
    errorCalls,
    recent: recent.slice(0, 50),
  };
}
