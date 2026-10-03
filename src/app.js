/* =============================== NEO =============================== */

'use strict';

// Scrollbars stay invisible until you scroll, then fade away again —
// chrome only when needed.
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!el || !el.classList) return;
  el.classList.add('show-scrollbar');
  clearTimeout(el._neoSbHide);
  el._neoSbHide = setTimeout(() => el.classList.remove('show-scrollbar'), 750);
}, true);

// A click (or tap) on the dim page around any dialog dismisses it the way
// its own quiet button would — Cancel or Later where there is one, else
// Done/OK. Dialogs that must be answered have neither and stay put.
document.addEventListener('mousedown', (e) => {
  const bd = e.target && e.target.classList && e.target.classList.contains('modal-backdrop') ? e.target : null;
  if (!bd || bd.dataset.stay === '1') return;
  const btn = bd.querySelector('.m-cancel') || bd.querySelector('.m-ok');
  if (btn) btn.click();
});

/* ================================================================== */
/*  BOOKSHELF                                                         */
/* ================================================================== */

window.addEventListener('resize', () => {
  clearTimeout(fitBoundShelves.t);
  fitBoundShelves.t = setTimeout(fitBoundShelves, 120);
});

$('#add-shelf-btn').onclick = onNewShelf;

// Drag a book up to your name: if you write under other names too, a little
// rack of shelves unfolds beneath it, one per pen name, and the book can be
// dropped onto one. It lands on that name's top shelf and takes the name.
// With a single author there is nothing to unfold, so nothing happens.
dragBookToAuthorName();

document.addEventListener('keydown', (e) => {
  if (!$('#editor-view').hidden || !lastShelfMove) return;
  const undoKey = e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z');
  if (!undoKey) return;
  if (document.querySelector('.modal-backdrop:not([hidden])')) return;
  e.preventDefault();
  e.stopPropagation();
  undoShelfMove();
}, true);

/* =================================================================== */
/*  POETRY PARAGRAPHS — ⌘⇧Enter (Ctrl+Shift+Enter)                     */
/*  A paragraph pulled in from the margins, italic: a stanza of verse, */
/*  a quote, a POV name under the chapter heading. One class, one key. */
/*  FLUSH PARAGRAPHS — ⇧Enter                                          */
/*  Prose with no first-line indent: a report, a list, an email, a     */
/*  sign in the story. ⇧Enter again gives another; Enter is prose.     */
/* =================================================================== */

document.addEventListener('selectionchange', () => {
  if (!book || currentTab !== 'manuscript') return;
  const sel = window.getSelection();
  let caretP = null;
  if (sel && sel.rangeCount) {
    let el = sel.anchorNode;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    const p = el && el.closest ? el.closest('p') : null;
    if (p && p.parentElement && p.parentElement.classList.contains('chapter-body')) caretP = p;
  }
  if (caretP !== lastCaretPara) {
    if (lastCaretPara && lastCaretPara.isConnected) {
      try { lastCaretPara.normalize(); } catch { /* fine */ }
    }
    lastCaretPara = caretP;
  }
  // during a spellcheck pass, each chapter scans as the caret arrives
  if (spellOn && caretP) {
    const ch = caretP.closest('.chapter');
    if (ch) scanSpellingIn(ch.querySelector('.chapter-body'), ch.dataset.id);
  }
  // the drop cap steps aside while the caret is in the first paragraph
  const inPoetry = !!(caretP && caretP.classList.contains('poetry'));
  if (inPoetry !== menuPoetryState && window.neo.poetryState) {
    menuPoetryState = inPoetry;
    window.neo.poetryState(inPoetry);
  }
  const inFlush = !!(caretP && caretP.classList.contains('flush'));
  if (inFlush !== menuFlushState && window.neo.flushState) {
    menuFlushState = inFlush;
    window.neo.flushState(inFlush);
  }
  const inFirst = caretP && caretP.parentElement &&
    caretP === caretP.parentElement.querySelector('p:not(.poetry)');
  const capBody = inFirst ? caretP.parentElement : null;
  if (capBody !== capOffBody) {
    if (capOffBody && capOffBody.isConnected) capOffBody.classList.remove('cap-off');
    if (capBody) capBody.classList.add('cap-off');
    capOffBody = capBody;
  }
});

