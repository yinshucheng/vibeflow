import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_LITE = process.env.EXCLUDE_SCREEN_TIME === 'true';

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: ExpoConfig['plugins'] = ['expo-secure-store'];

  if (!IS_LITE) {
    plugins.push('./plugins/withFamilyControls');
    plugins.push('./plugins/withScreenTimeExtensions');
  }

  return {
    ...config,
    name: 'vibeflow-ios',
    slug: 'vibeflow-ios',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_LITE ? 'com.vibeflow.lite' : 'com.anonymous.vibeflow-ios',
      deploymentTarget: '16.0' as string,
    } as ExpoConfig['ios'],
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins,
  };
};
