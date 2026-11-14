/**
 * The widget deep-link plugin (Phase 7): the generated receiver opens only the app's
 * own links, keeps expo-widgets' class name, and uses the same intent action and
 * extra as the installed expo-widgets (so an update that renames them fails here,
 * not silently on the phone).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withWidgetDeepLink') as {
  providerSource: (pkg: string, name: string, scheme: string) => string;
  INTERACTION_ACTION: string;
  TARGET_EXTRA: string;
};

const expoWidgetsKotlin = (file: string) =>
  readFileSync(join(__dirname, '../../node_modules/expo-widgets/android/src/main/java/expo/modules/widgets', file), 'utf8');

it('matches the action and extra expo-widgets sends for a widget tap', () => {
  const source = expoWidgetsKotlin('WidgetInteractionAction.kt');
  expect(source).toContain(`WIDGET_INTERACTION_ACTION = "${plugin.INTERACTION_ACTION}"`);
  expect(source).toContain(`WIDGET_INTERACTION_TARGET_EXTRA = "${plugin.TARGET_EXTRA}"`);
});

it('keeps the provider class name expo-widgets looks up', () => {
  expect(expoWidgetsKotlin('WidgetProviderNames.kt')).toContain('"${context.packageName}.$widgetName$PROVIDER_SUFFIX"');
  expect(expoWidgetsKotlin('WidgetProviderNames.kt')).toContain('PROVIDER_SUFFIX = "Provider"');
  const kt = plugin.providerSource('com.buaic', 'BuaicWidget', 'buaic');
  expect(kt).toMatch(/^package com\.buaic\n/);
  expect(kt).toContain('class BuaicWidgetProvider : ExpoWidgetsAppWidgetProvider("BuaicWidget")');
});

it('opens only links in the app scheme, inside the app, and passes everything else on', () => {
  const kt = plugin.providerSource('com.buaic', 'BuaicWidget', 'buaic');
  expect(kt).toContain('const val LINK_PREFIX = "buaic://"');
  expect(kt).toContain('.setPackage(context.packageName)');
  expect(kt).toContain('super.onReceive(context, intent)');
  // The Kotlin string template must survive as `$target`, not a JS interpolation.
  expect(kt).toContain('"Could not open $target"');
});
