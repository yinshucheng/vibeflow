/**
 * Expo Config Plugin: Set DEVELOPMENT_TEAM for all targets
 *
 * Ensures the main app target has automatic signing with the correct team.
 * Extension targets are handled by withScreenTimeExtensions.js.
 */
const { withXcodeProject } = require('expo/config-plugins');

const DEVELOPMENT_TEAM = 'B268N5S577';

module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    // Set DEVELOPMENT_TEAM and CODE_SIGN_STYLE for ALL build configurations
    for (const [key, buildConfig] of Object.entries(buildConfigs)) {
      if (typeof buildConfig === 'string') continue; // skip comments
      if (buildConfig.buildSettings) {
        buildConfig.buildSettings.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
        buildConfig.buildSettings.CODE_SIGN_STYLE = 'Automatic';
      }
    }

    return config;
  });
};
