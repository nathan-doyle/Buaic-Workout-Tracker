/**
 * iOS home-screen widget (expo-widgets, WidgetKit + SwiftUI): small and medium.
 * Same content as Android (`lib/widgetSnapshot.ts`). The `'widget'` function is
 * turned into a string at build time and runs in the widget extension's own JS
 * runtime: only Expo UI components/modifiers and its props, no imports, hooks or
 * outside constants at run time (the imports name the globals it provides).
 *
 * iOS can't be tested here: see the TestFlight checklist in V2_PROGRESS.md.
 */
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetContent } from '../../lib/widgetSnapshot';
import { type BuaicWidgetProps, PLACEHOLDER_PROPS, toWidgetProps, WIDGET_NAME } from './widgetProps';

const BuaicWidgetLayout = (props: BuaicWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const small = environment.widgetFamily === 'systemSmall';
  const letters = props.dayLetters.split('');
  return (
    <VStack
      alignment="leading"
      spacing={small ? 4 : 6}
      modifiers={[
        containerBackground(props.cBackground, 'widget'),
        widgetURL(props.url),
        accessibilityElement('ignore'),
        accessibilityLabel(props.accessibilityLabel),
      ]}
    >
      <HStack>
        <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(props.cAccent), lineLimit(1)]}>{props.brand}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(props.cAccent), lineLimit(1)]}>
          {props.streakLabel}
        </Text>
      </HStack>
      {small ? null : (
        <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(props.cMuted), lineLimit(1)]}>{props.weekLabel}</Text>
      )}
      <HStack spacing={8}>
        <Text modifiers={[font({ size: small ? 30 : 34, weight: 'bold' }), monospacedDigit(), foregroundStyle(props.cText)]}>
          {String(props.workouts)}
        </Text>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(props.cText), lineLimit(1)]}>{props.workoutsUnit}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(props.cMuted), lineLimit(1)]}>{props.weekDetail}</Text>
        </VStack>
      </HStack>
      {small ? null : (
        <HStack spacing={4}>
          {letters.map((letter, i) => (
            <Text
              key={`d${i}`}
              modifiers={[
                font({ size: 9, weight: 'bold' }),
                foregroundStyle(props.trainedDays[i] === '1' ? props.cOnAccent : props.cMuted),
                frame({ width: 16, height: 16 }),
                background(props.trainedDays[i] === '1' ? props.cAccent : props.cIdle),
                clipShape('circle'),
              ]}
            >
              {letter}
            </Text>
          ))}
        </HStack>
      )}
      <Spacer />
      <HStack modifiers={[padding({ horizontal: 10, vertical: 7 }), background(props.cSurface), clipShape('roundedRectangle', 12)]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle(props.cAccent), lineLimit(1)]}>{props.nextLabel}</Text>
          <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(props.cText), lineLimit(1)]}>{props.nextName}</Text>
        </VStack>
        <Spacer />
        {small ? null : (
          <Text
            modifiers={[
              font({ size: 11, weight: 'bold' }),
              foregroundStyle(props.cOnAccent),
              padding({ horizontal: 12, vertical: 6 }),
              background(props.cAccent),
              clipShape('roundedRectangle', 8),
            ]}
          >
            {props.actionLabel}
          </Text>
        )}
      </HStack>
    </VStack>
  );
};

const buaicWidget = createWidget<BuaicWidgetProps>(WIDGET_NAME, BuaicWidgetLayout, PLACEHOLDER_PROPS);

/** iOS keeps a timeline: today's content now, the next week starts at their local midnight. */
export function publishWidget(entries: readonly { date: Date; content: WidgetContent }[]): void {
  if (entries.length === 0) return;
  buaicWidget.updateTimeline(entries.map((e) => ({ date: e.date, props: toWidgetProps(e.content) })));
}
