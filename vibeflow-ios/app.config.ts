import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_LITE = process.env.EXCLUDE_SCREEN_TIME === 'true';
const IS_DEV = process.env.APP_VARIANT === 'dev';

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: ExpoConfig['plugins'] = ['expo-secure-store', './plugins/withAllowHTTP'];

  if (!IS_LITE) {
    plugins.push('./plugins/withFamilyControls');
    plugins.push('./plugins/withScreenTimeExtensions');
  }

  // Bundle ID: dev variant gets a separate ID so both can coexist on the same device
  let bundleIdentifier = 'com.anonymous.vibeflow-ios';
  if (IS_LITE) bundleIdentifier = 'com.vibeflow.lite';
  else if (IS_DEV) bundleIdentifier = 'com.anonymous.vibeflow-ios.dev';

  return {
    ...config,
    name: IS_DEV ? 'VibeFlow Dev' : 'vibeflow-ios',
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
      bundleIdentifier,
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
    extra: {
      appVariant: IS_DEV ? 'dev' : IS_LITE ? 'lite' : 'release',
    },
    plugins,
  };
};
