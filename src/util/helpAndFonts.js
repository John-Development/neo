/* ================================================================== */
/*  MENU: Help + fonts                                                */
/* ================================================================== */

const DROPCAP_FONTS = {
  literary: '"Didot", "Bodoni 72", Georgia, serif',
  fantasy: '"Apple Chancery", "Snell Roundhand", cursive',
  scifi: 'Futura, "Avenir Next", "Helvetica Neue", sans-serif'
};
const BODY_FONTS = {
  'Georgia': 'Georgia, "Times New Roman", serif',
  'Palatino': '"Palatino", "Palatino Linotype", serif',
  'Baskerville': 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Hoefler Text': '"Hoefler Text", Georgia, serif',
  'Iowan Old Style': '"Iowan Old Style", Georgia, serif',
  'Cambria': 'Cambria, Georgia, serif',
  'Constantia': 'Constantia, Georgia, serif',
  // a sans-serif for those who write in one (bundled, so it's the same everywhere)
  'Jost': '"Jost", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  // iA Writer's own face, bundled too (SIL Open Font License)
  'iA Writer Quattro': '"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif'
};

// Hoefler Text and Iowan Old Style ship only with macOS; elsewhere they
// would fall back to Georgia, so offer the fonts Windows actually has.
// Keep in step with bodyFonts in main.js.
const BODY_FONT_CHOICES = IS_MAC
  ? ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Jost', 'iA Writer Quattro']
  : ['Georgia', 'Palatino', 'Baskerville', 'Cambria', 'Constantia', 'Jost', 'iA Writer Quattro'];

function applyFonts() {
  const f = library.fonts || {};
  if (f.body && typeof f.body === 'string') {
    document.documentElement.style.setProperty('--body-font', bodyFontStack(f.body));
  }
  if (f.dropcap && DROPCAP_FONTS[f.dropcap]) {
    document.documentElement.style.setProperty('--dropcap-font', DROPCAP_FONTS[f.dropcap]);
  }
  document.body.classList.toggle('no-dropcap', f.dropcap === 'none');
  document.body.classList.toggle('night', library.pageTheme === 'night');
  // Light: the paper page in a light room, the whole app with it
  document.body.classList.toggle('light', library.pageTheme === 'light');
  // the system's "Increase contrast" turns it on too, until the writer
  // chooses in the View menu
  document.body.classList.toggle('bright', library.uiBright === undefined ? SYSTEM_CONTRAST.matches : !!library.uiBright);
  reportViewState();
  // View → Interface Size: everything but the page
  const uiZoom = [1, 1.25, 1.5, 2, 2.5, 3].includes(library.uiZoom) ? library.uiZoom : 1;
  document.documentElement.style.setProperty('--ui-zoom', uiZoom);
  document.documentElement.classList.toggle('ui-zoomed', uiZoom > 1);
  if (window.neo.uiZoomState) window.neo.uiZoomState(uiZoom);
  const size = Math.min(22, Math.max(14, library.editorFontSize || 17));
  document.documentElement.style.setProperty('--editor-size', size + 'px');
  const zoom = Math.min(3, Math.max(0.75, library.pageZoom || 1));
  document.documentElement.style.setProperty('--page-zoom', zoom);
  updateZoomDisplay();
}

// A built-in choice, or a font the writer picked from their own computer.
// A library opened where that font is missing simply reads in Georgia.
function bodyFontStack(name) {
  return Object.hasOwn(BODY_FONTS, name) ? BODY_FONTS[name] : `"${name.replace(/["\\]/g, '')}", Georgia, serif`;
}

