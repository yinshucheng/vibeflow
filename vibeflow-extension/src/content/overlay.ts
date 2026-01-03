// Content script for soft intervention overlay and toast notifications

interface OverlayMessage {
  type: 'SHOW_OVERLAY' | 'SHOW_TOAST' | 'HIDE_OVERLAY';
  payload?: {
    type?: 'soft_block' | 'screensaver' | 'gentle_warning' | 'login_reminder' | 'idle_alert';
    url?: string;
    msg?: string;
    toastType?: 'info' | 'warning';
    skipTokensRemaining?: number;
    countdownSeconds?: number;
    dashboardUrl?: string;
    blockCount?: number;
    requireLogin?: boolean;
    idleSeconds?: number;
    threshold?: number;
  };
}

// Overlay container element
let overlayContainer: HTMLDivElement | null = null;
let toastContainer: HTMLDivElement | null = null;
let currentQuestionId: string | null = null;

// Initialize content script
function initialize(): void {
  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message: OverlayMessage, _sender, sendResponse) => {
    handleMessage(message);
    sendResponse({ received: true });
    return true;
  });

  console.log('[ContentScript] Initialized');
}

// Handle incoming messages
function handleMessage(message: OverlayMessage): void {
  switch (message.type) {
    case 'SHOW_OVERLAY':
      if (message.payload?.type === 'soft_block') {
        showSoftBlockOverlay(message.payload.url || window.location.href);
      } else if (message.payload?.type === 'screensaver') {
        redirectToScreensaver();
      } else if (message.payload?.type === 'gentle_warning') {
        // Requirements 4.6, 6.7: Gentle mode warning with countdown
        showGentleWarningOverlay(
          message.payload.url || window.location.href,
          message.payload.skipTokensRemaining || 0,
          message.payload.countdownSeconds || 10,
          message.payload.dashboardUrl || 'http://localhost:3000'
        );
      } else if (message.payload?.type === 'login_reminder') {
        // Requirements 6.4, 6.5: Login reminder for unauthenticated users
        showLoginReminderOverlay(
          message.payload.url || window.location.href,
          message.payload.blockCount || 1,
          message.payload.requireLogin || false,
          message.payload.dashboardUrl || 'http://localhost:3000'
        );
      } else if (message.payload?.type === 'idle_alert') {
        showIdleAlertOverlay(message.payload);
      }
      break;

    case 'SHOW_TOAST':
      if (message.payload?.msg) {
        showToast(message.payload.msg, message.payload.toastType || 'info');
      }
      break;

    case 'HIDE_OVERLAY':
      hideOverlay();
      break;
  }
}

// Create overlay container if not exists
function createOverlayContainer(): HTMLDivElement {
  if (overlayContainer) return overlayContainer;

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'vibeflow-overlay-container';
  overlayContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  document.body.appendChild(overlayContainer);
  return overlayContainer;
}

// Create toast container if not exists
function createToastContainer(): HTMLDivElement {
  if (toastContainer) return toastContainer;

  toastContainer = document.createElement('div');
  toastContainer.id = 'vibeflow-toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  document.body.appendChild(toastContainer);
  return toastContainer;
}

