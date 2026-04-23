document.getElementById('btn-start-pomodoro').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['serverUrl']);
  const url = result.serverUrl || 'http://localhost:3000';
  window.location.href = url + '/pomodoro';
});

document.getElementById('btn-open-dashboard').addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['serverUrl']);
  const url = result.serverUrl || 'http://localhost:3000';
  window.location.href = url;
});
