// Extension popup script
// Requirements: 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10

import type { SystemState, ConnectionStatus } from '../types/index.js';
import type { EntertainmentStatus } from '../lib/entertainment-manager.js';

// Extended connection status with entertainment info
interface ExtendedConnectionStatus extends ConnectionStatus {
  entertainmentStatus?: EntertainmentStatus;
  // Additional connection info (Requirements: 4.5, 4.6)
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
}

// Connection info response type
interface ConnectionInfo {
  connected: boolean;
  serverUrl: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  isReconnecting: boolean;
}

// DOM Elements - Login
const loginSection = document.getElementById('login-section') as HTMLElement;
const statusSection = document.getElementById('status-section') as HTMLElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const connectionStatus = document.getElementById('connection-status') as HTMLElement;

// DOM Elements - Auth Expiry Banner
const authExpiredBanner = document.getElementById('auth-expired-banner') as HTMLElement;

// DOM Elements - Connection Info (Requirements: 4.5, 4.6)
const connectionInfoSection = document.getElementById('connection-info-section') as HTMLElement;
const connectionServer = document.getElementById('connection-server') as HTMLElement;
const reconnectInfoRow = document.getElementById('reconnect-info-row') as HTMLElement;
const reconnectInfo = document.getElementById('reconnect-info') as HTMLElement;
const reconnectBtn = document.getElementById('reconnect-btn') as HTMLButtonElement;

// DOM Elements - Status
const systemStateEl = document.getElementById('system-state') as HTMLElement;
const pomodoroCountEl = document.getElementById('pomodoro-count') as HTMLElement;
const dailyCapEl = document.getElementById('daily-cap') as HTMLElement;
const currentTaskTitleEl = document.getElementById('current-task-title') as HTMLElement;
const openDashboardBtn = document.getElementById('open-dashboard') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;

// DOM Elements - Entertainment Mode (Requirements: 5.8, 6.2, 6.3, 6.10)
const entertainmentSection = document.getElementById('entertainment-section') as HTMLElement;
const entertainmentModeStatus = document.getElementById('entertainment-mode-status') as HTMLElement;
const entertainmentQuota = document.getElementById('entertainment-quota') as HTMLElement;
const cooldownRow = document.getElementById('cooldown-row') as HTMLElement;
const entertainmentCooldown = document.getElementById('entertainment-cooldown') as HTMLElement;
const lastSessionRow = document.getElementById('last-session-row') as HTMLElement;
const entertainmentLastSession = document.getElementById('entertainment-last-session') as HTMLElement;
const entertainmentCountdown = document.getElementById('entertainment-countdown') as HTMLElement;
const countdownTimer = document.getElementById('countdown-timer') as HTMLElement;
const startEntertainmentBtn = document.getElementById('start-entertainment') as HTMLButtonElement;
const stopEntertainmentBtn = document.getElementById('stop-entertainment') as HTMLButtonElement;
const entertainmentDisabledMsg = document.getElementById('entertainment-disabled-msg') as HTMLElement;
const entertainmentDisabledReason = document.getElementById('entertainment-disabled-reason') as HTMLElement;

// Entertainment state
let entertainmentUpdateInterval: number | null = null;
let currentEntertainmentStatus: EntertainmentStatus | null = null;
let warningShown5Min = false;
let warningShown1Min = false;

