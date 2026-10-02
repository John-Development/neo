/* ================================================================== */
/*  BOUND SHELVES — a shelf that is one book                           */
/*  Right-click a shelf's name → Bind into one book. Its titles stay   */
/*  ordinary books to write in. A cover and the pages a published book */
/*  carries (copyright, dedication, epigraph, parts, acknowledgments,  */
/*  about the author) join them as small books of their own: plain     */
/*  folders like every other, so backups, sync and Pocket carry them.  */
/*  Hovering a bound shelf shows each missing page, faint, in its      */
/*  place; a click adds it and opens it as the page it will print as.  */
/*  Unbinding tucks the pages away (shelf.binding.parked) until the    */
/*  next binding. Nothing is ever deleted by binding or unbinding.     */
/* ================================================================== */

const PAGE_FRONT = ['copyright', 'dedication', 'epigraph'];
const PAGE_BACK = ['acknowledgments', 'about'];
// A book's own prologue and epilogue, when it has them: story, written in
// the editor like any title, standing before the first part and after the
// last. (A single book's first or last chapter can take the role too.)
const PAGE_WRITTEN = ['prologue', 'epilogue'];
// the order each end of a bound shelf keeps
const PAGE_LEAD = ['cover', ...PAGE_FRONT, 'prologue'];
const PAGE_TAIL = ['epilogue', ...PAGE_BACK];
const PAGE_KINDS = [...PAGE_LEAD, 'part', ...PAGE_TAIL];
const isPageMeta = (m) => !!(m && PAGE_KINDS.includes(m.kind));
const isBound = (shelf) => !!(shelf && shelf.binding && shelf.binding.bound);
const shelfOf = (bookId) => library.shelves.find((s) => s.bookIds.includes(bookId));

function pageKindName(kind) {
  return {
    cover: t('Cover'),
    copyright: t('Copyright'),
    dedication: t('Dedication'),
    epigraph: t('Epigraph'),
    prologue: t('Prologue'),
    part: t('Part'),
    epilogue: t('Epilogue'),
    acknowledgments: t('Acknowledgments'),
    about: t('About the Author')
  }[kind] || kind;
}

// Part I, Part II …: roman numerals read the same in every language
function roman(n) {
  const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of r) while (n >= v) { out += s; n -= v; }
  return out;
}
const partLabel = (n) => t('Part {n}', { n: roman(n) });

// the name a bound book goes out under: the pen name that owns the shelf
function shelfAuthorName(shelf) {
  const all = library.authors || [];
  const a = all.find((x) => x.id === shelf.authorId) || all[0];
  return (a && a.name) || t('Anonymous');
}

// a new page starts with what every such page says, where that's knowable
const PAGE_STARTERS = {
  copyright: (shelf) =>
    `<p>${escHtml(t('Copyright © {year} {name}', { year: String(new Date().getFullYear()), name: shelfAuthorName(shelf) }))}</p>` +
    `<p>${escHtml(t('All rights reserved.'))}</p>`
};

async function createPageBook(shelf, kind) {
  const written = PAGE_WRITTEN.includes(kind);
  // a prologue opens in the editor as "Prologue", under the book's name
  const title = kind === 'cover' || written ? (written ? pageKindName(kind) : shelf.name) : pageKindName(kind) + ' — ' + shelf.name;
  const meta = await window.neo.createBook({ author: shelfAuthorName(shelf), title });
  meta.title = title;
  meta.kind = kind;
  meta.shelfId = shelf.id; // which bound book it belongs to, for anyone reading the folder
  if (written) {
    meta.subtitle = shelf.name;
    meta.tabNames = {
      notes: (library.tabDefaults && library.tabDefaults.notes) || 'Notes',
      outline: (library.tabDefaults && library.tabDefaults.outline) || 'Outline'
    };
  }
  if (kind === 'cover') {
    meta.coverSeed = 'bound:' + shelf.id;
    meta.chapterOrder = [];
  } else {
    const chId = 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    await window.neo.writeChapter(meta.id, chId, PAGE_STARTERS[kind] ? PAGE_STARTERS[kind](shelf) : '<p><br></p>');
    meta.chapterOrder = [chId];
  }
  await writeBookMeta(meta.id, meta);
  return meta;
}

// Where titles may sit on a bound shelf: after the cover and front pages,
// before the back pages (indexes into bookIds, without skipId)
async function bodyRange(shelf, skipId) {
  const ids = shelf.bookIds.filter((b) => b !== skipId);
  const kinds = [];
  for (const id of ids) {
    const m = await shelfMeta(id);
    kinds.push((m && m.kind) || '');
  }
  let start = 0;
  while (start < ids.length && PAGE_LEAD.includes(kinds[start])) start++;
  let end = ids.length;
  while (end > start && PAGE_TAIL.includes(kinds[end - 1])) end--;
  return { start, end };
}

// Put a title on a shelf: last in line (or first), which on a bound shelf
// means the end (or start) of its body, never after the back pages
async function placeTitle(shelf, bookId, atStart) {
  shelf.bookIds = shelf.bookIds.filter((b) => b !== bookId);
  if (!isBound(shelf)) {
    if (atStart) shelf.bookIds.unshift(bookId); else shelf.bookIds.push(bookId);
    return;
  }
  const { start, end } = await bodyRange(shelf);
  shelf.bookIds.splice(atStart ? start : end, 0, bookId);
}

// let justBoundId = null; // the shelf whose binding the next drawing shows
async function bindShelf(shelf) {
  shelf.binding = Object.assign({ numbering: 'through', parked: [] }, shelf.binding || {}, { bound: true });
  restoreParked(shelf);
  let cover = null;
  for (const id of shelf.bookIds) {
    const m = await shelfMeta(id);
    if (m && m.kind === 'cover') { cover = m; break; }
  }
  if (!cover) {
    cover = await createPageBook(shelf, 'cover');
    shelf.bookIds.unshift(cover.id);
  } else if (cover.title !== shelf.name) {
    cover.title = shelf.name;
    await writeBookMeta(cover.id, cover);
  }
  await writeLibrary(library);
  justBoundId = shelf.id;
  await renderShelves();
  toast(t('“{name}” is bound into one book', { name: shelf.name }));
}

