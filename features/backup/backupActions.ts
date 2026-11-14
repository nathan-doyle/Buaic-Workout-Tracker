/**
 * JSON backup on the device: export through the share sheet, pick + validate a
 * file, and import it (after the user confirmed) with a verified copy of the
 * current database saved first.
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  type BackupFile,
  type BackupSummary,
  exportDatabase,
  importBackup,
  validateBackup,
} from '../../db/backupJson';
import { getDb, siblingPath } from '../../db/database';
import { createVerifiedCopy } from '../../db/migrate';
import { formatLocalDate, todayLocalDate } from '../../lib/dates';
import { settingsStore } from '../settings/settingsStore';
import { bumpDataRevision } from './dataRevision';

/** Writes every table to a JSON file and opens the share sheet. */
export async function exportBackup(): Promise<void> {
  const backup = exportDatabase(getDb(), { appVersion: Constants.expoConfig?.version ?? null, now: new Date() });
  const file = new File(Paths.cache, `buaic-backup-${todayLocalDate()}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(backup));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export Buaic backup',
  });
}

export type PickedBackup =
  | { status: 'canceled' }
  | { status: 'invalid'; error: string }
  | { status: 'valid'; backup: BackupFile; summary: BackupSummary };

/** Lets the user choose a backup file, then reads and validates it. Changes nothing. */
export async function pickBackup(): Promise<PickedBackup> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return { status: 'canceled' };

  const picked = new File(result.assets[0].uri);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await picked.text());
  } catch {
    return { status: 'invalid', error: 'This file could not be read as a Buaic backup.' };
  } finally {
    try {
      picked.delete(); // the picker's cache copy
    } catch {
      // Not ours to delete, or already gone.
    }
  }
  const validation = validateBackup(getDb(), parsed);
  return validation.ok
    ? { status: 'valid', backup: validation.backup, summary: validation.summary }
    : { status: 'invalid', error: validation.error };
}

/**
 * Replaces all data with the backup's. A verified copy of the current database is
 * written next to it first; if that fails, nothing is imported.
 */
export function applyBackup(backup: BackupFile): void {
  const db = getDb();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const snapshot = siblingPath(`iron_and_stone.pre-import-${stamp}.db`);
  if (!snapshot) throw new Error('The database location is unknown.');
  createVerifiedCopy(db, snapshot);
  importBackup(db, backup);
  settingsStore.attach(db);
  bumpDataRevision();
}

/** The confirmation text for an import. */
export function describeBackup(summary: BackupSummary): string {
  const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const day = (d: string) => formatLocalDate(d, undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const range =
    summary.firstDate && summary.lastDate
      ? summary.firstDate === summary.lastDate
        ? ` on ${day(summary.firstDate)}`
        : ` from ${day(summary.firstDate)} to ${day(summary.lastDate)}`
      : '';
  const exported = new Date(summary.exportedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    `This backup (exported ${exported}) has ${count(summary.workouts, 'workout', 'workouts')} and ` +
    `${count(summary.sets, 'set', 'sets')}${range}, ${count(summary.exercises, 'exercise', 'exercises')} ` +
    `and ${count(summary.routines, 'split', 'splits')}.\n\n` +
    'Importing replaces all workouts, exercises, splits and settings on this phone. ' +
    'A copy of your current data is saved first. Sets you have not finished saving are discarded.'
  );
}