// ⌘Z (Ctrl+Z) right after: the styling goes and the marks come back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = mdJustSet;
  mdJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ') return;
  e.preventDefault();
  e.stopPropagation();
  for (let i = 0; i < just.steps; i++) document.execCommand('undo');
  // the text is back as it was typed; the mark that was about to close it goes in
  if (just.block.isConnected) selectChars(just.block, just.end, just.end);
  document.execCommand('insertText', false, just.key);
}, true);

// ⌘Z (Ctrl+Z) right after: the hyphen comes back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = dashJustSet;
  dashJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ' || !just.block.isConnected) return;
  e.preventDefault();
  e.stopPropagation();
  selectChars(just.block, just.at, just.at + just.to.length);
  document.execCommand('insertText', false, just.was);
  const caret = just.at + just.was.length + just.key.length;
  selectChars(just.block, caret, caret);
}, true);

// ⌘Z (Ctrl+Z) right after: the lowercase comes back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = capJustSet;
  capJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ' || !just.block.isConnected) return;
  e.preventDefault();
  e.stopPropagation();
  selectChars(just.block, just.at, just.at + 1);
  document.execCommand('insertText', false, just.was);
  // a key typed after the "i" stays, with the caret past it
  const caret = just.at + 1 + just.key.length;
  selectChars(just.block, caret, caret);
}, true);

// Titles, outline lines, notes and shelf names get the same typography as
// the manuscript (which calls smartKeys itself). Capture phase, because
// those fields keep their keystrokes from bubbling to the page.
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.defaultPrevented || !el || !el.isContentEditable || el.closest('.chapter-body')) return;
  smartKeys(e, el);
}, true);

// Title page: Enter drops you into Chapter One.
$('#tp-title').addEventListener('keydown', titleEnter);
$('#tp-subtitle').addEventListener('keydown', titleEnter);
$('#tp-title').addEventListener('input', () => {
  book.title = $('#tp-title').textContent.trim() || t('Untitled');
  scheduleMetaSave();
});
$('#tp-subtitle').addEventListener('input', () => {
  book.subtitle = $('#tp-subtitle').textContent.trim();
  scheduleMetaSave();
});
// each book can carry its own pen name
$('#tp-author').addEventListener('input', () => {
  book.author = $('#tp-author').textContent.trim();
  scheduleMetaSave();
});

$('#tp-title').addEventListener('input', () => {
  book.title = $('#tp-title').textContent.trim() || t('Untitled');
  scheduleMetaSave();
});
$('#tp-subtitle').addEventListener('input', () => {
  book.subtitle = $('#tp-subtitle').textContent.trim();
  scheduleMetaSave();
});
// each book can carry its own pen name
$('#tp-author').addEventListener('input', () => {
  book.author = $('#tp-author').textContent.trim();
  scheduleMetaSave();
});

/* ================================================================== */
/*  NAV PANE                                                          */
/* ================================================================== */

$('#nav-add').onclick = () => {
  switchTab('manuscript');
  focusChapter(createChapterAt(storyEnd()));
};

// the + on the seam nearest the pointer, when it's near one (the pane
// listens, so the seams above the first box and below the last wake too)
$('#nav-pane').addEventListener('mousemove', (e) => {
  if (chapterDragActive || e.buttons) return;
  let near = null;
  let best = 9;
  for (const g of navList.querySelectorAll('.nav-gap')) {
    const d = Math.abs(e.clientY - g.getBoundingClientRect().top);
    if (d < best) { best = d; near = g; }
  }
  for (const g of navList.querySelectorAll('.nav-gap')) g.classList.toggle('near', g === near);
});
$('#nav-pane').addEventListener('mouseleave', () => {
  navList.querySelectorAll('.nav-gap.near').forEach((g) => g.classList.remove('near'));
});

// Drop also cleans up if rendering removes the source before dragend bubbles.
// Dragend covers Escape and releases outside a valid drop target.
document.addEventListener('drop', finishChapterDrag);
document.addEventListener('dragend', finishChapterDrag);

