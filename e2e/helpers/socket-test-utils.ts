import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

/**
 * Shared Socket.io test utilities for E2E tests.
 *
 * Extracted from chat-basic, chat-sync, and chat-confirmation specs
 * to avoid duplication.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/** Connect a Socket.io client authenticated as a given email */
export function connectSocket(email: string): ClientSocket {
  return ioClient(BASE_URL, {
    transports: ['websocket'],
    auth: { email },
  });
}

/** Wait for socket connection (resolves on connect, rejects on timeout/error) */
export function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Socket connect timeout')),
      10000
    );
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
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
  socket.emit('OCTOPUS_EVENT', {
    eventType: 'CHAT_MESSAGE',
    timestamp: Date.now(),
    clientType: 'mobile',
    payload: {
      conversationId,
      messageId: crypto.randomUUID(),
      content,
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
