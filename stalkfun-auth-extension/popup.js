const $ = (s) => document.getElementById(s);

const STALKFUN_DOMAIN = 'https://stalk.fun';
const RELEVANT_COOKIE_NAMES = new Set([
  'privy-session', 'privy-token', 'privy-id-token',
  'sidebar_state', 'cf_clearance',
]);

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['serverUrl', 'apiKey', 'lastSync']);
  if (stored.serverUrl) $('serverUrl').value = stored.serverUrl;
  if (stored.apiKey) $('apiKey').value = stored.apiKey;
  if (stored.lastSync) $('meta').textContent = `Last sync: ${stored.lastSync}`;

  $('syncBtn').addEventListener('click', handleSync);
  $('saveBtn').addEventListener('click', handleSave);
});

async function handleSave() {
  const serverUrl = $('serverUrl').value.trim().replace(/\/+$/, '');
  const apiKey = $('apiKey').value.trim();
  if (!serverUrl || !apiKey) {
    showStatus('err', 'Fill in both Server URL and API Key');
    return;
  }
  await chrome.storage.local.set({ serverUrl, apiKey });
  showStatus('ok', 'Settings saved');
}

async function handleSync() {
  const serverUrl = $('serverUrl').value.trim().replace(/\/+$/, '');
  const apiKey = $('apiKey').value.trim();
  if (!serverUrl || !apiKey) {
    showStatus('err', 'Fill in Server URL and API Key first');
    return;
  }

  $('syncBtn').disabled = true;
  $('syncBtn').textContent = 'Grabbing cookies...';
  showStatus('info', 'Reading stalk.fun cookies...');

  try {
    const cookies = await chrome.cookies.getAll({ domain: 'stalk.fun' });
    if (!cookies.length) {
      showStatus('err', 'No stalk.fun cookies found. Log in to stalk.fun first.');
      return;
    }

    // Also get .stalk.fun (subdomain cookies)
    const dotCookies = await chrome.cookies.getAll({ domain: '.stalk.fun' });
    const allCookies = deduplicateCookies([...cookies, ...dotCookies]);

    const privyToken = allCookies.find(c => c.name === 'privy-token');
    if (!privyToken) {
      showStatus('err', 'No privy-token cookie found. Are you logged into stalk.fun?');
      return;
    }

    // Build the full cookie string (same format as browser sends)
    const cookieString = allCookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    $('syncBtn').textContent = 'Pushing to server...';
    showStatus('info', 'Sending to server...');

    const resp = await fetch(`${serverUrl}/api/admin/auth-reload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Reload-Key': apiKey,
      },
      body: JSON.stringify({ cookies: cookieString }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      showStatus('err', data.error || `Server error: ${resp.status}`);
      $('statusDot').className = 'dot err';
      return;
    }

    const now = new Date().toLocaleTimeString();
    await chrome.storage.local.set({ serverUrl, apiKey, lastSync: now });
    $('meta').textContent = `Last sync: ${now}`;
    $('statusDot').className = 'dot ok';
    showStatus('ok', `Auth refreshed! Mode: ${data.authMode}, expires: ${new Date(data.expiresAt).toLocaleTimeString()}`);
  } catch (e) {
    showStatus('err', `Network error: ${e.message}`);
    $('statusDot').className = 'dot err';
  } finally {
    $('syncBtn').disabled = false;
    $('syncBtn').textContent = 'Grab Cookies & Push to Server';
  }
}

function deduplicateCookies(cookies) {
  const seen = new Map();
  for (const c of cookies) {
    const existing = seen.get(c.name);
    if (!existing || c.path.length > existing.path.length) {
      seen.set(c.name, c);
    }
  }
  return Array.from(seen.values());
}

function showStatus(type, msg) {
  const el = $('status');
  el.className = `status ${type}`;
  el.textContent = msg;
}