// Format → Body Font → Other Font…: every font installed on this computer,
// each shown in its own face. The panel sits top right, off the undimmed
// page, so hovering previews the font on the writer's own words. Resolves
// to a family name, or null on cancel.
async function pickLocalFont() {
  let families = [];
  try {
    // one entry per style; names starting with "." are the system's hidden fonts
    const faces = await window.queryLocalFonts();
    families = [...new Set(faces.map((f) => f.family))]
      .filter((n) => n && !n.startsWith('.'))
      .sort((a, b) => a.localeCompare(b));
  } catch {}
  if (!families.length) { toast(t('NEO couldn’t read the fonts on this computer')); return null; }
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop font-picker';
    bd.innerHTML = `
      <div class="modal" style="width:320px">
        <h2 style="font-size:16px">${t('Other font')}</h2>
        <p class="font-now" style="font-size:13px;color:var(--muted);margin-bottom:10px"></p>
        <input type="text" spellcheck="false" placeholder="${t('Search {n} installed fonts', { n: families.length })}" />
        <div class="font-list"></div>
        <div style="text-align:right;margin-top:14px">
          <button class="m-cancel btn-quiet">${t('Cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const input = bd.querySelector('input');
    const list = bd.querySelector('.font-list');
    const current = (library.fonts || {}).body || 'Georgia';
    bd.querySelector('.font-now').textContent = t('Now: {font}', { font: current });
    const done = (val) => { bd.remove(); resolve(val); };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      for (const name of families) {
        if (q && !name.toLowerCase().includes(q)) continue;
        const b = document.createElement('button');
        b.className = 'fr-font' + (name === current ? ' sel' : '');
        b.textContent = name;
        b.style.fontFamily = bodyFontStack(name);
        b.onmouseenter = () => { document.documentElement.style.setProperty('--body-font', bodyFontStack(name)); };
        b.onclick = () => done(name);
        list.appendChild(b);
      }
    };
    list.onmouseleave = applyFonts; // back to the saved font
    input.oninput = render;
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && list.firstChild) done(list.firstChild.textContent);
      if (e.key === 'Escape') { e.stopPropagation(); done(null); } // as in askInput
    };
    bd.querySelector('.m-cancel').onclick = () => done(null);
    render();
    const sel = list.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'center' });
    input.focus();
  });
}

// Pinch (trackpad) or Ctrl+scroll: page and text zoom together.
// A pinch arrives as a wheel event with ctrlKey set.
// let zoomSaveTimer = null;
function updateZoomDisplay() {
  const el = $('#zoom-level');
  if (el) el.textContent = Math.round((library.pageZoom || 1) * 100) + '%';
}
// Zooming or resizing the text reflows the whole book, and the same scroll
// offset lands somewhere else. Pin a spot in the text first: the caret if
// it's on screen, otherwise the point being pinched, otherwise the middle
// of the page. Then scroll it back to where it was.
function keepReadingPlace(change, at) {
  const sc = $('#paper-scroll');
  if (!sc || $('#editor-view').hidden) { change(); return; }
  const box = sc.getBoundingClientRect();
  const topOf = (r) => {
    const rect = r.getBoundingClientRect();
    if (rect.height) return rect.top;
    const el = r.startContainer.nodeType === Node.ELEMENT_NODE ? r.startContainer : r.startContainer.parentElement;
    return el ? el.getBoundingClientRect().top : null; // an empty line has no text to measure
  };
  let anchor = null;
  const sel = window.getSelection();
  if (!at && sel.rangeCount && sc.contains(sel.anchorNode)) {
    const caret = sel.getRangeAt(0).cloneRange();
    caret.collapse(true);
    const y = topOf(caret);
    if (y !== null && y >= box.top && y <= box.bottom) anchor = caret;
  }
  if (!anchor) {
    const x = Math.min(box.right - 1, Math.max(box.left + 1, at ? at.x : box.left + box.width / 2));
    const y = Math.min(box.bottom - 1, Math.max(box.top + 1, at ? at.y : box.top + box.height / 2));
    const r = document.caretRangeFromPoint(x, y);
    if (r && sc.contains(r.startContainer)) anchor = r;
  }
  const before = anchor && topOf(anchor);
  change();
  if (before === null || before === undefined) return;
  const after = topOf(anchor); // reads the new layout
  if (after !== null) sc.scrollTop += after - before;
}

function setPageZoom(next, at) {
  // up to 300%: on a large monitor 160% still read small. The page itself
  // never grows past the window (max-width in styles.css), only the type does.
  next = Math.min(3, Math.max(0.75, next));
  if (next === (library.pageZoom || 1)) return;
  library.pageZoom = next;
  keepReadingPlace(() => document.documentElement.style.setProperty('--page-zoom', next), at);
  updateZoomDisplay();
  clearTimeout(zoomSaveTimer);
  zoomSaveTimer = setTimeout(() => { writeLibrary(library); }, 600);
}
// $('#editor-view').addEventListener('wheel', (e) => {
//   if (!e.ctrlKey) return;
//   e.preventDefault();
//   setPageZoom((library.pageZoom || 1) * Math.exp(-e.deltaY * 0.005), { x: e.clientX, y: e.clientY });
// }, { passive: false });

// // zoom control in the bottom bar: buttons, click-to-reset, and scroll
// $('#zoom-in').onclick = () => setPageZoom((library.pageZoom || 1) + 0.1);
// $('#zoom-out').onclick = () => setPageZoom((library.pageZoom || 1) - 0.1);
// $('#zoom-level').onclick = () => setPageZoom(1);
// $('#zoom-control').addEventListener('wheel', (e) => {
//   e.preventDefault();
//   setPageZoom((library.pageZoom || 1) * Math.exp(-e.deltaY * 0.002));
// }, { passive: false });

// Format → Align Paragraph: applies to every paragraph the selection touches
function applyAlign(value) {
  if (!book || currentTab !== 'manuscript') { toast(t('Click into a paragraph first')); return; }
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  let el = r.startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const body = el && el.closest ? el.closest('.chapter-body') : null;
  if (!body) { toast(t('Click into a paragraph first')); return; }
  const chId = body.closest('.chapter').dataset.id;
  const ps = [...body.querySelectorAll('p')].filter(
    (p) => r.intersectsNode(p) && !p.classList.contains('scene-break')
  );
  for (const p of ps) {
    if (value === 'left') p.style.removeProperty('text-align');
    else p.style.textAlign = value;
    if (!p.getAttribute('style')) p.removeAttribute('style');
  }
  syncChapter(body, chId);
}

// Menu accelerators and editor shortcuts, plus NEO's distinct writing gestures.
// Routine text entry, cursor movement and dialog controls are intentionally omitted.
function shortcutSections() {
  return [
    { title: tk('Writing'), rows: [
      [tk('Enter ×2'), tk('Insert a section break')],
      [tk('Enter ×3'), tk('Start a new chapter')],
      [K('⇧Enter', 'Shift+Enter'), tk('A paragraph with no indent'), tk('Again for another; Enter goes back to prose.')],
      [K('⌘⇧Enter', 'Ctrl+Shift+Enter'), tk('Start or continue a poetry paragraph'), tk('Also works from a chapter heading.')],
      [KPH, tk('Insert a placeholder note')],
      [KDA, tk('Move selected text to Darlings')],
      [K('⌘⇧U', 'Ctrl+Shift+U'), tk('Read aloud from the cursor'), tk('Again, Esc or any key stops it. Uses your computer’s own voice.')]
    ] },
    { title: tk('Formatting'), rows: [
      [['*…*', '**…**', '***…***'], tk('Italic, bold, the Markdown way'), tk('Typed around a word (or pasted). Undo right after keeps the asterisks. Format → Markdown Emphasis turns it off.')],
      [K('⌘U', 'Ctrl+U'), tk('Underline')],
      [K('⌘⇧S', 'Ctrl+Shift+S'), tk('Strikethrough'), tk('Or ~~…~~ around the words.')],
      [K('⌘⇧L', 'Ctrl+Shift+L'), tk('Align paragraph left')],
      [K('⌘⇧C', 'Ctrl+Shift+C'), tk('Center paragraph')],
      [K('⌘⇧R', 'Ctrl+Shift+R'), tk('Align paragraph right')],
      [K('⌘⇧J', 'Ctrl+Shift+J'), tk('Justify paragraph')],
      [K('⌘+', 'Ctrl++'), tk('Larger text')],
      [K('⌘−', 'Ctrl+−'), tk('Smaller text')],
      [K('⌘0', 'Ctrl+0'), tk('Reset text size and page zoom')]
    ] },
    { title: tk('Outline'), rows: [
      ['Tab', tk('Turn a chapter into a section'), tk('Only empty chapters after the first chapter.')],
      [K('⇧Tab', 'Shift+Tab'), tk('Turn a section into a chapter')]
    ] },
    { title: tk('Editing'), rows: [
      [K('⌘⌥⇧V', 'Ctrl+Shift+V'), tk('Paste and match style')],
      [K('⌘F', 'Ctrl+F'), tk('Find and replace')],
      [K('⌘;', 'Ctrl+;'), tk('Toggle spellcheck pass')]
    ] },
    { title: tk('App & files'), rows: [
      [KHELP, tk('Keyboard shortcuts')],
      [K('⌘,', 'Ctrl+,'), tk('Goals and writing sprints')],
      [K('⌘⇧I', 'Ctrl+Shift+I'), tk('Import manuscripts')],
      [K('⌘E', 'Ctrl+E'), tk('Email a draft to yourself')]
    ] },
    { title: tk('View & window'), rows: [
      [[K('⌘⇧F', 'Ctrl+Shift+F'), K('⌘Enter', 'Ctrl+Enter')], tk('Toggle full screen')],
      [K('⌘⇧T', 'Ctrl+Shift+T'), tk('Toggle typewriter scrolling')],
      [K('⌘⇧O', 'Ctrl+Shift+O'), tk('Cycle focus mode'), tk('Off → paragraph → sentence → off.')],
      [K('⌥⌘↓', 'Ctrl+Alt+↓'), tk('Go to the next chapter')],
      [K('⌥⌘↑', 'Ctrl+Alt+↑'), tk('Go to the previous chapter')],
      [['F6', K('⌃Tab', 'Ctrl+Tab')], tk('Move between the page, the chapters, the notes and the bottom bar'), tk('Add Shift to go back. Esc returns to the page. On the shelf: the books, then the header.')],
      ...(IS_MAC ? [
        ['⌘H', tk('Hide NEO')],
        ['⌘⌥H', tk('Hide other apps')]
      ] : [])
    ] },
    // only for writers who turned them on (View → Vim Keys)
    ...(vimEnabled ? [{ title: tk('Vim keys'), rows: [
      ['Esc', tk('Stop writing and move around the page'), tk('i, a or o goes back to writing.')],
      ['h j k l', tk('Left, down, up, right')],
      ['w b e', tk('Next word, previous word, end of word')],
      ['0 $', tk('Start or end of the line')],
      ['( )', tk('Previous or next sentence')],
      ['{ }', tk('Previous or next paragraph')],
      ['gg G', tk('Top or end of the chapter')],
      ['[[ ]]', tk('Previous or next chapter')],
      [K('⌃d ⌃u', 'Ctrl+d Ctrl+u'), tk('Down or up half a screen')],
      ['i a I A', tk('Write here, after, at the start or end of the line')],
      ['o O', tk('Write in a new paragraph below or above')],
      ['v', tk('Select'), tk('Move to stretch it, then y to copy or d to cut.')],
      ['x', tk('Delete the letter under the caret')],
      ['/', tk('Find')]
    ] }] : [])
  ];
}

/* ================================================================== */
/*  Linux body fonts                                                  */
/*  Georgia, Palatino, Baskerville, Hoefler Text, and Iowan Old Style */
/*  are not on Linux. The bundled faces below are what the Format     */
/*  menu and the first-run picker offer instead. Old libraries still  */
/*  resolve the macOS names, but those names stay out of the picker.  */
/* ================================================================== */

const LINUX_BODY_FONTS = {
  'Gelasio': '"Gelasio", Georgia, "Times New Roman", serif',
  'TeX Gyre Pagella': '"TeX Gyre Pagella", Palatino, "Palatino Linotype", serif',
  'Libre Baskerville': '"Libre Baskerville", Baskerville, Georgia, serif',
  'Alegreya': '"Alegreya", "Hoefler Text", Georgia, serif',
  'Source Serif Pro': '"Source Serif Pro", "Iowan Old Style", Georgia, serif',
  'Jost': '"Jost", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  'iA Writer Quattro': '"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif'
};

function installLinuxBodyFonts() {
  if (IS_MAC || /win/i.test(navigator.platform)) return;
  const legacy = {
    Georgia: LINUX_BODY_FONTS.Gelasio,
    Palatino: LINUX_BODY_FONTS['TeX Gyre Pagella'],
    Baskerville: LINUX_BODY_FONTS['Libre Baskerville'],
    'Hoefler Text': LINUX_BODY_FONTS.Alegreya,
    'Iowan Old Style': LINUX_BODY_FONTS['Source Serif Pro'],
    Cambria: LINUX_BODY_FONTS['Source Serif Pro'],
    Constantia: LINUX_BODY_FONTS['Libre Baskerville']
  };
  for (const key of Object.keys(BODY_FONTS)) delete BODY_FONTS[key];
  Object.assign(BODY_FONTS, LINUX_BODY_FONTS);
  for (const [key, stack] of Object.entries(legacy)) {
    Object.defineProperty(BODY_FONTS, key, {
      value: stack, enumerable: false, writable: true, configurable: true
    });
  }
  DROPCAP_FONTS.literary = '"Libre Bodoni", "Didot", "Bodoni 72", Georgia, serif';
  DROPCAP_FONTS.fantasy = '"TeX Gyre Chorus", "Apple Chancery", "Snell Roundhand", cursive';
  DROPCAP_FONTS.scifi = '"Jost", Futura, "Avenir Next", "Helvetica Neue", sans-serif';
  // A shared choice list, when the renderer defines one, has to name these
  // bundled faces on Linux rather than fonts the machine does not have.
  if (typeof BODY_FONT_CHOICES !== 'undefined') {
    BODY_FONT_CHOICES.splice(0, BODY_FONT_CHOICES.length, ...Object.keys(LINUX_BODY_FONTS));
  }
}