function showHelp() {
  const existing = $('#keyboard-shortcuts');
  if (existing) { existing.querySelector('.shortcuts-content').focus(); return; }
  const previousFocus = document.activeElement;
  const selection = window.getSelection();
  const previousRange = previousFocus.isContentEditable && selection.rangeCount
    ? selection.getRangeAt(0).cloneRange() : null;
  const bd = document.createElement('div');
  bd.id = 'keyboard-shortcuts';
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <header class="shortcuts-header">
        <h2 id="shortcuts-title">${t('Keyboard shortcuts')}</h2>
      </header>
      <div class="shortcuts-content" tabindex="0" role="region" aria-label="${t('Shortcut reference')}"></div>
      <footer class="shortcuts-footer" role="none">
        <span>${t(K(tk('⌘ Command · ⇧ Shift · ⌥ Option · ⌃ Control'), tk('Ctrl Control · Shift · Alt')))}</span>
        <button class="m-ok btn-gold">${t('Done')}</button>
      </footer>
    </div>`;
  const keyName = (key) => key.replaceAll('⌘', t('Command') + ' ').replaceAll('⇧', t('Shift') + ' ')
    .replaceAll('⌥', t('Option') + ' ').replaceAll('⌃', t('Control') + ' ').replaceAll('−', '-');
  const content = bd.querySelector('.shortcuts-content');
  const sections = shortcutSections().map((section, index) => `
    <section class="shortcuts-section" style="order:${index}"><h3>${escHtml(t(section.title))}</h3><dl>${section.rows.map(([keys, label, detail]) => `
      <div class="shortcut-row">
        <dt>${escHtml(t(label))}${detail ? `<small>${escHtml(t(detail))}</small>` : ''}</dt>
        <dd>${[keys].flat().map((key) => t(key)).map((key) => `<kbd aria-label="${escHtml(keyName(key))}">${escHtml(key)}</kbd>`).join(`<span class="shortcut-or">${t('or')}</span>`)}</dd>
      </div>`).join('')}</dl></section>`);
  // Keep Writing and Formatting first, with similar amounts of content per column.
  // Vim keys, there only while they're on, runs across both below them.
  content.innerHTML = [[0, 2, 4, 5], [1, 3]].map((column) => `<div class="shortcuts-column">${
    column.map((index) => sections[index]).join('')
  }</div>`).join('') + (sections[6] ? `<div class="shortcuts-wide">${sections[6]}</div>` : '');
  const close = () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    bd.remove();
    if (previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    if (previousRange && previousRange.startContainer.isConnected && previousRange.endContainer.isConnected) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  };
  bd.querySelector('.m-ok').onclick = close;
  const handleKeyDown = (e) => {
    e.stopPropagation(); // The editor must not handle keys while reading help.
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const controls = [content, bd.querySelector('.m-ok')];
      const index = controls.indexOf(document.activeElement);
      e.preventDefault();
      controls[(index + (e.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
    }
  };
  document.addEventListener('keydown', handleKeyDown, true);
  document.body.appendChild(bd);
  content.focus();
}