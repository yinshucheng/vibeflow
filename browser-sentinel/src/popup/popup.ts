// Extension popup script

import type { SystemState, ConnectionStatus } from '../types/index.js';

// DOM Elements
const loginSection = document.getElementById('login-section') as HTMLElement;
const statusSection = document.getElementById('status-section') as HTMLElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const userEmailInput = document.getElementById('user-email') as HTMLInputElement;
const connectionStatus = document.getElementById('connection-status') as HTMLElement;
const systemStateEl = document.getElementById('system-state') as HTMLElement;
const pomodoroCountEl = document.getElementById('pomodoro-count') as HTMLElement;
const dailyCapEl = document.getElementById('daily-cap') as HTMLElement;
const currentTaskTitleEl = document.getElementById('current-task-title') as HTMLElement;
const openDashboardBtn = document.getElementById('open-dashboard') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;

// Initialize popup
async function initialize(): Promise<void> {
  // Load stored settings
  const stored = await chrome.storage.local.get(['serverUrl', 'userEmail', 'isConnected']);
  
  if (stored.serverUrl) {
    serverUrlInput.value = stored.serverUrl;
  } else {
    serverUrlInput.value = 'http://localhost:3000';
  }
  
  if (stored.userEmail) {
    userEmailInput.value = stored.userEmail;
  }

  // Get current status from service worker
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ConnectionStatus;
  
  if (status.connected) {
    showStatusSection(status);
  } else {
    showLoginSection();
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
}

// Handle login form submission
async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();
  
  const serverUrl = serverUrlInput.value.trim();
  const userEmail = userEmailInput.value.trim();
  
  if (!serverUrl || !userEmail) {
    showError('Please fill in all fields');
    return;
  }

  // Validate URL
  try {
    new URL(serverUrl);
  } catch {
    showError('Invalid server URL');
    return;
  }

  // Validate email
  if (!isValidEmail(userEmail)) {
    showError('Invalid email address');
    return;
  }

  // Show connecting state
  const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Connecting...';
  submitBtn.disabled = true;

  try {
    // Send connect message to service worker
    await chrome.runtime.sendMessage({
      type: 'CONNECT',
      payload: { serverUrl, userEmail },
    });

    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Check status
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ConnectionStatus;
    
    if (status.connected) {
      showStatusSection(status);
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
  showLoginSection();
}

// Handle messages from service worker
function handleMessage(message: { type: string; payload?: unknown }): void {
  switch (message.type) {
    case 'CONNECTION_STATUS':
      const { connected } = message.payload as { connected: boolean };
      updateConnectionIndicator(connected);
      if (!connected) {
        showLoginSection();
      }
      break;

    case 'STATE_CHANGED':
      const { state } = message.payload as { state: SystemState };
      updateSystemState(state);
      break;

    case 'POLICY_UPDATED':
      // Refresh status
      refreshStatus();
      break;

    case 'ERROR':
      const { message: errorMsg } = message.payload as { message: string };
      showError(errorMsg);
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
function showStatusSection(status: ConnectionStatus): void {
  loginSection.classList.add('hidden');
  statusSection.classList.remove('hidden');
  
  updateConnectionIndicator(true);
  updateSystemState(status.systemState);
  pomodoroCountEl.textContent = status.pomodoroCount.toString();
  dailyCapEl.textContent = status.dailyCap.toString();
  currentTaskTitleEl.textContent = status.currentTaskTitle || 'No active task';
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
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as ConnectionStatus;
  if (status.connected) {
    showStatusSection(status);
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

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
