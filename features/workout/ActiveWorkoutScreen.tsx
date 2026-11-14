/**
 * The active workout (a stack screen above the tabs). Every change goes through
 * `activeWorkout`, which keeps it in SQLite: ticked sets at once, typed input
 * shortly after, and everything when the app goes to the background.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '../../db/database';
import { getRoutineExercises, setRoutineExercises } from '../../db/routines';
import { bodyweightExerciseIds, type PreviousSet } from '../../db/workouts';
import { progressionHint } from '../../lib/progression';
import { formatClock } from '../../lib/restTimer';
import { DISPLAY_STEP, formatWeight, fromKg, KG_PER_LB, roundToStep, type WeightUnit } from '../../lib/units';
import {
  type DraftExercise,
  type DraftSet,
  shouldOfferRoutineUpdate,
  parseWeightKg,
  SET_TYPES,
  untickedSetCount,
  type WorkoutDraft,
} from '../../lib/workoutDraft';
import { colors, maxFontScale, radii, spacing, touchTarget, typography } from '../../theme';
import { openExercisePicker } from '../library/pickExercise';
import RestBar from '../rest/RestBar';
import { restTimer } from '../rest/restTimer';
import { armReviewPrompt } from '../review/reviewPrompt';
import { useSettings } from '../settings/settingsStore';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';
import { haptics } from '../ui/haptics';
import { Icon, IconButton } from '../ui/Icon';
import { requestWidgetUpdate } from '../widgets/widgetSync';
import PlateSheet from './PlateSheet';
import { activeWorkout, libraryTemplate, useActiveWorkoutState } from './activeWorkout';
import { useWorkout } from './WorkoutProvider';

type Focus = { exerciseId: number; key: string; field: 'weight' | 'reps' } | null;

/** "100 × 5"; bodyweight exercises with added load read "BW +10 × 5" (the unit is in the column head). */
const fmtSet = (weightKg: number, reps: number, unit: WeightUnit, bodyweight = false) =>
  `${weightKg > 0 ? `${bodyweight ? 'BW +' : ''}${formatWeight(weightKg, unit)}` : 'BW'} × ${reps}`;

