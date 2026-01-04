#!/usr/bin/env node
/**
 * Uninstall Guardian Script
 * 
 * Removes the VibeFlow Process Guardian from macOS launch agents.
 * 
 * Usage:
 *   node scripts/uninstall-guardian.js [options]
 * 
 * Options:
 *   --verbose      Show detailed output
 */

const { execSync } = require('child_process');
const path = require('path');

// Forward to install script with --uninstall flag
const installScript = path.join(__dirname, 'install-guardian.js');
const args = process.argv.slice(2);
const verboseFlag = args.includes('--verbose') ? '--verbose' : '';

try {
  execSync(`node "${installScript}" --uninstall ${verboseFlag}`, {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Failed to uninstall guardian:', error.message);
  process.exit(1);
}
