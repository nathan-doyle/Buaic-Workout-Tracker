/**
 * First-run onboarding (fresh installs only): units, bar weight, starter plan.
 * Every step can be skipped; whatever is skipped keeps the defaults (kg, 20 kg /
 * 45 lb bar, Buaic's starter splits). Shown once: finishing or skipping marks it done.
 */
import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '../../db/database';
import { applyStarterPlan } from '../../db/onboarding';
import {
  barFor,
  currentStep,
  initialOnboarding,
  isLastStep,
  nextStep,
  ONBOARDING_BARS,
  ONBOARDING_STEPS,
  onboardingWrites,
  type OnboardingState,
  planToApply,
  previousStep,
  setBar,
  STARTER_PLANS,
} from '../../lib/onboarding';
import { colors, maxFontScale, radii, spacing, touchTarget, typography } from '../../theme';
import { settingsStore, useSettings } from '../settings/settingsStore';
import { haptics } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { requestWidgetUpdate } from '../widgets/widgetSync';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [state, setState] = useState<OnboardingState>(() => initialOnboarding(settings));
  const step = currentStep(state);

  const finish = (completed: boolean) => {
    try {
      for (const [key, value] of onboardingWrites(state, completed)) settingsStore.set(key, value as never);
      const plan = planToApply(state, completed);
      if (plan !== 'keep') applyStarterPlan(getDb(), plan);
      requestWidgetUpdate();
    } catch (error) {
      // Settings or routines couldn't be saved; the app still works with the defaults.
      Alert.alert('Not saved', error instanceof Error ? error.message : String(error));
      try {
        settingsStore.set('onboardingStatus', 'done');
      } catch {
        // Shown again next launch.
      }
    }
    if (completed) haptics.success();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Android back: one step back, or skip from the first step (never leaves it half-done).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.step > 0) setState(previousStep(state));
      else finish(false);
      return true;
    });
    return () => sub.remove();
  });

  const choose = (next: OnboardingState) => {
    haptics.selection();
    setState(next);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.top}>
        <View>
          <Text style={styles.wordmark} accessibilityRole="header">BUAIC</Text>
          <Text style={styles.overline}>WORKOUT TRACKER</Text>
        </View>
        <Pressable
          onPress={() => finish(false)}
          style={styles.skip}
          accessibilityRole="button"
          accessibilityLabel="Skip setup"
          accessibilityHint="Keeps the defaults. Everything can be changed later in Settings."
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.dots} accessible accessibilityLabel={`Step ${state.step + 1} of ${ONBOARDING_STEPS.length}`}>
        {ONBOARDING_STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, i <= state.step && styles.dotOn]} />
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {step === 'units' && (
          <>
            <Text style={styles.title} accessibilityRole="header">How do you weigh your lifts?</Text>
            <Text style={styles.lead}>You can switch any time with the KG / LB toggle; nothing you log changes.</Text>
            <Choice title="Kilograms" detail="kg" selected={state.unit === 'kg'} onPress={() => choose({ ...state, unit: 'kg' })} />
            <Choice title="Pounds" detail="lb" selected={state.unit === 'lb'} onPress={() => choose({ ...state, unit: 'lb' })} />
          </>
        )}
        {step === 'bar' && (
          <>
            <Text style={styles.title} accessibilityRole="header">Your usual bar</Text>
            <Text style={styles.lead}>Used by the plate calculator. Plates and weight steps are in Settings.</Text>
            {ONBOARDING_BARS[state.unit].map((w) => (
              <Choice
                key={w}
                title={`${w} ${state.unit}`}
                detail={w === ONBOARDING_BARS[state.unit][0] ? 'Standard Olympic bar' : w === ONBOARDING_BARS[state.unit][1] ? 'Women’s Olympic bar' : 'Technique or short bar'}
                selected={barFor(state) === w}
                onPress={() => choose(setBar(state, w))}
              />
            ))}
          </>
        )}
        {step === 'plan' && (
          <>
            <Text style={styles.title} accessibilityRole="header">Start with a plan?</Text>
            <Text style={styles.lead}>Routines can be edited, added or archived later under Workout → Manage.</Text>
            {STARTER_PLANS.map((p) => (
              <Choice key={p.id} title={p.title} detail={p.detail} selected={state.plan === p.id} onPress={() => choose({ ...state, plan: p.id })} />
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {state.step > 0 && (
          <Pressable
            onPress={() => setState(previousStep(state))}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
          >
            <Icon name="back" color={colors.textPrimary} />
          </Pressable>
        )}
        <Pressable
          onPress={() => (isLastStep(state) ? finish(true) : choose(nextStep(state)))}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText} maxFontSizeMultiplier={maxFontScale.control}>
            {isLastStep(state) ? 'START TRAINING' : 'NEXT'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Choice({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${detail}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceTitle, selected && { color: colors.accent }]}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Icon name="check" size={16} color={colors.onAccent} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { ...typography.wordmark, color: colors.accent },
  overline: { ...typography.overline, color: colors.textSecondary },
  skip: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.md, justifyContent: 'center' },
  skipText: { ...typography.bodyStrong, color: colors.textSecondary },
  dots: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.lg },
  dot: { flex: 1, height: 4, borderRadius: radii.pill, backgroundColor: colors.surface3 },
  dotOn: { backgroundColor: colors.accent },
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  title: { ...typography.title, fontSize: 26, color: colors.textPrimary },
  lead: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 21 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  choiceOn: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  choiceTitle: { ...typography.heading, color: colors.textPrimary },
  choiceDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  radio: { width: 26, height: 26, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  footer: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
  backBtn: { width: 56, minHeight: 56, borderRadius: radii.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minHeight: 56, borderRadius: radii.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.label, fontSize: 15, letterSpacing: 2, color: colors.onAccent },
  pressed: { opacity: 0.75 },
});
