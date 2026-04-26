// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';  // ← YOUR WORKER DOMAIN

// ==================== STATE ====================
const ST = {
  userToken:   localStorage.getItem('userToken') || null,
  adminToken:  localStorage.getItem('adminToken') || null,
  isAdmin: false,
  userEmail: null,
  approved: false,
  role: null,
  files: [],
  sel: new Set(),
  sort: localStorage.getItem('sort') || 'newest',
  query: '',
  uploadCtrl: null,
  dark: localStorage.getItem('darkMode') === 'true',
  timers: { role: null, approval: null, adminPoll: null, userPoll: null },
};

// ==================== DOM ====================
const $ = id => document.getElementById(id);
const D = {
  stats: $('storageStats'), adminUI: $('adminUI'), userUI: $('userUI'), adminBar: $('adminBar'),
  dropzone: $('dropzone'), fileInp: $('fileInput'), progBox: $('progressBox'),
  progFill: $('progressFill'), pctDisp: $('percentDisplay'), sizeDisp: $('sizeDisplay'),
  cancelBtn: $('cancelUpload'), grid: $('fileGrid'),
  prevOv: $('previewOverlay'), prevCont: $('previewContainer'),
  btnFull: $('btnFullscreen'), btnCloseP: $('btnClosePreview'),
  search: $('searchInput'), sortSel: $('sortSelect'),
  bulkBar: $('bulkBar'), bulkCnt: $('bulkCount'), toastBox: $('toastContainer'),
  btnDark: $('btnDarkMode'), btnSync: $('btnSync'), btnAppr: $('btnApprovals'),
  btnAllUsers: $('btnAllUsers'), btnLogs: $('btnLogs'), btnAnalytics: $('btnAnalytics'),
  btnShare: $('btnShareManager'), btnUnAuth: $('btnUnauthorize'),
  pnlAppr: $('approvalPanel'), listAppr: $('approvalList'),
  pnlUsers: $('usersPanel'), listUsers: $('usersList'),
  pnlLogs: $('logsPanel'), logsCt: $('logsContent'),
  pnlAnalytics: $('analyticsPanel'), analyticsCt: $('analyticsContent'),
  pnlShare: $('sharePanel'), shareCt: $('shareContent'),
  pendingBadge: $('pendingBadge'), btnClearLogs: $('btnClearLogs'),
};

// ==================== HELPERS ====================
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
  if(ST.dark) document.documentElement.setAttribute('data-theme','dark');
  D.btnDark.addEventListener('click', () => {
    ST.dark = !ST.dark;
    document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
    localStorage.setItem('darkMode', ST.dark);
  });
})();

// ==================== AUTH ====================
async function init() {
  const p = new URLSearchParams(location.search);
  const a = p.get('admin_token'), u = p.get('utoken'), e = p.get('auth_error');
  if(e) { toast('Auth error: '+e.replace(/_/g,' '), 'error'); history.replaceState({},'',location.pathname); }
  if(a) { ST.adminToken = a; localStorage.setItem('adminToken', a); history.replaceState({},'',location.pathname); await valAdmin(); return; }
  if(u) { ST.userToken = u; localStorage.setItem('userToken', u); history.replaceState({},'',location.pathname); await getUserInfo(); render(); return; }
  if(ST.adminToken) { await valAdmin(); if(ST.isAdmin) return; }
  if(ST.userToken) { await getUserInfo(); render(); return; }
  showLogin();
}

async function valAdmin() {
  try {
    const r = await fetch(`${WORKER_BASE}/admin-session?token=${ST.adminToken}`);
    const d = await r.json();
    if(d.admin) { ST.isAdmin = true; ST.userEmail = d.email; showMain(); D.adminBar.classList.remove('hidden'); startAdminPoll(); fetchFiles(); loadPendingCount(); }
    else { ST.adminToken = null; ST.isAdmin = false; localStorage.removeItem('adminToken'); showLogin(); }
  } catch { showLogin(); }
}

