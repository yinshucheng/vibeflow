/**
 * Expo Config Plugin: FamilyControls Entitlement
 *
 * Adds com.apple.developer.family-controls entitlement to the iOS app.
 * Required for Screen Time API (FamilyControls / ManagedSettings).
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

function withFamilyControls(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    return mod;
  });
}

module.exports = withFamilyControls;
