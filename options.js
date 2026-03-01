document.getElementById('redirect-uri').textContent = chrome.identity.getRedirectURL();

chrome.storage.local.get(['webClientId', 'webClientSecret', 'filterSenderKeywords', 'filterSubjectKeywords'], (data) => {
  if (data.webClientId) document.getElementById('web-client-id').value = data.webClientId;
  if (data.webClientSecret) document.getElementById('web-client-secret').value = data.webClientSecret;
  if (data.filterSenderKeywords?.length) document.getElementById('filter-sender').value = data.filterSenderKeywords.join(', ');
  if (data.filterSubjectKeywords?.length) document.getElementById('filter-subject').value = data.filterSubjectKeywords.join(', ');
});

document.getElementById('save').addEventListener('click', () => {
  const id = document.getElementById('web-client-id').value.trim();
  const secret = document.getElementById('web-client-secret').value.trim();
  chrome.storage.local.set({ webClientId: id || null, webClientSecret: secret || null }, () => {
    const el = document.getElementById('status');
    el.textContent = id && secret ? 'Saved. You can close this tab and sign in from the extension.' : 'Cleared. Extension will use Chrome sign-in if configured.';
  });
});

function parseKeywords(str) {
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

document.getElementById('save-filters').addEventListener('click', () => {
  const sender = parseKeywords(document.getElementById('filter-sender').value);
  const subject = parseKeywords(document.getElementById('filter-subject').value);
  chrome.storage.local.set({ filterSenderKeywords: sender, filterSubjectKeywords: subject }, () => {
    document.getElementById('status-filters').textContent = 'Filters saved. Only emails matching these will be scanned for codes and links.';
  });
});