// Initialize popup
async function initialize(): Promise<void> {
  // Load stored settings
  const stored = await chrome.storage.local.get(['serverUrl', 'isConnected']);

  if (stored.serverUrl) {
    serverUrlInput.value = stored.serverUrl;
  } else {
    serverUrlInput.value = 'http://localhost:3000';
  }

  // Get current status from service worker
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ExtendedConnectionStatus;
  
  // Get connection info (Requirements: 4.5)
  const connInfo = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_INFO' }) as ConnectionInfo;
  updateConnectionInfo(connInfo);
  
  if (status.connected) {
    showStatusSection(status);
    // Get entertainment status
    await refreshEntertainmentStatus();
  } else {
    // Show connection info section even when disconnected (Requirements: 4.5)
    showLoginSection();
    
    // If reconnecting, show reconnect status
    if (connInfo.isReconnecting) {
      showReconnectingStatus(connInfo);
    }
  }

  // Setup event listeners
  setupEventListeners();
  
  // Listen for status updates
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Setup event listeners
function setupEventListeners(): void {
  loginForm.addEventListener('submit', handleLogin);
  openDashboardBtn.addEventListener('click', handleOpenDashboard);
  disconnectBtn.addEventListener('click', handleDisconnect);

  // Reconnect button (Requirements: 4.6)
  reconnectBtn.addEventListener('click', handleReconnect);

  // Entertainment mode buttons (Requirements: 6.1, 6.4)
  startEntertainmentBtn.addEventListener('click', handleStartEntertainment);
  stopEntertainmentBtn.addEventListener('click', handleStopEntertainment);

  // Auth expired — open web login button
  const openWebLoginBtn = document.getElementById('open-web-login');
  if (openWebLoginBtn) {
    openWebLoginBtn.addEventListener('click', handleOpenWebLogin);
  }
}

/**
 * Open web login page when auth has expired
 * Requirements: 4.4.2 — session expiry handling
 */
async function handleOpenWebLogin(): Promise<void> {
  const stored = await chrome.storage.local.get(['serverUrl']);
  const url = (stored.serverUrl || 'http://localhost:3000') + '/login';
  chrome.tabs.create({ url });
}

// Handle login form submission
async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();

  const serverUrl = serverUrlInput.value.trim();

  if (!serverUrl) {
    showError('Please enter a server URL');
    return;
  }

  // Validate URL
  try {
    new URL(serverUrl);
  } catch {
    showError('Invalid server URL');
    return;
  }

  // Show connecting state
  const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Connecting...';
  submitBtn.disabled = true;

  // Hide auth expired banner if visible
  if (authExpiredBanner) {
    authExpiredBanner.classList.add('hidden');
  }

  try {
    // Send connect message to service worker
    // Auth is handled via browser cookie (NextAuth session)
    await chrome.runtime.sendMessage({
      type: 'CONNECT',
      payload: { serverUrl },
    });

    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check status
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ExtendedConnectionStatus;
    
    if (status.connected) {
      showStatusSection(status);
      await refreshEntertainmentStatus();
    } else {
      showError('Failed to connect. Check server URL and try again.');
    }
  } catch (error) {
    showError('Connection failed');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// Handle open dashboard button
async function handleOpenDashboard(): Promise<void> {
  const stored = await chrome.storage.local.get(['serverUrl']);
  const url = stored.serverUrl || 'http://localhost:3000';
  chrome.tabs.create({ url });
}

// Handle disconnect button
async function handleDisconnect(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
  stopEntertainmentUpdates();
  showLoginSection();
  
  // Update connection info to show disconnected state
  const connInfo = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_INFO' }) as ConnectionInfo;
  updateConnectionInfo(connInfo);
  showReconnectButton();
}

/**
 * Handle manual reconnect button click
 * Requirements: 4.6
 */
async function handleReconnect(): Promise<void> {
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = 'Reconnecting...';
  
  try {
    await chrome.runtime.sendMessage({ type: 'MANUAL_RECONNECT' });
    
    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check status
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ExtendedConnectionStatus;
    const connInfo = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_INFO' }) as ConnectionInfo;
    
    updateConnectionInfo(connInfo);
    
    if (status.connected) {
      showStatusSection(status);
      await refreshEntertainmentStatus();
      hideReconnectButton();
    } else {
      showReconnectingStatus(connInfo);
    }
  } catch (error) {
    showError('Failed to reconnect');
  } finally {
    reconnectBtn.textContent = 'Reconnect';
    reconnectBtn.disabled = false;
  }
}

/**
 * Update connection info display
 * Requirements: 4.5
 */
function updateConnectionInfo(connInfo: ConnectionInfo): void {
  // Update server display
  try {
    const serverUrl = new URL(connInfo.serverUrl);
    connectionServer.textContent = serverUrl.host;
  } catch {
    connectionServer.textContent = connInfo.serverUrl;
  }

  // Show connection info section
  connectionInfoSection.classList.remove('hidden');
}

/**
 * Show reconnecting status
 * Requirements: 4.5
 */
function showReconnectingStatus(connInfo: ConnectionInfo): void {
  if (connInfo.isReconnecting) {
    reconnectInfoRow.style.display = 'flex';
    reconnectInfo.textContent = `Reconnecting (${connInfo.reconnectAttempts}/${connInfo.maxReconnectAttempts})...`;
    reconnectInfo.className = 'connection-value reconnecting';
    hideReconnectButton();
  } else if (connInfo.reconnectAttempts >= connInfo.maxReconnectAttempts) {
    reconnectInfoRow.style.display = 'flex';
    reconnectInfo.textContent = 'Connection failed';
    reconnectInfo.className = 'connection-value failed';
    showReconnectButton();
  } else {
    reconnectInfoRow.style.display = 'none';
  }
}

/**
 * Show reconnect button
 * Requirements: 4.6
 */
function showReconnectButton(): void {
  reconnectBtn.style.display = 'block';
}

/**
 * Hide reconnect button
 */
function hideReconnectButton(): void {
  reconnectBtn.style.display = 'none';
}

// Handle messages from service worker
function handleMessage(message: { type: string; payload?: unknown }): void {
  switch (message.type) {
    case 'CONNECTION_STATUS':
      const { connected } = message.payload as { connected: boolean };
      updateConnectionIndicator(connected);
      if (!connected) {
        stopEntertainmentUpdates();
        // Don't show login section immediately, show reconnecting status
        chrome.runtime.sendMessage({ type: 'GET_CONNECTION_INFO' }).then((connInfo: ConnectionInfo) => {
          updateConnectionInfo(connInfo);
          if (connInfo.isReconnecting) {
            showReconnectingStatus(connInfo);
          } else {
            showLoginSection();
            showReconnectButton();
          }
        });
      } else {
        // Connected - refresh status
        hideReconnectButton();
        reconnectInfoRow.style.display = 'none';
        refreshStatus();
      }
      break;

    case 'STATE_CHANGED':
      const { state } = message.payload as { state: SystemState };
      updateSystemState(state);
      // Refresh entertainment status when state changes
      refreshEntertainmentStatus();
      break;

    case 'POLICY_UPDATED':
      // Refresh status
      refreshStatus();
      refreshEntertainmentStatus();
      break;

    case 'ENTERTAINMENT_STATUS_CHANGED':
      // Handle entertainment status update from service worker
      const entertainmentStatus = message.payload as EntertainmentStatus;
      updateEntertainmentDisplay(entertainmentStatus);
      break;

    case 'AUTH_EXPIRED':
      // Session expired — show banner prompting user to log in on web
      showAuthExpiredBanner();
      break;

    case 'ERROR':
      const { message: errorMsg } = message.payload as { message: string };
      showError(errorMsg);
      // Check if this is a connection error and show reconnect button
      chrome.runtime.sendMessage({ type: 'GET_CONNECTION_INFO' }).then((connInfo: ConnectionInfo) => {
        if (!connInfo.connected && !connInfo.isReconnecting) {
          showReconnectButton();
        }
      });
      break;
  }
}

// Show login section
function showLoginSection(): void {
  loginSection.classList.remove('hidden');
  statusSection.classList.add('hidden');
  updateConnectionIndicator(false);
}

// Show status section
function showStatusSection(status: ExtendedConnectionStatus): void {
  loginSection.classList.add('hidden');
  statusSection.classList.remove('hidden');
  
  // Show connection info section (Requirements: 4.5)
  connectionInfoSection.classList.remove('hidden');
  reconnectInfoRow.style.display = 'none';
  hideReconnectButton();
  
  updateConnectionIndicator(true);
  updateSystemState(status.systemState);
  pomodoroCountEl.textContent = status.pomodoroCount.toString();
  dailyCapEl.textContent = status.dailyCap.toString();
  currentTaskTitleEl.textContent = status.currentTaskTitle || 'No active task';
  
  // Start entertainment status updates
  startEntertainmentUpdates();
}

// Update connection indicator
function updateConnectionIndicator(connected: boolean): void {
  if (connected) {
    connectionStatus.classList.remove('disconnected');
    connectionStatus.classList.add('connected');
    connectionStatus.querySelector('.status-text')!.textContent = 'Connected';
  } else {
    connectionStatus.classList.remove('connected');
    connectionStatus.classList.add('disconnected');
    connectionStatus.querySelector('.status-text')!.textContent = 'Disconnected';
  }
}

// Update system state display
function updateSystemState(state: SystemState): void {
  systemStateEl.textContent = state;
  systemStateEl.className = `state-value ${state}`;
}

// Refresh status from service worker
async function refreshStatus(): Promise<void> {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ExtendedConnectionStatus;
  if (status.connected) {
    showStatusSection(status);
  }
}

// ============================================================================
// Entertainment Mode Functions (Requirements: 5.8, 6.1-6.10)
// ============================================================================

/**
 * Refresh entertainment status from service worker
 * Requirements: 5.8, 6.2, 6.3, 6.10
 */
async function refreshEntertainmentStatus(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_ENTERTAINMENT_STATUS' }) as EntertainmentStatus;
    if (status) {
      updateEntertainmentDisplay(status);
    }
  } catch (error) {
    console.error('[Popup] Failed to get entertainment status:', error);
  }
}

/**
 * Update entertainment display with current status
 * Requirements: 5.8, 6.2, 6.3, 6.10
 */
function updateEntertainmentDisplay(status: EntertainmentStatus): void {
  currentEntertainmentStatus = status;
  
  // Ensure we have valid values with defaults
  const quotaTotal = status.quotaTotal ?? 120;
  const quotaRemaining = status.quotaRemaining ?? quotaTotal;
  const quotaUsed = status.quotaUsed ?? 0;
  
  // Update status text
  if (status.isActive) {
    entertainmentModeStatus.textContent = 'Active';
    entertainmentModeStatus.className = 'entertainment-value active';
  } else if (status.cooldownEndTime && status.cooldownEndTime > Date.now()) {
    entertainmentModeStatus.textContent = 'Cooldown';
    entertainmentModeStatus.className = 'entertainment-value cooldown';
  } else if (quotaRemaining <= 0) {
    entertainmentModeStatus.textContent = 'Quota Exhausted';
    entertainmentModeStatus.className = 'entertainment-value exhausted';
  } else {
    entertainmentModeStatus.textContent = 'Inactive';
    entertainmentModeStatus.className = 'entertainment-value inactive';
  }
  
  // Update quota display (Requirements: 6.2)
  entertainmentQuota.textContent = `${quotaRemaining} / ${quotaTotal} min`;
  if (quotaRemaining <= 0) {
    entertainmentQuota.className = 'entertainment-value exhausted';
  } else if (quotaRemaining <= 15) {
    entertainmentQuota.className = 'entertainment-value cooldown';
  } else {
    entertainmentQuota.className = 'entertainment-value';
  }
  
  // Update cooldown display (Requirements: 6.9, 6.10)
  if (status.cooldownEndTime && status.cooldownEndTime > Date.now()) {
    cooldownRow.style.display = 'flex';
    const cooldownRemaining = Math.ceil((status.cooldownEndTime - Date.now()) / 60000);
    entertainmentCooldown.textContent = `${cooldownRemaining} min`;
  } else {
    cooldownRow.style.display = 'none';
  }
  
  // Update last session display (Requirements: 6.10)
  if (status.lastSessionEndTime) {
    lastSessionRow.style.display = 'flex';
    const lastSessionDate = new Date(status.lastSessionEndTime);
    entertainmentLastSession.textContent = formatTime(lastSessionDate);
  } else {
    lastSessionRow.style.display = 'none';
  }
  
  // Update countdown display (Requirements: 6.3)
  if (status.isActive && status.endTime) {
    entertainmentCountdown.style.display = 'block';
    updateCountdownDisplay(status.endTime);
    
    // Check for warnings (Requirements: 6.5, 6.6)
    checkEntertainmentWarnings(status.endTime);
  } else {
    entertainmentCountdown.style.display = 'none';
    warningShown5Min = false;
    warningShown1Min = false;
  }
  
  // Update button states (Requirements: 6.1, 6.4, 6.7, 6.8, 6.9)
  updateEntertainmentButtons(status);
}

/**
 * Update countdown timer display
 * Requirements: 6.3
 */
function updateCountdownDisplay(endTime: number): void {
  const remaining = Math.max(0, endTime - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  countdownTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Check and show entertainment warnings
 * Requirements: 6.5, 6.6
 */
function checkEntertainmentWarnings(endTime: number): void {
  const remaining = endTime - Date.now();
  const remainingMinutes = remaining / 60000;
  
  // 5 minute warning (Requirements: 6.5)
  if (remainingMinutes <= 5 && remainingMinutes > 1 && !warningShown5Min) {
    warningShown5Min = true;
    showEntertainmentWarning('5 minutes remaining in entertainment mode', false);
    
    // Also show browser notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Entertainment Mode',
      message: '5 minutes remaining',
    });
  }
  
  // 1 minute warning (Requirements: 6.6)
  if (remainingMinutes <= 1 && !warningShown1Min) {
    warningShown1Min = true;
    showEntertainmentWarning('1 minute remaining! Entertainment mode ending soon.', true);
    
    // Also show browser notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Entertainment Mode Ending',
      message: '1 minute remaining!',
      priority: 2,
    });
  }
}

