const { withProjectBuildGradle } = require('expo/config-plugins');
// Windows CMake may invoke clang++.exe by its DOS short name (which loses ++).
// Explicit driver mode keeps C++ runtime linking independent of that filename.
const MARKER = '// Chief Windows C++ compiler driver';
const BLOCK = `${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    subprojects { nativeProject ->
        ['com.android.application', 'com.android.library'].each { pluginId ->
            nativeProject.plugins.withId(pluginId) {
                nativeProject.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.cppFlags '--driver-mode=g++'
            }
        }
    }
}
`;
module.exports = config => withProjectBuildGradle(config, mod => {
  const anchor = 'apply plugin: "expo-root-project"';
  if (!mod.modResults.contents.includes(MARKER)) {
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Missing Expo root plugin anchor for Windows C++ configuration');
    // React root plugin eagerly evaluates app projects; register callbacks first.
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${BLOCK}\n${anchor}`);
  }
  return mod;
});