// the pages come back where they were: the cover and front pages lead, a
// part page returns before the title it opened, the back pages close
function restoreParked(shelf) {
  const parked = (shelf.binding && shelf.binding.parked) || [];
  if (!parked.length) return;
  const front = parked.filter((p) => PAGE_LEAD.includes(p.kind))
    .sort((a, b) => PAGE_LEAD.indexOf(a.kind) - PAGE_LEAD.indexOf(b.kind));
  const back = parked.filter((p) => PAGE_TAIL.includes(p.kind))
    .sort((a, b) => PAGE_TAIL.indexOf(a.kind) - PAGE_TAIL.indexOf(b.kind));
  const body = shelf.bookIds.filter((id) => !parked.some((p) => p.id === id));
  for (const p of parked.filter((x) => x.kind === 'part')) {
    const at = p.before ? body.indexOf(p.before) : -1;
    if (at >= 0) body.splice(at, 0, p.id); else body.push(p.id);
  }
  shelf.bookIds = [...front.map((p) => p.id), ...body, ...back.map((p) => p.id)];
  shelf.binding.parked = [];
}

async function unbindShelf(shelf) {
  const ids = [...shelf.bookIds];
  const metas = [];
  for (const id of ids) metas.push(await shelfMeta(id));
  const parked = [];
  const titles = [];
  ids.forEach((id, i) => {
    const m = metas[i];
    if (!isPageMeta(m)) { titles.push(id); return; }
    // a part page remembers the title it opens
    let before = null;
    if (m.kind === 'part') {
      for (let j = i + 1; j < ids.length; j++) {
        if (metas[j] && !isPageMeta(metas[j])) { before = ids[j]; break; }
      }
    }
    parked.push({ id, kind: m.kind, before });
  });
  shelf.bookIds = titles;
  shelf.binding = Object.assign({}, shelf.binding, { bound: false, parked });
  await writeLibrary(library);
  await renderShelves();
  toast(t('Unbound. Its pages wait for the next binding.'));
}

// the shelf's name is the book's title, so a rename reaches the cover too
async function syncCoverTitle(shelf) {
  for (const id of shelf.bookIds) {
    const m = await shelfMeta(id);
    if (m && m.kind === 'cover') {
      if (m.title !== shelf.name) { m.title = shelf.name; await writeBookMeta(m.id, m); }
      return;
    }
  }
}

/* ---------- a bound shelf, drawn ---------- */

async function renderBoundRow(shelf, row, blank) {
  const items = [];
  for (const id of shelf.bookIds) {
    const m = await shelfMeta(id);
    if (m) items.push(m);
  }
  let f = 0;
  while (f < items.length && PAGE_LEAD.includes(items[f].kind)) f++;
  let b = items.length;
  while (b > f && PAGE_TAIL.includes(items[b - 1].kind)) b--;
  const front = items.slice(0, f);
  const body = items.slice(f, b);
  const back = items.slice(b);
  const cover = front.find((m) => m.kind === 'cover');
  if (cover) row.appendChild(boundCoverTile(shelf, cover));
  const offer = missingPages(body);
  appendPageZone(row, shelf, front.filter((m) => m.kind !== 'cover'), [...PAGE_FRONT, 'prologue'], offer);
  let parts = 0;
  body.forEach((m, i) => {
    if (m.kind === 'part') {
      parts += 1;
      row.appendChild(pageTile(shelf, m, partLabel(parts)));
      return;
    }
    if (isPageMeta(m)) { row.appendChild(pageTile(shelf, m, pageKindName(m.kind))); return; }
    const prev = body[i - 1];
    if (!NO_HOVER && !(prev && prev.kind === 'part')) row.appendChild(partSeam(shelf, m.id));
    row.appendChild(bookTile(m));
  });
  row.appendChild(blank);
  appendPageZone(row, shelf, back, PAGE_TAIL, offer);
}

// Which pages a bound book could still take. A book of one title whose
// first chapter is already its prologue isn't offered another (nor one
// whose last chapter is its epilogue).
function missingPages(body) {
  const titles = body.filter((m) => !isPageMeta(m));
  const lone = titles.length === 1 ? titles[0] : null;
  const own = (role) => !!lone && (lone.chapterOrder || []).some((c) => chapterRole(c, lone) === role);
  return (kind) => !(PAGE_WRITTEN.includes(kind) && own(kind));
}

// the pages of one end of the book, each in its place, with a faint
// stand-in (shown on hover) wherever one could be added
function appendPageZone(row, shelf, have, kinds, offer) {
  const left = [...have];
  for (const k of kinds) {
    const i = left.findIndex((m) => m.kind === k);
    if (i >= 0) row.appendChild(pageTile(shelf, left.splice(i, 1)[0], pageKindName(k)));
    else if (!NO_HOVER && offer(k)) row.appendChild(ghostPage(shelf, k));
  }
  for (const m of left) row.appendChild(pageTile(shelf, m, pageKindName(m.kind)));
}

function boundCoverTile(shelf, meta) {
  // the cover wears the shelf's name, whatever its folder was first called
  const shown = Object.assign({}, meta, { title: shelf.name, author: meta.author || shelfAuthorName(shelf) });
  const el = bookTile(shown, { cover: shelf });
  el.classList.add('bound-cover');
  el.draggable = false;
  return el;
}

// a page's name runs up its spine; a long one is set smaller to fit
const spineFit = (label) => (label.length > 17 ? ' longer' : label.length > 12 ? ' long' : '');

function pageTile(shelf, meta, label) {
  const el = document.createElement('div');
  el.className = 'book page-tile kind-' + meta.kind + spineFit(label);
  el.dataset.bookId = meta.id;
  el.draggable = false;
  const span = document.createElement('span');
  span.className = 'pt-label';
  span.textContent = label;
  el.appendChild(span);
  el.title = label;
  el.onclick = () => openPage(shelf, meta, label);
  pressable(el, label);
  el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const choice = await optionModal(escHtml(label), null, [
      { label: t('Open'), value: 'open' },
      {
        label: t('Remove page'),
        desc: window.Capacitor
          ? t('Removes the book folder. The Files app keeps it in Recently Deleted for 30 days.')
          : t('Sends the page to your system trash, where you can recover it.'),
        danger: true, value: 'remove'
      }
    ]);
    if (choice === 'open') openPage(shelf, meta, label);
    else if (choice === 'remove' && await window.neo.deleteBook(meta.id, label)) {
      shelf.bookIds = shelf.bookIds.filter((b) => b !== meta.id);
      await writeLibrary(library);
      renderShelves();
    }
  });
  return el;
}

function ghostPage(shelf, kind) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ghost-page' + spineFit(pageKindName(kind));
  el.innerHTML = '<span class="gp-plus" aria-hidden="true">+</span><span class="pt-label"></span>';
  el.querySelector('.pt-label').textContent = pageKindName(kind);
  el.title = pageKindName(kind);
  el.setAttribute('aria-label', pageKindName(kind));
  el.onclick = () => addPage(shelf, kind);
  return el;
}