/**
 * Show entertainment warning in popup
 * Requirements: 6.5, 6.6
 */
function showEntertainmentWarning(message: string, isFinal: boolean): void {
  // Remove existing warning
  const existingWarning = document.querySelector('.entertainment-warning');
  if (existingWarning) {
    existingWarning.remove();
  }
  
  const warning = document.createElement('div');
  warning.className = `entertainment-warning${isFinal ? ' final' : ''}`;
  warning.textContent = message;
  document.body.appendChild(warning);
  
  // Remove after 5 seconds
  setTimeout(() => {
    warning.remove();
  }, 5000);
}

/**
 * Update entertainment button states
 * Requirements: 6.1, 6.4, 6.7, 6.8, 6.9
 */
function updateEntertainmentButtons(status: EntertainmentStatus): void {
  if (status.isActive) {
    // Show stop button, hide start button (Requirements: 6.4)
    startEntertainmentBtn.style.display = 'none';
    stopEntertainmentBtn.style.display = 'block';
    entertainmentDisabledMsg.style.display = 'none';
  } else {
    // Show start button, hide stop button
    startEntertainmentBtn.style.display = 'block';
    stopEntertainmentBtn.style.display = 'none';
    
    // Check if can start (Requirements: 6.1, 6.7, 6.8, 6.9)
    if (status.canStart) {
      startEntertainmentBtn.disabled = false;
      entertainmentDisabledMsg.style.display = 'none';
    } else {
      startEntertainmentBtn.disabled = true;
      entertainmentDisabledMsg.style.display = 'block';
      
      // Set disabled reason message
      switch (status.cannotStartReason) {
        case 'within_work_time':
          // Requirements: 6.7
          entertainmentDisabledReason.textContent = '仅在非工作时间可用';
          break;
        case 'quota_exhausted':
          // Requirements: 6.8
          entertainmentDisabledReason.textContent = '今日配额已用完';
          break;
        case 'cooldown_active':
          // Requirements: 6.9
          const cooldownRemaining = status.cooldownEndTime 
            ? Math.ceil((status.cooldownEndTime - Date.now()) / 60000)
            : 0;
          entertainmentDisabledReason.textContent = `冷却中，还需等待 ${cooldownRemaining} 分钟`;
          break;
        case 'session_already_active':
          entertainmentDisabledReason.textContent = 'Entertainment mode is already active';
          break;
        default:
          entertainmentDisabledReason.textContent = 'Cannot start entertainment mode';
      }
    }
  }
}

