import {
  copyFileSync,
  mkdirSync,
  statSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join, basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  SEED_COMPLAINTS,
  normalizeComplaint,
  stripComplaintMedia,
  type Complaint,
  type ComplaintInput,
} from "../src/schema/index.ts";
import {
  getActiveDek,
  isVaultEnabled,
  isVaultUnlocked,
  lockVault,
  sealComplaint,
  unsealComplaint,
  VaultLockedError,
  dekFromArchiveSettings,
} from "./vault.ts";
import { isEncrypted } from "./field-crypto.ts";

/** 실행 폴더 기준 (시작.bat / npm 스크립트가 cwd를 앱 루트로 맞춤) */
export const DATA_DIR = process.env.TM_DATA_DIR ?? join(process.cwd(), "data");
export const DB_PATH = join(DATA_DIR, "tonghab-minwon.db");
export const ARCHIVES_DIR = join(DATA_DIR, "archives");

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) throw new Error("DB가 초기화되지 않았습니다.");
  return db;
}

export function closeDb(): void {
  if (!db) return;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
  db.close();
  db = null;
}

export function initDb(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  /** 기존 파일을 연 뒤 민원이 0건이어도 샘플을 다시 넣지 않는다(아카이브 전환 대비). */
  const isNewFile = !existsSync(DB_PATH);
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

  if (isNewFile) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM complaints").get() as {
      n: number;
    };
    if (count.n === 0) {
      replaceAll(SEED_COMPLAINTS);
    }
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

/** 목록용: 사진 data URL을 제거해 응답·메모리 부담을 줄인다. */
export function listComplaintsLite(): Complaint[] {
  return listComplaints().map(stripComplaintMedia);
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
  // DELETE만으로는 파일 크기가 줄지 않으므로 여유 페이지를 디스크에서 회수한다.
  compactDb();
  return items;
}

/** WAL 체크포인트 + VACUUM으로 DB 파일 용량을 실제 사용량에 맞게 줄인다. */
export function compactDb(): { beforeBytes: number; afterBytes: number } {
  const beforeBytes = fileSizeBytes(DB_PATH) + fileSizeBytes(`${DB_PATH}-wal`);
  const database = getDb();
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
  database.exec("VACUUM");
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }
  const afterBytes = fileSizeBytes(DB_PATH) + fileSizeBytes(`${DB_PATH}-wal`);
  return { beforeBytes, afterBytes };
}

export type ArchiveRolloverResult = {
  label: string;
  archivePath: string;
  archiveFileName: string;
  archivedComplaintCount: number;
  beforeBytes: number;
  afterBytes: number;
};

/**
 * 현재 DB를 archives/ 에 백업한 뒤 민원만 비운다.
 * 보고 스냅샷·감사 로그·계정·설정은 유지. 샘플 민원은 넣지 않는다.
 */
export function archiveAndClearComplaints(
  labelInput?: string,
): ArchiveRolloverResult {
  const label = sanitizeArchiveLabel(labelInput);
  mkdirSync(ARCHIVES_DIR, { recursive: true });

  const archiveFileName = `tonghab-minwon-${label}.db`;
  const archivePath = join(ARCHIVES_DIR, archiveFileName);
  if (existsSync(archivePath)) {
    throw new Error(
      `같은 라벨의 보관본이 이미 있습니다: ${archiveFileName}. 다른 라벨을 사용하세요.`,
    );
  }

  const archivedComplaintCount = (
    getDb().prepare("SELECT COUNT(*) AS n FROM complaints").get() as {
      n: number;
    }
  ).n;

  const database = getDb();
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }

  if (!existsSync(DB_PATH)) {
    throw new Error("활성 DB 파일이 없습니다.");
  }
  copyFileSync(DB_PATH, archivePath);

  const beforeBytes = fileSizeBytes(DB_PATH) + fileSizeBytes(`${DB_PATH}-wal`);

  withTransaction(() => {
    getDb().exec("DELETE FROM complaints");
  });

  const { afterBytes } = compactDb();

  return {
    label,
    archivePath,
    archiveFileName,
    archivedComplaintCount,
    beforeBytes,
    afterBytes,
  };
}