async function getUserInfo() {
  if(!ST.userToken) return;
  const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.userToken}`);
  if(!r.ok) { ST.userToken = null; localStorage.removeItem('userToken'); return; }
  const i = await r.json();
  ST.userEmail = i.email; ST.approved = i.approved; ST.role = i.role;
}

function showLogin() {
  D.adminBar.classList.add('hidden'); D.adminUI.innerHTML = ''; D.userUI.innerHTML = '';
  D.grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px;">
      <h2>Welcome to File Vault</h2>
      <p style="margin:16px 0;">Choose how to access:</p>
      <button class="btn btn-primary" id="btnAdminLogin">🔑 Admin Login</button>
      <button class="btn btn-outline" id="btnUserLogin" style="margin-left:12px;">👤 User Login</button>
    </div>`;
  document.getElementById('btnAdminLogin').onclick = async () => { const r = await fetch(`${WORKER_BASE}/admin-auth-url`); window.location = (await r.json()).authUrl; };
  document.getElementById('btnUserLogin').onclick = async () => { const r = await fetch(`${WORKER_BASE}/user-auth-url`); window.location = (await r.json()).authUrl; };
}

function showPending() {
  D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
  D.dropzone.style.display = 'none';
  document.querySelector('.hint-text').style.display = 'none';
  D.grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px;">
      <h2>🔐 Waiting for Approval</h2>
      <p>Your email: <strong>${ST.userEmail}</strong></p>
      <p>You will be notified automatically.</p>
      <button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button>
      <button class="btn btn-danger btn-sm" id="btnSelfRevoke" style="margin-left:8px;">❌ Cancel Request</button>
    </div>`;
  document.getElementById('btnSelfRevoke').onclick = selfRevoke;
  startApprovalPoll();
}

function showMain() {
  document.querySelector('.hint-text').style.display = '';
  if(ST.isAdmin) {
    D.dropzone.style.display = '';
    D.adminBar.classList.remove('hidden');
    D.adminUI.innerHTML = '';
    D.userUI.innerHTML = '';
  } else {
    D.adminBar.classList.add('hidden');
    D.adminUI.innerHTML = '';
    const roleStr = ST.role ? ` (${ST.role})` : '';
    D.userUI.innerHTML = ST.userEmail
      ? `<span style="font-size:0.85rem;">👤 ${ST.userEmail}${roleStr} <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>`
      : '';
    const btn = document.getElementById('btnUserLogout');
    if(btn) btn.onclick = userLogout;
  }
}

function userLogout() {
  localStorage.removeItem('userToken');
  ST.userToken = null; ST.approved = false; ST.role = null; ST.userEmail = null;
  clearTimers();
  showLogin();
  toast('Logged out.');
}

async function selfRevoke() {
  if(!confirm('Cancel your access request? You will need to re-login to request access again.')) return;
  const res = await fetch(`${WORKER_BASE}/user-revoke-self`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({utoken: ST.userToken}) });
  if(res.ok) {
    localStorage.removeItem('userToken');
    ST.userToken = null; ST.approved = false; ST.role = null;
    clearTimers();
    showLogin();
    toast('Your access request has been cancelled.');
  } else toast('Failed to cancel request', 'error');
}

function render() {
  clearTimers();
  if(ST.isAdmin) { showMain(); fetchFiles(); return; }
  if(!ST.userEmail) { showLogin(); return; }
  if(!ST.approved) { showPending(); return; }
  showMain();
  applyRoleUI();
  fetchFiles();
  startRolePoll();
  startUserPoll();
}

function clearTimers() {
  ['role','approval','adminPoll','userPoll'].forEach(k => { if(ST.timers[k]) clearInterval(ST.timers[k]); });
}

// ==================== ADMIN BAR ====================
D.btnSync.onclick = async () => {
  toast('Syncing…','info');
  const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:{'X-Admin-Token':ST.adminToken}});
  if(r.ok) { await fetchFiles(); toast('Sync done','success'); } else toast('Sync failed','error');
};
D.btnAppr.onclick = () => { D.pnlAppr.classList.toggle('hidden'); if(!D.pnlAppr.classList.contains('hidden')) loadPending(); };
D.btnAllUsers.onclick = () => { D.pnlUsers.classList.toggle('hidden'); if(!D.pnlUsers.classList.contains('hidden')) loadAllUsers(); };
D.btnLogs.onclick = () => { D.pnlLogs.classList.toggle('hidden'); if(!D.pnlLogs.classList.contains('hidden')) loadLogs(); };
D.btnAnalytics.onclick = () => { D.pnlAnalytics.classList.toggle('hidden'); if(!D.pnlAnalytics.classList.contains('hidden')) loadAnalytics(); };
D.btnShare.onclick = () => { D.pnlShare.classList.toggle('hidden'); if(!D.pnlShare.classList.contains('hidden')) loadShares(); };
D.btnUnAuth.onclick = async () => {
  if(!confirm('Logout as admin? Vault will still work.')) return;
  await fetch(`${WORKER_BASE}/admin-logout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin_token:ST.adminToken})});
  localStorage.removeItem('adminToken'); ST.adminToken = null; ST.isAdmin = false;
  D.adminBar.classList.add('hidden'); D.adminUI.innerHTML = ''; toast('Admin logged out');
  init();
};