/**
 * Handle start entertainment button click
 * Requirements: 6.1
 */
async function handleStartEntertainment(): Promise<void> {
  startEntertainmentBtn.disabled = true;
  startEntertainmentBtn.textContent = 'Starting...';
  
  try {
    const result = await chrome.runtime.sendMessage({ type: 'START_ENTERTAINMENT' }) as {
      success: boolean;
      error?: string;
      sessionId?: string;
      endTime?: number;
    };
    
    if (result.success) {
      // Refresh status to show active state
      await refreshEntertainmentStatus();
    } else {
      showError(result.error || 'Failed to start entertainment mode');
    }
  } catch (error) {
    showError('Failed to start entertainment mode');
  } finally {
    startEntertainmentBtn.textContent = 'Start Entertainment Mode';
    // Button state will be updated by refreshEntertainmentStatus
  }
}

/**
 * Handle stop entertainment button click
 * Requirements: 6.4
 */
async function handleStopEntertainment(): Promise<void> {
  stopEntertainmentBtn.disabled = true;
  stopEntertainmentBtn.textContent = 'Stopping...';
  
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_ENTERTAINMENT' });
    // Refresh status to show inactive state
    await refreshEntertainmentStatus();
  } catch (error) {
    showError('Failed to stop entertainment mode');
  } finally {
    stopEntertainmentBtn.textContent = 'Stop Entertainment Mode';
    stopEntertainmentBtn.disabled = false;
  }
}

