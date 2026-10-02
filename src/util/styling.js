/* =================================================================== */
/*  POETRY PARAGRAPHS — ⌘⇧Enter (Ctrl+Shift+Enter)                     */
/*  A paragraph pulled in from the margins, italic: a stanza of verse, */
/*  a quote, a POV name under the chapter heading. One class, one key. */
/*  FLUSH PARAGRAPHS — ⇧Enter                                          */
/*  Prose with no first-line indent: a report, a list, an email, a     */
/*  sign in the story. ⇧Enter again gives another; Enter is prose.     */
/* =================================================================== */

// the paragraph holding the caret, if it belongs to this chapter body
function caretBlock(body) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let el = sel.anchorNode;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const block = el && el.closest ? el.closest('p') : null;
  return block && body.contains(block) ? block : null;
}

// A poetry paragraph is born italic — real <i> markup, so ⌘I can take it
// off a word — and sheds that default italic when it returns to prose.
function italicize(p) {
  if (p.textContent.trim() === '') { p.innerHTML = '<i><br></i>'; return; }
  const kids = [...p.childNodes].filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()));
  if (kids.length === 1 && kids[0].nodeType === Node.ELEMENT_NODE && kids[0].tagName === 'I') return;
  const i = document.createElement('i');
  while (p.firstChild) i.appendChild(p.firstChild);
  p.appendChild(i);
}
function romanize(p) {
  const kids = [...p.childNodes].filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()));
  if (kids.length !== 1 || kids[0].nodeType !== Node.ELEMENT_NODE || kids[0].tagName !== 'I') return;
  const i = kids[0];
  while (i.firstChild) i.before(i.firstChild);
  i.remove();
  if (p.textContent.trim() === '' && !p.querySelector('br')) p.innerHTML = '<br>';
}
// caret at the start of a paragraph's text — inside its italic when it has one
function caretIntoStart(p) {
  const i = p.firstElementChild && p.firstElementChild.tagName === 'I' ? p.firstElementChild : p;
  placeCaret(i, 0);
}