// ── Pending / Users ─────────────────────────────────
async function loadPendingCount() {
  const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':ST.adminToken}});
  const p = await r.json();
  D.pendingBadge.textContent = p.length; D.pendingBadge.classList.toggle('hidden', p.length===0);
}
function loadPending() {
  fetch(`${WORKER_BASE}/admin/pending`,{headers:{'X-Admin-Token':ST.adminToken}}).then(r=>r.json()).then(data=>{
    D.listAppr.innerHTML = data.length ? data.map(e=>`
      <div class="approval-item">
        <span>${e.email}</span>
        <div style="display:flex;gap:6px;">
          <select class="role-sel">
            <option value="full">Full</option>
            <option value="delete">Delete</option>
            <option value="upload">Upload Only</option>
            <option value="download">Download Only</option>
            <option value="read">Read Only</option>
            <option value="none">None</option>
          </select>
          <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-email="${e.email}" data-action="approve">✅ Approve</button>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-email="${e.email}" data-action="deny">❌ Deny</button>
        </div>
      </div>
    `).join('') : '<p>No pending users.</p>';
    D.listAppr.onclick = async (ev) => {
      const btn = ev.target.closest('button');
      if(!btn) return;
      const email = btn.dataset.email;
      if(btn.dataset.action === 'approve') {
        const role = btn.parentElement.querySelector('.role-sel').value;
        await fetch(`${WORKER_BASE}/admin/approve`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken},body:JSON.stringify({email,role})});
        toast(`${email} approved`);
      } else {
        await fetch(`${WORKER_BASE}/admin/deny`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken},body:JSON.stringify({email})});
        toast(`${email} denied`);
      }
      loadPending(); loadPendingCount(); loadAllUsers();
    };
  });
}

