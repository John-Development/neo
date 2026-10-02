/* ================================================================== */
/*  EXPORT + EMAIL                                                     */
/* ================================================================== */

// letters of every script stay (a Russian title keeps its name), only
// punctuation goes
function safeName(s) {
  const clean = (x) => x.replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, '').trim().replace(/\s+/g, '-');
  return clean(s || '') || clean(t('Untitled'));
}

// Every paragraph is rebuilt from its text runs, so exports carry only
// author-meaningful markup: text, bold, italic, alignment, scene breaks.
// Stray spans, inline styles, trailing <br>s, and no-break spaces all
// stop at this door.
function parasFromHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  // an unwritten outline section is a ghost paragraph plus the scene break
  // NEO planted for it; neither belongs in a book
  holder.querySelectorAll('p.ghost[data-sec-id]').forEach((g) => {
    const brk = holder.querySelector(`p.scene-break[data-sec-brk="${g.dataset.secId}"]`);
    if (brk) brk.remove();
  });
  holder.querySelectorAll('.darling-anchor, .ph-mark, .ghost').forEach((n) => n.remove());
  return [...holder.querySelectorAll('p')].map((p) => {
    const sceneBreak = p.classList.contains('scene-break');
    const poetry = p.classList.contains('poetry');
    const flush = !poetry && p.classList.contains('flush');
    const align = (p.style && p.style.textAlign) || '';
    const runs = paraRuns(p.innerHTML, true).filter((r) => r.text);
    const inner = runs.map((r) => runHtml(r)).join('');
    return {
      sceneBreak,
      poetry,
      flush,
      text: p.innerText.replace(/\u00a0/g, ' ').trim(),
      runs,
      align,
      html: `<p${poetry ? ' class="poetry"' : flush ? ' class="flush"' : ''}${align ? ` style="text-align:${align}"` : ''}>${inner}</p>`
    };
  }).filter((p) => p.sceneBreak || p.text);
}

// The book's entries as the builders lay them out. Chapters, a prologue and
// an epilogue are prose under their headings; a part is a page of its own
// (its first line its title); the pages a book carries are set the way books
// set them, and one left blank stays out. `toc` is the table of contents.
// The Contents entry, when the book has one, is where a printed contents
// page goes: what comes before it is the front of the book. Without one,
// the front is the copyright, dedication and epigraph that open the book.
const FRONT_PAGES = ['copyright', 'dedication', 'epigraph'];
function exportChapters() {
  const solo = soloStory();
  const sections = [];
  const toc = [];
  const push = (sec) => { sec.num = sections.length + 1; sections.push(sec); return sec; };
  let parts = 0;
  let inPart = false;
  let contentsAt = -1;
  for (const chId of book.chapterOrder) {
    const kind = chapterKind(chId);
    if (kind === 'part') { parts += 1; inPart = true; } else if (BACK_KINDS.includes(kind)) inPart = false;
    if (kind === 'contents') { if (contentsAt < 0) contentsAt = sections.length; continue; }
    const el = document.querySelector(`.chapter[data-id="${chId}"] .chapter-body`);
    const paras = parasFromHtml(el ? el.innerHTML : (chapterHTML[chId] || ''));
    if (FRONT_PAGES.includes(kind)) {
      if (paras.length) push({ kind, heading: '', label: kindName(kind), level: 0, paras });
      continue;
    }
    if (kind === 'acknowledgments' || kind === 'about') {
      if (!paras.length) continue;
      const sec = push({ kind, heading: kindName(kind), level: 0, paras });
      toc.push({ label: sec.heading, num: sec.num, level: 0, type: 'page' });
      continue;
    }
    if (kind === 'part') {
      // the page's first line is the part's title; what follows, a quote or a verse
      const titled = !!(paras[0] && !paras[0].sceneBreak && !isAttribution(paras[0]));
      const partTitle = titled ? paras[0].text : '';
      const sec = push({ kind: 'part', heading: partLabel(parts), partTitle, level: 0, paras: titled ? paras.slice(1) : paras });
      toc.push({ label: partTitle ? sec.heading + ': ' + partTitle : sec.heading, num: sec.num, level: 0, type: 'part' });
      continue;
    }
    // the story: chapterless stories export as continuous text
    const heading = chId === solo ? '' : chapterHeading(chId);
    const level = inPart ? 1 : 0;
    const sec = push({ kind: 'chapter', heading, paras, role: chapterRole(chId) || '', level, chId });
    toc.push({ label: heading || book.title, num: sec.num, level, type: 'chapter' });
  }
  if (contentsAt >= 0) sections.forEach((sec, i) => { sec.front = i < contentsAt; });
  else for (const sec of sections) { if (!FRONT_PAGES.includes(sec.kind)) break; sec.front = true; }
  return { sections, toc, contents: contentsAt >= 0 };
}

// The open book, packaged for the builders. Every builder takes an optional
// data object in this shape, good for anthologies.
function bookExportData() {
  // an EPUB wants a real UUID as its identifier; the book gets one the first
  // time it's exported and keeps it, so re-exports are the same book
  if (!book.uuid) {
    book.uuid = crypto.randomUUID();
    saveMeta();
  }
  const { sections, toc, contents } = exportChapters();
  return {
    id: book.id,
    uuid: book.uuid,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author || t('Anonymous'), // the screen says so; the files should too
    language: writingLanguage(),
    coverSeed: book.coverSeed,
    coverImage: book.coverImage || null,
    sections,
    toc,
    // a printed contents page only where the writer put one; it lists the
    // chapters too (a book of books lists its titles instead)
    contents,
    contentsChapters: true
  };
}

// One chapter, on its own: the book's title page, then that chapter, headed
// as it is in the book (Chapter 7 — Holston). No cover image in a web page
// or PDF; an EPUB keeps the book's cover, since e-readers expect one.
function chapterExportData(chId) {
  const d = bookExportData();
  const sec = d.sections.find((s) => s.kind === 'chapter' && s.chId === chId);
  if (!sec) return null;
  Object.assign(sec, { num: 1, level: 0, front: false });
  return {
    ...d,
    sections: [sec],
    toc: [{ label: sec.heading || d.title, num: 1, level: 0, type: 'chapter' }],
    contents: false,
    chapterOnly: sec.heading || chapterName(chId)
  };
}

// a heading as plain text: a part's name with its title
const plainHeading = (ch) => (ch.partTitle ? `${ch.heading}: ${ch.partTitle}` : ch.heading);

function buildTxt(data) {
  const d = data || bookExportData();
  let out = `${d.title.toUpperCase()}\n`;
  if (d.subtitle) out += `${d.subtitle}\n`;
  out += t('by {author}', { author: d.author }) + '\n\n\n';
  for (const ch of d.sections) {
    if (ch.heading) out += `${plainHeading(ch).toUpperCase()}\n\n`;
    for (const p of ch.paras) out += p.sceneBreak ? '\n***\n\n' : (p.poetry ? '    ' : '') + p.text + '\n\n';
    out += '\n';
  }
  return out;
}

