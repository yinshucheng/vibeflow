/**
 * Expo Config Plugin: Screen Time Extension Targets
 *
 * Automatically injects ShieldConfigurationExtension and DeviceActivityMonitorExtension
 * targets into the Xcode project during `npx expo prebuild`.
 *
 * Source files are read from `targets/shield-config/` and `targets/device-activity-monitor/`
 * and copied into the generated `ios/` directory.
 *
 * Each extension gets:
 * - Its own PBXNativeTarget with Sources + Frameworks build phases
 * - Entitlements (FamilyControls + App Groups)
 * - Correct framework linking (ManagedSettings, ManagedSettingsUI, DeviceActivity, FamilyControls)
 * - A CopyFiles (Embed App Extensions) build phase in the main target
 */
const {
  withXcodeProject,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const APP_GROUP_ID = 'group.app.vibeflow.shared';
const MAIN_BUNDLE_ID = 'com.anonymous.vibeflow-ios';
const DEPLOYMENT_TARGET = '16.0';
const SWIFT_VERSION = '5.0';

/** Extension definitions */
const EXTENSIONS = [
  {
    name: 'ShieldConfigurationExtension',
    sourceDir: 'targets/shield-config',
    bundleId: `${MAIN_BUNDLE_ID}.ShieldConfigurationExtension`,
    frameworks: ['ManagedSettings', 'ManagedSettingsUI'],
    sourceFiles: ['ShieldConfigurationDataSource.swift'],
    infoPlist: 'Info.plist',
    entitlements: 'ShieldConfigurationExtension.entitlements',
  },
  {
    name: 'DeviceActivityMonitorExtension',
    sourceDir: 'targets/device-activity-monitor',
    bundleId: `${MAIN_BUNDLE_ID}.DeviceActivityMonitorExtension`,
    frameworks: ['DeviceActivity', 'FamilyControls', 'ManagedSettings'],
    sourceFiles: ['DeviceActivityMonitorExtension.swift'],
    infoPlist: 'Info.plist',
    entitlements: 'DeviceActivityMonitorExtension.entitlements',
  },
];

/**
 * Generate an entitlements plist string for an extension.
 */
function generateEntitlementsPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>${APP_GROUP_ID}</string>
\t</array>
\t<key>com.apple.developer.family-controls</key>
\t<true/>
</dict>
</plist>
`;
}

/**
 * Phase 1: Copy extension source files from targets/ into ios/ directory.
 */
function withExtensionFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');

      for (const ext of EXTENSIONS) {
        const targetDir = path.join(iosDir, ext.name);
        fs.mkdirSync(targetDir, { recursive: true });

        // Copy Swift source files
        for (const srcFile of ext.sourceFiles) {
          const src = path.join(projectRoot, ext.sourceDir, srcFile);
          const dst = path.join(targetDir, srcFile);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dst);
          } else {
            console.warn(
              `[withScreenTimeExtensions] Source file not found: ${src}`
            );
          }
        }

        // Copy Info.plist
        const infoPlistSrc = path.join(
          projectRoot,
          ext.sourceDir,
          ext.infoPlist
        );
        const infoPlistDst = path.join(targetDir, 'Info.plist');
        if (fs.existsSync(infoPlistSrc)) {
          fs.copyFileSync(infoPlistSrc, infoPlistDst);
        }

        // Generate entitlements
        const entitlementsDst = path.join(targetDir, ext.entitlements);
        fs.writeFileSync(entitlementsDst, generateEntitlementsPlist());
      }

      return config;
    },
  ]);
}

/**
 * Phase 2: Modify the Xcode project to add extension targets.
 */
function withExtensionTargets(config) {
  return withXcodeProject(config, async (config) => {
    const project = config.modResults;

    for (const ext of EXTENSIONS) {
      addExtensionTarget(project, ext);
    }

    return config;
  });
}

/**
 * Add a single extension target to the Xcode project.
 *
 * Uses low-level xcode project manipulation instead of addTarget() to avoid
 * path issues with addSourceFile, and to properly configure extension-specific
 * build settings.
 */
function addExtensionTarget(project, ext) {
  const targetName = ext.name;

  // Check if target already exists
  const nativeTargets = project.pbxNativeTargetSection();
  for (const key in nativeTargets) {
    if (!/_comment$/.test(key) && nativeTargets[key].name) {
      const name = nativeTargets[key].name.replace(/"/g, '');
      if (name === targetName) {
        console.log(
          `[withScreenTimeExtensions] Target "${targetName}" already exists, skipping.`
        );
        return;
      }
    }
  }

  // --- Step 1: Create the target via addTarget ---
  // This handles: PBXNativeTarget, build configs, product ref, target dependency,
  // CopyFiles build phase in main target
  const target = project.addTarget(
    targetName,
    'app_extension',
    targetName,
    ext.bundleId
  );

  if (!target) {
    console.error(
      `[withScreenTimeExtensions] Failed to add target: ${targetName}`
    );
    return;
  }

  const targetUuid = target.uuid;

  // --- Step 2: Create PBXGroup for the extension ---
  // File paths are relative to the group path (which is targetName),
  // so we only use the bare filenames here.
  const groupChildren = [
    ...ext.sourceFiles,
    'Info.plist',
    ext.entitlements,
  ];

  const group = project.addPbxGroup(
    groupChildren,
    targetName,
    targetName,
    '"<group>"'
  );

  // Add group to root project group
  const mainGroupUuid = project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup(group.uuid, mainGroupUuid);

  // --- Step 3: Add Sources build phase with Swift files ---
  // File paths passed to addBuildPhase must be bare filenames (not prefixed
  // with the group path), because Xcode resolves them relative to the group.
  project.addBuildPhase(
    ext.sourceFiles,
    'PBXSourcesBuildPhase',
    'Sources',
    targetUuid
  );

  // --- Step 4: Add empty Frameworks build phase ---
  // System frameworks (ManagedSettings, DeviceActivity, etc.) are auto-linked
  // by Swift's `import` statements — no need to add explicit PBXFileReferences.
  // Adding them causes CocoaPods consistency issues with orphaned file refs.
  project.addBuildPhase(
    [],
    'PBXFrameworksBuildPhase',
    'Frameworks',
    targetUuid
  );

  // --- Step 5: Customize build settings ---
  const buildConfigs = project.pbxXCBuildConfigurationSection();
  const configListUuid =
    project.pbxNativeTargetSection()[targetUuid].buildConfigurationList;
  const configList = project.pbxXCConfigurationList()[configListUuid];

  if (configList && configList.buildConfigurations) {
    for (const configRef of configList.buildConfigurations) {
      const configUuid = configRef.value;
      const buildConfig = buildConfigs[configUuid];

      if (buildConfig && buildConfig.buildSettings) {
        const s = buildConfig.buildSettings;

        // Override the default INFOPLIST_FILE (addTarget sets it wrong)
        s.INFOPLIST_FILE = `"${targetName}/Info.plist"`;
        s.PRODUCT_BUNDLE_IDENTIFIER = `"${ext.bundleId}"`;
        s.CODE_SIGN_ENTITLEMENTS = `"${targetName}/${ext.entitlements}"`;
        s.SWIFT_VERSION = SWIFT_VERSION;
        s.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
        s.TARGETED_DEVICE_FAMILY = `"1,2"`;
        s.GENERATE_INFOPLIST_FILE = 'NO';
        s.CURRENT_PROJECT_VERSION = '1';
        s.MARKETING_VERSION = '1.0';
        s.CODE_SIGN_STYLE = 'Automatic';
        s.SWIFT_EMIT_LOC_STRINGS = 'YES';
        s.PRODUCT_NAME = `"$(TARGET_NAME)"`;
        s.SKIP_INSTALL = 'YES';
        s.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';

        if (buildConfig.name === 'Debug') {
          s.SWIFT_OPTIMIZATION_LEVEL = '"-Onone"';
          s.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
          s.SWIFT_ACTIVE_COMPILATION_CONDITIONS = 'DEBUG';
        }
        if (buildConfig.name === 'Release') {
          s.SWIFT_OPTIMIZATION_LEVEL = '"-O"';
          s.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
          s.COPY_PHASE_STRIP = 'NO';
        }
      }
    }
  }
}

/**
 * Main plugin: compose file-copy and xcode-project modifications.
 */
function withScreenTimeExtensions(config) {
  // First copy files (withDangerousMod runs before withXcodeProject)
  config = withExtensionFiles(config);
  // Then modify the Xcode project
  config = withExtensionTargets(config);
  return config;
}

module.exports = withScreenTimeExtensions;
