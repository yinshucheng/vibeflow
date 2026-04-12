# VibeFlow Desktop

macOS desktop application for VibeFlow with system-level focus enforcement capabilities.

## Features

- Native macOS application wrapping the VibeFlow web app
- System tray with quick actions (start pomodoro, view status)
- Window management (show/hide/bring to front)
- Auto-launch on system startup
- IPC communication between main and renderer processes

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- macOS (for building macOS app)

### Setup

```bash
cd vibeflow-desktop
npm install
```

### Running in Development

```bash
npm run dev
```

This will compile TypeScript and launch Electron.

### Building for Production

```bash
npm run build:mac
```

The built application will be in the `release/` directory.

## Project Structure

```
vibeflow-desktop/
├── electron/
│   ├── main.ts          # Main process entry point
│   ├── preload.ts       # Preload script for IPC
│   └── types/           # Shared type definitions
├── assets/              # App icons and images
├── build/               # Build configuration
│   └── entitlements.mac.plist
├── types/               # TypeScript type declarations
├── package.json
├── tsconfig.json
└── electron-builder.yml
```

## IPC Communication

The preload script exposes a `vibeflow` API to the renderer process:

```typescript
// Window control
window.vibeflow.window.show()
window.vibeflow.window.hide()
window.vibeflow.window.bringToFront()

// Configuration
const config = await window.vibeflow.config.get()
await window.vibeflow.config.update({ autoLaunch: true })

// Auto-launch
await window.vibeflow.autoLaunch.enable()
await window.vibeflow.autoLaunch.disable()
const isEnabled = await window.vibeflow.autoLaunch.isEnabled()

// Tray menu
window.vibeflow.tray.updateMenu(pomodoroActive)

// Event listeners
const unsubscribe = window.vibeflow.on.startPomodoro(() => {
  // Handle tray "Start Pomodoro" click
})
```

## Permissions

The app requires the following macOS permissions:

- **Accessibility**: For controlling other applications (quit/hide distraction apps)
- **Notifications**: For system notifications

## Configuration

The app stores configuration in the user's app data directory using `electron-store`.

Default configuration:
- `serverUrl`: Determined by priority:
  1. `VIBEFLOW_SERVER_URL` env var (highest priority)
  2. Development mode (`npm run dev` / unpackaged) → `http://localhost:3000`
  3. Production mode (packaged `.app`) → `http://39.105.213.147:4000`
- `isDevelopment`: `true` when `NODE_ENV=development` or app is not packaged; `false` when packaged by electron-builder (`app.isPackaged`)
- `autoLaunch`: `false`

### Server Connection Modes

| Mode | How to run | Connects to |
|------|-----------|-------------|
| Local dev | `npm run dev` | `localhost:3000` |
| Remote dev | `VIBEFLOW_SERVER_URL=http://... npm run dev` | Custom URL |
| Release build | Open `VibeFlow.app` from `release/` | `39.105.213.147:4000` |

When `VIBEFLOW_SERVER_URL` is set, the app runs with a separate app name (`vibeflow-desktop-remote`) and separate userData directory, allowing local and remote instances to run simultaneously.

## License

MIT
