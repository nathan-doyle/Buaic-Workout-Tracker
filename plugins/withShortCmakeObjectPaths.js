/**
 * Expo config plugin: keep native object-file paths short on Windows.
 *
 * Why: CMake mirrors the full path of each generated C++ source (for example
 * react-native-safe-area-context's codegen output inside node_modules) into the
 * object directory under android/app/.cxx. On Windows that easily passes the
 * 248-character directory / 260-character file limit, and Ninja fails with
 * "mkdir(...): No such file or directory".
 *
 * CMAKE_OBJECT_PATH_MAX makes CMake replace the start of an over-long object path
 * with an MD5 hash. CMake only does this when the hashed form fits:
 * (absolute object dir + hashed name) <= max. The object dir under .cxx is already
 * 135-145 characters, so the max must leave room for "<32-char hash>/<file>.o".
 * 240 does that and keeps every path under 248, in both Debug and RelWithDebInfo.
 * (An earlier value of 200 was too tight: CMake fell back to full paths.)
 *
 * It only changes file names in the build folder, not what gets compiled. It is
 * only applied when prebuild runs on Windows, so EAS (Linux/macOS) builds are untouched.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const OBJECT_PATH_MAX = 240;
const ARG_PATTERN = /-DCMAKE_OBJECT_PATH_MAX=\d+/;

module.exports = function withShortCmakeObjectPaths(config) {
  if (process.platform !== 'win32') return config;

  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    const arg = `-DCMAKE_OBJECT_PATH_MAX=${OBJECT_PATH_MAX}`;

    // Already present (e.g. prebuild --no-clean): just make sure the value is current.
    if (ARG_PATTERN.test(gradle)) {
      cfg.modResults.contents = gradle.replace(ARG_PATTERN, arg);
      return cfg;
    }

    const anchor = /defaultConfig\s*\{/;
    if (!anchor.test(gradle)) {
      throw new Error('withShortCmakeObjectPaths: could not find defaultConfig in android/app/build.gradle');
    }

    cfg.modResults.contents = gradle.replace(
      anchor,
      (match) =>
        `${match}\n` +
        `        // Added by plugins/withShortCmakeObjectPaths.js (Windows path-length workaround)\n` +
        `        externalNativeBuild {\n` +
        `            cmake {\n` +
        `                arguments "${arg}"\n` +
        `            }\n` +
        `        }`
    );
    return cfg;
  });
};
