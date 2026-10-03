/* ================================================================== */
/*  EDITOR — typing                                                   */
/* ================================================================== */

function wireChapterBody(body, chId) {
  body.addEventListener('focus', () => { currentChapterId = chId; updateCounters(); highlightNav(); });

  body.addEventListener('input', () => {
    breakRun = 0; // fresh typing: ⌘Z belongs to the engine again
    markDialogueOpening(body);
    chapterHTML[chId] = captureBody(body);
    wordCache[chId] = null;
    scheduleChapterSave(chId);
    if (spellOn) scheduleSpellRescan(chId, body);
    updateCounters();
    scheduleNavRefresh();
    if (!typewriterEnabled) revealCaret();
  });
  // paste without formatting
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    // hyphens set as dialogue dashes, the same as typing them
    const edges = caretEdges(body);
    if (html) {
      document.execCommand('insertHTML', false, cleanPasteHtml(html, { style: dashStyle(), ...edges }));
      reconcileMarks();
    } else if (text) {
      const parts = text.replace(/\r/g, '').split(/\n+/).filter((p) => p.trim());
      parts.forEach((p, i) => {
        if (i > 0) document.execCommand('insertParagraph');
        const line = dialogueDashes(p.trim(), dashStyle(), { start: i > 0 || edges.start, end: i < parts.length - 1 || edges.end, spaced: i === 0 && edges.spaced });
        // plain text written in Markdown keeps its *italics* and **bold**
        const styled = library && library.markdownOff ? null : markdownInline(line);
        if (styled) {
          document.execCommand('insertHTML', false, styled);
          stripJunkSpans(body); // the engine wraps inserted HTML in style spans
        } else document.execCommand('insertText', false, line);
      });
    }
  });
  // While macOS composes input, shortcuts stand down completely.
  let composing = false;
  body.addEventListener('compositionstart', () => { composing = true; });
  body.addEventListener('compositionend', () => { composing = false; });
  body.addEventListener('keydown', (e) => {
    // An input method mid-word owns the keys. Its marker (keyCode 229) also
    // rides on Enter with nothing being composed, as on GNOME (Wayland, IBus),
    // where it kept ⇧Enter and ⌘⇧Enter from ever reaching NEO.
    if (composing || e.isComposing || (e.keyCode === 229 && e.key !== 'Enter')) return;
    // count consecutive Enters — the double/triple rhythm works mid-sentence
    if (e.key === 'Enter' && !e.shiftKey) enterRun++;
    else enterRun = 0;
    // ⌘Z right after a break operation undoes the break via the structural
    // stack — the engine's own undo never saw it and would corrupt the page
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ' && breakRun > 0 && undoStack.length) {
      e.preventDefault();
      breakRun--;
      structuralUndo();
      return;
    }
    // Chromium's selection-delete can duplicate a neighboring character when
    // the selection spans fragmented text nodes. Merging the fragments right
    // before any destructive keystroke.
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const s = window.getSelection();
      const destructive = e.key === 'Backspace' || e.key === 'Delete' ||
        (s && !s.isCollapsed && (e.key.length === 1 || e.key === 'Enter'));
      if (destructive) healSelectionSeams(body);
    }
    if (styleKeepScroll(e)) return;
    if (handlePoetry(e, body, chId)) return;
    if (handleFlush(e, body, chId)) return;
    if (poetryBackspace(e, body, chId)) return;
    if (sceneBreakDelete(e, body, chId)) return;
    if (spaceSafeDelete(e, body, chId)) return;
    if (emptyChapterBackspace(e, body, chId)) return;
    if (chapterStartBackspace(e, body, chId)) return;
    if (guardMarkerDelete(e, body, chId)) return;
    // "Espere -" then Enter: the dash goes in before the paragraph ends
    if (e.key === 'Enter') dialogueDashKey(e, body);
    if (handleEnter(e, body, chId)) return;
    if (handleTabSpacing(e)) return;
    smartKeys(e, body);
  });
  // when the whole chapter loses focus, merge every fragmented text node
  body.addEventListener('blur', () => {
    try { body.normalize(); } catch { /* nothing to merge */ }
  });
  body.addEventListener('mousedown', () => { enterRun = 0; });
  body.addEventListener('click', (e) => {
    const mark = e.target.closest('.ph-mark');
    if (mark) focusSticky(mark.dataset.sid);
    // clicking a ghost outline note selects it, ready to be replaced with prose
    const ghost = e.target.closest('p.ghost');
    if (ghost) {
      const r = document.createRange();
      r.selectNodeContents(ghost);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  });
  // A line break the engine is about to make on its own is ⇧Enter that the
  // keys above never saw (an input method can carry it past them): it
  // becomes the flush paragraph ⇧Enter makes, or the next line of a poem.
  body.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertLineBreak' || e.defaultPrevented) return;
    const key = { key: 'Enter', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => e.preventDefault() };
    if (!handlePoetry(key, body, chId)) handleFlush(key, body, chId);
  });
  // the moment writing hits a ghost, it becomes prose
  // (it keeps its data-sec-id so the outline knows it's been written)
  body.addEventListener('beforeinput', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let el = sel.anchorNode;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    const ghost = el && el.closest ? el.closest('p.ghost') : null;
    if (ghost && body.contains(ghost)) {
      ghost.classList.remove('ghost');
    }
  });
}

