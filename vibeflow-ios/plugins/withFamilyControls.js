/**
 * Expo Config Plugin: FamilyControls + App Group Entitlements
 *
 * Adds com.apple.developer.family-controls and App Group entitlements to the iOS app.
 * Required for Screen Time API (FamilyControls / ManagedSettings) and sharing data
 * between the main app and extensions (ShieldConfiguration, DeviceActivityMonitor).
 *
 * Also sets ios.deploymentTarget in Podfile.properties.json to 16.0 so that
 * CocoaPods autolinking picks up the ScreenTime pod (which requires iOS 16.0+).
 */
const { withEntitlementsPlist, withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MIN_IOS_VERSION = '16.0';

function withFamilyControls(config) {
  // 1. Add entitlements
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    mod.modResults['com.apple.security.application-groups'] = [
      'group.app.vibeflow.shared',
    ];
    return mod;
  });

  // 2. Set Podfile.properties.json deployment target
  //    Controls the `platform :ios` line in Podfile, which determines
  //    whether pod install includes the ScreenTime pod.
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const propsPath = path.join(mod.modRequest.platformProjectRoot, 'Podfile.properties.json');
      let props = {};
      if (fs.existsSync(propsPath)) {
        props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
      }
      props['ios.deploymentTarget'] = MIN_IOS_VERSION;
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + '\n');
      return mod;
    },
  ]);

  // 3. Set IPHONEOS_DEPLOYMENT_TARGET in Xcode project for ALL build configs
  //    Without this, the main target compiles at 15.1 and fails to import
  //    the ScreenTime module which requires 16.0.
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const config = configurations[key];
      if (config.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET) {
        config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = MIN_IOS_VERSION;
      }
    }
    return mod;
  });

  return config;
}

module.exports = withFamilyControls;
