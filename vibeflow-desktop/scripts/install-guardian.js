#!/usr/bin/env node
/**
 * Install Guardian Script
 * 
 * Installs the VibeFlow Process Guardian as a macOS launch agent.
 * The guardian will start automatically on login and monitor the VibeFlow app.
 * 
 * Requirements: 8.6
 * - THE Process_Guardian SHALL start automatically on system login (before Desktop_App)
 * 
 * Usage:
 *   node scripts/install-guardian.js [options]
 * 
 * Options:
 *   --uninstall    Remove the guardian instead of installing
 *   --force        Force reinstall even if already installed
 *   --verbose      Show detailed output
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Configuration
const PLIST_NAME = 'com.vibeflow.guardian.plist';
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_DEST = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME);
const VIBEFLOW_DIR = path.join(os.homedir(), '.vibeflow');

// Parse arguments
const args = process.argv.slice(2);
const options = {
  uninstall: args.includes('--uninstall'),
  force: args.includes('--force'),
  verbose: args.includes('--verbose'),
};

function log(message) {
  console.log(`[Guardian Install] ${message}`);
}

function verbose(message) {
  if (options.verbose) {
    console.log(`[Guardian Install] ${message}`);
  }
}

function error(message) {
  console.error(`[Guardian Install] ERROR: ${message}`);
}


/**
 * Check if guardian is already installed
 */
function isInstalled() {
  return fs.existsSync(PLIST_DEST);
}

/**
 * Check if guardian is currently loaded
 */
function isLoaded() {
  try {
    const result = execSync(`launchctl list | grep com.vibeflow.guardian`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.includes('com.vibeflow.guardian');
  } catch {
    return false;
  }
}

/**
 * Unload the guardian from launchd
 */
function unloadGuardian() {
  if (isLoaded()) {
    verbose('Unloading guardian from launchd...');
    try {
      execSync(`launchctl unload "${PLIST_DEST}"`, { stdio: 'inherit' });
      log('Guardian unloaded');
    } catch (err) {
      error(`Failed to unload guardian: ${err.message}`);
    }
  }
}

/**
 * Load the guardian into launchd
 */
function loadGuardian() {
  verbose('Loading guardian into launchd...');
  try {
    execSync(`launchctl load "${PLIST_DEST}"`, { stdio: 'inherit' });
    log('Guardian loaded');
  } catch (err) {
    error(`Failed to load guardian: ${err.message}`);
    return false;
  }
  return true;
}

/**
 * Uninstall the guardian
 */
function uninstall() {
  log('Uninstalling VibeFlow Process Guardian...');
  
  // Unload if loaded
  unloadGuardian();
  
  // Remove plist file
  if (fs.existsSync(PLIST_DEST)) {
    verbose(`Removing ${PLIST_DEST}...`);
    fs.unlinkSync(PLIST_DEST);
    log('Guardian plist removed');
  } else {
    log('Guardian plist not found (already uninstalled?)');
  }
  
  log('Guardian uninstalled successfully');
}

/**
 * Install the guardian
 */
function install() {
  log('Installing VibeFlow Process Guardian...');
  
  // Check if already installed
  if (isInstalled() && !options.force) {
    log('Guardian is already installed. Use --force to reinstall.');
    return;
  }
  
  // Unload if already loaded
  if (isLoaded()) {
    unloadGuardian();
  }
  
  // Ensure LaunchAgents directory exists
  if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
    verbose(`Creating ${LAUNCH_AGENTS_DIR}...`);
    fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  }
  
  // Ensure .vibeflow directory exists for logs
  if (!fs.existsSync(VIBEFLOW_DIR)) {
    verbose(`Creating ${VIBEFLOW_DIR}...`);
    fs.mkdirSync(VIBEFLOW_DIR, { recursive: true });
  }
  
  // Read the template plist
  const templatePath = path.join(__dirname, '..', 'guardian', PLIST_NAME);
  if (!fs.existsSync(templatePath)) {
    error(`Template plist not found at ${templatePath}`);
    process.exit(1);
  }
  
  verbose(`Reading template from ${templatePath}...`);
  let plistContent = fs.readFileSync(templatePath, 'utf-8');
  
  // Determine guardian path
  // In production, guardian is bundled with the app
  // In development, it's in the dist folder
  let guardianPath;
  const appBundlePath = '/Applications/VibeFlow.app/Contents/Resources/guardian';
  const devPath = path.join(__dirname, '..', 'dist', 'guardian');
  
  if (fs.existsSync(appBundlePath)) {
    guardianPath = appBundlePath;
  } else if (fs.existsSync(devPath)) {
    guardianPath = devPath;
  } else {
    // Fallback to source directory (for development)
    guardianPath = path.join(__dirname, '..', 'guardian');
  }
  
  verbose(`Guardian path: ${guardianPath}`);
  
  // Replace placeholders
  plistContent = plistContent.replace(/__GUARDIAN_PATH__/g, guardianPath);
  plistContent = plistContent.replace(/__HOME__/g, os.homedir());
  
  // Write the plist file
  verbose(`Writing plist to ${PLIST_DEST}...`);
  fs.writeFileSync(PLIST_DEST, plistContent);
  
  // Set correct permissions
  fs.chmodSync(PLIST_DEST, 0o644);
  
  // Load the guardian
  if (loadGuardian()) {
    log('Guardian installed and started successfully');
    log(`Logs will be written to ${VIBEFLOW_DIR}/guardian.*.log`);
  } else {
    error('Guardian installed but failed to start');
    process.exit(1);
  }
}

// Main
if (options.uninstall) {
  uninstall();
} else {
  install();
}
