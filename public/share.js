/* Public page: anyone can check books against the read list and see the wishlist. */

const $ = (id) => document.getElementById(id);

api('/api/session').then(({ ownerName }) => {
  if (ownerName && ownerName !== 'the owner') {
    $('heading').textContent = `Has ${ownerName} read it?`;
    $('intro').textContent = `Check a book list against ${ownerName}'s reading log, or browse ${ownerName}'s wishlist.`;
    document.title = `Has ${ownerName} read it?`;
  }
});

// ---- Checking a list -------------------------------------------------------

async function check(items) {
  $('check-msg').innerHTML = '';
  if (!items.length) {
    $('check-msg').innerHTML = '<div class="msg error">Add at least one ISBN or title.</div>';
    return;
  }
  $('check').disabled = true;
  try {
    const { results } = await api('/api/check', { method: 'POST', body: { items } });
    renderResults(results);
  } catch (err) {
    $('check-msg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
  } finally {
    $('check').disabled = false;
  }
}

function renderResults(results) {
  const counts = { read: 0, wishlist: 0, 'not-found': 0 };
  results.forEach((r) => counts[r.status]++);
  const rows = results.map((r) => {
    if (r.book) {
      const how = r.match === 'other-edition' ? '<div class="muted small">Matched a different edition</div>' : '';
      return `<div class="result"><div class="muted small">${esc(r.query)}</div>${how}${bookHtml(r.book, { showBadge: true })}</div>`;
    }
    const known = r.title ? ` <span class="muted">(${esc(r.title)})</span>` : '';
    const possible = r.possible && r.possible.length
      ? `<div class="muted small">Similar titles in the log:</div>${r.possible.map((b) => bookHtml(b, { showBadge: true })).join('')}`
      : '';
    return `<div class="result"><div><strong>${esc(r.query)}</strong>${known} ${badge('not-found')}</div>${possible}</div>`;
  });
  $('results').innerHTML = `
    <h2>Results</h2>
    <div class="summary">
      ${badge('read')} ${counts.read}
      ${badge('wishlist')} ${counts.wishlist}
      ${badge('not-found')} ${counts['not-found']}
    </div>
    ${rows.join('')}`;
  $('results').classList.remove('hidden');
}

$('check').addEventListener('click', () =>
  check($('items').value.split('\n').map((s) => s.trim()).filter(Boolean))
);

const scanner = createScanner('scanner', (code) => {
  $('scan-btn').textContent = 'Scan a barcode';
  check([code]);
});

$('scan-btn').addEventListener('click', async () => {
  if (scanner.isRunning()) {
    await scanner.stop();
    $('scan-btn').textContent = 'Scan a barcode';
    return;
  }
  $('check-msg').innerHTML = '';
  try {
    $('scan-btn').textContent = 'Stop scanning';
    await scanner.start();
  } catch (err) {
    $('scan-btn').textContent = 'Scan a barcode';
    $('check-msg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
  }
});

// ---- Browsing lists --------------------------------------------------------

const cache = {};

async function loadList(list) {
  if (!cache[list]) cache[list] = (await api(`/api/books?list=${list}`)).books;
  renderList(list);
}

function renderList(list) {
  const section = $(`tab-${list}`);
  const q = section.querySelector('.filter').value.trim().toLowerCase();
  const all = cache[list] || [];
  const books = all.filter((b) =>
    !q || b.title.toLowerCase().includes(q) || (b.authors || []).join(' ').toLowerCase().includes(q)
  );
  section.querySelector('.count').textContent =
    `${all.length} book${all.length === 1 ? '' : 's'}${q ? ` · ${books.length} shown` : ''}`;
  section.querySelector('.list').innerHTML = books.length
    ? books.map((b) => bookHtml(b)).join('')
    : `<p class="muted">${all.length ? 'No matches.' : 'Nothing here yet.'}</p>`;
}

document.querySelectorAll('.filter').forEach((input) =>
  input.addEventListener('input', () => renderList(input.dataset.list))
);

setupTabs($('tabs'), (name) => {
  if (name !== 'tab-check' && scanner.isRunning()) {
    scanner.stop();
    $('scan-btn').textContent = 'Scan a barcode';
  }
  if (name === 'tab-read') loadList('read');
  if (name === 'tab-wishlist') loadList('wishlist');
})('tab-check');