// the contents have nothing to type in: going there is only looking
function showEntry(chId) {
  const sec = document.querySelector(`.chapter[data-id="${chId}"]`);
  if (!sec) return;
  if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
  sec.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  currentChapterId = chId;
  highlightNav();
  updateCounters();
}

function focusChapterStart(chId) {
  const nb = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
  if (!nb) return;
  if (!nb.isContentEditable) { showEntry(chId); return; }
  nb.focus({ preventScroll: true });
  const nr = document.createRange();
  const first = nb.querySelector('p');
  if (first) nr.setStart(first, 0); // inside the first paragraph, not the container
  else nr.selectNodeContents(nb);
  nr.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(nr);
  currentChapterId = chId;
  highlightNav();
}

// The caret at the last character of a chapter, inside its last paragraph,
// with the view kept where the writer is — not thrown to the chapter's top
function focusChapterEnd(chId) {
  const nb = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
  if (!nb) return;
  if (!nb.isContentEditable) { showEntry(chId); return; }
  nb.focus({ preventScroll: true });
  const nr = document.createRange();
  const paras = nb.querySelectorAll('p');
  const last = paras[paras.length - 1];
  if (last) {
    // the last text node that's really editable (skips placeholders and ghosts)
    const walk = document.createTreeWalker(last, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.isContentEditable
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    let text = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) text = n;
    if (text) nr.setStart(text, text.length);
    else nr.setStart(last, 0); // an empty last line: before its <br>
  } else {
    nr.selectNodeContents(nb);
  }
  nr.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(nr);
  currentChapterId = chId;
  highlightNav();
  revealCaret();
}