// Show soft block overlay with question
function showSoftBlockOverlay(url: string): void {
  const container = createOverlayContainer();
  currentQuestionId = `question_${Date.now()}`;

  const hostname = new URL(url).hostname;

  container.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 32px;
      max-width: 450px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    ">
      <style>
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .vf-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 8px;
        }
        .vf-btn-primary {
          background: #22c55e;
          color: white;
        }
        .vf-btn-primary:hover {
          background: #16a34a;
        }
        .vf-btn-danger {
          background: #ef4444;
          color: white;
        }
        .vf-btn-danger:hover {
          background: #dc2626;
        }
      </style>
      
      <div style="font-size: 48px; margin-bottom: 16px;">🤔</div>
      
      <h2 style="
        color: #e4e4e7;
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 12px 0;
      ">Focus Check</h2>
      
      <p style="
        color: #a1a1aa;
        font-size: 14px;
        margin: 0 0 8px 0;
      ">You're trying to visit:</p>
      
      <p style="
        color: #6366f1;
        font-size: 16px;
        font-weight: 500;
        margin: 0 0 20px 0;
        word-break: break-all;
      ">${hostname}</p>
      
      <p style="
        color: #e4e4e7;
        font-size: 16px;
        margin: 0 0 24px 0;
      ">Is this related to your current task?</p>
      
      <div style="display: flex; justify-content: center;">
        <button class="vf-btn vf-btn-primary" id="vf-yes-btn">
          ✓ Yes, it's work-related
        </button>
        <button class="vf-btn vf-btn-danger" id="vf-no-btn">
          ✗ No, take me back
        </button>
      </div>
      
      <p style="
        color: #71717a;
        font-size: 12px;
        margin: 20px 0 0 0;
      ">Auto-redirecting in <span id="vf-countdown">10</span> seconds...</p>
    </div>
  `;

  container.style.display = 'flex';

  // Setup button handlers
  const yesBtn = container.querySelector('#vf-yes-btn') as HTMLButtonElement;
  const noBtn = container.querySelector('#vf-no-btn') as HTMLButtonElement;
  const countdownEl = container.querySelector('#vf-countdown') as HTMLSpanElement;

  let countdown = 10;
  const countdownTimer = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown.toString();
    if (countdown <= 0) {
      clearInterval(countdownTimer);
      handleResponse(false, url);
    }
  }, 1000);

  yesBtn?.addEventListener('click', () => {
    clearInterval(countdownTimer);
    handleResponse(true, url);
  });

  noBtn?.addEventListener('click', () => {
    clearInterval(countdownTimer);
    handleResponse(false, url);
  });
}

// Handle user response to soft block
async function handleResponse(isTaskRelated: boolean, url: string): Promise<void> {
  hideOverlay();

  if (isTaskRelated) {
    // Add to session whitelist
    await chrome.runtime.sendMessage({
      type: 'ADD_SESSION_WHITELIST',
      payload: { url },
    });
    showToast('Site allowed for this session', 'info');
  } else {
    // Go back or redirect to screensaver
    if (window.history.length > 1) {
      window.history.back();
    } else {
      redirectToScreensaver();
    }
  }

  // Send response to server
  if (currentQuestionId) {
    await chrome.runtime.sendMessage({
      type: 'USER_RESPONSE',
      payload: {
        questionId: currentQuestionId,
        response: isTaskRelated,
      },
    });
    currentQuestionId = null;
  }
}

/**
 * Show gentle mode warning overlay with countdown
 * Requirements: 4.6, 6.7
 */
function showGentleWarningOverlay(
  url: string,
  skipTokensRemaining: number,
  countdownSeconds: number,
  dashboardUrl: string
): void {
  const container = createOverlayContainer();
  currentQuestionId = `gentle_warning_${Date.now()}`;

  const hostname = new URL(url).hostname;
  const canProceed = skipTokensRemaining > 0;

  container.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 32px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    ">
      <style>
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .vf-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 8px;
        }
        .vf-btn-primary { background: #22c55e; color: white; }
        .vf-btn-primary:hover { background: #16a34a; }
        .vf-btn-warning { background: #f59e0b; color: white; }
        .vf-btn-warning:hover { background: #d97706; }
        .vf-btn-warning:disabled { background: #6b7280; cursor: not-allowed; }
        .vf-btn-danger { background: #ef4444; color: white; }
        .vf-btn-danger:hover { background: #dc2626; }
        .vf-countdown-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 4px solid rgba(239, 68, 68, 0.3);
          border-top-color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .vf-token-badge {
          display: inline-block;
          background: ${canProceed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
          color: ${canProceed ? '#22c55e' : '#ef4444'};
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
      </style>
      
      <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
      
      <h2 style="color: #e4e4e7; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">
        Focus Check
      </h2>
      
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 8px 0;">
        You're trying to visit a blocked site:
      </p>
      
      <p style="color: #f59e0b; font-size: 16px; font-weight: 500; margin: 0 0 16px 0; word-break: break-all;">
        ${hostname}
      </p>
      
      <div class="vf-countdown-ring">
        <span id="vf-countdown" style="color: #ef4444; font-size: 24px; font-weight: 700;">${countdownSeconds}</span>
      </div>
      
      <p style="color: #71717a; font-size: 13px; margin: 0 0 16px 0;">
        Auto-redirecting in <span id="vf-countdown-text">${countdownSeconds}</span> seconds...
      </p>
      
      <div style="margin-bottom: 20px;">
        <span class="vf-token-badge">
          ${canProceed ? `🎟️ ${skipTokensRemaining} skip token${skipTokensRemaining !== 1 ? 's' : ''} remaining` : '❌ No skip tokens remaining'}
        </span>
      </div>
      
      <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 8px;">
        <button class="vf-btn vf-btn-primary" id="vf-start-pomodoro-btn">
          🍅 Start Pomodoro
        </button>
        <button class="vf-btn vf-btn-warning" id="vf-continue-btn" ${!canProceed ? 'disabled' : ''}>
          ${canProceed ? '⏭️ Continue (use token)' : '⏭️ No tokens left'}
        </button>
        <button class="vf-btn vf-btn-danger" id="vf-return-btn">
          ← Return
        </button>
      </div>
    </div>
  `;

  container.style.display = 'flex';

  // Setup button handlers
  const startPomodoroBtn = container.querySelector('#vf-start-pomodoro-btn') as HTMLButtonElement;
  const continueBtn = container.querySelector('#vf-continue-btn') as HTMLButtonElement;
  const returnBtn = container.querySelector('#vf-return-btn') as HTMLButtonElement;
  const countdownEl = container.querySelector('#vf-countdown') as HTMLSpanElement;
  const countdownTextEl = container.querySelector('#vf-countdown-text') as HTMLSpanElement;

  let countdown = countdownSeconds;
  const countdownTimer = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown.toString();
    if (countdownTextEl) countdownTextEl.textContent = countdown.toString();
    if (countdown <= 0) {
      clearInterval(countdownTimer);
      handleGentleWarningReturn(url, dashboardUrl);
    }
  }, 1000);

  startPomodoroBtn?.addEventListener('click', () => {
    clearInterval(countdownTimer);
    hideOverlay();
    window.location.href = `${dashboardUrl}/pomodoro`;
  });

  continueBtn?.addEventListener('click', async () => {
    if (!canProceed) return;
    clearInterval(countdownTimer);
    await handleGentleWarningContinue(url);
  });

  returnBtn?.addEventListener('click', () => {
    clearInterval(countdownTimer);
    handleGentleWarningReturn(url, dashboardUrl);
  });
}