function partSeam(shelf, beforeId) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'part-seam';
  el.title = t('Start a part here');
  el.setAttribute('aria-label', t('Start a part here'));
  el.innerHTML = '<span class="ps-line"></span><span class="ps-plus">+</span>';
  el.onclick = () => addPage(shelf, 'part', beforeId);
  return el;
}

// A new page goes where books put it: front pages after the cover in their
// usual order, back pages at the end in theirs, a part before its title
async function addPage(shelf, kind, beforeId) {
  const meta = await createPageBook(shelf, kind);
  const ids = shelf.bookIds;
  let at = ids.length;
  if (kind === 'part') {
    at = beforeId ? ids.indexOf(beforeId) : -1;
    if (at < 0) at = (await bodyRange(shelf)).end;
  } else if (PAGE_LEAD.includes(kind)) {
    at = 0;
    for (let i = 0; i < ids.length; i++) {
      const m = await shelfMeta(ids[i]);
      const k = m && m.kind;
      if (PAGE_LEAD.includes(k) && PAGE_LEAD.indexOf(k) < PAGE_LEAD.indexOf(kind)) at = i + 1;
      else break;
    }
  } else {
    for (let i = ids.length - 1; i >= 0; i--) {
      const m = await shelfMeta(ids[i]);
      const k = m && m.kind;
      if (PAGE_TAIL.includes(k) && PAGE_TAIL.indexOf(k) > PAGE_TAIL.indexOf(kind)) at = i;
      else break;
    }
  }
  ids.splice(at, 0, meta.id);
  await writeLibrary(library);
  await renderShelves();
  let label = pageKindName(kind);
  if (kind === 'part') {
    let n = 0;
    for (const id of shelf.bookIds) {
      const m = await shelfMeta(id);
      if (m && m.kind === 'part') n += 1;
      if (id === meta.id) break;
    }
    label = partLabel(n);
  }
  openPage(shelf, meta, label);
}

// A prologue or an epilogue is story: it opens in the editor, ready to
// write in. Every other page opens as the sheet it will print on.
async function openPage(shelf, meta, label) {
  if (!PAGE_WRITTEN.includes(meta.kind)) { openPageSheet(shelf, meta, label); return; }
  await openBook(meta.id);
  // a first visit starts at the top of the page, under its title
  if (book && book.id === meta.id && !book.lastPosition && book.chapterOrder[0]) focusChapterStart(book.chapterOrder[0]);
}

/* ---------- a page, open as it will print ---------- */

const PAGE_PLACEHOLDERS = {
  dedication: () => t('For…'),
  epigraph: () => '…',
  part: () => t('Title')
};

// Whatever the editing engine left, a page is stored as NEO's plain
// paragraphs: loose text and <div>s become <p>s, stray <br>s go
function normalizePageBody(body) {
  let cur = null;
  for (const node of [...body.childNodes]) {
    if (node.nodeType === 1 && /^(P|DIV|H[1-6]|BLOCKQUOTE|LI|UL|OL)$/.test(node.tagName)) {
      cur = null;
      if (node.tagName !== 'P') {
        const p = document.createElement('p');
        while (node.firstChild) p.appendChild(node.firstChild);
        node.replaceWith(p);
      }
      continue;
    }
    const blank = (node.nodeType === 3 && !node.textContent.trim()) || (node.nodeType === 1 && node.tagName === 'BR');
    if (!cur && blank) { node.remove(); continue; }
    if (!cur) {
      cur = document.createElement('p');
      body.insertBefore(cur, node);
    }
    cur.appendChild(node);
  }
  if (!body.querySelector('p')) body.innerHTML = '<p><br></p>';
}

function sheetBackdrop(kind, label, inner) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop page-sheet-backdrop';
  bd.innerHTML = `
    <div class="page-sheet" role="dialog" aria-modal="true">
      <div class="ps-bar"><span class="ps-name"></span><button class="m-ok ps-done">${t('Done')}</button></div>
      <div class="ps-paper kind-${kind}">${inner}</div>
    </div>`;
  bd.querySelector('.ps-name').textContent = label;
  bd.querySelector('.page-sheet').setAttribute('aria-label', label);
  return bd;
}

// the lines of a page that say who said the lines above them (a dash first)
const ATTRIBUTED_PAGES = ['dedication', 'epigraph', 'part'];

async function openPageSheet(shelf, meta, label) {
  const live = (await window.neo.readBookMeta(meta.id)) || meta;
  let chId = (live.chapterOrder || [])[0];
  if (!chId) {
    chId = 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    live.chapterOrder = [chId];
    await writeBookMeta(live.id, live);
  }
  const html = await window.neo.readChapter(live.id, chId);
  const bd = sheetBackdrop(live.kind, label, '<div class="ps-label" hidden></div><div class="ps-body" contenteditable="true" role="textbox" aria-multiline="true"></div>');
  const lab = bd.querySelector('.ps-label');
  if (live.kind === 'part') { lab.hidden = false; lab.textContent = label; }
  if (PAGE_BACK.includes(live.kind)) { lab.hidden = false; lab.textContent = pageKindName(live.kind); }
  const body = bd.querySelector('.ps-body');
  body.setAttribute('aria-label', label);
  body.innerHTML = html && html.trim() ? html : '<p><br></p>';
  if (PAGE_PLACEHOLDERS[live.kind]) body.dataset.ph = PAGE_PLACEHOLDERS[live.kind]();
  // the page shows what it will print: a line that opens with a dash is set
  // as the name of whoever said the lines above it
  const settle = () => {
    body.classList.toggle('empty', !body.textContent.trim());
    if (!ATTRIBUTED_PAGES.includes(live.kind)) return;
    for (const p of body.querySelectorAll('p')) p.toggleAttribute('data-attr', isAttribution({ text: p.textContent.trim() }));
  };
  settle();
  let timer = null;
  let saved = body.innerHTML;
  const save = async () => {
    clearTimeout(timer);
    timer = null;
    normalizePageBody(body);
    const out = body.cloneNode(true);
    out.querySelectorAll('[data-attr]').forEach((p) => p.removeAttribute('data-attr'));
    if (out.innerHTML === saved) return;
    saved = out.innerHTML;
    await window.neo.writeChapter(live.id, chId, saved);
  };
  body.addEventListener('input', () => {
    settle();
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  });
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (pasted) document.execCommand('insertHTML', false, cleanPasteHtml(pasted));
    else if (text) {
      text.replace(/\r/g, '').split(/\n+/).filter((p) => p.trim()).forEach((p, i) => {
        if (i > 0) document.execCommand('insertParagraph');
        document.execCommand('insertText', false, p.trim());
      });
    }
  });
  document.body.appendChild(bd);
  document.execCommand('defaultParagraphSeparator', false, 'p');
  const close = async () => {
    if (!bd.isConnected) return;
    await save();
    bd.remove();
  };
  bd.querySelector('.ps-done').onclick = close;
  bd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  // the caret waits at the end of whatever the page already says
  body.focus();
  caretToEnd(body.lastElementChild || body);
}

function caretToEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

// The cover opens to the title page: the book's title (the shelf's name),
// a subtitle, and the name it goes out under. One line each; Enter moves on.
async function openTitlePage(shelf, coverMeta) {
  const live = (await window.neo.readBookMeta(coverMeta.id)) || coverMeta;
  const bd = sheetBackdrop('title', t('Title Page'), `
    <div class="tp-field tp-t" contenteditable="true" role="textbox" spellcheck="false"></div>
    <div class="tp-field tp-s" contenteditable="true" role="textbox" spellcheck="false"></div>
    <div class="tp-field tp-a" contenteditable="true" role="textbox" spellcheck="false"></div>`);
  const fields = ['.tp-t', '.tp-s', '.tp-a'].map((s) => bd.querySelector(s));
  const [ti, su, au] = fields;
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  [[ti, shelf.name, t('Title')], [su, live.subtitle || '', t('Subtitle')], [au, live.author || shelfAuthorName(shelf), t('Author')]]
    .forEach(([el, value, name]) => {
      el.textContent = value;
      el.dataset.ph = name;
      el.setAttribute('aria-label', name);
    });
  const close = async () => {
    if (!bd.isConnected) return;
    bd.remove();
    const title = text(ti) || shelf.name;
    const subtitle = text(su);
    const author = text(au) || shelfAuthorName(shelf);
    if (title === shelf.name && subtitle === (live.subtitle || '') && author === (live.author || '')) return;
    shelf.name = title;
    live.title = title;
    live.subtitle = subtitle;
    live.author = author;
    await writeBookMeta(live.id, live);
    await writeLibrary(library);
    renderShelves();
  };
  for (const f of fields) {
    // an emptied line shows its name again
    f.addEventListener('input', () => { if (!f.textContent) f.innerHTML = ''; });
    f.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
    });
    f.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = fields[fields.indexOf(f) + 1];
      if (next) { next.focus(); caretToEnd(next); } else close();
    });
  }
  document.body.appendChild(bd);
  bd.querySelector('.ps-done').onclick = close;
  bd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  ti.focus();
  const r = document.createRange();
  r.selectNodeContents(ti);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

/* ---------- the bound shelf's own menu (right-click its name) ---------- */

async function boundShelfMenu(shelf) {
  const through = (shelf.binding.numbering || 'through') !== 'restart';
  const options = [
    { label: t('Export the book…'), desc: t('EPUB, Word or PDF, with its cover, its pages and one table of contents.'), value: 'export' },
    {
      label: (through ? '✓ ' : '') + t('Number chapters straight through'),
      desc: through ? t('Each title picks up where the one before it left off.') : t('Each title starts again at Chapter 1.'),
      value: 'numbering'
    },
    { label: t('Unbind'), desc: t('A shelf of separate titles again. Its pages wait for the next binding.'), value: 'unbind' }
  ];
  // a touch screen has no hover to show the pages it could still have
  const missing = [];
  if (NO_HOVER) {
    const have = new Set();
    const body = [];
    for (const id of shelf.bookIds) {
      const m = await shelfMeta(id);
      if (isPageMeta(m)) have.add(m.kind);
      else if (m) body.push(m);
    }
    const offer = missingPages(body);
    missing.push(...[...PAGE_FRONT, 'prologue', 'epilogue', ...PAGE_BACK].filter((k) => !have.has(k) && offer(k)));
    if (missing.length) options.splice(1, 0, { label: t('Add a page…'), value: 'page' });
  }
  const choice = await optionModal(escHtml(t('“{name}” · one book', { name: shelf.name })), null, options);
  if (choice === 'export') {
    await exportBoundBook(shelf);
  } else if (choice === 'page') {
    const kind = await optionModal(t('Add a page…'), null, missing.map((k) => ({ label: pageKindName(k), value: k })));
    if (kind) await addPage(shelf, kind);
  } else if (choice === 'numbering') {
    shelf.binding.numbering = through ? 'restart' : 'through';
    await writeLibrary(library);
    toast(through ? t('Each title starts again at Chapter 1') : t('Chapters are numbered straight through'));
  } else if (choice === 'unbind') {
    await unbindShelf(shelf);
  }
}

// single shared drop-position indicator for shelf drags
// let _dropInd = null;
function dropIndicator() {
  if (!_dropInd) {
    _dropInd = document.createElement('div');
    _dropInd.className = 'drop-indicator';
  }
  return _dropInd;
}

// Covers are two layers the shelf composites live: art (a seeded abstract,
// an image the writer chose, or one NEO painted from the text) and type.
// See covers.js. Painted art is read once and downsampled to tile size so
// forty books on a shelf cost about as much as forty small PNGs.
const artCache = new Map(); // bookId/file -> { url, canvas }

async function paintedArt(meta) {
  const art = meta.coverArt;
  if (!art || art.status !== 'done' || !art.file) return null;
  const key = meta.id + '/' + art.file;
  if (artCache.has(key)) return artCache.get(key);
  try {
    const data = await window.neo.readCover(meta.id, art.file);
    if (!data) { window.neo.logError('painted cover missing on disk: ' + key); return null; }
    const entry = await NeoCovers.fitImage(key, `data:${data.mime};base64,${data.base64}`);
    if (!entry) { window.neo.logError('painted cover would not decode: ' + key); return null; }
    artCache.set(key, entry);
    return entry;
  } catch (err) {
    window.neo.logError('painted cover: ' + (err && err.stack || err));
    return null;
  }
}

// Which layers a book has to show, and which one is showing. Nothing is
// ever thrown away by switching: the writer's image, NEO's painting, and the
// abstract all stay available, and coverMode just picks one.
const hasPainting = (meta) => !!(meta.coverArt && meta.coverArt.status === 'done' && meta.coverArt.file);
function coverMode(meta) {
  const m = meta.coverMode;
  if (m === 'image' && meta.coverImage) return 'image';
  if (m === 'painted' && hasPainting(meta)) return 'painted';
  if (m === 'abstract') return 'abstract';
  return meta.coverImage ? 'image' : hasPainting(meta) ? 'painted' : 'abstract';
}