// Backspace in an empty chapter deletes it:
function emptyChapterBackspace(e, body, chId) {
  if (e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (body.innerText.trim() !== '') return false; // ghosts count as content
  const idx = book.chapterOrder.indexOf(chId);
  if (idx < 0 || book.chapterOrder.length < 2) return false;
  e.preventDefault();
  snapshotStructure('empty chapter removed');
  breakRun++;
  if (idx > 0) {
    const prev = book.chapterOrder[idx - 1];
    deleteChapterQuiet(chId).then(() => { focusChapterEnd(prev); resetNativeUndo(); });
  } else {
    // an empty chapter 1 dissolves too — the caret lands at the top of
    // what just became the new chapter 1
    const next = book.chapterOrder[1];
    deleteChapterQuiet(chId).then(() => { focusChapterStart(next); resetNativeUndo(); });
  }
  return true;
}

// ⌘B / ⌘I applied by hand: the engine's native handling scrolls the
// selection "into view" and mis-measures NEO's transformed page column,
// throwing the reader to the top of the screen. Style, don't scroll.
function styleKeepScroll(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  const cmd = e.shiftKey
    ? (e.code === 'KeyS' ? 'strikeThrough' : null)
    : ({ KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' })[e.code];
  if (!cmd) return false;
  e.preventDefault();
  const sc = $('#paper-scroll');
  const keep = sc.scrollTop;
  document.execCommand(cmd);
  sc.scrollTop = keep;
  requestAnimationFrame(() => { sc.scrollTop = keep; });
  return true;
}

// A click on the page's empty space puts the caret where it means: below
// the text, at the end of that chapter; in the margin beside a line, on that
// line; above the first line, at the start. Margins, the space under the
// last line, the gaps between chapters and the dark room around the pages
// all count.
function caretFromEmptyClick(e) {
  if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!book || currentTab !== 'manuscript') return;
  const t = e.target;
  if (!t || !t.closest || t.closest('[contenteditable="true"], input, textarea, button, a, .pop-menu, .ph-mark, #title-page')) return;
  if (t.closest('.chapter-head') && t !== t.closest('.chapter-head')) return; // its number and title answer clicks themselves
  if (!(t.matches('.chapter, .chapter-head, #chapters, #paper, #paper-scroll, #editor-view'))) return;
  // the chapter whose page this is, or the one just above a gap
  let sec = t.closest('.chapter');
  if (!sec) {
    for (const c of document.querySelectorAll('#chapters .chapter')) {
      if (c.getBoundingClientRect().top <= e.clientY) sec = c; else break;
    }
  }
  if (!sec) return;
  const body = sec.querySelector('.chapter-body');
  if (!body || !body.isContentEditable) return;
  const box = body.getBoundingClientRect();
  const chId = sec.dataset.id;
  e.preventDefault();
  if (e.clientY < box.top) { focusChapterStart(chId); return; }
  if (e.clientY > box.bottom) { focusChapter(chId); return; }
  const x = Math.min(Math.max(e.clientX, box.left + 2), box.right - 2);
  const r = document.caretRangeFromPoint(x, e.clientY);
  if (!r || !body.contains(r.startContainer)) { focusChapter(chId); return; }
  body.focus({ preventScroll: true });
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  currentChapterId = chId;
  highlightNav();
  updateCounters();
}

// ⌥⌘↓ / ⌥⌘↑ (Ctrl+Alt on Windows and Linux): the start of the next or the
// previous chapter, without opening the pane
function gotoChapter(step) {
  if (!book || $('#editor-view').hidden || !book.chapterOrder.length) return;
  if (document.querySelector('.modal-backdrop:not([hidden])')) return;
  if (currentTab !== 'manuscript') switchTab('manuscript');
  const order = book.chapterOrder;
  let at = order.indexOf(currentChapterId);
  if (at < 0) at = step > 0 ? -1 : order.length;
  const to = Math.max(0, Math.min(order.length - 1, at + step));
  if (to === at) return;
  const sec = document.querySelector(`.chapter[data-id="${order[to]}"]`);
  if (!sec) return;
  focusChapterStart(order[to]);
  sec.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

// The caret never types out of sight: an Enter (or anything else) on the
// window's bottom line brings the new line into view, with a little room
// below it. (Typewriter scrolling keeps the line centered on its own.)
function revealCaret() {
  const sc = $('#paper-scroll');
  const sel = window.getSelection();
  if (!sc || !sel.rangeCount || !sc.contains(sel.anchorNode)) return;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(false);
  let rect = r.getBoundingClientRect();
  if (!rect.height) {
    // an empty line has no text to measure: its paragraph does
    const node = r.endContainer.nodeType === Node.ELEMENT_NODE ? r.endContainer : r.endContainer.parentElement;
    if (!node) return;
    rect = node.getBoundingClientRect();
  }
  const box = sc.getBoundingClientRect();
  const room = Math.min(48, box.height / 6);
  if (rect.bottom > box.bottom - room) sc.scrollTop += rect.bottom - (box.bottom - room);
  else if (rect.top < box.top + 8) sc.scrollTop -= box.top + 8 - rect.top;
}

function chapterStartBackspace(e, body, chId) {
  if (e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(body);
  try { pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
  if (pre.toString().length !== 0) return false; // caret isn't at the chapter's first character
  // …and on its first line. Below an empty line, Backspace takes the empty
  // line away and the paragraph moves up to the top of the chapter; it
  // never reaches past it into the chapter above.
  let el = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
  const block = el && el.closest ? el.closest('p') : null;
  if (block && body.contains(block) && block !== body.firstElementChild) {
    const above = block.previousElementSibling;
    if (!above || above.tagName !== 'P' || above.classList.contains('scene-break') || above.classList.contains('ghost')) return false;
    e.preventDefault();
    snapshotStructure('empty line removed');
    above.remove();
    placeCaret(block, 0);
    syncChapter(body, chId);
    resetNativeUndo();
    breakRun++;
    return true;
  }
  const idx = book.chapterOrder.indexOf(chId);
  if (idx <= 0) return false;
  const prevId = book.chapterOrder[idx - 1];
  const prevBody = document.querySelector(`.chapter[data-id="${prevId}"] .chapter-body`);
  if (!prevBody || chapterKind(prevId) === 'contents') return false;
  const empty = prevBody.innerText.trim() === '';
  // only story runs into story: a page above stays a page
  if (!empty && !(isStory(chId) && isStory(prevId))) return false;
  e.preventDefault();
  if (empty) {
    // empty chapter above: swallow it
    snapshotStructure('empty chapter removed');
    breakRun++;
    deleteChapterQuiet(prevId).then(() => { focusChapterStart(chId); resetNativeUndo(); });
    return true;
  }
  // chapter with words above: merge this chapter up into it — the inverse
  // of a triple-Enter split, and ⌘Z restores the split
  snapshotStructure('chapters merged');
  const prevCount = prevBody.querySelectorAll('p').length;
  const keepScroll = $('#paper-scroll').scrollTop;
  chapterHTML[prevId] = captureBody(prevBody) + captureBody(body);
  persistChapter(prevId);
  for (const s of stickies) if (s.chapterId === chId) s.chapterId = prevId;
  window.neo.writeJSON(book.id, 'stickies', stickies);
  for (const d of darlings) if (d.chapterId === chId) d.chapterId = prevId;
  window.neo.writeJSON(book.id, 'darlings', darlings);
  if (book.sectionNotes && book.sectionNotes[chId]) {
    book.sectionNotes[prevId] = [...(book.sectionNotes[prevId] || []), ...book.sectionNotes[chId]];
    delete book.sectionNotes[chId];
  }
  if (book.chapterTitles) delete book.chapterTitles[chId];
  if (book.chapterNotes) delete book.chapterNotes[chId];
  if (book.chapterKinds) delete book.chapterKinds[chId];
  book.chapterOrder = book.chapterOrder.filter((c) => c !== chId);
  delete chapterHTML[chId];
  window.neo.deleteChapter(book.id, chId);
  saveMeta();
  renderChapters();
  renderStickies();
  restoreCaret({ chId: prevId, pIdx: prevCount, off: 0, scroll: keepScroll });
  resetNativeUndo();
  breakRun++;
  return true;
}

// Tab for spacing:
function handleTabSpacing(e) {
  if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return false;
  e.preventDefault();
  if (!e.shiftKey) {
    document.execCommand('insertText', false, '  ');
    return true;
  }
  // Shift+Tab: remove up to two preceding em spaces
  const sel = window.getSelection();
  if (sel.rangeCount && sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      let n = 0;
      while (n < 2 && r.startOffset - n > 0 &&
             node.textContent[r.startOffset - n - 1] === ' ') n++;
      if (n > 0) {
        const del = document.createRange();
        del.setStart(node, r.startOffset - n);
        del.setEnd(node, r.startOffset);
        del.deleteContents();
      }
    }
  }
  return true;
}

function flatOffset(p, container, offset) {
  // flatten any (container, offset) pair to a character offset in p.textContent
  let n;
  if (container.nodeType !== Node.TEXT_NODE) {
    if (!p.contains(container) && container !== p) return -99;
    let acc = 0;
    for (let i = 0; i < offset && i < container.childNodes.length; i++) {
      acc += container.childNodes[i].textContent.length;
    }
    let before = 0;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    while ((n = w.nextNode())) {
      if (container === p || container.contains(n)) break;
      before += n.textContent.length;
    }
    return (container === p ? 0 : before) + acc;
  }
  let pos = 0;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  while ((n = walker.nextNode())) {
    if (n === container) return pos + offset;
    pos += n.textContent.length;
  }
  return -1;
}

function flatPoint(p, off) {
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let pos = 0, n;
  while ((n = w.nextNode())) {
    const len = n.textContent.length;
    if (off <= pos + len) return [n, off - pos];
    pos += len;
  }
  return null;
}

// A delete that leaves two plain spaces touching triggers the engine's broken
// whitespace repair, which duplicates a neighboring character. When that exact
// hazard is about to happen, take the right-hand space along with the deletion,
// leaving one clean space. All other deletes stay native.
function spaceSafeDelete(e, body, chId) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  const elOf = (n) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : n);
  const pA = elOf(r.startContainer)?.closest?.('p');
  const pB = elOf(r.endContainer)?.closest?.('p');
  if (!pA || pA !== pB || !body.contains(pA)) return false;
  const t = pA.textContent;
  let from, to;
  if (sel.isCollapsed) {
    const at = flatOffset(pA, r.startContainer, r.startOffset);
    if (at < 0) return false;
    if (e.key === 'Backspace') { from = at - 1; to = at; } else { from = at; to = at + 1; }
    if (from < 0 || to > t.length) return false;
  } else {
    from = flatOffset(pA, r.startContainer, r.startOffset);
    to = flatOffset(pA, r.endContainer, r.endOffset);
    if (from < 0 || to <= from) return false;
  }
  if (t[from - 1] !== ' ' || t[to] !== ' ') return false;
  let end = to;
  while (t[end] === ' ') end++;
  const a = flatPoint(pA, from), b = flatPoint(pA, end);
  if (!a || !b) return false;
  e.preventDefault();
  const nr = document.createRange();
  nr.setStart(a[0], a[1]); nr.setEnd(b[0], b[1]);
  sel.removeAllRanges(); sel.addRange(nr);
  document.execCommand('insertText', false, '');
  return true;
}

// Merge fragmented text nodes in the paragraph(s) the selection touches,
// so native editing operates on whole text instead of seams.
function healSelectionSeams(body) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const paraOf = (n) => {
    if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    return n && n.closest ? n.closest('p') : null;
  };
  const a = paraOf(r.startContainer);
  const b = paraOf(r.endContainer);
  try { if (a && body.contains(a)) a.normalize(); } catch { /* fine */ }
  try { if (b && b !== a && body.contains(b)) b.normalize(); } catch { /* fine */ }
}

// Chromium mangles Backspace/Delete beside non-editable inline elements:
function guardMarkerDelete(e, body, chId) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  const back = e.key === 'Backspace';
  const isMark = (n) => n && n.nodeType === Node.ELEMENT_NODE &&
    (n.classList.contains('ph-mark') || n.classList.contains('darling-anchor'));

  // Case 1: the deletion would cross INTO a marker (caret at a node boundary,
  // marker on the far side) — delete the marker itself, cleanly.
  let adjacent = null;
  if (node.nodeType === Node.TEXT_NODE) {
    if (back && r.startOffset === 0) adjacent = node.previousSibling;
    else if (!back && r.startOffset === node.textContent.length) adjacent = node.nextSibling;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    adjacent = back ? node.childNodes[r.startOffset - 1] : node.childNodes[r.startOffset];
  }
  if (isMark(adjacent)) {
    e.preventDefault();
    if (adjacent.classList.contains('ph-mark') && adjacent.dataset.sid) {
      resolveSticky(adjacent.dataset.sid); // removes mark + its note, syncs
    } else {
      adjacent.remove();
      syncChapter(body, chId);
    }
    return true;
  }

  // Case 2: deleting a character inside a text node that TOUCHES a marker:
  if (node.nodeType !== Node.TEXT_NODE) return false;
  if (back ? r.startOffset === 0 : r.startOffset >= node.textContent.length) return false;
  if (!isMark(node.previousSibling) && !isMark(node.nextSibling)) return false;

  e.preventDefault();
  const targetOffset = back ? r.startOffset - 1 : r.startOffset;
  const del = document.createRange();
  del.setStart(node, targetOffset);
  del.setEnd(node, targetOffset + 1);
  del.deleteContents();
  const caret = document.createRange();
  caret.setStart(node, targetOffset);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
  syncChapter(body, chId);
  return true;
}

