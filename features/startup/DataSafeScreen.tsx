/**
 * Shown when the database update failed and was rolled back. The workout data is
 * untouched (still the V1 file) and a backup copy exists; the user can retry or
 * share the backup file (e.g. to send it for help).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';

import { toFileUri } from '../../db/database';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';

interface Props {
  error: Error;
  backupPath: string | null;
  onRetry: () => void;
}

export function DataSafeScreen({ error, backupPath, onRetry }: Props) {
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const retry = () => {
    setBusy(true);
    // Let the spinner paint before the synchronous retry blocks the JS thread.
    setTimeout(() => {
      onRetry();
      setBusy(false);
    }, 50);
  };

  const share = async () => {
    if (!backupPath) return;
    setShareError(null);
    try {
      await Sharing.shareAsync(toFileUri(backupPath), {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Share Buaic backup',
      });
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark} accessibilityRole="header">
          BUAIC
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          Your data is safe
        </Text>
        <Text style={styles.body}>
          Buaic couldn&apos;t finish updating how your workouts are stored, so it undid the update. Nothing was
          changed: all your workouts are still on this phone exactly as before.
        </Text>
        {backupPath ? (
          <Text style={styles.body}>A backup copy of your data was also saved on this phone.</Text>
        ) : null}
        <Text style={styles.body}>Try again. If it keeps happening, share the backup file so it can be checked.</Text>

        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={retry}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Retry the update"
        >
          {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>RETRY</Text>}
        </Pressable>

        {backupPath ? (
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel="Share the backup file"
          >
            <Text style={styles.secondaryText}>SHARE BACKUP FILE</Text>
          </Pressable>
        ) : null}
        {shareError ? <Text style={styles.detail}>Couldn&apos;t share: {shareError}</Text> : null}

        <View style={styles.detailBox}>
          <Text style={styles.detailLabel}>DETAILS</Text>
          <Text style={styles.detail} selectable>
            {error.message}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  wordmark: { ...typography.wordmark, color: colors.accent, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  primary: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryText: { ...typography.label, color: colors.onAccent },
  secondary: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.label, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
  detailBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface1,
    gap: spacing.xs,
  },
  detailLabel: { ...typography.label, color: colors.textTertiary },
  detail: { ...typography.caption, color: colors.textTertiary },
});
