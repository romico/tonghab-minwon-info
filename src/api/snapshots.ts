import { apiRequest } from "./client";
import type { ReportSnapshot } from "@/schema";

export async function apiListSnapshots(query?: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: ReportSnapshot[] }> {
  const params = new URLSearchParams();
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  if (query?.limit != null) params.set("limit", String(query.limit));
  if (query?.offset != null) params.set("offset", String(query.offset));
  const qs = params.toString();
  return apiRequest(`/api/reports/snapshots${qs ? `?${qs}` : ""}`);
}

export async function apiGetSnapshotsByDates(
  dates: string[],
): Promise<Record<string, ReportSnapshot>> {
  const unique = [...new Set(dates.filter(Boolean))];
  if (unique.length === 0) return {};
  const data = await apiRequest<{ byDate: Record<string, ReportSnapshot> }>(
    `/api/reports/snapshots?dates=${encodeURIComponent(unique.join(","))}`,
  );
  return data.byDate ?? {};
}

export async function apiGetLatestSnapshot(
  reportDate: string,
): Promise<ReportSnapshot | null> {
  try {
    const data = await apiRequest<{ snapshot: ReportSnapshot }>(
      `/api/reports/snapshots/latest/${reportDate}`,
    );
    return data.snapshot;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function apiFreezeSnapshot(input: {
  reportDate: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  note?: string | null;
}): Promise<ReportSnapshot> {
  const data = await apiRequest<{ snapshot: ReportSnapshot }>(
    "/api/reports/snapshots",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data.snapshot;
}