// The engine wraps text in style-carrying spans during merges and splits
// ("<span style='text-indent...'>"). They corrupt later edits — unwrap them,
// keeping only NEO's own marks.
function stripJunkSpans(el) {
  for (const s of [...el.querySelectorAll('span:not(.ph-mark)')]) {
    while (s.firstChild) s.before(s.firstChild);
    s.remove();
  }
}

// Enter once: new paragraph. Enter twice: *** section break — wherever the
// caret is, even mid-sentence. Enter three times: the chapter splits here.
let enterRun = 0;
// break operations live outside the engine's undo history; while the most
// recent edits are breaks, ⌘Z routes to NEO's structural undo, one per press
let breakRun = 0;

function splitChapterAt(body, chId, block, sel) {
  // an empty line is no way to start a chapter, or end one: blank lines at
  // the seam stay behind (the new chapter opens on its first words)
  const blank = (p) => p && p.tagName === 'P' && !p.classList.contains('scene-break') && p.textContent.trim() === '' && !p.querySelector('.ph-mark');
  while (blank(block) && block.nextElementSibling) {
    const next = block.nextElementSibling;
    block.remove();
    block = next;
  }
  while (blank(block.previousElementSibling) && block.previousElementSibling.previousElementSibling) block.previousElementSibling.remove();
  const parts = [];
  let n = block;
  while (n) {
    const next = n.nextElementSibling;
    parts.push(n.outerHTML);
    n.remove();
    n = next;
  }
  if (!body.querySelector('p')) body.innerHTML = '<p><br></p>';
  syncChapter(body, chId);
  const idx = book.chapterOrder.indexOf(chId);
  const newId = createChapterAt(idx + 1);
  chapterHTML[newId] = parts.join('') || '<p><br></p>';
  persistChapter(newId);
  renderChapters();
  focusChapterStart(newId);
  resetNativeUndo();
  document.querySelector(`.chapter[data-id="${newId}"] p`).scrollIntoView({ block: 'start' });
  breakRun++;
}

