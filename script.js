// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';  // ← CHANGE if needed

// ==================== GLOBAL STATE ====================
const state = {
  token:   localStorage.getItem('vtoken') || null,
  email:   null,
  isAdmin: false,
  approved: false,
  role:    null,
  files:   [],
  sel:     new Set(),
  sort:    localStorage.getItem('sort') || 'newest',
  query:   '',
  uploadCtrl: null,
  dark:    localStorage.getItem('darkMode') === 'true',
  timers:  { role: null, approval: null, adminPoll: null, userPoll: null },
};

// ==================== DOM ELEMENTS ====================
const $ = id => document.getElementById(id);
const D = {
  stats:        $('storageStats'),
  userUI:       $('userUI'),
  adminBar:     $('adminBar'),
  dropzone:     $('dropzone'),
  fileInp:      $('fileInput'),
  progBox:      $('progressBox'),
  progFill:     $('progressFill'),
  pctDisp:      $('percentDisplay'),
  sizeDisp:     $('sizeDisplay'),
  cancelBtn:    $('cancelUpload'),
  grid:         $('fileGrid'),
  prevOv:       $('previewOverlay'),
  prevCont:     $('previewContainer'),
  btnFull:      $('btnFullscreen'),
  btnCloseP:    $('btnClosePreview'),
  search:       $('searchInput'),
  sortSel:      $('sortSelect'),
  bulkBar:      $('bulkBar'),
  bulkCnt:      $('bulkCount'),
  toastBox:     $('toastContainer'),
  btnDark:      $('btnDarkMode'),
  btnSync:      $('btnSync'),
  btnAppr:      $('btnApprovals'),
  btnAllUsers:  $('btnAllUsers'),
  btnLogs:      $('btnLogs'),
  btnAnalytics: $('btnAnalytics'),
  btnShare:     $('btnShareManager'),
  btnUnAuth:    $('btnAdminLogout'),
  pnlAppr:      $('approvalPanel'),
  listAppr:     $('approvalList'),
  pnlUsers:     $('usersPanel'),
  listUsers:    $('usersList'),
  pnlLogs:      $('logsPanel'),
  logsCt:       $('logsContent'),
  pnlAnalytics: $('analyticsPanel'),
  analyticsCt:  $('analyticsContent'),
  pnlShare:     $('sharePanel'),
  shareCt:      $('shareContent'),
  pendingBadge: $('pendingBadge'),
  btnClearLogs: $('btnClearLogs'),
};

