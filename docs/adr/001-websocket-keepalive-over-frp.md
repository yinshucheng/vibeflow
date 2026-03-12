# ADR-001: WebSocket Keepalive over frp TCP Tunnel

**Status:** Accepted
**Date:** 2026-03-09

## Context

VibeFlow iOS app connects to the backend via a frp TCP tunnel over the public internet. After the initial WebSocket connection is established, it silently drops within 30-60 seconds. The UI stays stuck on "connecting" indefinitely because:

1. **NAT idle timeout**: Mobile carriers and cloud NAT gateways silently drop idle TCP connections after 30-60 seconds of inactivity.
2. **Socket.io default detection is too slow**: With `pingInterval=25s` + `pingTimeout=60s`, it takes up to 85 seconds to detect a dead connection — by which time NAT has already killed it.
3. **No connect watchdog**: If the TCP connection succeeds but the WebSocket handshake stalls (common with tunnels), the client stays in "connecting" forever.
4. **Foreground recovery is fragile**: When returning from background, the app only reconnects if `isConnected()` returns false — but a zombie connection still reports as connected.

## Decision

### 1. Application-layer keepalive (client → server)

Every 15 seconds, the iOS client sends a `ping_custom` event. The server immediately replies with `pong_custom`. If no reply arrives within 10 seconds, the client declares the connection dead and reconnects.

**Why 15s?** Must be shorter than the minimum expected NAT timeout (30s). 15s provides a safety margin while not being too chatty.

**Why not rely on Socket.io ping?** Socket.io's built-in ping is designed for general-purpose use with conservative timeouts. We need sub-30s detection for NAT-hostile environments.

### 2. Lower Socket.io ping parameters

Changed from `pingInterval=25s, pingTimeout=60s` to `pingInterval=15s, pingTimeout=20s`. This serves as a secondary detection mechanism and also generates traffic that keeps NAT mappings alive.

### 3. Connect watchdog (15s timeout)

After creating a socket, a watchdog timer fires after 15 seconds. If the `connect` event hasn't arrived, the socket is destroyed and reconnection is scheduled. This prevents the "connecting forever" state.

### 4. Force reconnect on foreground

When the app returns from background, it always does a full `disconnect()` + `connect()` cycle instead of checking `isConnected()`. This eliminates zombie connection issues.

### 5. Status stays "connecting" during reconnect

When auto-reconnecting, the status transitions to `connecting` (not `disconnected`) to avoid UI flicker between states.

## Consequences

- **Bandwidth**: ~1 KB/min additional overhead from keepalive pings (negligible)
- **Server load**: One extra event handler per connection (negligible)
- **Detection latency**: Dead connections detected in ~25s worst case (15s interval + 10s timeout) vs previous 85s
- **NAT survival**: 15s ping interval keeps connections alive through most NAT gateways
- **Battery**: Minimal impact — iOS already maintains the WebSocket connection; adding small periodic pings doesn't significantly change power usage

## Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `KEEPALIVE_INTERVAL_MS` | 15,000 | < 30s NAT timeout, with margin |
| `KEEPALIVE_TIMEOUT_MS` | 10,000 | Fast enough to detect + reconnect before next interval |
| `CONNECT_WATCHDOG_TIMEOUT_MS` | 15,000 | Generous for slow tunnel handshakes |
| `pingInterval` (server) | 15,000 | Match keepalive interval |
| `pingTimeout` (server) | 20,000 | Reasonable for mobile networks |
