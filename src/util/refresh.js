/* =================================================================== */
/*  REFRESH — picking up what another device wrote                     */
/*  A library shared over iCloud or Syncthing changes underneath NEO.  */
/*  Whenever NEO comes back into view it looks again: a chapter that   */
/*  changed on disk and not here is simply adopted; one that changed   */
/*  in both places keeps the local text on the page and lands the      */
/*  other device's version in a new chapter right after it, so that    */
/*  nothing is ever lost quietly.                                      */
/* =================================================================== */

// True when the disk copy of a chapter has no word the page lacks, but the
// page has words it lacks: an older copy, not an edit made somewhere else.
function onlyDrops(page, disk) {
  const bag = (html) => {
    const m = new Map();
    for (const w of String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/)) if (w) m.set(w, (m.get(w) || 0) + 1);
    return m;
  };
  const here = bag(page);
  const there = bag(disk);
  for (const [w, n] of there) if (n > (here.get(w) || 0)) return false;
  for (const [w, n] of here) if (n > (there.get(w) || 0)) return true;
  return false;
}

let refreshing = false;
async function refreshFromDisk() {
  if (refreshing) return;
  refreshing = true;
  bookMetaCache.clear(); // whatever another device wrote, the next redraw reads
  try {
    if (!book) {
      if (library && !$('#bookshelf-view').hidden) {
        const gen = libraryGeneration;
        const lib = await window.neo.readLibrary();
        // a change made here while that read was out (a new shelf, a rename)
        // is newer than what came back: taking it would undo the change,
        // and the next save would make that stick. Look again next time.
        if (gen !== libraryGeneration || libraryWritesPending) return;
        if (lib && lib.firstRunDone && JSON.stringify(lib) !== JSON.stringify(library)) {
          library = lib;
          const shelf = $('#bookshelf-view');
          const keep = shelf.scrollTop;
          await renderShelves();
          shelf.scrollTop = keep;
        }
      }
      return;
    }
    const bookId = book.id;
    if (window.neo.refreshBook) await window.neo.refreshBook(bookId);
    const meta = await window.neo.readBookMeta(bookId);
    if (!book || book.id !== bookId || !meta) return;

    // First read everything that changed; the page is left alone until it is
    // all in. (Deciding chapter by chapter between reads let a keystroke land
    // on a page that no longer matched what NEO held, and reopening the book
    // for a new book.json dropped whatever was typed while it loaded.)
    const theirs = metaSig(meta) !== savedMetaSig && Array.isArray(meta.chapterOrder);
    const sigHere = metaSig(book);
    const mine = sigHere !== savedMetaSig; // restructured here too, not saved yet
    const incoming = {}; // chapters new to this device
    let side = null;
    if (theirs) {
      for (const chId of meta.chapterOrder) {
        if (chapterHTML[chId] !== undefined) continue;
        incoming[chId] = await window.neo.readChapter(bookId, chId);
        if (!book || book.id !== bookId) return;
      }
      side = {
        stickies: await window.neo.readJSON(bookId, 'stickies', stickies),
        darlings: await window.neo.readJSON(bookId, 'darlings', darlings)
      };
    }
    // file times first, so only chapters that changed on disk are re-read
    // (a whole novel crossing the bridge every half minute is a hiccup)
    let stamps = null;
    if (window.neo.chapterStamps) {
      try { stamps = await window.neo.chapterStamps(bookId); } catch { stamps = null; }
    }
    const fresh = [];
    for (const chId of [...book.chapterOrder]) {
      if (writing[chId]) continue; // a save of ours is on its way: the file is ours, not news
      const st = stamps ? stamps[chId] : undefined;
      if (st !== undefined && st === diskStamps[chId]) continue;
      const before = savedHTML[chId];
      const disk = await window.neo.readChapter(bookId, chId);
      if (!book || book.id !== bookId) return;
      fresh.push({ chId, st, before, disk });
    }
    if (!book || book.id !== bookId) return;

    // Then decide it all in one go: nothing waits from here to the page.
    let restructured = false;
    if (theirs && metaSig(book) === sigHere) {
      // The other device added, renamed or moved chapters. Whichever
      // book.json stands, no chapter holding words is dropped: theirs keeps
      // the chapters with unsaved words here, and ours (when this device
      // restructured too and hasn't saved yet) takes in the chapters they wrote.
      const order = [...(mine ? book.chapterOrder : meta.chapterOrder)];
      const other = mine ? meta.chapterOrder : book.chapterOrder;
      other.forEach((chId, i) => {
        if (order.includes(chId)) return;
        if (mine ? !/[^\s]/.test(String(incoming[chId] || '').replace(/<[^>]*>/g, '')) : chapterHTML[chId] === savedHTML[chId]) return;
        const prev = other.slice(0, i).reverse().find((c) => order.includes(c));
        order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, chId);
      });
      if (!mine || order.length !== book.chapterOrder.length) {
        for (const chId of order) {
          if (!(chId in incoming)) continue;
          chapterHTML[chId] = incoming[chId];
          savedHTML[chId] = incoming[chId];
        }
        if (mine) {
          book.chapterOrder = order;
        } else {
          book = { ...meta, chapterOrder: order, lastPosition: book.lastPosition };
          savedMetaSig = metaSig(meta);
          stickies = side.stickies;
          darlings = side.darlings;
        }
        if (metaSig(book) !== savedMetaSig) scheduleMetaSave();
        if (!book.chapterOrder.includes(currentChapterId)) currentChapterId = null;
        undoStack = []; // snapshots of the old structure must not replay over the new one
        restructured = true;
      }
    }
    let adopted = 0;
    let conflicts = 0;
    const replaced = []; // page text a disk copy would otherwise have taken away
    for (const { chId, st, before, disk } of fresh) {
      if (!book.chapterOrder.includes(chId)) continue;
      // A save of ours crossed this read, so what came back can be older
      // than the page. Taking it put the old text back on the page, and the
      // next save made that stick. Look again next time.
      if (writing[chId] || savedHTML[chId] !== before) continue;
      if (typeof disk !== 'string') continue;
      if (disk === '' && savedHTML[chId]) continue; // unreadable or still downloading: not a change
      if (stamps) diskStamps[chId] = st; // seen; a file not read stays on the list
      if (disk === savedHTML[chId]) continue;
      if (chapterHTML[chId] === savedHTML[chId]) {
        // A copy with nothing new in it, only fewer words, is an older copy
        // coming back (or text cut on the other device): the page's version
        // goes to Darlings instead of nowhere.
        if (onlyDrops(chapterHTML[chId], disk)) {
          const holder = document.createElement('div');
          holder.innerHTML = chapterHTML[chId];
          replaced.push({
            id: 'd-' + Date.now().toString(36) + replaced.length,
            html: chapterHTML[chId],
            text: [...holder.children].map((p) => p.textContent).join('\n\n').slice(0, 2000),
            chapterId: chId,
            chapterLabel: t('Chapter {n}', { n: book.chapterOrder.indexOf(chId) + 1 }),
            date: new Date().toISOString()
          });
        }
        chapterHTML[chId] = disk;
        savedHTML[chId] = disk;
        wordCache[chId] = null;
        adopted++;
      } else {
        savedHTML[chId] = disk; // what's on disk now; our text goes over it on the next save
        const idx = book.chapterOrder.indexOf(chId);
        const twinId = 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        book.chapterOrder.splice(idx + 1, 0, twinId);
        book.chapterTitles = book.chapterTitles || {};
        const when = new Date().toLocaleTimeString(NeoI18n.getLocale(), { hour: 'numeric', minute: '2-digit' });
        book.chapterTitles[twinId] = ((book.chapterTitles[chId] || '') + ' ' + t('from other device, {time}', { time: when })).trim();
        chapterHTML[twinId] = disk;
        persistChapter(twinId, disk);
        persistChapter(chId);
        scheduleMetaSave();
        conflicts++;
      }
    }
    if (restructured || adopted || conflicts) {
      const caret = captureCaret();
      const keepScroll = $('#paper-scroll').scrollTop;
      renderChapters();
      $('#paper-scroll').scrollTop = keepScroll;
      if (caret) restoreCaret(caret);
      if (restructured) {
        const show = (el, text) => { if (el.textContent !== text) el.textContent = text; };
        show($('#tp-title'), isUntitled(book.title) ? '' : book.title);
        show($('#tp-subtitle'), book.subtitle || '');
        show($('#tp-author'), book.author || t('Anonymous'));
        $$('.tab[data-tab="notes"]')[0].textContent = tabName('notes');
        $$('.tab[data-tab="outline"]')[0].textContent = tabName('outline');
        renderStickies();
        if (currentTab === 'outline') renderOutline();
      }
      updateCounters();
      scheduleNavRefresh();
      if (replaced.length) {
        darlings.unshift(...replaced);
        window.neo.writeJSON(bookId, 'darlings', darlings);
      }
      if (currentTab === 'darlings' && (restructured || replaced.length)) renderDarlings();
      if (conflicts) toast(t('This chapter also changed on another device. That version is saved as the chapter after it.'), 8000);
      else if (replaced.length) toast(t('Updated from your other device — the text it replaced is in Darlings'), 8000);
      else toast(t('Updated from your other device'));
    }

    // The writer moved on to the other device since last touching this one:
    // the caret goes where they left off there. (Its chapter's words may
    // still be crossing over; the spot waits a little for its paragraph.)
    const there = meta.lastPosition;
    const here = book.lastPosition || {};
    if (there && typeof there.at === 'number' && there.at > (here.at || 0) && there.at > lastHereActivity &&
        currentTab === 'manuscript' && !document.querySelector('.modal-backdrop:not([hidden])') &&
        book.chapterOrder.includes(there.chapterId)) {
      const body = document.querySelector(`.chapter[data-id="${there.chapterId}"] .chapter-body`);
      const arrived = body && (typeof there.pIdx !== 'number' || body.querySelectorAll('p').length > there.pIdx);
      if ((arrived || Date.now() - there.at > 120000) && resumePosition(there)) {
        book.lastPosition = { ...there, scroll: $('#paper-scroll').scrollTop };
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    refreshing = false;
  }
}

async function backToShelf() {
  if (reading) stopReadAloud(false);
  flushAllSaves();
  tabPlaces = {};
  book = null;
  currentChapterId = null;
  undoStack = [];
  $('#editor-view').hidden = true;
  $('#bookshelf-view').hidden = false;
  renderShelves();
}