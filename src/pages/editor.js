/* ================================================================== */
/*  EDITOR — open / render                                            */
/* ================================================================== */

async function openBook(bookId) {
  tabPlaces = {}; // a fresh book starts with fresh places
  book = await window.neo.readBookMeta(bookId);
  if (!book) return;
  currentChapterId = null; // never carry a chapter reference across books
  undoStack = [];
  chapterHTML = {};
  savedHTML = {};
  diskStamps = {};
  for (const chId of book.chapterOrder) {
    chapterHTML[chId] = await window.neo.readChapter(bookId, chId);
    savedHTML[chId] = chapterHTML[chId];
  }
  savedMetaSig = metaSig(book); // what disk holds; NEO's own defaults don't count as edits
  stickies = await window.neo.readJSON(bookId, 'stickies', []);
  darlings = await window.neo.readJSON(bookId, 'darlings', []);

  $('#bookshelf-view').hidden = true;
  $('#editor-view').hidden = false;
  document.execCommand('defaultParagraphSeparator', false, 'p');

  $('#tp-title').textContent = isUntitled(book.title) ? '' : book.title;
  $('#tp-subtitle').textContent = book.subtitle || '';
  $('#tp-author').textContent = book.author || t('Anonymous');
  $$('.tab[data-tab="notes"]')[0].textContent = tabName('notes');
  $$('.tab[data-tab="outline"]')[0].textContent = tabName('outline');

  renderChapters();
  renderStickies();
  migrateDarlingAnchors(); // sweep legacy invisible markers out of the prose
  reconcileMarks();        // re-adopt any note marks orphaned by cut/paste
  updateCounters();

  // Plotters land in the outline for a brand-new book
  const isNew = book.chapterOrder.length === 0;
  if (isNew && library.writingStyle === 'plotter') {
    switchTab('outline');
  } else {
    switchTab('manuscript');
    if (isNew) {
      $('#tp-title').focus();
    } else if (book.lastPosition && book.chapterOrder.includes(book.lastPosition.chapterId)) {
      // pick up right where you left off — here, or on the other device
      currentChapterId = book.lastPosition.chapterId;
      const pos = book.lastPosition;
      requestAnimationFrame(() => resumePosition(pos));
    }
  }

  // the Enter hint shows once per library, ever
  if (!library.hintShown) {
    library.hintShown = true;
    writeLibrary(library);
    setTimeout(() => toast(t('Enter twice = section break · three times = new chapter · {key} shows everything else', { key: KHELP }), 7000), 800);
  }
}

// the pages that show a faint word until they have their own
const PAGE_PROMPTS = { dedication: () => t('For…'), epigraph: () => '…', part: () => t('Title') };

