import { VibeFlowWebSocket, type WebSocketEventHandler } from '../lib/websocket.js';
import { policyCache } from '../lib/policy-cache.js';
import { activityTracker } from '../lib/activity-tracker.js';
import { getWorkStartTracker } from '../lib/work-start-tracker.js';
import { entertainmentManager } from '../lib/entertainment-manager.js';
import { normalizeSystemState } from '../types/index.js';
import type { PolicyCache, SystemState, TimeContext, ActivityLog, ExecuteCommand, TimelineEvent, BlockEvent, InterruptionEvent, EnhancedUrlCheckResult, WorkStartPayload, EntertainmentModePayload, OctopusPolicy } from '../types/index.js';

// Global state
let wsClient: VibeFlowWebSocket | null = null;
let isConnected = false;
let currentTaskTitle: string | null = null;
let currentPomodoroId: string | null = null;
let pomodoroCount = 0;
let dailyCap = 8;
let userEmail: string | null = null;

// Default connection settings (Requirements: 4.1, 4.2, 4.7, 4.8)
const DEFAULT_SERVER_URL = 'http://localhost:3000';

// Reconnection state (Requirements: 4.3, 4.4)
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 2000; // 2 seconds
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isManualDisconnect = false; // Flag to prevent reconnect on intentional disconnect
let isEnsureConnectInProgress = false; // Guard for ensureConnected

// Activity tracking state
const activeTabTracking: Map<number, { url: string; title: string; startTime: number }> = new Map();
const pendingActivityLogs: ActivityLog[] = [];

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[ServiceWorker] Extension installed');
  await policyCache.initialize();
  await activityTracker.initialize();
  // Auto-connect with default settings on install (Requirements: 4.1, 4.2, 4.7, 4.8)
  await initializeDefaultConnection();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[ServiceWorker] Browser started');
  await policyCache.initialize();
  await activityTracker.initialize();
  await loadStoredConnection();
});

/**
 * Initialize default connection on first install
 * Requirements: 4.1, 4.2, 4.7, 4.8
 */
async function initializeDefaultConnection(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['serverUrl', 'hasInitialized']);

    // If already initialized, use stored settings
    if (result.hasInitialized) {
      await loadStoredConnection();
      return;
    }

    // First time install - set default values and connect
    console.log('[ServiceWorker] First install - setting up default connection');
    await chrome.storage.local.set({
      serverUrl: DEFAULT_SERVER_URL,
      isConnected: false,
      hasInitialized: true,
    });

    // Auto-connect with default settings (auth via browser cookie)
    connect(DEFAULT_SERVER_URL);
  } catch (error) {
    console.error('[ServiceWorker] Failed to initialize default connection:', error);
  }
}

// Load stored connection settings and reconnect
async function loadStoredConnection(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['serverUrl', 'isConnected', 'hasInitialized']);

    // If not initialized yet, initialize with defaults
    if (!result.hasInitialized) {
      await initializeDefaultConnection();
      return;
    }

    // Use stored settings or defaults
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

    // Always try to reconnect on browser startup (Requirements: 4.3)
    console.log('[ServiceWorker] Reconnecting to server...');
    connect(serverUrl);
  } catch (error) {
    console.error('[ServiceWorker] Failed to load stored connection:', error);
  }
}

/**
 * Ensure WebSocket is connected when service worker wakes up.
 * MV3 service workers are terminated after ~30s of inactivity,
 * losing all in-memory state (wsClient, isConnected, etc.).
 * This function detects that situation and auto-reconnects.
 */
async function ensureConnected(): Promise<void> {
  // Already connected or reconnect in progress
  if (isConnected || isEnsureConnectInProgress || reconnectTimer !== null) {
    return;
  }

  // Check if wsClient exists and is actually connected
  if (wsClient?.isConnected()) {
    isConnected = true;
    return;
  }

  isEnsureConnectInProgress = true;
  try {
    const result = await chrome.storage.local.get(['serverUrl', 'hasInitialized']);

    // Only auto-reconnect if user has previously configured a connection
    if (result.hasInitialized && result.serverUrl) {
      console.log('[ServiceWorker] Service worker woke up, auto-reconnecting...');
      reconnectAttempts = 0;
      connect(result.serverUrl);
    }
  } catch (error) {
    console.error('[ServiceWorker] ensureConnected failed:', error);
  } finally {
    isEnsureConnectInProgress = false;
  }
}