function dressTile(el, meta) {
  el.classList.remove('has-cover');
  const mode = coverMode(meta);
  if (mode === 'image') {
    el.classList.add('has-cover');
    el.style.background = `#1d1d1d url("${coverUrl(meta)}") center / cover no-repeat`;
    return;
  }
  el.classList.toggle('cv-painting', !!(meta.coverArt && meta.coverArt.status === 'pending'));
  const token = (el._dressToken = (el._dressToken || 0) + 1);
  // a painting already decoded is drawn straight away; otherwise the
  // abstract shows instantly and the painting replaces it once read.
  // The tile may not be on the page yet when the art arrives, so the only
  // staleness check is whether this tile has been dressed again since.
  const cached = mode === 'painted' && artCache.get(meta.id + '/' + meta.coverArt.file);
  NeoCovers.dress(el, NeoCovers.plan(meta, cached || undefined));
  if (mode !== 'painted' || cached) return;
  paintedArt(meta).then((art) => {
    if (art && el._dressToken === token) NeoCovers.dress(el, NeoCovers.plan(meta, art));
  });
}

function bookTile(meta, opts = {}) {
  const el = document.createElement('div');
  el.className = 'book';
  el.dataset.bookId = meta.id;
  el.draggable = true;
  el.innerHTML = `
    <div class="b-text"><div class="b-title"></div><div class="b-author"></div></div>
    <span class="b-refresh" title="${t('New cover')}">&#8635;</span>
    <div class="b-painting" hidden></div>
    <div class="b-progress" hidden><div></div></div>`;
  el.querySelector('.b-author').textContent = meta.author || '';
  dressTile(el, meta);
  el.querySelector('.b-painting').hidden = !(meta.coverArt && meta.coverArt.status === 'pending');
  el.querySelector('.b-refresh').onclick = async (e) => {
    e.stopPropagation();
    await refreshCover(meta, el);
  };
  if (meta.wordGoal > 0) {
    const bar = el.querySelector('.b-progress');
    bar.hidden = false;
    const pct = Math.min(100, Math.round(((meta.wordCount || 0) / meta.wordGoal) * 100));
    bar.firstElementChild.style.width = pct + '%';
  }
  el.title = meta.wordGoal
    ? t('{title} — {count} / {goal} words', { title: meta.title, count: meta.wordCount || 0, goal: meta.wordGoal })
    : meta.title;
  el.onclick = () => (opts.cover ? openTitlePage(opts.cover, meta) : openBook(meta.id));
  pressable(el, [el.title, meta.author ? t('by {author}', { author: meta.author }) : ''].filter(Boolean).join(', '));
  el.querySelector('.b-refresh').setAttribute('aria-hidden', 'true'); // the book's right-click menu offers the same
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-neo-book', meta.id);
    // the ghost that rides under the cursor is a faded, smaller cover, held
    // by its top-left corner so it never sits on top of a drop target's label
    el.style.opacity = '0.45';
    el.style.transform = 'scale(0.7)';
    e.dataTransfer.setDragImage(el, 12, 12);
    setTimeout(() => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('dragging'); }, 0);
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  // images dragged from Finder onto a book become its cover;
  // manuscripts dropped here import onto this book's shelf
  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  el.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    let p = null;
    try { p = window.neo.pathForFile(e.dataTransfer.files[0]); } catch { /* no path */ }
    if (!p) return;
    if (/\.(png|jpe?g|webp)$/i.test(p)) {
      const fname = await window.neo.setCover(meta.id, p);
      if (fname) {
        meta.coverImage = fname;
        meta.coverMode = 'image';
        await writeBookMeta(meta.id, meta);
        renderShelves();
      }
    } else if (/\.(docx|txt|md)$/i.test(p)) {
      const homeShelf = library.shelves.find((s) => s.bookIds.includes(meta.id)) || library.shelves[0];
      const results = await window.neo.importFiles([p]);
      if (results.length) await addImportedBooks(results, homeShelf);
    }
  });

  el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (opts.cover) { await boundCoverMenu(opts.cover, meta, el); return; }
    const options = [];
    // on a bound shelf, a title can open a new part of the book
    const home = shelfOf(meta.id);
    if (isBound(home)) {
      const at = home.bookIds.indexOf(meta.id);
      const prev = at > 0 ? bookMetaCache.get(home.bookIds[at - 1]) : null;
      if (!(prev && prev.kind === 'part')) {
        options.push({ label: t('Start a part here'), desc: t('A part page goes in before “{title}”.', { title: escHtml(meta.title) }), value: 'part' });
      }
    }
    // no hover on a touch screen, so the ↻ that lives under the pointer
    // moves into the menu; picking an image file is a desktop affair
    if (NO_HOVER) options.push({ label: t('New cover'), desc: t('Another abstract cover for this book.'), value: 'refresh' });
    else options.push({ label: meta.coverImage ? t('Replace cover art…') : t('Set cover art…'), desc: t('Pick an image (2:3 works best). Or just drag one from Finder onto the book.'), value: 'cover' });
    if (meta.coverImage) {
      options.push({ label: t('Remove cover art'), desc: t('Deletes the image from the book folder. (To just hide it, use the ↻ on the book.)'), danger: true, value: 'uncover' });
    }
    if (!window.Capacitor) options.push({ label: t('Save cover as image…'), desc: t('Full size, with your title and author.'), value: 'saveCover' });
    // Pocket has no File menu: export lives here and in the ⋯ sheet
    if (window.Capacitor) options.push({ label: t('Export…'), desc: t('Text, Markdown, HTML, Word or EPUB, through the share sheet.'), value: 'export' });
    options.push(
      // the ↻ on the cover, for the keyboard and screen readers
      { label: t('New cover'), value: 'refresh' },
      { label: t('Set word goal…'), desc: t('Adds the subtle progress bar to the cover.'), value: 'goal' },
      { label: t('Remove from bookshelf'), desc: t('Takes it off your shelves. The files stay safe in your NEO Library folder on disk.'), value: 'remove' },
      window.Capacitor
        ? { label: t('Delete book'), desc: t('Removes the book folder. The Files app keeps it in Recently Deleted for 30 days.'), danger: true, value: 'trash' }
        : {
          label: navigator.platform.toLowerCase().includes('win') ? t('Move to Recycle Bin') : t('Move to Trash'),
          desc: t('Sends the book folder to your system trash, where you can recover it.'),
          danger: true, value: 'trash'
        }
    );
    const choice = await optionModal(`“${escHtml(meta.title)}”`, null, options);
    if (choice === 'part') {
      await addPage(home, 'part', meta.id);
    } else if (choice === 'refresh') {
      await refreshCover(meta, el);
    } else if (choice === 'export') {
      const fmt = await optionModal(t('Export “{title}”', { title: meta.title }), null, [
        { label: t('Text (.txt)'), value: 'txt' }, { label: t('Markdown (.md)'), value: 'md' }, { label: t('HTML (.html)'), value: 'html' },
        { label: t('Word (.docx)'), value: 'docx' }, { label: t('EPUB (.epub)'), value: 'epub' }
      ]);
      if (!fmt) return;
      await openBook(meta.id);
      await doExport(fmt);
    } else if (choice === 'cover') {
      const src = await window.neo.pickCover();
      if (!src) return;
      const fname = await window.neo.setCover(meta.id, src);
      if (fname) {
        meta.coverImage = fname;
        meta.coverMode = 'image';
        await writeBookMeta(meta.id, meta);
        renderShelves();
      }
    } else if (choice === 'refresh') {
      await refreshCover(meta, el);
    } else if (choice === 'saveCover') {
      await saveCoverImage(meta);
    } else if (choice === 'uncover') {
      await window.neo.removeCover(meta.id);
      meta.coverImage = null;
      await writeBookMeta(meta.id, meta);
      renderShelves();
    } else if (choice === 'goal') {
      const goal = await askInput(t('Word count goal for “{title}”', { title: meta.title }), t('e.g. 80000 — blank removes the goal'),
        meta.wordGoal ? String(meta.wordGoal) : '');
      if (goal === null) return;
      meta.wordGoal = parseInt(goal, 10) || 0;
      await writeBookMeta(meta.id, meta);
      renderShelves();
    } else if (choice === 'remove') {
      for (const s of library.shelves) s.bookIds = s.bookIds.filter((b) => b !== meta.id);
      await writeLibrary(library);
      renderShelves();
      toast(t('“{title}” removed from the shelves — its files are still in your NEO Library', { title: meta.title }));
    } else if (choice === 'trash') {
      const ok = await window.neo.deleteBook(meta.id, meta.title);
      if (ok) {
        for (const s of library.shelves) s.bookIds = s.bookIds.filter((b) => b !== meta.id);
        await writeLibrary(library);
        renderShelves();
      }
    }
  });
  return el;
}

