"use strict";
/**
 * Heartbeat — Periodic heartbeat scheduling for all clients.
 *
 * Wraps a setInterval that fires heartbeat events via the event builder.
 * Each client provides its own `sendEvent` transport function.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHeartbeat = createHeartbeat;
/**
 * Create a heartbeat scheduler. Call `start()` after connecting,
 * `stop()` on disconnect.
 */
function createHeartbeat(config) {
    let timer = null;
    function send() {
        const event = config.buildHeartbeat();
        config.sendEvent(event);
    }
    return {
        start() {
            if (timer)
                return; // already running
            send(); // immediate first beat
            timer = setInterval(send, config.intervalMs ?? 30_000);
        },
        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        },
        sendNow() {
            send();
        },
    };
}
//# sourceMappingURL=heartbeat.js.map