/** Layout animations: subtle, and skipped entirely when the system's Reduce Motion is on. */
const tickIn = ZoomIn.duration(160).reduceMotion(ReduceMotion.System);
const flashOut = FadeOut.duration(900).reduceMotion(ReduceMotion.System);

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { session, draft, previous } = useActiveWorkoutState();
  const { showSummary } = useWorkout();

  const [menuFor, setMenuFor] = useState<DraftExercise | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: boolean } | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [plates, setPlates] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState<number[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save typed input whenever the app leaves the foreground, and when leaving the screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') activeWorkout.flush();
    });
    return () => {
      sub.remove();
      activeWorkout.flush();
    };
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // Bodyweight exercises (library equipment "Bodyweight") show added load as "BW +10".
  const exerciseKey = draft?.exercises.map((e) => e.exerciseId).join(',') ?? '';
  const bodyweightIds = useMemo(() => {
    try {
      return bodyweightExerciseIds(getDb(), exerciseKey ? exerciseKey.split(',').map(Number) : []);
    } catch {
      return new Set<number>();
    }
  }, [exerciseKey]);

  const showNotice = (text: string, undo = false) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, undo });
    noticeTimer.current = setTimeout(() => setNotice(null), undo ? 5000 : 3000);
  };

  if (!session || !draft) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>No workout in progress.</Text>
        <Pressable style={[styles.footerBtn, { marginTop: spacing.lg }]} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.footerBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const unit = draft.unit;
  const incrementKg = unit === 'kg' ? settings.incrementKg : settings.incrementLb * KG_PER_LB;
  const increment = unit === 'kg' ? settings.incrementKg : settings.incrementLb;
  const tickedCount = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  // ---------- sets ----------
  const onToggle = (ex: DraftExercise, set: DraftSet) => {
    const result = activeWorkout.toggleDone(ex.exerciseId, set.key);
    if (!result.ok) {
      haptics.warning();
      showNotice(result.error);
      return;
    }
    if (!result.done) {
      haptics.step();
      return;
    }
    if (result.prLabel) {
      haptics.success();
      setFlashKey(set.key);
      setTimeout(() => setFlashKey((k) => (k === set.key ? null : k)), 1200);
      showNotice(`New PR · ${ex.name} · ${result.prLabel}`);
    } else {
      haptics.setDone();
    }
    if (settings.autoStartRest) restTimer.start(result.restSeconds ?? settings.defaultRestSeconds, ex.name);
  };

  const onDeleteSet = (ex: DraftExercise, set: DraftSet) => {
    haptics.destructive();
    activeWorkout.removeSet(ex.exerciseId, set.key);
    showNotice('Set deleted', true);
  };

  const cycleType = (ex: DraftExercise, set: DraftSet) => {
    const next = SET_TYPES[(SET_TYPES.indexOf(set.setType) + 1) % SET_TYPES.length];
    haptics.selection();
    activeWorkout.setType(ex.exerciseId, set.key, next);
  };

  const step = (direction: 1 | -1) => {
    if (!focus) return;
    const ex = draft.exercises.find((e) => e.exerciseId === focus.exerciseId);
    const set = ex?.sets.find((s) => s.key === focus.key);
    if (!ex || !set) return;
    haptics.step();
    if (focus.field === 'reps') {
      const reps = Math.max(0, (parseInt(set.reps, 10) || 0) + direction);
      activeWorkout.updateSet(ex.exerciseId, set.key, { reps: String(reps) });
    } else {
      const current = fromKg(parseWeightKg(set.weight, unit) ?? 0, unit);
      const next = Math.max(0, roundToStep(current + direction * increment, DISPLAY_STEP[unit]));
      activeWorkout.updateSet(ex.exerciseId, set.key, { weightText: next > 0 ? String(next) : '' });
    }
  };

  const focusedWeight = (): number => {
    const ex = focus && draft.exercises.find((e) => e.exerciseId === focus.exerciseId);
    const set = ex?.sets.find((s) => s.key === focus?.key);
    return set ? fromKg(parseWeightKg(set.weight, unit) ?? 0, unit) : 0;
  };

  // ---------- exercises ----------
  const addExercises = () =>
    openExercisePicker(router, {
      title: 'Add exercises',
      multiple: true,
      excludeIds: draft.exercises.map((e) => e.exerciseId),
      destination: 'this workout',
      onPick: (list) => activeWorkout.addExercises(list.map(libraryTemplate)),
    });

  const exerciseActions = (ex: DraftExercise): SheetAction[] => {
    const index = draft.exercises.indexOf(ex);
    const hasTicked = ex.sets.some((s) => s.done);
    const confirmThen = (title: string, action: () => void) =>
      hasTicked
        ? Alert.alert(title, 'Its completed sets in this workout will be removed.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', style: 'destructive', onPress: action },
          ])
        : action();
    return [
      { label: notesOpen.includes(ex.exerciseId) || ex.notes ? 'Edit note' : 'Add note', onPress: () => setNotesOpen((n) => [...n, ex.exerciseId]) },
      { label: 'Move up', disabled: index === 0, onPress: () => activeWorkout.moveExercise(index, index - 1) },
      { label: 'Move down', disabled: index === draft.exercises.length - 1, onPress: () => activeWorkout.moveExercise(index, index + 1) },
      {
        label: 'Swap exercise',
        onPress: () =>
          confirmThen(`Swap ${ex.name}?`, () =>
            openExercisePicker(router, {
              title: `Swap ${ex.name}`,
              multiple: false,
              excludeIds: draft.exercises.map((e) => e.exerciseId),
              destination: 'this workout',
              onPick: ([picked]) => activeWorkout.swapExercise(ex.exerciseId, libraryTemplate(picked)),
            })
          ),
      },
      {
        label: 'Remove from workout',
        destructive: true,
        onPress: () => confirmThen(`Remove ${ex.name}?`, () => activeWorkout.removeExercise(ex.exerciseId)),
      },
    ];
  };

  // ---------- finish / discard ----------
  const finishNow = () => {
    const before = activeWorkout.getSnapshot();
    const result = activeWorkout.finish();
    if (!result.ok) {
      Alert.alert('Could not finish', result.error);
      return;
    }
    restTimer.stopAll();
    haptics.success();
    armReviewPrompt();
    router.back();
    showSummary(result.summary);
    if (before.session?.routineId != null && before.draft) offerRoutineUpdate(before.session.routineId, before.session.name, before.draft);
  };

  const onFinish = () => {
    if (tickedCount === 0) {
      Alert.alert('No completed sets', 'Tick at least one set to finish, or discard the workout.');
      return;
    }
    const unticked = untickedSetCount(draft);
    Alert.alert(
      'Finish workout?',
      unticked > 0
        ? `${unticked} unticked ${unticked === 1 ? 'set' : 'sets'} will be dropped. ${tickedCount} completed ${tickedCount === 1 ? 'set' : 'sets'} will be saved.`
        : `${tickedCount} completed ${tickedCount === 1 ? 'set' : 'sets'} will be saved.`,
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Finish', onPress: finishNow },
      ]
    );
  };

  const onDiscard = () =>
    Alert.alert('Discard workout?', 'This workout and its sets will be deleted. This cannot be undone.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (activeWorkout.discard()) {
            restTimer.stopAll();
            router.back();
          }
        },
      },
    ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="minimise" label="Minimise workout" onPress={() => router.back()} size={30} />
        <View style={{ flex: 1 }}>
          {renaming !== null ? (
            <TextInput
              style={[styles.title, styles.titleInput]}
              value={renaming}
              onChangeText={setRenaming}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              maxLength={60}
              onSubmitEditing={() => setRenaming(null)}
              onBlur={() => {
                if (renaming.trim() !== '') activeWorkout.rename(renaming);
                setRenaming(null);
              }}
              accessibilityLabel="Workout name"
            />
          ) : (
            <Pressable
              onPress={() => setRenaming(session.name)}
              accessibilityRole="button"
              accessibilityLabel={`Workout name, ${session.name}`}
              accessibilityHint="Double-tap to rename"
            >
              <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={maxFontScale.control}>{session.name}</Text>
            </Pressable>
          )}
          <Elapsed startedAt={session.startedAt} />
        </View>
        <Pressable onPress={onFinish} style={styles.finishBtn} accessibilityRole="button" accessibilityLabel="Finish workout">
          <Text style={styles.finishText} maxFontSizeMultiplier={maxFontScale.control}>FINISH</Text>
        </Pressable>
      </View>

      {/* Edge-to-edge Android no longer resizes the window for the keyboard, so pad on both platforms. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {draft.exercises.length === 0 && (
            <Text style={[styles.muted, { textAlign: 'center', marginVertical: spacing.xl }]}>Add an exercise to get started.</Text>
          )}
          {draft.exercises.map((ex) => (
            <ExerciseCard
              key={ex.exerciseId}
              ex={ex}
              unit={unit}
              previous={previous[ex.exerciseId] ?? []}
              bodyweight={bodyweightIds.has(ex.exerciseId)}
              showRpe={settings.showRpe}
              hintsOn={settings.progressionHints}
              incrementKg={incrementKg}
              flashKey={flashKey}
              notesOpen={notesOpen.includes(ex.exerciseId) || ex.notes !== ''}
              onMenu={() => setMenuFor(ex)}
              onToggle={(set) => onToggle(ex, set)}
              onDelete={(set) => onDeleteSet(ex, set)}
              onCycleType={(set) => cycleType(ex, set)}
              onFocus={(key, field) => setFocus({ exerciseId: ex.exerciseId, key, field })}
              onBlur={(key, field) => setFocus((f) => (f && f.key === key && f.field === field ? null : f))}
              onHint={(text) => showNotice(text)}
            />
          ))}
          <Pressable style={styles.addExercise} onPress={addExercises} accessibilityRole="button">
            <Text style={styles.addExerciseText}>+ ADD EXERCISE</Text>
          </Pressable>
          <Pressable style={styles.discard} onPress={onDiscard} accessibilityRole="button">
            <Text style={styles.discardText}>Discard workout</Text>
          </Pressable>
        </ScrollView>

        {notice && (
          <View style={styles.notice} accessibilityLiveRegion="polite">
            <Text style={styles.noticeText} numberOfLines={3}>{notice.text}</Text>
            {notice.undo && (
              <Pressable
                onPress={() => {
                  activeWorkout.undoRemoveSet();
                  setNotice(null);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.undo}>UNDO</Text>
              </Pressable>
            )}
          </View>
        )}

        {focus ? (
          <View style={styles.accessory}>
            <AccessoryBtn label={focus.field === 'weight' ? `− ${increment}` : '− 1'} onPress={() => step(-1)} a11y="Decrease" />
            <AccessoryBtn label={focus.field === 'weight' ? `+ ${increment}` : '+ 1'} onPress={() => step(1)} a11y="Increase" />
            {focus.field === 'weight' && <AccessoryBtn label="Plates" onPress={() => setPlates(focusedWeight())} a11y="Plate calculator" />}
          </View>
        ) : (
          <View style={{ paddingBottom: insets.bottom }}>
            <RestBar />
          </View>
        )}
      </KeyboardAvoidingView>

      <ActionSheet visible={menuFor !== null} title={menuFor?.name} actions={menuFor ? exerciseActions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <PlateSheet visible={plates !== null} target={plates ?? 0} unit={unit} onClose={() => setPlates(null)} />
    </View>
  );

  function offerRoutineUpdate(routineId: number, name: string, finalDraft: WorkoutDraft) {
    let routine: ReturnType<typeof getRoutineExercises>;
    try {
      routine = getRoutineExercises(getDb(), routineId);
    } catch {
      return;
    }
    if (!shouldOfferRoutineUpdate(routine.map((r) => r.exerciseId), finalDraft)) return;
    const byId = new Map(routine.map((r) => [r.exerciseId, r]));
    setTimeout(
      () =>
        Alert.alert('Update routine?', `This workout's exercises differ from "${name}". Update the routine with these changes?`, [
          { text: 'Keep routine', style: 'cancel' },
          {
            text: 'Update',
            onPress: () => {
              try {
                setRoutineExercises(
                  getDb(),
                  routineId,
                  finalDraft.exercises.map((e) => {
                    const old = byId.get(e.exerciseId);
                    return {
                      exerciseId: e.exerciseId,
                      targetSets: old?.targetSets ?? Math.max(1, e.sets.length),
                      repMin: old?.repMin ?? e.repMin,
                      repMax: old?.repMax ?? e.repMax,
                      restSeconds: old?.restSeconds ?? e.restSeconds,
                      notes: old?.notes ?? null,
                    };
                  })
                );
                requestWidgetUpdate();
              } catch (error) {
                console.error('Updating routine failed:', error);
                Alert.alert('Could not update the routine');
              }
            },
          },
        ]),
      500
    );
  }
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = (now - Date.parse(startedAt)) / 1000;
  return (
    <Text style={styles.elapsed} maxFontSizeMultiplier={maxFontScale.control} accessibilityLabel={`Elapsed ${formatClock(seconds)}`}>
      {formatClock(seconds)}
    </Text>
  );
}

function AccessoryBtn({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.accessoryBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={a11y}>
      <Text style={styles.accessoryText} maxFontSizeMultiplier={maxFontScale.control}>{label}</Text>
    </Pressable>
  );
}

interface CardProps {
  ex: DraftExercise;
  unit: WeightUnit;
  previous: PreviousSet[];
  /** Library equipment "Bodyweight": the weight is added load ("BW +10"). */
  bodyweight: boolean;
  showRpe: boolean;
  hintsOn: boolean;
  incrementKg: number;
  flashKey: string | null;
  notesOpen: boolean;
  onMenu: () => void;
  onToggle: (set: DraftSet) => void;
  onDelete: (set: DraftSet) => void;
  onCycleType: (set: DraftSet) => void;
  onFocus: (key: string, field: 'weight' | 'reps') => void;
  onBlur: (key: string, field: 'weight' | 'reps') => void;
  onHint: (text: string) => void;
}