function loadAllUsers() {
  fetch(`${WORKER_BASE}/admin/users/all`,{headers:{'X-Admin-Token':ST.adminToken}}).then(r=>r.json()).then(users=>{
    // Separate revoked users
    const active = users.filter(u=>u.status!=='revoked'), revoked = users.filter(u=>u.status==='revoked');
    let html = active.map(u=>`
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
      </div>
    `).join('');
    if(revoked.length>0) {
      html += `<hr><h4 style="margin-top:12px;margin-bottom:8px;">Revoked Users</h4>`;
      html += revoked.map(u=>`
        <div class="approval-item">
          <span>${u.email} <span class="status-badge status-revoked">revoked</span> ${u.role?`(${u.role})`:''}</span>
          <div style="display:flex;gap:6px;">
            <select class="role-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
            <button class="btn btn-sm btn-warn" data-action="reapprove" data-email="${u.email}">Re‑approve</button>
            <button class="btn btn-sm btn-danger" data-action="revoke" data-email="${u.email}" disabled>Revoke</button>
          </div>
        </div>
      `).join('');
    }
    D.listUsers.innerHTML = html || '<p>No users found.</p>';
    D.listUsers.onclick = async (ev) => {
      const btn = ev.target.closest('button');
      if(!btn) return;
      const email = btn.dataset.email, action = btn.dataset.action;
      if(['approve','reapprove','update'].includes(action)) {
        const sel = btn.closest('.approval-item').querySelector('select');
        const role = sel ? sel.value : 'full';
        const endpoint = action==='reapprove' ? 'reapprove' : 'approve';
        await fetch(`${WORKER_BASE}/admin/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken},body:JSON.stringify({email,role})});
        toast(`${email} updated`);
      } else if(action==='revoke') {
        await fetch(`${WORKER_BASE}/admin/revoke`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken},body:JSON.stringify({email})});
        toast(`${email} revoked`);
      }
      loadAllUsers(); if(['approve','reapprove'].includes(action)) loadPendingCount();
    };
  });
}

// ── Logs / Analytics / Shares ───────────────────────
function loadLogs() { fetch(`${WORKER_BASE}/admin/logs?limit=100`,{headers:{'X-Admin-Token':ST.adminToken}}).then(r=>r.json()).then(d=>{ D.logsCt.innerHTML = d.logs.length ? d.logs.map(l=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;"><strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} <span style="color:var(--accent)">${l.action}</span> ${l.target||''}</div>`).join('') : '<p>No logs yet.</p>'; }); }
D.btnClearLogs.onclick = async () => { if(!confirm('Delete all audit logs?')) return; const r = await fetch(`${WORKER_BASE}/admin/logs/clear`,{method:'POST',headers:{'X-Admin-Token':ST.adminToken}}); if(r.ok) { loadLogs(); toast('Logs cleared'); } else toast('Failed','error'); };
function loadAnalytics() { fetch(`${WORKER_BASE}/admin/analytics`,{headers:{'X-Admin-Token':ST.adminToken}}).then(r=>r.json()).then(d=>{ D.analyticsCt.innerHTML = `<p><strong>Files:</strong> ${d.files.total} (${fmtSz(d.files.totalSize)})</p><p><strong>Views:</strong> ${d.files.totalViews} | <strong>Downloads:</strong> ${d.files.totalDownloads}</p><p><strong>Users:</strong> ${d.users.total} (pending:${d.users.pending}, approved:${d.users.approved}, revoked:${d.users.revoked})</p><p><strong>Today:</strong> ${d.today.uploads} uploads logged</p><h4>Top Files</h4>${d.files.topFiles.map(f=>`<div>${f.name} (views: ${f.views})</div>`).join('')}`; }); }
function loadShares() { D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'; }

// ==================== FILE LIST & ACTIONS ====================
async function fetchFiles() {
  const r = await fetch(`${WORKER_BASE}/list`);
  if(!r.ok) return;
  const { files } = await r.json();
  ST.files = files;
  renderFiles();
}
function renderFiles() {
  let list = [...ST.files];
  if(ST.query) list = list.filter(f => f.name.toLowerCase().includes(ST.query));
  const s = ST.sort;
  list.sort((a,b) => {
    switch(s) {
      case 'newest': return b.createdAt - a.createdAt;
      case 'oldest': return a.createdAt - b.createdAt;
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'size-desc': return b.size - a.size;
      case 'size-asc': return a.size - b.size;
      case 'views-desc': return (b.views||0) - (a.views||0);
      default: return 0;
    }
  });
  D.grid.innerHTML = '';
  if(!list.length) { D.grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:30px;">No files yet.</p>'; return; }
  list.forEach(f => {
    const actions = getFileActions(f.publicId);
    const card = document.createElement('div');
    card.className = `card${ST.sel.has(f.publicId)?' selected':''}`;
    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${ST.sel.has(f.publicId)?'checked':''}>
      <div class="file-icon">${icn(f.mimeType)}</div>
      <div class="file-name">${esc(f.name)}</div>
      <div class="file-meta">${fmtSz(f.size)} · ${new Date(f.createdAt).toLocaleString()}</div>
      <div class="file-stats">👁 ${f.views||0} ⬇${f.downloads||0}</div>
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
  // Event delegation on grid
  D.grid.onclick = (ev) => {
    const btn = ev.target.closest('button');
    if(btn) {
      ev.stopPropagation();
      const action = btn.dataset.action, id = btn.dataset.id;
      if(action) fileAction(action, id);
      return;
    }
    const card = ev.target.closest('.card');
    if(card) {
      const cb = card.querySelector('.card-checkbox');
      if(cb && ev.target !== cb) toggleSelect(card.dataset.publicId, !cb.checked);
    }
  };
  D.grid.onchange = (ev) => {
    const cb = ev.target.closest('.card-checkbox');
    if(cb) toggleSelect(cb.dataset.id, cb.checked);
  };
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
function toggleSelect(id, checked) {
  if(checked) ST.sel.add(id); else ST.sel.delete(id);
  updateBulkBar();
  const card = document.querySelector(`.card[data-publicid="${id}"]`);
  if(card) card.classList.toggle('selected', checked);
}
function updateBulkBar() {
  D.bulkBar.classList.toggle('hidden', ST.sel.size===0);
  D.bulkCnt.textContent = `${ST.sel.size} selected`;
}
$('btnBulkCancel').onclick = () => { ST.sel.clear(); renderFiles(); updateBulkBar(); };
$('btnBulkDelete').onclick = async () => {
  if(!confirm(`Delete ${ST.sel.size} files?`)) return;
  const ids = Array.from(ST.sel);
  const r = await fetch(`${WORKER_BASE}/bulk-delete`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken,'X-User-Token':ST.userToken},body:JSON.stringify({publicIds:ids})});
  const d = await r.json();
  ST.sel.clear(); updateBulkBar(); await fetchFiles();
  toast(`${d.deleted} deleted, ${d.failed} failed`);
};
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
D.dropzone.onclick = () => D.fileInp.click();
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
  if(e.key==='Escape') { if(!D.prevOv.classList.contains('hidden')) closePreview(); if(ST.sel.size) { ST.sel.clear(); renderFiles(); updateBulkBar(); } }
});

async function processFiles(files) { for(const file of files) await uploadFile(file); await fetchFiles(); }
async function uploadFile(file, existPid = null) {
  if(ST.uploadCtrl) ST.uploadCtrl.abort();
  ST.uploadCtrl = new AbortController(); const sig = ST.uploadCtrl.signal;
  D.progBox.classList.remove('hidden');
  try {
    let pid = existPid;
    if(!pid) {
      const ir = await fetch(`${WORKER_BASE}/upload-init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'}),signal:sig});
      if(!ir.ok) throw new Error('Init failed');
      pid = (await ir.json()).publicId;
    }
    const CHUNK = 10*1024*1024; let up = 0;
    while(up < file.size) {
      if(sig.aborted) throw new Error('Cancelled');
      const end = Math.min(up+CHUNK-1, file.size-1);
      const chunk = file.slice(up, end+1);
      let retries = 3, done = false;
      while(retries-- && !done) {
        const cr = await fetch(`${WORKER_BASE}/upload-chunk/${pid}`,{method:'PUT',headers:{'Content-Range':`bytes ${up}-${end}/${file.size}`},body:chunk,signal:sig});
        const d = await cr.json();
        if(cr.ok) { up = d.uploadedBytes || end+1; updateProg(up, file.size); if(d.status==='complete') { done = true; break; } }
        else { if(retries<=0) throw new Error(d.error||'Chunk error'); await new Promise(r=>setTimeout(r,1000)); }
      }
    }
    toast(`${file.name} uploaded`, 'success');
  } catch(err) { if(err.message!=='Cancelled') toast(`Upload failed: ${err.message}`, 'error'); }
  finally { D.progBox.classList.add('hidden'); ST.uploadCtrl = null; }
}
function updateProg(u,t) { const p = Math.round(u/t*100); D.progFill.style.width = p+'%'; D.pctDisp.textContent = p+'%'; D.sizeDisp.textContent = `${fmtSz(u)} / ${fmtSz(t)}`; }
D.cancelBtn.onclick = () => { if(ST.uploadCtrl) { ST.uploadCtrl.abort(); ST.uploadCtrl = null; D.progBox.classList.add('hidden'); } };

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
D.btnCloseP.onclick = closePreview;
D.btnFull.onclick = () => { if(document.fullscreenElement) document.exitFullscreen(); else D.prevOv.requestFullscreen(); };

// ==================== DOWNLOAD / DELETE / REPLACE / RENAME / SHARE ====================
function downloadFile(pid) { const a = document.createElement('a'); a.href = `${WORKER_BASE}/download/${pid}`; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
async function deleteFile(pid) {
  if(!confirm('Delete?')) return;
  const r = await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken,'X-User-Token':ST.userToken},body:JSON.stringify({publicId:pid})});
  if(r.ok) { ST.files = ST.files.filter(f=>f.publicId!==pid); ST.sel.delete(pid); renderFiles(); updateBulkBar(); toast('Deleted','success'); }
  else toast('Delete failed','error');
}
function replaceFile(pid) {
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async () => {
    const file = inp.files[0]; if(!file) return;
    const ir = await fetch(`${WORKER_BASE}/update`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken,'X-User-Token':ST.userToken},body:JSON.stringify({publicId:pid,fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'})});
    if(!ir.ok) { toast('Update init failed','error'); return; }
    const {publicId} = await ir.json();
    await uploadFile(file, publicId); await fetchFiles();
  };
  inp.click();
}
async function renameFile(pid) {
  const file = ST.files.find(f=>f.publicId===pid); if(!file) return;
  const newName = prompt('New name:', file.name);
  if(!newName||newName===file.name) return;
  const r = await fetch(`${WORKER_BASE}/rename`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken,'X-User-Token':ST.userToken},body:JSON.stringify({publicId:pid,newName})});
  if(r.ok) { toast('Renamed'); await fetchFiles(); } else toast('Rename failed','error');
}
async function shareFile(pid) {
  const label = prompt('Share label (optional):','');
  const expires = prompt('Expires in hours (default 1):','1');
  const maxDownloads = parseInt(prompt('Max downloads (0=unlimited):','0'),10);
  const r = await fetch(`${WORKER_BASE}/share/create`,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':ST.adminToken,'X-User-Token':ST.userToken},body:JSON.stringify({publicId:pid,expiresIn:(parseInt(expires||'1',10)*3600),maxDownloads,label})});
  const d = await r.json();
  if(r.ok) { toast('Share link created!'); navigator.clipboard.writeText(d.shareUrl).then(()=>toast('Link copied to clipboard')); }
  else toast('Share failed','error');
}

// ==================== POLLING (efficient) ====================
function startRolePoll() {
  if(ST.timers.role) clearInterval(ST.timers.role);
  ST.timers.role = setInterval(async () => {
    if(!ST.userToken||!ST.approved) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.userToken}`);
    if(!r.ok) return;
    const i = await r.json();
    if(i.role !== ST.role) { ST.role = i.role; applyRoleUI(); toast(`Permissions changed to ${ST.role}`); }
  }, 8000);
}
function startApprovalPoll() {
  if(ST.timers.approval) clearInterval(ST.timers.approval);
  ST.timers.approval = setInterval(async () => {
    if(!ST.userToken) return;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.userToken}`);
    if(!r.ok) return;
    const i = await r.json();
    if(i.approved) { ST.approved = true; ST.role = i.role; clearInterval(ST.timers.approval); toast('Approved!', 'success'); render(); }
  }, 10000);
}
function startAdminPoll() {
  if(ST.timers.adminPoll) clearInterval(ST.timers.adminPoll);
  let lastTs = 0;
  const poll = async () => {
    if(!ST.adminToken) return;
    const r = await fetch(`${WORKER_BASE}/admin/poll?since=${lastTs}&timeout=15`,{headers:{'X-Admin-Token':ST.adminToken}});
    const d = await r.json();
    if(d.changed) { lastTs = d.ts; loadPendingCount(); if(!D.pnlAppr.classList.contains('hidden')) loadPending(); if(!D.pnlUsers.classList.contains('hidden')) loadAllUsers(); if(!D.pnlLogs.classList.contains('hidden')) loadLogs(); }
    ST.timers.adminPoll = setTimeout(poll, 2000);
  };
  poll();
}
function startUserPoll() {
  if(ST.timers.userPoll) clearInterval(ST.timers.userPoll);
  let lastTs = 0;
  const poll = async () => {
    if(!ST.userToken||!ST.approved) return;
    const r = await fetch(`${WORKER_BASE}/poll?utoken=${ST.userToken}&since=${lastTs}&timeout=15`);
    const d = await r.json();
    if(d.changed) { lastTs = d.ts; fetchFiles(); }
    ST.timers.userPoll = setTimeout(poll, 2000);
  };
  poll();
}
function applyRoleUI() {
  const can = ST.role==='full'||ST.role==='delete'||ST.role==='upload'||ST.role==='download';
  D.dropzone.style.display = can ? '' : 'none';
  document.querySelector('.hint-text').style.display = can ? '' : 'none';
  renderFiles();
}

// ==================== SEARCH / SORT ====================
D.search.addEventListener('input', () => { ST.query = D.search.value.toLowerCase(); renderFiles(); });
D.sortSel.addEventListener('change', () => { ST.sort = D.sortSel.value; localStorage.setItem('sort', ST.sort); renderFiles(); });
D.sortSel.value = ST.sort;

// ==================== START ====================
init();