function buildMd(data) {
  const d = data || bookExportData();
  // a title like "Wool *Omnibus*" must not turn into markup (idea: nejcc, #70)
  const mdMeta = (s) => String(s || '').replace(/([\\`*_\[\]#<>])/g, '\\$1');
  // wrap a run in emphasis markers, keeping boundary spaces outside them
  const mdRun = (r) => {
    let t = r.text.replace(/([\\*_`~])/g, '\\$1');
    const mark = r.b && r.i ? '***' : r.b ? '**' : r.i ? '*' : '';
    if (!mark && !r.s && !r.u) return t;
    const lead = t.match(/^\s*/)[0];
    const trail = t.match(/\s*$/)[0];
    let core = t.slice(lead.length, t.length - trail.length);
    if (!core) return t;
    // Markdown has strikethrough; underline goes as HTML, which it allows
    if (r.s) core = '~~' + core + '~~';
    if (r.u) core = '<u>' + core + '</u>';
    return lead + mark + core + mark + trail;
  };
  let out = `# ${mdMeta(d.title)}\n\n`;
  if (d.subtitle) out += `*${mdMeta(d.subtitle)}*\n\n`;
  out += `**${t('by {author}', { author: mdMeta(d.author) })}**\n\n`;
  for (const ch of d.sections) {
    if (ch.heading) out += `\n## ${mdMeta(plainHeading(ch))}\n\n`;
    for (const p of ch.paras) {
      out += p.sceneBreak ? '\n***\n\n' : (p.poetry ? '> ' : '') + p.runs.map(mdRun).join('') + '\n\n';
    }
  }
  return out;
}

// The Web Page and PDF read in the page's own typeface. A face NEO ships
// (the @font-face rules in styles.css, the body fonts on Linux) travels
// inside the file, so the PDF matches the page on any machine; a font the
// computer has goes by name, with the same fallbacks as the page.
const exportBodyFont = () => (getComputedStyle(document.documentElement).getPropertyValue('--body-font').trim() || 'Georgia, serif').replace(/[<>{};]/g, '');
// the drop cap too: its face is the page's, bundled or the computer's
const exportDropCapFont = () => (getComputedStyle(document.documentElement).getPropertyValue('--dropcap-font').trim() || 'Georgia, serif').replace(/[<>{};]/g, '');
const firstFamily = (stack) => stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
async function exportFontFaces(d) {
  const family = firstFamily(exportBodyFont());
  // the drop cap sets one letter, upright and regular
  const cap = (library.fonts || {}).dropcap === 'none' ? '' : firstFamily(exportDropCapFont());
  const text = d.sections.map((ch) => ch.paras.map((p) => p.html).join('')).join('');
  // (the title is always bold; a dedication, an epigraph, a part's lines
  // and a title's subtitle are set in italic)
  const italic = !!d.subtitle || /<i[\s>]/.test(text)
    || d.sections.some((ch) => ['dedication', 'epigraph', 'part'].includes(ch.kind) || ch.subtitle);
  const boldItalic = italic && /<b[\s>]/.test(text);
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules = [];
    try { rules = [...sheet.cssRules]; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      const name = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      const style = r.style.getPropertyValue('font-style') || 'normal';
      const weight = r.style.getPropertyValue('font-weight') || '400';
      const forBody = name === family && !(style === 'italic' && !(parseInt(weight, 10) >= 600 ? boldItalic : italic));
      const forCap = name === cap && style === 'normal' && parseInt(weight, 10) === 400;
      if (!forBody && !forCap) continue;
      const src = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)\s*(format\([^)]*\))?/);
      if (!src) continue;
      // a Russian face keeps its range and its measures, or it would stand
      // in for the Latin one at the Latin one's size
      const fit = ['unicode-range', 'size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']
        .map((k) => r.style.getPropertyValue(k) && ` ${k}: ${r.style.getPropertyValue(k)};`).filter(Boolean).join('');
      try {
        const bytes = new Uint8Array(await (await fetch(new URL(src[1], sheet.href || location.href))).arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const ext = src[1].split('.').pop().toLowerCase();
        css += `@font-face { font-family: '${name}'; src: url(data:font/${ext};base64,${btoa(bin)}) ${src[2] || ''}; font-weight: ${weight}; font-style: ${style};${fit} }\n`;
      } catch { /* the name still stands, with its fallbacks */ }
    }
  }
  return css;
}

// The pages of a book that aren't chapters, set the way books set them.
// A line that opens with a dash says who said the lines above it.
const isAttribution = (p) => /^(?:[—–]|--?\s)/.test(p.text || '');
// a section's heading level follows the contents: a part, the titles in
// it, their chapters (a single book's chapters are all level 0)
const headTag = (ch) => 'h' + Math.min(6, 2 + (ch.level || 0));

function buildHtml(data, opts = {}) {
  const d = data || bookExportData();
  const total = d.sections.filter((ch) => (ch.kind || 'chapter') === 'chapter')
    .reduce((s, ch) => s + ch.paras.reduce((n, p) => n + countWords(p.text || ''), 0), 0);
  const stamp = new Date().toLocaleString(NeoI18n.getLocale());
  // a chapter's text: only its opening paragraph gets the enlarged initial,
  // scene breaks resume ordinary body text
  const prose = (paras, initial) => {
    let first = initial;
    let afterBreak = false; // a story's line of speech after *** keeps its indent
    return paras.map((p) => {
      if (p.sceneBreak) { afterBreak = initial; return '<p class="brk">***</p>'; }
      if (p.poetry) { afterBreak = false; return p.html; }
      let html = p.html;
      if (first || afterBreak) {
        const h = document.createElement('div');
        h.innerHTML = html;
        if (h.firstElementChild) {
          if (first) h.firstElementChild.classList.add('first');
          if (OPENING_DASH.test(h.textContent)) h.firstElementChild.classList.add('dialogue');
          html = h.innerHTML;
        }
      }
      first = false;
      afterBreak = false;
      return html;
    }).join('\n');
  };
  // a page's lines, each set on its own
  const lines = (paras, attrs = true) => paras.map((p) => {
    if (p.sceneBreak) return '<p class="brk">***</p>';
    const cls = [attrs && isAttribution(p) ? 'attr' : '', p.poetry ? 'poetry' : ''].filter(Boolean).join(' ');
    return `<p${cls ? ` class="${cls}"` : ''}${p.align ? ` style="text-align:${p.align}"` : ''}>${p.html.replace(/^<p[^>]*>|<\/p>$/g, '')}</p>`;
  }).join('\n');
  const sectionHtml = (ch) => {
    const id = 's' + ch.num;
    const h = headTag(ch);
    const kind = ch.kind || 'chapter';
    if (kind === 'copyright' || kind === 'dedication' || kind === 'epigraph') {
      return `
    <section class="page ${kind}" id="${id}"><div class="pg-in">${lines(ch.paras, kind !== 'copyright')}</div></section>`;
    }
    if (kind === 'part') {
      // the separator is there for the PDF's bookmarks ("Part I: Title"),
      // not for the eye
      return `
    <section class="page part" id="${id}">
      <${h} class="hd"><span class="pl">${escHtml(ch.heading)}</span>${ch.partTitle ? `<span class="sep">: </span><span class="pt">${escHtml(ch.partTitle)}</span>` : ''}</${h}>
      ${lines(ch.paras)}
    </section>`;
    }
    if (kind === 'opener') {
      return `
    <section class="page opener" id="${id}">
      <${h} class="hd">${escHtml(ch.heading)}</${h}>
      ${ch.subtitle ? `<p class="sub">${escHtml(ch.subtitle)}</p>` : ''}
      ${ch.byline ? `<p class="byline">${escHtml(ch.byline)}</p>` : ''}
    </section>`;
    }
    const back = kind === 'acknowledgments' || kind === 'about';
    return `
    <section class="chapter${back ? ' backpage' : ''}" id="${id}">
      ${ch.heading ? `<${h} class="hd">${escHtml(ch.heading)}</${h}>` : ''}
      ${ch.byline ? `<p class="byline">${escHtml(ch.byline)}</p>` : ''}
      ${prose(ch.paras, !back)}
    </section>`;
  };
  // Contents: the parts, the titles and the pages at the back. The page
  // numbers are filled in by the PDF printer (main.js), which prints the
  // book once to learn where everything landed.
  const contents = d.contents && d.toc && d.toc.length ? `
    <nav class="contents">
      <h2 class="hd">${escHtml(t('Contents'))}</h2>
      <ol>${d.toc.filter((e) => d.contentsChapters || e.type !== 'chapter').map((e) => `
        <li class="lv${e.level} t-${e.type}"><a href="#s${e.num}"><span class="toc-t">${escHtml(e.label)}</span><span class="toc-pg" data-for="s${e.num}"></span></a></li>`).join('')}
      </ol>
    </nav>` : '';
  // the contents follow the pages at the front of the book
  let body = '';
  let placed = !contents;
  for (const ch of d.sections) {
    if (!placed && !ch.front) { body += contents; placed = true; }
    body += sectionHtml(ch);
  }
  if (!placed) body += contents;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escHtml(d.title)}</title>