// ==================== UTILITIES ====================
const toast = (msg, type = 'info') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  D.toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
};
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSz = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB','TB']; let i=0, s=b; while(s>=1024&&i<4) { s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const icn = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const prevType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// ==================== DARK MODE ====================
(() => {
  if(state.dark) document.documentElement.setAttribute('data-theme','dark');
  D.btnDark.addEventListener('click', async () => {
    state.dark = !state.dark;
    document.documentElement.setAttribute('data-theme', state.dark ? 'dark' : 'light');
    localStorage.setItem('darkMode', state.dark);
    if (state.isAdmin && state.token) {
      // Optional: switch storage engine (for hybrid, but works with D1 too)
      const newEngine = state.dark ? 'kv' : 'd1';
      try {
        await fetch(`${WORKER_BASE}/admin/set-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.token },
          body: JSON.stringify({ engine: newEngine })
        });
        toast(`Storage engine: ${newEngine.toUpperCase()}`);
      } catch (e) { /* ignore */ }
    }
  });
})();

// ==================== AUTH ====================
async function init() {
  const p = new URLSearchParams(location.search);
  const u = p.get('utoken'), e = p.get('auth_error');
  if(e) { toast('Auth error: '+e.replace(/_/g,' '), 'error'); history.replaceState({},'',location.pathname); }
  if(u) { state.token = u; localStorage.setItem('vtoken', u); history.replaceState({},'',location.pathname); await fetchUserInfo(); render(); return; }
  if(state.token) { await fetchUserInfo(); render(); return; }
  showLogin();
}

async function fetchUserInfo() {
  if(!state.token) return;
  try {
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${state.token}`);
    if(!r.ok) throw new Error('Invalid token');
    const i = await r.json();
    state.email    = i.email;
    state.isAdmin  = i.isAdmin === true;
    state.approved = i.approved;
    state.role     = i.role;
  } catch {
    state.token = null;
    localStorage.removeItem('vtoken');
  }
}

function showLogin() {
  D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
  D.grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px;">
      <h2>Welcome to File Vault</h2>
      <p style="margin:16px 0;">Sign in to access your files.</p>
      <button class="btn btn-primary" id="btnLogin">🔑 Login with Google</button>
    </div>`;
  document.getElementById('btnLogin').onclick = async () => {
    const r = await fetch(`${WORKER_BASE}/auth-url`);
    if(r.ok) window.location = (await r.json()).authUrl;
    else toast('Failed to start login', 'error');
  };
}

function showPending() {
  D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
  D.dropzone.style.display = 'none';
  document.querySelector('.hint-text').style.display = 'none';
  D.grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px;">
      <h2>🔐 Waiting for Approval</h2>
      <p>Your email: <strong>${state.email}</strong></p>
      <p>You will be notified automatically.</p>
      <button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button>
      <button class="btn btn-danger btn-sm" id="btnSelfRevoke" style="margin-left:8px;">❌ Cancel Request</button>
    </div>`;
  document.getElementById('btnSelfRevoke').onclick = selfRevoke;
  startApprovalPoll();
}

function showMain() {
  document.querySelector('.hint-text').style.display = '';
  if(state.isAdmin) {
    D.adminBar.classList.remove('hidden');
    D.userUI.innerHTML = '';
    D.dropzone.style.display = '';
  } else {
    D.adminBar.classList.add('hidden');
    const roleStr = state.role ? ` (${state.role})` : '';
    D.userUI.innerHTML = state.email
      ? `<span style="font-size:0.85rem;">👤 ${state.email}${roleStr} <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>`
      : '';
    const btn = document.getElementById('btnUserLogout');
    if(btn) btn.onclick = userLogout;
  }
}

async function selfRevoke() {
  if(!confirm('Cancel your access request?')) return;
  const r = await fetch(`${WORKER_BASE}/user-revoke-self`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({utoken: state.token})
  });
  if(r.ok) {
    state.token = null; localStorage.removeItem('vtoken');
    state.approved = false; state.role = null; state.email = null;
    clearTimers();
    showLogin();
    toast('Access request cancelled.');
  } else toast('Failed to cancel request', 'error');
}

function userLogout() {
  localStorage.removeItem('vtoken');
  state.token = null; state.isAdmin = false; state.approved = false; state.role = null; state.email = null;
  clearTimers();
  showLogin();
  toast('Logged out.');
}

function render() {
  clearTimers();
  if(!state.email) { showLogin(); return; }
  if(state.isAdmin) { showMain(); fetchFiles(); startAdminPoll(); return; }
  if(!state.approved) { showPending(); return; }
  showMain();
  applyRoleUI();
  fetchFiles();
  startRolePoll();
  startUserPoll();
}

function clearTimers() {
  ['role','approval','adminPoll','userPoll'].forEach(k => { if(state.timers[k]) clearInterval(state.timers[k]); });
}

// ==================== ADMIN BAR ====================
D.btnSync.addEventListener('click', () => syncFiles());
D.btnAppr.addEventListener('click', () => togglePanel(D.pnlAppr, loadPending));
D.btnAllUsers.addEventListener('click', () => togglePanel(D.pnlUsers, loadAllUsers));
D.btnLogs.addEventListener('click', () => togglePanel(D.pnlLogs, loadLogs));
D.btnAnalytics.addEventListener('click', () => togglePanel(D.pnlAnalytics, loadAnalytics));
D.btnShare.addEventListener('click', () => togglePanel(D.pnlShare, loadShares));
D.btnUnAuth.addEventListener('click', adminLogout);

function togglePanel(panel, loadFn) {
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadFn();
}

async function syncFiles() {
  toast('Syncing…','info');
  const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:{'X-Admin-Token':state.token}});
  if(r.ok) { await fetchFiles(); toast('Sync done','success'); }
  else toast('Sync failed','error');
}

async function adminLogout() {
  if(!confirm('Logout as admin? Vault will continue to work.')) return;
  localStorage.removeItem('vtoken');
  state.token = null; state.isAdmin = false; state.email = null;
  clearTimers();
  showLogin();
  toast('Admin logged out.');
}

// ==================== PENDING / USERS ====================
async function loadPendingCount() {
  const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':state.token}});
  const p = await r.json();
  D.pendingBadge.textContent = p.length;
  D.pendingBadge.classList.toggle('hidden', p.length===0);
}

function loadPending() {
  fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':state.token}})
    .then(r=>r.json())
    .then(users => {
      D.listAppr.innerHTML = users.length ? users.map(u => `
        <div class="approval-item">
          <span>${u.email}</span>
          <div style="display:flex;gap:6px;">
            <select class="role-sel">
              <option value="full">Full</option><option value="delete">Delete</option>
              <option value="upload">Upload Only</option><option value="download">Download Only</option>
              <option value="read">Read Only</option><option value="none">None</option>
            </select>
            <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-action="approve" data-email="${u.email}">✅ Approve</button>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-action="deny" data-email="${u.email}">❌ Deny</button>
          </div>
        </div>`).join('') : '<p>No pending users.</p>';
      D.listAppr.addEventListener('click', handlePendingClick);
    });
}

async function handlePendingClick(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const email = btn.dataset.email;
  if (action === 'approve') {
    const role = btn.parentElement.querySelector('.role-sel').value;
    const r = await fetch(`${WORKER_BASE}/admin/approve`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token},
      body:JSON.stringify({email,role})
    });
    if(r.ok) toast(`${email} approved`);
    else toast('Approval failed','error');
  } else {
    const r = await fetch(`${WORKER_BASE}/admin/deny`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token},
      body:JSON.stringify({email})
    });
    if(r.ok) toast(`${email} denied`);
    else toast('Deny failed','error');
  }
  loadPending(); loadPendingCount(); loadAllUsers();
}

