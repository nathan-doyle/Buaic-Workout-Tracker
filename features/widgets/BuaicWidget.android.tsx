/**
 * Android home-screen widget (expo-widgets, Jetpack Glance). The `'widget'`
 * function below is turned into a string at build time and runs in the widget's
 * own JS runtime: it may only use Expo UI components/modifiers and its props (no
 * imports, hooks or outside constants at run time; the imports are for types and
 * name the globals that runtime provides, so they must not be renamed).
 *
 * The whole widget is one Button whose `target` is the deep link. expo-widgets
 * sends widget taps to the widget's own receiver; `plugins/withWidgetDeepLink.js`
 * makes that receiver open `buaic://…` targets in the app.
 */
import { Box, Button, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

import type { WidgetContent } from '../../lib/widgetSnapshot';
import { type BuaicWidgetProps, PLACEHOLDER_PROPS, toWidgetProps, WIDGET_NAME } from './widgetProps';

const BuaicWidgetLayout = (props: BuaicWidgetProps) => {
  'widget';
  const letters = props.dayLetters.split('');
  // `target` is read by expo-widgets on Android but isn't in Button's TS props.
  const tapTarget = { target: props.url };
  return (
    <Button {...tapTarget} colors={{ containerColor: props.cBackground }} modifiers={[fillMaxSize(), cornerRadius(20)]}>
      {/* Centred: a taller widget (resized, or a launcher with tall rows) gets even margins, and nothing can overlap. */}
      <Column verticalArrangement="center" modifiers={[fillMaxSize(), padding(14, 12, 14, 12)]}>
        <Box modifiers={[fillMaxWidth()]} contentAlignment="centerStart">
          <Text color={props.cAccent} maxLines={1} style={{ fontSize: 12, fontWeight: 'bold' }}>
            {props.brand}
          </Text>
          <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
            <Text color={props.cMuted} maxLines={1} style={{ fontSize: 10 }}>
              {props.weekLabel}
            </Text>
          </Box>
        </Box>
        <Spacer modifiers={[height(6)]} />
        <Row verticalAlignment="center">
          <Text color={props.cText} maxLines={1} style={{ fontSize: 30, fontWeight: 'bold' }}>
            {String(props.workouts)}
          </Text>
          <Spacer modifiers={[width(8)]} />
          <Column>
            <Text color={props.cText} maxLines={1} style={{ fontSize: 13, fontWeight: 'bold' }}>
              {props.workoutsUnit}
            </Text>
            <Text color={props.cMuted} maxLines={1} style={{ fontSize: 11 }}>
              {props.weekDetail}
            </Text>
          </Column>
        </Row>
        <Spacer modifiers={[height(6)]} />
        <Box modifiers={[fillMaxWidth()]} contentAlignment="centerStart">
          <Row verticalAlignment="center">
            {letters.map((letter, i) => (
              <Row key={`d${i}`}>
                <Box
                  contentAlignment="center"
                  modifiers={[size(16, 16), cornerRadius(8), background(props.trainedDays[i] === '1' ? props.cAccent : props.cIdle)]}
                >
                  <Text
                    color={props.trainedDays[i] === '1' ? props.cOnAccent : props.cMuted}
                    maxLines={1}
                    style={{ fontSize: 9, fontWeight: 'bold' }}
                  >
                    {letter}
                  </Text>
                </Box>
                <Spacer modifiers={[width(4)]} />
              </Row>
            ))}
          </Row>
          <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
            <Text color={props.cAccent} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold' }}>
              {props.streakLabel}
            </Text>
          </Box>
        </Box>
        <Spacer modifiers={[height(10)]} />
        <Box modifiers={[fillMaxWidth(), background(props.cSurface), cornerRadius(12), padding(10, 8, 10, 8)]} contentAlignment="centerStart">
          <Column modifiers={[padding(0, 0, 76, 0)]}>
            <Text color={props.cAccent} maxLines={1} style={{ fontSize: 9, fontWeight: 'bold' }}>
              {props.nextLabel}
            </Text>
            <Text color={props.cText} maxLines={1} style={{ fontSize: 14, fontWeight: 'bold' }}>
              {props.nextName}
            </Text>
          </Column>
          <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
            <Box modifiers={[background(props.cAccent), cornerRadius(8), padding(12, 6, 12, 6)]} contentAlignment="center">
              <Text color={props.cOnAccent} maxLines={1} style={{ fontSize: 11, fontWeight: 'bold' }}>
                {props.actionLabel}
              </Text>
            </Box>
          </Box>
        </Box>
      </Column>
    </Button>
  );
};

const buaicWidget = createWidget<BuaicWidgetProps>(WIDGET_NAME, BuaicWidgetLayout, PLACEHOLDER_PROPS);

/** Shows the first entry now (Android widgets have no timeline; the app pushes again when data changes). */
export function publishWidget(entries: readonly { date: Date; content: WidgetContent }[]): void {
  if (entries.length === 0) return;
  buaicWidget.updateSnapshot(toWidgetProps(entries[0].content));
}
