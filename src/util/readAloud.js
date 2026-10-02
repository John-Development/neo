/* ================================================================== */
/*  READ ALOUD — ⌘⇧U (Ctrl+Shift+U)                                   */
/*  The computer's own voice reads from the caret, a sentence at a    */
/*  time, each one lit as it's read, on into the chapters after. ⌘⇧U  */
/*  again, Esc or a keystroke stops it, and the caret is left at the  */
/*  sentence it reached, so ⌘⇧U carries on from there. No keys, no    */
/*  cloud: the voices that come with macOS and Windows.               */
/* ================================================================== */

let reading = null; // { item, gen } while the voice is going
let readGen = 0;

function readVoice() {
  const voices = window.speechSynthesis.getVoices();
  const lang = writingLanguage().toLowerCase();
  const base = lang.split('-')[0];
  const by = (f) => voices.find(f);
  return by((v) => v.lang.toLowerCase().replace('_', '-') === lang && v.default) ||
    by((v) => v.lang.toLowerCase().replace('_', '-') === lang) ||
    by((v) => v.lang.toLowerCase().startsWith(base) && v.localService) ||
    by((v) => v.lang.toLowerCase().startsWith(base)) ||
    by((v) => v.default) || voices[0] || null;
}
async function readVoicesReady() {
  if (window.speechSynthesis.getVoices().length) return true;
  await new Promise((resolve) => {
    const done = () => resolve();
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return window.speechSynthesis.getVoices().length > 0;
}

// The paragraphs to read, from one, in order: the rest of its editor, then
// (in the manuscript) the chapters after it
function readParasFrom(p) {
  const out = [];
  const editor = p.closest('.chapter-body, #aux-editor');
  const ok = (q) => q.tagName === 'P' && !q.classList.contains('scene-break') && !q.classList.contains('ghost');
  const take = (root, from) => {
    let on = !from;
    for (const q of root.querySelectorAll('p')) {
      if (q === from) on = true;
      if (on && ok(q)) out.push(q);
    }
  };
  take(editor, p);
  if (editor.matches('.chapter-body')) {
    const bodies = [...document.querySelectorAll('#chapters .chapter-body')];
    for (const b of bodies.slice(bodies.indexOf(editor) + 1)) take(b, null);
  }
  return out;
}
// a paragraph's sentences, as character spans of its text, from an offset
function readSentences(p, from) {
  const text = p.textContent;
  const spans = [];
  if (window.Intl && Intl.Segmenter) {
    const seg = new Intl.Segmenter(writingLanguage(), { granularity: 'sentence' });
    for (const s of seg.segment(text)) spans.push([s.index, s.index + s.segment.length]);
  } else spans.push([0, text.length]);
  return spans
    .map(([a, b]) => [Math.max(a, from), b])
    .filter(([a, b]) => b > a && text.slice(a, b).trim());
}
function readRange(p, a, b) {
  const s = pointAt(p, a), e = pointAt(p, b);
  if (!s || !e) return null;
  const r = document.createRange();
  r.setStart(s.node, s.offset);
  r.setEnd(e.node, e.offset);
  return r;
}

async function toggleReadAloud() {
  if (reading) { stopReadAloud(true); return; }
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast(t('Read aloud needs a voice on this computer')); return; }
  const sel = window.getSelection();
  let el = sel.rangeCount ? sel.anchorNode : null;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  let p = el && el.closest ? el.closest('.chapter-body p, #aux-editor p') : null;
  let from = 0;
  if (p) {
    const pre = document.createRange();
    pre.selectNodeContents(p);
    pre.setEnd(sel.anchorNode, sel.anchorOffset);
    from = pre.toString().length;
  } else {
    // no caret in the text: from the top of the chapter on screen
    const body = currentTab === 'manuscript'
      ? document.querySelector(`.chapter[data-id="${currentChapterId || (book && book.chapterOrder[0])}"] .chapter-body`)
      : $('#aux-editor');
    p = body && body.querySelector('p');
  }
  if (!p) return;
  if (!(await readVoicesReady())) { toast(t('Read aloud needs a voice on this computer')); return; }
  const paras = readParasFrom(p);
  // start at the beginning of the sentence the caret is in
  const first = readSentences(p, 0).find(([a, b]) => from >= a && from < b);
  if (first) from = first[0];
  const gen = ++readGen;
  reading = { gen, item: null };
  const queue = function* () {
    for (const [n, q] of paras.entries()) {
      for (const [a, b] of readSentences(q, n === 0 && q === p ? from : 0)) yield { p: q, a, b };
    }
  }();
  const voice = readVoice();
  const next = () => {
    if (!reading || reading.gen !== gen) return;
    const { value: item, done } = queue.next();
    if (done || !item.p.isConnected) { stopReadAloud(false); return; }
    reading.item = item;
    const u = new SpeechSynthesisUtterance(item.p.textContent.slice(item.a, item.b).trim());
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = writingLanguage();
    u.onstart = () => {
      if (!reading || reading.gen !== gen) return;
      const r = readRange(item.p, item.a, item.b);
      if (!r || !window.Highlight || !CSS.highlights) return;
      CSS.highlights.set('neo-speak', new Highlight(r));
      // keep the sentence on screen
      const sc = $('#paper-scroll');
      const box = r.getBoundingClientRect();
      const view = sc.getBoundingClientRect();
      if (box.top < view.top + 40 || box.bottom > view.bottom - 60) {
        sc.scrollTop += box.top - view.top - view.height / 3;
      }
    };
    u.onend = () => next();
    u.onerror = (ev) => { if (ev.error !== 'interrupted' && ev.error !== 'canceled') stopReadAloud(false); };
    window.speechSynthesis.speak(u);
  };
  window.speechSynthesis.cancel();
  next();
}
// leaveCaret: the writer stopped it, so the caret goes to the sentence reached
function stopReadAloud(leaveCaret) {
  const was = reading;
  reading = null;
  readGen++;
  try { window.speechSynthesis.cancel(); } catch { /* nothing speaking */ }
  if (window.CSS && CSS.highlights) CSS.highlights.delete('neo-speak');
  if (leaveCaret && was && was.item && was.item.p.isConnected) {
    const ed = was.item.p.closest('.chapter-body, #aux-editor');
    const pt = pointAt(was.item.p, was.item.a);
    if (ed && pt) {
      ed.focus({ preventScroll: true });
      const s = window.getSelection();
      s.removeAllRanges();
      const r = document.createRange();
      r.setStart(pt.node, pt.offset);
      r.collapse(true);
      s.addRange(r);
    }
  }
}
