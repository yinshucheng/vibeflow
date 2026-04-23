const urlParams = new URLSearchParams(window.location.search);
const blockedUrl = urlParams.get('blocked');
if (blockedUrl) {
  document.getElementById('blocked-site-info').classList.remove('hidden');
  document.getElementById('blocked-url').textContent = blockedUrl;
}

async function loadStatus() {
  try {
    const policy = await chrome.runtime.sendMessage({ type: 'GET_POLICY' });
    const modeEl = document.getElementById('enforcement-mode');
    if (policy && policy.enforcementMode) {
      modeEl.textContent = policy.enforcementMode === 'strict' ? 'Strict 🔒' : 'Gentle 🌿';
    } else {
      modeEl.textContent = 'Focus Mode';
    }
  } catch (error) {
    console.error('Failed to load status:', error);
  }
}

document.getElementById('btn-go-back').addEventListener('click', () => {
  if (history.length > 1) { history.back(); } else { window.close(); }
});

document.getElementById('btn-open-dashboard').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['serverUrl']);
  const url = result.serverUrl || 'http://localhost:3000';
  const policy = await chrome.runtime.sendMessage({ type: 'GET_POLICY' });
  const shouldReplace = policy?.browserRedirectReplace !== false;
  if (shouldReplace) { window.location.href = url; } else { chrome.tabs.create({ url }); }
});

document.getElementById('btn-start-pomodoro').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['serverUrl']);
  const url = result.serverUrl || 'http://localhost:3000';
  window.location.href = url + '/pomodoro';
});

loadStatus();
