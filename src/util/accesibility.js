/* ================================================================== */
/*  ACCESSIBILITY: keyboard, screen readers, system settings          */
/* ================================================================== */
// NEO stays quiet by design; these make the quiet parts reachable. The
// system's own settings decide the rest: "Increase contrast" turns on the
// Brighter Interface, "Reduce motion" stills the fades and slides.

const SYSTEM_CONTRAST = window.matchMedia('(prefers-contrast: more)');
const SYSTEM_STILL = window.matchMedia('(prefers-reduced-motion: reduce)');
SYSTEM_CONTRAST.addEventListener('change', () => applyFonts());
function scrollBehavior() { return SYSTEM_STILL.matches ? 'auto' : 'smooth'; }

// Something clickable that isn't a <button>: Tab reaches it, Enter or Space
// presses it, and a screen reader hears its name.
function pressable(el, label) {
  el.tabIndex = 0;
  if (!el.getAttribute('role')) el.setAttribute('role', 'button');
  if (label) el.setAttribute('aria-label', label);
  el.addEventListener('keydown', (e) => {
    if (e.target !== el || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
}

function dialogify(bd) {
  const box = bd.querySelector('.modal');
  if (!box || box.getAttribute('role')) return;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const h = box.querySelector('h2');
  if (h) {
    h.id = h.id || 'dlg-' + Math.random().toString(36).slice(2, 9);
    box.setAttribute('aria-labelledby', h.id);
  }
  bd._returnFocus = focusBeforeDialog;
  requestAnimationFrame(() => {
    if (bd.hidden || bd.contains(document.activeElement)) return;
    const first = box.querySelector('input:not([type=hidden]), select, textarea, .m-ok, button, [tabindex="0"]');
    if (first) first.focus({ preventScroll: true });
  });
}

function focusPage() {
  if (pagePlace && pagePlace.el.isConnected && !pagePlace.el.closest('[hidden]')) {
    pagePlace.el.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(pagePlace.range);
    return;
  }
  if (currentTab === 'manuscript' && book && book.chapterOrder.length) {
    focusChapter(currentChapterId || book.chapterOrder[0]);
    return;
  }
  const aux = $('#aux-paper');
  const target = aux.querySelector('[contenteditable="true"]:not([hidden] *), button');
  if (target) target.focus();
}
function openPaneFromKeyboard(pane, first) {
  if (!pane.classList.contains('open')) { pane.classList.add('open'); pane.dataset.kbd = '1'; }
  if (first) first.focus();
}

const REGIONS = [
  { box: () => $('#paper-scroll'), enter: () => focusPage() },
  {
    box: () => $('#nav-pane'),
    enter: () => {
      const rows = $$('#nav-list .n-row');
      const cur = $('#nav-list .nav-item.current .n-row');
      openPaneFromKeyboard($('#nav-pane'), cur || rows[0] || $('#nav-add'));
    }
  },
  {
    box: () => $('#side-pane'),
    enter: () => openPaneFromKeyboard($('#side-pane'), $('#sticky-list textarea') || $('#side-pin'))
  },
  { box: () => $('#bottombar'), enter: () => ($('.tab.active') || $('#back-to-shelf')).focus() }
];
// F6, or ⌃Tab: on a Mac the F-keys drive brightness and sound unless fn is
// held, so F6 alone would do nothing there.
const regionKey = (e) => e.key === 'F6' || (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey);
// On the shelf: the books, then the header (author, Import, + Shelf).
const SHELF_REGIONS = [
  { box: () => $('#shelves'), enter: () => { const b = $('#shelves .book') || $('#shelves .new-book'); if (b) b.focus(); } },
  { box: () => $('#shelf-header'), enter: () => $('#author-chip').focus() }
];
