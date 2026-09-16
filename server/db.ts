import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  SEED_COMPLAINTS,
  normalizeComplaint,
  type Complaint,
  type ComplaintInput,
} from "../src/schema/index.ts";
import {
  getActiveDek,
  isVaultEnabled,
  isVaultUnlocked,
  sealComplaint,
  unsealComplaint,
  VaultLockedError,
} from "./vault.ts";

/** 실행 폴더 기준 (시작.bat / npm 스크립트가 cwd를 앱 루트로 맞춤) */
export const DATA_DIR = process.env.TM_DATA_DIR ?? join(process.cwd(), "data");
export const DB_PATH = join(DATA_DIR, "tonghab-minwon.db");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) throw new Error("DB가 초기화되지 않았습니다.");
  return db;
}

export function initDb(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      notified_at TEXT,
      received_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_notified
      ON complaints(notified_at);
    CREATE INDEX IF NOT EXISTS idx_complaints_received
      ON complaints(received_at);
  `);

  const count = db.prepare("SELECT COUNT(*) AS n FROM complaints").get() as {
    n: number;
  };
  if (count.n === 0) {
    replaceAll(SEED_COMPLAINTS);
  }

  return db;
}

function requireDekForPii(): Buffer | null {
  if (!isVaultEnabled()) return null;
  if (!isVaultUnlocked()) throw new VaultLockedError();
  return getActiveDek();
}

function rowToComplaint(row: { data: string }): Complaint {
  const item = normalizeComplaint(JSON.parse(row.data) as Complaint);
  const dek = requireDekForPii();
  return dek ? unsealComplaint(item, dek) : item;
}

function toStoredPayload(item: Complaint): string {
  const dek = requireDekForPii();
  const stored = dek ? sealComplaint(item, dek) : item;
  return JSON.stringify(stored);
}

export function listComplaints(): Complaint[] {
  const rows = getDb()
    .prepare(
      `SELECT data FROM complaints
       ORDER BY received_at DESC, id DESC`,
    )
    .all() as { data: string }[];
  return rows.map(rowToComplaint);
}

export function upsertComplaint(input: ComplaintInput): Complaint {
  const id = input.id ?? String(Date.now());
  const item = normalizeComplaint({ ...input, id });
  const payload = toStoredPayload(item);
  getDb()
    .prepare(
      `INSERT INTO complaints (id, data, notified_at, received_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         notified_at = excluded.notified_at,
         received_at = excluded.received_at,
         updated_at = datetime('now')`,
    )
    .run(item.id, payload, item.notifiedAt, item.receivedAt);
  return item;
}

function withTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

export function addComplaints(inputs: ComplaintInput[]): Complaint[] {
  const base = Date.now();
  const items = inputs.map((input, i) =>
    normalizeComplaint({
      ...input,
      id: input.id ?? `${base}-${i}`,
    }),
  );

  const insert = getDb().prepare(
    `INSERT INTO complaints (id, data, notified_at, received_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       notified_at = excluded.notified_at,
       received_at = excluded.received_at,
       updated_at = datetime('now')`,
  );

  withTransaction(() => {
    for (const item of items) {
      insert.run(
        item.id,
        toStoredPayload(item),
        item.notifiedAt,
        item.receivedAt,
      );
    }
  });
  return items;
}

export function deleteComplaint(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM complaints WHERE id = ?")
    .run(id);
  return Number(result.changes) > 0;
}

export function replaceAll(complaints: Complaint[]): Complaint[] {
  const normalized = complaints.map((c) => normalizeComplaint(c));
  const insert = getDb().prepare(
    `INSERT INTO complaints (id, data, notified_at, received_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  );
  withTransaction(() => {
    getDb().exec("DELETE FROM complaints");
    for (const item of normalized) {
      insert.run(
        item.id,
        toStoredPayload(item),
        item.notifiedAt,
        item.receivedAt,
      );
    }
  });
  return normalized;
}

export function getComplaint(id: string): Complaint | null {
  const row = getDb()
    .prepare("SELECT data FROM complaints WHERE id = ?")
    .get(id) as { data: string } | undefined;
  if (!row) return null;
  return rowToComplaint(row);
}

export function complaintExists(id: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM complaints WHERE id = ?")
    .get(id) as { ok: number } | undefined;
  return Boolean(row);
}

export function resetSeed(): Complaint[] {
  const items = replaceAll(SEED_COMPLAINTS);
  getDb().exec("DELETE FROM report_snapshots");
  return items;
}
