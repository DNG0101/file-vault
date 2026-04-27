// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const ST = {
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
  shareToken: null,
};

// ==================== DOM ====================
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
function getAuthHeaders() {
  const headers = {};
  if (ST.token) {
    if (ST.isAdmin) headers['X-Admin-Token'] = ST.token;
    else headers['X-User-Token'] = ST.token;
  }
  return headers;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  D.toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSz = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB','TB']; let i=0, s=b; while(s>=1024 && i<4) { s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const icn = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const prevType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// ==================== DARK MODE ====================
(function(){
  if(ST.dark) document.documentElement.setAttribute('data-theme','dark');
  D.btnDark.addEventListener('click', () => {
    ST.dark = !ST.dark;
    document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
    localStorage.setItem('darkMode', ST.dark);
    if (ST.token && ST.isAdmin) {
      fetch(`${WORKER_BASE}/admin/set-engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ engine: 'd1' })
      }).catch(e=>console.warn);
    }
  });
})();

// ==================== AUTH ====================
async function init() {
  const p = new URLSearchParams(location.search);
  const u = p.get('utoken'), e = p.get('auth_error'), share = p.get('share');
  if (share) {
    ST.shareToken = share;
    history.replaceState({}, '', location.pathname);
    await handleSharePreview();
    return;
  }
  if(e) { toast('Auth error: '+e.replace(/_/g,' '), 'error'); history.replaceState({},'',location.pathname); }
  if(u) { ST.token = u; localStorage.setItem('vtoken', u); history.replaceState({},'',location.pathname); await fetchUserInfo(); render(); return; }
  if(ST.token) { await fetchUserInfo(); render(); return; }
  showLogin();
}

async function handleSharePreview() {
  if (!ST.shareToken) return;
  const r = await fetch(`${WORKER_BASE}/share/verify?token=${ST.shareToken}`);
  if (!r.ok) {
    toast('Invalid or expired share link', 'error');
    showLogin();
    return;
  }
  const data = await r.json();
  D.grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px;">
      <div class="file-icon" style="font-size:4rem">${icn(data.mimeType)}</div>
      <h2>${esc(data.fileName)}</h2>
      <p>${fmtSz(data.fileSize)}</p>
      <button class="btn btn-primary" id="shareDownloadBtn">⬇ Download</button>
      <button class="btn btn-outline" onclick="location.href='/'">🔐 Login to Vault</button>
    </div>`;
  document.getElementById('shareDownloadBtn')?.addEventListener('click', () => {
    window.location.href = `${WORKER_BASE}/share/download?token=${ST.shareToken}`;
  });
  D.dropzone.style.display = 'none';
  document.querySelector('.hint-text').style.display = 'none';
  D.adminBar.classList.add('hidden');
  D.userUI.innerHTML = '';
}

async function fetchUserInfo() {
  if(!ST.token) return;
  const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`);
  if(!r.ok) { ST.token = null; localStorage.removeItem('vtoken'); return; }
  const i = await r.json();
  ST.email    = i.email;
  ST.isAdmin  = i.isAdmin === true;
  ST.approved = i.approved;
  ST.role     = i.role;
}

function showLogin() {
  D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
  D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>Welcome to File Vault</h2><p style="margin:16px 0;">Sign in to access your files.</p><button class="btn btn-primary" id="btnLogin">🔑 Login with Google</button></div>`;
  document.getElementById('btnLogin').onclick = async () => { const r = await fetch(`${WORKER_BASE}/auth-url`); window.location = (await r.json()).authUrl; };
}

function showPending() {
  D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
  D.dropzone.style.display = 'none';
  document.querySelector('.hint-text').style.display = 'none';
  D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>🔐 Waiting for Approval</h2><p>Your email: <strong>${ST.email}</strong></p><p>You will be notified automatically.</p><button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button><button class="btn btn-danger btn-sm" id="btnSelfRevoke" style="margin-left:8px;">❌ Cancel Request</button></div>`;
  document.getElementById('btnSelfRevoke').onclick = selfRevoke;
  startApprovalPoll();
}

function showMain() {
  document.querySelector('.hint-text').style.display = '';
  if(ST.isAdmin) {
    D.adminBar.classList.remove('hidden');
    D.userUI.innerHTML = '';
    D.dropzone.style.display = '';
  } else {
    D.adminBar.classList.add('hidden');
    const roleStr = ST.role ? ` (${ST.role})` : '';
    D.userUI.innerHTML = ST.email ? `<span style="font-size:0.85rem;">👤 ${ST.email}${roleStr} <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>` : '';
    const btn = document.getElementById('btnUserLogout'); if(btn) btn.onclick = userLogout;
  }
}

async function selfRevoke() {
  if(!confirm('Cancel your access request?')) return;
  await fetch(`${WORKER_BASE}/user-revoke-self`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({utoken: ST.token}) });
  ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Request cancelled.');
}

function userLogout() { ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Logged out.'); }

function render() {
  clearTimers();
  if(!ST.email) { showLogin(); return; }
  if(ST.isAdmin) { showMain(); fetchFiles(); startAdminPoll(); return; }
  if(!ST.approved) { showPending(); return; }
  showMain();
  applyRoleUI();
  fetchFiles();
  startRolePoll();
  startUserPoll();
}

function clearTimers() { ['role','approval','adminPoll','userPoll'].forEach(k => { if(ST.timers[k]) clearInterval(ST.timers[k]); }); }

// ==================== ADMIN BAR ====================
D.btnSync.addEventListener('click', syncFiles);
D.btnAppr.addEventListener('click', () => togglePanel(D.pnlAppr, loadPending));
D.btnAllUsers.addEventListener('click', () => togglePanel(D.pnlUsers, loadAllUsers));
D.btnLogs.addEventListener('click', () => togglePanel(D.pnlLogs, loadLogs));
D.btnAnalytics.addEventListener('click', () => togglePanel(D.pnlAnalytics, loadAnalytics));
D.btnShare.addEventListener('click', () => togglePanel(D.pnlShare, loadShares));
D.btnUnAuth.addEventListener('click', adminLogout);

function togglePanel(panel, loadFn) { panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) loadFn(); }

async function syncFiles() {
  toast('Syncing…','info');
  const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:getAuthHeaders()});
  if(r.ok) { await fetchFiles(); toast('Sync done','success'); } else toast('Sync failed','error');
}

async function adminLogout() {
  if(!confirm('Logout as admin? Vault will continue to work.')) return;
  localStorage.removeItem('vtoken'); ST.token = null; clearTimers(); showLogin(); toast('Admin logged out');
}

// ==================== PENDING / USERS ====================
async function loadPendingCount() {
  if (!ST.isAdmin) return;
  const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:getAuthHeaders()});
  const p = await r.json();
  D.pendingBadge.textContent = p.length; D.pendingBadge.classList.toggle('hidden', p.length===0);
}

function loadPending() {
  fetch(`${WORKER_BASE}/admin/pending`,{headers:getAuthHeaders()}).then(r=>r.json()).then(users => {
    D.listAppr.innerHTML = users.length ? users.map(u => `
      <div class="approval-item">
        <span>${u.email}</span>
        <div style="display:flex;gap:6px;">
          <select class="role-sel"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download Only</option><option value="read">Read Only</option><option value="none">None</option></select>
          <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-action="approve" data-email="${u.email}">✅ Approve</button>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-action="deny" data-email="${u.email}">❌ Deny</button>
        </div>
      </div>`).join('') : '<p>No pending users.</p>';
    D.listAppr.addEventListener('click', pendingHandler);
  });
}

async function pendingHandler(ev) {
  const btn = ev.target.closest('button'); if(!btn) return;
  const action = btn.dataset.action, email = btn.dataset.email;
  if(action === 'approve') {
    const role = btn.parentElement.querySelector('.role-sel').value;
    await fetch(`${WORKER_BASE}/admin/approve`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email,role})});
    toast(`${email} approved`);
  } else {
    await fetch(`${WORKER_BASE}/admin/deny`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email})});
    toast(`${email} denied`);
  }
  loadPending(); loadPendingCount(); loadAllUsers();
}

function loadAllUsers() {
  fetch(`${WORKER_BASE}/admin/users/all`,{headers:getAuthHeaders()}).then(r=>r.json()).then(users => {
    const active = users.filter(u=>u.status!=='revoked'), revoked = users.filter(u=>u.status==='revoked');
    let html = active.map(u => `
      <div class="approval-item">
        <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role?`(${u.role})`:''}</span>
        <div style="display:flex;gap:6px;">
          ${u.status==='pending'?`<select class="role-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select><button class="btn btn-sm btn-success" data-action="approve" data-email="${u.email}">✅ Approve</button>`:''}
          ${u.status==='approved'?`<select class="role-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="upload" ${u.role==='upload'?'selected':''}>Upload Only</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select><button class="btn btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button><button class="btn btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>`:''}
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
    D.listUsers.addEventListener('click', usersHandler);
  });
}

async function usersHandler(ev) {
  const btn = ev.target.closest('button'); if(!btn) return;
  const action = btn.dataset.action, email = btn.dataset.email;
  if(['approve','reapprove','update'].includes(action)) {
    const sel = btn.closest('.approval-item').querySelector('select');
    const role = sel ? sel.value : 'full';
    const endpoint = action==='reapprove'?'reapprove':'approve';
    await fetch(`${WORKER_BASE}/admin/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email,role})});
    toast(`${email} updated`);
  } else if(action==='revoke') {
    await fetch(`${WORKER_BASE}/admin/revoke`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email})});
    toast(`${email} revoked`);
  }
  loadAllUsers(); if(['approve','reapprove'].includes(action)) loadPendingCount();
}

// ==================== LOGS / ANALYTICS / SHARES ====================
function loadLogs() { fetch(`${WORKER_BASE}/admin/logs?limit=100`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d=>{ D.logsCt.innerHTML = d.logs.length ? d.logs.map(l=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;"><strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} <span style="color:var(--accent)">${l.action}</span> ${l.target||''}</div>`).join('') : '<p>No logs yet.</p>'; }); }
D.btnClearLogs.addEventListener('click', async () => { if(!confirm('Delete all audit logs?')) return; await fetch(`${WORKER_BASE}/admin/logs/clear`,{method:'POST',headers:getAuthHeaders()}); loadLogs(); toast('Logs cleared'); });
function loadAnalytics() { fetch(`${WORKER_BASE}/admin/analytics`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d=>{ D.analyticsCt.innerHTML = `<p><strong>Files:</strong> ${d.files.total} (${fmtSz(d.files.totalSize)})</p><p><strong>Users:</strong> ${d.users.total}</p>`; }); }
function loadShares() { D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'; }

// ==================== FILE LIST & ACTIONS ====================
async function fetchFiles() { try { const r = await fetch(`${WORKER_BASE}/list`, { headers: getAuthHeaders() }); if(!r.ok) throw new Error('Failed'); const { files } = await r.json(); ST.files = files; renderFiles(); } catch(e) { console.error(e); toast('Failed to load files', 'error'); } }

function renderFiles() {
  let list = [...ST.files];
  if(ST.query) list = list.filter(f => f.name.toLowerCase().includes(ST.query));
  const s = ST.sort;
  list.sort((a,b) => { switch(s) { case 'newest': return b.createdAt - a.createdAt; case 'oldest': return a.createdAt - b.createdAt; case 'name-asc': return a.name.localeCompare(b.name); case 'name-desc': return b.name.localeCompare(a.name); case 'size-desc': return b.size - a.size; case 'size-asc': return a.size - b.size; default: return 0; } });
  D.grid.innerHTML = '';
  if(!list.length) { D.grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:30px;">No files yet.</p>'; return; }
  list.forEach(f => {
    const actions = getFileActions(f.publicId);
    const upBy = f.uploadedBy ? `<div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:4px;">📤 ${f.uploadedBy}</div>` : '';
    const card = document.createElement('div');
    card.className = `card${ST.sel.has(f.publicId)?' selected':''}`;
    card.dataset.publicId = f.publicId;
    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${ST.sel.has(f.publicId)?'checked':''}>
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
  if(ST.isAdmin) return ['play','preview','download','rename','share','delete','replace'];
  if(!ST.role) return [];
  const file = ST.files.find(f=>f.publicId===pid);
  if(!file) return [];
  const a = [];
  const pt = prevType(file.mimeType);
  if((pt==='video'||pt==='audio') && ['full','delete','upload','download','read'].includes(ST.role)) a.push('play');
  if(['image','pdf','text'].includes(pt) && ['full','delete','upload','download','read'].includes(ST.role)) a.push('preview');
  if(['full','delete','upload','download'].includes(ST.role)) a.push('download');
  if(['full'].includes(ST.role)) a.push('rename','share');
  if(['full','delete'].includes(ST.role)) a.push('delete');
  if(ST.role==='full') a.push('replace');
  return a;
}

// ==================== FILE GRID EVENTS ====================
D.grid.addEventListener('click', ev => {
  const btn = ev.target.closest('button');
  if(btn) { ev.stopPropagation(); const action = btn.dataset.action, id = btn.dataset.id; if(action) fileAction(action, id); return; }
  const card = ev.target.closest('.card');
  if(card) { const cb = card.querySelector('.card-checkbox'); if(cb && ev.target !== cb) toggleSelect(card.dataset.publicId, !cb.checked); }
});
D.grid.addEventListener('change', ev => { const cb = ev.target.closest('.card-checkbox'); if(cb) toggleSelect(cb.dataset.id, cb.checked); });

function toggleSelect(id, checked) { if(checked) ST.sel.add(id); else ST.sel.delete(id); updateBulkBar(); document.querySelector(`.card[data-public-id="${id}"]`)?.classList.toggle('selected', checked); }
function updateBulkBar() { if(ST.sel.size) { D.bulkBar.classList.remove('hidden'); D.bulkCnt.textContent = `${ST.sel.size} selected`; } else D.bulkBar.classList.add('hidden'); }
$('btnBulkCancel').addEventListener('click', () => { ST.sel.clear(); renderFiles(); updateBulkBar(); });
$('btnBulkDelete').addEventListener('click', async () => {
  if(!confirm(`Delete ${ST.sel.size} files?`)) return;
  const ids = Array.from(ST.sel);
  const r = await fetch(`${WORKER_BASE}/bulk-delete`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicIds:ids})});
  const d = await r.json(); ST.sel.clear(); updateBulkBar(); await fetchFiles();
  toast(`${d.deleted} deleted, ${d.failed} failed`);
});

function fileAction(action, id) {
  switch(action) {
    case 'play': openPreview(id, 'video'); break;
    case 'preview': openPreview(id, prevType(ST.files.find(f=>f.publicId===id)?.mimeType)); break;
    case 'download': downloadFile(id); break;
    case 'delete': deleteFile(id); break;
    case 'replace': replaceFile(id); break;
    case 'rename': renameFile(id); break;
    case 'share': shareFile(id); break;
  }
}

// ==================== UPLOAD ====================
async function uploadFile(file, existPid = null) {
  if(ST.uploadCtrl) ST.uploadCtrl.abort();
  ST.uploadCtrl = new AbortController(); const sig = ST.uploadCtrl.signal;
  D.progBox.classList.remove('hidden');
  try {
    let pid = existPid;
    if(!pid) {
      const ir = await fetch(`${WORKER_BASE}/upload-init`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'}),signal:sig});
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
        const cr = await fetch(`${WORKER_BASE}/upload-chunk/${pid}`,{method:'PUT',headers:{'Content-Range':`bytes ${up}-${end}/${file.size}`,...getAuthHeaders()},body:chunk,signal:sig});
        const d = await cr.json();
        if(cr.ok) {
          if(d.complete === true || d.status === 'complete') { done = true; break; }
          if(typeof d.uploadedBytes === 'number') { up = d.uploadedBytes; updateProg(up, file.size); }
          done = true;
        } else { if(retries <= 0) throw new Error(d.error || 'Chunk error'); await sleep(1000); }
      }
      if(done && up >= file.size) break;
      if(!done) { const sr = await fetch(`${WORKER_BASE}/upload-status/${pid}`,{headers:getAuthHeaders(),signal:sig}); if(sr.ok) { const s = await sr.json(); up = s.uploadedBytes || up; updateProg(up, file.size); } }
    }
    toast(`${file.name} uploaded`, 'success');
    await fetchFiles();
  } catch(err) { if(err.message!=='Cancelled') toast(`Upload failed: ${err.message}`, 'error'); }
  finally { D.progBox.classList.add('hidden'); ST.uploadCtrl = null; }
}

function updateProg(u,t) { const p = Math.round(u/t*100); D.progFill.style.width = p+'%'; D.pctDisp.textContent = p+'%'; D.sizeDisp.textContent = `${fmtSz(u)} / ${fmtSz(t)}`; }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
D.cancelBtn.addEventListener('click', () => { if(ST.uploadCtrl) { ST.uploadCtrl.abort(); ST.uploadCtrl = null; D.progBox.classList.add('hidden'); } });

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
  else if(type==='text') { fetch(url, { headers: getAuthHeaders() }).then(r=>r.text()).then(t=>{ const pre = document.createElement('pre'); pre.textContent = t; D.prevCont.appendChild(pre); }); }
  else { downloadFile(pid); return; }
  D.prevOv.classList.remove('hidden');
}
function closePreview() { D.prevCont.innerHTML = ''; D.prevOv.classList.add('hidden'); if(document.fullscreenElement) document.exitFullscreen(); }
D.btnCloseP.addEventListener('click', closePreview);
D.btnFull.addEventListener('click', () => { if(document.fullscreenElement) document.exitFullscreen(); else D.prevOv.requestFullscreen(); });

// ==================== CRUD ====================
function downloadFile(pid) { window.location.href = `${WORKER_BASE}/download/${pid}`; }
async function deleteFile(pid) {
  if(!confirm('Delete?')) return;
  const r = await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid})});
  if(r.ok) { ST.files = ST.files.filter(f=>f.publicId!==pid); ST.sel.delete(pid); renderFiles(); updateBulkBar(); toast('Deleted','success'); } else toast('Delete failed','error');
}
function replaceFile(pid) {
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async () => {
    const file = inp.files[0]; if(!file) return;
    const ir = await fetch(`${WORKER_BASE}/update`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'})});
    if(!ir.ok) { toast('Update init failed','error'); return; }
    const {publicId} = await ir.json();
    await uploadFile(file, publicId); await fetchFiles();
  };
  inp.click();
}
async function renameFile(pid) {
  const file = ST.files.find(f=>f.publicId===pid); if(!file) return;
  const newName = prompt('New name:', file.name); if(!newName||newName===file.name) return;
  const r = await fetch(`${WORKER_BASE}/rename`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,newName})});
  if(r.ok) { toast('Renamed'); await fetchFiles(); } else toast('Rename failed','error');
}
async function shareFile(pid) {
  const label = prompt('Share label (optional):',''), expires = prompt('Expires in hours (default 1):','1'), maxDownloads = parseInt(prompt('Max downloads (0=unlimited):','0'),10);
  const r = await fetch(`${WORKER_BASE}/share/create`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,expiresIn:(parseInt(expires||'1',10)*3600),maxDownloads,label})});
  const d = await r.json();
  if(r.ok) { toast('Share link created!'); navigator.clipboard.writeText(d.shareUrl).then(()=>toast('Link copied!')); } else toast('Share failed','error');
}

