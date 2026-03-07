/**
 * Expo Config Plugin: FamilyControls + App Group Entitlements
 *
 * Adds com.apple.developer.family-controls and App Group entitlements to the iOS app.
 * Required for Screen Time API (FamilyControls / ManagedSettings) and sharing data
 * between the main app and extensions (ShieldConfiguration, DeviceActivityMonitor).
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

function withFamilyControls(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    mod.modResults['com.apple.security.application-groups'] = [
      'group.app.vibeflow.shared',
    ];
    return mod;
  });
}

module.exports = withFamilyControls;