// WebSocket event handlers
const wsHandlers: WebSocketEventHandler = {
  onPolicySync: async (policy: PolicyCache) => {
    console.log('[ServiceWorker] Policy synced:', policy);
    // Normalize globalState to uppercase
    if (policy.globalState) {
      policy.globalState = policy.globalState.toUpperCase() as SystemState;
    }
    await policyCache.updatePolicy(policy);
    
    // Update blocking rules based on new policy
    await updateBlockingRules();
    
    // Broadcast to popup
    broadcastToPopup({ type: 'POLICY_UPDATED', payload: policy });
  },

  onStateChange: async (state: SystemState, timeContext?: string) => {
    // Normalize state: server may send legacy values (locked/planning/rest) or new values (idle)
    const normalizedState = normalizeSystemState(state);
    const tc = (timeContext || 'free_time') as TimeContext;
    console.log('[ServiceWorker] State changed:', state, '-> normalized:', normalizedState, ', timeContext:', tc);
    await policyCache.updateState(normalizedState);
    await policyCache.updateTimeContext(tc);

    // Track work start time (LOCKED → PLANNING transition)
    // Requirements: 14.1, 14.2, 14.10
    const workStartTracker = getWorkStartTracker();
    await workStartTracker.handleStateChange(normalizedState);

    // Clear session whitelist when leaving FOCUS
    if (normalizedState !== 'FOCUS') {
      await policyCache.clearSessionWhitelist();
    }

    // Update blocking rules
    await updateBlockingRules();

    // If entering OVER_REST, enforce restrictions on all tabs
    if (normalizedState === 'OVER_REST') {
      await enforceStateRestrictions();
    }

    // Broadcast to popup (include timeContext)
    broadcastToPopup({ type: 'STATE_CHANGED', payload: { state: normalizedState, timeContext: tc } });
  },

  onExecute: (command) => {
    console.log('[ServiceWorker] Execute command:', command);
    handleExecuteCommand(command as ExecuteCommand);
  },

  onConnect: async () => {
    console.log('[ServiceWorker] Connected to server');
    isConnected = true;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    chrome.storage.local.set({ isConnected: true });
    // Socket.IO CONNECT ACK means auth passed — mark authenticated immediately
    // Also set dashboardUrl to the connected server (not hardcoded localhost)
    const stored = await chrome.storage.local.get(['serverUrl']);
    const connectedServerUrl = stored.serverUrl || DEFAULT_SERVER_URL;
    await policyCache.updatePolicy({ isAuthenticated: true, dashboardUrl: connectedServerUrl });
    broadcastToPopup({ type: 'CONNECTION_STATUS', payload: { connected: true } });

    // Fetch user email for display — try token auth first, then session cookie
    try {
      const stored = await chrome.storage.local.get(['serverUrl', 'apiToken']);
      if (stored.serverUrl) {
        if (stored.apiToken) {
          // Token-based: verify token to get user info
          const res = await fetch(`${stored.serverUrl}/api/auth/token`, {
            headers: { 'Authorization': `Bearer ${stored.apiToken}` },
          });
          if (res.ok) {
            const data = await res.json() as { valid: boolean; user?: { email: string } };
            userEmail = data.user?.email || null;
          }
        } else {
          // Cookie-based: try NextAuth session
          const res = await fetch(`${stored.serverUrl}/api/auth/session`, { credentials: 'include' });
          if (res.ok) {
            const session = await res.json();
            userEmail = session?.user?.email || null;
          }
        }
      }
    } catch { /* ignore - email display is non-critical */ }

    // Sync entertainment quota from server on connect (Requirements: 5.11, 8.7)
    syncEntertainmentQuotaFromServer();
  },

  onDisconnect: async () => {
    console.log('[ServiceWorker] Disconnected from server');
    isConnected = false;
    chrome.storage.local.set({ isConnected: false });
    await policyCache.updatePolicy({ isAuthenticated: false });
    broadcastToPopup({ type: 'CONNECTION_STATUS', payload: { connected: false } });

    // Only schedule auto-reconnect if not a manual disconnect (Requirements: 4.3, 4.4)
    if (!isManualDisconnect) {
      scheduleReconnect();
    }
    isManualDisconnect = false; // Reset flag
  },

  onError: (error) => {
    console.error('[ServiceWorker] WebSocket error:', error);
    // Detect authentication errors and show auth expired banner
    if (error.name === 'AuthError') {
      broadcastToPopup({ type: 'AUTH_EXPIRED', payload: { message: '会话已过期，请在网页端重新登录' } });
    } else {
      broadcastToPopup({ type: 'ERROR', payload: { message: error.message } });
    }
  },

  // Octopus protocol handlers — unified command routing
  onOctopusCommand: async (command: { commandType: string; payload: unknown }) => {
    // Handle all Octopus commands in a single handler for maximum flexibility
    switch (command.commandType) {
      case 'SYNC_STATE': {
        const payload = command.payload as Record<string, unknown>;
        // payload structure: { syncType, version, state: { systemState: { state: '...' }, ... } }
        const stateObj = payload?.state as Record<string, unknown> | undefined;
        const systemStateObj = stateObj?.systemState as Record<string, unknown> | undefined;
        const sysState = systemStateObj?.state as string | undefined;
        if (sysState) {
          const normalizedState = normalizeSystemState(sysState as SystemState);
          const timeContext = (systemStateObj?.timeContext as string) || 'free_time';
          console.log('[ServiceWorker] SYNC_STATE received, state:', normalizedState, ', timeContext:', timeContext);
          await policyCache.updateState(normalizedState);
          await policyCache.updateTimeContext(timeContext as TimeContext);

          const workStartTracker = getWorkStartTracker();
          await workStartTracker.handleStateChange(normalizedState);

          if (normalizedState !== 'FOCUS') {
            await policyCache.clearSessionWhitelist();
          }

          await updateBlockingRules();

          if (normalizedState === 'OVER_REST') {
            await enforceStateRestrictions();
          }

          broadcastToPopup({ type: 'STATE_CHANGED', payload: { state: normalizedState } });
        }
        break;
      }
      case 'UPDATE_POLICY': {
        const payload = command.payload as { policy?: OctopusPolicy };
        if (payload?.policy) {
          console.log('[ServiceWorker] UPDATE_POLICY received via OCTOPUS_COMMAND');
          // Convert Octopus Policy to legacy PolicyCache for compatibility with existing policy-cache module
          // NOTE: Do NOT set globalState here — state is managed exclusively by SYNC_STATE commands.
          // Setting it here caused a race condition where stale OVER_REST overwrote fresh state.
          const policy = payload.policy;
          await policyCache.updatePolicy({
            blacklist: policy.config?.blacklist ?? [],
            whitelist: policy.config?.whitelist ?? [],
            isAuthenticated: true,
          } as Partial<PolicyCache>);
          await updateBlockingRules();
          broadcastToPopup({ type: 'POLICY_UPDATED', payload: policyCache.getPolicy() });
        }
        break;
      }
      case 'EXECUTE_ACTION': {
        const payload = command.payload as { action?: string; parameters?: Record<string, unknown> };
        console.log('[ServiceWorker] EXECUTE_ACTION received:', payload?.action);
        if (payload?.action) {
          handleExecuteCommand({ action: payload.action, params: payload.parameters ?? {} } as ExecuteCommand);
        }
        break;
      }
      case 'SHOW_UI': {
        const payload = command.payload as { uiType?: string; content?: Record<string, unknown> };
        console.log('[ServiceWorker] SHOW_UI received:', payload?.uiType);
        if (payload?.content?.type === 'entertainment_mode_change') {
          const entPayload = payload.content as { isActive: boolean; sessionId: string | null; endTime: number | null };
          console.log('[ServiceWorker] Entertainment mode change via SHOW_UI:', entPayload.isActive);
          await entertainmentManager.initialize();
          if (entPayload.isActive) {
            // Start entertainment mode
            broadcastToPopup({
              type: 'ENTERTAINMENT_STATUS_CHANGED',
              payload: entertainmentManager.getStatus(),
            });
          } else {
            // Stop entertainment mode
            broadcastToPopup({
              type: 'ENTERTAINMENT_STATUS_CHANGED',
              payload: entertainmentManager.getStatus(),
            });
          }
        }
        break;
      }
    }
  },

  // Entertainment quota sync handler (Requirements: 5.11, 8.7)
  onEntertainmentQuotaSync: async (payload: { quotaUsed: number; quotaTotal: number; quotaRemaining: number }) => {
    console.log('[ServiceWorker] Entertainment quota sync received:', payload);
    
    // Initialize entertainment manager and update quota
    await entertainmentManager.initialize();
    await entertainmentManager.syncQuotaFromServer({
      quotaUsed: payload.quotaUsed,
      quotaTotal: payload.quotaTotal,
      cooldownEndTime: null,
      lastSessionEndTime: null,
      isActive: false,
      sessionId: null,
      startTime: null,
      endTime: null,
    });
    
    // Broadcast updated status to popup
    broadcastToPopup({ 
      type: 'ENTERTAINMENT_STATUS_CHANGED', 
      payload: entertainmentManager.getStatus() 
    });
  },
};

