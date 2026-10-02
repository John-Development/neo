/* ================================================================== */
/*  SAVING                                                             */
/* ================================================================== */

// One door for chapter writes, so NEO always knows what is on disk. That
// knowledge is what lets it write only what changed (a library shared over
// iCloud or Syncthing must not be re-written every twenty seconds) and, in
// refreshFromDisk, tell another device's edits from its own.
function persistChapter(chId, html) {
  if (!book) return Promise.resolve(false);
  if (html === undefined) html = chapterHTML[chId] || '';
  const before = savedHTML[chId];
  savedHTML[chId] = html;
  writing[chId] = (writing[chId] || 0) + 1;
  return new Promise((resolve) => resolve(window.neo.writeChapter(book.id, chId, html))).catch((err) => {
    // It never reached the disk. Book it as unsaved again, so the next flush
    // tries once more, and so a look at the disk can't take the old file
    // for news and put it back on the page.
    if (savedHTML[chId] === html) savedHTML[chId] = before;
    throw err;
  }).finally(() => { writing[chId]--; });
}

function scheduleChapterSave(chId) {
  clearTimeout(saveTimers[chId]);
  const bookId = book && book.id;
  saveTimers[chId] = setTimeout(() => {
    if (!book) return; // the book closed before the timer fired; flushAllSaves already wrote it
    // another book is open, or the chapter was deleted or merged into the one
    // above while this save waited: its words are already where they belong,
    // and writing now would only leave an empty stray file in chapters/
    if (book.id !== bookId || !book.chapterOrder.includes(chId)) return;
    persistChapter(chId);
  }, 800);
}

// book.json minus the parts every device changes constantly, and minus
// empty defaults (NEO fills in chapterTitles: {} and friends after opening;
// the file on disk may not have them yet — same book either way)
function metaSig(m) {
  if (!m) return '';
  const c = {};
  for (const k of Object.keys(m).sort()) {
    if (k === 'lastPosition' || k === 'modified' || k === 'wordCount' || k === 'dailyCounts') continue; // bookkeeping, not the book
    const v = m[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    c[k] = v;
  }
  return JSON.stringify(c);
}

function scheduleMetaSave() {
  clearTimeout(saveTimers.meta);
  saveTimers.meta = setTimeout(saveMeta, 800);
}
async function saveMeta() {
  if (!book) return;
  const sig = metaSig(book);
  const stamp = await writeBookMeta(book.id, book);
  if (book && typeof stamp === 'string') book.modified = stamp;
  savedMetaSig = sig;
}

// TODO: make this work

// function flushAllSaves(e) {
//   if (!book) return;
//   // remember where you were, for next session and for the other device:
//   // the chapter, the paragraph and the letter (the same place on any
//   // screen) plus the scroll (this screen's). `at` changes only when the
//   // caret does, so a device that merely scrolled never calls the other
//   // one back to an old spot.
//   const prev = book.lastPosition || {};
//   const caret = captureCaret();
//   const spot = caret
//     ? { chapterId: caret.chId, pIdx: caret.pIdx, off: caret.off }
//     : prev.chapterId === currentChapterId ? { chapterId: prev.chapterId, pIdx: prev.pIdx, off: prev.off } : { chapterId: currentChapterId };
//   const scroll = $('#paper-scroll').scrollTop;
//   const newSpot = spot.chapterId !== prev.chapterId || spot.pIdx !== prev.pIdx;
//   const newLetter = newSpot || spot.off !== prev.off;
//   // the regular tick while writing saves a new paragraph; leaving NEO (a
//   // blur, the app going to the background, closing) saves the exact letter
//   const moved = newSpot || (e !== 'tick' && newLetter) || Math.abs((prev.scroll || 0) - scroll) > 40;
//   if (moved) book.lastPosition = { ...spot, scroll, at: newLetter ? Date.now() : (prev.at || Date.now()) };
//   for (const chId of book.chapterOrder) {
//     if (chapterHTML[chId] !== undefined && chapterHTML[chId] !== savedHTML[chId]) {
//       persistChapter(chId);
//     }
//   }
//   flushAux();
//   flushStickiesSave();
//   if (moved || metaSig(book) !== savedMetaSig) saveMeta();
// }