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
const { withEntitlementsPlist, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withFamilyControls(config) {
  // 1. Add entitlements
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    mod.modResults['com.apple.security.application-groups'] = [
      'group.app.vibeflow.shared',
    ];
    return mod;
  });

  // 2. Ensure Podfile.properties.json has ios.deploymentTarget >= 16.0
  //    so CocoaPods doesn't skip the ScreenTime pod
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const propsPath = path.join(mod.modRequest.platformProjectRoot, 'Podfile.properties.json');
      let props = {};
      if (fs.existsSync(propsPath)) {
        props = JSON.parse(fs.readFileSync(propsPath, 'utf-8'));
      }
      props['ios.deploymentTarget'] = '16.0';
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + '\n');
      return mod;
    },
  ]);

  return config;
}

module.exports = withFamilyControls;