// The cover as a picture file: the writer's own image just as they gave it;
// otherwise the abstract at full size (1600×2560, KDP's ratio) with the
// title and author set on it. A painted cover never leaves NEO, here as in
// the exports, so a book showing one saves its abstract.
async function saveCoverImage(meta) {
  const defaultName = safeName(meta.title) + '-cover';
  let payload = null;
  if (coverMode(meta) === 'image') {
    const c = await window.neo.readCover(meta.id, meta.coverImage);
    if (c) payload = { format: c.ext, defaultName, content: c.base64, base64: true };
  }
  if (!payload) {
    await NeoCovers.ready;
    // JPEG: what KDP asks for, and a tenth the size of a PNG of all that grain
    const url = NeoCovers.renderFull(meta, {}).toDataURL('image/jpeg', 0.92);
    payload = { format: 'jpg', defaultName, content: url.split(',')[1], base64: true };
  }
  const saved = await window.neo.exportSave(payload);
  if (saved) toast(t('Saved: {file}', { file: saved.split(/[\\/]/).pop() }));
}

/* ---- painted covers ----
   At a thousand words a story has a shape, so NEO reads it and paints an
   abstract cover to sit under the type. The writer's own cover (coverImage)
   always wins; the abstract is the fallback; painting never blocks typing. */

const PAINT_AT = 1000;
const STALE_PAINT_MS = 10 * 60 * 1000; // a job that never came back

function paintable(meta) {
  if (!meta || meta.coverImage) return false; // the writer's own art is never painted over
  if (meta.kind) return false; // a bound book's pages show no cover of their own
  if ((meta.wordCount || 0) < PAINT_AT) return false;
  const art = meta.coverArt;
  if (!art) return true;
  if (art.status === 'pending') return Date.now() - Date.parse(art.at || 0) > STALE_PAINT_MS;
  return false; // done, shelved, or failed: the ↻ on the tile is the way back in
}

function bookPlainText() {
  return book.chapterOrder.map((id) => chapterText(id)).join('\n\n');
}

// Paint the open book, or a book on the shelf (text is read from disk then).
async function requestPaint(meta, text) {
  const provider = coverProvider();
  if (!(await window.neo.hasSecret(provider))) {
    if (!library.coverArtNudged) {
      library.coverArtNudged = true;
      await writeLibrary(library);
      toast(t('This story just passed {n} words — add an API key under File → Cover Art… and NEO will paint it a cover.', { n: PAINT_AT }), 8000);
    }
    return;
  }
  meta.coverArt = { status: 'pending', at: new Date().toISOString(), words: meta.wordCount || 0 };
  if (book && book.id === meta.id) scheduleMetaSave();
  else await writeBookMeta(meta.id, meta);
  markPainting(meta.id, true);
  if (text == null) {
    const m = await window.neo.readBookMeta(meta.id);
    const parts = [];
    for (const chId of (m && m.chapterOrder) || []) {
      const holder = document.createElement('div');
      holder.innerHTML = await window.neo.readChapter(meta.id, chId);
      holder.querySelectorAll('.darling-anchor, .ph-mark, .ghost').forEach((n) => n.remove());
      parts.push(holder.innerText);
    }
    text = parts.join('\n\n');
  }
  const cs = coverSettings();
  const mine = (cs.models && cs.models[provider]) || {};
  let res = null;
  try {
    res = await window.neo.paintCover(meta.id, text, { provider, textModel: mine.text, imageModel: mine.image, quality: cs.quality });
  } catch (err) {
    window.neo.logError('paint request: ' + (err && err.stack || err));
    res = { error: String((err && err.message) || err) };
  }
  // the writer may have moved on — write to whichever copy of the meta is live
  const live = (book && book.id === meta.id) ? book : (await window.neo.readBookMeta(meta.id)) || meta;
  if (res && res.file) {
    live.coverArt = { status: 'done', file: res.file, brief: res.brief, words: meta.wordCount || 0, at: new Date().toISOString() };
    if (!live.coverImage) live.coverMode = 'painted';
    artCache.delete(meta.id + '/' + res.file);
  } else {
    live.coverArt = { status: 'failed', error: (res && res.error) || 'unknown', at: new Date().toISOString() };
    toast(t('NEO couldn’t paint that cover: {error}', { error: live.coverArt.error }), 7000);
  }
  if (live === book) scheduleMetaSave();
  else await writeBookMeta(meta.id, live);
  markPainting(meta.id, false);
  if (!$('#bookshelf-view').hidden) renderShelves();
}

