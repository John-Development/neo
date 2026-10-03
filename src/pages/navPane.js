/* ================================================================== */
/*  NAV PANE                                                          */
/* ================================================================== */

// State
let chapterDragActive = false;
let navRefreshPending = false;

function renderNav() {
  if (!book) return; // a refresh queued just before the shelf came back
  // Replacing the source row during a native drag can interrupt its lifecycle.
  if (chapterDragActive) { navRefreshPending = true; return; }
  navRefreshPending = false;
  const list = $('#nav-list');
  // a keyboard user on a chapter row keeps their place through the rebuild
  const focusedRow = document.activeElement && document.activeElement.classList.contains('n-row') &&
    document.activeElement.matches(':focus-visible') ? document.activeElement.closest('.nav-item').dataset.id : null;
  list.innerHTML = '';
  book.chapterNotes = book.chapterNotes || {};
  const solo = soloStory();
  // the book from top to bottom: a faint + between the boxes (and above and
  // below them) adds a chapter, a part or a page right there
  const gap = (at) => {
    const g = document.createElement('div');
    g.className = 'nav-gap';
    const plus = document.createElement('button');
    plus.className = 'ng-plus';
    plus.tabIndex = -1;
    plus.textContent = '+';
    plus.setAttribute('aria-label', t('Add'));
    const add = (e) => { e.preventDefault(); e.stopPropagation(); addEntryMenu(at, e.clientX, e.clientY, plus); };
    plus.addEventListener('click', add);
    plus.addEventListener('contextmenu', add);
    g.appendChild(plus);
    return g;
  };
  let inPart = false;
  book.chapterOrder.forEach((chId, i) => {
    const kind = chapterKind(chId);
    const story = STORY_KINDS.includes(kind);
    // a part gathers what follows it, up to the next part or the back of the book
    if (kind === 'part') inPart = true;
    else if (BACK_KINDS.includes(kind)) inPart = false;
    const words = story ? chapterWords(chId) : 0;
    const flagged = !!document.querySelector(`.chapter[data-id="${chId}"] .ph-mark`);
    const chTitle = story ? (book.chapterTitles || {})[chId] : '';
    const item = document.createElement('div');
    item.className = `nav-item kind-${kind}` + (story ? '' : ' nav-page') + (inPart && kind !== 'part' ? ' in-part' : '') +
      (chId === currentChapterId ? ' current' : '') + (chId === justAddedEntry ? ' just-added' : '');
    item.dataset.id = chId;
    item.innerHTML = `<div class="n-row" title="${t('Drag to reorder chapters')}"><span class="n-label"></span>
      <span style="display:flex;align-items:center">${story ? `<span class="n-words">${fmtNum(words)}</span>` : ''}${flagged ? `<span class="n-flag" title="${t('Unresolved placeholder')}"></span>` : ''}</span></div>`;
    item.querySelector('.n-label').textContent = chId === solo
      ? (book.title || t('The story'))
      : (chTitle ? `${chapterMark(chId)} · ${chTitle}` : chapterName(chId));

    // the row is the drag handle, so the note below stays freely editable
    const rowEl = item.querySelector('.n-row');
    rowEl.draggable = true;
    rowEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-neo-chapter', chId);
      chapterDragActive = true;
      $('#nav-pane').classList.add('open');
      item.classList.add('dragging');
    });
    rowEl.addEventListener('dragend', finishChapterDrag);
    // right-click: what it is, or Delete
    item.addEventListener('contextmenu', (e) => {
      if (IS_POCKET) { e.preventDefault(); return; } // on a phone this pane is for hopping
      if (e.target.closest('.nav-note[contenteditable="true"]')) return; // the note's own text menu
      e.preventDefault();
      chapterMenu(chId, e.clientX, e.clientY, rowEl);
    });

    if (story && IS_POCKET) {
      // on a phone this pane is for hopping: a tap anywhere on the box
      // goes there. The note is read here and written in the Outline.
      const note = document.createElement('div');
      note.className = 'nav-note nav-note-ro';
      note.textContent = book.chapterNotes[chId] || '';
      item.appendChild(note);
    } else if (story) {
      // outline your whole book from this panel:
      const note = document.createElement('div');
      note.className = 'nav-note';
      note.contentEditable = 'true';
      note.spellcheck = false;
      note.textContent = book.chapterNotes[chId] || '';
      note.setAttribute('role', 'textbox');
      note.setAttribute('aria-label', t('Outline note'));
      note.setAttribute('aria-placeholder', t('What happens here…'));
      note.addEventListener('click', (e) => e.stopPropagation());
      note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); note.blur(); }
        e.stopPropagation();
      });
      note.addEventListener('blur', () => {
        book.chapterNotes[chId] = note.textContent.trim();
        scheduleMetaSave();
      });
      item.appendChild(note);
    } else if (kind !== 'contents') {
      // a page shows the start of what it says
      const peek = document.createElement('div');
      peek.className = 'nav-note nav-peek';
      peek.textContent = entryPeek(chId);
      if (!peek.textContent && PAGE_PROMPTS[kind]) { peek.dataset.ph = PAGE_PROMPTS[kind](); peek.classList.add('blank'); }
      item.appendChild(peek);
    }

    item.onclick = () => {
      switchTab('manuscript');
      if (IS_POCKET) {
        // the top of the chapter, and the pane steps aside for the page
        const sec = document.querySelector(`.chapter[data-id="${chId}"]`);
        focusChapterStart(chId);
        if (sec) sec.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        if ($('#nav-pane').dataset.pinned !== '1') $('#nav-pane').classList.remove('open');
        return;
      }
      focusChapter(chId);
    };
    // from the keyboard, the row is the chapter's button (F6 reaches the pane)
    pressable(rowEl, [
      item.querySelector('.n-label').textContent,
      story ? t('{n} words', { n: words }) : '',
      flagged ? t('Unresolved placeholder') : ''
    ].filter(Boolean).join(', '));
    list.appendChild(gap(i));
    list.appendChild(item);
    if (chId === focusedRow) rowEl.focus({ preventScroll: true });
  });
  list.appendChild(gap(book.chapterOrder.length));
  justAddedEntry = null;
  renderContentsLists();
}