/**
 * Start periodic entertainment status updates
 */
function startEntertainmentUpdates(): void {
  // Clear any existing interval
  stopEntertainmentUpdates();
  
  // Update every second for countdown accuracy
  entertainmentUpdateInterval = window.setInterval(() => {
    if (currentEntertainmentStatus?.isActive && currentEntertainmentStatus.endTime) {
      updateCountdownDisplay(currentEntertainmentStatus.endTime);
      checkEntertainmentWarnings(currentEntertainmentStatus.endTime);
      
      // Check if entertainment mode should have ended
      if (Date.now() >= currentEntertainmentStatus.endTime) {
        refreshEntertainmentStatus();
      }
    }
  }, 1000);
  
  // Also refresh full status every 10 seconds
  window.setInterval(() => {
    refreshEntertainmentStatus();
  }, 10000);
}

/**
 * Stop entertainment status updates
 */
function stopEntertainmentUpdates(): void {
  if (entertainmentUpdateInterval !== null) {
    window.clearInterval(entertainmentUpdateInterval);
    entertainmentUpdateInterval = null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format time for display
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Show auth expired banner prompting user to log in on web
 * Requirements: 4.4.2 — session expiry handling
 */
function showAuthExpiredBanner(): void {
  if (authExpiredBanner) {
    authExpiredBanner.classList.remove('hidden');
  }
}

// Show error message
function showError(message: string): void {
  // Create error toast
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    right: 16px;
    background: #ef4444;
    color: white;
    padding: 12px;
    border-radius: 8px;
    font-size: 13px;
    text-align: center;
    animation: slideUp 0.3s ease-out;
  `;
  toast.textContent = message;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