// shimmer on the tile while its painting is in flight
function markPainting(bookId, on) {
  for (const el of $$('.book')) {
    if (el.dataset.bookId !== bookId) continue;
    el.classList.toggle('cv-painting', on);
    const sh = el.querySelector('.b-painting');
    if (sh) sh.hidden = !on;
  }
}

// the ↻ on a tile: switch between the covers a book has, re-roll the
// abstract, or paint a fresh one from the text
async function refreshCover(meta, el) {
  const mode = coverMode(meta);
  const enough = (meta.wordCount || 0) >= PAINT_AT;
  // a bound book's cover has no text of its own to paint from
  const hasKey = meta.kind !== 'cover' && await window.neo.hasSecret(coverProvider());
  const options = [];
  if (meta.coverImage && mode !== 'image') options.push({ label: t('Show your cover art'), desc: t('The image you gave this book.'), value: 'image' });
  if (hasPainting(meta) && mode !== 'painted') options.push({ label: t('Show NEO’s painting'), desc: t('The cover painted from the text.'), value: 'painted' });
  if (mode !== 'abstract') options.push({ label: t('Show the abstract'), desc: t('The seeded cover every book starts with.'), value: 'abstract' });
  options.push({ label: t('New type & colours'), desc: mode === 'abstract' ? t('A fresh abstract and a different title style.') : t('Re-sets the title in a different style over the same art.'), value: 'reroll' });
  if (hasKey) {
    options.push(enough
      ? { label: hasPainting(meta) ? t('Paint it again') : t('Paint a cover from the text'), desc: t('NEO reads the manuscript and paints a new cover. About a minute; a few cents.'), value: 'paint' }
      : { label: t('Paint a cover from the text'), desc: t('Once the story passes {n} words.', { n: PAINT_AT }), value: 'nope' });
  }
  // a plain abstract with nothing else to offer just re-rolls
  const choice = options.length === 1 ? 'reroll' : await optionModal(t('Cover for “{title}”', { title: escHtml(meta.title) }), null, options);
  if (!choice || choice === 'nope') return;
  const live = (book && book.id === meta.id) ? book : meta;
  if (choice === 'paint') {
    if (meta.coverArt && meta.coverArt.status === 'pending' && !paintable(meta)) { toast(t('Still painting…')); return; }
    live.coverMode = 'painted';
    requestPaint(live, book && book.id === meta.id ? bookPlainText() : null);
    return;
  }
  if (choice === 'reroll') {
    live.coverSeed = meta.id + ':' + (meta.wordCount || 0) + ':' + Date.now().toString(36);
    if (mode === 'image') live.coverMode = 'abstract';
  } else {
    live.coverMode = choice;
  }
  if (live === book) scheduleMetaSave(); else await writeBookMeta(meta.id, live);
  dressTile(el, live);
}

async function createBookOnShelf(shelf) {
  const meta = await window.neo.createBook({ author: displayAuthor() });
  meta.tabNames = {
    notes: (library.tabDefaults && library.tabDefaults.notes) || 'Notes',
    outline: (library.tabDefaults && library.tabDefaults.outline) || 'Outline'
  };
  await writeBookMeta(meta.id, meta);
  await placeTitle(shelf, meta.id);
  await writeLibrary(library);
  openBook(meta.id);
}

// While dragging a book or shelf, nearing the window's top or bottom edge
// scrolls the bookshelf — faster the deeper into the edge zone you push.
// let shelfScrollDir = 0;
// let shelfScrollRAF = null;
function shelfAutoScrollStep() {
  if (!shelfScrollDir) { shelfScrollRAF = null; return; }
  $('#bookshelf-view').scrollTop += shelfScrollDir;
  shelfScrollRAF = requestAnimationFrame(shelfAutoScrollStep);
}
{
  const view = $('#bookshelf-view');
  const EDGE = 90;
  view.addEventListener('dragover', (e) => {
    const h = window.innerHeight;
    if (e.clientY < EDGE) shelfScrollDir = -Math.ceil((EDGE - e.clientY) / 5);
    else if (e.clientY > h - EDGE) shelfScrollDir = Math.ceil((e.clientY - (h - EDGE)) / 5);
    else shelfScrollDir = 0;
    if (shelfScrollDir && !shelfScrollRAF) shelfScrollRAF = requestAnimationFrame(shelfAutoScrollStep);
  });
  view.addEventListener('drop', () => { shelfScrollDir = 0; });
  view.addEventListener('dragend', () => { shelfScrollDir = 0; });
  view.addEventListener('dragleave', (e) => { if (!e.relatedTarget) shelfScrollDir = 0; });
}

async function onNewShelf () {
  library.shelves.push({
    id: 'shelf-' + Date.now().toString(36),
    name: t('New Shelf'),
    bookIds: [],
    authorId: currentAuthor().id
  });
  await writeLibrary(library);
  await renderShelves();
  // the new shelf may be below the fold: bring it up, name ready to type over
  const shelves = $$('#shelves .shelf');
  const last = shelves[shelves.length - 1];
  if (last) {
    last.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    const label = last.querySelector('.shelf-label');
    if (label) setTimeout(() => {
      if (NO_HOVER) { label.click(); return; }
      label.focus();
      const r = document.createRange();
      r.selectNodeContents(label); // selected: typing replaces "New Shelf"
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }, 350);
  }
}

