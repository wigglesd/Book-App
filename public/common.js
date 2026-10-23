/* Helpers shared by the owner page and the public page. */

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const LIST_LABEL = { read: 'Read', wishlist: 'On wishlist', 'not-found': 'Not read' };

function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(LIST_LABEL[status] || status)}</span>`;
}

// Renders one book row. `actions` is extra HTML for buttons.
function bookHtml(b, { actions = '', showBadge = false } = {}) {
  const cover = b.coverUrl
    ? `<img src="${esc(b.coverUrl)}" alt="" loading="lazy">`
    : '<div class="nocover"></div>';
  const meta = [b.publisher, b.publishedDate, b.pageCount && `${b.pageCount} pages`].filter(Boolean).join(' · ');
  return `<div class="book" data-isbn="${esc(b.isbn13)}">
    ${cover}
    <div class="info">
      <div class="title">${esc(b.title)} ${showBadge ? badge(b.list) : ''}</div>
      <div class="muted">${esc((b.authors || []).join(', '))}</div>
      <div class="muted small">${esc(meta)}${meta ? ' · ' : ''}ISBN ${esc(b.isbn13)}</div>
      ${b.list === 'read' && b.readDate ? `<div class="muted small">Read ${esc(b.readDate)}</div>` : ''}
      ${b.notes ? `<div class="small">${esc(b.notes)}</div>` : ''}
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

// Wraps html5-qrcode to read book barcodes (EAN-13 / ISBN) from the camera.
function createScanner(elementId, onCode) {
  let scanner = null;
  let running = false;

  async function stop() {
    if (scanner && running) {
      running = false;
      await scanner.stop().catch(() => {});
      scanner.clear();
    }
  }

  async function start() {
    if (running) return;
    if (!window.isSecureContext) {
      throw new Error('The camera needs HTTPS (or localhost). You can still type the ISBN.');
    }
    const F = Html5QrcodeSupportedFormats;
    scanner = new Html5Qrcode(elementId, {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128],
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    running = true;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w * 0.9, 360), height: Math.min(h * 0.5, 160) }) },
        async (text) => {
          // Books carry an EAN-13 starting 978/979; ignore price add-ons etc.
          const digits = text.replace(/\D/g, '');
          if (!/^97[89]\d{10}$/.test(digits) && !/^\d{9}[\dXx]$/.test(text)) return;
          await stop();
          onCode(digits.length === 13 ? digits : text);
        },
        () => {}
      );
    } catch (err) {
      running = false;
      throw new Error(`Could not start the camera: ${err.message || err}`);
    }
  }

  return { start, stop, isRunning: () => running };
}

function setupTabs(container, onChange) {
  const buttons = container.querySelectorAll('[data-tab]');
  function select(name) {
    buttons.forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      document.getElementById(b.dataset.tab).classList.toggle('hidden', !on);
    });
    if (onChange) onChange(name);
  }
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.tab)));
  return select;
}