<style>
  ${opts.fonts || ''}
  body { font-family: ${exportBodyFont()}; color: #1c1c1c; max-width: 620px; margin: 40px auto; line-height: 1.7; font-size: 13pt; }
  .coverpage { text-align: center; margin: 0 0 40px; page-break-after: always; }
  .coverpage img { display: block; margin: 0 auto; width: 100%; max-width: 620px; max-height: 95vh; object-fit: contain; }
  .titlepage { text-align: center; margin: 30vh 0 20vh; page-break-after: always; }
  .titlepage h1 { font-size: 30pt; margin: 0; }
  .titlepage .sub { font-style: italic; color: #555; }
  .titlepage .auth { margin-top: 40px; letter-spacing: 3px; text-transform: uppercase; font-size: 11pt; }
  .chapter { page-break-before: always; }
  /* headings in small capitals rather than capitals, so the PDF's bookmarks
     read "Chapter 3", not "CHAPTER 3" */
  .chapter .hd, .contents .hd { text-align: center; letter-spacing: 4px; font-variant-caps: all-small-caps; font-variant-numeric: oldstyle-nums; font-size: 17pt; font-weight: normal; color: #555; margin: 54px 0 36px; }
  .chapter p { text-indent: 2em; margin: 0; }
  .chapter .hd + p, .chapter .byline + p, .brk + p, .chapter p.first { text-indent: 0; }
  .chapter p.dialogue { text-indent: 2em; }
  /* the drop cap the page sets, two lines deep in its own face. An initial
     letter, not a float: it stays inside its word, so the PDF's copy,
     search, and screen readers still find "The" where a float leaves "T"
     and "he" (a gap much wider than 4px splits the word again). A browser
     that can't set one gets a raised initial. */
  ${(library.fonts || {}).dropcap === 'none' ? '' : `.chapter p.first:not(.dialogue)::first-letter { -webkit-initial-letter: 2; initial-letter: 2; padding-right: 4px; font-family: ${exportDropCapFont()}; }
  @supports not ((initial-letter: 2) or (-webkit-initial-letter: 2)) { .chapter p.first:not(.dialogue)::first-letter { font-size: 1.8em; line-height: 1; padding-right: 0; } }`}
  .brk { text-align: center; text-indent: 0 !important; letter-spacing: 8px; color: #888; margin: 2.5em 0; }
  .chapter p.poetry { text-indent: 0; margin: 0 2.5em; }
  .chapter p.flush { text-indent: 0 !important; }
  .chapter p:not(.poetry) + p.poetry, .chapter .hd + p.poetry { margin-top: 0.9em; }
  .chapter p.poetry + p:not(.poetry) { margin-top: 0.9em; }
  .chapter p.byline { text-align: center; margin: -24px 0 40px; letter-spacing: 3px; text-transform: uppercase; font-size: 10pt; color: #555; }
  /* the pages that aren't chapters */
  .page { page-break-before: always; text-align: center; }
  .page p { margin: 0 0 0.5em; }
  .page p.poetry { margin: 0 0 0.2em; }
  .page p.attr { font-style: normal; font-size: 10pt; letter-spacing: 1px; margin-top: 1.2em; }
  .page .brk { margin: 1.2em 0; }
  .copyright { min-height: 98vh; display: flex; flex-direction: column; justify-content: flex-end; text-align: left; font-size: 9pt; line-height: 1.6; color: #333; }
  .copyright p { margin: 0 0 0.9em; }
  .dedication { padding-top: 26vh; font-style: italic; }
  .epigraph { padding-top: 24vh; margin: 0 3em; font-style: italic; }
  .part { padding-top: 28vh; }
  .part .hd { font-weight: normal; margin: 0 0 2.4em; }
  .part .pl { display: block; font-size: 15.5pt; letter-spacing: 5px; font-variant-caps: all-small-caps; color: #555; }
  .part .sep { color: transparent; font-size: 1px; line-height: 0; white-space: pre; }
  .part .pt { display: block; font-size: 24pt; line-height: 1.25; margin-top: 14px; }
  .part p { font-style: italic; margin-left: 3em; margin-right: 3em; }
  .dedication i, .epigraph i, .part p i { font-style: normal; }
  .opener { padding-top: 28vh; }
  .opener .hd { font-size: 26pt; font-weight: normal; line-height: 1.25; margin: 0; }
  .opener .sub { font-style: italic; color: #555; margin-top: 12px; }
  .opener .byline { margin-top: 40px; letter-spacing: 3px; text-transform: uppercase; font-size: 10pt; }
  .contents { page-break-before: always; }
  .contents ol { list-style: none; margin: 0 1.5em; padding: 0; }
  .contents li { margin: 0.3em 0; }
  .contents a { display: flex; align-items: baseline; color: inherit; text-decoration: none; }
  .contents .toc-t { flex: 1; }
  .contents .toc-pg { flex: none; width: 3em; text-align: right; font-size: 13pt; font-variant-numeric: lining-nums tabular-nums; }
  .contents li.lv1 { margin-left: 1.6em; }
  .contents li.lv2 { margin-left: 3.2em; }
  .contents li.t-part { margin-top: 1.1em; font-size: 15pt; line-height: 1.5; letter-spacing: 2px; font-variant-caps: all-small-caps; }
  .contents li:not(.t-page) + li.t-page { margin-top: 1.2em; }
  .prov { margin-top: 80px; text-align: center; color: #999; font-size: 9pt; }
  /* printed pages carry their number at the foot; the cover, the title
     page and the pages that aren't chapters don't, the way books do it
     (only the PDF uses these rules) */
  @page { @bottom-center { content: counter(page); font-family: ${exportBodyFont()}; font-size: 9pt; color: #777; } }
  @page front { @bottom-center { content: none; } }
  .coverpage, .titlepage, .page, .contents { page: front; }
</style></head><body>
${opts.cover ? `<div class="coverpage"><img src="data:${opts.cover.mime};base64,${opts.cover.base64}" alt="${t('Cover')}"/></div>` : ''}
<div class="titlepage"><h1>${escHtml(d.title)}</h1>
${d.subtitle ? `<p class="sub">${escHtml(d.subtitle)}</p>` : ''}
<p class="auth">${escHtml(d.author)}</p></div>
${body}
${opts.stamp ? `<p class="prov">${t('{n} words · exported from NEO on {date}', { n: total, date: stamp })}</p>` : ''}
</body></html>`;
}

/* ---------- runs: paragraphs broken into styled text pieces ---------- */

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Walk a paragraph's DOM and emit [{text, b, i}] so docx/epub get real bold/italic.
// In the manuscript an italic inside an italic is emphasis in a poetry
// paragraph (itself one italic), and it is set upright, the typesetter's
// way (flip). Pasted HTML often doubles its italics for nothing; not there.
// a run's text in the manuscript's own inline tags
function runHtml(r, esc = escHtml) {
  let t = esc(r.text);
  if (r.s) t = '<s>' + t + '</s>';
  if (r.u) t = '<u>' + t + '</u>';
  if (r.i) t = '<i>' + t + '</i>';
  if (r.b) t = '<b>' + t + '</b>';
  return t;
}
function paraRuns(pHtml, flip) {
  const holder = document.createElement('template'); // inert: nothing loads or runs
  holder.innerHTML = pHtml;
  const runs = [];
  const walk = (node, b, i, u, x) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) runs.push({ text: child.textContent.replace(/\u00a0/g, ' '), b, i, u, s: x });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.classList && child.classList.contains('ph-mark')) {
          runs.push({ mark: child.dataset.sid || '' });
          continue;
        }
        const tag = child.tagName;
        // the engine writes bold italic as <b style="font-style: italic"> (or
        // the other way round) when ⌘I meets ⌘B: the style counts like a tag
        const st = child.style || {};
        const fw = String(st.fontWeight || '').toLowerCase();
        const it = tag === 'I' || tag === 'EM' || String(st.fontStyle || '').toLowerCase() === 'italic';
        const bo = tag === 'B' || tag === 'STRONG' || fw === 'bold' || parseInt(fw, 10) >= 600;
        // underline and strikethrough: the engine's tags, or a style
        const deco = String(st.textDecoration || st.textDecorationLine || '').toLowerCase();
        const un = tag === 'U' || tag === 'INS' || deco.includes('underline');
        const st2 = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || deco.includes('line-through');
        walk(child, b || bo, it ? (flip ? !i : true) : i, u || un, x || st2);
      }
    }
  };
  walk(holder.content, false, false, false, false);
  return runs;
}

/* ---------- DOCX ---------- */

function docxP(runs, opts = {}) {
  // the schema wants a paragraph's properties in this order
  const pPr = [];
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.keepNext) pPr.push('<w:keepNext/>');
  if (opts.pageBreak) pPr.push('<w:pageBreakBefore/>');
  if (opts.spaceBefore || opts.spaceAfter) {
    pPr.push(`<w:spacing${opts.spaceBefore ? ` w:before="${opts.spaceBefore}"` : ''}${opts.spaceAfter ? ` w:after="${opts.spaceAfter}"` : ''} w:line="360" w:lineRule="auto"/>`);
  }
  if (opts.poetry) pPr.push('<w:ind w:left="720" w:right="720"/>');
  else if (opts.indentLeft) pPr.push(`<w:ind w:left="${opts.indentLeft}"/>`);
  else if (opts.indent) pPr.push('<w:ind w:firstLine="480"/>');
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);
  const rXml = runs.map((r) => {
    if (r.br) return '<w:r><w:br/></w:r>';
    const it = opts.flip ? !r.i : r.i;
    const caps = r.caps !== undefined ? r.caps : opts.caps;
    const size = r.size || opts.size;
    const rPr = (r.b ? '<w:b/>' : '') + (it ? '<w:i/>' : '') + (r.s ? '<w:strike/>' : '') + (r.u ? '<w:u w:val="single"/>' : '')
      + (caps === true ? '<w:caps/>' : caps === false ? '<w:caps w:val="0"/>' : '')
      + (opts.tracking ? `<w:spacing w:val="${opts.tracking}"/>` : '')
      + (size ? `<w:sz w:val="${size}"/>` : '');
    return `<w:r>${rPr ? '<w:rPr>' + rPr + '</w:rPr>' : ''}<w:t xml:space="preserve">${escXml(r.text)}</w:t></w:r>`;
  }).join('');
  return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${rXml}</w:p>`;
}

function buildDocxEntries(data) {
  const d = data || bookExportData();
  const body = [];
  // headings carry Word's own heading styles, so the navigation pane and a
  // table of contents inserted in Word both see the book's shape
  const heading = (ch) => 'Heading' + Math.min(3, 1 + (ch.level || 0));
  // a page's lines: centered, upright where the page is italic
  const pageLines = (paras, italic, first) => paras.forEach((p, i) => {
    const lead = i === 0 ? first : {};
    if (p.sceneBreak) { body.push(docxP([{ text: '***' }], Object.assign({ align: 'center' }, lead))); return; }
    const attr = isAttribution(p);
    body.push(docxP(paraRuns(p.html), Object.assign({ align: 'center', flip: italic && !attr, size: attr ? 20 : undefined, spaceBefore: attr ? 240 : 0 }, lead)));
  });
  // title page
  body.push(docxP([{ text: d.title, b: true }], { align: 'center', spaceBefore: 3000, size: 56 }));
  if (d.subtitle) body.push(docxP([{ text: d.subtitle, i: true }], { align: 'center', size: 32 }));
  body.push(docxP([{ text: d.author }], { align: 'center', spaceBefore: 800 }));
  const contents = () => {
    body.push(docxP([{ text: t('Contents') }], { align: 'center', pageBreak: true, spaceBefore: 1200, size: 28, caps: true }));
    body.push(docxP([], {}));
    for (const e of d.toc.filter((x) => d.contentsChapters || x.type !== 'chapter')) {
      body.push(docxP([{ text: e.label }], { indentLeft: 480 * e.level, spaceBefore: e.type === 'part' ? 240 : 0, caps: e.type === 'part' }));
    }
  };
  let placed = !(d.contents && d.toc && d.toc.length);
  d.sections.forEach((ch) => {
    if (!placed && !ch.front) { contents(); placed = true; }
    const kind = ch.kind || 'chapter';
    if (kind === 'copyright') {
      ch.paras.forEach((p, i) => body.push(docxP(p.sceneBreak ? [] : paraRuns(p.html), { pageBreak: i === 0, spaceBefore: i === 0 ? 6000 : 0, spaceAfter: 120, size: 18 })));
      return;
    }
    if (kind === 'dedication' || kind === 'epigraph') {
      pageLines(ch.paras, true, { pageBreak: true, spaceBefore: kind === 'dedication' ? 3600 : 3200 });
      return;
    }
    if (kind === 'part') {
      const runs = [{ text: ch.heading }];
      if (ch.partTitle) runs.push({ br: true }, { br: true }, { text: ch.partTitle, caps: false, size: 48 });
      body.push(docxP(runs, { style: heading(ch), spaceBefore: 3600, spaceAfter: 480 }));
      pageLines(ch.paras, true, {});
      return;
    }
    if (kind === 'opener') {
      body.push(docxP([{ text: ch.heading, caps: false, size: 44 }], { style: heading(ch), spaceBefore: 3600 }));
      if (ch.subtitle) body.push(docxP([{ text: ch.subtitle, i: true }], { align: 'center', size: 28 }));
      if (ch.byline) body.push(docxP([{ text: ch.byline }], { align: 'center', spaceBefore: 600, size: 20, caps: true }));
      return;
    }
    if (ch.heading) {
      body.push(docxP([{ text: ch.heading }], { style: heading(ch) }));
      if (ch.byline) body.push(docxP([{ text: ch.byline }], { align: 'center', size: 20, caps: true }));
      body.push(docxP([], {}));
    } else {
      body.push(docxP([], { pageBreak: true })); // headingless story still starts fresh
    }
    for (const p of ch.paras) {
      if (p.sceneBreak) body.push(docxP([{ text: '***' }], { align: 'center', spaceBefore: 240 }));
      else if (p.poetry) body.push(docxP(paraRuns(p.html), { align: p.align === 'center' || p.align === 'right' ? p.align : '', poetry: true }));
      else if (p.align === 'center' || p.align === 'right') body.push(docxP(paraRuns(p.html), { align: p.align }));
      else body.push(docxP(paraRuns(p.html), { indent: !p.flush }));
    }
  });
  if (!placed) contents();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;
  const headingStyle = (n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>
<w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="1200"/><w:jc w:val="center"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:caps/><w:sz w:val="28"/></w:rPr></w:style>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3].map(headingStyle).join('\n')}
</w:styles>`;
  return [
    { path: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>` },
    { path: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>` },
    { path: 'word/_rels/document.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { path: 'word/document.xml', content: documentXml },
    { path: 'word/styles.xml', content: stylesXml }
  ];
}

/* ---------- EPUB (KDP-friendly: EPUB 3, nav + NCX TOC, cover image) ---------- */

// The cover that travels with an export: the writer's own image if they
// gave one, otherwise the shelf's abstract with the title set in type,
// rendered at KDP size. NEO's paintings never leave the shelf.
async function exportCover(d) {
  if (d.coverImage) {
    const c = await window.neo.readCover(d.id, d.coverImage);
    if (c) return { base64: c.base64, mime: c.mime, ext: c.ext };
  }
  await NeoCovers.ready;
  const url = NeoCovers.renderFull(d).toDataURL('image/jpeg', 0.9);
  return { base64: url.split(',')[1], mime: 'image/jpeg', ext: 'jpg' };
}

// what each kind of section is, in the EPUB's own words
const EPUB_TYPES = {
  copyright: 'copyright-page', dedication: 'dedication', epigraph: 'epigraph', part: 'part',
  opener: 'volume', acknowledgments: 'acknowledgments', about: 'backmatter'
};

function chapterXhtml(ch, d) {
  const kind = ch.kind || 'chapter';
  const xhtmlRuns = (p) => paraRuns(p.html).map((r) => {
    let t = escXml(r.text);
    if (r.s) t = '<s>' + t + '</s>';
    if (r.u) t = '<u>' + t + '</u>';
    if (r.i) t = '<em>' + t + '</em>';
    if (r.b) t = '<strong>' + t + '</strong>';
    return t;
  }).join('');
  // a page's lines, each set on its own
  const lines = () => ch.paras.map((p) => {
    if (p.sceneBreak) return '<p class="brk">* * *</p>';
    const cls = [kind !== 'copyright' && isAttribution(p) ? 'attr' : '', p.poetry ? 'poetry' : '', p.align === 'center' || p.align === 'right' ? p.align : ''].filter(Boolean);
    return `<p${cls.length ? ` class="${cls.join(' ')}"` : ''}>${xhtmlRuns(p)}</p>`;
  }).join('\n');
  let inner;
  if (kind === 'copyright' || kind === 'dedication' || kind === 'epigraph') {
    inner = `<section epub:type="${EPUB_TYPES[kind]}" class="${kind}">
${lines()}
</section>`;
  } else if (kind === 'part') {
    inner = `<section epub:type="part" class="part"><h1><span class="pl">${escXml(ch.heading)}</span>${ch.partTitle ? `<span class="pt">${escXml(ch.partTitle)}</span>` : ''}</h1>
${lines()}
</section>`;
  } else if (kind === 'opener') {
    inner = `<section epub:type="volume" class="opener"><h1>${escXml(ch.heading)}</h1>
${ch.subtitle ? `<p class="sub">${escXml(ch.subtitle)}</p>` : ''}${ch.byline ? `<p class="byline">${escXml(ch.byline)}</p>` : ''}
</section>`;
  } else {
    let first = true;
    const paras = ch.paras.map((p) => {
      if (p.sceneBreak) { first = true; return '<p class="brk">* * *</p>'; }
      const classes = [];
      if (p.poetry) classes.push('poetry');
      else if (p.flush) classes.push('flush');
      else if (first) {
        classes.push('first');
        // speech keeps its indent, in line with the lines that answer it
        if (OPENING_DASH.test(p.text || '')) classes.push('dialogue');
      }
      if (p.align === 'center' || p.align === 'right') classes.push(p.align);
      const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
      if (!p.poetry) first = false;
      return `<p${cls}>${xhtmlRuns(p)}</p>`;
    }).join('\n');
    inner = `<section epub:type="${EPUB_TYPES[kind] || ch.role || 'chapter'}">${ch.heading ? `<h1>${escXml(ch.heading)}</h1>` : ''}${ch.byline ? `<p class="byline">${escXml(ch.byline)}</p>` : ''}
${paras}
</section>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escXml(ch.heading || ch.label || d.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${inner}</body></html>`;
}

async function buildEpubEntries(data) {
  const d = data || bookExportData();
  const chapters = d.sections;
  const uuid = 'urn:uuid:' + (d.uuid || crypto.randomUUID());
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // real cover art when the book has it; the shelf's cover otherwise
  const cover = await exportCover(d);
  const coverName = 'cover.' + cover.ext;
  const coverMime = cover.mime;
  const coverContent = cover.base64;
  // the pages at the front come before the contents in reading order
  const front = chapters.filter((ch) => ch.front);
  const rest = chapters.filter((ch) => !ch.front);
  const start = rest[0] || chapters[0];
  const chItems = chapters.map((ch) =>
    `<item id="ch${ch.num}" href="ch${ch.num}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
  const spineOf = (list) => list.map((ch) => `<itemref idref="ch${ch.num}"/>`).join('\n');
  // one entry per section for a single book; a book of books nests its
  // chapters under their titles and its titles under their parts
  const toc = tocTree(d.toc || chapters.map((ch) => ({ label: ch.heading || d.title, num: ch.num, level: 0 })));
  const navList = (nodes) => nodes.map((n) => `<li><a href="ch${n.e.num}.xhtml">${escXml(n.e.label)}</a>${n.children.length ? `
<ol>
${navList(n.children)}
</ol>` : ''}</li>`).join('\n');
  let playOrder = 1; // the title page is first
  const ncxPoints = (nodes) => nodes.map((n) => {
    playOrder += 1;
    return `
<navPoint id="ch${n.e.num}" playOrder="${playOrder}"><navLabel><text>${escXml(n.e.label)}</text></navLabel><content src="ch${n.e.num}.xhtml"/>${ncxPoints(n.children)}</navPoint>`;
  }).join('');
  const entryCount = (nodes) => nodes.reduce((n, x) => n + 1 + entryCount(x.children), 0);

  const entries = [
    { path: 'mimetype', content: 'application/epub+zip', store: true },
    { path: 'META-INF/container.xml', content: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>` },
    { path: 'OEBPS/content.opf', content: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${uuid}</dc:identifier>
<dc:title>${escXml(d.title)}</dc:title>
<dc:creator>${escXml(d.author)}</dc:creator>
<dc:language>${escXml(d.language || NeoI18n.getLocale())}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="cover-image" href="${coverName}" media-type="${coverMime}" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${chItems}
</manifest>
<spine toc="ncx">
<itemref idref="cover" linear="no"/>
<itemref idref="titlepage"/>
${front.length ? spineOf(front) + '\n' : ''}<itemref idref="nav"${entryCount(toc) <= 1 ? ' linear="no"' : ''}/>
${spineOf(rest)}
</spine>
<guide>
<reference type="cover" title="${escXml(t('Cover'))}" href="cover.xhtml"/>
<reference type="toc" title="${escXml(t('Table of Contents'))}" href="nav.xhtml"/>
<reference type="text" title="${escXml(t('Beginning'))}" href="ch${start.num}.xhtml"/>
</guide>
</package>` },
    { path: 'OEBPS/nav.xhtml', content: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escXml(t('Table of Contents'))}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><nav epub:type="toc" id="toc"><h1>${escXml(t('Contents'))}</h1>
<ol>
<li><a href="title.xhtml">${escXml(t('Title Page'))}</a></li>
${navList(toc)}
</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>
<li><a epub:type="cover" href="cover.xhtml">${escXml(t('Cover'))}</a></li>
<li><a epub:type="toc" href="nav.xhtml">${escXml(t('Table of Contents'))}</a></li>
<li><a epub:type="bodymatter" href="ch${start.num}.xhtml">${escXml(t('Beginning'))}</a></li>
</ol></nav>
</body></html>` },
    { path: 'OEBPS/toc.ncx', content: `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uuid}"/></head>
<docTitle><text>${escXml(d.title)}</text></docTitle>
<navMap>
<navPoint id="titlepage" playOrder="1"><navLabel><text>${escXml(t('Title Page'))}</text></navLabel><content src="title.xhtml"/></navPoint>${ncxPoints(toc)}
</navMap></ncx>` },
    { path: 'OEBPS/style.css', content: `body { font-family: serif; line-height: 1.5; margin: 1em; }
h1 { text-align: center; font-weight: normal; letter-spacing: 0.2em; text-transform: uppercase; font-size: 1.2em; margin: 3em 0 2em; }
p { text-indent: 1.2em; margin: 0; }
p.first, p.brk + p, p.byline + p { text-indent: 0; }
p.first.dialogue:not(.center):not(.right) { text-indent: 1.2em; }
p.center { text-align: center; text-indent: 0; }
p.right { text-align: right; text-indent: 0; }
p.brk { text-align: center; text-indent: 0; margin: 2.5em 0; letter-spacing: 0.5em; }
p.poetry { text-indent: 0; margin: 0 2em; }
p.flush { text-indent: 0 !important; }
p:not(.poetry) + p.poetry, h1 + p.poetry { margin-top: 0.9em; }
p.poetry + p:not(.poetry) { margin-top: 0.9em; }
p.byline { text-align: center; text-indent: 0; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.8em; margin: -1em 0 2em; }
.copyright { margin-top: 40%; font-size: 0.8em; line-height: 1.5; }
.copyright p { text-indent: 0; margin: 0 0 0.9em; }
.dedication, .epigraph, .part, .opener { text-align: center; margin-top: 30%; }
.epigraph { margin-left: 2em; margin-right: 2em; }
.dedication p, .epigraph p, .part p { text-indent: 0; margin: 0 0 0.5em; font-style: italic; }
.dedication em, .epigraph em, .part p em { font-style: normal; }
.dedication p.poetry, .epigraph p.poetry, .part p.poetry { margin: 0 0 0.2em; }
p.attr { font-style: normal; font-size: 0.85em; letter-spacing: 0.05em; margin-top: 1em; }
.part h1 { margin: 0 0 2em; }
.part .pl { display: block; }
.part .pt { display: block; margin-top: 0.8em; font-size: 1.6em; letter-spacing: 0; text-transform: none; }
.opener h1 { margin: 0; font-size: 1.8em; letter-spacing: 0.02em; text-transform: none; }
.opener .sub { text-indent: 0; margin-top: 0.6em; font-style: italic; }
.opener .byline { margin: 3em 0 0; }
nav#toc ol { list-style: none; padding-left: 0; }
nav#toc ol ol { padding-left: 1.5em; }
.titlepage { text-align: center; margin-top: 30%; }
.titlepage h2 { font-size: 2em; margin: 0; }
.titlepage .sub { font-style: italic; }
.titlepage .auth { margin-top: 4em; letter-spacing: 0.3em; text-transform: uppercase; }
.coverimg { text-align: center; margin: 0; padding: 0; }
.coverimg img { max-width: 100%; max-height: 100%; }` },
    { path: 'OEBPS/cover.xhtml', content: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escXml(t('Cover'))}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><div class="coverimg"><img src="${coverName}" alt="${escXml(d.title)}"/></div></body></html>` },
    { path: 'OEBPS/title.xhtml', content: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escXml(d.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><div class="titlepage"><h2>${escXml(d.title)}</h2>
${d.subtitle ? `<p class="sub">${escXml(d.subtitle)}</p>` : ''}
<p class="auth">${escXml(d.author)}</p></div></body></html>` },
    { path: 'OEBPS/' + coverName, content: coverContent, base64: true }
  ];
  for (const ch of chapters) {
    entries.push({ path: `OEBPS/ch${ch.num}.xhtml`, content: chapterXhtml(ch, d) });
  }
  return entries;
}

/* ---------- A BOOK OF BOOKS: a bound shelf, or a shelf as an anthology ---------- */

// Read a shelf from disk into export sections, in shelf order. Each section
// has a kind the builders lay out: 'copyright', 'dedication', 'epigraph'
// (front pages), 'part', 'opener' (a title's own first page), 'chapter',
// 'acknowledgments', 'about' (back pages). `toc` is the table of contents:
// {label, num (the section), level, type: part | title | chapter | page}.
// A bound shelf brings its cover and pages and numbers its chapters its own
// way; an unbound shelf is read as an anthology: titles only, each one's
// chapters counted from 1.
async function shelfBookData(shelf, opts = {}) {
  const bound = !!opts.bound;
  const through = bound && ((shelf.binding && shelf.binding.numbering) || 'through') !== 'restart';
  const metas = [];
  for (const id of shelf.bookIds) {
    const m = await window.neo.readBookMeta(id);
    if (m && (bound || !isPageMeta(m))) metas.push(m);
  }
  const cover = metas.find((m) => m.kind === 'cover') || null;
  const author = (cover && cover.author) || shelfAuthorName(shelf);
  const titles = metas.filter((m) => !isPageMeta(m));
  const single = titles.length === 1;
  const pageParas = async (m) => parasFromHtml(m.chapterOrder && m.chapterOrder[0]
    ? await window.neo.readChapter(m.id, m.chapterOrder[0]) : '');
  const sections = [];
  const toc = [];
  const push = (s) => { s.num = sections.length + 1; sections.push(s); return s; };
  let n = 0; // the chapter count
  let parts = 0;
  let inPart = false;
  for (const m of metas) {
    if (m.kind === 'cover') continue;
    if (PAGE_FRONT.includes(m.kind) || PAGE_BACK.includes(m.kind)) {
      const paras = await pageParas(m);
      if (!paras.length) continue; // a page left blank stays out of the book
      const back = PAGE_BACK.includes(m.kind);
      const s = push({ kind: m.kind, front: !back, heading: back ? pageKindName(m.kind) : '', label: pageKindName(m.kind), level: 0, paras });
      if (back) {
        toc.push({ label: s.heading, num: s.num, level: 0, type: 'page' });
        inPart = false;
      }
      continue;
    }
    if (m.kind === 'part') {
      parts += 1;
      const all = await pageParas(m);
      // the page's first line is the part's title; what follows, a quote or a verse
      const titled = !!(all[0] && !all[0].sceneBreak && !isAttribution(all[0]));
      const partTitle = titled ? all[0].text : '';
      const s = push({ kind: 'part', heading: partLabel(parts), partTitle, level: 0, paras: titled ? all.slice(1) : all });
      toc.push({ label: partTitle ? s.heading + ': ' + partTitle : s.heading, num: s.num, level: 0, type: 'part' });
      inPart = true;
      continue;
    }
    if (PAGE_WRITTEN.includes(m.kind)) {
      // the book's own prologue or epilogue: one unnumbered section (any
      // chapters the writer gave it run on, a scene break between them)
      const paras = [];
      for (const chId of m.chapterOrder || []) {
        const p = parasFromHtml(await window.neo.readChapter(m.id, chId));
        if (!p.length) continue;
        if (paras.length) paras.push({ sceneBreak: true, poetry: false, text: '', runs: [], align: '', html: '' });
        paras.push(...p);
      }
      if (!paras.length) continue;
      const heading = isUntitled(m.title) ? pageKindName(m.kind) : m.title.trim();
      const s = push({ kind: 'chapter', role: m.kind, heading, level: 0, paras });
      toc.push({ label: heading, num: s.num, level: 0, type: 'title' });
      inPart = false;
      continue;
    }
    // a title and its chapters: its story and its parts. The pages it
    // carries as a book of its own (its copyright, its dedication…) stay
    // with it; the bound book has pages of its own.
    if (!through) n = 0;
    const level = inPart ? 1 : 0;
    const chapters = [];
    for (const chId of m.chapterOrder || []) {
      const kind = chapterKind(chId, m);
      if (!STORY_KINDS.includes(kind) && kind !== 'part') continue;
      const paras = parasFromHtml(await window.neo.readChapter(m.id, chId));
      if (paras.length || kind === 'part') chapters.push({ chId, kind, paras });
    }
    while (chapters.length && chapters[chapters.length - 1].kind === 'part') chapters.pop();
    if (!chapters.length) continue;
    const byline = m.author && m.author !== author ? m.author : '';
    if (single && chapters.length === 1) {
      push({ kind: 'chapter', heading: '', paras: chapters[0].paras });
      continue;
    }
    if (chapters.length === 1) {
      // one chapter is one section, headed by the title's own name and left
      // out of the count: a prologue, an interlude, a short story
      const s = push({ kind: 'chapter', heading: m.title, byline, level, paras: chapters[0].paras });
      toc.push({ label: m.title, num: s.num, level, type: 'title' });
      continue;
    }
    let chLevel = level;
    if (!single) {
      const s = push({ kind: 'opener', heading: m.title, subtitle: m.subtitle || '', byline, level, paras: [] });
      toc.push({ label: m.title, num: s.num, level, type: 'title' });
      chLevel = level + 1;
    }
    // a title's own parts stand over the chapters that follow them
    let titleParts = 0;
    let underPart = false;
    for (const c of chapters) {
      if (c.kind === 'part') {
        titleParts += 1;
        if (m.restartNumbering) n = 0; // this title numbers its chapters part by part
        const titled = !!(c.paras[0] && !c.paras[0].sceneBreak && !isAttribution(c.paras[0]));
        const partTitle = titled ? c.paras[0].text : '';
        const s = push({ kind: 'part', heading: partLabel(titleParts), partTitle, level: chLevel, paras: titled ? c.paras.slice(1) : c.paras });
        toc.push({ label: partTitle ? s.heading + ': ' + partTitle : s.heading, num: s.num, level: chLevel, type: 'part' });
        underPart = true;
        continue;
      }
      const role = chapterRole(c.chId, m);
      if (role === 'epilogue') underPart = false;
      const chTitle = (m.chapterTitles || {})[c.chId];
      let heading;
      if (c.kind === 'unnumbered') heading = chTitle || '';
      else {
        if (role) heading = role === 'prologue' ? t('Prologue') : t('Epilogue');
        else { n += 1; heading = t('Chapter {n}', { n }); }
        if (chTitle) heading = library.exportCustomChapterTitles ? chTitle : heading + ' — ' + chTitle;
      }
      const lv = underPart ? chLevel + 1 : chLevel;
      const s = push({ kind: 'chapter', heading, level: lv, paras: c.paras, role: role || '' });
      toc.push({ label: heading, num: s.num, level: lv, type: 'chapter' });
    }
  }
  // an EPUB wants one identity per book: a bound book keeps the first it gets
  let uuid = null;
  if (bound) {
    if (!shelf.binding.uuid) {
      shelf.binding.uuid = crypto.randomUUID();
      await writeLibrary(library);
    }
    uuid = shelf.binding.uuid;
  }
  const title = opts.title || shelf.name;
  return {
    id: cover && cover.coverImage ? cover.id : 'shelf-' + shelf.id,
    uuid,
    title,
    subtitle: (cover && cover.subtitle) || '',
    author,
    language: writingLanguage(),
    coverSeed: cover ? cover.coverSeed : shelf.id + ':' + title,
    coverImage: (cover && cover.coverImage) || null,
    sections,
    toc,
    // a contents page in print for a book of several titles, or for one
    // title that has a Contents page of its own (which lists its chapters)
    contents: titles.length > 1 || (single && (titles[0].chapterOrder || []).some((c) => chapterKind(c, titles[0]) === 'contents')),
    contentsChapters: single
  };
}

async function shelfPayload(data, format) {
  const defaultName = safeName(data.title);
  if (format === 'docx') return { format, defaultName, zipEntries: buildDocxEntries(data) };
  if (format === 'epub') return { format, defaultName, zipEntries: await buildEpubEntries(data) };
  return { format: 'pdf', defaultName, content: buildHtml(data, { cover: await exportCover(data), fonts: await exportFontFaces(data) }) };
}

function shelfFormats() {
  return [
    { label: 'EPUB', desc: t('For ebook stores — the TOC lists every story.'), value: 'epub' },
    { label: 'Word (.docx)', desc: t('For editors — each story starts on a new page.'), value: 'docx' },
    { label: 'PDF', desc: t('For reading, sharing, and print.'), value: 'pdf' }
  ];
}

async function exportShelfAnthology(shelf) {
  if (!shelf.bookIds.length) { toast(t('This shelf has no books on it yet')); return; }
  const title = await askInput(t('Anthology title'), t('Shown on the title page, cover, and metadata'), shelf.name);
  if (title === null) return;
  const format = await optionModal(t('Export the anthology as…'), null, shelfFormats());
  if (!format) return;
  toast(t('Collecting the shelf…'));
  try {
    const data = await shelfBookData(shelf, { title: title || shelf.name });
    if (!data.sections.length) { toast(t('No words found on this shelf yet')); return; }
    const saved = await window.neo.exportSave(await shelfPayload(data, format));
    if (saved) toast(t('Anthology of {n} works exported: {file}', { n: shelf.bookIds.length, file: saved.split('/').pop() }), 6000);
  } catch (err) {
    window.neo.logError('export anthology: ' + (err && err.stack || err));
    toast(t('Couldn’t export the anthology: {error}', { error: plainError(err) }), 8000);
  }
}

// A bound shelf goes out as the book it is: no questions but the format
async function exportBoundBook(shelf) {
  const format = await optionModal(escHtml(t('Export “{title}”', { title: shelf.name })), null, shelfFormats());
  if (!format) return;
  toast(t('Collecting the shelf…'));
  try {
    const data = await shelfBookData(shelf, { bound: true });
    if (!data.sections.length) { toast(t('No words found on this shelf yet')); return; }
    const saved = await window.neo.exportSave(await shelfPayload(data, format));
    if (saved) toast(t('Exported: {file}', { file: saved.split('/').pop() }));
  } catch (err) {
    window.neo.logError('export bound book: ' + (err && err.stack || err));
    toast(t('Couldn’t export: {error}', { error: plainError(err) }), 8000);
  }
}

// Right-click a bound book's cover: its art, and the book's own choices
async function boundCoverMenu(shelf, meta, el) {
  const options = [];
  if (!NO_HOVER) {
    options.push({ label: meta.coverImage ? t('Replace cover art…') : t('Set cover art…'), desc: t('Pick an image (2:3 works best). Or just drag one from Finder onto the book.'), value: 'cover' });
  }
  if (meta.coverImage) {
    options.push({ label: t('Remove cover art'), desc: t('Deletes the image from the book folder. (To just hide it, use the ↻ on the book.)'), danger: true, value: 'uncover' });
  }
  options.push(
    { label: t('New cover'), value: 'refresh' },
    { label: t('Export the book…'), desc: t('EPUB, Word or PDF, with its cover, its pages and one table of contents.'), value: 'export' },
    { label: t('Unbind'), desc: t('A shelf of separate titles again. Its pages wait for the next binding.'), value: 'unbind' }
  );
  const choice = await optionModal(escHtml(t('“{name}” · one book', { name: shelf.name })), null, options);
  if (choice === 'cover') {
    const src = await window.neo.pickCover();
    if (!src) return;
    const fname = await window.neo.setCover(meta.id, src);
    if (!fname) return;
    const live = (await window.neo.readBookMeta(meta.id)) || meta;
    live.coverImage = fname;
    live.coverMode = 'image';
    await writeBookMeta(meta.id, live);
    renderShelves();
  } else if (choice === 'uncover') {
    await window.neo.removeCover(meta.id);
    const live = (await window.neo.readBookMeta(meta.id)) || meta;
    live.coverImage = null;
    await writeBookMeta(meta.id, live);
    renderShelves();
  } else if (choice === 'refresh') {
    await refreshCover(meta, el);
  } else if (choice === 'export') {
    await exportBoundBook(shelf);
  } else if (choice === 'unbind') {
    await unbindShelf(shelf);
  }
}

// flat {level} entries into a tree, for the EPUB's nested contents
function tocTree(entries) {
  const root = { children: [] };
  const stack = [root];
  for (const e of entries) {
    const level = Math.max(0, Math.min(e.level, stack.length - 1));
    stack.length = level + 1;
    const node = { e, children: [] };
    stack[level].children.push(node);
    stack.push(node);
  }
  return root.children;
}


// What went wrong, in the words a writer can use: Electron wraps a failure in
// the main process as "Error invoking remote method 'export:save': Error: …"
function plainError(err) {
  return String((err && err.message) || err).replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
}

// the whole book, or with chId just that chapter
async function doExport(format, chId = null) {
  if (!book) { toast(t('Open a book first')); return; }
  flushAllSaves();
  const one = chId ? chapterExportData(chId) : null;
  if (chId && !one) return;
  const data = one || undefined;
  const defaultName = safeName(book.title) + (one ? '-' + safeName(one.chapterOnly) : '');
  try {
    let payload;
    if (format === 'docx') payload = { format, defaultName, zipEntries: buildDocxEntries(data) };
    else if (format === 'epub') payload = { format, defaultName, zipEntries: await buildEpubEntries(data) };
    else if (format === 'txt') payload = { format, defaultName, content: buildTxt(data) };
    else if (format === 'md') payload = { format, defaultName, content: buildMd(data) };
    else {
      const d = data || bookExportData();
      payload = { format, defaultName, content: buildHtml(d, { cover: one ? null : await exportCover(d), fonts: await exportFontFaces(d) }) };
    }
    const saved = await window.neo.exportSave(payload);
    if (saved) toast(t('Exported: {file}', { file: saved.split('/').pop() }));
  } catch (err) {
    // An export that saves nothing must never be silent: name the failure,
    // and put the stack in the error log for whatever bug report follows.
    window.neo.logError('export ' + format + ': ' + (err && err.stack || err));
    toast(t('Couldn’t export: {error}', { error: plainError(err) }), 8000);
  }
}

function chooseEmailMethod() {
  // Apple Mail only exists on Macs; elsewhere Gmail
  if (!navigator.platform.toLowerCase().includes('mac')) return Promise.resolve('gmail');
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal" style="width:440px">
        <h2 style="font-size:16px">${t('How should NEO email your drafts?')}</h2>
        <div class="fr-choices" style="margin-top:14px">
          <button class="fr-choice" data-m="gmail">
            <strong>Gmail</strong>
            <span>${t('Opens a pre-filled compose window in your browser. NEO shows you the PDF to drag into it.')}</span>
          </button>
          <button class="fr-choice" data-m="mail">
            <strong>Apple Mail</strong>
            <span>${t('Fully automatic — the PDF is attached and addressed. Just hit send.')}</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(bd);
    bd.querySelectorAll('.fr-choice').forEach((b) => {
      b.onclick = () => { bd.remove(); resolve(b.dataset.m); };
    });
  });
}

async function emailSettings() {
  const addr = await askInput(t('Email drafts to'), t('you@example.com'), library.emailAddress || '');
  if (addr === null) return false;
  if (addr) library.emailAddress = addr;
  library.emailMethod = await chooseEmailMethod();
  await writeLibrary(library);
  toast(t('Email settings saved'));
  return true;
}

async function manuscriptHash() {
  // SHA-256 of the manuscript text: a fingerprint for your provenance trail
  const text = book.title + '\n' + book.chapterOrder.map((c) => chapterText(c)).join('\n');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function doEmailDraft() {
  if (!book) { toast(t('Open a book first')); return; }
  flushAllSaves();
  if (!library.emailAddress || !library.emailMethod) {
    const ok = await emailSettings();
    if (!ok) return;
  }
  const total = bookWordCount();
  const subject = t('NEO draft — {title} — {n} words — {date}', { title: book.title, n: total, date: fmtDate(new Date()) });
  const hash = await manuscriptHash();
  const body = t('Draft snapshot of “{title}” — {n} words.', { title: book.title, n: total }) + '\n'
    + t('Sent from NEO on {date}.', { date: new Date().toLocaleString(NeoI18n.getLocale()) }) + '\n\n'
    + t('SHA-256 fingerprint of the manuscript text:') + `\n${hash}\n\n`
    + (library.emailMethod === 'gmail'
      ? t('The PDF snapshot is in the Finder window NEO just opened — drag it into this email before sending.')
      : t('PDF snapshot attached.'));
  toast(t('Preparing your draft…'));
  const snapshot = bookExportData();
  const res = await window.neo.emailDraft({
    to: library.emailAddress,
    subject,
    body,
    html: buildHtml(snapshot, { stamp: true, fonts: await exportFontFaces(snapshot) }), // the email snapshot is a provenance record
    defaultName: safeName(book.title),
    method: library.emailMethod
  });
  if (res.method === 'gmail') toast(t('Gmail compose opened — drag in the PDF NEO revealed, then send'), 8000);
  else if (res.ok) toast(t('Draft handed to Mail — hit send for your timestamp'));
  else toast(t('Mail unavailable — snapshot saved to your Exports folder instead'));
}