// Drag a book up to your name: if you write under other names too, a little
// rack of shelves unfolds beneath it, one per pen name, and the book can be
// dropped onto one. It lands on that name's top shelf and takes the name.
// With a single author there is nothing to unfold, so nothing happens.
function dragBookToAuthorName () {
  const chip = $('#author-chip');
  let rack = null;
  let hideTimer = null;
  const otherAuthors = () => (library.authors || []).filter((a) => a.id !== currentAuthor().id);
  const isBookDrag = (e) => e.dataTransfer && e.dataTransfer.types.includes('application/x-neo-book');

  function showRack() {
    if (rack) return;
    const others = otherAuthors();
    if (!others.length) return;
    rack = document.createElement('div');
    rack.id = 'pen-rack';
    for (const a of others) {
      const slot = document.createElement('div');
      slot.className = 'pen-slot';
      slot.textContent = a.name;
      slot.dataset.authorId = a.id;
      slot.addEventListener('dragover', (e) => {
        if (!isBookDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('over');
        clearTimeout(hideTimer);
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('over'));
      slot.addEventListener('drop', async (e) => {
        if (!isBookDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const bookId = e.dataTransfer.getData('application/x-neo-book');
        hideRack();
        await moveBookToAuthor(bookId, a.id);
      });
      rack.appendChild(slot);
    }
    const r = chip.getBoundingClientRect();
    rack.style.top = (r.bottom + 8) + 'px';
    // the rack hangs from the name and reaches leftward, so the names on its
    // planks sit well clear of the cover riding under the cursor
    rack.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    document.body.appendChild(rack);
    requestAnimationFrame(() => rack.classList.add('open'));
  }
  function hideRack() {
    clearTimeout(hideTimer);
    if (rack) { rack.remove(); rack = null; }
  }
  const armHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hideRack, 400); };

  chip.addEventListener('dragenter', (e) => { if (isBookDrag(e)) { e.preventDefault(); showRack(); } });
  chip.addEventListener('dragover', (e) => { if (isBookDrag(e)) { e.preventDefault(); clearTimeout(hideTimer); } });
  chip.addEventListener('dragleave', armHide);
  document.addEventListener('dragover', (e) => {
    // leaving both the chip and the rack lets the rack fold away
    if (rack && !rack.contains(e.target) && e.target !== chip) armHide();
  });
  document.addEventListener('dragend', hideRack);
  document.addEventListener('drop', hideRack);
}

// Esc mid-drag cancels the drag itself (the browser does that). Esc or ⌘Z
// in the seconds after a drop puts the book back where it came from.
// let lastShelfMove = null;
async function moveBookToAuthor(bookId, authorId) {
  const target = (library.authors || []).find((a) => a.id === authorId);
  const shelf = target && shelvesFor(target.id)[0];
  if (!shelf) return;
  const meta = await window.neo.readBookMeta(bookId);
  if (!meta) return;
  const from = library.shelves.find((s) => s.bookIds.includes(bookId));
  lastShelfMove = {
    bookId, title: meta.title, author: meta.author,
    shelfId: from ? from.id : null, index: from ? from.bookIds.indexOf(bookId) : 0,
    authorId: currentAuthor().id, at: Date.now()
  };
  for (const s of library.shelves) s.bookIds = s.bookIds.filter((b) => b !== bookId);
  await placeTitle(shelf, bookId, true); // the top shelf, first in line
  meta.author = target.name;
  await writeBookMeta(bookId, meta);
  await writeLibrary(library);
  renderShelves();
  toast(t('“{title}” now sits on {name}’s top shelf — Esc puts it back', { title: meta.title, name: target.name }), 6000);
}
async function undoShelfMove() {
  const m = lastShelfMove;
  if (!m || Date.now() - m.at > 15000) return false;
  lastShelfMove = null;
  const home = library.shelves.find((s) => s.id === m.shelfId) || shelvesFor(m.authorId)[0] || library.shelves[0];
  for (const s of library.shelves) s.bookIds = s.bookIds.filter((b) => b !== m.bookId);
  home.bookIds.splice(Math.min(m.index, home.bookIds.length), 0, m.bookId);
  const meta = await window.neo.readBookMeta(m.bookId);
  if (meta) { meta.author = m.author; await writeBookMeta(m.bookId, meta); }
  await writeLibrary(library);
  renderShelves();
  toast(t('“{title}” is back where it was', { title: m.title }));
  return true;
}

// File → Reshelve a Book…: a book taken off the shelves is still on disk;
// this puts it back, on the current name's first shelf
async function reshelveBook() {
  const all = await window.neo.listBooks();
  const shelved = new Set(library.shelves.flatMap((s) => [...s.bookIds, ...((s.binding && s.binding.parked) || []).map((p) => p.id)]));
  // a bound book's pages aren't books to write in
  const loose = all.filter((b) => !shelved.has(b.id) && !b.kind).sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
  if (!loose.length) { toast(t('Every book in your library is already on a shelf')); return; }
  const pick = await optionModal(t('Books in your library that aren’t on a shelf'), null,
    loose.map((b) => ({ label: b.title, desc: b.author ? t('by {author}', { author: b.author }) : '', value: b.id })));
  if (!pick) return;
  const shelf = shelvesFor(currentAuthor().id)[0] || library.shelves[0];
  await placeTitle(shelf, pick);
  await writeLibrary(library);
  renderShelves();
  toast(t('“{title}” is back on the shelf', { title: loose.find((b) => b.id === pick).title }));
}

async function onAuthorClick () {
  const cur = currentAuthor();
  const opts = [];
  for (const a of library.authors) {
    if (a.id !== cur.id) {
      opts.push({ label: t('Write as {name}', { name: a.name }), desc: t('Switch to this name’s shelves'), value: 'sw:' + a.id });
    }
  }
  opts.push({ label: t('Rename {name}', { name: cur.name }), value: 'rename' });
  opts.push({ label: t('Add a pen name…'), desc: t('A separate set of shelves under another name'), value: 'add' });
  if (library.authors.length > 1) {
    opts.push({
      label: t('Remove {name}', { name: cur.name }),
      desc: t('These shelves and books move to your other name. Nothing is deleted from disk.'),
      danger: true, value: 'del'
    });
  }
  const pick = await optionModal(t('Writing as {name}', { name: cur.name }), null, opts);
  if (!pick) return;
  if (pick.startsWith('sw:')) {
    library.currentAuthorId = pick.slice(3);
  } else if (pick === 'rename') {
    const name = await askInput(t('Author name'), t('Shown on your title pages'), cur.name);
    if (name === null) return;
    cur.name = name || cur.name;
    library.authorName = library.authors[0].name; // legacy field follows the first name
  } else if (pick === 'add') {
    const name = await askInput(t('New pen name'), t('Shown on that name’s title pages'), '');
    if (!name) return;
    const a = { id: 'a-' + Date.now().toString(36), name };
    library.authors.push(a);
    library.currentAuthorId = a.id;
    library.shelves.push({
      id: 'shelf-' + Date.now().toString(36),
      name: t('Works in Progress'), bookIds: [], authorId: a.id
    });
  } else if (pick === 'del') {
    const homeId = library.authors[0].id;
    const rest = library.authors.filter((a) => a.id !== cur.id);
    const target = rest[0];
    for (const s of library.shelves) {
      if ((s.authorId || homeId) === cur.id) s.authorId = target.id;
    }
    library.authors = rest;
    library.currentAuthorId = target.id;
    library.authorName = library.authors[0].name;
  }
  await writeLibrary(library);
  renderShelves();
};