function ExerciseCard({ ex, unit, previous, bodyweight, showRpe, hintsOn, incrementKg, flashKey, notesOpen, onMenu, onToggle, onDelete, onCycleType, onFocus, onBlur, onHint }: CardProps) {
  const hint = hintsOn ? progressionHint(previous, { repMin: ex.repMin, repMax: ex.repMax }, incrementKg) : null;
  const hasOpenWorking = ex.sets.some((s) => !s.done && s.setType !== 'warmup');
  let workingNumber = 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exName}>
            {ex.name}
            {ex.variation ? <Text style={styles.variation}>{`  ${ex.variation}`}</Text> : null}
          </Text>
          <Text style={styles.sub}>
            {ex.muscle}
            {ex.repMin !== null || ex.repMax !== null ? ` · ${ex.repMin ?? ''}${ex.repMin !== null && ex.repMax !== null && ex.repMin !== ex.repMax ? `–${ex.repMax}` : ex.repMin === null ? ex.repMax : ''} reps` : ''}
            {ex.restSeconds ? ` · rest ${formatClock(ex.restSeconds)}` : ''}
          </Text>
        </View>
        <IconButton icon="more" label={`Options for ${ex.name}`} onPress={onMenu} size={24} />
      </View>

      {notesOpen && (
        <TextInput
          style={styles.notes}
          placeholder="Note for this exercise"
          placeholderTextColor={colors.textDisabled}
          value={ex.notes}
          onChangeText={(t) => activeWorkout.setNotes(ex.exerciseId, t)}
          multiline
          accessibilityLabel={`Note for ${ex.name}`}
        />
      )}

      {hint && hasOpenWorking && (
        <Pressable
          style={styles.hint}
          onPress={() => {
            haptics.selection();
            for (const s of ex.sets) {
              if (!s.done && s.setType !== 'warmup') activeWorkout.fillSet(ex.exerciseId, s.key, hint.weightKg, String(hint.reps));
            }
            onHint(hint.reason);
          }}
          onLongPress={() => onHint(hint.reason)}
          accessibilityRole="button"
          accessibilityLabel={`Suggestion: ${fmtSet(hint.weightKg, hint.reps, unit, bodyweight)}. ${hint.reason} Tap to fill.`}
        >
          {hint.increase && <Icon name="increase" size={16} color={colors.accent} />}
          <Text style={styles.hintText} maxFontSizeMultiplier={maxFontScale.control}>
            {`Try ${hint.weightKg > 0 ? `${bodyweight ? 'BW +' : ''}${formatWeight(hint.weightKg, unit)}` : 'BW'} × ${hint.repsLabel}`}
          </Text>
        </Pressable>
      )}

      <View style={styles.tableHead} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[styles.th, styles.colSet]} maxFontSizeMultiplier={maxFontScale.dense}>SET</Text>
        <Text style={[styles.th, styles.colPrev]} maxFontSizeMultiplier={maxFontScale.dense}>PREVIOUS</Text>
        <Text style={[styles.th, styles.colInput]} maxFontSizeMultiplier={maxFontScale.dense}>{`${bodyweight ? '+' : ''}${unit.toUpperCase()}`}</Text>
        <Text style={[styles.th, styles.colInput]} maxFontSizeMultiplier={maxFontScale.dense}>REPS</Text>
        {showRpe && <Text style={[styles.th, styles.colRpe]} maxFontSizeMultiplier={maxFontScale.dense}>RPE</Text>}
        <View style={[styles.colDone, { alignItems: 'center' }]}>
          <Icon name="check" size={14} color={colors.textTertiary} />
        </View>
      </View>

      {ex.sets.map((set, i) => {
        if (set.setType !== 'warmup') workingNumber += 1;
        const label = set.setType === 'warmup' ? 'W' : set.setType === 'drop' ? 'D' : set.setType === 'failure' ? 'F' : String(workingNumber);
        const prev = previous[i];
        return (
          <ReanimatedSwipeable
            key={set.key}
            friction={1.5}
            rightThreshold={60}
            overshootRight={false}
            renderRightActions={() => (
              <View style={styles.swipeDelete}>
                <Text style={styles.swipeDeleteText}>Delete</Text>
              </View>
            )}
            onSwipeableOpen={() => onDelete(set)}
          >
            <View style={[styles.row, set.done && styles.rowDone]}>
              {flashKey === set.key && (
                // PR: a gold flash that fades out (no animation under Reduce Motion).
                <Animated.View exiting={flashOut} pointerEvents="none" style={styles.rowFlash}>
                  <View style={styles.rowFlashFill} />
                </Animated.View>
              )}
              <Pressable
                style={[styles.colSet, styles.typeChip]}
                onPress={() => onCycleType(set)}
                accessibilityRole="button"
                accessibilityLabel={`Set ${label}, ${set.setType}. Tap to change type.`}
              >
                <Text style={[styles.typeText, set.setType !== 'working' && styles.typeTextSpecial]} maxFontSizeMultiplier={maxFontScale.dense}>{label}</Text>
              </Pressable>
              <Pressable
                style={styles.colPrev}
                disabled={!prev || set.done}
                onPress={() => prev && activeWorkout.fillSet(ex.exerciseId, set.key, prev.weight, String(prev.reps))}
                accessibilityRole="button"
                accessibilityLabel={prev ? `Previous ${fmtSet(prev.weight, prev.reps, unit, bodyweight)} ${unit}. Tap to fill.` : 'No previous set'}
              >
                <Text style={styles.prev} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={maxFontScale.dense}>
                  {prev ? fmtSet(prev.weight, prev.reps, unit, bodyweight) : '—'}
                </Text>
              </Pressable>
              <TextInput
                style={[styles.input, styles.colInput]}
                value={set.weight.text}
                placeholder="BW"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                selectTextOnFocus
                onFocus={() => onFocus(set.key, 'weight')}
                onBlur={() => onBlur(set.key, 'weight')}
                onChangeText={(t) => activeWorkout.updateSet(ex.exerciseId, set.key, { weightText: t })}
                maxFontSizeMultiplier={maxFontScale.dense}
                accessibilityLabel={bodyweight ? `Added weight in ${unit}, set ${label}. Blank is bodyweight.` : `Weight in ${unit}, set ${label}`}
              />
              <TextInput
                style={[styles.input, styles.colInput]}
                value={set.reps}
                placeholder="0"
                placeholderTextColor={colors.textDisabled}
                keyboardType="number-pad"
                selectTextOnFocus
                onFocus={() => onFocus(set.key, 'reps')}
                onBlur={() => onBlur(set.key, 'reps')}
                onChangeText={(t) => activeWorkout.updateSet(ex.exerciseId, set.key, { reps: t.replace(/[^0-9]/g, '') })}
                maxFontSizeMultiplier={maxFontScale.dense}
                accessibilityLabel={`Reps, set ${label}`}
              />
              {showRpe && (
                <TextInput
                  style={[styles.input, styles.colRpe]}
                  value={set.rpe}
                  placeholder="–"
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  onChangeText={(t) => activeWorkout.updateSet(ex.exerciseId, set.key, { rpe: t })}
                  maxFontSizeMultiplier={maxFontScale.dense}
                  accessibilityLabel={`RPE, set ${label}`}
                />
              )}
              <Pressable
                style={[styles.colDone, styles.check, set.done && styles.checkOn]}
                onPress={() => onToggle(set)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: set.done }}
                accessibilityLabel={`Set ${label} done`}
                hitSlop={4}
              >
                {set.done && (
                  <Animated.View entering={tickIn}>
                    <Icon name="check" size={24} color={colors.onAccent} />
                  </Animated.View>
                )}
              </Pressable>
            </View>
          </ReanimatedSwipeable>
        );
      })}

      <Pressable style={styles.addSet} onPress={() => activeWorkout.addSet(ex.exerciseId)} accessibilityRole="button" accessibilityLabel={`Add set to ${ex.name}`}>
        <Text style={styles.addSetText} maxFontSizeMultiplier={maxFontScale.control}>+ ADD SET</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { ...typography.body, color: colors.textTertiary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { ...typography.title, color: colors.textPrimary },
  titleInput: { paddingVertical: 0, borderBottomWidth: 1, borderColor: colors.accent },
  elapsed: { ...typography.numericSmall, color: colors.accent },
  finishBtn: { backgroundColor: colors.accent, borderRadius: radii.md, paddingHorizontal: spacing.lg, minHeight: touchTarget, justifyContent: 'center' },
  finishText: { ...typography.label, fontSize: 13, color: colors.onAccent, letterSpacing: 2 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  exName: { ...typography.heading, color: colors.textPrimary },
  variation: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  notes: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface2,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    minHeight: 36,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  hintText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  th: { ...typography.label, fontSize: 10, color: colors.textTertiary, textAlign: 'center' },
  colSet: { width: 40 },
  colPrev: { flex: 1.3, justifyContent: 'center' },
  colInput: { flex: 1 },
  colRpe: { width: 44 },
  colDone: { width: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 3, backgroundColor: colors.surface1 },
  rowDone: { backgroundColor: colors.successSurface },
  rowFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  rowFlashFill: { flex: 1, backgroundColor: colors.accent, opacity: 0.85, borderRadius: radii.sm },
  typeChip: { height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.surface2 },
  typeText: { ...typography.numeric, color: colors.textPrimary },
  typeTextSpecial: { color: colors.accent },
  prev: { ...typography.numericSmall, color: colors.textTertiary, textAlign: 'center' },
  input: {
    ...typography.numeric,
    color: colors.textPrimary,
    backgroundColor: colors.surface3,
    borderRadius: radii.sm,
    height: touchTarget,
    paddingVertical: 0,
    textAlign: 'center',
  },
  // Large done box (gym ergonomics): 52 × 44 pt plus hitSlop.
  check: { height: touchTarget, borderRadius: radii.sm, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.success },
  swipeDelete: { backgroundColor: colors.danger, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.sm, marginVertical: 3 },
  swipeDeleteText: { ...typography.bodyStrong, color: colors.onAccent },
  addSet: { marginTop: spacing.sm, minHeight: touchTarget, borderRadius: radii.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  addSetText: { ...typography.label, color: colors.textSecondary },
  addExercise: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  addExerciseText: { ...typography.label, fontSize: 13, color: colors.accent },
  discard: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  discardText: { ...typography.bodyStrong, color: colors.danger },
  footerBtn: { backgroundColor: colors.surface2, borderRadius: radii.md, paddingHorizontal: spacing.xl, minHeight: 44, justifyContent: 'center' },
  footerBtnText: { ...typography.bodyStrong, color: colors.textPrimary },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  noticeText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  undo: { ...typography.bodyStrong, color: colors.accent },
  accessory: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.surface2, borderTopWidth: 1, borderColor: colors.border },
  accessoryBtn: { flex: 1, minHeight: 44, borderRadius: radii.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  accessoryText: { ...typography.bodyStrong, color: colors.textPrimary },
});
