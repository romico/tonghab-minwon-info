import { apiRequest } from "./client";
import type { AuditAction, AuditLog } from "./auditTypes";

export type { AuditAction, AuditLog };

export async function apiListAuditLogs(params: {
  limit?: number;
  offset?: number;
  action?: string;
  from?: string;
  to?: string;
  username?: string;
}): Promise<{ logs: AuditLog[]; total: number }> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.action) q.set("action", params.action);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.username) q.set("username", params.username);
  const qs = q.toString();
  return apiRequest(`/api/audit${qs ? `?${qs}` : ""}`);
}