// Connect to VibeFlow server
// Auth: uses stored API token if available, falls back to browser cookie
async function connect(serverUrl: string): Promise<void> {
  // Clear any pending reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (wsClient) {
    isManualDisconnect = true; // Prevent reconnect when disconnecting old client
    wsClient.disconnect();
  }

  // Retrieve stored API token for authentication
  const stored = await chrome.storage.local.get(['apiToken']);
  const token = stored.apiToken || undefined;

  wsClient = new VibeFlowWebSocket(serverUrl, wsHandlers, token);
  wsClient.connect();

  // Store connection settings
  chrome.storage.local.set({ serverUrl });

  // Set up activity tracker callbacks for sending events via WebSocket
  activityTracker.setSyncCallback(async (logs: ActivityLog[]) => {
    if (wsClient?.isConnected()) {
      // Send individual BROWSER_ACTIVITY events via Octopus protocol
      for (const log of logs) {
        let domain = log.url;
        try { domain = new URL(log.url).hostname; } catch { /* use url as-is */ }
        wsClient.sendBrowserActivity({
          url: log.url,
          domain,
          title: log.title ?? '',
          category: log.category,
          startTime: Date.now() - log.duration * 1000,
          endTime: Date.now(),
          duration: log.duration,
          activeDuration: log.duration,
          idleTime: 0,
          scrollDepth: 0,
          interactionCount: 0,
          productivityScore: log.category === 'productive' ? 1 : log.category === 'distracting' ? -1 : 0,
          isMediaPlaying: false,
          mediaPlayDuration: 0,
          navigationType: 'other',
        });
      }
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setTimelineEventCallback(async (events: TimelineEvent[]) => {
    if (wsClient?.isConnected()) {
      // Timeline events are now processed via BROWSER_ACTIVITY/BROWSER_SESSION Octopus events.
      // The activity tracker already sends detailed Octopus events via its own callbacks.
      // This callback is a legacy path — log and skip.
      console.log(`[ServiceWorker] Timeline events (${events.length}) — legacy callback, skipped`);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setBlockEventCallback(async (event: BlockEvent) => {
    if (wsClient?.isConnected()) {
      // Block events are tracked locally via activity tracker.
      // Server-side handler was removed; block data is captured via BROWSER_ACTIVITY events.
      console.log(`[ServiceWorker] Block event — legacy callback, skipped:`, event.url);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setInterruptionEventCallback(async (event: InterruptionEvent) => {
    if (wsClient?.isConnected()) {
      // Interruption events are tracked locally via activity tracker.
      // Server-side handler was removed; interruption data is captured via BROWSER_ACTIVITY events.
      console.log(`[ServiceWorker] Interruption event — legacy callback, skipped:`, event.source);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  // Set up work start tracker callback for sending WORK_START events
  // Requirements: 14.1, 14.2, 14.9, 14.10
  const workStartTracker = getWorkStartTracker();
  workStartTracker.setSendCallback((payload: WorkStartPayload) => {
    if (wsClient?.isConnected()) {
      wsClient.sendWorkStart(payload);
    } else {
      console.warn('[ServiceWorker] Cannot send work start event, not connected');
    }
  });

  // Initialize work start tracker with current state
  workStartTracker.setPreviousState(policyCache.getState());

  // Retry sending any pending work start events
  workStartTracker.retrySendIfNeeded();

  // Set up entertainment manager callback for sending ENTERTAINMENT_MODE events
  // Requirements: 12.1, 12.2, 12.3, 12.4
  entertainmentManager.setSendEventCallback((payload) => {
    if (wsClient?.isConnected()) {
      wsClient.sendEntertainmentMode(payload as EntertainmentModePayload);
    } else {
      console.warn('[ServiceWorker] Cannot send entertainment mode event, not connected');
    }
  });

  // Set up entertainment manager auto-end callback for closing tabs
  // Requirements: 5.5, 5.6, 5.10
  entertainmentManager.setAutoEndCallback(async (reason) => {
    console.log('[ServiceWorker] Entertainment mode auto-ended:', reason);
    
    // Close entertainment tabs (Requirements: 5.10)
    await closeEntertainmentTabs();
    
    // Sync quota to server after entertainment mode ends (Requirements: 5.11, 8.7)
    await syncEntertainmentQuotaToServer();
    
    // Broadcast status change to popup
    broadcastToPopup({ 
      type: 'ENTERTAINMENT_STATUS_CHANGED', 
      payload: entertainmentManager.getStatus() 
    });
    
    // Show notification to user
    const message = reason === 'quota_exhausted' 
      ? '今日娱乐配额已用完' 
      : '工作时间已开始，娱乐模式已结束';
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '娱乐模式已结束',
      message,
    });
  });
}

/**
 * Schedule auto-reconnect with exponential backoff
 * Requirements: 4.3, 4.4
 */
function scheduleReconnect(): void {
  // Don't reconnect if we've exceeded max attempts
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[ServiceWorker] Max reconnect attempts reached, stopping auto-reconnect');
    broadcastToPopup({ 
      type: 'ERROR', 
      payload: { message: 'Unable to connect to server after multiple attempts. Please check if the server is running.' } 
    });
    return;
  }
  
  // Clear any existing timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  // Calculate delay with exponential backoff
  const delay = BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts);
  reconnectAttempts++;
  
  console.log(`[ServiceWorker] Scheduling reconnect in ${Math.round(delay)}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimer = setTimeout(async () => {
    const result = await chrome.storage.local.get(['serverUrl']);
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

    console.log('[ServiceWorker] Attempting reconnect...');
    connect(serverUrl);
  }, delay);
}

// Disconnect from server
function disconnect(): void {
  // Clear any pending reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Reset reconnect attempts
  reconnectAttempts = 0;
  
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  isConnected = false;
  chrome.storage.local.set({ isConnected: false });
}

/**
 * Sync entertainment quota from server on connect
 * Requirements: 5.11, 8.7
 * 
 * Fetches the current quota status from the server and updates local state.
 */
async function syncEntertainmentQuotaFromServer(): Promise<void> {
  try {
    // Get server URL and API token from storage
    const result = await chrome.storage.local.get(['serverUrl', 'apiToken']);
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

    // Build auth headers: prefer API token, fall back to cookie
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (result.apiToken) {
      headers['Authorization'] = `Bearer ${result.apiToken}`;
    }

    const response = await fetch(`${serverUrl}/api/trpc/entertainment.getStatus`, {
      method: 'GET',
      headers,
      // Include cookies as fallback for local dev (same-origin)
      credentials: 'include',
    });

    if (response.status === 401) {
      console.warn('[ServiceWorker] Authentication expired, please log in again');
      broadcastToPopup({ type: 'AUTH_EXPIRED', payload: { message: '会话已过期，请重新登录' } });
      return;
    }

    if (!response.ok) {
      console.warn('[ServiceWorker] Failed to fetch entertainment status from server:', response.status);
      return;
    }
    
    const data = await response.json();
    
    // tRPC v11 response: { result: { data: { json: ... } } }
    const serverStatus = data.result?.data?.json ?? data.result?.data;
    if (serverStatus) {
      // Initialize entertainment manager and sync from server
      await entertainmentManager.initialize();
      await entertainmentManager.syncQuotaFromServer({
        quotaUsed: serverStatus.quotaUsed,
        quotaTotal: serverStatus.quotaTotal,
        cooldownEndTime: serverStatus.cooldownEndTime,
        lastSessionEndTime: serverStatus.lastSessionEndTime,
        isActive: serverStatus.isActive,
        sessionId: serverStatus.sessionId,
        startTime: serverStatus.startTime,
        endTime: serverStatus.endTime,
      });
      
      console.log('[ServiceWorker] Entertainment quota synced from server');
      
      // Broadcast updated status to popup
      broadcastToPopup({ 
        type: 'ENTERTAINMENT_STATUS_CHANGED', 
        payload: entertainmentManager.getStatus() 
      });
    } else {
      console.warn('[ServiceWorker] Entertainment status response has no data:', JSON.stringify(data).slice(0, 200));
    }
  } catch (error) {
    console.error('[ServiceWorker] Error syncing entertainment quota from server:', error);
  }
}

/**
 * Sync entertainment quota to server after entertainment mode ends
 * Requirements: 5.11, 8.7
 * 
 * Pushes the current quota usage to the server.
 */
async function syncEntertainmentQuotaToServer(): Promise<void> {
  try {
    // Get server URL and API token from storage
    const result = await chrome.storage.local.get(['serverUrl', 'apiToken']);
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;

    const usedMinutes = entertainmentManager.getQuotaUsageForSync();

    // Build auth headers: prefer API token, fall back to cookie
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (result.apiToken) {
      headers['Authorization'] = `Bearer ${result.apiToken}`;
    }

    const response = await fetch(`${serverUrl}/api/trpc/entertainment.updateQuotaUsage`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        json: { usedMinutes },
      }),
    });

    if (response.status === 401) {
      console.warn('[ServiceWorker] Authentication expired, please log in again');
      broadcastToPopup({ type: 'AUTH_EXPIRED', payload: { message: '会话已过期，请重新登录' } });
      return;
    }

    if (!response.ok) {
      console.warn('[ServiceWorker] Failed to sync entertainment quota to server:', response.status);
      return;
    }
    
    // Update last sync time
    await entertainmentManager.updateLastSyncTime();
    
    console.log('[ServiceWorker] Entertainment quota synced to server:', usedMinutes, 'minutes');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing entertainment quota to server:', error);
  }
}

// Handle execute commands from server
async function handleExecuteCommand(command: ExecuteCommand): Promise<void> {
  switch (command.action) {
    case 'INJECT_TOAST':
      // Send toast to active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'SHOW_TOAST',
          payload: command.params,
        });
      }
      break;

    case 'SHOW_OVERLAY':
      // Send overlay command to active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_OVERLAY',
          payload: command.params,
        });
      }
      break;

    case 'REDIRECT':
      // Redirect active tab
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab?.id) {
        chrome.tabs.update(currentTab.id, { url: command.params.url as string });
      }
      break;

    case 'POMODORO_COMPLETE':
      // Handle pomodoro completion - clear current pomodoro ID
      console.log('[ServiceWorker] Pomodoro completed:', command.params);
      currentPomodoroId = null;
      activityTracker.setCurrentPomodoroId(null);
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Pomodoro Complete!',
        message: `Task: ${command.params.taskTitle || 'Unknown'}`,
      });
      break;

    case 'IDLE_ALERT':
      // Handle idle alert - show overlay on active tab
      console.log('[ServiceWorker] Idle alert:', command.params);
      const [idleTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (idleTab?.id) {
        chrome.tabs.sendMessage(idleTab.id, {
          type: 'SHOW_OVERLAY',
          payload: { type: 'idle_alert', ...command.params },
        });
      }
      break;
  }
}

// Update declarativeNetRequest blocking rules
async function updateBlockingRules(): Promise<void> {
  // Degraded mode: no blocking rules when not authenticated (R6.3)
  if (!policyCache.isAuthenticated()) {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds,
      });
    }
    return;
  }

  const policy = policyCache.getPolicy();

  // Only apply blocking rules during FOCUS state
  if (policy.globalState !== 'FOCUS') {
    // Remove all dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds,
      });
    }
    return;
  }

  // Create blocking rules for blacklisted domains
  const rules: chrome.declarativeNetRequest.Rule[] = policy.blacklist.map((pattern, index) => {
    const urlFilter = pattern.startsWith('*.') 
      ? `||${pattern.slice(2)}` 
      : `||${pattern}`;
    
    return {
      id: index + 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          extensionPath: '/screensaver.html',
        },
      },
      condition: {
        urlFilter,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      },
    };
  });

  // Update rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(rule => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rules,
  });

  console.log('[ServiceWorker] Updated blocking rules:', rules.length);
}

// Broadcast message to popup
function broadcastToPopup(message: { type: string; payload: unknown }): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Tab activity tracking
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  handleTabChange(activeInfo.tabId, tab.url || '', tab.title || '');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    handleTabChange(tabId, tab.url || '', tab.title || '');
  }
});

function handleTabChange(tabId: number, url: string, title: string): void {
  // Stop tracking previous tab
  const previousTracking = activeTabTracking.get(tabId);
  if (previousTracking && previousTracking.url !== url) {
    const duration = Math.floor((Date.now() - previousTracking.startTime) / 1000);
    if (duration > 0) {
      const log: ActivityLog = {
        url: previousTracking.url,
        title: previousTracking.title,
        startTime: previousTracking.startTime,
        duration,
        category: categorizeUrl(previousTracking.url),
      };
      pendingActivityLogs.push(log);
    }
  }

  // Start tracking new URL
  if (url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
    activeTabTracking.set(tabId, {
      url,
      title,
      startTime: Date.now(),
    });

    // Check if URL should be blocked
    checkUrlPolicy(tabId, url);
  }
}

// Check URL against policy and take action
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 2.1, 2.10, 3.7, 3.8, 4.3, 6.1, 6.7
async function checkUrlPolicy(tabId: number, url: string): Promise<void> {
  // Degraded mode: when not authenticated, skip all blocking (R6.3)
  // Only show a login reminder overlay instead of enforcing any blocks
  if (!policyCache.isAuthenticated()) {
    return;
  }

  // First, check for state restrictions (LOCKED or OVER_REST)
  // Requirements: 1.1, 1.2, 1.6, 1.10
  const stateRestriction = policyCache.shouldBlockForStateRestriction(url);
  if (stateRestriction.blocked) {
    console.log('[ServiceWorker] State restriction block:', stateRestriction.reason, url);
    await handleStateRestrictionBlock(tabId, url, stateRestriction);
    return;
  }

  // Check entertainment site blocking (Requirements: 2.1, 2.10, 3.7, 3.8)
  // Entertainment sites should be blocked unless entertainment mode is active
  await entertainmentManager.initialize();
  entertainmentManager.setWorkTimeSlots(policyCache.getPolicy().workTimeSlots);
  
  const isEntertainmentSite = entertainmentManager.isEntertainmentSite(url);
  const isWhitelisted = entertainmentManager.isWhitelisted(url);
  const isEntertainmentModeActive = entertainmentManager.getStatus().isActive;
  
  if (isEntertainmentSite && !isWhitelisted && !isEntertainmentModeActive) {
    console.log('[ServiceWorker] Entertainment site blocked:', url);
    await activityTracker.recordBlockEvent(url, 'entertainment_block');
    await handleEntertainmentBlock(tabId, url);
    return;
  }
  
  // If entertainment mode is active and visiting entertainment site, record it
  if (isEntertainmentSite && isEntertainmentModeActive) {
    await entertainmentManager.recordVisitedSite(url);
  }

  // Use enhanced blocking check with work time and mode awareness
  const isPomodoroActive = currentPomodoroId !== null;
  const result = policyCache.shouldBlockEnhanced(url, isPomodoroActive);
  
  if (result.action === 'block') {
    // Record block event (Requirements: 7.4)
    await activityTracker.recordBlockEvent(url, 'hard_block');
    
    // Strict mode: close tab and redirect to dashboard (Requirements 4.3, 6.1, 6.2)
    await handleStrictBlock(tabId, url);
  } else if (result.action === 'soft_block') {
    // Record block event (Requirements: 7.4)
    await activityTracker.recordBlockEvent(url, 'soft_block');
    
    // Gentle mode: show warning overlay (Requirements 4.6, 6.7)
    await handleGentleBlock(tabId, url, result);
  }
}

/**
 * Handle entertainment site blocking
 * Requirements: 2.1, 2.10, 3.7, 3.8
 */
async function handleEntertainmentBlock(tabId: number, blockedUrl: string): Promise<void> {
  const dashboardUrl = policyCache.getDashboardUrl();
  
  // Store blocked URL info
  await chrome.storage.local.set({
    lastBlockedUrl: blockedUrl,
    lastBlockedTime: Date.now(),
    blockReason: 'entertainment_blocked',
  });
  
  // Redirect to screensaver with entertainment block message
  const screensaverUrl = chrome.runtime.getURL('screensaver.html') + 
    `?reason=entertainment&url=${encodeURIComponent(blockedUrl)}`;
  
  chrome.tabs.update(tabId, { url: screensaverUrl });
}

/**
 * Handle state restriction blocking (OVER_REST)
 */
async function handleStateRestrictionBlock(
  tabId: number,
  blockedUrl: string,
  restriction: { blocked: boolean; redirectUrl?: string; reason?: 'over_rest' }
): Promise<void> {
  const dashboardUrl = policyCache.getDashboardUrl();

  // Store blocked URL info
  await chrome.storage.local.set({
    lastBlockedUrl: blockedUrl,
    lastBlockedTime: Date.now(),
    blockReason: 'over_rest_state',
  });
  
  // Try to find and activate existing Dashboard tab (Requirements 1.3)
  const existingDashboardTab = await findDashboardTab(dashboardUrl);
  
  if (existingDashboardTab) {
    // Activate existing Dashboard tab and close current tab
    await chrome.tabs.update(existingDashboardTab.id!, { active: true });
    
    // Focus the window containing the Dashboard tab
    if (existingDashboardTab.windowId) {
      await chrome.windows.update(existingDashboardTab.windowId, { focused: true });
    }
    
    // Close the blocked tab if it's not the Dashboard tab
    if (tabId !== existingDashboardTab.id) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab might already be closed
      }
    }
  } else {
    // No existing Dashboard tab, redirect to state-specific screensaver
    // Requirements: 1.6, 1.7
    if (restriction.redirectUrl) {
      chrome.tabs.update(tabId, { url: restriction.redirectUrl });
    } else {
      // Fallback to Dashboard
      chrome.tabs.update(tabId, { url: dashboardUrl });
    }
  }
}

/**
 * Find an existing Dashboard tab
 * Requirements: 1.3
 */
async function findDashboardTab(dashboardUrl: string): Promise<chrome.tabs.Tab | null> {
  try {
    const dashboardHostname = new URL(dashboardUrl).hostname;
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (tab.url) {
        try {
          const tabHostname = new URL(tab.url).hostname;
          if (tabHostname === dashboardHostname) {
            return tab;
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }
  } catch (error) {
    console.error('[ServiceWorker] Error finding Dashboard tab:', error);
  }
  
  return null;
}

/**
 * Close all entertainment site tabs when entertainment mode ends
 * Requirements: 5.10
 */
async function closeEntertainmentTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsToClose: number[] = [];
    
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      
      // Skip internal URLs
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('moz-extension://') ||
          tab.url.startsWith('file://')) {
        continue;
      }
      
      // Check if this is an entertainment site
      if (entertainmentManager.isEntertainmentSite(tab.url) && 
          !entertainmentManager.isWhitelisted(tab.url)) {
        tabsToClose.push(tab.id);
      }
    }
    
    // Close entertainment tabs
    if (tabsToClose.length > 0) {
      console.log('[ServiceWorker] Closing entertainment tabs:', tabsToClose.length);
      await chrome.tabs.remove(tabsToClose);
    }
  } catch (error) {
    console.error('[ServiceWorker] Error closing entertainment tabs:', error);
  }
}

/**
 * Enforce state restrictions on all open tabs when entering OVER_REST state
 */
async function enforceStateRestrictions(): Promise<void> {
  // Degraded mode: skip enforcement when not authenticated (R6.3)
  if (!policyCache.isAuthenticated()) {
    return;
  }

  const dashboardUrl = policyCache.getDashboardUrl();
  const state = policyCache.getState();
  
  console.log('[ServiceWorker] Enforcing state restrictions for:', state);
  
  try {
    const tabs = await chrome.tabs.query({});
    const dashboardHostname = new URL(dashboardUrl).hostname;
    
    // Find or create Dashboard tab
    let dashboardTab = await findDashboardTab(dashboardUrl);
    
    // Collect tabs to close (non-Dashboard, non-internal tabs)
    const tabsToClose: number[] = [];
    
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      
      // Skip internal URLs
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('moz-extension://') ||
          tab.url.startsWith('file://')) {
        continue;
      }
      
      // Check if this is a Dashboard tab
      try {
        const tabHostname = new URL(tab.url).hostname;
        if (tabHostname === dashboardHostname) {
          // This is a Dashboard tab, keep it
          if (!dashboardTab) {
            dashboardTab = tab;
          }
          continue;
        }
      } catch {
        // Invalid URL, skip
        continue;
      }
      
      // This is a non-Dashboard tab, mark for closing
      tabsToClose.push(tab.id);
    }
    
    // If no Dashboard tab exists, create one
    if (!dashboardTab) {
      dashboardTab = await chrome.tabs.create({ url: dashboardUrl, active: true });
    } else {
      // Activate existing Dashboard tab
      await chrome.tabs.update(dashboardTab.id!, { active: true });
      if (dashboardTab.windowId) {
        await chrome.windows.update(dashboardTab.windowId, { focused: true });
      }
    }
    
    // Close non-Dashboard tabs (redirect to screensaver instead of closing for better UX)
    const screensaverUrl = chrome.runtime.getURL('over-rest-screensaver.html');
    
    for (const tabId of tabsToClose) {
      try {
        // Redirect to state-specific screensaver
        await chrome.tabs.update(tabId, { url: screensaverUrl });
      } catch {
        // Tab might have been closed already
      }
    }
    
    console.log('[ServiceWorker] State restrictions enforced, redirected tabs:', tabsToClose.length);
  } catch (error) {
    console.error('[ServiceWorker] Error enforcing state restrictions:', error);
  }
}

/**
 * Handle strict mode blocking - close tab and redirect to dashboard
 * Requirements: 4.3, 6.1, 6.2
 */
async function handleStrictBlock(tabId: number, blockedUrl: string): Promise<void> {
  const dashboardUrl = policyCache.getDashboardUrl();
  const shouldReplace = policyCache.shouldReplaceTab();
  
  // Store blocked URL info for dashboard display (Requirements 6.3)
  await chrome.storage.local.set({
    lastBlockedUrl: blockedUrl,
    lastBlockedTime: Date.now(),
    blockReason: 'strict_mode',
  });
  
  if (shouldReplace) {
    // Replace current tab with dashboard (Requirements 6.6)
    chrome.tabs.update(tabId, { url: `${dashboardUrl}?blocked=${encodeURIComponent(blockedUrl)}` });
  } else {
    // Close current tab and open dashboard in new tab
    chrome.tabs.remove(tabId);
    chrome.tabs.create({ url: `${dashboardUrl}?blocked=${encodeURIComponent(blockedUrl)}` });
  }
}

/**
 * Handle gentle mode blocking - show warning overlay with countdown
 * Requirements: 4.6, 6.7
 */
async function handleGentleBlock(tabId: number, url: string, result: EnhancedUrlCheckResult): Promise<void> {
  // Check if user is authenticated (Requirements 6.4)
  const isAuthenticated = policyCache.isAuthenticated();
  
  if (!isAuthenticated) {
    // Show login reminder overlay (Requirements 6.4, 6.5)
    await handleUnauthenticatedBlock(tabId, url);
    return;
  }
  
  // Show gentle mode warning overlay with countdown
  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_OVERLAY',
    payload: {
      type: 'gentle_warning',
      url,
      skipTokensRemaining: result.skipTokensRemaining,
      countdownSeconds: 10,
      dashboardUrl: policyCache.getDashboardUrl(),
    },
  }).catch(() => {
    // Content script might not be loaded yet, redirect to screensaver
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('screensaver.html') });
  });
}

/**
 * Handle blocking for unauthenticated users
 * Requirements: 6.4, 6.5
 */
async function handleUnauthenticatedBlock(tabId: number, url: string): Promise<void> {
  // Get unauthenticated block count
  const result = await chrome.storage.local.get(['unauthBlockCount', 'unauthBlockCountResetTime']);
  let blockCount = result.unauthBlockCount || 0;
  const resetTime = result.unauthBlockCountResetTime || 0;
  
  // Reset count if it's been more than 1 hour
  if (Date.now() - resetTime > 60 * 60 * 1000) {
    blockCount = 0;
  }
  
  blockCount++;
  await chrome.storage.local.set({
    unauthBlockCount: blockCount,
    unauthBlockCountResetTime: resetTime || Date.now(),
  });
  
  // After 3 attempts, require login (Requirements 6.5)
  const requireLogin = blockCount >= 3;
  
  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_OVERLAY',
    payload: {
      type: 'login_reminder',
      url,
      blockCount,
      requireLogin,
      dashboardUrl: policyCache.getDashboardUrl(),
    },
  }).catch(() => {
    // Content script might not be loaded yet, redirect to screensaver
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('screensaver.html') });
  });
}

// Categorize URL for activity logging
function categorizeUrl(url: string): 'productive' | 'neutral' | 'distracting' {
  const policy = policyCache.getPolicy();
  const hostname = new URL(url).hostname.toLowerCase();

  // Check whitelist (productive)
  if (policy.whitelist.some(p => hostname.includes(p.toLowerCase()))) {
    return 'productive';
  }

  // Check blacklist (distracting)
  if (policy.blacklist.some(p => hostname.includes(p.toLowerCase()))) {
    return 'distracting';
  }

  return 'neutral';
}

// Sync activity logs to server periodically
chrome.alarms.create('syncActivityLogs', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncActivityLogs') {
    await syncActivityLogs();
  }
});

async function syncActivityLogs(): Promise<void> {
  if (!wsClient?.isConnected() || pendingActivityLogs.length === 0) {
    // Also try to sync via activity tracker
    await activityTracker.syncToServer();
    return;
  }

  const logsToSync = [...pendingActivityLogs];
  pendingActivityLogs.length = 0;

  // Send individual BROWSER_ACTIVITY events via Octopus protocol
  for (const log of logsToSync) {
    let domain = log.url;
    try { domain = new URL(log.url).hostname; } catch { /* use url as-is */ }
    wsClient.sendBrowserActivity({
      url: log.url,
      domain,
      title: log.title ?? '',
      category: log.category,
      startTime: Date.now() - log.duration * 1000,
      endTime: Date.now(),
      duration: log.duration,
      activeDuration: log.duration,
      idleTime: 0,
      scrollDepth: 0,
      interactionCount: 0,
      productivityScore: log.category === 'productive' ? 1 : log.category === 'distracting' ? -1 : 0,
      isMediaPlaying: false,
      mediaPlayDuration: 0,
      navigationType: 'other',
    });
  }

  console.log('[ServiceWorker] Synced activity logs:', logsToSync.length);

  // Also sync activity tracker's pending events
  await activityTracker.syncToServer();
}

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(
  message: { type: string; payload?: unknown },
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'CONNECT':
      const { serverUrl: connectUrl } = message.payload as { serverUrl: string };
      await connect(connectUrl);
      return { success: true };

    case 'LOGIN': {
      // Token-based login via HTTP API, then connect WebSocket with the token
      const { serverUrl: loginUrl, email: loginEmail, password } = message.payload as {
        serverUrl: string; email: string; password: string;
      };

      try {
        // Request API token via HTTP endpoint
        const res = await fetch(`${loginUrl}/api/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail, password, clientType: 'browser_ext' }),
        });

        const data = await res.json() as {
          success: boolean; token?: string; expiresAt?: string;
          error?: { code: string; message: string };
        };

        if (!data.success || !data.token) {
          return { success: false, error: data.error?.message || 'Login failed' };
        }

        // Store token and connect
        await chrome.storage.local.set({ apiToken: data.token, serverUrl: loginUrl });
        userEmail = loginEmail;
        await connect(loginUrl);

        return { success: true, email: loginEmail };
      } catch (error) {
        return { success: false, error: `Connection error: ${(error as Error).message}` };
      }
    }

    case 'LOGOUT': {
      // Clear stored token and disconnect
      await chrome.storage.local.remove(['apiToken']);
      userEmail = null;
      await policyCache.updatePolicy({ isAuthenticated: false });
      disconnect();
      return { success: true };
    }

    case 'DISCONNECT':
      disconnect();
      return { success: true };

    case 'GET_STATUS':
      // Auto-reconnect if service worker was terminated and restarted (MV3 lifecycle)
      await ensureConnected();
      return {
        connected: isConnected,
        isAuthenticated: policyCache.isAuthenticated(),
        userEmail,
        systemState: policyCache.getState(),
        timeContext: policyCache.getTimeContext(),
        pomodoroCount,
        dailyCap,
        currentTaskTitle,
        currentPomodoroId,
        // Additional connection info (Requirements: 4.5, 4.6)
        serverUrl: (await chrome.storage.local.get(['serverUrl'])).serverUrl || DEFAULT_SERVER_URL,
        reconnectAttempts,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      };

    case 'GET_CONNECTION_INFO':
      // Auto-reconnect if service worker was terminated and restarted (MV3 lifecycle)
      await ensureConnected();
      // Get detailed connection info (Requirements: 4.5)
      const connInfo = await chrome.storage.local.get(['serverUrl']);
      return {
        connected: isConnected,
        serverUrl: connInfo.serverUrl || DEFAULT_SERVER_URL,
        reconnectAttempts,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        isReconnecting: reconnectTimer !== null,
      };

    case 'MANUAL_RECONNECT':
      // Manual reconnect request (Requirements: 4.6)
      reconnectAttempts = 0; // Reset attempts for manual reconnect
      const reconnectInfo = await chrome.storage.local.get(['serverUrl']);
      const reconnectServerUrl = reconnectInfo.serverUrl || DEFAULT_SERVER_URL;
      connect(reconnectServerUrl);
      return { success: true };

    case 'GET_TAB_ID':
      // Return the tab ID to the content script
      return { tabId: sender.tab?.id || null };

    case 'INTERACTIONS_BATCH':
      // Handle interaction batch from content script (Requirements: 5.7)
      const interactionPayload = message.payload as {
        interactions: Array<{ type: string; timestamp: number; target?: string }>;
        scrollDepth: number;
      };
      if (sender.tab?.id) {
        // Update scroll depth
        activityTracker.updateScrollDepth(sender.tab.id, interactionPayload.scrollDepth);
        // Record interactions
        for (const interaction of interactionPayload.interactions) {
          activityTracker.recordInteraction(
            sender.tab.id,
            interaction.type as 'click' | 'input' | 'scroll' | 'keypress' | 'video_play' | 'video_pause',
            interaction.target
          );
        }
      }
      return { success: true };

    case 'SCROLL_DEPTH_UPDATE':
      // Handle scroll depth update from content script (Requirements: 5.6)
      const scrollPayload = message.payload as { depth: number };
      if (sender.tab?.id) {
        activityTracker.updateScrollDepth(sender.tab.id, scrollPayload.depth);
      }
      return { success: true };

    case 'MEDIA_STATE_UPDATE':
      // Handle media state update from content script (Requirements: 5.11)
      const mediaPayload = message.payload as { isPlaying: boolean };
      if (sender.tab?.id) {
        activityTracker.updateMediaState(sender.tab.id, mediaPayload.isPlaying);
      }
      return { success: true };

    case 'GET_POLICY':
      return policyCache.getPolicy();

    case 'ADD_SESSION_WHITELIST':
      const { url } = message.payload as { url: string };
      await policyCache.addSessionWhitelist(url);
      return { success: true };

    case 'USER_RESPONSE':
      // User response tracking — server-side handler removed in Phase B2.
      // Block event recording still happens locally below.

      // Update block event with user action if it was a soft block response
      const response = message.payload as { questionId: string; response: boolean; url?: string };
      if (response.url) {
        await activityTracker.recordBlockEvent(
          response.url,
          'soft_block',
          response.response ? 'proceeded' : 'returned'
        );
      }
      return { success: true };

    case 'SET_POMODORO':
      // Set current pomodoro ID for tracking interruptions
      const pomodoroPayload = message.payload as { pomodoroId: string | null; taskTitle?: string };
      currentPomodoroId = pomodoroPayload.pomodoroId;
      currentTaskTitle = pomodoroPayload.taskTitle || null;
      activityTracker.setCurrentPomodoroId(pomodoroPayload.pomodoroId);
      console.log('[ServiceWorker] Pomodoro set:', pomodoroPayload);
      return { success: true };

    case 'RECORD_INTERRUPTION':
      // Record an interruption event
      const interruptionPayload = message.payload as {
        source: 'blocked_site' | 'tab_switch' | 'idle' | 'manual';
        duration: number;
        details?: { url?: string; idleSeconds?: number };
      };
      await activityTracker.recordInterruptionEvent(
        interruptionPayload.source,
        interruptionPayload.duration,
        interruptionPayload.details
      );
      return { success: true };

    case 'GET_TRACKER_STATS':
      return activityTracker.getStats();

    case 'CONSUME_SKIP_TOKEN':
      // Consume a skip token for skip/delay action (Requirements 5.2, 5.3)
      const consumed = policyCache.consumeSkipToken();
      return { 
        success: consumed, 
        remaining: policyCache.getSkipTokensRemaining() 
      };

    case 'GET_BLOCKING_STATUS':
      // Get current blocking status for a URL
      const checkUrl = (message.payload as { url: string }).url;
      const isPomActive = currentPomodoroId !== null;
      const blockResult = policyCache.shouldBlockEnhanced(checkUrl, isPomActive);
      return blockResult;

    case 'GET_DASHBOARD_URL':
      return { url: policyCache.getDashboardUrl() };

    case 'RESET_UNAUTH_BLOCK_COUNT':
      // Reset unauthenticated block count when user logs in
      await chrome.storage.local.set({
        unauthBlockCount: 0,
        unauthBlockCountResetTime: Date.now(),
      });
      return { success: true };

    case 'GET_UNAUTH_BLOCK_COUNT':
      // Get current unauthenticated block count
      const unauthResult = await chrome.storage.local.get(['unauthBlockCount', 'unauthBlockCountResetTime']);
      let count = unauthResult.unauthBlockCount || 0;
      const resetAt = unauthResult.unauthBlockCountResetTime || 0;
      
      // Reset if it's been more than 1 hour
      if (Date.now() - resetAt > 60 * 60 * 1000) {
        count = 0;
      }
      
      return { 
        blockCount: count, 
        requireLogin: count >= 3 
      };

    // Entertainment Mode Messages (Requirements: 5.8, 6.1, 6.2, 6.3, 6.4, 6.10)
    case 'GET_ENTERTAINMENT_STATUS':
      // Get current entertainment status
      await entertainmentManager.initialize();
      // Update work time slots and system context from policy cache
      entertainmentManager.setWorkTimeSlots(policyCache.getPolicy().workTimeSlots);
      entertainmentManager.setSystemContext(policyCache.getState(), policyCache.getTimeContext());
      return entertainmentManager.getStatus();

    case 'START_ENTERTAINMENT':
      // Start entertainment mode (Requirements: 6.1)
      await entertainmentManager.initialize();
      entertainmentManager.setWorkTimeSlots(policyCache.getPolicy().workTimeSlots);
      entertainmentManager.setSystemContext(policyCache.getState(), policyCache.getTimeContext());
      const startResult = await entertainmentManager.startEntertainment();
      
      if (startResult.success) {
        // Broadcast status change to popup
        broadcastToPopup({ 
          type: 'ENTERTAINMENT_STATUS_CHANGED', 
          payload: entertainmentManager.getStatus() 
        });
      }
      
      return startResult;

    case 'STOP_ENTERTAINMENT':
      // Stop entertainment mode (Requirements: 6.4)
      await entertainmentManager.stopEntertainment('manual');
      
      // Sync quota to server after entertainment mode ends (Requirements: 5.11, 8.7)
      await syncEntertainmentQuotaToServer();
      
      // Broadcast status change to popup
      broadcastToPopup({ 
        type: 'ENTERTAINMENT_STATUS_CHANGED', 
        payload: entertainmentManager.getStatus() 
      });
      
      // Close entertainment tabs (Requirements: 5.10)
      await closeEntertainmentTabs();
      
      return { success: true };

    default:
      console.warn('[ServiceWorker] Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

// Initialize on load
policyCache.initialize().then(() => {
  console.log('[ServiceWorker] Policy cache initialized');
  activityTracker.initialize().then(() => {
    console.log('[ServiceWorker] Activity tracker initialized');
    // Initialize work start tracker
    const workStartTracker = getWorkStartTracker();
    workStartTracker.initialize().then(() => {
      console.log('[ServiceWorker] Work start tracker initialized');
      loadStoredConnection();
    });
  });
});