function loadAllUsers() {
  fetch(`${WORKER_BASE}/admin/users/all`,{headers:{'X-Admin-Token':state.token}})
    .then(r=>r.json())
    .then(users => {
      const active = users.filter(u=>u.status!=='revoked');
      const revoked = users.filter(u=>u.status==='revoked');
      let html = active.map(u => `
        <div class="approval-item">
          <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role?`(${u.role})`:''}</span>
          <div style="display:flex;gap:6px;">
            ${u.status==='pending'?`
              <select class="role-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
              <button class="btn btn-sm btn-success" data-action="approve" data-email="${u.email}">✅ Approve</button>
            `:''}
            ${u.status==='approved'?`
              <select class="role-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="upload" ${u.role==='upload'?'selected':''}>Upload Only</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select>
              <button class="btn btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button>
              <button class="btn btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>
            `:''}
          </div>
        </div>`).join('');
      if(revoked.length>0) {
        html += '<hr><h4 style="margin-top:12px;margin-bottom:8px;">Revoked Users</h4>';
        html += revoked.map(u => `
          <div class="approval-item">
            <span>${u.email} <span class="status-badge status-revoked">revoked</span> ${u.role?`(${u.role})`:''}</span>
            <div style="display:flex;gap:6px;">
              <select class="role-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
              <button class="btn btn-sm btn-warn" data-action="reapprove" data-email="${u.email}">Re‑approve</button>
              <button class="btn btn-sm btn-danger" disabled>Revoke</button>
            </div>
          </div>`).join('');
      }
      D.listUsers.innerHTML = html || '<p>No users found.</p>';
      D.listUsers.addEventListener('click', handleUsersClick);
    });
}

async function handleUsersClick(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const email = btn.dataset.email;
  if (['approve','reapprove','update'].includes(action)) {
    const sel = btn.closest('.approval-item').querySelector('select');
    const role = sel ? sel.value : 'full';
    const endpoint = action === 'reapprove' ? 'reapprove' : 'approve';
    const r = await fetch(`${WORKER_BASE}/admin/${endpoint}`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token},
      body:JSON.stringify({email,role})
    });
    if(r.ok) toast(`${email} updated`);
    else toast('Update failed','error');
  } else if (action === 'revoke') {
    const r = await fetch(`${WORKER_BASE}/admin/revoke`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token},
      body:JSON.stringify({email})
    });
    if(r.ok) toast(`${email} revoked`);
    else toast('Revoke failed','error');
  }
  loadAllUsers();
  if (['approve','reapprove'].includes(action)) loadPendingCount();
}