function placeCaret(node, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ⌘⇧Enter (Ctrl+Shift+Enter). At the end of a paragraph: a new poetry
// paragraph beneath it. Mid-paragraph: the text after the caret becomes
// one. Inside a poetry paragraph, ⇧Enter or ⌘⇧Enter: another line of it,
// so verse flows. On a *** line: nothing.
function handlePoetry(e, body, chId) {
  if (e.key !== 'Enter' || !e.shiftKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const block = caretBlock(body);
  if (!block) return false;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod && !block.classList.contains('poetry')) return false; // ⇧Enter alone: a flush paragraph
  e.preventDefault();
  if (block.classList.contains('scene-break')) return true;

  if (block.classList.contains('poetry')) {
    // the engine's own split keeps the class on the new line, and ⌘Z sees it
    if (block.querySelector('span:not(.ph-mark)')) stripJunkSpans(block);
    document.execCommand('insertParagraph');
    const cur = caretBlock(body);
    if (cur) {
      cur.classList.add('poetry');
      if (cur.textContent.trim() === '' && !cur.querySelector('i')) { italicize(cur); caretIntoStart(cur); }
    }
    syncChapter(body, chId);
    return true;
  }

  snapshotStructure('poetry paragraph');
  const r = sel.getRangeAt(0);
  const tail = document.createRange();
  tail.selectNodeContents(block);
  try { tail.setStart(r.startContainer, r.startOffset); } catch { return true; }
  const after = tail.toString();
  const empty = block.textContent.trim() === '';
  const atStart = after.length === block.textContent.length;
  if (empty || atStart) {
    // an empty paragraph, or the caret at its very start: the whole paragraph turns to poetry
    block.classList.remove('flush');
    block.classList.add('poetry');
    italicize(block);
    caretIntoStart(block);
  } else {
    const line = document.createElement('p');
    line.className = 'poetry';
    if (after.trim() !== '') {
      line.appendChild(tail.extractContents());
      for (const junk of line.querySelectorAll('br')) junk.remove();
      if (!block.textContent.trim()) block.innerHTML = '<br>';
    }
    italicize(line);
    block.after(line);
    caretIntoStart(line);
  }
  syncChapter(body, chId);
  resetNativeUndo();
  breakRun++;
  return true;
}

// ⇧Enter. At the end of a paragraph: a flush paragraph beneath it.
// Mid-paragraph: the text after the caret becomes one. At the start of a
// paragraph (or in an empty one): that paragraph goes flush. Inside a flush
// paragraph: another one. On a *** line: nothing.
function handleFlush(e, body, chId) {
  if (e.key !== 'Enter' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const block = caretBlock(body);
  if (!block) return false;
  e.preventDefault();
  if (block.classList.contains('scene-break')) return true;
  if (block.querySelector('span:not(.ph-mark)')) stripJunkSpans(block);
  if (block.classList.contains('flush')) {
    // the engine's own split keeps the class on the new line, and ⌘Z sees it
    document.execCommand('insertParagraph');
    const cur = caretBlock(body);
    if (cur) cur.classList.add('flush');
    syncChapter(body, chId);
    return true;
  }
  const r = sel.getRangeAt(0);
  const head = document.createRange();
  head.selectNodeContents(block);
  try { head.setEnd(r.startContainer, r.startOffset); } catch { return true; }
  if (block.textContent.trim() === '' || head.toString().length === 0) {
    snapshotStructure('flush paragraph');
    block.classList.add('flush');
    syncChapter(body, chId);
    resetNativeUndo();
    breakRun++;
    return true;
  }
  document.execCommand('insertParagraph');
  const cur = caretBlock(body);
  if (cur && cur !== block) cur.classList.add('flush');
  syncChapter(body, chId);
  return true;
}

// Backspace at the very start of a poetry or flush paragraph makes it prose
// again — the second Backspace then merges it upward like any paragraph
function poetryBackspace(e, body, chId) {
  if (e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const block = caretBlock(body);
  if (!block || !(block.classList.contains('poetry') || block.classList.contains('flush'))) return false;
  const r = sel.getRangeAt(0);
  const head = document.createRange();
  head.selectNodeContents(block);
  try { head.setEnd(r.startContainer, r.startOffset); } catch { return false; }
  if (head.toString().length !== 0) return false;
  e.preventDefault();
  snapshotStructure('poetry paragraph to prose');
  if (block.classList.contains('poetry')) romanize(block);
  block.classList.remove('poetry', 'flush');
  placeCaret(block, 0);
  syncChapter(body, chId);
  resetNativeUndo();
  breakRun++;
  return true;
}

// Format → Poetry Paragraph / Flush Paragraph: toggles every paragraph the
// selection touches (a paragraph is one or the other, or plain prose)
function togglePoetry() { toggleParaKind('poetry'); }
function toggleFlush() { toggleParaKind('flush'); }
function toggleParaKind(kind) {
  const sel = window.getSelection();
  if (!sel.rangeCount) { toast(t('Click into a paragraph first')); return; }
  const r = sel.getRangeAt(0);
  let el = r.startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const body = el && el.closest ? el.closest('.chapter-body') : null;
  if (!body) { toast(t('Click into a paragraph first')); return; }
  const chId = body.closest('.chapter').dataset.id;
  const ps = [...body.querySelectorAll('p')].filter(
    (p) => r.intersectsNode(p) && !p.classList.contains('scene-break')
  );
  if (!ps.length) return;
  snapshotStructure(kind + ' paragraph');
  const on = !ps.every((p) => p.classList.contains(kind));
  for (const p of ps) {
    const wasPoetry = p.classList.contains('poetry');
    p.classList.remove('poetry', 'flush');
    if (on) p.classList.add(kind);
    if (kind === 'poetry' && on) italicize(p);
    else if (wasPoetry) romanize(p);
  }
  caretIntoStart(ps[0]);
  syncChapter(body, chId);
  resetNativeUndo();
  breakRun++;
}

// ⇧Enter from the chapter title: a poetry paragraph above the opening one
function poetryUnderHeading(body, chId) {
  const line = document.createElement('p');
  line.className = 'poetry';
  italicize(line);
  snapshotStructure('poetry paragraph');
  body.prepend(line);
  body.focus();
  caretIntoStart(line);
  syncChapter(body, chId);
  resetNativeUndo();
  breakRun++;
}

// Backspace just below a *** (or Delete just above one) removes the break
// itself — prose never merges into the break's styled paragraph
function sceneBreakDelete(e, body, chId) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  let el = r.startContainer;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  const block = el && el.closest ? el.closest('p') : null;
  if (!block || !body.contains(block)) return false;
  const back = e.key === 'Backspace';
  const edge = document.createRange();
  edge.selectNodeContents(block);
  try {
    if (back) edge.setEnd(r.startContainer, r.startOffset);
    else edge.setStart(r.startContainer, r.startOffset);
  } catch { return false; }
  if (edge.toString().length !== 0) return false; // caret isn't at the block's edge
  const target = back ? block.previousElementSibling : block.nextElementSibling;
  if (!target || !target.classList.contains('scene-break')) return false;
  e.preventDefault();
  snapshotStructure('section break removed');
  target.remove();
  syncChapter(body, chId);
  resetNativeUndo();
  breakRun++;
  return true;
}

// Read a body's HTML for saving:
function captureBody(body) {
  // (a page marks the lines that say who said it, and a chapter the speech
  // after a scene break, for the screen only)
  return body.innerHTML.replace(/<p\b[^>]*>/g, (tag) => tag.replace(/ data-(?:attr|speech|first)=""/g, ''));
}

// A chapter that opens on a line of dialogue sets no drop cap: the dash
// itself would be the letter enlarged. That line, and one that follows a
// scene break, keep their indent where prose is set flush, so the speech
// lines up with the lines that answer it. The marks are never saved.
const OPENING_DASH = /^\s*[-‐‑‒–—―]/;
// A chapter's opening paragraph — the one with the drop cap and no indent —
// is its first paragraph with words in it, past a blank line or a *** at the
// top (the exports skip those too). Poetry stands apart. In an empty
// chapter it's the paragraph waiting for the first word. Marked data-first,
// for the screen only.
function openingPara(body) {
  const ps = [...body.children].filter((p) => p.tagName === 'P' && !p.classList.contains('poetry') && !p.classList.contains('scene-break') && !p.classList.contains('ghost'));
  return ps.find((p) => p.textContent.trim() !== '') || ps[0] || null;
}
function markDialogueOpening(body) {
  const first = openingPara(body);
  for (const p of body.querySelectorAll('p[data-first]')) if (p !== first) p.removeAttribute('data-first');
  if (first && !first.hasAttribute('data-first')) first.setAttribute('data-first', '');
  body.classList.toggle('opens-dialogue', !!first && OPENING_DASH.test(first.textContent));
  for (const p of body.querySelectorAll('p[data-speech]')) if (!p.matches('.scene-break + p')) p.removeAttribute('data-speech');
  for (const p of body.querySelectorAll('p.scene-break + p')) {
    const speech = OPENING_DASH.test(p.textContent);
    if (p.hasAttribute('data-speech') !== speech) p.toggleAttribute('data-speech', speech);
  }
}

function syncChapter(body, chId) {
  markDialogueOpening(body);
  chapterHTML[chId] = captureBody(body);
  wordCache[chId] = null;
  scheduleChapterSave(chId);
  updateCounters();
  scheduleNavRefresh();
}

// Heal text-node fragmentation in each paragraph as the caret leaves it:
let lastCaretPara = null;
let capOffBody = null;
let menuPoetryState = false;
let menuFlushState = false;
document.addEventListener('selectionchange', () => {
  if (!book || currentTab !== 'manuscript') return;
  const sel = window.getSelection();
  let caretP = null;
  if (sel && sel.rangeCount) {
    let el = sel.anchorNode;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    const p = el && el.closest ? el.closest('p') : null;
    if (p && p.parentElement && p.parentElement.classList.contains('chapter-body')) caretP = p;
  }
  if (caretP !== lastCaretPara) {
    if (lastCaretPara && lastCaretPara.isConnected) {
      try { lastCaretPara.normalize(); } catch { /* fine */ }
    }
    lastCaretPara = caretP;
  }
  // during a spellcheck pass, each chapter scans as the caret arrives
  if (spellOn && caretP) {
    const ch = caretP.closest('.chapter');
    if (ch) scanSpellingIn(ch.querySelector('.chapter-body'), ch.dataset.id);
  }
  // the drop cap steps aside while the caret is in the first paragraph
  const inPoetry = !!(caretP && caretP.classList.contains('poetry'));
  if (inPoetry !== menuPoetryState && window.neo.poetryState) {
    menuPoetryState = inPoetry;
    window.neo.poetryState(inPoetry);
  }
  const inFlush = !!(caretP && caretP.classList.contains('flush'));
  if (inFlush !== menuFlushState && window.neo.flushState) {
    menuFlushState = inFlush;
    window.neo.flushState(inFlush);
  }
  const inFirst = caretP && caretP.parentElement &&
    caretP.hasAttribute('data-first');
  const capBody = inFirst ? caretP.parentElement : null;
  if (capBody !== capOffBody) {
    if (capOffBody && capOffBody.isConnected) capOffBody.classList.remove('cap-off');
    if (capBody) capBody.classList.add('cap-off');
    capOffBody = capBody;
  }
});

// Does the caret sit at the start or the end of its paragraph, or after a
// space? What's pasted there opens or ends the paragraph only if so.
function caretEdges(body) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { start: true, end: true };
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = node && node.closest('p, div, li');
  if (!block || !body.contains(block)) return { start: true, end: true };
  const pre = document.createRange();
  pre.selectNodeContents(block);
  pre.setEnd(range.startContainer, range.startOffset);
  const post = document.createRange();
  post.selectNodeContents(block);
  post.setStart(range.endContainer, range.endOffset);
  const before = pre.toString();
  return { start: !before.trim(), end: !post.toString().trim(), spaced: /\s$/.test(before) };
}

// Reduce pasted HTML to what a manuscript is made of: paragraphs, bold,
// italic. Word, Apple Notes, Google Docs and browsers each dress a
// paragraph differently — <p>, <div>, a line break inside a block, styled
// spans — so every block boundary and <br> becomes a paragraph break, and
// styling that only lives in a style attribute is read as bold/italic.
// dashes: { style, ...caretEdges } sets dialogue dashes, for the manuscript.
function cleanPasteHtml(html, dashes) {
  // parsed off to the side: nothing in a clipboard loads or runs
  const holder = new DOMParser().parseFromString(html, 'text/html').body;
  holder.querySelectorAll('script,style,meta,link,img,table,head,title').forEach((n) => n.remove());
  // Google Docs wraps the whole clipboard in <b style="font-weight:normal">
  holder.querySelectorAll('b, strong').forEach((b) => {
    const w = (b.style && b.style.fontWeight || '').toLowerCase();
    if (w === 'normal' || w === '400') { while (b.firstChild) b.before(b.firstChild); b.remove(); }
  });
  // styled spans: Word's italics and bold often live only in a style attribute
  holder.querySelectorAll('span[style], font[style]').forEach((sp) => {
    const st = sp.style;
    const fw = (st.fontWeight || '').toLowerCase();
    const bold = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
    const ital = (st.fontStyle || '').toLowerCase() === 'italic';
    if (bold) { const b = document.createElement('b'); while (sp.firstChild) b.appendChild(sp.firstChild); sp.appendChild(b); }
    if (ital) { const i = document.createElement('i'); while (sp.firstChild) i.appendChild(sp.firstChild); sp.appendChild(i); }
    // (underline and strikethrough in a style are read by paraRuns)
  });
  // a break marker at every block edge and every line break
  const BREAK = '\uE000';
  const blocks = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article, header, footer, tr, dd, dt';
  holder.querySelectorAll(blocks).forEach((b) => {
    b.before(document.createTextNode(BREAK));
    b.after(document.createTextNode(BREAK));
  });
  holder.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode(BREAK)));

  const paras = [[]];
  for (const r of paraRuns(holder.innerHTML)) {
    if (r.mark !== undefined) { paras[paras.length - 1].push(r); continue; }
    const pieces = r.text.split(BREAK);
    pieces.forEach((text, i) => {
      if (i > 0) paras.push([]);
      if (text) paras[paras.length - 1].push({ text, b: r.b, i: r.i, u: r.u, s: r.s });
    });
  }
  const filled = paras.map((runs) => runs.some((r) => r.mark === undefined && r.text.trim()));
  const out = paras.map((runs, n) => {
    // whitespace collapses like HTML's, and each paragraph is trimmed
    runs = runs.map((r) => (r.mark !== undefined ? r : { ...r, text: r.text.replace(/\s+/g, ' ') }));
    const first = runs.find((r) => r.mark === undefined);
    if (first) first.text = first.text.replace(/^\s+/, '');
    const last = [...runs].reverse().find((r) => r.mark === undefined);
    if (last) last.text = last.text.replace(/\s+$/, '');
    if (dashes) {
      dashRuns(runs, dashes.style, {
        start: n !== filled.indexOf(true) || dashes.start,
        end: n !== filled.lastIndexOf(true) || dashes.end,
        spaced: n === filled.indexOf(true) && dashes.spaced
      });
    }
    const inner = runs.map((r) => {
      if (r.mark !== undefined) {
        // placeholder marks travel with their text; reconcileMarks pairs
        // each one back up with a note after the paste lands
        return r.mark
          ? `<span class="ph-mark" data-sid="${escHtml(r.mark)}" contenteditable="false">⚑</span>`
          : '';
      }
      if (!r.text) return '';
      return runHtml(r);
    }).join('');
    return inner.replace(/<[^>]+>/g, '').trim() ? '<p>' + inner + '</p>' : '';
  }).filter(Boolean);
  // single block pastes inline (no forced new paragraph)
  if (out.length === 1) return out[0].slice(3, -4);
  return out.join('');
}