// the first words of a page, for its box in the Chapters pane
function entryPeek(chId) {
  const el = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
  const holder = document.createElement('template');
  holder.innerHTML = el ? el.innerHTML : (chapterHTML[chId] || '');
  const first = [...holder.content.querySelectorAll('p:not(.ghost):not(.scene-break)')].map((p) => p.textContent.trim()).find(Boolean);
  return first || '';
}

// The + between two boxes: which kind, then it's there, in place
let justAddedEntry = null;
async function addEntryMenu(at, x, y, from) {
  const hasContents = book.chapterOrder.some((c) => chapterKind(c) === 'contents');
  const kind = await popMenu(x, y, CHAPTER_KINDS.map((k) => ({ label: kindName(k), value: k, disabled: k === 'contents' && hasContents })), { from });
  if (!kind) return;
  addEntry(at, kind);
}
function addEntry(at, kind) {
  switchTab('manuscript');
  snapshotStructure('add ' + kind);
  const chId = newEntryId();
  justAddedEntry = chId;
  book.chapterOrder.splice(at, 0, chId);
  setChapterKind(chId, kind);
  chapterHTML[chId] = kind === 'copyright' ? copyrightStarter() : '<p><br></p>';
  persistChapter(chId);
  saveMeta();
  renderChapters();
  // the new page is ready to write on (the contents, to look at)
  if (kind === 'copyright') focusChapter(chId); else focusChapterStart(chId);
  document.querySelector(`.chapter[data-id="${chId}"]`).scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  updateCounters();
  if (currentTab === 'outline') renderOutline();
  return chId;
}
const newEntryId = () => 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

// The contents, in the manuscript: the parts, the chapters and the pages at
// the back, as the reader will find them, each one a way there
function bookContents(meta = book) {
  const solo = soloStory(meta);
  const out = [];
  let inPart = false;
  for (const chId of meta.chapterOrder) {
    const kind = chapterKind(chId, meta);
    if (kind === 'part') inPart = true;
    else if (BACK_KINDS.includes(kind)) inPart = false;
    if (['copyright', 'dedication', 'epigraph', 'contents'].includes(kind) || chId === solo) continue;
    let label = STORY_KINDS.includes(kind) ? chapterHeading(chId, meta) || chapterName(chId, meta) : chapterName(chId, meta);
    if (kind === 'part') {
      const partTitle = partTitleOf(chId);
      if (partTitle) label += ': ' + partTitle;
    }
    out.push({ chId, label, type: kind === 'part' ? 'part' : STORY_KINDS.includes(kind) ? 'chapter' : 'page', level: inPart && kind !== 'part' ? 1 : 0 });
  }
  return out;
}
// a part's title is the first line of its page (what follows is its quote)
function partTitleOf(chId) {
  const el = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
  const paras = parasFromHtml(el ? el.innerHTML : (chapterHTML[chId] || ''));
  return paras[0] && !paras[0].sceneBreak && !isAttribution(paras[0]) ? paras[0].text : '';
}
function renderContentsLists() {
  const lists = $$('#chapters .toc-list');
  if (!lists.length) return;
  const entries = bookContents();
  for (const list of lists) {
    list.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = `t-${e.type} lv${e.level}`;
      li.textContent = e.label;
      li.onclick = () => focusChapterStart(e.chId);
      list.appendChild(li);
    }
  }
}