// ==================== POLLING ====================
function startRolePoll() { if(ST.timers.role) clearInterval(ST.timers.role); ST.timers.role = setInterval(async () => { if(!ST.token||!ST.approved) return; const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`); if(!r.ok) return; const i = await r.json(); if(i.role !== ST.role) { ST.role = i.role; applyRoleUI(); toast(`Permissions changed to ${ST.role}`); } }, 8000); }
function startApprovalPoll() { if(ST.timers.approval) clearInterval(ST.timers.approval); ST.timers.approval = setInterval(async () => { if(!ST.token) return; const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`); if(!r.ok) return; const i = await r.json(); if(i.approved) { ST.approved = true; ST.role = i.role; clearInterval(ST.timers.approval); toast('Approved!','success'); render(); } }, 10000); }
function startAdminPoll() { if(ST.timers.adminPoll) clearInterval(ST.timers.adminPoll); let lastTs = 0; const poll = async () => { if(!ST.token||!ST.isAdmin) return; const r = await fetch(`${WORKER_BASE}/admin/poll?since=${lastTs}&timeout=15`,{headers:getAuthHeaders()}); const d = await r.json(); if(d.changed) { lastTs = d.ts; loadPendingCount(); if(!D.pnlAppr.classList.contains('hidden')) loadPending(); if(!D.pnlUsers.classList.contains('hidden')) loadAllUsers(); if(!D.pnlLogs.classList.contains('hidden')) loadLogs(); } ST.timers.adminPoll = setTimeout(poll, 2000); }; poll(); }
function startUserPoll() { if(ST.timers.userPoll) clearInterval(ST.timers.userPoll); let lastTs = 0; const poll = async () => { if(!ST.token||!ST.approved) return; const r = await fetch(`${WORKER_BASE}/poll?utoken=${ST.token}&since=${lastTs}&timeout=15`, { headers: getAuthHeaders() }); const d = await r.json(); if(d.changed) { lastTs = d.ts; fetchFiles(); } ST.timers.userPoll = setTimeout(poll, 2000); }; poll(); }
function applyRoleUI() { const can = ST.role==='full'||ST.role==='delete'||ST.role==='upload'||ST.role==='download'; D.dropzone.style.display = can ? '' : 'none'; document.querySelector('.hint-text').style.display = can ? '' : 'none'; renderFiles(); }