navList.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('application/x-neo-chapter')) return;
  e.preventDefault();
  const ind = navDropInd();
  const items = [...navList.querySelectorAll('.nav-item:not(.dragging)')];
  let placed = false;
  for (const it of items) {
    const r = it.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) {
      navList.insertBefore(ind, it);
      placed = true;
      break;
    }
  }
  if (!placed) navList.appendChild(ind);
});
navList.addEventListener('dragleave', (e) => {
  if (navList.contains(e.relatedTarget)) return;
  const ind = document.querySelector('.nav-drop-ind');
  if (ind) ind.remove();
});
navList.addEventListener('drop', async (e) => {
  const chId = e.dataTransfer.getData('application/x-neo-chapter');
  if (!chId) return;
  e.preventDefault();
  const ind = document.querySelector('.nav-drop-ind');
  let index = book.chapterOrder.filter((c) => c !== chId).length;
  if (ind) {
    index = 0;
    for (const c of navList.children) {
      if (c === ind) break;
      if (c.classList.contains('nav-item') && !c.classList.contains('dragging')) index++;
    }
    ind.remove();
  }
  const from = book.chapterOrder.indexOf(chId);
  if (from === -1) return;
  snapshotStructure('chapter reorder');
  book.chapterOrder = book.chapterOrder.filter((c) => c !== chId);
  book.chapterOrder.splice(index, 0, chId);
  await saveMeta();
  renderChapters(); // renumbers heads and rebuilds the nav
  if (currentTab === 'outline') renderOutline();
});

document.documentElement.addEventListener('mouseleave', closeUnpinnedPanes);
window.addEventListener('blur', closeUnpinnedPanes);

// the wheel scrolls the manuscript even when the pointer floats over the
// dark margins beside the (narrower) page column
$('#editor-view').addEventListener('wheel', (e) => {
  const scroller = $('#paper-scroll');
  if (e.ctrlKey) return; // pinch-zoom gesture, not a scroll
  if (scroller.contains(e.target)) return; // native scrolling handles it
  if ($('#nav-pane').contains(e.target) || $('#side-pane').contains(e.target)) return;
  scroller.scrollTop += e.deltaY;
}, { passive: true });

$('#side-pin').onclick = () => pinPane('side', $('#side-pane').dataset.pinned !== '1');
$('#nav-pin').onclick = () => pinPane('nav', $('#nav-pane').dataset.pinned !== '1');
if (!NO_HOVER) {
  try {
    const kept = JSON.parse(localStorage.getItem('neo-pinned-panes') || '{}');
    if (kept.nav) pinPane('nav', true);
    if (kept.side) pinPane('side', true);
  } catch { /* nothing kept */ }
}

/* ================================================================== */
/*  TABS — Manuscript / Notes / Outline / Darlings                    */
/* ================================================================== */

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  tab.addEventListener('dblclick', async () => {
    const kind = tab.dataset.tab;
    if (kind !== 'notes' && kind !== 'outline') return;
    const name = await askInput(t('Rename tab'), t('New tab name'), tabName(kind));
    if (!name) return;
    book.tabNames[kind] = name;
    tab.textContent = name;
    saveMeta();
    // Renamed tabs become the default for future books
    library.tabDefaults = library.tabDefaults || {};
    library.tabDefaults[kind] = name;
    writeLibrary(library);
  });
});

document.addEventListener('dragstart', (e) => {
  // any text drag inside the manuscript lights up the bottom bar
  if (currentTab === 'manuscript' && e.target.closest && e.target.closest('.chapter-body')) {
    $('#bottombar').classList.add('attn');
    const sel = window.getSelection();
    draggedRange = sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
  }
});
document.addEventListener('dragend', () => { $('#bottombar').classList.remove('attn'); draggedRange = null; });

darlingsTab.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  darlingsTab.classList.add('drag-over');
});
darlingsTab.addEventListener('dragleave', () => darlingsTab.classList.remove('drag-over'));
darlingsTab.addEventListener('drop', async (e) => {
  e.preventDefault();
  darlingsTab.classList.remove('drag-over');
  const html = e.dataTransfer.getData('text/html');
  const text = e.dataTransfer.getData('text/plain');
  await moveSelectionToDarlings(html, text);
});

/* ================================================================== */
/*  STRUCTURED OUTLINE                                                */
/*  Chapter lines are the book's real chapters. Section notes become  */
/*  grayed "ghost" paragraphs in the manuscript                       */
/* ================================================================== */

$('#aux-editor').addEventListener('keydown', (e) => { if (styleKeepScroll(e)) return; smartKeys(e, e.currentTarget); });
$('#aux-editor').addEventListener('input', () => {
  auxDirty = true;
  scheduleAuxSave();
  if (spellOn) {
    const key = 'aux-' + ($('#aux-editor').dataset.kind || 'notes');
    scheduleSpellRescan(key, $('#aux-editor'));
  }
});
// notes paste arrives clean, same as the manuscript
$('#aux-editor').addEventListener('paste', (e) => {
  e.preventDefault();
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');
  if (html) document.execCommand('insertHTML', false, cleanPasteHtml(html));
  else if (text) document.execCommand('insertText', false, text.replace(/\r/g, ''));
});

