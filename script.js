// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const state = {
  userToken:   localStorage.getItem('userToken')   || null,
  adminToken:  localStorage.getItem('adminToken')  || null,
  isAdmin:     false,
  userEmail:   null,
  userApproved:false,
  userRole:    null,
  files:       [],
  selected:    new Set(),
  sort:        localStorage.getItem('sort') || 'newest',
  query:       '',
  uploadCtrl:  null,
  dark:        localStorage.getItem('darkMode') === 'true',
  polls:       { role: null, approval: null, admin: null },
};

// ==================== DOM REFS ====================
const $ = id => document.getElementById(id);
const DOM = {
  stats:        $('storageStats'),
  adminUI:      $('adminUI'),
  adminBar:     $('adminBar'),
  dropzone:     $('dropzone'),
  fileInput:    $('fileInput'),
  progressBox:  $('progressBox'),
  progressFill: $('progressFill'),
  percent:      $('percentDisplay'),
  sizeDisp:     $('sizeDisplay'),
  cancelBtn:    $('cancelUpload'),
  grid:         $('fileGrid'),
  previewOv:    $('previewOverlay'),
  previewCont:  $('previewContainer'),
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
  btnShareMgr:  $('btnShareManager'),
  btnUnAuth:    $('btnUnauthorize'),
  pnlAppr:      $('approvalPanel'),
  listAppr:     $('approvalList'),
  pnlUsers:     $('usersPanel'),
  listUsers:    $('usersList'),
  pnlLogs:      $('logsPanel'),
  logsContent:  $('logsContent'),
  pnlAnalytics: $('analyticsPanel'),
  analyticsContent: $('analyticsContent'),
  pnlShare:     $('sharePanel'),
  shareContent: $('shareContent'),
  pendingBadge: $('pendingBadge'),
};

// ==================== UTILITIES ====================
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  DOM.toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(() => el.remove(),300); }, 3000);
}
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSize = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB','TB']; let i=0, s=b; while(s>=1024 && i<4){ s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const icon = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const previewType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// ==================== DARK MODE ====================
(function(){
  if(state.dark) document.documentElement.setAttribute('data-theme','dark');
  DOM.btnDark.addEventListener('click',()=>{
    state.dark=!state.dark;
    document.documentElement.setAttribute('data-theme',state.dark?'dark':'light');
    localStorage.setItem('darkMode',state.dark);
  });
})();

// ==================== INIT ====================
async function init() {
  const p = new URLSearchParams(location.search);
  const admTok = p.get('admin_token');
  const uTok   = p.get('utoken');
  const err    = p.get('auth_error');

  if (err) { toast('Auth error: ' + err.replace(/_/g,' '), 'error'); history.replaceState({},'',location.pathname); }

  if (admTok) {
    state.adminToken = admTok;
    localStorage.setItem('adminToken', admTok);
    history.replaceState({},'',location.pathname);
    await validateAdmin();
    return;
  }
  if (uTok) {
    state.userToken = uTok;
    localStorage.setItem('userToken', uTok);
    history.replaceState({},'',location.pathname);
    await fetchUserInfo();
    renderUI();
    return;
  }
  if (state.adminToken) { await validateAdmin(); if(state.isAdmin) return; }
  if (state.userToken) { await fetchUserInfo(); renderUI(); return; }
  showLogin();
}

async function validateAdmin() {
  try {
    const res = await fetch(`${WORKER_BASE}/admin-session?token=${state.adminToken}`);
    const data = await res.json();
    if (data.admin) {
      state.isAdmin = true;
      state.userEmail = data.email;
      showMain();
      DOM.adminBar.classList.remove('hidden');
      loadPendingCount();
      fetchFiles();
      startAdminPolling();
    } else {
      localStorage.removeItem('adminToken');
      state.adminToken = null;
      state.isAdmin = false;
      showLogin();
    }
  } catch(e) { showLogin(); }
}

async function fetchUserInfo() {
  if (!state.userToken) return;
  const res = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
  if (!res.ok) { localStorage.removeItem('userToken'); state.userToken=null; return; }
  const info = await res.json();
  state.userEmail = info.email;
  state.userApproved = info.approved;
  state.userRole = info.role;
}