// ==================== SEARCH / SORT / DRAG & DROP ====================
D.search.addEventListener('input', () => { ST.query = D.search.value.toLowerCase(); renderFiles(); });
D.sortSel.addEventListener('change', () => { ST.sort = D.sortSel.value; localStorage.setItem('sort', ST.sort); renderFiles(); });
D.sortSel.value = ST.sort;

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  D.dropzone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
['dragenter', 'dragover'].forEach(eventName => { D.dropzone.addEventListener(eventName, () => D.dropzone.classList.add('dragover'), false); });
['dragleave', 'drop'].forEach(eventName => { D.dropzone.addEventListener(eventName, () => D.dropzone.classList.remove('dragover'), false); });
D.dropzone.addEventListener('drop', handleDrop, false);
function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length) handleFiles(files);
}
D.fileInp.addEventListener('change', (e) => handleFiles(e.target.files));
D.dropzone.addEventListener('click', () => D.fileInp.click());
function handleFiles(files) { for (const file of files) uploadFile(file); }

// Paste upload
document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file') {
      const file = items[i].getAsFile();
      if (file) uploadFile(file);
      break;
    }
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'u') { e.preventDefault(); D.fileInp.click(); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); D.search.focus(); }
  if (e.key === 'Escape') closePreview();
});

// ==================== INIT ====================
init();
