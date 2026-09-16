import { getDb } from "./db.ts";
import {
  buildDailyReport,
  buildSnapshotKpi,
  type Complaint,
  type DailyReport,
  type ReportSnapshot,
  type SnapshotKpi,
} from "../src/schema/index.ts";

export interface FreezeSnapshotInput {
  reportDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  complaints: Complaint[];
  frozenBy: string | null;
  note?: string | null;
}

function parseRow(row: {
  id: number;
  report_date: string;
  period_from: string | null;
  period_to: string | null;
  frozen_at: string;
  frozen_by: string | null;
  complaint_ids: string;
  kpi_json: string;
  daily_json: string;
  note: string | null;
}): ReportSnapshot {
  return {
    id: row.id,
    reportDate: row.report_date,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    frozenAt: row.frozen_at,
    frozenBy: row.frozen_by,
    complaintIds: JSON.parse(row.complaint_ids) as string[],
    kpi: JSON.parse(row.kpi_json) as SnapshotKpi,
    daily: JSON.parse(row.daily_json) as DailyReport,
    note: row.note,
  };
}

export function initSnapshotTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS report_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      period_from TEXT,
      period_to TEXT,
      frozen_at TEXT NOT NULL DEFAULT (datetime('now')),
      frozen_by TEXT,
      complaint_ids TEXT NOT NULL,
      kpi_json TEXT NOT NULL,
      daily_json TEXT NOT NULL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_report_date
      ON report_snapshots(report_date);
    CREATE INDEX IF NOT EXISTS idx_snapshots_frozen_at
      ON report_snapshots(frozen_at);
  `);
}

export function freezeSnapshot(input: FreezeSnapshotInput): ReportSnapshot {
  const kpi = buildSnapshotKpi(input.complaints, input.reportDate);
  const daily = buildDailyReport(input.complaints, input.reportDate);
  const ids = input.complaints.map((c) => c.id);
  const database = getDb();

  const insert = database.prepare(
    `INSERT INTO report_snapshots
      (report_date, period_from, period_to, frozen_at, frozen_by,
       complaint_ids, kpi_json, daily_json, note)
     VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)`,
  );
  insert.run(
    input.reportDate,
    input.periodFrom,
    input.periodTo,
    input.frozenBy,
    JSON.stringify(ids),
    JSON.stringify(kpi),
    JSON.stringify(daily),
    input.note ?? null,
  );

  const idRow = database
    .prepare("SELECT last_insert_rowid() AS id")
    .get() as { id: number | bigint };
  const id = Number(idRow.id);
  const snap = getSnapshotById(id);
  if (!snap) throw new Error("스냅샷 저장 후 조회에 실패했습니다.");
  return snap;
}

export function getSnapshotById(id: number): ReportSnapshot | null {
  const row = getDb()
    .prepare(
      `SELECT id, report_date, period_from, period_to, frozen_at, frozen_by,
              complaint_ids, kpi_json, daily_json, note
       FROM report_snapshots WHERE id = ?`,
    )
    .get(id) as Parameters<typeof parseRow>[0] | undefined;
  return row ? parseRow(row) : null;
}

/** 보고일별 최신 스냅샷 1건 */
export function getLatestSnapshotForDate(
  reportDate: string,
): ReportSnapshot | null {
  const row = getDb()
    .prepare(
      `SELECT id, report_date, period_from, period_to, frozen_at, frozen_by,
              complaint_ids, kpi_json, daily_json, note
       FROM report_snapshots
       WHERE report_date = ?
       ORDER BY frozen_at DESC, id DESC
       LIMIT 1`,
    )
    .get(reportDate) as Parameters<typeof parseRow>[0] | undefined;
  return row ? parseRow(row) : null;
}

export function listSnapshots(query: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): { total: number; items: ReportSnapshot[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (query.from) {
    where.push("report_date >= ?");
    params.push(query.from);
  }
  if (query.to) {
    where.push("report_date <= ?");
    params.push(query.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM report_snapshots ${whereSql}`)
      .get(...params) as { n: number }
  ).n;

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const rows = getDb()
    .prepare(
      `SELECT id, report_date, period_from, period_to, frozen_at, frozen_by,
              complaint_ids, kpi_json, daily_json, note
       FROM report_snapshots
       ${whereSql}
       ORDER BY report_date DESC, frozen_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Parameters<typeof parseRow>[0][];

  return { total, items: rows.map(parseRow) };
}

/** 여러 보고일의 각 최신 스냅샷 */
export function getLatestSnapshotsForDates(
  dates: string[],
): Record<string, ReportSnapshot> {
  const out: Record<string, ReportSnapshot> = {};
  for (const date of dates) {
    const snap = getLatestSnapshotForDate(date);
    if (snap) out[date] = snap;
  }
  return out;
}
