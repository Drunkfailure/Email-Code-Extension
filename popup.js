const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const codesList = document.getElementById('codes-list');
const emptyState = document.getElementById('empty-state');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const btnSignIn = document.getElementById('btn-signin');
const btnRefresh = document.getElementById('btn-refresh');
const btnCopy = document.getElementById('btn-copy');
const btnSignOut = document.getElementById('btn-signout');

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

function renderCodes(codes) {
  codesList.innerHTML = '';
  hide(emptyState);
  if (!codes || codes.length === 0) {
    show(emptyState);
    return;
  }
  codes.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'code-card';
    card.innerHTML = `
      <div class="code-value" data-code="${escapeHtml(item.code)}">${escapeHtml(item.code)}</div>
      <div class="meta">
        <span class="from">${escapeHtml(item.from)}</span>
        ${item.subject ? `<br>${escapeHtml(item.subject)}` : ''}
      </div>
    `;
    card.querySelector('.code-value').addEventListener('click', () => copyCode(item.code));
    codesList.appendChild(card);
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

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => showCopiedToast());
}

function copyLatestCode() {
  const firstCard = codesList.querySelector('.code-card .code-value');
  if (firstCard) {
    const code = firstCard.getAttribute('data-code') || firstCard.textContent;
    navigator.clipboard.writeText(code).then(() => showCopiedToast());
  }
}

function showCopiedToast() {
  const toast = document.createElement('div');
  toast.className = 'copied-toast';
  toast.textContent = 'Copied to clipboard';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

function signOut() {
  chrome.runtime.sendMessage({ action: 'signOut' }, () => {
    show(authSection);
    hide(mainSection);
    setError('');
  });
}

btnSignIn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'getCodes' }, () => {
    if (!chrome.runtime.lastError) {
      show(mainSection);
      hide(authSection);
      loadCodes();
    }
  });
});

btnRefresh.addEventListener('click', loadCodes);
btnCopy.addEventListener('click', copyLatestCode);
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