// ==================== LOGS / ANALYTICS / SHARES ====================
function loadLogs() {
  fetch(`${WORKER_BASE}/admin/logs?limit=100`,{headers:{'X-Admin-Token':state.token}})
    .then(r=>r.json())
    .then(d => {
      D.logsCt.innerHTML = d.logs.length ? d.logs.map(l => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
          <strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} <span style="color:var(--accent)">${l.action}</span> ${l.target||''}
        </div>`).join('') : '<p>No logs yet.</p>';
    });
}
D.btnClearLogs.addEventListener('click', async () => {
  if(!confirm('Delete all audit logs?')) return;
  const r = await fetch(`${WORKER_BASE}/admin/logs/clear`,{method:'POST',headers:{'X-Admin-Token':state.token}});
  if(r.ok) { loadLogs(); toast('Logs cleared'); }
  else toast('Failed to clear logs','error');
});

function loadAnalytics() {
  fetch(`${WORKER_BASE}/admin/analytics`,{headers:{'X-Admin-Token':state.token}})
    .then(r=>r.json())
    .then(d => {
      D.analyticsCt.innerHTML = `<p><strong>Files:</strong> ${d.files.total} (${fmtSz(d.files.totalSize)})</p><p><strong>Users:</strong> ${d.users.total}</p>`;
    });
}
function loadShares() { D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'; }

// ==================== FILE LIST & ACTIONS ====================
async function fetchFiles() {
  try {
    const r = await fetch(`${WORKER_BASE}/list`);
    if (!r.ok) throw new Error('Failed to fetch files');
    const { files } = await r.json();
    state.files = files;
    renderFiles();
  } catch(e) { console.error(e); }
}

function renderFiles() {
  let list = [...state.files];
  if(state.query) list = list.filter(f => f.name.toLowerCase().includes(state.query));
  const s = state.sort;
  list.sort((a,b) => {
    switch(s) {
      case 'newest': return b.createdAt - a.createdAt;
      case 'oldest': return a.createdAt - b.createdAt;
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'size-desc': return b.size - a.size;
      case 'size-asc': return a.size - b.size;
      default: return 0;
    }
  });
  D.grid.innerHTML = '';
  if(!list.length) {
    D.grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:30px;">No files yet.</p>';
    return;
  }
  list.forEach(f => {
    const actions = getFileActions(f.publicId);
    const upBy = f.uploadedBy ? `<div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:4px;">📤 ${f.uploadedBy}</div>` : '';
    const card = document.createElement('div');
    card.className = `card${state.sel.has(f.publicId)?' selected':''}`;
    card.dataset.publicId = f.publicId;
    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${state.sel.has(f.publicId)?'checked':''}>
      <div class="file-icon">${icn(f.mimeType)}</div>
      <div class="file-name">${esc(f.name)}</div>
      <div class="file-meta">${fmtSz(f.size)} · ${new Date(f.createdAt).toLocaleString()}</div>
      ${upBy}
      <div class="actions">
        ${actions.includes('play')?`<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>`:''}
        ${actions.includes('preview')?`<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>`:''}
        ${actions.includes('download')?`<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇</button>`:''}
        ${actions.includes('rename')?`<button class="btn-xs btn-xs-rename" data-action="rename" data-id="${f.publicId}">✏️ Rename</button>`:''}
        ${actions.includes('share')?`<button class="btn-xs btn-xs-share" data-action="share" data-id="${f.publicId}">🔗 Share</button>`:''}
        ${actions.includes('delete')?`<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑</button>`:''}
        ${actions.includes('replace')?`<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄</button>`:''}
      </div>`;
    D.grid.appendChild(card);
  });
  updateBulkBar();
}

function getFileActions(pid) {
  if(state.isAdmin) return ['play','preview','download','rename','share','delete','replace'];
  if(!state.role) return [];
  const file = state.files.find(f=>f.publicId===pid);
  if(!file) return [];
  const a = [];
  const pt = prevType(file.mimeType);
  if((pt==='video'||pt==='audio') && ['full','delete','upload','download','read'].includes(state.role)) a.push('play');
  if(['image','pdf','text'].includes(pt) && ['full','delete','upload','download','read'].includes(state.role)) a.push('preview');
  if(['full','delete','upload','download'].includes(state.role)) a.push('download');
  if(['full'].includes(state.role)) a.push('rename','share');
  if(['full','delete'].includes(state.role)) a.push('delete');
  if(state.role==='full') a.push('replace');
  return a;
}

// ==================== FILE GRID EVENTS ====================
D.grid.addEventListener('click', ev => {
  const btn = ev.target.closest('button');
  if (btn) {
    ev.stopPropagation();
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action) fileAction(action, id);
    return;
  }
  const card = ev.target.closest('.card');
  if (card) {
    const cb = card.querySelector('.card-checkbox');
    if (cb && ev.target !== cb) toggleSelect(card.dataset.publicId, !cb.checked);
  }
});
D.grid.addEventListener('change', ev => {
  const cb = ev.target.closest('.card-checkbox');
  if (cb) toggleSelect(cb.dataset.id, cb.checked);
});

function toggleSelect(id, checked) {
  if(checked) state.sel.add(id); else state.sel.delete(id);
  updateBulkBar();
  const card = document.querySelector(`.card[data-public-id="${id}"]`);
  if(card) card.classList.toggle('selected', checked);
}

function updateBulkBar() {
  if(state.sel.size > 0) {
    D.bulkBar.classList.remove('hidden');
    D.bulkCnt.textContent = `${state.sel.size} selected`;
  } else {
    D.bulkBar.classList.add('hidden');
  }
}
$('btnBulkCancel').addEventListener('click', () => { state.sel.clear(); renderFiles(); updateBulkBar(); });
$('btnBulkDelete').addEventListener('click', async () => {
  if(!confirm(`Delete ${state.sel.size} files?`)) return;
  const ids = Array.from(state.sel);
  const r = await fetch(`${WORKER_BASE}/bulk-delete`,{
    method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token,'X-User-Token':state.token},
    body:JSON.stringify({publicIds:ids})
  });
  const d = await r.json();
  state.sel.clear(); updateBulkBar(); await fetchFiles();
  toast(`${d.deleted} deleted, ${d.failed} failed`);
});

function fileAction(action, id) {
  switch(action) {
    case 'play': openPreview(id, 'video'); break;
    case 'preview': openPreview(id, prevType(state.files.find(f=>f.publicId===id)?.mimeType)); break;
    case 'download': downloadFile(id); break;
    case 'delete': deleteFile(id); break;
    case 'replace': replaceFile(id); break;
    case 'rename': renameFile(id); break;
    case 'share': shareFile(id); break;
  }
}

// ==================== UPLOAD ENGINE ====================
D.dropzone.addEventListener('click', () => D.fileInp.click());
D.fileInp.addEventListener('change', e => { if(e.target.files.length) processFiles(e.target.files); e.target.value = ''; });
['dragover','dragleave','drop'].forEach(ev => D.dropzone.addEventListener(ev, e => e.preventDefault()));
D.dropzone.addEventListener('dragover', () => D.dropzone.classList.add('dragover'));
D.dropzone.addEventListener('dragleave', () => D.dropzone.classList.remove('dragover'));
D.dropzone.addEventListener('drop', e => { e.preventDefault(); D.dropzone.classList.remove('dragover'); if(e.dataTransfer.files.length) processFiles(e.dataTransfer.files); });
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items; if(!items) return;
  const files = []; for(const item of items) if(item.kind==='file') { const f = item.getAsFile(); if(f) files.push(f); }
  if(files.length) { e.preventDefault(); processFiles(files); }
});
document.addEventListener('keydown', e => {
  if(e.ctrlKey&&e.key==='u') { e.preventDefault(); D.fileInp.click(); }
  if(e.ctrlKey&&e.key==='f') { e.preventDefault(); D.search.focus(); }
  if(e.key==='Escape') { if(!D.prevOv.classList.contains('hidden')) closePreview(); if(state.sel.size) { state.sel.clear(); renderFiles(); updateBulkBar(); } }
});

async function processFiles(files) { for(const file of files) await uploadFile(file); await fetchFiles(); }

async function uploadFile(file, existPid = null) {
  if(state.uploadCtrl) state.uploadCtrl.abort();
  state.uploadCtrl = new AbortController(); const sig = state.uploadCtrl.signal;
  D.progBox.classList.remove('hidden');
  try {
    let pid = existPid;
    if(!pid) {
      const ir = await fetch(`${WORKER_BASE}/upload-init`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'}),
        signal:sig
      });
      if(!ir.ok) throw new Error(((await ir.json()).error) || 'Init failed');
      pid = (await ir.json()).publicId;
    }
    const CHUNK = 10*1024*1024; let up = 0;
    while(up < file.size) {
      if(sig.aborted) throw new Error('Cancelled');
      const end = Math.min(up+CHUNK-1, file.size-1);
      const chunk = file.slice(up, end+1);
      let retries = 3, done = false;
      while(retries-- && !done) {
        const cr = await fetch(`${WORKER_BASE}/upload-chunk/${pid}`,{
          method:'PUT',headers:{'Content-Range':`bytes ${up}-${end}/${file.size}`},body:chunk,signal:sig
        });
        const d = await cr.json();
        if(cr.ok) { up = d.uploadedBytes || end+1; updateProg(up, file.size); if(d.status==='complete') { done = true; break; } }
        else { if(retries<=0) throw new Error(d.error||'Chunk error'); await sleep(1000); }
      }
    }
    toast(`${file.name} uploaded`, 'success');
  } catch(err) { if(err.message!=='Cancelled') toast(`Upload failed: ${err.message}`, 'error'); }
  finally { D.progBox.classList.add('hidden'); state.uploadCtrl = null; }
}

function updateProg(u,t) { const p = Math.round(u/t*100); D.progFill.style.width = p+'%'; D.pctDisp.textContent = p+'%'; D.sizeDisp.textContent = `${fmtSz(u)} / ${fmtSz(t)}`; }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
D.cancelBtn.addEventListener('click', () => { if(state.uploadCtrl) { state.uploadCtrl.abort(); state.uploadCtrl = null; D.progBox.classList.add('hidden'); } });

// ==================== PREVIEW ====================
function openPreview(pid, type) {
  D.prevCont.innerHTML = ''; const url = `${WORKER_BASE}/video/${pid}`;
  if(type==='video'||type==='audio') {
    const m = document.createElement(type==='audio'?'audio':'video');
    m.src = url; m.controls = true; m.playsInline = true;
    m.style.width = '100%'; m.style.height = '100%'; m.style.objectFit = 'contain';
    D.prevCont.appendChild(m); m.play().catch(()=>{});
  } else if(type==='image') { const img = document.createElement('img'); img.src = url; img.style.maxWidth='95%'; img.style.maxHeight='95%'; D.prevCont.appendChild(img); }
  else if(type==='pdf') { const ifr = document.createElement('iframe'); ifr.src = url; ifr.style.width='90%'; ifr.style.height='90%'; D.prevCont.appendChild(ifr); }
  else if(type==='text') { fetch(url).then(r=>r.text()).then(t=>{ const pre = document.createElement('pre'); pre.textContent = t; D.prevCont.appendChild(pre); }); }
  else { downloadFile(pid); return; }
  D.prevOv.classList.remove('hidden');
}
function closePreview() { D.prevCont.innerHTML = ''; D.prevOv.classList.add('hidden'); if(document.fullscreenElement) document.exitFullscreen(); }
D.btnCloseP.addEventListener('click', closePreview);
D.btnFull.addEventListener('click', () => { if(document.fullscreenElement) document.exitFullscreen(); else D.prevOv.requestFullscreen(); });

// ==================== CRUD OPERATIONS ====================
function downloadFile(pid) { const a = document.createElement('a'); a.href = `${WORKER_BASE}/download/${pid}`; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
async function deleteFile(pid) {
  if(!confirm('Delete?')) return;
  const r = await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token,'X-User-Token':state.token},body:JSON.stringify({publicId:pid})});
  if(r.ok) { state.files = state.files.filter(f=>f.publicId!==pid); state.sel.delete(pid); renderFiles(); updateBulkBar(); toast('Deleted','success'); }
  else toast('Delete failed','error');
}
function replaceFile(pid) {
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async () => {
    const file = inp.files[0]; if(!file) return;
    const ir = await fetch(`${WORKER_BASE}/update`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token,'X-User-Token':state.token},body:JSON.stringify({publicId:pid,fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'})});
    if(!ir.ok) { toast('Update init failed','error'); return; }
    const {publicId} = await ir.json();
    await uploadFile(file, publicId); await fetchFiles();
  };
  inp.click();
}
async function renameFile(pid) {
  const file = state.files.find(f=>f.publicId===pid); if(!file) return;
  const newName = prompt('New name:', file.name);
  if(!newName||newName===file.name) return;
  const r = await fetch(`${WORKER_BASE}/rename`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token,'X-User-Token':state.token},body:JSON.stringify({publicId:pid,newName})});
  if(r.ok) { toast('Renamed'); await fetchFiles(); } else toast('Rename failed','error');
}
async function shareFile(pid) {
  const label = prompt('Share label (optional):','');
  const expires = prompt('Expires in hours (default 1):','1');
  const maxDownloads = parseInt(prompt('Max downloads (0=unlimited):','0'),10);
  const r = await fetch(`${WORKER_BASE}/share/create`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.token,'X-User-Token':state.token},body:JSON.stringify({publicId:pid,expiresIn:(parseInt(expires||'1',10)*3600),maxDownloads,label})});
  const d = await r.json();
  if(r.ok) { toast('Share link created!'); navigator.clipboard.writeText(d.shareUrl).then(()=>toast('Link copied to clipboard')); }
  else toast('Share failed','error');
}

// ==================== POLLING ====================
function startRolePoll() {
  if(state.timers.role) clearInterval(state.timers.role);
  state.timers.role = setInterval(async () => {
    if(!state.token||!state.approved) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${state.token}`);
    if(!r.ok) return;
    const i = await r.json();
    if(i.role !== state.role) { state.role = i.role; applyRoleUI(); toast(`Role changed to ${state.role}`); }
  }, 8000);
}
function startApprovalPoll() {
  if(state.timers.approval) clearInterval(state.timers.approval);
  state.timers.approval = setInterval(async () => {
    if(!state.token) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${state.token}`);
    if(!r.ok) return;
    const i = await r.json();
    if(i.approved) { state.approved = true; state.role = i.role; clearInterval(state.timers.approval); toast('Approved!','success'); render(); }
  }, 10000);
}
function startAdminPoll() {
  if(state.timers.adminPoll) clearInterval(state.timers.adminPoll);
  let lastTs = 0;
  const poll = async () => {
    if(!state.token||!state.isAdmin) return;
    const r = await fetch(`${WORKER_BASE}/admin/poll?since=${lastTs}&timeout=15`,{headers:{'X-Admin-Token':state.token}});
    const d = await r.json();
    if(d.changed) { lastTs = d.ts; loadPendingCount(); if(!D.pnlAppr.classList.contains('hidden')) loadPending(); if(!D.pnlUsers.classList.contains('hidden')) loadAllUsers(); if(!D.pnlLogs.classList.contains('hidden')) loadLogs(); }
    state.timers.adminPoll = setTimeout(poll, 2000);
  };
  poll();
}
function startUserPoll() {
  if(state.timers.userPoll) clearInterval(state.timers.userPoll);
  let lastTs = 0;
  const poll = async () => {
    if(!state.token||!state.approved) return;
    const r = await fetch(`${WORKER_BASE}/poll?utoken=${state.token}&since=${lastTs}&timeout=15`);
    const d = await r.json();
    if(d.changed) { lastTs = d.ts; fetchFiles(); }
    state.timers.userPoll = setTimeout(poll, 2000);
  };
  poll();
}
function applyRoleUI() {
  const can = state.role==='full'||state.role==='delete'||state.role==='upload'||state.role==='download';
  D.dropzone.style.display = can ? '' : 'none';
  document.querySelector('.hint-text').style.display = can ? '' : 'none';
  renderFiles();
}

// ==================== SEARCH / SORT ====================
D.search.addEventListener('input', () => { state.query = D.search.value.toLowerCase(); renderFiles(); });
D.sortSel.addEventListener('change', () => { state.sort = D.sortSel.value; localStorage.setItem('sort', state.sort); renderFiles(); });
D.sortSel.value = state.sort;

// ==================== INIT ====================
init();
