import { apiRequest } from "./client";

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
  photoPayloadBytes: number;
  complaintPayloadBytes: number;
  photoCount: number;
  dataDirBytes: number;
  dataDirFiles: Array<{ name: string; bytes: number }>;
  archivesDir: string;
  archives: Array<{ name: string; bytes: number; mtimeMs: number }>;
};

export type ArchiveInfo = {
  name: string;
  bytes: number;
  mtimeMs: number;
  complaintCount: number;
  vaultEnabled: boolean;
};

export async function apiGetStorage(): Promise<DbStorageInfo> {
  const data = await apiRequest<{ storage: DbStorageInfo }>("/api/storage");
  return data.storage;
}

export async function apiCompactStorage(): Promise<{
  beforeBytes: number;
  afterBytes: number;
  storage: DbStorageInfo;
}> {
  return apiRequest("/api/storage/compact", {
    method: "POST",
    body: "{}",
  });
}

export type ArchiveRolloverResult = {
  ok: true;
  label: string;
  archivePath: string;
  archiveFileName: string;
  archivedComplaintCount: number;
  beforeBytes: number;
  afterBytes: number;
  storage: DbStorageInfo;
};

export async function apiArchiveRollover(
  password: string,
  options?: { label?: string; totpCode?: string },
): Promise<ArchiveRolloverResult> {
  return apiRequest("/api/storage/archive-rollover", {
    method: "POST",
    body: JSON.stringify({
      password,
      ...(options?.label ? { label: options.label } : {}),
      ...(options?.totpCode ? { totpCode: options.totpCode } : {}),
    }),
  });
}

export async function apiGetArchiveInfo(fileName: string): Promise<ArchiveInfo> {
  const data = await apiRequest<{ archive: ArchiveInfo }>(
    `/api/storage/archives/${encodeURIComponent(fileName)}`,
  );
  return data.archive;
}

export type ArchiveRestoreResult =
  | {
      ok: true;
      mode: "merge";
      requiresRelogin: false;
      archiveFileName: string;
      total: number;
      imported: number;
      vaultReencrypted: boolean;
      storage: DbStorageInfo;
    }
  | {
      ok: true;
      mode: "replace";
      requiresRelogin: true;
      archiveFileName: string;
      backupFileName: string;
      backupPath: string;
      complaintCount: number;
      storage: DbStorageInfo;
    };

export async function apiArchiveRestore(options: {
  password: string;
  fileName: string;
  mode: "merge" | "replace";
  archivePassword?: string;
  totpCode?: string;
}): Promise<ArchiveRestoreResult> {
  return apiRequest("/api/storage/archive-restore", {
    method: "POST",
    body: JSON.stringify({
      password: options.password,
      fileName: options.fileName,
      mode: options.mode,
      ...(options.archivePassword
        ? { archivePassword: options.archivePassword }
        : {}),
      ...(options.totpCode ? { totpCode: options.totpCode } : {}),
    }),
  });
}

export type ArchiveDeleteResult = {
  ok: true;
  archiveFileName: string;
  bytes: number;
  complaintCount: number;
  storage: DbStorageInfo;
};

export async function apiArchiveDelete(options: {
  password: string;
  fileName: string;
  totpCode?: string;
}): Promise<ArchiveDeleteResult> {
  return apiRequest("/api/storage/archive-delete", {
    method: "POST",
    body: JSON.stringify({
      password: options.password,
      fileName: options.fileName,
      ...(options.totpCode ? { totpCode: options.totpCode } : {}),
    }),
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}
