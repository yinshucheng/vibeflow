/**
 * Heartbeat — Periodic heartbeat scheduling for all clients.
 *
 * Wraps a setInterval that fires heartbeat events via the event builder.
 * Each client provides its own `sendEvent` transport function.
 */

import type { HeartbeatEvent } from '../types';

export interface HeartbeatConfig {
  /** Interval in ms (default 30000 — 30s) */
  intervalMs?: number;
  /** Build a heartbeat event (from createEventBuilder) */
  buildHeartbeat: () => HeartbeatEvent;
  /** Send the event via the client's transport layer */
  sendEvent: (event: HeartbeatEvent) => void;
}

export interface HeartbeatHandle {
  /** Start the heartbeat timer */
  start: () => void;
  /** Stop the heartbeat timer */
  stop: () => void;
  /** Send one heartbeat immediately (e.g., on reconnect) */
  sendNow: () => void;
}

/**
 * Create a heartbeat scheduler. Call `start()` after connecting,
 * `stop()` on disconnect.
 */
export function createHeartbeat(config: HeartbeatConfig): HeartbeatHandle {
  let timer: ReturnType<typeof setInterval> | null = null;

  function send(): void {
    const event = config.buildHeartbeat();
    config.sendEvent(event);
  }

  return {
    start(): void {
      if (timer) return; // already running
      send(); // immediate first beat
      timer = setInterval(send, config.intervalMs ?? 30_000);
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    sendNow(): void {
      send();
    },
  };
}