/* ================================================================== */
/*  COUNTERS                                                          */
/* ================================================================== */

// click: chapter of chapters ↔ page of pages
$('#pos-counter').onclick = () => {
  library.posMode = library.posMode === 'page' ? 'chapter' : 'page';
  writeLibrary(library);
  updateCounters();
};

$('#word-counter').onclick = () => {
  wordMode = wordMode === 'book' ? 'chapter' : 'book';
  updateCounters();
};

// select a passage → the counter reports its size
document.addEventListener('selectionchange', () => {
  if (!book || currentTab !== 'manuscript') return;
  // the recount a click asked for would cover the count of the word a
  // double click goes on to select
  clearTimeout(saveTimers.selcount);
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    let el = sel.anchorNode;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    if (el && el.closest && el.closest('.chapter-body')) {
      const n = countWords(sel.toString());
      if (n > 0) {
        $('#word-counter').textContent = t('{n} selected', { n });
        return;
      }
    }
  }
  saveTimers.selcount = setTimeout(() => { if (book) updateCounters(); }, 150);
});

// track which chapter you're scrolled to
$('#paper-scroll').addEventListener('scroll', () => {
  clearTimeout(saveTimers.scroll);
  saveTimers.scroll = setTimeout(() => {
    const mid = window.innerHeight * 0.4;
    let best = null;
    for (const sec of $$('.chapter')) {
      if (sec.getBoundingClientRect().top < mid) best = sec.dataset.id;
    }
    if (best && best !== currentChapterId) {
      currentChapterId = best;
      highlightNav();
      updateCounters();
    }
  }, 120);
});

/* =================================================================== */
/*  REFRESH — picking up what another device wrote                     */
/*  A library shared over iCloud or Syncthing changes underneath NEO.  */
/*  Whenever NEO comes back into view it looks again: a chapter that   */
/*  changed on disk and not here is simply adopted; one that changed   */
/*  in both places keeps the local text on the page and lands the      */
/*  other device's version in a new chapter right after it, so that    */
/*  nothing is ever lost quietly.                                      */
/* =================================================================== */

window.addEventListener('focus', () => setTimeout(refreshFromDisk, 300));
// and a quiet look every half minute while NEO is on screen, for the writer
// who left both machines open
setInterval(() => { if (document.visibilityState === 'visible') refreshFromDisk(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setTimeout(refreshFromDisk, 300);
  else if (book) flushAllSaves(); // iOS may end a backgrounded app without warning
});

window.addEventListener('beforeunload', flushAllSaves);
// flush whenever focus leaves NEO, and every 20 seconds
window.addEventListener('blur', () => { if (book) flushAllSaves(); });
setInterval(() => { if (book) flushAllSaves('tick'); }, 20000);

$('#back-to-shelf').onclick = backToShelf;

/* ================================================================== */
/*  EDITOR — typing                                                   */
/* ================================================================== */

$('#editor-view').addEventListener('mousedown', caretFromEmptyClick);

/* ================================================================== */
/*  STRUCTURAL UNDO                                                   */
/*  Typing has the native ⌘Z. This covers the big moves — chapter     */
/*  deletes, replace-all, darlings — with snapshots of the whole      */
/*  structure.                                                        */
/* ================================================================== */

$('#author-chip').onclick = onAuthorClick;

document.addEventListener('keydown', () => { 
  lastHereActivity = Date.now(); 
}, true);
document.addEventListener('pointerdown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#chapters')) lastHereActivity = Date.now();
}, true);

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
  if ($('#editor-view').hidden || !book || !undoStack.length) return;
  const ae = document.activeElement;
  // inside text, ⌘Z belongs to typing; outside it, it belongs to structure
  if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  e.preventDefault();
  structuralUndo();
});

/* ================================================================== */
/*  READ ALOUD — ⌘⇧U (Ctrl+Shift+U)                                   */
/*  The computer's own voice reads from the caret, a sentence at a    */
/*  time, each one lit as it's read, on into the chapters after. ⌘⇧U  */
/*  again, Esc or a keystroke stops it, and the caret is left at the  */
/*  sentence it reached, so ⌘⇧U carries on from there. No keys, no    */
/*  cloud: the voices that come with macOS and Windows.               */
/* ================================================================== */

