// A full-screen QR code (needs shared/algo/qr.js and the .qr-modal rules in ui.css).
//
//   QRModal.show({ title: 'NFA Simulator', url: location.href })
//
// Click anywhere or press Esc to close; the address under the code stays a link and does not close it.
const QRModal = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Why a phone could not open `url`, or null when it probably can. */
  function reachNote(url) {
    let u;
    try { u = new URL(url); } catch { return 'Not a web address.'; }
    if (u.protocol === 'file:') return 'A file: address cannot be opened from a phone. Serve the tools over HTTP.';
    if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || /^127\./.test(u.hostname) || u.hostname === '[::1]') {
      return 'localhost is reachable only from this computer. Open the page by its network address.';
    }
    return null;
  }

  let root = null, opener = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

  function build() {
    root = el('div', 'qr-modal');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'qr-modal-title');
    root.tabIndex = -1;
    root.hidden = true;
    const title = el('div', 'qr-modal-title'); title.id = 'qr-modal-title';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'qr-modal-code');
    svg.setAttribute('role', 'img');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute("fill", "white");
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', '#000');
    svg.append(bg, path);
    const link = el('a', 'qr-modal-url');
    link.target = '_blank'; link.rel = 'noopener';
    link.addEventListener('click', e => e.stopPropagation());   // following the link does not close the modal
    root.append(title, svg, link, el('div', 'qr-modal-note'), el('div', 'qr-modal-hint', 'Click anywhere or press Esc to close'));
    root.querySelector('.qr-modal-note').hidden = true;
    root.addEventListener('click', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) { e.stopPropagation(); hide(); } });
    document.body.append(root);
  }

  function show({ title = '', url = location.href } = {}) {
    if (!root) build();
    const qr = QR.encode(url), margin = 4, side = qr.size + 2 * margin;
    root.querySelector('.qr-modal-title').textContent = title;
    root.querySelector('.qr-modal-title').hidden = !title;
    const svg = root.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
    svg.setAttribute('aria-label', 'QR code for ' + url);
    const [bg, path] = svg.children;
    bg.setAttribute('width', side); bg.setAttribute('height', side);
    path.setAttribute('d', QR.pathData(qr.modules, margin));
    const link = root.querySelector('.qr-modal-url');
    link.textContent = url;
    if (/^https?:/i.test(url)) link.href = url; else link.removeAttribute('href');   // never a javascript: or data: link
    const note = reachNote(url), noteEl = root.querySelector('.qr-modal-note');
    noteEl.textContent = note || ''; noteEl.hidden = !note;
    opener = document.activeElement;
    root.hidden = false;
    root.focus();
  }

  function hide() {
    if (!root || root.hidden) return;
    root.hidden = true;
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  return { show, hide, reachNote };
})();

