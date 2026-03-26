const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-tts',
  'android',
  'build.gradle',
);

const patchedGradle = `def safeExtGet(prop, fallback) {
    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}

apply plugin: 'com.android.library'

android {
    compileSdkVersion safeExtGet('compileSdkVersion', 34)

    defaultConfig {
        minSdkVersion safeExtGet('minSdkVersion', 21)
        targetSdkVersion safeExtGet('targetSdkVersion', 34)
        versionCode 1
        versionName "1.0"
    }

    namespace "net.no_mad.tts"
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation 'com.facebook.react:react-native:+'
}
`;

try {
  if (!fs.existsSync(targetPath)) {
    process.exit(0);
  }

  const current = fs.readFileSync(targetPath, 'utf8');
  if (current === patchedGradle) {
    process.exit(0);
  }

  fs.writeFileSync(targetPath, patchedGradle, 'utf8');
  console.log('Patched react-native-tts android/build.gradle for modern Gradle.');
} catch (error) {
  console.warn('Unable to patch react-native-tts build.gradle:', error.message);
}
