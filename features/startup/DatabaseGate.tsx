/**
 * Opens and migrates the database before any screen runs. On success it loads the
 * settings and renders the app; on failure (the migration rolled back, the file is
 * still V1's) it shows the "Your data is safe" screen with Retry.
 */
import React, { useState } from 'react';

import { getDb, type StartupResult, startDatabase } from '../../db/database';
import { settingsStore } from '../settings/settingsStore';
import { DataSafeScreen } from './DataSafeScreen';

let firstStart: StartupResult | null = null;

function start(): StartupResult {
  const result = startDatabase();
  if (result.ok) settingsStore.attach(getDb());
  return result;
}

export function DatabaseGate({ children }: { children: React.ReactNode }) {
  // Synchronous on purpose: the splash screen stays up until the first render is done.
  const [result, setResult] = useState<StartupResult>(() => (firstStart ??= start()));

  if (result.ok) return children;
  return (
    <DataSafeScreen
      error={result.error}
      backupPath={result.backupPath}
      onRetry={() => {
        firstStart = start();
        setResult(firstStart);
      }}
    />
  );
}
