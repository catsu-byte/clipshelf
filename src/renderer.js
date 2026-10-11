const searchInput = document.querySelector('#search');
const list = document.querySelector('#list');
const empty = document.querySelector('#empty');
const template = document.querySelector('#item-template');
const pauseButton = document.querySelector('#pause');
const clearButton = document.querySelector('#clear');
const startupInput = document.querySelector('#startup');
const count = document.querySelector('#count');
const notice = document.querySelector('#notice');

let currentState = { paused: false, startAtLogin: false, items: [] };
let noticeTimer;

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.remove('hidden');
  noticeTimer = setTimeout(() => notice.classList.add('hidden'), 1800);
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const items = currentState.items.filter((item) => item.text.toLocaleLowerCase().includes(query));
  list.replaceChildren();

  pauseButton.textContent = currentState.paused ? 'Resume' : 'Pause';
  pauseButton.classList.toggle('active', currentState.paused);
  pauseButton.setAttribute('aria-pressed', String(currentState.paused));
  startupInput.checked = currentState.startAtLogin;
  count.textContent = query ? `${items.length} of ${currentState.items.length}` : `${items.length} clips`;

  empty.classList.toggle('hidden', items.length !== 0);
  empty.querySelector('h2').textContent = query ? 'No matching clips' : 'Nothing here yet';
  empty.querySelector('p').textContent = query
    ? 'Try a different search.'
    : 'Copy some text and it will appear here automatically.';

  for (const item of items) {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector('.clip');
    const body = fragment.querySelector('.clip-body');
    const pin = fragment.querySelector('.pin');
    const remove = fragment.querySelector('.delete');

    article.classList.toggle('pinned', item.pinned);
    fragment.querySelector('.clip-text').textContent = item.text;
    fragment.querySelector('time').textContent = relativeTime(item.copiedAt);
    fragment.querySelector('.length').textContent = `${item.text.length.toLocaleString()} chars`;
    pin.textContent = item.pinned ? 'Unpin' : 'Pin';
    pin.classList.toggle('active', item.pinned);

    body.addEventListener('click', async () => {
      if (await window.clipShelf.copy(item.id)) showNotice('Copied to clipboard');
    });
    pin.addEventListener('click', () => window.clipShelf.togglePin(item.id));
    remove.addEventListener('click', () => window.clipShelf.delete(item.id));
    list.append(fragment);
  }
}

searchInput.addEventListener('input', render);
pauseButton.addEventListener('click', () => window.clipShelf.setPaused(!currentState.paused));
startupInput.addEventListener('change', () => window.clipShelf.setStartAtLogin(startupInput.checked));
clearButton.addEventListener('click', async () => {
  if (currentState.items.some((item) => !item.pinned) && confirm('Clear all unpinned clipboard entries?')) {
    await window.clipShelf.clear();
    showNotice('Unpinned history cleared');
  }
});

window.clipShelf.onState((state) => {
  currentState = state;
  render();
});

window.clipShelf.getState().then((state) => {
  currentState = state;
  render();
});

setInterval(() => {
  if (!document.hidden) render();
}, 30_000);