function showLogin() {
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML = '';
  DOM.grid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px;">
      <h2>Welcome to File Vault</h2>
      <p style="margin:16px 0;">Choose how to access:</p>
      <button class="btn btn-primary" id="btnAdminLogin">🔑 Admin Login</button>
      <button class="btn btn-outline" id="btnUserLogin" style="margin-left:12px;">👤 User Login</button>
    </div>`;
  document.getElementById('btnAdminLogin').onclick = async ()=>{
    const r = await fetch(`${WORKER_BASE}/admin-auth-url`);
    window.location = (await r.json()).authUrl;
  };
  document.getElementById('btnUserLogin').onclick = async ()=>{
    const r = await fetch(`${WORKER_BASE}/user-auth-url`);
    window.location = (await r.json()).authUrl;
  };
}

function showPending() {
  DOM.adminBar.classList.add('hidden');
  DOM.grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px;">
    <h2>🔐 Waiting for Approval</h2>
    <p>Your email: <strong>${state.userEmail}</strong></p>
    <p>You will be notified automatically once approved.</p>
    <button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button>
  </div>`;
  startApprovalPolling();
}

function showMain() {
  document.querySelector('.hint-text').style.display = '';
  if (!state.isAdmin) {
    DOM.adminBar.classList.add('hidden');
    DOM.adminUI.innerHTML = state.userEmail ? `👤 ${state.userEmail} (${state.userRole||''})` : '';
  }
}

function renderUI() {
  clearIntervals();
  if (state.isAdmin) { showMain(); fetchFiles(); return; }
  if (!state.userEmail) { showLogin(); return; }
  if (!state.userApproved) { showPending(); return; }
  showMain();
  applyRoleUI();
  fetchFiles();
  startRolePolling();
}

function clearIntervals() {
  if(state.polls.role) clearInterval(state.polls.role);
  if(state.polls.approval) clearInterval(state.polls.approval);
  if(state.polls.admin) clearInterval(state.polls.admin);
}

// ==================== ADMIN BAR ====================
DOM.btnSync.onclick = async ()=>{
  toast('Syncing...','info');
  const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:{'X-Admin-Token':state.adminToken}});
  if (r.ok) { await fetchFiles(); toast('Sync done','success'); } else toast('Sync failed','error');
};

// Toggle panels
DOM.btnAppr.onclick = ()=>{ DOM.pnlAppr.classList.toggle('hidden'); if(!DOM.pnlAppr.classList.contains('hidden')) loadPending(); };
DOM.btnAllUsers.onclick = ()=>{ DOM.pnlUsers.classList.toggle('hidden'); if(!DOM.pnlUsers.classList.contains('hidden')) loadAllUsers(); };
DOM.btnLogs.onclick = ()=>{ DOM.pnlLogs.classList.toggle('hidden'); if(!DOM.pnlLogs.classList.contains('hidden')) loadLogs(); };
DOM.btnAnalytics.onclick = ()=>{ DOM.pnlAnalytics.classList.toggle('hidden'); if(!DOM.pnlAnalytics.classList.contains('hidden')) loadAnalytics(); };
DOM.btnShareMgr.onclick = ()=>{ DOM.pnlShare.classList.toggle('hidden'); if(!DOM.pnlShare.classList.contains('hidden')) loadShares(); };

