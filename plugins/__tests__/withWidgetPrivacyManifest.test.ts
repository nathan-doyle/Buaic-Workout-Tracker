/**
 * The widget-extension privacy manifest plugin (Phase 8). The fixture is the Xcode
 * project `expo prebuild --platform ios` generates for this app (SDK 58 template +
 * expo-widgets' ExpoWidgetsTarget), before this plugin runs.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const xcode = require('xcode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plist = require('@expo/plist').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withWidgetPrivacyManifest') as {
  EXTENSION_PRIVACY: Manifest;
  privacyManifestXml: () => string;
  addPrivacyManifestToTarget: (project: XcodeProject, targetName: string) => XcodeProject;
  resourcesPhaseOf: (project: XcodeProject, targetUuid: string) => { files: { value: string }[] } | null;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('../../app.json');

type Manifest = {
  NSPrivacyTracking: boolean;
  NSPrivacyTrackingDomains: string[];
  NSPrivacyCollectedDataTypes: unknown[];
  NSPrivacyAccessedAPITypes: { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }[];
};
type XcodeProject = {
  findTargetKey: (name: string) => string | null;
  pbxBuildFileSection: () => Record<string, { fileRef?: string }>;
  pbxFileReferenceSection: () => Record<string, { path?: string; sourceTree?: string }>;
  pbxGroupByName: (name: string) => { children: { value: string; comment: string }[] };
  writeSync: () => string;
};

const TARGET = 'ExpoWidgetsTarget';
let dir: string;

function load(text?: string): XcodeProject {
  const file = join(dir, `p${Math.random().toString(36).slice(2)}.pbxproj`);
  // Normalise line endings (git may check the fixture out with CRLF).
  writeFileSync(file, (text ?? readFileSync(join(__dirname, 'fixtures/expo-widgets.pbxproj'), 'utf8')).replace(/\r\n/g, '\n'));
  return xcode.project(file).parseSync();
}

/** Paths of the files in a target's Resources phase. */
function resourcePaths(project: XcodeProject, targetName: string): string[] {
  const phase = plugin.resourcesPhaseOf(project, project.findTargetKey(targetName)!);
  if (!phase) return [];
  const buildFiles = project.pbxBuildFileSection();
  const refs = project.pbxFileReferenceSection();
  return phase.files.map((f) => refs[buildFiles[f.value]!.fileRef!]!.path!.replace(/"/g, ''));
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'buaic-xcode-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('starts from a project whose extension has no Resources phase', () => {
  const project = load();
  expect(project.findTargetKey(TARGET)).toBeTruthy();
  expect(plugin.resourcesPhaseOf(project, project.findTargetKey(TARGET)!)).toBeNull();
});

it("adds the manifest to the extension's own group and Resources phase, not the app's", () => {
  const project = load();
  const appBefore = resourcePaths(project, 'Buaic');
  plugin.addPrivacyManifestToTarget(project, TARGET);

  expect(resourcePaths(project, TARGET)).toEqual(['PrivacyInfo.xcprivacy']);
  expect(resourcePaths(project, 'Buaic')).toEqual(appBefore);
  expect(appBefore).not.toContain('PrivacyInfo.xcprivacy');

  const group = project.pbxGroupByName(TARGET);
  const child = group.children.find((c) => c.comment === 'PrivacyInfo.xcprivacy');
  expect(child).toBeDefined();
  // Relative to the group (whose path is the extension folder).
  const ref = project.pbxFileReferenceSection()[child!.value]!;
  expect(ref.path!.replace(/"/g, '')).toBe('PrivacyInfo.xcprivacy');
  expect(ref.sourceTree).toBe('"<group>"');
});

it('is idempotent and survives a write + re-parse', () => {
  const project = load();
  plugin.addPrivacyManifestToTarget(project, TARGET);
  plugin.addPrivacyManifestToTarget(project, TARGET);
  expect(resourcePaths(project, TARGET)).toEqual(['PrivacyInfo.xcprivacy']);
  expect(project.pbxGroupByName(TARGET).children.filter((c) => c.comment === 'PrivacyInfo.xcprivacy')).toHaveLength(1);

  const again = load(project.writeSync());
  expect(resourcePaths(again, TARGET)).toEqual(['PrivacyInfo.xcprivacy']);
  plugin.addPrivacyManifestToTarget(again, TARGET);
  expect(resourcePaths(again, TARGET)).toEqual(['PrivacyInfo.xcprivacy']);
});

it('refuses a project without the target', () => {
  expect(() => plugin.addPrivacyManifestToTarget(load(), 'NoSuchTarget')).toThrow(/no target "NoSuchTarget"/);
});

it('writes a valid plist: no tracking, nothing collected, the reasons of the linked code', () => {
  const parsed = plist.parse(plugin.privacyManifestXml()) as Manifest;
  expect(parsed).toEqual(plugin.EXTENSION_PRIVACY);
  expect(parsed.NSPrivacyTracking).toBe(false);
  expect(parsed.NSPrivacyTrackingDomains).toEqual([]);
  expect(parsed.NSPrivacyCollectedDataTypes).toEqual([]);
  const byType = Object.fromEntries(parsed.NSPrivacyAccessedAPITypes.map((t) => [t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons]));
  expect(byType.NSPrivacyAccessedAPICategoryUserDefaults).toEqual(['CA92.1', '1C8F.1']);
  expect(byType.NSPrivacyAccessedAPICategoryFileTimestamp).toEqual(['C617.1']);
  expect(byType.NSPrivacyAccessedAPICategorySystemBootTime).toEqual(['35F9.1']);
});

it("keeps the app's own manifest a superset of the extension's (App Group reason included)", () => {
  const app = appJson.expo.ios.privacyManifests as Manifest;
  expect(app.NSPrivacyTracking).toBe(false);
  expect(app.NSPrivacyTrackingDomains).toEqual([]);
  expect(app.NSPrivacyCollectedDataTypes).toEqual([]);
  for (const ext of plugin.EXTENSION_PRIVACY.NSPrivacyAccessedAPITypes) {
    const entry = app.NSPrivacyAccessedAPITypes.find((t) => t.NSPrivacyAccessedAPIType === ext.NSPrivacyAccessedAPIType);
    expect(entry?.NSPrivacyAccessedAPITypeReasons).toEqual(expect.arrayContaining(ext.NSPrivacyAccessedAPITypeReasons));
  }
  // The plugin is configured for expo-widgets' target name.
  const entry = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === './plugins/withWidgetPrivacyManifest');
  const widgets = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-widgets');
  expect(entry[1].targetName).toBe(TARGET);
  expect(widgets[1].bundleIdentifier).toBe(`com.buaic.${TARGET}`);
});