export function sanitizeArchiveLabel(raw?: string): string {
  const fallback = String(new Date().getFullYear());
  const trimmed = (raw ?? "").trim() || fallback;
  const safe = trimmed
    .replace(/[^\w가-힣.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  if (!safe) {
    throw new Error("보관 라벨이 올바르지 않습니다.");
  }
  return safe;
}

/** archives/ 아래 파일명만 허용 (경로 조작 방지) */
export function resolveArchivePath(fileName: string): string {
  const base = basename(String(fileName ?? "").trim());
  if (
    !base ||
    base !== String(fileName).trim() ||
    !base.endsWith(".db") ||
    base.includes("..")
  ) {
    throw new Error("잘못된 보관본 이름입니다.");
  }
  const full = join(ARCHIVES_DIR, base);
  if (!existsSync(full)) {
    throw new Error(`보관본을 찾을 수 없습니다: ${base}`);
  }
  return full;
}

function settingFromDb(
  database: DatabaseSync,
  key: string,
): string | null {
  try {
    const row = database
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export type ArchiveInfo = {
  name: string;
  bytes: number;
  mtimeMs: number;
  complaintCount: number;
  vaultEnabled: boolean;
};

export function getArchiveInfo(fileName: string): ArchiveInfo {
  const full = resolveArchivePath(fileName);
  const st = statSync(full);
  const arch = new DatabaseSync(full, { readOnly: true });
  try {
    let complaintCount = 0;
    try {
      const row = arch
        .prepare("SELECT COUNT(*) AS n FROM complaints")
        .get() as { n: number };
      complaintCount = Number(row.n) || 0;
    } catch {
      complaintCount = 0;
    }
    return {
      name: basename(full),
      bytes: st.size,
      mtimeMs: st.mtimeMs,
      complaintCount,
      vaultEnabled: settingFromDb(arch, "vault_enabled") === "1",
    };
  } finally {
    arch.close();
  }
}

export type ArchiveDeleteResult = {
  archiveFileName: string;
  bytes: number;
  complaintCount: number;
};

/** archives/ 보관본 파일 삭제 (경로 조작 방지·.db만) */
export function deleteArchiveFile(fileName: string): ArchiveDeleteResult {
  const info = getArchiveInfo(fileName);
  const full = resolveArchivePath(fileName);
  unlinkSync(full);
  return {
    archiveFileName: info.name,
    bytes: info.bytes,
    complaintCount: info.complaintCount,
  };
}

export type ArchiveMergeResult = {
  archiveFileName: string;
  total: number;
  imported: number;
  vaultReencrypted: boolean;
};

/**
 * 보관본에서 민원만 활성 DB로 병합(upsert).
 * 계정·스냅샷·감사·활성 Vault 설정은 유지.
 * 보관본이 암호화된 경우 archivePassword(아카이브 시점 비번)로 풀어 활성 키로 재암호화.
 */
export function restoreArchiveMergeComplaints(
  fileName: string,
  archivePassword?: string,
): ArchiveMergeResult {
  const archivePath = resolveArchivePath(fileName);
  const arch = new DatabaseSync(archivePath, { readOnly: true });
  try {
    const archiveVaultOn = settingFromDb(arch, "vault_enabled") === "1";
    const archiveSalt = settingFromDb(arch, "vault_salt");
    const archiveVerifier = settingFromDb(arch, "vault_verifier");

    let archiveDek: Buffer | null = null;
    if (archiveVaultOn) {
      if (!archivePassword) {
        throw new Error(
          "보관본이 암호화되어 있습니다. 아카이브 시점 비밀번호를 입력하세요.",
        );
      }
      archiveDek = dekFromArchiveSettings(
        archivePassword,
        archiveSalt,
        archiveVerifier,
      );
    }

    const activeVaultOn = isVaultEnabled();
    let activeDek: Buffer | null = null;
    if (activeVaultOn) {
      if (!isVaultUnlocked()) throw new VaultLockedError();
      activeDek = getActiveDek();
    }

    const rows = arch
      .prepare(
        `SELECT id, data, notified_at, received_at FROM complaints`,
      )
      .all() as Array<{
      id: string;
      data: string;
      notified_at: string | null;
      received_at: string;
    }>;

    const upsert = getDb().prepare(
      `INSERT INTO complaints (id, data, notified_at, received_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         notified_at = excluded.notified_at,
         received_at = excluded.received_at,
         updated_at = datetime('now')`,
    );

    let imported = 0;
    withTransaction(() => {
      for (const row of rows) {
        let item = normalizeComplaint(JSON.parse(row.data) as Complaint);
        const looksEncrypted = isEncrypted(item.complainantName);
        if (looksEncrypted) {
          if (!archiveDek) {
            throw new Error(
              "보관본 민원이 암호화되어 있는데 복호화 키가 없습니다. 아카이브 시점 비밀번호를 확인하세요.",
            );
          }
          item = unsealComplaint(item, archiveDek);
        }
        const stored = activeDek ? sealComplaint(item, activeDek) : item;
        upsert.run(
          item.id,
          JSON.stringify(stored),
          item.notifiedAt,
          item.receivedAt,
        );
        imported += 1;
      }
    });

    return {
      archiveFileName: basename(archivePath),
      total: rows.length,
      imported,
      vaultReencrypted: Boolean(archiveDek && activeDek),
    };
  } finally {
    arch.close();
  }
}

export type ArchiveReplaceResult = {
  archiveFileName: string;
  backupFileName: string;
  backupPath: string;
  complaintCount: number;
};

/**
 * 보관본 파일로 활성 DB를 통째 교체.
 * 교체 전 현재 활성은 archives/ 에 자동 백업.
 * 로그인·2FA·Vault가 보관 시점 상태로 되돌아가므로 재로그인 필요.
 */
export function restoreArchiveReplace(fileName: string): ArchiveReplaceResult {
  const archivePath = resolveArchivePath(fileName);
  mkdirSync(ARCHIVES_DIR, { recursive: true });

  const info = getArchiveInfo(fileName);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const backupFileName = `tonghab-minwon-before-restore-${stamp}.db`;
  const backupPath = join(ARCHIVES_DIR, backupFileName);

  try {
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* ignore */
  }

  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, backupPath);
  }

  closeDb();
  lockVault();

  for (const side of [`${DB_PATH}-wal`, `${DB_PATH}-shm`] as const) {
    try {
      if (existsSync(side)) unlinkSync(side);
    } catch {
      /* ignore */
    }
  }

  try {
    copyFileSync(archivePath, DB_PATH);
    initDb();
    getDb().exec("DELETE FROM sessions");
  } catch (err) {
    // 실패 시 백업으로 복구 시도
    try {
      if (existsSync(backupPath)) {
        copyFileSync(backupPath, DB_PATH);
        if (!db) initDb();
      } else if (!db) {
        initDb();
      }
    } catch {
      /* ignore secondary */
    }
    throw err instanceof Error
      ? err
      : new Error("보관본 교체 복원에 실패했습니다.");
  }

  return {
    archiveFileName: basename(archivePath),
    backupFileName,
    backupPath,
    complaintCount: info.complaintCount,
  };
}

function fileSizeBytes(path: string): number {
  try {
    if (!existsSync(path)) return 0;
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export type DbStorageInfo = {
  dataDir: string;
  dbPath: string;
  dbFileName: string;
  exists: boolean;
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
  complaintCount: number;
  freelistBytes: number;
  /** complaints.data 안에서 사진 URL(base64 등)이 차지하는 추정 바이트 */
  photoPayloadBytes: number;
  /** complaints.data 전체 추정 바이트 */
  complaintPayloadBytes: number;
  photoCount: number;
  dataDirBytes: number;
  dataDirFiles: Array<{ name: string; bytes: number }>;
  archivesDir: string;
  archives: Array<{ name: string; bytes: number; mtimeMs: number }>;
};

function estimatePhotoBytes(dataJson: string): {
  total: number;
  photos: number;
  photoCount: number;
} {
  const total = dataJson.length;
  try {
    const c = JSON.parse(dataJson) as {
      photos?: Array<{ url?: string | null }>;
      photoReceiptUrl?: string | null;
      photoBeforeUrl?: string | null;
      photoAfterUrl?: string | null;
    };
    const photos = c.photos ?? [];
    let photoBytes = 0;
    for (const p of photos) {
      if (p?.url) photoBytes += p.url.length;
    }
    // photos[]에 이미 포함된 경우 레거시 필드 중복 합산을 피한다.
    if (photos.length === 0) {
      for (const key of [
        "photoReceiptUrl",
        "photoBeforeUrl",
        "photoAfterUrl",
      ] as const) {
        const v = c[key];
        if (v) photoBytes += v.length;
      }
    }
    return { total, photos: photoBytes, photoCount: photos.length };
  } catch {
    return { total, photos: 0, photoCount: 0 };
  }
}

/** 설정 화면용: DB 파일 위치·용량·건수 */
export function getDbStorageInfo(): DbStorageInfo {
  const dbPath = DB_PATH;
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  const dbBytes = fileSizeBytes(dbPath);
  const walBytes = fileSizeBytes(walPath);
  const shmBytes = fileSizeBytes(shmPath);

  let complaintCount = 0;
  let freelistBytes = 0;
  let photoPayloadBytes = 0;
  let complaintPayloadBytes = 0;
  let photoCount = 0;
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM complaints")
      .get() as { n: number };
    complaintCount = Number(row.n) || 0;
    const pageSize = (
      getDb().prepare("PRAGMA page_size").get() as { page_size: number }
    ).page_size;
    const freelist = (
      getDb().prepare("PRAGMA freelist_count").get() as {
        freelist_count: number;
      }
    ).freelist_count;
    freelistBytes = (Number(pageSize) || 4096) * (Number(freelist) || 0);

    const rows = getDb()
      .prepare("SELECT data FROM complaints")
      .all() as { data: string }[];
    for (const r of rows) {
      const est = estimatePhotoBytes(r.data);
      complaintPayloadBytes += est.total;
      photoPayloadBytes += est.photos;
      photoCount += est.photoCount;
    }
  } catch {
    complaintCount = 0;
    freelistBytes = 0;
    photoPayloadBytes = 0;
    complaintPayloadBytes = 0;
    photoCount = 0;
  }

  const dataDirFiles: Array<{ name: string; bytes: number }> = [];
  let dataDirBytes = 0;
  try {
    if (existsSync(DATA_DIR)) {
      for (const name of readdirSync(DATA_DIR)) {
        const full = join(DATA_DIR, name);
        try {
          const st = statSync(full);
          if (!st.isFile()) continue;
          dataDirFiles.push({ name, bytes: st.size });
          dataDirBytes += st.size;
        } catch {
          /* skip */
        }
      }
      dataDirFiles.sort((a, b) => b.bytes - a.bytes);
    }
  } catch {
    /* skip */
  }

  const archives: Array<{ name: string; bytes: number; mtimeMs: number }> = [];
  try {
    if (existsSync(ARCHIVES_DIR)) {
      for (const name of readdirSync(ARCHIVES_DIR)) {
        if (!name.endsWith(".db")) continue;
        const full = join(ARCHIVES_DIR, name);
        try {
          const st = statSync(full);
          if (!st.isFile()) continue;
          archives.push({
            name,
            bytes: st.size,
            mtimeMs: st.mtimeMs,
          });
          dataDirBytes += st.size;
        } catch {
          /* skip */
        }
      }
      archives.sort((a, b) => b.mtimeMs - a.mtimeMs);
    }
  } catch {
    /* skip */
  }

  return {
    dataDir: DATA_DIR,
    dbPath,
    dbFileName: basename(dbPath),
    exists: existsSync(dbPath),
    dbBytes,
    walBytes,
    shmBytes,
    totalBytes: dbBytes + walBytes + shmBytes,
    complaintCount,
    freelistBytes,
    photoPayloadBytes,
    complaintPayloadBytes,
    photoCount,
    dataDirBytes,
    dataDirFiles,
    archivesDir: ARCHIVES_DIR,
    archives,
  };
}
