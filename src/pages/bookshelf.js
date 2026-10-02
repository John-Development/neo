/* ================================================================== */
/*  BOOKSHELF                                                          */
/* ================================================================== */

function coverUrl(meta) {
  // Pocket serves the library through a URL; desktop hands a plain path
  if (/^[a-z]+:\/\//.test(libraryDirPath)) {
    return libraryDirPath + '/' + encodeURIComponent(meta.id) + '/' + encodeURIComponent(meta.coverImage);
  }
  const p = (libraryDirPath + '/' + meta.id + '/' + meta.coverImage).replace(/\\/g, '/');
  return encodeURI('file://' + (p.startsWith('/') ? '' : '/') + p);
}

async function loadLibrary() {
  libraryDirPath = await window.neo.libraryPath();
  library = await window.neo.readLibrary();
  if (window.neo.writingStyleState) window.neo.writingStyleState(library.writingStyle);
  if (!library.firstRunDone) {
    showFirstRun();
  }
  renderShelves();
}

function showFirstRun() {
  const fr = $('#firstrun');
  fr.hidden = false;
  let picked = { body: Object.keys(BODY_FONTS)[0] || 'Georgia', dropcap: 'literary' };

  // Step 1: who are you, and how do you write?
  $$('.fr-choice').forEach((btn) => {
    btn.onclick = () => {
      library.authorName = $('#fr-name').value.trim();
      const pen = $('#fr-pen').value.trim();
      library.penNames = pen ? [pen] : [];
      library.writingStyle = btn.dataset.style;
      if (window.neo.writingStyleState) window.neo.writingStyleState(library.writingStyle);
      $('#fr-step1').hidden = true;
      $('#fr-step2').hidden = false;
      buildFontStep();
    };
  });

  // Step 2: fonts, with a WYSIWYG sample
  function preview() {
    document.documentElement.style.setProperty('--body-font', BODY_FONTS[picked.body]);
    document.documentElement.style.setProperty('--dropcap-font', DROPCAP_FONTS[picked.dropcap]);
  }
  function buildFontStep() {
    const bodyRow = $('#fr-bodyfonts');
    bodyRow.innerHTML = '';
    for (const name of BODY_FONT_CHOICES) {
      const b = document.createElement('button');
      b.className = 'fr-font' + (picked.body === name ? ' sel' : '');
      b.textContent = name;
      b.style.fontFamily = BODY_FONTS[name];
      b.onmouseenter = () => { document.documentElement.style.setProperty('--body-font', BODY_FONTS[name]); };
      b.onmouseleave = preview;
      b.onclick = () => {
        picked.body = name;
        buildFontStep();
        preview();
      };
      bodyRow.appendChild(b);
    }
    const capRow = $('#fr-dropcaps');
    capRow.innerHTML = '';
    const caps = { literary: t('Literary'), fantasy: t('Fantasy'), scifi: t('Sci-Fi') };
    // an A of the alphabet the sample is written in, so each button shows
    // the drop cap the writer will get (Cyrillic letters come from other faces)
    const capA = /\p{Script=Cyrillic}/u.test($('#fr-sample-text').textContent) ? 'А' : 'A';
    for (const key of Object.keys(caps)) {
      const b = document.createElement('button');
      b.className = 'fr-font' + (picked.dropcap === key ? ' sel' : '');
      b.innerHTML = `<span class="fr-cap" style="font-family:${DROPCAP_FONTS[key].replace(/"/g, '&quot;')}">${capA}</span>${caps[key]}`;
      b.onmouseenter = () => { document.documentElement.style.setProperty('--dropcap-font', DROPCAP_FONTS[key]); };
      b.onmouseleave = preview;
      b.onclick = () => {
        picked.dropcap = key;
        buildFontStep();
        preview();
      };
      capRow.appendChild(b);
    }
    preview();
  }

  $('#fr-done').onclick = async () => {
    library.fonts = { body: picked.body, dropcap: picked.dropcap };
    library.firstRunDone = true;
    // the shelf was drawn (and the author record seeded as Anonymous) before
    // the name was typed — carry the name across
    currentAuthor().name = library.authorName || (library.penNames || [])[0] || t('Anonymous');
    await writeLibrary(library);
    applyFonts();
    fr.hidden = true;
    renderShelves();
  };
}