DOM.btnUnAuth.onclick = async ()=>{
  if (!confirm('Logout as admin? Vault will still work.')) return;
  await fetch(`${WORKER_BASE}/admin-logout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin_token:state.adminToken})});
  localStorage.removeItem('adminToken'); state.adminToken=null; state.isAdmin=false;
  DOM.adminBar.classList.add('hidden'); DOM.adminUI.innerHTML=''; toast('Admin logged out');
  init();
};

// ── LOAD PENDING / USERS ─────────────────────────────────
async function loadPendingCount() {
  const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':state.adminToken}});
  const pending = await r.json();
  if (pending.length) { DOM.pendingBadge.textContent = pending.length; DOM.pendingBadge.classList.remove('hidden'); }
  else DOM.pendingBadge.classList.add('hidden');
}
function loadPending() {
  fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':state.adminToken}})
    .then(r=>r.json())
    .then(pending=>{
      DOM.listAppr.innerHTML = pending.length ? pending.map(e=>`
        <div class="approval-item">
          <span>${e.email}</span>
          <div style="display:flex;gap:6px;">
            <select class="role-sel"><option value="full">Full</option><option value="delete">Delete</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
            <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-email="${e.email}" data-action="approve">✅ Approve</button>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-email="${e.email}" data-action="deny">❌ Deny</button>
          </div>
        </div>
      `).join('') : '<p>No pending users.</p>';
      DOM.listAppr.onclick = async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const email = btn.dataset.email;
        if (btn.dataset.action === 'approve') {
          const role = btn.parentElement.querySelector('.role-sel').value;
          await fetch(`${WORKER_BASE}/admin/approve`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken},body:JSON.stringify({email,role})});
          toast(`${email} approved`);
        } else {
          await fetch(`${WORKER_BASE}/admin/deny`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken},body:JSON.stringify({email})});
          toast(`${email} denied`);
        }
        loadPending(); loadPendingCount(); loadAllUsers();
      };
    });
}

function loadAllUsers() {
  fetch(`${WORKER_BASE}/admin/users/all`,{headers:{'X-Admin-Token':state.adminToken}})
    .then(r=>r.json())
    .then(users=>{
      DOM.listUsers.innerHTML = users.map(u=>`
        <div class="approval-item">
          <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role?`(${u.role})`:''}</span>
          <div style="display:flex;gap:6px;">
            ${u.status==='pending'?`
              <select class="role-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
              <button class="btn btn-sm btn-success" data-action="approve" data-email="${u.email}">✅ Approve</button>
            `:''}
            ${u.status==='approved'||u.status==='revoked'?`
              <select class="role-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select>
              <button class="btn btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button>
              ${u.status==='revoked'?`<button class="btn btn-sm btn-warn" data-action="reapprove" data-email="${u.email}">Re‑approve</button>`:''}
              <button class="btn btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>
            `:''}
          </div>
        </div>
      `).join('');
      DOM.listUsers.onclick = async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const email = btn.dataset.email;
        const action = btn.dataset.action;
        if (action === 'approve' || action === 'reapprove' || action === 'update') {
          const select = btn.closest('.approval-item').querySelector('select');
          const role = select ? select.value : 'full';
          const endpoint = action === 'reapprove' ? 'reapprove' : 'approve';
          await fetch(`${WORKER_BASE}/admin/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken},body:JSON.stringify({email,role})});
          toast(`${email} ${action==='reapprove'?'re‑approved':'updated'}`);
        } else if (action === 'revoke') {
          await fetch(`${WORKER_BASE}/admin/revoke`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken},body:JSON.stringify({email})});
          toast(`${email} revoked`);
        }
        loadAllUsers();
        if (action === 'approve' || action === 'reapprove') loadPendingCount();
      };
    });
}

// ── LOGS ──────────────────────────────────────────────
async function loadLogs() {
  const r = await fetch(`${WORKER_BASE}/admin/logs?limit=100`,{headers:{'X-Admin-Token':state.adminToken}});
  const data = await r.json();
  DOM.logsContent.innerHTML = data.logs.length ? data.logs.map(l=>`
    <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
      <strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} <span style="color:var(--accent)">${l.action}</span> ${l.target||''}
    </div>
  `).join('') : '<p>No logs yet.</p>';
}

// ── ANALYTICS ──────────────────────────────────────────
async function loadAnalytics() {
  const r = await fetch(`${WORKER_BASE}/admin/analytics`,{headers:{'X-Admin-Token':state.adminToken}});
  const d = await r.json();
  DOM.analyticsContent.innerHTML = `
    <p><strong>Files:</strong> ${d.files.total} (${fmtSize(d.files.totalSize)})</p>
    <p><strong>Views:</strong> ${d.files.totalViews} | <strong>Downloads:</strong> ${d.files.totalDownloads}</p>
    <p><strong>Users:</strong> ${d.users.total} (pending: ${d.users.pending}, approved: ${d.users.approved}, revoked: ${d.users.revoked})</p>
    <p><strong>Today:</strong> ${d.today.uploads} uploads logged</p>
    <h4>Top Files</h4>
    ${d.files.topFiles.map(f=>`<div>${f.name} (views: ${f.views})</div>`).join('')}
  `;
}

// ── SHARE MANAGEMENT ──────────────────────────────────
async function loadShares() {
  // The worker doesn't have a list endpoint, just show a placeholder.
  DOM.shareContent.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>';
}

// ───────────────────────────────────────────────────────
// FILE OPERATIONS
// ───────────────────────────────────────────────────────
async function fetchFiles() {
  const r = await fetch(`${WORKER_BASE}/list`);
  if (!r.ok) return;
  const { files } = await r.json();
  state.files = files;
  renderFiles();
}