document.addEventListener('keydown', (e) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.shiftKey && !e.altKey && e.code === 'KeyU') {
    if (!book || $('#editor-view').hidden) return;
    e.preventDefault();
    e.stopPropagation();
    toggleReadAloud();
    return;
  }
  if (!reading || MODIFIER_KEYS.has(e.key)) return;
  // Esc stops the voice and nothing else; any other key stops it and goes on
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
  stopReadAloud(e.key === 'Escape');
}, true);

/* ================================================================== */
/*  FIND & REPLACE                                                    */
/* ================================================================== */

$('#search-input').addEventListener('input', () => {
  clearTimeout(saveTimers.search);
  saveTimers.search = setTimeout(runSearch, 250);
});
$('#search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); freshSearchIfStale(); gotoMatch(searchState.idx + (e.shiftKey ? -1 : 1)); }
  if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
  if (e.key === 'Tab' && !e.shiftKey) {
    const m = searchState.matches[Math.max(0, searchState.idx)];
    if (m) {
      e.preventDefault();
      const sel = window.getSelection();
      const r = m.range.cloneRange();
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      const body = m.range.startContainer.parentElement.closest('[contenteditable="true"]');
      if (body) body.focus();
    }
  }
});
$('#replace-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
  if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
});
$('#search-next').onclick = () => { freshSearchIfStale(); gotoMatch(searchState.idx + 1); };
$('#search-prev').onclick = () => { freshSearchIfStale(); gotoMatch(searchState.idx - 1); };
$('#replace-one').onclick = replaceCurrent;
$('#replace-all').onclick = replaceAllMatches;
$('#search-close').onclick = closeSearch;

/* ================================================================== */
/*  IMPORT                                                            */
/* ================================================================== */

$('#import-btn').onclick = importBooks;

/* ================================================================== */
/*  SPELLCHECK PASS + TYPEWRITER SCROLLING                            */
/* ================================================================== */

// right-click a flagged word for suggestions
document.addEventListener('contextmenu', async (e) => {
  if (!spellOn) return;
  const editor = e.target.closest && e.target.closest('.chapter-body, #aux-editor');
  if (!editor) return;
  const pos = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (!pos || pos.startContainer.nodeType !== Node.TEXT_NODE) return;
  const node = pos.startContainer;
  const text = node.data;
  // a capital slip (see capitalSlips): the letter's capital, and nothing to learn
  let ws = pos.startOffset;
  while (ws > 0 && /[\p{L}\p{M}]/u.test(text[ws - 1])) ws--;
  for (const list of capsRanges.values()) {
    const hit = list.find((r) => r.startContainer === node && r.startOffset === ws);
    if (!hit) continue;
    e.preventDefault();
    const at = hit.startOffset;
    const upper = text[at].toLocaleUpperCase(writingLanguage());
    const chEl = editor.closest('.chapter');
    showSpellMenu(e.clientX, e.clientY, text[at], [upper], {
      replace: (s) => {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(node, at); r.setEnd(node, at + 1);
        sel.removeAllRanges(); sel.addRange(r);
        document.execCommand('insertText', false, s);
        if (chEl) spellScanEl(spellElFor(chEl.dataset.id), chEl.dataset.id);
      }
    });
    return;
  }
  const isW = (c) => /[\p{L}\p{M}'’]/u.test(c);
  let a = pos.startOffset, b = pos.startOffset;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  if (a === b) return;
  let word = spellNorm(text.slice(a, b));
  if (spellCache.get(word) !== false) {
    // …or a hyphenated word underlined whole: every piece is a word, the
    // whole isn't (see spellScanEl)
    let wa = a, wb = b;
    while (text[wa - 1] === '-' && isW(text[wa - 2] || '')) { wa--; while (wa > 0 && isW(text[wa - 1])) wa--; }
    while (text[wb] === '-' && isW(text[wb + 1] || '')) { wb++; while (wb < text.length && isW(text[wb])) wb++; }
    const whole = spellNorm(text.slice(wa, wb));
    if (whole === word || spellCache.get(whole) !== false) return; // only flagged words get our menu
    if (text.slice(wa, wb).split('-').some((w) => spellCache.get(spellNorm(w)) === false)) return;
    a = wa; b = wb; word = whole;
  }
  e.preventDefault();
  const chEl = editor.closest ? editor.closest('.chapter') : null;
  const key = editor.id === 'aux-editor'
    ? 'aux-' + (editor.dataset.kind || 'notes')
    : (chEl ? chEl.dataset.id : null);
  const sugg = await window.neo.spellSuggest(word);
  showSpellMenu(e.clientX, e.clientY, word, sugg, {
    replace: (s) => {
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStart(node, a); r.setEnd(node, b);
      sel.removeAllRanges(); sel.addRange(r);
      document.execCommand('insertText', false, s);
      if (key) spellScanEl(spellElFor(key), key);
    },
    learn: async () => {
      library.customWords = library.customWords || [];
      if (!library.customWords.includes(word)) library.customWords.push(word);
      await writeLibrary(library);
      await window.neo.spellLearn(word);
      // Learning also accepts equivalent Unicode spellings. Recheck cached
      // failures so those variants lose their underlines in every editor.
      spellCache.clear();
      spellCache.set(word, true);
      for (const k of [...spellScanned]) spellScanEl(spellElFor(k), k);
    }
  });
});

new ResizeObserver(() => typewriterRoom()).observe($('#chapters'));
window.addEventListener('resize', typewriterRoom);

// The page follows the caret only while the writer is typing or moving by
// keyboard: a click to think about a sentence leaves the screen exactly as
// it was. The caret has a band of a few lines to move in before the page
// glides (not snaps) to bring it back to the writing height.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target;
  if (el && el.closest && el.closest('.chapter-body')) typewriterByKeyboard = true;
}, true);
document.addEventListener('mousedown', () => { typewriterByKeyboard = false; }, true);

