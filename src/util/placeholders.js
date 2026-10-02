/* ================================================================== */
/*  PLACEHOLDERS + STICKIES                                           */
/* ================================================================== */

function insertPlaceholder() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  // derive the chapter from where the caret actually is:
  let el = sel.anchorNode;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const bodyEl = el && el.closest ? el.closest('.chapter-body') : null;
  if (!bodyEl) {
    toast(t('Click into a chapter first, then {key} drops a placeholder', { key: KPH }));
    return;
  }
  currentChapterId = bodyEl.closest('.chapter').dataset.id;
  const sid = 's-' + Date.now().toString(36);
  const span = document.createElement('span');
  span.className = 'ph-mark';
  span.dataset.sid = sid;
  span.contentEditable = 'false';
  span.textContent = '⚑';
  const range = sel.getRangeAt(0);
  range.collapse(false);
  range.insertNode(span);
  // park the caret just past the mark and keep writing
  const after = document.createTextNode(' ');
  span.after(after);
  range.setStartAfter(after);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  stickies.push({ id: sid, chapterId: currentChapterId, text: '', resolved: false });
  window.neo.writeJSON(book.id, 'stickies', stickies);
  chapterHTML[currentChapterId] = captureBody(document.querySelector(
    `.chapter[data-id="${currentChapterId}"] .chapter-body`
  ));
  scheduleChapterSave(currentChapterId);
  renderStickies();
  scheduleNavRefresh();
  // the caret lands in the note: type what needs doing, Enter brings you
  // back to the page just past the flag (Shift+Enter for another line)
  const pane = $('#side-pane');
  pane.dataset.autoOpened = pane.classList.contains('open') ? '0' : '1';
  focusSticky(sid);
}

// Back to the manuscript, caret just past the flag. Scrolls only when the
// flag isn't already on screen, and from wherever the page is now.
function returnToMark(sid) {
  if (currentTab !== 'manuscript') switchTab('manuscript');
  const mark = document.querySelector(`.ph-mark[data-sid="${sid}"]`);
  if (!mark) return;
  const bodyEl = mark.closest('.chapter-body');
  const scroller = $('#paper-scroll');
  const r = mark.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) mark.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  if (!bodyEl) return;
  currentChapterId = bodyEl.closest('.chapter').dataset.id;
  bodyEl.focus({ preventScroll: true });
  const range = document.createRange();
  const next = mark.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE) range.setStart(next, Math.min(1, next.textContent.length));
  else range.setStartAfter(mark);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  highlightNav();
}

function renderStickies() {
  const wrap = $('#sticky-list');
  wrap.innerHTML = '';
  const open = stickies.filter((s) => !s.resolved);
  if (open.length === 0) {
    wrap.innerHTML = `<div class="stickies-empty">${t('No notes yet.')}<br><br>${t('Hit {key} while writing to drop a placeholder — a “come back to this” mark that never breaks your flow.', { key: KPH })}</div>`;
    return;
  }
  for (const s of open) {
    const chIdx = book.chapterOrder.indexOf(s.chapterId);
    const el = document.createElement('div');
    el.className = 'sticky unresolved';
    el.dataset.sid = s.id;
    el.innerHTML = `
      <div class="s-ch">${chIdx >= 0 ? chapterName(s.chapterId) : t('Unplaced')}</div>
      <textarea placeholder="${t('What needs doing here?')}" spellcheck="false"></textarea>
      <div class="s-actions"><button class="s-go">${t('Go to')}</button><span class="s-sep">·</span><button class="s-done">${t('Resolve')}</button></div>`;
    const ta = el.querySelector('textarea');
    ta.value = s.text;
    ta.addEventListener('input', () => {
      s.text = ta.value;
      scheduleStickiesSave();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return; // Shift+Enter: another line in the note
      e.preventDefault();
      const pane = $('#side-pane');
      if (pane.dataset.autoOpened === '1' && pane.dataset.pinned !== '1') pane.classList.remove('open');
      pane.dataset.autoOpened = '0';
      returnToMark(s.id);
    });
    el.querySelector('.s-go').onclick = () => returnToMark(s.id);
    el.querySelector('.s-done').onclick = () => resolveSticky(s.id);
    wrap.appendChild(el);
  }
}

// A note is saved a moment after the last keystroke. The save belongs to the
// book it was typed in: leaving the book (Esc to the shelf) writes it at once
// instead of letting the timer find no book, which lost the note's text.
function scheduleStickiesSave() {
  if (!book) return;
  const bookId = book.id;
  const list = stickies;
  clearTimeout(saveTimers.stickies);
  saveTimers.stickies = setTimeout(() => {
    delete saveTimers.stickies;
    window.neo.writeJSON(bookId, 'stickies', list);
  }, 600);
}

function flushStickiesSave() {
  if (!saveTimers.stickies || !book) return;
  clearTimeout(saveTimers.stickies);
  delete saveTimers.stickies;
  window.neo.writeJSON(book.id, 'stickies', stickies);
}

// Pair every mark in the manuscript with a note: pasted duplicates get their
// own copy of the note, marks that moved chapters update their red dot, and
// marks orphaned by older versions get a fresh (empty) note instead of dying.
function reconcileMarks() {
  if (!book) return;
  const seen = new Set();
  let changed = false;
  for (const m of document.querySelectorAll('.chapter-body .ph-mark')) {
    let sid = m.dataset.sid;
    if (!sid) continue;
    const chEl = m.closest('.chapter');
    const chId = chEl ? chEl.dataset.id : null;
    const existing = stickies.find((s) => s.id === sid);
    if (seen.has(sid)) {
      const nid = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
      m.dataset.sid = nid;
      stickies.push({ id: nid, chapterId: chId, text: existing ? existing.text : '', resolved: false });
      seen.add(nid);
      changed = true;
      continue;
    }
    if (!existing) {
      stickies.push({ id: sid, chapterId: chId, text: '', resolved: false });
      changed = true;
    } else if (existing.chapterId !== chId) {
      existing.chapterId = chId;
      changed = true;
    }
    seen.add(sid);
  }
  if (changed) {
    window.neo.writeJSON(book.id, 'stickies', stickies);
    renderStickies();
    renderNav();
  }
}

function resolveSticky(sid) {
  const mark = document.querySelector(`.ph-mark[data-sid="${sid}"]`);
  if (mark) {
    const chId = mark.closest('.chapter').dataset.id;
    const prev = mark.previousSibling;
    const next = mark.nextSibling;
    mark.remove();
    // tidy the seam: old flags parked a no-break space after themselves,
    // and removing a flag between two spaces shouldn't leave both
    if (next && next.nodeType === Node.TEXT_NODE) next.data = next.data.replace(/^\u00a0/, ' ');
    if (prev && prev.nodeType === Node.TEXT_NODE) prev.data = prev.data.replace(/\u00a0$/, ' ');
    if (prev && next && prev.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE &&
        / $/.test(prev.data) && /^ /.test(next.data)) {
      next.data = next.data.slice(1);
    }
    const body = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
    try { body.normalize(); } catch { /* fine */ }
    chapterHTML[chId] = captureBody(body);
    scheduleChapterSave(chId);
  }
  stickies = stickies.filter((s) => s.id !== sid);
  window.neo.writeJSON(book.id, 'stickies', stickies);
  renderStickies();
  scheduleNavRefresh();
}

function focusSticky(sid) {
  $('#side-pane').classList.add('open');
  const el = document.querySelector(`.sticky[data-sid="${sid}"] textarea`);
  if (el) el.focus();
}