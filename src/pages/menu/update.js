// Help → Check for Update…: on-demand release lookup, only ever runs on a click
let updateDialog = null; // the Check for Update… window, while it's open

function updateDialogBox(res) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="width:400px">
      <h2 style="font-size:16px">${t('NEO {version} is available', { version: res.latestVersion })}</h2>
      <p class="up-text">${t('You have {version}.', { version: res.currentVersion })}</p>
      <div class="up-bar" hidden><div class="up-fill"></div></div>
      <div style="text-align:right;margin-top:14px">
        <button class="m-cancel btn-quiet" style="margin-right:10px">${t('Later')}</button>
        <button class="m-ok btn-gold"></button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => { bd.remove(); if (updateDialog === bd) updateDialog = null; };
  bd.close = close;
  bd.querySelector('.m-cancel').onclick = close;
  bd.tabIndex = -1;
  bd.focus();
  bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return bd;
}

// one function draws every state of the dialog, so a message from the
// updater can redraw it whenever it likes
function updateDialogShow(state, info = {}) {
  const bd = updateDialog;
  if (!bd) return;
  const text = bd.querySelector('.up-text');
  const bar = bd.querySelector('.up-bar');
  const fill = bd.querySelector('.up-fill');
  const ok = bd.querySelector('.m-ok');
  const later = bd.querySelector('.m-cancel');
  const mb = (n) => (n / 1048576).toFixed(0);
  later.hidden = false;
  ok.hidden = false;
  bar.hidden = true;
  if (state === 'downloading') {
    const pct = Math.max(0, Math.min(100, info.percent || 0));
    text.textContent = info.total
      ? t('Downloading… {done} of {total} MB', { done: mb(info.transferred || 0), total: mb(info.total) })
      : t('Downloading…');
    bar.hidden = false;
    fill.style.width = pct.toFixed(1) + '%';
    ok.hidden = true;
  } else if (state === 'ready') {
    text.textContent = t('Downloaded. NEO will save your work and restart.');
    ok.textContent = t('Restart to update');
    ok.onclick = () => { flushAllSaves(); setTimeout(() => window.neo.installUpdate(), 300); };
    ok.focus();
  } else if (state === 'error') {
    text.textContent = t('The update couldn’t be installed from here: {message}', { message: info.message || t('unknown error') })
      + ' ' + t('You can download it from the release page instead.');
    ok.textContent = t('View Release');
    ok.onclick = () => { window.neo.openRelease(); bd.close(); };
  } else if (state === 'release') {
    text.textContent = t('You have {version}.', { version: info.currentVersion });
    ok.textContent = t('View Release');
    ok.onclick = () => { window.neo.openRelease(); bd.close(); };
  }
}

async function checkForUpdate() {
  if (updateDialog) { updateDialog.focus(); return; }
  const res = await window.neo.checkForUpdate();
  // the answer comes in a window, like an update does: a line at the foot
  // of the screen was too easy to miss
  if (res.error) { updateNotice(t('Couldn’t check for updates — try again later')); return; }
  if (!res.hasUpdate) { updateNotice(t('NEO is up to date'), t('You have {version}.', { version: res.currentVersion })); return; }
  // NEO has been fetching it in the background since it was found: show
  // where that download is — usually done, with "Restart to update"
  updateDialog = updateDialogBox(res);
  if (!res.canInstall) updateDialogShow('release', res);
  else if (res.ready) updateDialogShow('ready', res);
  else if (res.state === 'error') updateDialogShow('error', res);
  else updateDialogShow('downloading', res);
}

function updateNotice(title, line) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="width:400px" role="dialog" aria-modal="true">
      <h2 style="font-size:16px"></h2>
      <p class="up-text" hidden></p>
      <div style="text-align:right;margin-top:14px"><button class="m-ok btn-gold">${t('OK')}</button></div>
    </div>`;
  bd.querySelector('h2').textContent = title;
  if (line) { bd.querySelector('.up-text').hidden = false; bd.querySelector('.up-text').textContent = line; }
  document.body.appendChild(bd);
  const close = () => { bd.remove(); if (updateDialog === bd) updateDialog = null; };
  bd.close = close;
  bd.querySelector('.m-ok').onclick = close;
  bd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  updateDialog = bd; // asking again while it's open just brings it forward
  bd.querySelector('.m-ok').focus();
}

// messages from the updater in the main process
// (the download itself is silent: they only matter while the window is open)
function updateMessage(msg) {
  if (!updateDialog || !updateDialog.querySelector('.up-bar')) return; // nothing open to report to
  updateDialogShow(msg.state, msg);
}
