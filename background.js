// Email Reader - background service worker
// Fetches Gmail messages and extracts verification codes

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

function getStored(name) {
  return new Promise((resolve) => {
    chrome.storage.local.get([name], (r) => resolve(r[name]));
  });
}

function setStored(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function getStoredWebCreds() {
  const clientId = await getStored('webClientId');
  const clientSecret = await getStored('webClientSecret');
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

async function webAuthGetAccessToken(interactive) {
  const creds = await getStoredWebCreds();
  if (!creds) return null;
  const { clientId, clientSecret } = creds;
  const redirectUri = chrome.identity.getRedirectURL();
  const storedAccess = await getStored('webAccessToken');
  const storedExpiry = await getStored('webTokenExpiry');
  const storedRefresh = await getStored('webRefreshToken');
  if (storedAccess && storedExpiry && Date.now() < storedExpiry - 60000) {
    return storedAccess;
  }
  if (storedRefresh) {
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: storedRefresh,
          grant_type: 'refresh_token',
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        await setStored({
          webAccessToken: data.access_token,
          webTokenExpiry: Date.now() + (data.expires_in || 3600) * 1000,
        });
        return data.access_token;
      }
    } catch (_) {}
  }
  if (!interactive) return null;
  const state = Math.random().toString(36).slice(2);
  const authUrl =
    GOOGLE_AUTH_URL +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code&scope=' + encodeURIComponent(GMAIL_SCOPE) +
    '&access_type=offline&prompt=consent&state=' + encodeURIComponent(state);
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const u = new URL(callbackUrl);
        const code = u.searchParams.get('code');
        if (!code) {
          reject(new Error('No authorization code in response'));
          return;
        }
        try {
          const res = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }).toString(),
          });
          const data = await res.json();
          if (data.error) {
            reject(new Error(data.error_description || data.error));
            return;
          }
          await setStored({
            webAccessToken: data.access_token,
            webTokenExpiry: Date.now() + (data.expires_in || 3600) * 1000,
            webRefreshToken: data.refresh_token || (await getStored('webRefreshToken')),
          });
          resolve(data.access_token);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

async function getAccessToken(interactive = false) {
  const creds = await getStoredWebCreds();
  if (creds) {
    try {
      const token = await webAuthGetAccessToken(interactive);
      if (token) return token;
    } catch (e) {
      throw e;
    }
  }
  return getAuthToken({ interactive });
}

function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      ['webAccessToken', 'webTokenExpiry', 'webRefreshToken'],
      () => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            chrome.identity.removeCachedAuthToken({ token }, resolve);
          } else {
            resolve();
          }
        });
      }
    );
  });
}

function getHeader(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function decodeBase64Url(data) {
  if (!data) return '';
  const base64 = String(data).replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}

function getBodyFromPayload(payload) {
  let text = '';
  let html = '';
  const decode = (data) => decodeBase64Url(data);
  if (payload.body && payload.body.data) {
    const raw = decode(payload.body.data);
    if ((payload.mimeType || '').toLowerCase() === 'text/html') {
      html = raw;
      text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      text = raw;
    }
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        text = text || decode(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const partHtml = decode(part.body.data);
        html = html || partHtml;
        text = text || partHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return { text: text || '', html: html || null };
}

async function fetchMessageFull(token, id) {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
  return res.json();
}

async function getEmailContent(messageId) {
  const token = await getAccessToken(false);
  if (!token) throw new Error('Not signed in');
  const full = await fetchMessageFull(token, messageId);
  const payload = full.payload || {};
  const headers = payload.headers || [];
  const from = getHeader(headers, 'From');
  const subject = getHeader(headers, 'Subject');
  const date = getHeader(headers, 'Date');
  const { text, html } = getBodyFromPayload(payload);
  const body = text || full.snippet || '';
  return {
    from: (from || '').replace(/<[^>]+>/, '').trim(),
    subject: subject || '',
    date: date || '',
    body,
    bodyHtml: html,
  };
}

async function fetchMessageMetadata(token, id) {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=metadata`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
  return res.json();
}

const MAX_EMAILS = 25;

async function fetchRecentMessages(token, maxResults = 25) {
  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail API list: ${listRes.status}`);
  const list = await listRes.json();
  const messages = list.messages || [];
  return messages;
}

async function getRecentEmails(token) {
  const messages = await fetchRecentMessages(token, MAX_EMAILS);
  const results = [];

  for (const msg of messages) {
    try {
      const full = await fetchMessageMetadata(token, msg.id);
      const headers = (full.payload && full.payload.headers) || [];
      const from = getHeader(headers, 'From');
      const subject = getHeader(headers, 'Subject');
      const date = getHeader(headers, 'Date');
      const snippet = full.snippet || '';
      const fromClean = (from || '').replace(/<[^>]+>/, '').trim();

      results.push({
        type: 'email',
        id: msg.id,
        from: fromClean,
        subject: subject || '',
        date: date || '',
        snippet: snippet.slice(0, 200),
      });
    } catch (e) {
      console.warn('Failed to fetch message', msg.id, e);
    }
  }

  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  return results;
}

const POLL_ALARM_NAME = 'emailCodePoll';
const POLL_ALARM_NAME_OFFSET = 'emailCodePollOffset';
const POLL_INTERVAL_MINUTES = 1;
const MAX_DISMISSED = 500;

function itemKey(item) {
  if (item.type === 'email') return item.id;
  if (item.type === 'link') return `${item.id}:link:${item.url}`;
  return `${item.id}:code:${item.code || ''}`;
}

async function filterByDismissed(raw) {
  const dismissed = await getStored('dismissedItems');
  const set = new Set(Array.isArray(dismissed) ? dismissed : []);
  return raw.filter((item) => !set.has(itemKey(item)));
}

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
    delayInMinutes: 0.05,
  });
  chrome.alarms.create(POLL_ALARM_NAME_OFFSET, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
    delayInMinutes: 0.55,
  });
}