document.addEventListener('selectionchange', () => {
  if (!typewriterEnabled || !book || currentTab !== 'manuscript' || !typewriterByKeyboard) return;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  let el = sel.anchorNode;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  if (!el || !el.closest || !el.closest('.chapter-body')) return;
  requestAnimationFrame(() => {
    try {
      let rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (rect.top === 0 && rect.height === 0)) rect = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 30;
      const diff = rect.top - window.innerHeight * 0.45;
      // a band of about three lines around the writing height
      if (Math.abs(diff) <= lineHeight * 1.5) return;
      const scroller = $('#paper-scroll');
      scroller.scrollTo({ top: scroller.scrollTop + diff, behavior: scrollBehavior() });
    } catch { /* selection mid-mutation; skip this frame */ }
  });
});

/* ================================================================== */
/*  FOCUS MODE: dim everything but the sentence or paragraph          */
/* ================================================================== */

document.addEventListener('selectionchange', () => {
  if (focusLevel === 'off') return;
  requestAnimationFrame(() => { try { updateFocus(); } catch { /* mid-mutation */ } });
});
document.addEventListener('input', () => {
  if (focusLevel === 'off') return;
  requestAnimationFrame(() => { try { updateFocus(); } catch { /* mid-mutation */ } });
});

/* ================================================================== */
/*  COVER ART SETTINGS (File → Cover Art…)                            */
/* ================================================================== */

$('#goal-counter').onclick = openStats;

/* ================================================================== */
/*  MENU: Help + fonts                                                */
/* ================================================================== */

$('#editor-view').addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setPageZoom((library.pageZoom || 1) * Math.exp(-e.deltaY * 0.005), { x: e.clientX, y: e.clientY });
}, { passive: false });

// zoom control in the bottom bar: buttons, click-to-reset, and scroll
$('#zoom-in').onclick = () => setPageZoom((library.pageZoom || 1) + 0.1);
$('#zoom-out').onclick = () => setPageZoom((library.pageZoom || 1) - 0.1);
$('#zoom-level').onclick = () => setPageZoom(1);
$('#zoom-control').addEventListener('wheel', (e) => {
  e.preventDefault();
  setPageZoom((library.pageZoom || 1) * Math.exp(-e.deltaY * 0.002));
}, { passive: false });

// /* ================================================================== */
// /*  Linux body fonts                                                  */
// /*  Georgia, Palatino, Baskerville, Hoefler Text, and Iowan Old Style */
// /*  are not on Linux. The bundled faces below are what the Format     */
// /*  menu and the first-run picker offer instead. Old libraries still  */
// /*  resolve the macOS names, but those names stay out of the picker.  */
// /* ================================================================== */

installLinuxBodyFonts();

