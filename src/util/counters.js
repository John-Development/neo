/* ================================================================== */
/*  COUNTERS                                                          */
/* ================================================================== */

// the story's words: the pages a book carries don't count
function bookWordCount() {
  return book.chapterOrder.reduce((sum, chId) => sum + (isStory(chId) ? chapterWords(chId) : 0), 0);
}

function updateCounters() {
  if (!book) return;
  const total = bookWordCount();
  const wc = $('#word-counter');
  if (wordMode === 'book') wc.textContent = t('{n} words', { n: total });
  const cur = book.chapterOrder.includes(currentChapterId) ? currentChapterId : null;
  const solo = soloStory();
  if (wordMode !== 'book') {
    const n = cur ? chapterWords(cur) : 0;
    wc.textContent = cur && chapterKind(cur) !== 'chapter'
      ? t('{name}: {n} words', { name: chapterName(cur), n })
      : t('ch. {ch}: {n} words', { ch: cur ? chapterNumber(cur) : 0, n });
  }
  const pos = $('#pos-counter');
  pos.textContent = library.posMode === 'page'
    ? (cur ? t('page {p} of {total}', { p: currentPage(cur), total: pageCount(total) }) : t('{n} pages', { n: pageCount(total) }))
    : !cur
    ? (numberedChapters() > 1 ? t('{n} chapters', { n: numberedChapters() }) : '')
    : cur === solo
      ? '' // a chapterless story needs no chapter locator
      : chapterKind(cur) !== 'chapter'
        ? chapterName(cur)
        : t('chapter {ch} of {total}', { ch: chapterNumber(cur), total: numberedChapters(book, cur) });
  // cache for the bookshelf progress bar
  if (book.wordCount !== total) {
    // only a true crossing earns a painting — a story that was already long
    // before NEO could paint keeps its abstract until the writer asks
    const before = typeof book.wordCount === 'number' ? book.wordCount : total;
    book.wordCount = total;
    scheduleMetaSave();
    if (before < PAINT_AT && total >= PAINT_AT && !(library.coverArt && library.coverArt.auto === false) && paintable(book)) {
      requestPaint(book, bookPlainText());
    }
  }
  trackDailyWords(total);
}

// ---- daily word tracking + goal display ----
// The writing day follows the writer's own clock, and rolls over at
// library.dayEndsAt (0 = midnight) so a session that runs past midnight
// still counts toward the night it began.
function writingDay(d = new Date()) {
  d = new Date(d);
  if (d.getHours() < (library.dayEndsAt || 0)) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayStr = () => writingDay();

function trackDailyWords(total) {
  book.dailyCounts = book.dailyCounts || {};
  const today = todayStr();
  if (!book.dailyCounts[today]) {
    book.dailyCounts[today] = { start: total, end: total };
    scheduleMetaSave();
  } else if (book.dailyCounts[today].end !== total) {
    book.dailyCounts[today].end = total;
  }
  // Cutting is writing too: words cut below where the day began move the
  // day's start down with them, so today never reads below zero, and what's
  // written after the cut counts in full. (Cut what you wrote today, and
  // today is smaller: that part is honest.)
  if (total < book.dailyCounts[today].start) {
    book.dailyCounts[today].start = total;
    scheduleMetaSave();
  }
  if (sprint && total < sprint.startCount) sprint.startCount = total;
  const wordsToday = book.dailyCounts[today].end - book.dailyCounts[today].start;
  const gc = $('#goal-counter');
  if (sprint && !sprint.done) {
    const sprintWords = total - sprint.startCount;
    gc.textContent = `⚡ ${fmtNum(sprintWords)} / ${fmtNum(sprint.target)}`;
    if (sprintWords >= sprint.target) {
      sprint.done = true;
      toast(t('Sprint complete — {n} words. Well earned.', { n: sprintWords }), 6000);
    }
  } else {
    const goal = library.dailyGoal || 0;
    gc.textContent = goal
      ? t('{n} / {goal} today', { n: wordsToday, goal })
      : t('{n} today', { n: wordsToday });
    gc.classList.toggle('goal-met', goal > 0 && wordsToday >= goal);
  }
}

// Pages, the way a manuscript counts them: 250 words to a page. The page
// the caret is on counts the story's words before it.
const WORDS_PER_PAGE = 250;
const pageCount = (words) => Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
function currentPage(cur) {
  let before = 0;
  for (const chId of book.chapterOrder) {
    if (chId === cur) break;
    if (isStory(chId)) before += chapterWords(chId);
  }
  const sel = window.getSelection();
  const body = document.querySelector(`.chapter[data-id="${cur}"] .chapter-body`);
  if (isStory(cur) && body && sel.rangeCount && body.contains(sel.anchorNode)) {
    const r = document.createRange();
    r.selectNodeContents(body);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    before += countWords(plainText(r.cloneContents()));
  }
  return Math.min(pageCount(bookWordCount()), Math.floor(before / WORDS_PER_PAGE) + 1);
}