// A new chapter goes at the end of the story: after the last chapter, and
// before an epilogue and the pages at the back
function storyEnd() {
  const order = book.chapterOrder;
  const last = order.map((c) => chapterKind(c)).lastIndexOf('chapter');
  if (last >= 0) return last + 1;
  let at = order.length;
  while (at > 0 && BACK_KINDS.includes(chapterKind(order[at - 1]))) at--;
  return at;
}
// $('#nav-add').onclick = () => {
//   switchTab('manuscript');
//   focusChapter(createChapterAt(storyEnd()));
// };

// drop target for chapter reordering, with a gold line showing the landing spot
const navList = $('#nav-list');
// // the + on the seam nearest the pointer, when it's near one (the pane
// // listens, so the seams above the first box and below the last wake too)
// $('#nav-pane').addEventListener('mousemove', (e) => {
//   if (chapterDragActive || e.buttons) return;
//   let near = null;
//   let best = 9;
//   for (const g of navList.querySelectorAll('.nav-gap')) {
//     const d = Math.abs(e.clientY - g.getBoundingClientRect().top);
//     if (d < best) { best = d; near = g; }
//   }
//   for (const g of navList.querySelectorAll('.nav-gap')) g.classList.toggle('near', g === near);
// });
// $('#nav-pane').addEventListener('mouseleave', () => {
//   navList.querySelectorAll('.nav-gap.near').forEach((g) => g.classList.remove('near'));
// });
function finishChapterDrag(e) {
  if (!chapterDragActive) return;
  chapterDragActive = false;
  navList.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  const ind = navList.querySelector('.nav-drop-ind');
  if (ind) ind.remove();
  // Native dragging can temporarily blur the window. Use the release position
  // to keep the pane available after an in-pane drop, even before focus returns.
  const pane = $('#nav-pane');
  const r = pane.getBoundingClientRect();
  if (pane.dataset.pinned !== '1' && (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom)) {
    pane.classList.remove('open');
  }
  if (navRefreshPending) renderNav();
}
// // Drop also cleans up if rendering removes the source before dragend bubbles.
// // Dragend covers Escape and releases outside a valid drop target.
// document.addEventListener('drop', finishChapterDrag);
// document.addEventListener('dragend', finishChapterDrag);

function navDropInd() {
  let ind = document.querySelector('.nav-drop-ind');
  if (!ind) {
    ind = document.createElement('div');
    ind.className = 'nav-drop-ind';
  }
  return ind;
}
// navList.addEventListener('dragover', (e) => {
//   if (!e.dataTransfer.types.includes('application/x-neo-chapter')) return;
//   e.preventDefault();
//   const ind = navDropInd();
//   const items = [...navList.querySelectorAll('.nav-item:not(.dragging)')];
//   let placed = false;
//   for (const it of items) {
//     const r = it.getBoundingClientRect();
//     if (e.clientY < r.top + r.height / 2) {
//       navList.insertBefore(ind, it);
//       placed = true;
//       break;
//     }
//   }
//   if (!placed) navList.appendChild(ind);
// });
// navList.addEventListener('dragleave', (e) => {
//   if (navList.contains(e.relatedTarget)) return;
//   const ind = document.querySelector('.nav-drop-ind');
//   if (ind) ind.remove();
// });
// navList.addEventListener('drop', async (e) => {
//   const chId = e.dataTransfer.getData('application/x-neo-chapter');
//   if (!chId) return;
//   e.preventDefault();
//   const ind = document.querySelector('.nav-drop-ind');
//   let index = book.chapterOrder.filter((c) => c !== chId).length;
//   if (ind) {
//     index = 0;
//     for (const c of navList.children) {
//       if (c === ind) break;
//       if (c.classList.contains('nav-item') && !c.classList.contains('dragging')) index++;
//     }
//     ind.remove();
//   }
//   const from = book.chapterOrder.indexOf(chId);
//   if (from === -1) return;
//   snapshotStructure('chapter reorder');
//   book.chapterOrder = book.chapterOrder.filter((c) => c !== chId);
//   book.chapterOrder.splice(index, 0, chId);
//   await saveMeta();
//   renderChapters(); // renumbers heads and rebuilds the nav
//   if (currentTab === 'outline') renderOutline();
// });

