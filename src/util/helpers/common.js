// Every library.json write from this window goes through here. A look at the
// disk (refreshFromDisk) can then tell its own writes from another device's:
// a read that a write here crossed, or that finished while one was still on
// its way, is older than the library in memory and must not replace it.
function writeLibrary(lib = library) {
  libraryGeneration++;
  libraryWritesPending++;
  return new Promise((resolve) => resolve(window.neo.writeLibrary(lib)))
    .finally(() => { libraryWritesPending--; });
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const K = (mac, pc) => (IS_MAC ? mac : pc);
const KZ = K('⌘Z', 'Ctrl+Z');
const KPH = K('⌘⇧X', 'Ctrl+Shift+X');
const KDA = K('⌘⇧D', 'Ctrl+Shift+D');
const KHELP = K('⌘/', 'Ctrl+/');

// a word holds at least one letter or digit, so French « » and spaced
// dashes are not counted as words
function countWords(text) {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  if (window.Intl && Intl.Segmenter) {
    const script = SEGMENTED_SCRIPTS.find((s) => s.chars.test(trimmed));
    if (script) {
      if (wordSegmenterLang !== script.lang) {
        wordSegmenter = new Intl.Segmenter(script.lang, { granularity: 'word' });
        wordSegmenterLang = script.lang;
      }
      let words = 0;
      for (const part of wordSegmenter.segment(trimmed)) if (part.isWordLike) words += 1;
      return words;
    }
  }
  return (trimmed.match(/\S+/g) || []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function cleanChapterEl(id) {
  const el = document.querySelector(`.chapter[data-id="${id}"] .chapter-body`);
  const holder = document.createElement('div');
  holder.innerHTML = el ? el.innerHTML : (chapterHTML[id] || '');
  holder.querySelectorAll('.darling-anchor, .ph-mark, .ghost').forEach((n) => n.remove());
  return holder;
}
// Text a line to each paragraph. innerText does that only for what is laid
// out on screen: of a copy held aside, like the one above, it runs one
// paragraph's last word into the next one's first ("end.Next"), and the two
// count as one word. A range's toString runs them together the same way.
function plainText(root) {
  root.querySelectorAll('p, div, br').forEach((el) => el.after('\n'));
  return root.textContent;
}
const chapterText = (id) => plainText(cleanChapterEl(id));

// Word counts are cached per chapter and only recomputed for the chapter being edited.
function chapterWords(chId) {
  if (wordCache[chId] == null) wordCache[chId] = countWords(chapterText(chId));
  return wordCache[chId];
}