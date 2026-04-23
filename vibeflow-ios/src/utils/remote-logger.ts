/**
 * Remote Logger — 日志通过 WebSocket 发送到服务器
 *
 * 解决的问题：
 * - Release 版本看不到 console.log
 * - 真机调试不方便
 * - AI coding 工具需要读取日志
 *
 * 使用方式：
 *   import { rlog } from '@/utils/remote-logger';
 *   rlog.info('User logged in', { userId: '123' });
 *
 * 查看日志：
 *   tail -f /tmp/vibeflow-dev/ios-remote.log
 *   或直接看后端终端输出
 */

import { websocketService } from '@/services/websocket.service';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  screen?: string;
}

// 缓存队列：WebSocket 未连接时暂存日志
const pendingLogs: LogEntry[] = [];
const MAX_PENDING = 50;

// 当前屏幕（可选，用于日志上下文）
let currentScreen = '';

export function setLogScreen(screen: string): void {
  currentScreen = screen;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

function send(level: LogLevel, args: unknown[]): void {
  const message = formatArgs(args);

  // 本地也打印（Metro/Debug 能看到）
  const prefix = `[rlog:${level}]`;
  switch (level) {
    case 'ERROR':
      console.error(prefix, ...args);
      break;
    case 'WARN':
      console.warn(prefix, ...args);
      break;
    case 'DEBUG':
      console.debug(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: Date.now(),
    ...(currentScreen && { screen: currentScreen }),
  };

  // 尝试发送
  if (websocketService.isConnected()) {
    // 先发送积压的日志
    while (pendingLogs.length > 0) {
      const pending = pendingLogs.shift()!;
      websocketService.emit('CLIENT_LOG', pending);
    }
    // 发送当前日志
    websocketService.emit('CLIENT_LOG', entry);
  } else {
    // 未连接，加入队列
    pendingLogs.push(entry);
    if (pendingLogs.length > MAX_PENDING) {
      pendingLogs.shift(); // 丢弃最老的
    }
  }
}

/**
 * Remote Logger API
 *
 * 用法与 console 相同，但会发送到服务器
 */
export const rlog = {
  debug: (...args: unknown[]) => send('DEBUG', args),
  info: (...args: unknown[]) => send('INFO', args),
  warn: (...args: unknown[]) => send('WARN', args),
  error: (...args: unknown[]) => send('ERROR', args),

  /** 设置当前屏幕上下文 */
  setScreen: setLogScreen,

  /** 手动刷新积压的日志 */
  flush: () => {
    if (websocketService.isConnected()) {
      while (pendingLogs.length > 0) {
        const pending = pendingLogs.shift()!;
        websocketService.emit('CLIENT_LOG', pending);
      }
    }
  },
};
