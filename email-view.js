function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function linkify(text) {
  if (!text) return '';
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts
    .map((part) => {
      if (/^https?:\/\//.test(part)) {
        return '<a href="' + escapeHtml(part) + '" target="_blank" rel="noopener">' + escapeHtml(part) + '</a>';
      }
      return escapeHtml(part);
    })
    .join('');
}

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

const params = new URLSearchParams(window.location.search);
const id = params.get('id');

if (!id) {
  hide(document.getElementById('loading'));
  show(document.getElementById('error'));
  document.getElementById('error').textContent = 'No email specified.';
} else {
  chrome.runtime.sendMessage({ action: 'getEmailContent', messageId: id }, (response) => {
    hide(document.getElementById('loading'));
    if (chrome.runtime.lastError || response?.error) {
      show(document.getElementById('error'));
      document.getElementById('error').textContent = response?.error || chrome.runtime.lastError?.message || 'Failed to load email.';
      return;
    }
    show(document.getElementById('content'));
    document.getElementById('subject').textContent = response.subject || '(no subject)';
    document.getElementById('meta').textContent = [response.from, response.date].filter(Boolean).join(' · ');
    const bodyEl = document.getElementById('body');
    if (response.bodyHtml) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-popups');
      iframe.className = 'email-body-iframe';
      iframe.srcdoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><base target="_blank"></head><body style="margin:0;padding:12px;font-family:system-ui,sans-serif;font-size:14px;">' + response.bodyHtml + '</body></html>';
      bodyEl.innerHTML = '';
      bodyEl.appendChild(iframe);
    } else {
      bodyEl.innerHTML = linkify(response.body || '');
    }
  });
}