window.neo.onMenu(async (msg) => {
  // full screen and focus mode together hide the bottom bar until hovered
  // (styles.css); the window says when it goes in and out, whatever is open
  if (msg.type === 'fullScreen') { document.body.classList.toggle('full-screen', !!msg.value); return; }
  if ($('#keyboard-shortcuts') && msg.type !== 'help') return;
  // a window the menu opens (⌘, for Goals, say) never stacks on one that's
  // already open: pressing it again used to pile up overlays
  const WINDOWS = ['stats', 'about', 'emailSettings', 'coverArt', 'reshelve', 'checkUpdate'];
  if (WINDOWS.includes(msg.type) && document.querySelector('.modal-backdrop:not([hidden])')) {
    if (msg.type === 'checkUpdate' && updateDialog) updateDialog.focus();
    return;
  }
  if (msg.type === 'help') showHelp();
  if (msg.type === 'about') showAbout();
  if (msg.type === 'checkUpdate') checkForUpdate();
  if (msg.type === 'update') updateMessage(msg);
  if (msg.type === 'export') doExport(msg.format);
  if (msg.type === 'markdownEmphasis') {
    if (msg.checked) delete library.markdownOff; else library.markdownOff = true;
    await writeLibrary(library);
    toast(msg.checked ? t('Markdown emphasis on: *italic*, **bold**') : t('Markdown emphasis off: asterisks stay asterisks'));
  }
  if (msg.type === 'exportCustomChapterTitles') {
    library.exportCustomChapterTitles = msg.checked;
    await writeLibrary(library);
  }
  if (msg.type === 'emailDraft') doEmailDraft();
  if (msg.type === 'emailSettings') emailSettings();
  if (msg.type === 'find') openSearch();
  if (msg.type === 'spellcheck') toggleSpellcheck();
  if (msg.type === 'spellLanguage') changeSpellLanguage(msg.value);
  if (msg.type === 'reshelve') reshelveBook();
  if (msg.type === 'typewriter') toggleTypewriter();
  if (msg.type === 'vim') toggleVim();
  if (msg.type === 'focus') setFocus(msg.value);
  if (msg.type === 'focusCycle') cycleFocus();
  if (msg.type === 'import') importBooks();
  if (msg.type === 'stats') openStats();
  if (msg.type === 'chapterStep') gotoChapter(msg.value);
  if (msg.type === 'writingStyle') {
    library.writingStyle = msg.value;
    await writeLibrary(library);
    if (window.neo.writingStyleState) window.neo.writingStyleState(library.writingStyle);
  }
  if (msg.type === 'coverArt') openCoverArt();
  if (msg.type === 'align') {
    applyAlign(msg.value);
  }
  if (msg.type === 'poetry') togglePoetry();
  if (msg.type === 'flush') toggleFlush();
  if (msg.type === 'uiLanguage') {
    // save every open page, then reload the window in the new language
    flushAllSaves();
    try { if (book && !$('#editor-view').hidden) sessionStorage.setItem('neo-reopen', book.id); } catch { /* a nicety */ }
    setTimeout(() => window.neo.reloadForLanguage(), 400);
  }
  if (msg.type === 'uiZoom') {
    library.uiZoom = msg.value;
    await writeLibrary(library);
    applyFonts();
  }
  if (msg.type === 'uiBright') {
    library.uiBright = !document.body.classList.contains('bright');
    await writeLibrary(library);
    applyFonts();
  }
  if (msg.type === 'pageTheme') {
    library.pageTheme = msg.value;
    await writeLibrary(library);
    applyFonts();
  }
  if (msg.type === 'fontSize') {
    await setEditorFontSize(msg.value);
  }
  if (msg.type === 'bodyFontPick') {
    const name = await pickLocalFont();
    if (name) {
      library.fonts = library.fonts || {};
      library.fonts.body = name;
      await writeLibrary(library);
    }
    applyFonts(); // also undoes a hover preview after Cancel
  }
  if (msg.type === 'bodyFont') {
    library.fonts = library.fonts || {};
    library.fonts.body = msg.value;
    await writeLibrary(library);
    applyFonts();
  }
  if (msg.type === 'dropCap') {
    library.fonts = library.fonts || {};
    library.fonts.dropcap = msg.value;
    await writeLibrary(library);
    applyFonts();
  }
});

/* ================================================================== */
/*  ACCESSIBILITY: keyboard, screen readers, system settings          */
/* ================================================================== */
// NEO stays quiet by design; these make the quiet parts reachable. The
// system's own settings decide the rest: "Increase contrast" turns on the
// Brighter Interface, "Reduce motion" stills the fades and slides.

for (const id of ['#author-chip', '#goal-counter', '#word-counter', '#pos-counter', '#zoom-level']) pressable($(id));