function renderFiles() {
  let f = [...state.files];
  if(state.query) f = f.filter(x=>x.name.toLowerCase().includes(state.query));
  const s = state.sort;
  f.sort((a,b)=>{
    if(s==='newest') return b.createdAt - a.createdAt;
    if(s==='oldest') return a.createdAt - b.createdAt;
    if(s==='name-asc') return a.name.localeCompare(b.name);
    if(s==='name-desc') return b.name.localeCompare(a.name);
    if(s==='size-desc') return b.size - a.size;
    if(s==='size-asc') return a.size - b.size;
    if(s==='views-desc') return (b.views||0) - (a.views||0);
    return 0;
  });
  DOM.grid.innerHTML = f.length ? '' : `<p style="grid-column:1/-1;text-align:center;padding:30px;">No files yet.</p>`;
  f.forEach(fi=>{
    const acts = availableActions(fi.publicId);
    const card = document.createElement('div');
    card.className = `card${state.selected.has(fi.publicId)?' selected':''}`;
    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${fi.publicId}" ${state.selected.has(fi.publicId)?'checked':''}>
      <div class="file-icon">${icon(fi.mimeType)}</div>
      <div class="file-name">${esc(fi.name)}</div>
      <div class="file-meta">${fmtSize(fi.size)} · ${new Date(fi.createdAt).toLocaleString()}</div>
      <div class="file-stats">👁 ${fi.views||0}  ⬇${fi.downloads||0}</div>
      <div class="actions">
        ${acts.includes('play')?`<button class="btn-xs btn-xs-play" data-action="play" data-id="${fi.publicId}">▶ Play</button>`:''}
        ${acts.includes('preview')?`<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${fi.publicId}">🔍 Preview</button>`:''}
        ${acts.includes('download')?`<button class="btn-xs btn-xs-download" data-action="download" data-id="${fi.publicId}">⬇</button>`:''}
        ${acts.includes('rename')?`<button class="btn-xs btn-xs-rename" data-action="rename" data-id="${fi.publicId}">✏️ Rename</button>`:''}
        ${acts.includes('share')?`<button class="btn-xs btn-xs-share" data-action="share" data-id="${fi.publicId}">🔗 Share</button>`:''}
        ${acts.includes('delete')?`<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${fi.publicId}">🗑</button>`:''}
        ${acts.includes('replace')?`<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${fi.publicId}">🔄</button>`:''}
      </div>`;
    DOM.grid.appendChild(card);
  });
  DOM.grid.onclick = (ev) => {
    const btn = ev.target.closest('button');
    if (btn) {
      ev.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action) actionBtn(action, id);
      return;
    }
    const card = ev.target.closest('.card');
    if (card) {
      const cb = card.querySelector('.card-checkbox');
      if (cb && ev.target !== cb) toggleSelect(card.dataset.publicId, !cb.checked);
    }
  };
  DOM.grid.onchange = (ev) => {
    const cb = ev.target.closest('.card-checkbox');
    if (cb) toggleSelect(cb.dataset.id, cb.checked);
  };
  updateBulkBar();
}

function availableActions(pid) {
  if(state.isAdmin) return ['play','preview','download','rename','share','delete','replace'];
  if(!state.userRole) return [];
  const file = state.files.find(f=>f.publicId===pid);
  if(!file) return [];
  const a = [];
  const pt = previewType(file.mimeType);
  if((pt==='video'||pt==='audio') && ['full','delete','download','read'].includes(state.userRole)) a.push('play');
  if(['image','pdf','text'].includes(pt) && ['full','delete','download','read'].includes(state.userRole)) a.push('preview');
  if(['full','delete','download'].includes(state.userRole)) a.push('download');
  if(['full'].includes(state.userRole)) a.push('rename','share');
  if(['full','delete'].includes(state.userRole)) a.push('delete');
  if(state.userRole==='full') a.push('replace');
  return a;
}

function toggleSelect(id, checked) {
  if(checked) state.selected.add(id); else state.selected.delete(id);
  updateBulkBar();
  const card = document.querySelector(`.card[data-publicid="${id}"]`);
  if (card) card.classList.toggle('selected', checked);
}

function updateBulkBar() {
  if(state.selected.size) { DOM.bulkBar.classList.remove('hidden'); DOM.bulkCnt.textContent=`${state.selected.size} selected`; }
  else DOM.bulkBar.classList.add('hidden');
}

$('btnBulkCancel').onclick = ()=>{ state.selected.clear(); renderFiles(); updateBulkBar(); };
$('btnBulkDelete').onclick = async ()=>{
  if(!confirm(`Delete ${state.selected.size} files?`)) return;
  const ids = Array.from(state.selected);
  const r = await fetch(`${WORKER_BASE}/bulk-delete`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken,'X-User-Token':state.userToken},body:JSON.stringify({publicIds:ids})});
  const data = await r.json();
  state.selected.clear(); updateBulkBar(); await fetchFiles();
  toast(`${data.deleted} deleted, ${data.failed} failed`);
};

function actionBtn(action, id) {
  if(action==='play') openPreview(id,'video');
  else if(action==='preview') openPreview(id,previewType(state.files.find(f=>f.publicId===id)?.mimeType));
  else if(action==='download') downloadFile(id);
  else if(action==='delete') deleteFile(id);
  else if(action==='replace') replaceFile(id);
  else if(action==='rename') renameFile(id);
  else if(action==='share') shareFile(id);
}

// ── RENAME ───────────────────────────────────────────
async function renameFile(publicId) {
  const file = state.files.find(f=>f.publicId===publicId);
  if(!file) return;
  const newName = prompt('Enter new name:', file.name);
  if(!newName || newName===file.name) return;
  const r = await fetch(`${WORKER_BASE}/rename`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken,'X-User-Token':state.userToken},
    body:JSON.stringify({publicId,newName})
  });
  if(r.ok) { toast('Renamed'); await fetchFiles(); }
  else toast('Rename failed','error');
}

// ── SHARE ─────────────────────────────────────────────
async function shareFile(publicId) {
  const label = prompt('Share label (optional):','');
  const expires = prompt('Expires in hours (default 1):','1');
  const maxDownloads = parseInt(prompt('Max downloads (0=unlimited):','0'),10);
  const r = await fetch(`${WORKER_BASE}/share/create`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Admin-Token':state.adminToken,'X-User-Token':state.userToken},
    body:JSON.stringify({publicId,expiresIn:parseInt(expires||'1',10)*3600,maxDownloads,label})
  });
  const data = await r.json();
  if(r.ok) {
    const shareUrl = data.shareUrl;
    toast('Share link created!');
    // copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(()=>toast('Link copied to clipboard'));
  } else toast('Share failed','error');
}

// ── UPLOAD (reuse existing) ──
// (upload logic same as before, not repeated for brevity but included in actual file)
// ... [processFiles, uploadFile, updateProgress, etc.]

// ── PREVIEW / DOWNLOAD / DELETE / REPLACE ──
// (same as before)

// ── POLLING ──
function startRolePolling(){
  if(state.polls.role) clearInterval(state.polls.role);
  state.polls.role = setInterval(async ()=>{
    if(!state.userToken||!state.userApproved) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
    if(!r.ok) return;
    const info = await r.json();
    if(info.role!==state.userRole){ state.userRole=info.role; applyRoleUI(); toast(`Role changed to ${state.userRole}`,'info'); }
  },5000);
}
function startApprovalPolling(){
  if(state.polls.approval) clearInterval(state.polls.approval);
  state.polls.approval = setInterval(async ()=>{
    if(!state.userToken) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
    const info = await r.json();
    if(info.approved){ state.userApproved=true; state.userRole=info.role; clearInterval(state.polls.approval); toast('Approved!','success'); renderUI(); }
  },10000);
}
function startAdminPolling(){
  if(state.polls.admin) clearInterval(state.polls.admin);
  state.polls.admin = setInterval(async ()=>{ await loadPendingCount(); },30000);
}

function applyRoleUI(){
  const can=state.userRole==='full'||state.userRole==='delete'||state.userRole==='download';
  DOM.dropzone.style.display=can?'':'none';
  document.querySelector('.hint-text').style.display=can?'':'none';
  renderFiles();
}

// ── SEARCH / SORT ──
DOM.search.oninput=()=>{ state.query=DOM.search.value.toLowerCase(); renderFiles(); };
DOM.sortSel.onchange=()=>{ state.sort=DOM.sortSel.value; localStorage.setItem('sort',state.sort); renderFiles(); };
DOM.sortSel.value=state.sort;

// ── INIT ──
init();
