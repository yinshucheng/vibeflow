#!/usr/bin/env node
/**
 * Generate placeholder MP3 sound files for notification sounds.
 * These are minimal silent MP3 files - replace with actual sounds for production.
 */
const fs = require('fs');
const path = require('path');

// Minimal valid MP3 file (silent, ~0.1 second)
// This is a base64-encoded minimal MP3 frame
const SILENT_MP3_BASE64 = 
  '//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV' +
  'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const soundsDir = path.join(__dirname, '..', 'public', 'sounds');
const sounds = ['bell', 'chime', 'gentle'];

// Ensure directory exists
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Create placeholder files
sounds.forEach(name => {
  const filePath = path.join(soundsDir, `${name}.mp3`);
  if (!fs.existsSync(filePath)) {
    const buffer = Buffer.from(SILENT_MP3_BASE64, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`Created placeholder: ${name}.mp3`);
  } else {
    console.log(`Skipped (exists): ${name}.mp3`);
  }
});

console.log('\nDone! Replace these with actual sound files for production.');
