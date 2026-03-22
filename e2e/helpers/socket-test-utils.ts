import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

/**
 * Shared Socket.io test utilities for E2E tests.
 *
 * Extracted from chat-basic, chat-sync, and chat-confirmation specs
 * to avoid duplication.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3200';

/** Auto-incrementing sequence number for events */
let _seq = 0;

/** Connect a Socket.io client authenticated as a given email */
export function connectSocket(email: string): ClientSocket {
  return ioClient(BASE_URL, {
    transports: ['websocket'],
    auth: { email },
  });
}

/**
 * Wait for socket connection AND server-side readiness.
 *
 * The server's `handleConnection` is async — it registers OCTOPUS_EVENT
 * handlers only after sending initial policies and state snapshot.
 * Events emitted before that are silently dropped.
 *
 * We wait for the SYNC_STATE command (emitted just before
 * `registerEventHandlers`) then add a small buffer to let the server
 * finish registering handlers.
 */
export function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Socket connect timeout')),
      15000
    );

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Wait for SYNC_STATE — the last command before registerEventHandlers
    socket.on('OCTOPUS_COMMAND', function onCmd(cmd: { commandType: string }) {
      if (cmd.commandType === 'SYNC_STATE') {
        socket.off('OCTOPUS_COMMAND', onCmd);
        // Small buffer for server to finish registerEventHandlers()
        setTimeout(() => {
          clearTimeout(timeout);
          resolve();
        }, 200);
      }
    });
  });
}

/**
 * Collect OCTOPUS_COMMAND events matching a given commandType.
 * Resolves when predicate returns true or rejects on timeout.
 */
export function collectCommands<T>(
  socket: ClientSocket,
  commandType: string,
  predicate: (collected: T[]) => boolean,
  timeoutMs: number = 30000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];
    const timeout = setTimeout(() => {
      socket.off('OCTOPUS_COMMAND', handler);
      reject(
        new Error(
          `Timeout waiting for ${commandType}: collected ${collected.length} so far`
        )
      );
    }, timeoutMs);

    function handler(command: { commandType: string; payload: T }) {
      if (command.commandType === commandType) {
        collected.push(command.payload);
        if (predicate(collected)) {
          clearTimeout(timeout);
          socket.off('OCTOPUS_COMMAND', handler);
          resolve(collected);
        }
      }
    }

    socket.on('OCTOPUS_COMMAND', handler);
  });
}

/**
 * Collect any OCTOPUS_COMMAND events of a given type within a time window.
 * Always resolves (with whatever was collected) after waitMs.
 */
export function collectAnyCommands(
  socket: ClientSocket,
  commandType: string,
  waitMs: number = 5000
): Promise<unknown[]> {
  return new Promise((resolve) => {
    const collected: unknown[] = [];
    const timeout = setTimeout(() => {
      socket.off('OCTOPUS_COMMAND', handler);
      resolve(collected);
    }, waitMs);

    function handler(command: { commandType: string; payload: unknown }) {
      if (command.commandType === commandType) {
        collected.push(command.payload);
      }
    }

    socket.on('OCTOPUS_COMMAND', handler);
    // keep reference alive
    void timeout;
  });
}

/** Send a CHAT_MESSAGE event via the socket */
export function sendChatMessage(
  socket: ClientSocket,
  content: string,
  conversationId: string = ''
): void {
  const event = {
    eventId: crypto.randomUUID(),
    eventType: 'CHAT_MESSAGE' as const,
    userId: '',
    clientId: `e2e-test-${socket.id ?? 'no-id'}`,
    clientType: 'mobile' as const,
    timestamp: Date.now(),
    sequenceNumber: _seq++,
    payload: {
      conversationId,
      messageId: crypto.randomUUID(),
      content,
    },
  };
  socket.emit('OCTOPUS_EVENT', event);
}

/** Send a CHAT_ACTION event (confirm/cancel) via the socket */
export function sendChatAction(
  socket: ClientSocket,
  conversationId: string,
  toolCallId: string,
  action: 'confirm' | 'cancel'
): void {
  socket.emit('OCTOPUS_EVENT', {
    eventId: crypto.randomUUID(),
    eventType: 'CHAT_ACTION',
    userId: '',
    clientId: `e2e-test-${socket.id}`,
    clientType: 'mobile',
    timestamp: Date.now(),
    sequenceNumber: _seq++,
    payload: {
      conversationId,
      toolCallId,
      action,
    },
  });
}

/**
 * Wait for a CHAT_RESPONSE with type=complete.
 * Returns all collected CHAT_RESPONSE payloads (deltas + complete).
 */
export function waitForChatComplete(
  socket: ClientSocket,
  timeoutMs: number = 30000
): Promise<
  Array<{
    conversationId: string;
    messageId: string;
    type: 'delta' | 'complete';
    content: string;
  }>
> {
  return collectCommands<{
    conversationId: string;
    messageId: string;
    type: 'delta' | 'complete';
    content: string;
  }>(
    socket,
    'CHAT_RESPONSE',
    (items) => items.some((i) => i.type === 'complete'),
    timeoutMs
  );
}
