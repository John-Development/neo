// Help → About NEO: the version, plainly
async function showAbout() {
  const v = await window.neo.appVersion();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="width:340px;text-align:center">
      <h2 style="font-size:22px;letter-spacing:6px">NEO</h2>
      <p class="about-version">${t('Version {version}', { version: v })}</p>
      <p class="about-line">${t('A word processor for authors.')}</p>
      <div style="margin-top:16px">
        <button class="m-ok btn-gold">${t('Back to writing')}</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.m-ok').onclick = close;
  bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  bd.querySelector('.m-ok').focus();
}

// Text size and the reset travel with page zoom; the menu item and the
// keyboard fallback share this so the two cannot drift.
async function setEditorFontSize(value) {
  const cur = library.editorFontSize || 17;
  library.editorFontSize = value === 0 ? 17 : Math.min(22, Math.max(14, cur + value));
  if (value === 0) library.pageZoom = 1; // ⌘0 resets pinch zoom too
  await writeLibrary(library);
  keepReadingPlace(applyFonts);
}