// Em dash, ellipsis, smart quotes:
// Markdown emphasis, for writers whose fingers already know it: typing the
// closing * of *word* sets it in italic, the closing ** of **word** in bold
// (_word_ and __word__ too). Only in the manuscript and Notes, only when the
// marks hug a word the way Markdown wants them to, so 2 * 3, f***, a lone
// footnote * or a snake_case name stay as typed. ⌘Z right after gives the
// marks back as plain characters.
const escRe = (c) => c.replace(/\*/g, '\\*');
// Which emphasis the typed mark closes, if any, from the paragraph's text
// before the caret: ***word*** (bold italic), **word**, *word*. Nested
// emphasis is fine: **a *b* c** and *a **b** c* both close.
function mdEmphasisMatch(before, mark) {
  const m = escRe(mark);
  const edge = `(^|[^\\p{L}\\p{N}${m}\\\\])`;
  const inner = `(?!\\s|${m})(.*?[^\\s\\\\])`;
  const tries = [
    { open: 3, part: 2, bold: true, italic: true },
    { open: 2, part: 1, bold: true, italic: false },
    { open: 1, part: 0, bold: false, italic: true }
  ];
  for (const t of tries) {
    const r = before.match(new RegExp(`${edge}${m.repeat(t.open)}${inner}${m.repeat(t.part)}$`, 'u'));
    // the inner text must not end on the mark itself (that is a longer mark
    // still being typed), nor hold an emphasis opened but not yet closed
    // (in *a **b the next * closes **b, not *a)
    if (r && !r[2].endsWith(mark) && !(t.part === 0 && before.endsWith(mark)) && balancedRuns(r[2], mark)) {
      return { ...t, inner: r[2], start: before.length - (r[0].length - r[1].length) };
    }
  }
  return null;
}
function balancedRuns(text, mark) {
  const counts = {};
  for (const run of text.match(new RegExp(escRe(mark) + '+', 'g')) || []) counts[run.length] = (counts[run.length] || 0) + 1;
  return Object.values(counts).every((n) => n % 2 === 0);
}
// character offset within el → a (text node, offset) point
function pointAt(el, offset) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n; let left = offset; let last = null;
  while ((n = walk.nextNode())) {
    if (left <= n.textContent.length) return { node: n, offset: left };
    left -= n.textContent.length;
    last = n;
  }
  return last ? { node: last, offset: last.textContent.length } : { node: el, offset: 0 };
}
function selectChars(el, from, to) {
  const a = pointAt(el, from); const b = pointAt(el, to);
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}
let mdJustSet = null; // what was just turned into styling, for ⌘Z
// ~~struck~~ as it's typed: the second closing ~ strikes the words through
function markdownStrike(e, body, range) {
  if (library && library.markdownOff) return false;
  if (e.key !== '~' || !range.collapsed) return false;
  if (!body.matches || !body.matches('.chapter-body, #aux-editor')) return false;
  const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = (start && start.closest('p, div, li')) || body;
  if (!body.contains(block)) return false;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  const m = before.match(/(^|[^~\\])~~(?![\s~])(.*?[^\s\\~])~$/u);
  if (!m) return false;
  e.preventDefault();
  const end = before.length;
  const at = end - m[0].length + m[1].length; // where the opening ~~ sits
  let steps = 0;
  selectChars(block, end - 1, end); document.execCommand('delete'); steps++;
  selectChars(block, at, at + 2); document.execCommand('delete'); steps++;
  const innerEnd = end - 3;
  selectChars(block, at, innerEnd);
  if (!document.queryCommandState('strikeThrough')) { document.execCommand('strikeThrough'); steps++; }
  selectChars(block, innerEnd, innerEnd);
  if (document.queryCommandState('strikeThrough')) document.execCommand('strikeThrough');
  mdJustSet = { steps, key: e.key, block, end: innerEnd + 3 };
  return true;
}
function markdownEmphasis(e, body, range) {
  if (markdownStrike(e, body, range)) return true;
  if (library && library.markdownOff) return false;
  if (e.key !== '*' && e.key !== '_') return false;
  if (!body.matches || !body.matches('.chapter-body, #aux-editor')) return false;
  if (!range.collapsed) return false;
  const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = (start && start.closest('p, div, li')) || body;
  if (!body.contains(block)) return false;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  const hit = mdEmphasisMatch(before, e.key);
  if (!hit) return false;
  e.preventDefault();
  let steps = 0;
  const end = before.length;
  // the part of the closing mark already typed, then the opening mark
  if (hit.part) { selectChars(block, end - hit.part, end); document.execCommand('delete'); steps++; }
  selectChars(block, hit.start, hit.start + hit.open);
  document.execCommand('delete'); steps++;
  // the words between them get the styling ⌘B and ⌘I give
  const innerEnd = end - hit.part - hit.open;
  const cmds = [hit.italic && 'italic', hit.bold && 'bold'].filter(Boolean);
  for (const cmd of cmds) {
    selectChars(block, hit.start, innerEnd);
    if (!document.queryCommandState(cmd)) { document.execCommand(cmd); steps++; }
  }
  selectChars(block, innerEnd, innerEnd);
  // what comes next is typed plain again
  for (const cmd of cmds) if (document.queryCommandState(cmd)) document.execCommand(cmd);
  mdJustSet = { steps, key: e.key, block, end };
  return true;
}
// a key pressed on its own on the way to a shortcut
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Shift', 'Alt', 'AltGraph', 'CapsLock', 'OS']);
// A pasted line of Markdown as HTML with <b> and <i>, or null when it has
// no emphasis (so ordinary text keeps pasting as text). Same rules as typing.
function markdownInline(line) {
  const edge = '(^|[^\\p{L}\\p{N}*_\\\\])';
  const tail = '(?![\\p{L}\\p{N}])';
  let html = escHtml(line);
  const before = html;
  html = html.replace(new RegExp(`${edge}(\\*\\*\\*|___)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'), '$1<b><i>$3</i></b>');
  html = html.replace(new RegExp(`${edge}(\\*\\*|__)(?!\\s)(.+?)(?<![\\s\\\\])\\2${tail}`, 'gu'), '$1<b>$3</b>');
  html = html.replace(new RegExp(`${edge}(\\*|_)(?![\\s*_])(.+?)(?<![\\s\\\\*_])\\2${tail}`, 'gu'), '$1<i>$3</i>');
  html = html.replace(/(^|[^~\\])~~(?![\s~])(.+?)(?<![\s\\~])~~(?!~)/gu, '$1<s>$2</s>');
  return html === before ? null : html;
}
// ⌘Z (Ctrl+Z) right after: the styling goes and the marks come back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = mdJustSet;
  mdJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ') return;
  e.preventDefault();
  e.stopPropagation();
  for (let i = 0; i < just.steps; i++) document.execCommand('undo');
  // the text is back as it was typed; the mark that was about to close it goes in
  if (just.block.isConnected) selectChars(just.block, just.end, just.end);
  document.execCommand('insertText', false, just.key);
}, true);

// Dialogue dashes as you type (see dialogueDashEdits): a hyphen turns once
// the key after it shows what it is. The key then goes on as usual, so a
// quote after the dash still opens or closes. The opening dash is the
// manuscript's only: Notes and Outline keep their "- " lists.
let dashJustSet = null; // the dash just set, for ⌘Z
function dialogueDashKey(e, body) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.keyCode === 229) return;
  const key = e.key === 'Enter' ? '' : e.key;
  if (key.length > 1) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return;
  const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  let block = start && start.closest('p, div, li');
  if (!block || !body.contains(block)) block = body;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  // the hyphen opening the paragraph, or the one just behind the caret
  let from;
  if (/^-\s*$/.test(before) && body.matches('.chapter-body')) from = 0;
  else if (/\s-$/.test(before)) from = before.length - 2;
  else return;
  const edit = dialogueDashEdits(before.slice(from) + key, dashStyle(), { start: from === 0, end: !key })[0];
  if (!edit) return;
  const at = from + edit.at;
  selectChars(block, at, at + edit.from.length);
  document.execCommand('insertText', false, edit.to);
  if (key) dashJustSet = { block, at, was: edit.from, to: edit.to, key };
}
// ⌘Z (Ctrl+Z) right after: the hyphen comes back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = dashJustSet;
  dashJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ' || !just.block.isConnected) return;
  e.preventDefault();
  e.stopPropagation();
  selectChars(just.block, just.at, just.at + just.to.length);
  document.execCommand('insertText', false, just.was);
  const caret = just.at + just.was.length + just.key.length;
  selectChars(just.block, caret, caret);
}, true);

// Swap the last n typed characters for text. They are selected and typed
// over, so the new text takes their styling: deleting them first leaves the
// caret in whatever sits before them, and after an italic word the dash
// (and everything typed after it) would come out italic.
function replaceBefore(n, text) {
  const sel = window.getSelection();
  for (let i = 0; i < n; i++) sel.modify('extend', 'backward', 'character');
  document.execCommand('insertText', false, text);
}

// TODO: move to app.js
// ⌘Z (Ctrl+Z) right after: the lowercase comes back as typed
document.addEventListener('keydown', (e) => {
  if (MODIFIER_KEYS.has(e.key)) return; // the ⌘ or Ctrl of ⌘Z, on its way
  const just = capJustSet;
  capJustSet = null;
  if (!just || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ' || !just.block.isConnected) return;
  e.preventDefault();
  e.stopPropagation();
  selectChars(just.block, just.at, just.at + 1);
  document.execCommand('insertText', false, just.was);
  // a key typed after the "i" stays, with the caret past it
  const caret = just.at + 1 + just.key.length;
  selectChars(just.block, caret, caret);
}, true);

// Capitals as you type, in the manuscript: a sentence's first letter (at a
// paragraph's start, or after a full stop that isn't an ellipsis or an
// abbreviation; the same rules as capitalSlips) and, in English, "i" on its
// own. ⌘Z (Ctrl+Z) right after keeps the lowercase. Poetry is left alone.
let capJustSet = null; // the capital just set, for ⌘Z
function autoCapKey(e, body) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.keyCode === 229) return;
  if (e.key.length !== 1 || !body.matches('.chapter-body')) return;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.getRangeAt(0).collapsed) return;
  const range = sel.getRangeAt(0);
  const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = start && start.closest('p');
  if (!block || !body.contains(block) || block.matches('.poetry, .scene-break')) return;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  const lang = writingLanguage();
  // a lowercase letter where a sentence starts
  if (e.key !== e.key.toLocaleUpperCase(lang) && /\p{L}/u.test(e.key)) {
    let starts = /^[\s"'“‘„«»(\[¿¡—–-]*$/.test(before);
    if (!starts && /(?<!\.)\.\s+["'“‘„«(\[]?$/.test(before)) {
      const word = (before.replace(/\.\s+["'“‘„«(\[]?$/, '.').match(/([\p{L}.]+)\.$/u) || [])[1] || '';
      starts = !CAPS_ABBREV.has(word.toLowerCase()) && !/^\p{L}$/u.test(word);
    }
    if (!starts) return;
    e.preventDefault();
    const to = e.key.toLocaleUpperCase(lang);
    document.execCommand('insertText', false, to);
    capJustSet = { block, at: before.length, was: e.key, to, key: '' };
    return;
  }
  // English: "i" standing alone becomes "I" once the next key shows it is
  // a word (a space, punctuation, an apostrophe), and the key goes on as usual
  if (/^en\b/.test(lang) && /^[\s,;:!?'’")”\]—–-]$/.test(e.key) && /(?:^|[^\p{L}\p{M}\d'’.(-])i$/u.test(before)) {
    const at = before.length - 1;
    selectChars(block, at, at + 1);
    document.execCommand('insertText', false, 'I');
    capJustSet = { block, at, was: 'i', to: 'I', key: e.key };
  }
}

function smartKeys(e, body) {
  // a field can reach smartKeys twice (its own handler and the page-wide
  // one below): the first pass wins
  if (e.defaultPrevented) return;
  dialogueDashKey(e, body);
  autoCapKey(e, body);
  if (e.defaultPrevented) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.isComposing || e.keyCode === 229) return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);

  const prevChars = (n) => {
    if (!range.collapsed) return '';
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return '';
    return node.textContent.slice(Math.max(0, range.startOffset - n), range.startOffset);
  };

  if (markdownEmphasis(e, body, range)) return;
  if (e.key === '-' && prevChars(1) === '-') {
    e.preventDefault();
    replaceBefore(1, '—'); // —
    return;
  }
  if (e.key === '.' && prevChars(2) === '..') {
    e.preventDefault();
    replaceBefore(2, '…'); // …
    return;
  }
  const french = frenchTypography();
  // French: a narrow no-break space (U+202F) before ; : ! ? replaces the
  // ordinary space typed ahead of them. (The wider U+00A0 is not used: the
  // editing engine turns it back into a plain space, and NEO heals it away.)
  // Quebec usage (OQLF) keeps the space before the colon only.
  const spaced = french === 'ca' ? /^:$/ : /^[;:!?]$/;
  if (french && spaced.test(e.key) && /^[ \u00a0]$/.test(prevChars(1))) {
    e.preventDefault();
    document.execCommand('delete');
    document.execCommand('insertText', false, '\u202f' + e.key);
    return;
  }
  if (e.key === '"' || e.key === "'") {
    e.preventDefault();
    const before = prevChars(1);
    const q = e.key === '"' ? bookQuotes(body) : quoteStyle();
    let opening = before === '' || /[\s\(\[\{‘“«„>]/.test(before);
    // after a dash, a quote usually closes speech that was cut off ("I was
    // just—"); it opens one only when no quotation is open in the paragraph
    if (before === '—' || before === '–') opening = !quoteIsOpen(range, e.key === '"' ? q : { open: '‘', close: '’' }, e.key === '"' ? '"' : '');
    let ch;
    if (e.key === "'") {
      // most languages type ' as an apostrophe only; English and Dutch also
      // open single quotes with it
      ch = q.singles && opening ? '‘' : '’';
    } else {
      ch = opening ? q.open : q.close;
    }
    document.execCommand('insertText', false, ch);
  }
}

// Is a quotation open at the caret, in the paragraph so far?
function quoteIsOpen(range, q, straight) {
  let el = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  const block = el && el.closest ? el.closest('p, div') : null;
  if (!block) return false;
  const pre = document.createRange();
  pre.selectNodeContents(block);
  try { pre.setEnd(range.startContainer, range.startOffset); } catch { return false; }
  return quoteOpenIn(pre.toString(), q, straight);
}
// The count itself: opening marks against closing ones; an apostrophe (’
// between two letters) is no quote. Straight marks ("), which text imported
// or pasted from a plain-text editor arrives with, have no side of their
// own: they pair up in turn, so an odd one out is an open quotation.
function quoteOpenIn(text, q, straight = '') {
  const open = q.open.trim();
  const close = q.close.trim();
  let depth = 0;
  let straights = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (straight && c === straight) straights++;
    else if (c === open && open !== close) depth++;
    else if (c === close) {
      if (close === '’' && /\p{L}/u.test(text[i - 1] || '') && /\p{L}/u.test(text[i + 1] || '')) continue;
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0 || straights % 2 === 1;
}

// The quotation marks of the language being written: the spellcheck
// language when one is set, otherwise NEO's own language.
const QUOTE_STYLES = {
  en: { open: '“', close: '”', singles: true },
  nl: { open: '“', close: '”', singles: true },
  pt: { open: '“', close: '”', singles: true },          // Brazil
  'pt-PT': { open: '«', close: '»' },
  fr: { open: '«\u202f', close: '\u202f»' },             // narrow no-break spaces inside
  es: { open: '«', close: '»' },                          // RAE: « » first
  it: { open: '«', close: '»' },
  de: { open: '„', close: '“' },
  pl: { open: '„', close: '”' },
  ro: { open: '„', close: '”' },
  ru: { open: '«', close: '»' },
  el: { open: '«', close: '»' }
};
function writingLanguage() {
  return (library && library.spellLanguage) || NeoI18n.getLocale();
}
function quoteStyle() {
  const code = writingLanguage();
  return QUOTE_STYLES[code] || QUOTE_STYLES[code.split('-')[0]] || QUOTE_STYLES.en;
}
// …unless the book has settled on guillemets its language doesn't use:
// German novels often set »…« where the language says „…“, Swiss writing
// «…». Whichever mark opens the most quotes wins — in this chapter, or in
// the book when the chapter has none yet — so a » typed by hand once is
// enough to carry on in that style.
function bookQuotes(el) {
  const q = quoteStyle();
  const opens = (text) => {
    const n = (re) => (text.match(re) || []).length;
    const own = q.open.trim();
    return { '»': n(/»(?=[\p{L}\p{N}])/gu), '«': own === '«' ? 0 : n(/«(?=[\p{L}\p{N}])/gu), own: n(new RegExp(own + '\\s?(?=[\\p{L}\\p{N}])', 'gu')) };
  };
  const body = el && el.closest ? el.closest('.chapter-body') : null;
  let c = opens(body ? body.textContent : '');
  if (!c['»'] && !c['«'] && !c.own && book) c = opens(book.chapterOrder.map((id) => chapterHTML[id] || '').join(' '));
  if (c['»'] > c.own && c['»'] >= c['«']) return { open: '»', close: '«' };
  if (c['«'] > c.own && c['«'] > c['»']) return { open: '«', close: '»' };
  return q;
}

// A hyphen standing on its own is a dash the keyboard didn't have. At the
// start of a paragraph it opens speech, spaced the way the language sets
// dialogue (— Olá, —Hola; elsewhere as typed). After a space, with a space,
// a closing quote, punctuation or the paragraph's end behind it, it becomes
// the language's dash and the spaces stay as typed. Hyphens in words
// (guarda-chuva), suspended ones (pré- e pós-), and those before a digit
// (-5) or a suffix (-mente) stay hyphens.
const DIALOGUE_DASHES = {
  pt: { open: '—', space: ' ', mid: '—' },   // — Olá — diz ela.
  ru: { open: '—', space: ' ', mid: '—' },
  es: { open: '—', space: '', mid: '—' },    // —Hola —dijo él—.
  en: { open: '—', mid: '–' }                // and every other language: word – word
};
const DASH_OPEN = /^-(?:(\s+)(?=[^\s-])|(?=[^\s\d-]))/u;
// (a quote typed right after the hyphen closes whatever comes next)
const DASH_MID = /(?<=\s)-(?=["'“”‘’«»„]*(?:[\s.,;:!?…)\]]|$)|["'“”‘’«»„]+\uE000)/gu;
// The changes, as { at, from, to }. start / end: whether the text begins or
// ends its paragraph (a fragment pasted mid-sentence does neither); spaced:
// whether a space comes before it.
function dialogueDashEdits(text, style, { start = true, end = true, spaced = false } = {}) {
  // a scene break, or a paragraph of nothing but dashes
  if (start && end && /^[\s*#•~⁂—–-]*$/.test(text)) return [];
  const edits = [];
  const open = start && text.match(DASH_OPEN);
  if (open) edits.push({ at: 0, from: open[0], to: style.open + (style.space !== undefined ? style.space : open[1] || '') });
  // past the end of a fragment, anything could follow
  const lead = !start && spaced ? ' ' : '';
  const probe = lead + text + (end ? '' : '\uE000');
  for (const m of probe.matchAll(DASH_MID)) edits.push({ at: m.index - lead.length, from: '-', to: style.mid });
  return edits;
}
function dialogueDashes(text, style, edges) {
  return dialogueDashEdits(text, style, edges).reduceRight(
    (s, e) => s.slice(0, e.at) + e.to + s.slice(e.at + e.from.length), text);
}
// The same across a pasted paragraph's runs of bold and italic: each change
// lands in the run that holds it
function dashRuns(runs, style, edges) {
  const texts = runs.filter((r) => r.mark === undefined);
  const edits = dialogueDashEdits(texts.map((r) => r.text).join(''), style, edges);
  for (const e of edits.reverse()) {
    let pos = 0;
    for (const r of texts) {
      if (e.at >= pos && e.at + e.from.length <= pos + r.text.length) {
        r.text = r.text.slice(0, e.at - pos) + e.to + r.text.slice(e.at - pos + e.from.length);
        break;
      }
      pos += r.text.length;
    }
  }
}
function dashStyle() {
  const code = writingLanguage();
  return DIALOGUE_DASHES[code] || DIALOGUE_DASHES[code.split('-')[0]] || DIALOGUE_DASHES.en;
}

// French typographic rules apply when the book is spellchecked in French,
// or when NEO itself speaks French. Returns false, 'fr', or 'ca' for Quebec
// usage (when the interface is set to Canadian French).
function frenchTypography() {
  if (!writingLanguage().startsWith('fr')) return false;
  return /^fr-CA$/i.test(NeoI18n.getLocale()) ? 'ca' : 'fr';
}

// Titles, outline lines, notes and shelf names get the same typography as
// the manuscript (which calls smartKeys itself). Capture phase, because
// those fields keep their keystrokes from bubbling to the page.
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.defaultPrevented || !el || !el.isContentEditable || el.closest('.chapter-body')) return;
  smartKeys(e, el);
}, true);

// Title page: Enter drops you into Chapter One.
$('#tp-title').addEventListener('keydown', titleEnter);
$('#tp-subtitle').addEventListener('keydown', titleEnter);
function titleEnter(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  // into the story, past any pages that come before it
  const first = book.chapterOrder.find((c) => isStory(c));
  if (first) focusChapter(first);
  else focusChapter(createChapterAt(storyEnd()));
}
$('#tp-title').addEventListener('input', () => {
  book.title = $('#tp-title').textContent.trim() || t('Untitled');
  scheduleMetaSave();
});
$('#tp-subtitle').addEventListener('input', () => {
  book.subtitle = $('#tp-subtitle').textContent.trim();
  scheduleMetaSave();
});
// each book can carry its own pen name
$('#tp-author').addEventListener('input', () => {
  book.author = $('#tp-author').textContent.trim();
  scheduleMetaSave();
});

// Which logical shortcut a keyboard event means.
//
// Matched by the CHARACTER the key types, not the position it sits at: the help
// overlay names characters (⌘/), and a character is what a menu accelerator can
// name. A physical fallback catches the layouts where that character needs a
// modifier the accelerator cannot spell — on Swiss German `/` is Shift+7 and
// `;` is Shift+`,`, and on German `ö` sits on the `;` key — and every fallback
// skips the character the menu already handles, so one press fires one action.
function isSpellcheckShortcut(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  if (e.shiftKey && e.key === ';') return true;
  return e.code === 'Semicolon' && e.key !== ';';
}
function isLargerTextShortcut(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
}
function isSmallerTextShortcut(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.key === '-' || e.code === 'NumpadSubtract';
}
function isHelpShortcut(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.key === '/' || e.key === '?';
}

// Global editor shortcuts
document.addEventListener('keydown', (e) => {
  if ($('#editor-view').hidden) return;
  if (document.querySelector('.modal-backdrop:not([hidden])')) return; // visible modals own the keyboard
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.shiftKey && e.code === 'KeyX') {
    e.preventDefault();
    if (currentTab === 'manuscript') insertPlaceholder();
  }
  if (cmd && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    if (currentTab === 'manuscript') darlingFromKeyboard();
  }
  if (isSpellcheckShortcut(e)) {
    e.preventDefault();
    toggleSpellcheck();
  }
  // The text-size pair keeps the menu's own keys on the layouts where they
  // match, and takes over by character where they do not (`+` is Shift+1 on
  // Swiss German, so CmdOrCtrl-Plus never fires there).
  if (isLargerTextShortcut(e)) {
    e.preventDefault();
    void setEditorFontSize(1);
  }
  if (isSmallerTextShortcut(e)) {
    e.preventDefault();
    void setEditorFontSize(-1);
  }
  if (e.key === 'Escape') {
    if (!$('#searchbar').hidden) closeSearch();
    else window.neo.fullscreenEscape().then((exited) => { if (!exited) backToShelf(); });
  }
});

// The help character works on every layout, editor or shelf: ⌘/ needs Shift+7
// on Swiss German, which the bare-character accelerator cannot name, so the
// renderer catches the character the layout produced.
document.addEventListener('keydown', (e) => {
  if (!isHelpShortcut(e)) return;
  e.preventDefault();
  showHelp();
});

// ⌥⌘↓ / ⌥⌘↑ (Ctrl+Alt on Windows and Linux): next or previous chapter.
// No menu item carries these any more, so the window catches them itself —
// first, before the page or the outline can read them as plain arrows.
// Pocket takes both: a keyboard paired with a phone or an iPad may be a
// Mac's (⌘ arrives as Meta) or a PC's (Ctrl).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const cmd = IS_POCKET ? (e.metaKey !== e.ctrlKey) : (IS_MAC ? e.metaKey : e.ctrlKey);
  if (!cmd || !e.altKey || e.shiftKey) return;
  if ($('#editor-view').hidden || document.querySelector('.modal-backdrop:not([hidden])')) return;
  e.preventDefault();
  e.stopPropagation();
  gotoChapter(e.key === 'ArrowDown' ? 1 : -1);
}, true);