// Pen names: each author owns a set of shelves. Books all live in the one
// NEO Library folder on disk regardless of name — switching or deleting a
// pen name never touches files.
function currentAuthor() {
  if (!library.authors || !library.authors.length) {
    library.authors = [{
      id: 'a1',
      name: library.authorName || (library.penNames && library.penNames[0]) || t('Anonymous')
    }];
  }
  return library.authors.find((a) => a.id === library.currentAuthorId) || library.authors[0];
}

function shelvesFor(authorId) {
  const homeId = library.authors[0].id;
  return library.shelves.filter((s) => (s.authorId || homeId) === authorId);
}

function displayAuthor() {
  return currentAuthor().name || t('Anonymous');
}

// Redrawing the shelves used to read every book.json again — eighty files
// through the bridge on Pocket, for a shelf rename. The shelves now keep
// what they last read; any write to a book, and every look at the disk
// (refreshFromDisk), forgets it.
const bookMetaCache = new Map();
async function shelfMeta(bookId) {
  if (bookMetaCache.has(bookId)) return bookMetaCache.get(bookId);
  const meta = await window.neo.readBookMeta(bookId);
  if (meta) bookMetaCache.set(bookId, meta);
  return meta;
}
// Saves a book's meta and drops the cached copy. This used to be done by
// replacing window.neo.writeBookMeta, but on desktop that object is
// read-only, so the assignment threw and app.js stopped loading.
function writeBookMeta(bookId, meta) {
  bookMetaCache.delete(bookId);
  return window.neo.writeBookMeta(bookId, meta);
}