function renderChapters() {
  const wrap = $('#chapters');
  wrap.innerHTML = '';
  wordCache = {}
  book.chapterTitles = book.chapterTitles || {};
  settleChapterKinds();
  // a lone chapter is just "the story" — no heading until a second one exists,
  // at which point both appear, numbered in retrospect
  const solo = soloStory();
  book.chapterOrder.forEach((chId) => {
    const kind = chapterKind(chId);
    const story = STORY_KINDS.includes(kind);
    const sec = document.createElement('section');
    sec.className = `chapter sheet kind-${kind}` + (chId === solo ? ' solo' : '') + (story ? '' : ' bookpage');
    sec.dataset.id = chId;
    const role = chapterRole(chId);
    if (role) sec.classList.add(role);
    const head = document.createElement('div');
    head.className = 'chapter-head';
    if (kind === 'unnumbered') head.classList.add('no-number');
    head.id = 'ch-head-' + chId;
    const num = document.createElement('span');
    num.className = 'ch-num';
    num.textContent = chapterName(chId);
    head.appendChild(num);
    if (story) {
      head.title = t('Right-click for chapter options · click after the number to add a title');
      const sep = document.createElement('span');
      sep.className = 'ch-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '—';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'ch-title';
      titleSpan.contentEditable = 'true';
      titleSpan.spellcheck = false;
      titleSpan.textContent = book.chapterTitles[chId] || '';
      if (titleSpan.textContent) head.classList.add('has-title');
      titleSpan.addEventListener('input', () => {
        head.classList.toggle('has-title', titleSpan.textContent.trim() !== '');
      });
      titleSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          titleSpan.blur();
          poetryUnderHeading(sec.querySelector('.chapter-body'), chId);
        } else if (e.key === 'Enter') { e.preventDefault(); titleSpan.blur(); }
        e.stopPropagation();
      });
      titleSpan.addEventListener('blur', () => {
        book.chapterTitles[chId] = titleSpan.textContent.trim();
        scheduleMetaSave();
        renderNav();
      });
      head.appendChild(sep);
      head.appendChild(titleSpan);
    }
    head.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      chapterMenu(chId, e.clientX, e.clientY);
    });
    const body = document.createElement('div');
    body.className = 'chapter-body';
    sec.appendChild(head);
    sec.appendChild(body);
    wrap.appendChild(sec);
    if (kind === 'contents') {
      // the contents are the book's own shape, kept up to date: nothing to type
      body.hidden = true;
      const list = document.createElement('ol');
      list.className = 'toc-list';
      sec.appendChild(list);
      return;
    }
    body.contentEditable = 'true';
    // screen readers name each chapter by its heading (a lone chapter by the book)
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-multiline', 'true');
    if (chId === solo) body.setAttribute('aria-label', book.title || t('The story'));
    else body.setAttribute('aria-labelledby', head.id);
    body.spellcheck = false; // NEO runs its own spellcheck pass
    if (!story) body.classList.add('no-cap');
    body.innerHTML = chapterHTML[chId] || '<p><br></p>';
    markDialogueOpening(body);
    if (PAGE_PROMPTS[kind]) {
      body.dataset.ph = PAGE_PROMPTS[kind]();
      const blank = () => body.classList.toggle('blank', !body.textContent.trim());
      blank();
      body.addEventListener('input', blank);
    }
    // a line that opens with a dash is set as the name of whoever said the
    // lines above it, as it will print
    if (ATTRIBUTED_PAGES.includes(kind)) {
      const settle = () => {
        for (const p of body.querySelectorAll('p')) {
          const attr = isAttribution({ text: p.textContent.trim() });
          if (p.hasAttribute('data-attr') !== attr) p.toggleAttribute('data-attr', attr);
        }
      };
      settle();
      body.addEventListener('input', settle);
    }
    // older marks used a "?" that read as a broken image — normalize to the flag
    body.querySelectorAll('.ph-mark').forEach((m) => { m.textContent = '⚑'; });
    // heal the engine's style-junk spans left by past merges and splits
    stripJunkSpans(body);
    // heal prose that got merged into a scene-break's styled paragraph:
    // real breaks contain only ***, anything else is a stained paragraph
    body.querySelectorAll('p.scene-break').forEach((p) => {
      if (p.textContent.trim() !== '***') {
        p.classList.remove('scene-break');
        p.removeAttribute('style');
      }
    });
    // heal no-break spaces planted in prose by the old engine repair pass
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) {
      if (tn.data.includes('\u00a0')) tn.data = tn.data.replace(/\u00a0/g, ' ');
    }
    wireChapterBody(body, chId);
  });
  renderNav();
}

async function deleteChapterToDarlings(chId) {
  snapshotStructure('chapter delete');
  const kind = chapterKind(chId);
  const name = chapterName(chId);
  const index = book.chapterOrder.indexOf(chId);
  const text = chapterText(chId).trim();
  if (text) {
    const bodyEl = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
    darlings.push({
      id: 'd-' + Date.now().toString(36),
      html: bodyEl ? bodyEl.innerHTML : chapterHTML[chId],
      text: text.slice(0, 2000),
      chapterId: null,
      chapterLabel: chapterKind(chId) !== 'chapter' ? chapterName(chId) : t('deleted Chapter {n}', { n: chapterNumber(chId) }),
      date: new Date().toISOString()
    });
    await window.neo.writeJSON(book.id, 'darlings', darlings);
  }
  if (currentChapterId === chId) currentChapterId = null;
  await deleteChapterQuiet(chId);
  if (text) {
    toast(kind === 'chapter'
      ? t('Chapter removed — its words are in Darlings, or {key} to undo', { key: KZ })
      : t('{name} removed — its words are in Darlings, or {key} to undo', { name, key: KZ }));
  }
}