/**
 * Handle continue action in gentle warning (consume skip token)
 * Requirements: 4.6, 5.2
 */
async function handleGentleWarningContinue(url: string): Promise<void> {
  // Consume skip token
  const result = await chrome.runtime.sendMessage({
    type: 'CONSUME_SKIP_TOKEN',
  });

  if (result.success) {
    // Add to session whitelist
    await chrome.runtime.sendMessage({
      type: 'ADD_SESSION_WHITELIST',
      payload: { url },
    });
    hideOverlay();
    showToast(`Site allowed. ${result.remaining} token${result.remaining !== 1 ? 's' : ''} remaining.`, 'info');
  } else {
    showToast('No skip tokens remaining!', 'warning');
  }
}

/**
 * Handle return action in gentle warning
 */
function handleGentleWarningReturn(url: string, dashboardUrl: string): void {
  hideOverlay();
  
  // Record the block event
  chrome.runtime.sendMessage({
    type: 'USER_RESPONSE',
    payload: {
      questionId: currentQuestionId,
      response: false,
      url,
    },
  });
  
  // Go back or redirect to dashboard
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = dashboardUrl;
  }
}

/**
 * Show login reminder overlay for unauthenticated users
 * Requirements: 6.4, 6.5
 */
function showLoginReminderOverlay(
  url: string,
  blockCount: number,
  requireLogin: boolean,
  dashboardUrl: string
): void {
  const container = createOverlayContainer();
  const hostname = new URL(url).hostname;

  container.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 32px;
      max-width: 450px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    ">
      <style>
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .vf-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 8px;
        }
        .vf-btn-primary { background: #6366f1; color: white; }
        .vf-btn-primary:hover { background: #4f46e5; }
        .vf-btn-secondary { background: rgba(255, 255, 255, 0.1); color: #e4e4e7; }
        .vf-btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
      </style>
      
      <div style="font-size: 48px; margin-bottom: 16px;">${requireLogin ? '🔐' : '👋'}</div>
      
      <h2 style="color: #e4e4e7; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">
        ${requireLogin ? 'Login Required' : 'Welcome to VibeFlow'}
      </h2>
      
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 16px 0;">
        ${requireLogin 
          ? `You've tried to access blocked sites ${blockCount} times. Please log in to continue browsing.`
          : 'This site is on your focus blocklist. Log in to VibeFlow to manage your focus settings.'
        }
      </p>
      
      <p style="color: #f59e0b; font-size: 14px; margin: 0 0 20px 0; word-break: break-all;">
        Blocked: ${hostname}
      </p>
      
      <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 8px;">
        <button class="vf-btn vf-btn-primary" id="vf-login-btn">
          🔑 Log in to VibeFlow
        </button>
        ${!requireLogin ? `
          <button class="vf-btn vf-btn-secondary" id="vf-dismiss-btn">
            Dismiss
          </button>
        ` : ''}
      </div>
      
      ${requireLogin ? `
        <p style="color: #71717a; font-size: 12px; margin: 16px 0 0 0;">
          Login is required to continue using the browser during focus hours.
        </p>
      ` : ''}
    </div>
  `;

  container.style.display = 'flex';

  // Setup button handlers
  const loginBtn = container.querySelector('#vf-login-btn') as HTMLButtonElement;
  const dismissBtn = container.querySelector('#vf-dismiss-btn') as HTMLButtonElement;

  loginBtn?.addEventListener('click', () => {
    hideOverlay();
    window.location.href = dashboardUrl;
  });

  dismissBtn?.addEventListener('click', () => {
    if (!requireLogin) {
      hideOverlay();
      if (window.history.length > 1) {
        window.history.back();
      }
    }
  });

  // If login is required, prevent dismissal
  if (requireLogin) {
    container.addEventListener('click', (e) => {
      if (e.target === container) {
        showToast('Please log in to continue', 'warning');
      }
    });
  }
}

/**
 * Show idle alert overlay
 */
function showIdleAlertOverlay(payload: OverlayMessage['payload']): void {
  const container = createOverlayContainer();
  const idleSeconds = payload?.idleSeconds || 0;
  const idleMinutes = Math.floor(idleSeconds / 60);

  container.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.3s ease-out;
    ">
      <style>
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .vf-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin: 0 8px;
        }
        .vf-btn-primary { background: #22c55e; color: white; }
        .vf-btn-primary:hover { background: #16a34a; }
      </style>
      
      <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
      
      <h2 style="color: #e4e4e7; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">
        Time to Focus!
      </h2>
      
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 20px 0;">
        You've been idle for ${idleMinutes > 0 ? `${idleMinutes} minute${idleMinutes !== 1 ? 's' : ''}` : `${idleSeconds} seconds`}.
        Start a pomodoro to get back on track!
      </p>
      
      <button class="vf-btn vf-btn-primary" id="vf-start-btn">
        🍅 Start Pomodoro
      </button>
    </div>
  `;

  container.style.display = 'flex';

  const startBtn = container.querySelector('#vf-start-btn') as HTMLButtonElement;
  startBtn?.addEventListener('click', async () => {
    hideOverlay();
    const result = await chrome.storage.local.get(['serverUrl']);
    const url = result.serverUrl || 'http://localhost:3000';
    window.location.href = `${url}/pomodoro`;
  });
}

// Redirect to screensaver page
function redirectToScreensaver(): void {
  const screensaverUrl = chrome.runtime.getURL('screensaver.html');
  window.location.href = screensaverUrl;
}

// Hide overlay
function hideOverlay(): void {
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
    overlayContainer.innerHTML = '';
  }
}

// Show toast notification
function showToast(message: string, type: 'info' | 'warning' = 'info'): void {
  const container = createToastContainer();

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${type === 'warning' ? '#f59e0b' : '#6366f1'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    animation: toastSlideIn 0.3s ease-out;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const icon = type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toastSlideOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(100%); }
    }
  `;
  document.head.appendChild(style);

  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