function handleEnter(e, body, chId) {
  if (e.key !== 'Enter' || e.shiftKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  let el = sel.anchorNode;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const block = el && el.closest ? el.closest('p') : null;
  if (!block || !body.contains(block)) return false;
  // on a page (a dedication, a part, the copyright) Enter is only a new
  // line: breaks and new chapters belong to the story
  if (!isStory(chId) && !block.classList.contains('poetry')) {
    e.preventDefault();
    enterRun = 0;
    if (block.querySelector('span:not(.ph-mark)')) {
      const caret = captureCaret();
      stripJunkSpans(block);
      restoreCaret(caret);
    }
    document.execCommand('insertParagraph');
    syncChapter(body, chId);
    return true;
  }
  if (block.classList.contains('scene-break')) { e.preventDefault(); return true; } // Enter on a *** line: nothing
  // Enter in a poetry paragraph steps back into prose: an empty line becomes
  // an ordinary paragraph in place; otherwise the line splits and the new
  // paragraph is plain (⇧Enter is how the poem continues)
  if (block.classList.contains('poetry') || block.classList.contains('flush')) {
    e.preventDefault();
    enterRun = 0;
    if (block.textContent.trim() === '') {
      snapshotStructure('poetry paragraph to prose');
      block.classList.remove('poetry', 'flush');
      romanize(block);
      placeCaret(block, 0);
      syncChapter(body, chId);
      resetNativeUndo();
      breakRun++;
      return true;
    }
    const wasPoetry = block.classList.contains('poetry');
    document.execCommand('insertParagraph');
    const cur = caretBlock(body);
    if (cur && cur !== block) {
      cur.classList.remove('poetry', 'flush');
      if (wasPoetry) romanize(cur);
      placeCaret(cur, 0);
    }
    syncChapter(body, chId);
    return true;
  }
  const prev = block.previousElementSibling;

  if (block.textContent.trim() !== '') {
    // caret inside a real paragraph — where is it?
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(block);
    try { pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
    const atStart = pre.toString().length === 0;

    // second/third Enter mid-flow: the caret sits at the start of the text
    // that the previous press pushed down
    if (atStart && enterRun >= 2 && prev) {
      if (prev.classList.contains('scene-break')) {
        // third Enter: everything from here becomes the next chapter
        e.preventDefault();
        snapshotStructure('chapter split');
        prev.remove();
        splitChapterAt(body, chId, block, sel);
        return true;
      }
      e.preventDefault();
      // a break made by the full double-Enter gesture un-splits on undo too
      snapshotStructure('section break', { rejoin: enterRun >= 2 });
      if (prev.textContent.trim() === '') {
        // a break is only a break: no alignment or paragraph kind carried
        // over from the paragraph it was made in (a justified one set it left)
        prev.removeAttribute('style');
        prev.className = 'scene-break';
        prev.textContent = '***';
      } else {
        const brk = document.createElement('p');
        brk.className = 'scene-break';
        brk.textContent = '***';
        block.before(brk);
      }
      const keep = document.createRange();
      keep.setStart(block, 0);
      keep.collapse(true);
      sel.removeAllRanges();
      sel.addRange(keep);
      syncChapter(body, chId);
      resetNativeUndo();
      breakRun++;
      return true;
    }

    // normal Enter — native split so ⌘Z keeps working; junk spans (which
    // make the engine clone whole paragraphs) are stripped first if present
    e.preventDefault();
    if (block.querySelector('span:not(.ph-mark)')) {
      // Unwrapping moves text nodes, so preserve the caret's text position.
      const caret = captureCaret();
      stripJunkSpans(block);
      restoreCaret(caret);
    }
    document.execCommand('insertParagraph');
    syncChapter(body, chId);
    return true;
  }

  // Third Enter at end of flow: empty paragraph under a *** — chapter splits here
  if (prev && prev.classList.contains('scene-break')) {
    e.preventDefault();
    snapshotStructure('chapter split');
    prev.remove();
    splitChapterAt(body, chId, block, sel);
    return true;
  }

  // Second Enter at end of flow: the empty paragraph becomes a *** break
  if (prev) {
    e.preventDefault();
    snapshotStructure('section break', { rejoin: enterRun >= 2 });
    block.removeAttribute('style'); // (see above: a break carries nothing over)
    block.className = 'scene-break';
    block.textContent = '***';
    const np = document.createElement('p');
    np.innerHTML = '<br>';
    block.after(np);
    const range = document.createRange();
    range.setStart(np, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    syncChapter(body, chId);
    resetNativeUndo();
    breakRun++;
    return true;
  }
  return false;
}