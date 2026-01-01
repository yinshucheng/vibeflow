import { VibeFlowWebSocket, type WebSocketEventHandler } from '../lib/websocket.js';
import { policyCache } from '../lib/policy-cache.js';
import { activityTracker } from '../lib/activity-tracker.js';
import type { PolicyCache, SystemState, ActivityLog, ExecuteCommand, TimelineEvent, BlockEvent, InterruptionEvent, EnhancedUrlCheckResult } from '../types/index.js';

// Global state
let wsClient: VibeFlowWebSocket | null = null;
let isConnected = false;
let currentTaskTitle: string | null = null;
let currentPomodoroId: string | null = null;
let pomodoroCount = 0;
let dailyCap = 8;

// Activity tracking state
const activeTabTracking: Map<number, { url: string; title: string; startTime: number }> = new Map();
const pendingActivityLogs: ActivityLog[] = [];

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[ServiceWorker] Extension installed');
  await policyCache.initialize();
  await activityTracker.initialize();
  await loadStoredConnection();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[ServiceWorker] Browser started');
  await policyCache.initialize();
  await activityTracker.initialize();
  await loadStoredConnection();
});

// Load stored connection settings and reconnect
async function loadStoredConnection(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['serverUrl', 'userEmail', 'isConnected']);
    if (result.isConnected && result.serverUrl && result.userEmail) {
      console.log('[ServiceWorker] Reconnecting to stored server...');
      connect(result.serverUrl, result.userEmail);
    }
  } catch (error) {
    console.error('[ServiceWorker] Failed to load stored connection:', error);
  }
}

// WebSocket event handlers
const wsHandlers: WebSocketEventHandler = {
  onPolicySync: async (policy: PolicyCache) => {
    console.log('[ServiceWorker] Policy synced:', policy);
    await policyCache.updatePolicy(policy);
    
    // Update blocking rules based on new policy
    await updateBlockingRules();
    
    // Broadcast to popup
    broadcastToPopup({ type: 'POLICY_UPDATED', payload: policy });
  },

  onStateChange: async (state: SystemState) => {
    console.log('[ServiceWorker] State changed:', state);
    await policyCache.updateState(state);
    
    // Clear session whitelist when leaving FOCUS
    if (state !== 'FOCUS') {
      await policyCache.clearSessionWhitelist();
    }
    
    // Update blocking rules
    await updateBlockingRules();
    
    // Broadcast to popup
    broadcastToPopup({ type: 'STATE_CHANGED', payload: { state } });
  },

  onExecute: (command) => {
    console.log('[ServiceWorker] Execute command:', command);
    handleExecuteCommand(command as ExecuteCommand);
  },

  onConnect: () => {
    console.log('[ServiceWorker] Connected to server');
    isConnected = true;
    chrome.storage.local.set({ isConnected: true });
    broadcastToPopup({ type: 'CONNECTION_STATUS', payload: { connected: true } });
  },

  onDisconnect: () => {
    console.log('[ServiceWorker] Disconnected from server');
    isConnected = false;
    chrome.storage.local.set({ isConnected: false });
    broadcastToPopup({ type: 'CONNECTION_STATUS', payload: { connected: false } });
  },

  onError: (error) => {
    console.error('[ServiceWorker] WebSocket error:', error);
    broadcastToPopup({ type: 'ERROR', payload: { message: error.message } });
  },
};

// Connect to VibeFlow server
function connect(serverUrl: string, userEmail: string): void {
  if (wsClient) {
    wsClient.disconnect();
  }

  wsClient = new VibeFlowWebSocket(serverUrl, userEmail, wsHandlers);
  wsClient.connect();

  // Store connection settings
  chrome.storage.local.set({ serverUrl, userEmail });

  // Set up activity tracker callbacks for sending events via WebSocket
  activityTracker.setSyncCallback(async (logs: ActivityLog[]) => {
    if (wsClient?.isConnected()) {
      wsClient.sendEvent('ACTIVITY_LOG', logs);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setTimelineEventCallback(async (events: TimelineEvent[]) => {
    if (wsClient?.isConnected()) {
      wsClient.sendEvent('TIMELINE_EVENTS_BATCH', events);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setBlockEventCallback(async (event: BlockEvent) => {
    if (wsClient?.isConnected()) {
      wsClient.sendEvent('BLOCK_EVENT', event);
    } else {
      throw new Error('WebSocket not connected');
    }
  });

  activityTracker.setInterruptionEventCallback(async (event: InterruptionEvent) => {
    if (wsClient?.isConnected()) {
      wsClient.sendEvent('INTERRUPTION_EVENT', event);
    } else {
      throw new Error('WebSocket not connected');
    }
  });
}

// Disconnect from server
function disconnect(): void {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  isConnected = false;
  chrome.storage.local.set({ isConnected: false });
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
// Requirements: 4.3, 6.1, 6.7
async function checkUrlPolicy(tabId: number, url: string): Promise<void> {
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

  wsClient.sendEvent('ACTIVITY_LOG', logsToSync);

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
      const { serverUrl, userEmail } = message.payload as { serverUrl: string; userEmail: string };
      connect(serverUrl, userEmail);
      return { success: true };

    case 'DISCONNECT':
      disconnect();
      return { success: true };

    case 'GET_STATUS':
      return {
        connected: isConnected,
        systemState: policyCache.getState(),
        pomodoroCount,
        dailyCap,
        currentTaskTitle,
        currentPomodoroId,
      };

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
      // Forward user response to server
      if (wsClient?.isConnected()) {
        wsClient.sendEvent('USER_RESPONSE', message.payload as { questionId: string; response: boolean });
      }
      
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
      if (consumed && wsClient?.isConnected()) {
        // Notify server about token consumption
        wsClient.sendEvent('CONSUME_SKIP_TOKEN', {});
      }
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
    loadStoredConnection();
  });
});