async function renderShelves() {
  await NeoCovers.ready; // display faces, so titles measure true
  const view = $('#bookshelf-view');
  const keepScroll = view.scrollTop; // re-rendering must not move the page
  $('#author-chip').textContent = displayAuthor();
  const wrap = $('#shelves');
  // the new shelves are built off-screen and swapped in whole, so the page
  // never goes blank while books are read from disk — no flash on a drop
  const built = document.createDocumentFragment();
  // shelves drag by their grip to reorder, with a gold bar showing the drop spot
  if (!wrap.dataset.dndWired) {
    wrap.dataset.dndWired = '1';
    wrap.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('application/x-neo-shelf')) return;
    e.preventDefault();
    let ind = wrap.querySelector('.shelf-drop-ind');
    if (!ind) {
      ind = document.createElement('div');
      ind.className = 'shelf-drop-ind';
    }
    let placed = false;
    for (const s of wrap.querySelectorAll('.shelf:not(.dragging)')) {
      const r = s.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        wrap.insertBefore(ind, s);
        placed = true;
        break;
      }
    }
      if (!placed) wrap.appendChild(ind);
    });
    wrap.addEventListener('drop', async (e) => {
      const shelfId = e.dataTransfer.getData('application/x-neo-shelf');
      if (!shelfId) return;
      e.preventDefault();
      const ind = wrap.querySelector('.shelf-drop-ind');
      let index = library.shelves.length;
      if (ind) {
        index = 0;
        for (const c of wrap.children) {
          if (c === ind) break;
          if (c.classList.contains('shelf') && !c.classList.contains('dragging')) index++;
        }
        ind.remove();
      }
      const moving = library.shelves.find((s) => s.id === shelfId);
      if (!moving) return;
      library.shelves = library.shelves.filter((s) => s.id !== shelfId);
      library.shelves.splice(index, 0, moving);
      await writeLibrary(library);
      // move the shelf on screen rather than redrawing everything
      const secs = [...wrap.querySelectorAll('.shelf')];
      const movingSec = secs.find((el) => el.dataset.shelfId === shelfId);
      const others = secs.filter((el) => el !== movingSec);
      if (movingSec) wrap.insertBefore(movingSec, others[index] || null);
      else renderShelves();
    });
  }

  for (const shelf of shelvesFor(currentAuthor().id)) {
    const sec = document.createElement('section');
    sec.className = 'shelf';
    sec.dataset.shelfId = shelf.id;
    if (isBound(shelf)) sec.classList.add('bound');
    if (shelf.id === justBoundId) { sec.classList.add('just-bound'); justBoundId = null; }

    const grip = document.createElement('span');
    grip.className = 'shelf-grip';
    grip.textContent = '⠿';
    grip.title = t('Drag to reorder shelves');
    grip.draggable = true;
    grip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-neo-shelf', shelf.id);
      sec.classList.add('dragging');
    });
    grip.addEventListener('dragend', () => {
      sec.classList.remove('dragging');
      const ind = document.querySelector('.shelf-drop-ind');
      if (ind) ind.remove();
    });
    sec.appendChild(grip);

    const label = document.createElement('span');
    label.className = 'shelf-label';
    // on a touch screen the name turns editable only when tapped, so a long
    // press (the menu) never wakes the keyboard or selects the text
    label.contentEditable = NO_HOVER ? 'false' : 'true';
    label.spellcheck = false;
    label.textContent = shelf.name;
    label.title = t('Click to rename · right-click to export or delete');
    if (NO_HOVER) {
      label.addEventListener('click', () => {
        if (label.isContentEditable) return;
        label.contentEditable = 'true';
        label.focus();
        const r = document.createRange();
        r.selectNodeContents(label);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
    }
    label.addEventListener('blur', async () => {
      const before = shelf.name;
      shelf.name = label.textContent.trim() || shelf.name;
      label.textContent = shelf.name;
      if (NO_HOVER) label.contentEditable = 'false';
      await writeLibrary(library);
      // a bound shelf's name is its book's title: the cover follows it
      if (isBound(shelf) && shelf.name !== before) { await syncCoverTitle(shelf); renderShelves(); }
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
    });
    // right-click a shelf label: bind it into one book, publish it as an
    // anthology, or delete it (a bound shelf has a menu of its own)
    label.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (isBound(shelf)) { await boundShelfMenu(shelf); return; }
      const choice = await optionModal(escHtml(t('Shelf “{name}”', { name: shelf.name })), null, [
        {
          label: t('Bind into one book'),
          desc: t('Its titles become one book, with a cover, front and back pages, and one table of contents.'),
          value: 'bind'
        },
        {
          label: t('Export shelf as anthology…'),
          desc: shelf.bookIds.length
            ? t('Collect its {n} works, in shelf order, into a single book with a table of contents.', { n: shelf.bookIds.length })
            : t('Collect the works, in shelf order, into a single book with a table of contents.'),
          value: 'anthology'
        },
        { label: t('Delete shelf'), desc: t('Books move to another shelf. Nothing is deleted from disk.'), danger: true, value: 'del' }
      ]);
      if (choice === 'bind') {
        await bindShelf(shelf);
      } else if (choice === 'anthology') {
        await exportShelfAnthology(shelf);
      } else if (choice === 'del') {
        const mine = shelvesFor(currentAuthor().id);
        if (mine.length === 1) {
          toast(t('This is your only shelf — add another before deleting this one'));
          return;
        }
        const other = mine.find((s) => s.id !== shelf.id);
        for (const id of shelf.bookIds) {
          if (isPageMeta(await shelfMeta(id))) continue; // a bound book's pages stay in the library folder
          if (!other.bookIds.includes(id)) await placeTitle(other, id);
        }
        library.shelves = library.shelves.filter((s) => s.id !== shelf.id);
        await writeLibrary(library);
        renderShelves();
      }
    });
    const row = document.createElement('div');
    row.className = 'shelf-books';
    row.dataset.shelfId = shelf.id;

    // drag targets: reorder within a shelf, move between shelves, or drop
    // manuscript files straight from Finder
    row.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        row.classList.add('drag-over');
        return;
      }
      if (!e.dataTransfer.types.includes('application/x-neo-book')) return;
      e.preventDefault();
      row.classList.add('drag-over');
      const ind = dropIndicator();
      let placed = false;
      for (const t of row.querySelectorAll('.book:not(.dragging)')) {
        const r = t.getBoundingClientRect();
        // cursor above this book's row, or on its row and left of center
        if (e.clientY < r.top || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2)) {
          row.insertBefore(ind, t);
          placed = true;
          break;
        }
      }
      if (!placed) row.insertBefore(ind, row.querySelector('.new-book'));
    });
    row.addEventListener('dragleave', (e) => {
      if (row.contains(e.relatedTarget)) return;
      row.classList.remove('drag-over');
      const ind = document.querySelector('.drop-indicator');
      if (ind && ind.parentElement === row) ind.remove();
    });
    row.addEventListener('drop', async (e) => {
      row.classList.remove('drag-over');
      // files from Finder → import them right onto this shelf
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        const paths = [...e.dataTransfer.files]
          .map((f) => { try { return window.neo.pathForFile(f); } catch { return null; } })
          .filter(Boolean);
        if (!paths.length) return;
        toast(t('Importing…'));
        const results = await window.neo.importFiles(paths);
        if (!results.length) { toast(t('No .docx, .txt, or .md files in that drop')); return; }
        await addImportedBooks(results, shelf);
        return;
      }
      const bookId = e.dataTransfer.getData('application/x-neo-book');
      if (!bookId) return;
      e.preventDefault();
      // insertion index = how many (non-dragged) books sit before the indicator
      const ind = document.querySelector('.drop-indicator');
      let index = shelf.bookIds.filter((b) => b !== bookId).length;
      if (ind && ind.parentElement === row) {
        index = 0;
        for (const c of row.children) {
          if (c === ind) break;
          if (c.classList.contains('book') && !c.classList.contains('dragging')) index++;
        }
      }
      if (ind) ind.remove();
      const fromShelf = shelfOf(bookId);
      if (isBound(shelf)) {
        if (isPageMeta(await shelfMeta(bookId))) return; // a page keeps its place
        const { start, end } = await bodyRange(shelf, bookId);
        index = Math.min(Math.max(index, start), end);
      }
      for (const s of library.shelves) s.bookIds = s.bookIds.filter((b) => b !== bookId);
      shelf.bookIds.splice(index, 0, bookId);
      await writeLibrary(library);
      if (isBound(shelf) || isBound(fromShelf)) { renderShelves(); return; }
      // slide the tile into place; the shelf itself is not redrawn
      const tile = document.querySelector(`.book[data-book-id="${bookId}"]`);
      if (tile) {
        const others = [...row.querySelectorAll('.book')].filter((b) => b !== tile);
        row.insertBefore(tile, others[index] || row.querySelector('.new-book'));
        tile.classList.remove('dragging');
      } else renderShelves();
    });

    // the blank page — click to begin
    const blank = document.createElement('div');
    blank.className = 'new-book';
    blank.textContent = '+';
    blank.title = t('Start a new book');
    blank.onclick = () => createBookOnShelf(shelf);
    pressable(blank, t('Start a new book'));

    if (isBound(shelf)) {
      await renderBoundRow(shelf, row, blank);
      // the tiles of a shelf just bound settle in one after another
      if (sec.classList.contains('just-bound')) [...row.children].forEach((el, i) => el.style.setProperty('--i', i));
    } else {
      for (const bookId of shelf.bookIds) {
        const meta = await shelfMeta(bookId);
        if (!meta || isPageMeta(meta)) continue;
        row.appendChild(bookTile(meta));
      }
      row.appendChild(blank);
    }

    sec.appendChild(label);
    if (isBound(shelf)) {
      const mark = document.createElement('span');
      mark.className = 'shelf-bound-mark';
      mark.textContent = t('one book');
      sec.appendChild(mark);
    }
    sec.appendChild(row);
    built.appendChild(sec);
  }
  wrap.replaceChildren(built);
  view.scrollTop = keepScroll;
  fitBoundShelves();
}

// A bound shelf, measured once it's on screen: the thread under it runs as
// far as its books do, and a page's name too long for its spine (some
// languages have long ones) is set smaller until it fits
function fitBoundShelves() {
  for (const row of document.querySelectorAll('.shelf.bound .shelf-books')) {
    const last = row.lastElementChild;
    const box = row.getBoundingClientRect();
    if (!last || !box.width) continue;
    const zoom = box.width / row.offsetWidth; // the Interface Size zoom
    row.style.setProperty('--stitch', Math.ceil((last.getBoundingClientRect().right - box.left) / zoom) + 'px');
    for (const l of row.querySelectorAll('.pt-label')) {
      l.style.fontSize = '';
      l.style.letterSpacing = '';
      const room = l.clientHeight;
      const need = l.scrollHeight;
      if (!room || need <= room + 1) continue;
      const cs = getComputedStyle(l);
      const k = room / need;
      l.style.fontSize = Math.max(6.5, parseFloat(cs.fontSize) * k).toFixed(2) + 'px';
      l.style.letterSpacing = ((parseFloat(cs.letterSpacing) || 0) * k).toFixed(2) + 'px';
    }
  }
}
