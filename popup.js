const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const listView = document.getElementById('list-view');
const emailView = document.getElementById('email-view');
const codesList = document.getElementById('codes-list');
const emptyState = document.getElementById('empty-state');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const btnSignIn = document.getElementById('btn-signin');
const btnRefresh = document.getElementById('btn-refresh');
const btnSignOut = document.getElementById('btn-signout');
const btnBack = document.getElementById('btn-back');
const emailViewSubject = document.getElementById('email-view-subject');
const emailViewMeta = document.getElementById('email-view-meta');
const emailViewLoading = document.getElementById('email-view-loading');
const emailViewBody = document.getElementById('email-view-body');

function show(el) {
  el.classList.remove('hidden');
}

function hide(el) {
  el.classList.add('hidden');
}

function setError(message) {
  errorEl.textContent = message || '';
  if (message) show(errorEl);
  else hide(errorEl);
}

function checkAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, (res) => {
      resolve(res?.signedIn === true);
    });
  });
}

function renderCodes(items) {
  codesList.innerHTML = '';
  hide(emptyState);
  const list = Array.isArray(items) ? items : [];
  const emails = list.filter((i) => i.type === 'email' && i.id);
  if (emails.length === 0) {
    show(emptyState);
    return;
  }
  emails.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'code-card email-card';
    card.dataset.itemKey = item.id;
    const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${item.id}`;
    const snippet = (item.snippet || '').replace(/\s+/g, ' ').trim();
    card.innerHTML = `
      <button class="card-dismiss" title="Remove from list" aria-label="Dismiss">×</button>
      <div class="email-subject">${escapeHtml(item.subject || '(no subject)')}</div>
      <div class="meta"><span class="from">${escapeHtml(item.from)}</span></div>
      ${snippet ? `<div class="email-snippet">${escapeHtml(snippet)}</div>` : ''}
      <div class="email-actions">
        <button type="button" class="email-open email-action btn-inline">View</button>
        <a class="email-open" href="${escapeHtml(gmailUrl)}" target="_blank" rel="noopener noreferrer">Open in Gmail</a>
      </div>
    `;
    card.querySelector('.card-dismiss').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissItem(item);
    });
    card.querySelector('.btn-inline').addEventListener('click', (e) => {
      e.preventDefault();
      openEmailInPopup(item.id);
    });
    codesList.appendChild(card);
  });
}

function dismissItem(item) {
  chrome.runtime.sendMessage({ action: 'dismiss', item }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.error) return;
    if (Array.isArray(response)) renderCodes(response);
  });
}

function loadCodes(showLoading = true) {
  hide(emptyState);
  hide(errorEl);
  if (showLoading) {
    show(loadingEl);
    codesList.innerHTML = '';
  }

  chrome.runtime.sendMessage({ action: 'getCodes' }, (response) => {
    hide(loadingEl);
    if (chrome.runtime.lastError) {
      setError(chrome.runtime.lastError.message);
      return;
    }
    if (response?.error) {
      setError(response.error);
      if (response.error.includes('auth') || response.error.includes('401')) {
        show(authSection);
        hide(mainSection);
      }
      return;
    }

    const codes = Array.isArray(response) ? response : [];
    renderCodes(codes);
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function linkify(text) {
  if (!text) return '';
  const parts = String(text).split(/(https?:\/\/[^\s<>"']+)/g);
  return parts
    .map((part) => {
      if (/^https?:\/\//.test(part)) {
        return '<a href="' + escapeHtml(part) + '" target="_blank" rel="noopener">' + escapeHtml(part) + '</a>';
      }
      return escapeHtml(part);
    })
    .join('');
}

function openEmailInPopup(messageId) {
  show(emailView);
  hide(listView);
  emailViewSubject.textContent = '';
  emailViewMeta.textContent = '';
  emailViewBody.innerHTML = '';
  show(emailViewLoading);
  hide(errorEl);

  chrome.runtime.sendMessage({ action: 'getEmailContent', messageId }, (response) => {
    hide(emailViewLoading);
    if (chrome.runtime.lastError || response?.error) {
      emailViewBody.textContent = response?.error || chrome.runtime.lastError?.message || 'Failed to load email.';
      return;
    }
    emailViewSubject.textContent = response.subject || '(no subject)';
    emailViewMeta.textContent = [response.from, response.date].filter(Boolean).join(' · ');
    if (response.bodyHtml) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-popups');
      iframe.className = 'email-view-iframe';
      const doc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><base target="_blank"></head><body style="margin:0;padding:8px;font-family:system-ui,sans-serif;font-size:14px;">' + response.bodyHtml + '</body></html>';
      iframe.srcdoc = doc;
      emailViewBody.innerHTML = '';
      emailViewBody.appendChild(iframe);
    } else {
      emailViewBody.innerHTML = linkify(response.body || '');
    }
  });
}

function showListView() {
  show(listView);
  hide(emailView);
}

btnBack.addEventListener('click', showListView);

function signOut() {
  chrome.runtime.sendMessage({ action: 'signOut' }, () => {
    show(authSection);
    hide(mainSection);
    setError('');
  });
}

btnSignIn.addEventListener('click', () => {
  setError('');
  chrome.runtime.sendMessage({ action: 'forceSignIn' }, (response) => {
    if (chrome.runtime.lastError) {
      setError(chrome.runtime.lastError.message);
      return;
    }
    if (response?.error) {
      setError(response.error);
      return;
    }
    show(mainSection);
    hide(authSection);
    renderCodes(Array.isArray(response) ? response : []);
  });
});

btnRefresh.addEventListener('click', loadCodes);
btnSignOut.addEventListener('click', signOut);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.cachedCodes) return;
  const codes = changes.cachedCodes.newValue;
  if (Array.isArray(codes) && !mainSection.classList.contains('hidden')) {
    renderCodes(codes);
  }
});

(async function init() {
  const signedIn = await checkAuth();
  if (signedIn) {
    hide(authSection);
    show(mainSection);
    chrome.storage.local.get(['cachedCodes'], (data) => {
      if (data.cachedCodes?.length) {
        renderCodes(data.cachedCodes);
        loadCodes(false);
      } else {
        loadCodes(true);
      }
    });
  } else {
    show(authSection);
    hide(mainSection);
  }
})();