// Right-click a chapter's box in the Chapters pane, its heading, or its
// line in the outline: what it is (a chapter, a part, one of the pages a
// book carries), or Delete. Resolves to the choice once it's made.
async function chapterMenu(chId, x = 0, y = 0, from = null) {
  const kind = chapterKind(chId);
  const words = countWords(chapterText(chId));
  const otherContents = book.chapterOrder.some((c) => c !== chId && chapterKind(c) === 'contents');
  const items = CHAPTER_KINDS.map((k) => ({
    label: kindName(k),
    value: k,
    checked: k === kind,
    // one contents per book, and never over words: it would hide them
    disabled: k === 'contents' && k !== kind && (otherContents || words > 0)
  }));
  // any piece of the story can leave on its own — to a beta reader, an
  // editor, a magazine — in any format the book can
  if (STORY_KINDS.includes(kind) && words > 0) items.push('-', { label: t('Export Chapter…'), value: 'export' });
  // one switch for the whole book, where the parts are: count chapters
  // from 1 again after each part
  if (kind === 'part') {
    items.push('-', { label: t('Restart Chapter Numbers at Each Part'), value: 'restart', checked: !!book.restartNumbering });
  }
  items.push('-', { label: t('Delete'), value: 'delete', danger: true });
  const choice = await popMenu(x, y, items, { title: chapterName(chId), from: from || document.querySelector(`.nav-item[data-id="${chId}"] .n-row`) });
  if (!choice || choice === kind) return null;
  if (choice === 'export') {
    const formats = [
      { label: t('Text (.txt)'), value: 'txt' }, { label: t('Markdown (.md)'), value: 'md' }, { label: t('HTML (.html)'), value: 'html' },
      // PDF is made by the desktop app; Pocket shares the others
      ...(window.Capacitor ? [] : [{ label: 'PDF (.pdf)', value: 'pdf' }]),
      { label: t('Word (.docx)'), value: 'docx' }, { label: t('EPUB (.epub)'), value: 'epub' }
    ];
    const fmt = await optionModal(t('Export “{title}”', { title: chapterHeading(chId) || chapterName(chId) }), null, formats);
    if (fmt) await doExport(fmt, chId);
    return null;
  }
  if (choice === 'restart') {
    if (book.restartNumbering) delete book.restartNumbering;
    else book.restartNumbering = true;
    await saveMeta();
    renderChapters();
    if (currentTab === 'outline') renderOutline();
    updateCounters();
    return choice;
  }
  if (choice === 'delete') {
    await deleteChapterToDarlings(chId);
    if (currentTab === 'outline') renderOutline();
    return choice;
  }
  snapshotStructure('chapter kind');
  setChapterKind(chId, choice);
  // a copyright page starts with what every copyright page says
  if (choice === 'copyright' && !chapterText(chId).trim()) {
    chapterHTML[chId] = copyrightStarter();
    persistChapter(chId);
  }
  await saveMeta();
  renderChapters();
  if (currentTab === 'outline') renderOutline();
  updateCounters();
  return choice;
}

// Copyright © 2026 Hugh Howey / All rights reserved.
function copyrightStarter() {
  const name = (book && book.author) || library.authorName || t('Anonymous');
  return `<p>${escHtml(t('Copyright © {year} {name}', { year: String(new Date().getFullYear()), name }))}</p>`
    + `<p>${escHtml(t('All rights reserved.'))}</p>`;
}

function flushAllSaves(e) {
  if (!book) return;
  // remember where you were, for next session and for the other device:
  // the chapter, the paragraph and the letter (the same place on any
  // screen) plus the scroll (this screen's). `at` changes only when the
  // caret does, so a device that merely scrolled never calls the other
  // one back to an old spot.
  const prev = book.lastPosition || {};
  const caret = captureCaret();
  const spot = caret
    ? { chapterId: caret.chId, pIdx: caret.pIdx, off: caret.off }
    : prev.chapterId === currentChapterId ? { chapterId: prev.chapterId, pIdx: prev.pIdx, off: prev.off } : { chapterId: currentChapterId };
  const scroll = $('#paper-scroll').scrollTop;
  const newSpot = spot.chapterId !== prev.chapterId || spot.pIdx !== prev.pIdx;
  const newLetter = newSpot || spot.off !== prev.off;
  // the regular tick while writing saves a new paragraph; leaving NEO (a
  // blur, the app going to the background, closing) saves the exact letter
  const moved = newSpot || (e !== 'tick' && newLetter) || Math.abs((prev.scroll || 0) - scroll) > 40;
  if (moved) book.lastPosition = { ...spot, scroll, at: newLetter ? Date.now() : (prev.at || Date.now()) };
  for (const chId of book.chapterOrder) {
    if (chapterHTML[chId] !== undefined && chapterHTML[chId] !== savedHTML[chId]) {
      persistChapter(chId);
    }
  }
  flushAux();
  flushStickiesSave();
  if (moved || metaSig(book) !== savedMetaSig) saveMeta();
}