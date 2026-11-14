/**
 * iOS rest-timer Live Activity (Lock Screen + Dynamic Island), Phase 7, through
 * expo-widgets. The countdown is SwiftUI's timer text, so it runs on its own; the
 * app starts the activity when a rest starts, updates it when the rest is paused,
 * resumed, changed by ±15 s or restarted (or the next set changes), and ends it when
 * the rest is over, skipped, or the workout is finished or discarded. If the app is
 * suspended when the rest runs out, the activity turns stale at the end time and
 * shows "Rest over" until the app ends it. Decisions live in `lib/restActivity.ts`.
 *
 * iOS-only and untested here: see the TestFlight checklist in V2_PROGRESS.md.
 */
import { useEffect } from 'react';
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import { nextSet, restActivityContent, type RestActivityContent, restActivityStep } from '../../lib/restActivity';
import { colors } from '../../theme';
import { useActiveWorkoutState } from '../workout/activeWorkout';
import { useRestTimer } from './restTimer';

/** Dates travel as ISO strings (JSON), which the native side reads back as dates. */
type RestActivityProps = {
  restStart: Date;
  restEnd: Date;
  pausedAt: Date | null;
  next: string;
  nextDetail: string;
  cBackground: string;
  cAccent: string;
  cText: string;
  cMuted: string;
};

const RestActivityLayout = (props: RestActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const over = environment.isStale === true;
  const title = over ? 'REST OVER' : props.pausedAt ? 'REST PAUSED' : 'REST';
  const timer = (size: number, width: number) =>
    over ? (
      <Text modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(props.cAccent)]}>0:00</Text>
    ) : (
      <Text
        timerInterval={{ lower: props.restStart, upper: props.restEnd }}
        countsDown
        pauseTime={props.pausedAt ?? undefined}
        modifiers={[
          font({ size, weight: 'bold' }),
          monospacedDigit(),
          foregroundStyle(props.cAccent),
          multilineTextAlignment('trailing'),
          frame({ width }),
        ]}
      />
    );
  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 }), activityBackgroundTint(props.cBackground)]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(props.cAccent)]}>{title}</Text>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(props.cText), lineLimit(1)]}>{props.next}</Text>
          {props.nextDetail ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle(props.cMuted), lineLimit(1)]}>{props.nextDetail}</Text>
          ) : null}
        </VStack>
        <Spacer />
        {timer(34, 96)}
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={props.cAccent} />,
    compactTrailing: timer(14, 46),
    minimal: <Image systemName="timer" color={props.cAccent} />,
    expandedLeading: (
      <HStack spacing={4} modifiers={[padding({ leading: 4 })]}>
        <Image systemName="timer" color={props.cAccent} />
        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(props.cAccent)]}>{title}</Text>
      </HStack>
    ),
    expandedTrailing: timer(24, 80),
    expandedBottom: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(props.cText), lineLimit(1)]}>{props.next}</Text>
        {props.nextDetail ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(props.cMuted), lineLimit(1)]}>{props.nextDetail}</Text>
        ) : null}
      </VStack>
    ),
  };
};

const restActivity = createLiveActivity<RestActivityProps>('RestTimer', RestActivityLayout);

/**
 * Opened by a tap on the activity: the workout in progress, through the widget link
 * route (`app/widget.tsx`), which goes back to an open workout screen instead of
 * stacking a second one.
 */
const ACTIVITY_URL = 'buaic://widget?action=resume';

let live: LiveActivity<RestActivityProps> | null = null;
let sent: RestActivityContent | null = null;

function toProps(c: RestActivityContent): RestActivityProps {
  return {
    restStart: new Date(c.restStart),
    restEnd: new Date(c.restEnd),
    pausedAt: c.pausedAt === null ? null : new Date(c.pausedAt),
    next: c.next,
    nextDetail: c.nextDetail,
    cBackground: colors.background,
    cAccent: colors.accent,
    cText: colors.textPrimary,
    cMuted: colors.textSecondary,
  };
}

const logError = (what: string) => (error: unknown) => console.log(`Rest Live Activity ${what} failed:`, error);

function apply(desired: RestActivityContent | null) {
  const step = restActivityStep(sent, desired);
  if (step === 'none') return;
  sent = desired;
  try {
    if (step === 'start' && desired) {
      // Throws if the user turned Live Activities off for Buaic; the rest bar and notification still work.
      live = restActivity.start(toProps(desired), ACTIVITY_URL, new Date(desired.restEnd));
    } else if (step === 'update' && desired && live) {
      live.update(toProps(desired), desired.pausedAt === null ? new Date(desired.restEnd) : undefined).catch(logError('update'));
    } else if (step === 'end') {
      const ending = live;
      live = null;
      ending?.end('immediate').catch(logError('end'));
    }
  } catch (error) {
    live = null;
    logError(step)(error);
  }
}

/** Activities left over from a run of the app that was killed (the rest timer itself isn't restored). */
function endLeftovers() {
  try {
    for (const activity of restActivity.getInstances()) activity.end('immediate').catch(logError('cleanup'));
  } catch (error) {
    logError('cleanup')(error);
  }
}

/** Mounted once in the root layout. Renders nothing. */
export function RestLiveActivity(): null {
  const { timer } = useRestTimer();
  const { session, draft } = useActiveWorkoutState();

  useEffect(endLeftovers, []);

  useEffect(() => {
    const label = timer.status === 'idle' ? '' : timer.label;
    apply(restActivityContent(timer, Date.now(), session !== null, nextSet(draft, label), sent));
  }, [timer, session, draft]);

  return null;
}