function clearPolling() {
  chrome.alarms.clear(POLL_ALARM_NAME);
  chrome.alarms.clear(POLL_ALARM_NAME_OFFSET);
  chrome.action.setBadgeText({ text: '' });
}

async function fetchAndCacheEmails(interactive = false) {
  const token = await getAccessToken(interactive);
  const raw = await getRecentEmails(token);
  const filtered = await filterByDismissed(raw);
  saveCodesAndBadge(filtered);
  return filtered;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== POLL_ALARM_NAME && alarm.name !== POLL_ALARM_NAME_OFFSET) return;
  getAccessToken(false)
    .then((token) => getRecentEmails(token))
    .then((raw) => filterByDismissed(raw))
    .then(saveCodesAndBadge)
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getCodes') {
    fetchAndCacheEmails(true)
      .then((list) => {
        schedulePolling();
        return list;
      })
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Failed to fetch emails' }));
    return true;
  }
  if (request.action === 'forceSignIn') {
    clearAuthToken()
      .then(() => fetchAndCacheEmails(true))
      .then((list) => {
        schedulePolling();
        return list;
      })
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Failed to sign in' }));
    return true;
  }
  if (request.action === 'signOut') {
    clearPolling();
    clearAuthToken()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'dismiss') {
    const item = request.item;
    if (!item || !item.id) {
      sendResponse({ error: 'Missing item' });
      return true;
    }
    const key = itemKey(item);
    getStored('dismissedItems').then((list) => {
      const arr = Array.isArray(list) ? list : [];
      if (!arr.includes(key)) arr.push(key);
      if (arr.length > MAX_DISMISSED) arr.splice(0, arr.length - MAX_DISMISSED);
      chrome.storage.local.set({ dismissedItems: arr }, () => {
        getStored('cachedCodes').then((cached) => {
          const current = Array.isArray(cached) ? cached : [];
          const filtered = current.filter((i) => itemKey(i) !== key);
          saveCodesAndBadge(filtered);
          sendResponse(filtered);
        });
      });
    });
    return true;
  }
  if (request.action === 'getEmailContent') {
    getEmailContent(request.messageId)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Failed to load email' }));
    return true;
  }
  if (request.action === 'checkAuth') {
    (async () => {
      const creds = await getStoredWebCreds();
      if (creds) {
        const token = await getStored('webAccessToken');
        const refresh = await getStored('webRefreshToken');
        sendResponse({ signedIn: !!(token || refresh) });
      } else {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          sendResponse({ signedIn: !!token });
        });
      }
    })();
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  getAccessToken(false).then((token) => { if (token) schedulePolling(); }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  getAccessToken(false).then((token) => { if (token) schedulePolling(); }).catch(() => {});
});
