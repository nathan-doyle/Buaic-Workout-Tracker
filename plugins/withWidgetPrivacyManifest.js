/**
 * Config plugin (iOS, Phase 8): gives the widget extension (`ExpoWidgetsTarget`, from
 * expo-widgets) its own privacy manifest.
 *
 * Why: the extension is a separate binary inside the app (`PlugIns/ExpoWidgetsTarget.appex`)
 * and links React Native, `expo`, `expo-widgets` and `@expo/ui` (expo-widgets runs the
 * widget layout in a JS runtime). That code uses required-reason APIs (UserDefaults, incl.
 * the App Group suite expo-widgets reads and writes; file timestamps; system boot time).
 * expo-widgets ships no privacy manifest and doesn't add one to the target, and React
 * Native's `pod install` aggregation only writes the app target's manifest. App Store
 * Connect checks each binary, so without this the extension could be flagged
 * (ITMS-91053 "Missing API declaration").
 *
 * How: a finalized mod, so it runs after expo-widgets has created the target and written
 * the Xcode project, whatever the plugin order (a later plugin's `withXcodeProject` action
 * runs before an earlier one's). It writes `ios/<target>/PrivacyInfo.xcprivacy`, gives the
 * target a Resources build phase if it has none (otherwise xcode's lookup falls back to the
 * app's Resources phase), and adds the file to that phase. Safe to run twice.
 */
const fs = require('fs');
const path = require('path');
const { IOSConfig, withFinalizedMod } = require('expo/config-plugins');

const FILE_NAME = 'PrivacyInfo.xcprivacy';

/** What the code linked into the extension does. No tracking, nothing collected. */
const EXTENSION_PRIVACY = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    {
      // CA92.1: React Native / Expo defaults of the extension itself; 1C8F.1: the App Group
      // suite (`group.com.buaic`) the app writes and the widget reads.
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
    },
    {
      // React Native core, folly, glog, boost: files inside the container.
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
      NSPrivacyAccessedAPITypeReasons: ['C617.1'],
    },
    {
      // React Native timing, boost.
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
      NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
    },
  ],
};

function plistValue(value, indent) {
  const pad = '\t'.repeat(indent);
  if (typeof value === 'boolean') return `${pad}<${value}/>`;
  if (typeof value === 'string') return `${pad}<string>${value}</string>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<array/>`;
    return [`${pad}<array>`, ...value.map((v) => plistValue(v, indent + 1)), `${pad}</array>`].join('\n');
  }
  const lines = [`${pad}<dict>`];
  for (const [key, v] of Object.entries(value)) {
    lines.push(`${pad}\t<key>${key}</key>`, plistValue(v, indent + 1));
  }
  lines.push(`${pad}</dict>`);
  return lines.join('\n');
}

/** The manifest file's XML. */
function privacyManifestXml(manifest = EXTENSION_PRIVACY) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    plistValue(manifest, 0),
    '</plist>',
    '',
  ].join('\n');
}

/** The target's Resources build phase object, or null (no fallback to another target's). */
function resourcesPhaseOf(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const ref = (target.buildPhases || []).find((p) => p.comment === 'Resources');
  if (!ref) return null;
  return project.hash.project.objects.PBXResourcesBuildPhase?.[ref.value] ?? null;
}

/**
 * Adds `<targetName>/PrivacyInfo.xcprivacy` to the target's group and Resources phase.
 * Returns the project. Throws if the target or its group is missing.
 */
function addPrivacyManifestToTarget(project, targetName) {
  const targetUuid = project.findTargetKey(targetName);
  if (!targetUuid) throw new Error(`withWidgetPrivacyManifest: no target "${targetName}" in the Xcode project`);
  if (!resourcesPhaseOf(project, targetUuid)) {
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);
  }
  // The extension's group has `path = <targetName>`, so the file path is relative to it.
  // A file already in the group is skipped (idempotent).
  IOSConfig.XcodeUtils.addResourceFileToGroup({
    filepath: FILE_NAME,
    groupName: targetName,
    project,
    isBuildFile: true,
    verbose: false,
    targetUuid,
  });
  return project;
}

const withWidgetPrivacyManifest = (config, { targetName = 'ExpoWidgetsTarget' } = {}) =>
  withFinalizedMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const targetDir = path.join(platformProjectRoot, targetName);
      if (!fs.existsSync(targetDir)) {
        throw new Error(`withWidgetPrivacyManifest: ${targetDir} not found (is expo-widgets configured?)`);
      }
      fs.writeFileSync(path.join(targetDir, FILE_NAME), privacyManifestXml());
      const project = IOSConfig.XcodeUtils.getPbxproj(projectRoot);
      addPrivacyManifestToTarget(project, targetName);
      fs.writeFileSync(project.filepath, project.writeSync());
      return cfg;
    },
  ]);

module.exports = withWidgetPrivacyManifest;
module.exports.EXTENSION_PRIVACY = EXTENSION_PRIVACY;
module.exports.privacyManifestXml = privacyManifestXml;
module.exports.addPrivacyManifestToTarget = addPrivacyManifestToTarget;
module.exports.resourcesPhaseOf = resourcesPhaseOf;
