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
