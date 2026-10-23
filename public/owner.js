/* Owner page: log in, add books by barcode or ISBN, manage both lists. */

const $ = (id) => document.getElementById(id);
let current = null; // result of the last ISBN lookup

function message(el, text, kind = 'error') {
  el.innerHTML = text ? `<div class="msg ${kind}">${esc(text)}</div>` : '';
}

async function init() {
  const session = await api('/api/session');
  $('login').classList.toggle('hidden', session.owner);
  $('owner').classList.toggle('hidden', !session.owner);
  $('logout').classList.toggle('hidden', !session.owner);
  if (session.owner) selectTab('tab-add');
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/login', { method: 'POST', body: { password: $('password').value } });
    $('password').value = '';
    message($('login-msg'), '');
    init();
  } catch (err) {
    message($('login-msg'), err.message);
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  init();
});

// ---- Adding books ---------------------------------------------------------

const scanner = createScanner('scanner', (code) => {
  $('scan-btn').textContent = 'Scan barcode';
  $('isbn').value = code;
  lookUp(code);
});

$('scan-btn').addEventListener('click', async () => {
  if (scanner.isRunning()) {
    await scanner.stop();
    $('scan-btn').textContent = 'Scan barcode';
    return;
  }
  message($('add-msg'), '');
  try {
    $('scan-btn').textContent = 'Stop scanning';
    await scanner.start();
  } catch (err) {
    $('scan-btn').textContent = 'Scan barcode';
    message($('add-msg'), err.message);
  }
});

$('isbn-form').addEventListener('submit', (e) => {
  e.preventDefault();
  lookUp($('isbn').value);
});

async function lookUp(isbn) {
  $('preview').classList.add('hidden');
  $('manual').classList.add('hidden');
  message($('add-msg'), 'Looking up…', 'ok');
  try {
    current = await api(`/api/lookup/${encodeURIComponent(isbn.trim())}`);
  } catch (err) {
    message($('add-msg'), err.message);
    return;
  }
  message($('add-msg'), '');

  if (!current.metadata) {
    if (current.lookupError) message($('add-msg'), 'The ISBN databases could not be reached; you can enter the details manually.');
    $('m-title').value = current.existing ? current.existing.title : '';
    $('m-authors').value = current.existing ? (current.existing.authors || []).join(', ') : '';
    $('manual').classList.remove('hidden');
    $('m-title').focus();
    return;
  }

  const book = { ...current.metadata, isbn13: current.isbn13, list: current.existing && current.existing.list };
  const already = current.existing
    ? `<p>${badge(current.existing.list)} This book is already on your ${current.existing.list === 'read' ? 'read list' : 'wishlist'}.</p>`
    : '';
  $('preview').innerHTML = `
    <h2>Found it <span class="muted small">via ${esc(current.metadata.source)}</span></h2>
    ${bookHtml(book)}
    ${already}
    <div class="row">
      ${current.existing && current.existing.list === 'read' ? '' : '<button class="btn primary" data-list="read">Mark as read</button>'}
      ${current.existing ? '' : '<button class="btn" data-list="wishlist">Add to wishlist</button>'}
    </div>`;
  $('preview').classList.remove('hidden');
}

$('preview').addEventListener('click', (e) => {
  const list = e.target.dataset && e.target.dataset.list;
  if (list) save({ isbn: current.isbn13, list, ...current.metadata });
});

$('manual').addEventListener('submit', (e) => e.preventDefault());
$('manual').addEventListener('click', (e) => {
  const list = e.target.dataset && e.target.dataset.list;
  if (!list || !$('manual').reportValidity()) return;
  save({ isbn: current.isbn13, list, title: $('m-title').value, authors: $('m-authors').value });
});

async function save(payload) {
  try {
    const { book } = await api('/api/books', { method: 'POST', body: payload });
    $('preview').classList.add('hidden');
    $('manual').classList.add('hidden');
    $('isbn').value = '';
    message($('add-msg'), `Saved “${book.title}” to your ${book.list === 'read' ? 'read list' : 'wishlist'}.`, 'ok');
  } catch (err) {
    message($('add-msg'), err.message);
  }
}

// ---- Lists ----------------------------------------------------------------

const cache = {};

async function loadList(list) {
  const { books } = await api(`/api/books?list=${list}`);
  cache[list] = books;
  renderList(list);
}

function renderList(list) {
  const section = $(`tab-${list}`);
  const q = section.querySelector('.filter').value.trim().toLowerCase();
  const books = (cache[list] || []).filter((b) =>
    !q || b.title.toLowerCase().includes(q) || (b.authors || []).join(' ').toLowerCase().includes(q)
  );
  const total = (cache[list] || []).length;
  section.querySelector('.count').textContent =
    `${total} book${total === 1 ? '' : 's'}${q ? ` · ${books.length} shown` : ''}`;
  const actions = list === 'wishlist'
    ? '<button class="btn small primary" data-act="read">Mark as read</button><button class="btn small" data-act="remove">Remove</button>'
    : '<button class="btn small" data-act="notes">Notes</button><button class="btn small" data-act="wishlist">Move to wishlist</button><button class="btn small" data-act="remove">Remove</button>';
  section.querySelector('.list').innerHTML = books.length
    ? books.map((b) => bookHtml(b, { actions })).join('')
    : `<p class="muted">${total ? 'No matches.' : 'Nothing here yet.'}</p>`;
}

document.querySelectorAll('.filter').forEach((input) =>
  input.addEventListener('input', () => renderList(input.dataset.list))
);

document.querySelectorAll('#tab-read .list, #tab-wishlist .list').forEach((el) =>
  el.addEventListener('click', async (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    const row = e.target.closest('.book');
    const isbn = row.dataset.isbn;
    const list = el.closest('section').id.replace('tab-', '');
    const book = cache[list].find((b) => b.isbn13 === isbn);
    try {
      if (act === 'remove') {
        if (!confirm(`Remove “${book.title}”?`)) return;
        await api(`/api/books/${isbn}`, { method: 'DELETE' });
      } else if (act === 'notes') {
        const notes = prompt('Private notes (only you can see these):', book.notes || '');
        if (notes === null) return;
        await api(`/api/books/${isbn}`, { method: 'PATCH', body: { notes } });
      } else {
        await api(`/api/books/${isbn}`, { method: 'PATCH', body: { list: act } });
      }
      await loadList(list);
    } catch (err) {
      alert(err.message);
    }
  })
);

const selectTab = setupTabs($('tabs'), (name) => {
  if (name !== 'tab-add' && scanner.isRunning()) {
    scanner.stop();
    $('scan-btn').textContent = 'Scan barcode';
  }
  if (name === 'tab-read') loadList('read');
  if (name === 'tab-wishlist') loadList('wishlist');
});

init().catch((err) => alert(err.message));