// The mouse leaves nothing focused in the quiet chrome, as before these were
// focusable: after a click on a book, a chapter row, a tab, a counter or a
// button there, the writer's next keys don't press it again, wake the bottom
// bar or slide a pane open. (Text fields keep focus; they always show it.)
document.addEventListener('mouseup', () => {
  const el = document.activeElement;
  if (!el || el === document.body || el.matches(':focus-visible') || el.closest('.modal-backdrop')) return;
  if (el.closest('#bottombar, #nav-pane, #side-pane, #shelf-header, #shelves')) el.blur();
}, true);

// the tabs: Enter or Space opens one, ← → move along the row
$$('.tab').forEach((tab, i, all) => {
  tab.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tab.click(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus();
    }
  });
});

// Dialogs: announced as dialogs, keyboard focus moves inside (so Esc and
// Enter reach them) and comes back to where it was when they close.
// let focusBeforeDialog = null;
document.addEventListener('focusin', (e) => {
  if (e.target.closest('.modal-backdrop')) return;
  // only what the keyboard reached gets focus back when a dialog closes; after
  // a click, the next Space the writer types must not press that control again
  focusBeforeDialog = e.target.matches(':focus-visible') ? e.target : null;
}, true);

new MutationObserver((muts) => {
  for (const m of muts) {
    m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains('modal-backdrop')) dialogify(n); });
    m.removedNodes.forEach((n) => {
      const back = n._returnFocus;
      if (!back || !back.isConnected || back.isContentEditable) return; // the page restores its own caret
      if (document.activeElement && document.activeElement !== document.body) return;
      back.focus({ preventScroll: true });
    });
  }
}).observe(document.body, { childList: true });
$$('.modal-backdrop').forEach(dialogify);

// F6 walks the regions a mouse finds by hovering: the page, the chapters
// pane, the notes pane, the bottom bar. ⇧F6 walks back; Esc returns to
// the page from any of them. A pane opened this way closes when the
// keyboard leaves it, unless it is pinned.
$('#paper-scroll').addEventListener('focusout', (e) => {
  if ($('#paper-scroll').contains(e.relatedTarget)) return;
  const sel = window.getSelection();
  if (sel.rangeCount && e.target.isContentEditable) pagePlace = { el: e.target, range: sel.getRangeAt(0).cloneRange() };
});

for (const pane of [$('#nav-pane'), $('#side-pane')]) {
  pane.addEventListener('focusout', (e) => {
    if (pane.contains(e.relatedTarget) || pane.dataset.kbd !== '1') return;
    // a list rebuilt under the keyboard hands focus straight back: wait a beat
    setTimeout(() => {
      if (pane.contains(document.activeElement) || pane.dataset.kbd !== '1') return;
      pane.dataset.kbd = '0';
      if (pane.dataset.pinned !== '1' && !chapterDragActive) pane.classList.remove('open');
    }, 0);
  });
}

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-backdrop:not([hidden])')) return;
  if ($('#editor-view').hidden) {
    if (!regionKey(e)) return;
    e.preventDefault();
    const at = SHELF_REGIONS.findIndex((r) => r.box().contains(document.activeElement));
    SHELF_REGIONS[at < 0 ? 0 : (at + 1) % SHELF_REGIONS.length].enter();
    return;
  }
  const here = REGIONS.findIndex((r) => r.box().contains(document.activeElement));
  if (regionKey(e)) {
    e.preventDefault();
    // from nowhere in particular (a book just opened), forward starts at the page
    if (here < 0) { REGIONS[e.shiftKey ? REGIONS.length - 1 : 0].enter(); return; }
    REGIONS[(here + (e.shiftKey ? REGIONS.length - 1 : 1)) % REGIONS.length].enter();
    return;
  }
  // Esc from a pane or the bottom bar: back to the words, not to the shelf
  if (e.key === 'Escape' && !e.isComposing && here > 0 && $('#searchbar').hidden) {
    e.preventDefault();
    e.stopPropagation();
    focusPage();
  }
}, true);
// up and down the chapter list
$('#nav-list').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('n-row') || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  e.preventDefault();
  const rows = $$('#nav-list .n-row');
  const i = rows.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1);
  if (rows[i]) rows[i].focus();
});

/* ================================================================== */

loadLibrary().then(() => {
  applyFonts();
  typewriterEnabled = !!library.typewriter;
  applyTypewriter();
  vimEnabled = !!library.vimKeys;
  applyVim();
  focusLevel = FOCUS_LEVELS.includes(library.focus) ? library.focus : 'off';
  applyFocus();
});
