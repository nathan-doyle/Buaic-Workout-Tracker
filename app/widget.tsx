/**
 * Where a tap on the home-screen widget lands (`buaic://widget?action=start&routine=12`,
 * `…?action=resume`, `…?action=routines`). Decides against the data as it is now
 * (`planWidgetLink`): an open workout is resumed, otherwise the routine starts, as
 * Progress → "Next workout" does. Renders only the background while it redirects.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { type Href, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getDb } from '../db/database';
import { getRoutine } from '../db/routines';
import { getWidgetLinkState } from '../db/widget';
import { parseWidgetLink, planWidgetLink, type WidgetLinkPlan } from '../lib/widgetSnapshot';
import { activeWorkout, routineTemplates } from '../features/workout/activeWorkout';
import { colors } from '../theme';

export default function WidgetLinkScreen() {
  const params = useLocalSearchParams<{ action?: string; routine?: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    // Let the providers' own start-up effects (which run after this child's) finish first.
    const handle = setTimeout(() => {
      let plan: WidgetLinkPlan;
      try {
        plan = planWidgetLink(parseWidgetLink(params), getWidgetLinkState(getDb()));
        if (plan.kind === 'start') {
          const routine = getRoutine(getDb(), plan.routineId);
          if (routine) activeWorkout.start(routine.name, routine.id, routineTemplates(routine.id));
          // If it couldn't start, the store resumed whatever was open (or nothing): show that.
          plan = activeWorkout.getSnapshot().session ? { kind: 'resume' } : { kind: 'home' };
        }
      } catch (error) {
        console.error('Opening the widget link failed:', error);
        plan = { kind: 'home' };
      }

      // The screen below this one (a warm start pushes this route on top of the current stack).
      const state = navigation.getState();
      const below = state && state.index > 0 ? state.routes[state.index - 1]?.name : undefined;
      const target: Href = plan.kind === 'resume' ? '/workout' : plan.kind === 'routines' ? '/routines' : '/';
      const targetName = plan.kind === 'resume' ? 'workout' : plan.kind === 'routines' ? 'routines' : '(tabs)';
      if (below === targetName) router.back();
      else router.replace(target);
    }, 0);
    return () => clearTimeout(handle);
    // Runs once per link: the params of this screen never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.background }} accessibilityLabel="Opening Buaic" />;
}
