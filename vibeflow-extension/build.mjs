/**
 * Extension build script using esbuild.
 *
 * Bundles each entry point with @vibeflow/octopus-protocol resolved
 * from the monorepo's packages/ directory. Chrome MV3 service workers
 * don't support bare specifiers, so we need a bundler.
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content/content-script.ts',
  'src/content/overlay.ts',
  'src/content/interaction-tracker.ts',
  'src/popup/popup.ts',
  'src/lib/websocket.ts',
  'src/lib/event-queue.ts',
  'src/lib/policy-cache.ts',
  'src/lib/policy-manager.ts',
  'src/lib/activity-tracker.ts',
  'src/lib/entertainment-manager.ts',
  'src/lib/event-batcher.ts',
  'src/lib/session-manager.ts',
  'src/lib/search-extractor.ts',
  'src/lib/work-start-tracker.ts',
  'src/lib/index.ts',
];

// Only include entry points that exist
import { existsSync } from 'fs';
const validEntries = entryPoints.filter(ep => existsSync(path.join(__dirname, ep)));

await esbuild.build({
  entryPoints: validEntries,
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  alias: {
    '@vibeflow/octopus-protocol': path.resolve(__dirname, '../packages/octopus-protocol/src/index.ts'),
  },
  // Chrome extension globals
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Don't bundle chrome API
  external: [],
  logLevel: 'info',
});
