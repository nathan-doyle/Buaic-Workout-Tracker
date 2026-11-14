/**
 * Restore points: the verified database copies an import writes first
 * (`iron_and_stone.pre-import-<UTC stamp>.db`, Phase 2). Pure helpers for naming
 * and listing them.
 */
const PATTERN = /^iron_and_stone\.pre-import-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.db$/;

/** The stamp `applyBackup` writes: UTC, `YYYYMMDDTHHMMSS`. */
export function restorePointStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').slice(0, 15);
}

export function restorePointName(now: Date): string {
  return `iron_and_stone.pre-import-${restorePointStamp(now)}.db`;
}

/** When the restore point was written, or null if the name isn't one. */
export function parseRestorePointName(name: string): Date | null {
  const m = PATTERN.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== mo - 1 ? null : date;
}

export interface RestorePointFile {
  name: string;
  size: number;
}

export interface RestorePoint extends RestorePointFile {
  createdAt: Date;
}

/** Restore points among a folder's files, newest first (other files ignored). */
export function pickRestorePoints(files: readonly RestorePointFile[]): RestorePoint[] {
  return files
    .map((f) => ({ ...f, createdAt: parseRestorePointName(f.name) }))
    .filter((f): f is RestorePoint => f.createdAt !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