function highlightNav() {
  $$('.nav-item').forEach((el) => el.classList.toggle('current', el.dataset.id === currentChapterId));
}

function scheduleNavRefresh() {
  clearTimeout(saveTimers.nav);
  saveTimers.nav = setTimeout(renderNav, 1200);
}

// Hover behavior for both side panes:
function wireHoverPane(hotzone, pane, isPinnable) {
  // (a menu opened from the Chapters pane keeps it open while it's up)
  const pinned = () => (isPinnable && pane.dataset.pinned === '1') ||
    (pane.id === 'nav-pane' && (chapterDragActive || !!document.querySelector('.pop-menu')));
  hotzone.addEventListener('mouseenter', (e) => {
    if (e.buttons) return; // dragging something — stand down
    pane.classList.add('open');
  });
  hotzone.addEventListener('mouseleave', (e) => {
    if (pinned()) return;
    if (e.relatedTarget && pane.contains(e.relatedTarget)) return;
    pane.classList.remove('open');
  });
  pane.addEventListener('mouseleave', () => {
    if (pinned()) return;
    pane.classList.remove('open');
  });
}
wireHoverPane($('#nav-hotzone'), $('#nav-pane'), true);
wireHoverPane($('#side-hotzone'), $('#side-pane'), true);

// leaving the window closes unpinned panes (they used to stick open)
function closeUnpinnedPanes() {
  // Wayland can blur the window as a native chapter drag begins.
  if (!chapterDragActive && $('#nav-pane').dataset.pinned !== '1') $('#nav-pane').classList.remove('open');
  if ($('#side-pane').dataset.pinned !== '1') $('#side-pane').classList.remove('open');
}
// document.documentElement.addEventListener('mouseleave', closeUnpinnedPanes);
// window.addEventListener('blur', closeUnpinnedPanes);

// // the wheel scrolls the manuscript even when the pointer floats over the
// // dark margins beside the (narrower) page column
// $('#editor-view').addEventListener('wheel', (e) => {
//   const scroller = $('#paper-scroll');
//   if (e.ctrlKey) return; // pinch-zoom gesture, not a scroll
//   if (scroller.contains(e.target)) return; // native scrolling handles it
//   if ($('#nav-pane').contains(e.target) || $('#side-pane').contains(e.target)) return;
//   scroller.scrollTop += e.deltaY;
// }, { passive: true });

// Keep Open, on either pane: the page moves over to make room, and the
// choice stays for next time (on this computer)
function pinPane(side, on) {
  const pane = $(side === 'nav' ? '#nav-pane' : '#side-pane');
  const pin = $(side === 'nav' ? '#nav-pin' : '#side-pin');
  pane.dataset.pinned = on ? '1' : '0';
  pin.classList.toggle('pinned', on);
  pin.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#editor-view').classList.toggle(side + '-pinned', on);
  if (on) pane.classList.add('open');
  try {
    const kept = JSON.parse(localStorage.getItem('neo-pinned-panes') || '{}');
    kept[side] = on;
    localStorage.setItem('neo-pinned-panes', JSON.stringify(kept));
  } catch { /* fine: it just won't be remembered */ }
}
// $('#side-pin').onclick = () => pinPane('side', $('#side-pane').dataset.pinned !== '1');
// $('#nav-pin').onclick = () => pinPane('nav', $('#nav-pane').dataset.pinned !== '1');
// if (!NO_HOVER) {
//   try {
//     const kept = JSON.parse(localStorage.getItem('neo-pinned-panes') || '{}');
//     if (kept.nav) pinPane('nav', true);
//     if (kept.side) pinPane('side', true);
//   } catch { /* nothing kept */ }
// }