// Email Code Reader - background service worker
// Fetches Gmail messages and extracts verification codes

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

function getAuthToken(options = {}) {
  const interactive = options.interactive !== false;
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(token);
    });
  });
}

function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      } else {
        resolve();
      }
    });
  });
}

function decodeBase64Url(data) {
  if (!data) return '';
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}

function getBodyFromPayload(payload) {
  let text = '';
  if (payload.body && payload.body.data) {
    text = decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        text = text || decodeBase64Url(part.body.data);
        break;
      }
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = decodeBase64Url(part.body.data);
        text = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return text;
}

// Patterns for common verification/OTP codes (order matters: more specific first)
const CODE_PATTERNS = [
  /\b(?:code|verification code|one-time code|OTP|one-time password|passcode|pin)[\s:]*[:\-]?\s*([A-Z0-9]{4,8})\b/i,
  /\b(?:code|code is)[\s:]*[:\-]?\s*([0-9]{4,8})\b/i,
  /\b([0-9]{6})\b(?!\d)/,                    // standalone 6-digit
  /\b([0-9]{4})\b(?!\d)/,                    // standalone 4-digit
  /\b([0-9]{8})\b(?!\d)/,                    // standalone 8-digit
  /(?:^|\s)([0-9]{4}[\s\-]?[0-9]{4})(?:\s|$)/, // 4-4 with optional space/dash
  /\b([A-Z0-9]{6})\b(?!\w)/,                 // 6-char alphanumeric
];

function extractCodes(text) {
  if (!text || typeof text !== 'string') return [];
  const codes = new Set();
  const normalized = text.replace(/\s+/g, ' ');
  for (const re of CODE_PATTERNS) {
    let m;
    const r = new RegExp(re.source, 'gi');
    while ((m = r.exec(normalized)) !== null) {
      const code = m[1].replace(/[\s\-]/g, '').trim();
      if (code.length >= 4 && code.length <= 8 && /^[A-Z0-9]+$/i.test(code)) {
        codes.add(code);
      }
    }
  }
  return Array.from(codes);
}

function getHeader(headers, name) {
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

async function fetchMessage(token, id) {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
  return res.json();
}

async function fetchRecentMessages(token, maxResults = 20) {
  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${maxResults}&q=is:unread OR newer_than:1d`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail API list: ${listRes.status}`);
  const list = await listRes.json();
  const messages = list.messages || [];
  return messages;
}

async function extractCodesFromInbox(token) {
  const messages = await fetchRecentMessages(token);
  const results = [];
  const seenCodes = new Set();

  for (const msg of messages.slice(0, 15)) {
    try {
      const full = await fetchMessage(token, msg.id);
      const payload = full.payload || {};
      const body = getBodyFromPayload(payload);
      const headers = payload.headers || [];
      const subject = getHeader(headers, 'From');
      const from = getHeader(headers, 'From');
      const date = getHeader(headers, 'Date');
      const snippet = full.snippet || '';

      const text = body || snippet;
      const codes = extractCodes(text);
      for (const code of codes) {
        if (seenCodes.has(code)) continue;
        seenCodes.add(code);
        results.push({
          code,
          from: from.replace(/<[^>]+>/, '').trim(),
          subject: getHeader(headers, 'Subject'),
          date,
          id: msg.id,
        });
      }
    } catch (e) {
      console.warn('Failed to parse message', msg.id, e);
    }
  }

  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  return results.slice(0, 10);
}

const POLL_ALARM_NAME = 'emailCodePoll';
const POLL_INTERVAL_MINUTES = 1;

function saveCodesAndBadge(codes) {
  const list = Array.isArray(codes) ? codes : [];
  chrome.storage.local.set({ cachedCodes: list, cachedAt: Date.now() });
  if (list.length > 0) {
    chrome.action.setBadgeText({ text: String(list.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#0071e3' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function schedulePolling() {
  chrome.alarms.create(POLL_ALARM_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
    delayInMinutes: 0.1,
  });
}

function clearPolling() {
  chrome.alarms.clear(POLL_ALARM_NAME);
  chrome.action.setBadgeText({ text: '' });
}

async function fetchAndCacheCodes(interactive = false) {
  const token = await getAuthToken({ interactive });
  const codes = await extractCodesFromInbox(token);
  saveCodesAndBadge(codes);
  return codes;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== POLL_ALARM_NAME) return;
  getAuthToken({ interactive: false })
    .then((token) => extractCodesFromInbox(token))
    .then(saveCodesAndBadge)
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getCodes') {
    fetchAndCacheCodes(true)
      .then((codes) => {
        schedulePolling();
        return codes;
      })
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Failed to fetch codes' }));
    return true;
  }
  if (request.action === 'signOut') {
    clearPolling();
    clearAuthToken()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'checkAuth') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      sendResponse({ signedIn: !!token });
    });
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) schedulePolling();
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) schedulePolling();
  });
});
