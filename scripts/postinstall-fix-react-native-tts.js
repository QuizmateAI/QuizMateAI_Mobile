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
const audioRecordTargetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-audio-record',
  'index.js',
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

const patchedAudioRecord = `import { NativeModules, NativeEventEmitter } from 'react-native';
const { RNAudioRecord } = NativeModules;

const EventEmitter = new NativeEventEmitter(
  RNAudioRecord
    ? {
        ...RNAudioRecord,
        addListener: RNAudioRecord.addListener || (() => {}),
        removeListeners: RNAudioRecord.removeListeners || (() => {}),
      }
    : undefined,
);

const AudioRecord = {};

AudioRecord.init = options => RNAudioRecord.init(options);
AudioRecord.start = () => RNAudioRecord.start();
AudioRecord.stop = () => RNAudioRecord.stop();

const eventsMap = {
  data: 'data'
};

AudioRecord.on = (event, callback) => {
  const nativeEvent = eventsMap[event];
  if (!nativeEvent) {
    throw new Error('Invalid event');
  }
  EventEmitter.removeAllListeners(nativeEvent);
  return EventEmitter.addListener(nativeEvent, callback);
};

export default AudioRecord;
`;

try {
  if (!fs.existsSync(targetPath)) {
    console.warn('react-native-tts build.gradle not found, skipping patch.');
  } else {
    const current = fs.readFileSync(targetPath, 'utf8');
    if (current !== patchedGradle) {
      fs.writeFileSync(targetPath, patchedGradle, 'utf8');
      console.log('Patched react-native-tts android/build.gradle for modern Gradle.');
    }
  }

  if (!fs.existsSync(audioRecordTargetPath)) {
    console.warn('react-native-audio-record index.js not found, skipping patch.');
  } else {
    const currentAudioRecord = fs.readFileSync(audioRecordTargetPath, 'utf8');
    if (currentAudioRecord !== patchedAudioRecord) {
      fs.writeFileSync(audioRecordTargetPath, patchedAudioRecord, 'utf8');
      console.log('Patched react-native-audio-record NativeEventEmitter shim.');
    }
  }
} catch (error) {
  console.warn('Unable to run postinstall native package patches:', error.message);
}
