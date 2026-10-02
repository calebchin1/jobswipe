import type { ExpoConfig } from 'expo/config';
const config: ExpoConfig = {
  name: 'First · Swipe-to-Hire Demo',
  slug: 'firststep-demo',
  scheme: 'firststep-demo',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: [
    'expo-router',
    'expo-secure-store',
    './plugins/withAudioOnly.cjs',
    [
      '@livekit/react-native-expo-plugin',
      {
        android: { audioType: 'communication', enableScreenShareService: false },
        ios: { enableMultitaskingCameraAccess: false },
      },
    ],
    [
      '@config-plugins/react-native-webrtc',
      {
        microphonePermission:
          'Allow First to use your microphone when you enable it during an interview.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  ios: { supportsTablet: true, bundleIdentifier: 'com.firststep.demo' },
  android: {
    package: 'com.firststep.demo',
    blockedPermissions: [
      'android.permission.CAMERA',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ],
  },
  web: { bundler: 'metro', output: 'single' },
};
export default config;
