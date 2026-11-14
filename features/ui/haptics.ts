/**
 * One haptics map for the whole app (Phase 5): light for steppers, medium for a
 * set done, success for a PR or finishing a workout. Haptics never block or throw.
 */
import * as Haptics from 'expo-haptics';

const ignore = () => {};

export const haptics = {
  /** Picking an option, a toggle, a segmented control. */
  selection: () => Haptics.selectionAsync().catch(ignore),
  /** − / + steppers, small adjustments, unticking a set. */
  step: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
  /** A set ticked done. */
  setDone: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore),
  /** A personal record, or a workout finished / backup imported. */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  /** Something couldn't be done (e.g. ticking a set with no reps). */
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore),
  /** Deleting something (swipe delete). */
  destructive: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(ignore),
};
