// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const state = {
  userToken: localStorage.getItem('userToken') || null,
  adminSessionToken: localStorage.getItem('adminSessionToken') || null,
  isAdmin: false,
  userEmail: null,
  userApproved: false,
  userRole: null,
  currentFileList: [],
  selectedFiles: new Set(),
  sortOrder: localStorage.getItem('sortOrder') || 'newest',
  searchQuery: '',
  uploadAbortController: null,
  rolePollInterval: null,
  approvalPollInterval: null,
  darkMode: localStorage.getItem('darkMode') === 'true',
};

// ==================== DOM REFS ====================
const $ = id => document.getElementById(id);
const DOM = {
  storageStats: $('storageStats'), adminUI: $('adminUI'), adminBar: $('adminBar'),
  dropzone: $('dropzone'), fileInput: $('fileInput'), progressBox: $('progressBox'),
  progressFill: $('progressFill'), percentDisplay: $('percentDisplay'), sizeDisplay: $('sizeDisplay'),
  cancelUploadBtn: $('cancelUpload'), fileGrid: $('fileGrid'), previewOverlay: $('previewOverlay'),
  previewContainer: $('previewContainer'), btnFullscreen: $('btnFullscreen'), btnClosePreview: $('btnClosePreview'),
  searchInput: $('searchInput'), sortSelect: $('sortSelect'), bulkBar: $('bulkBar'), bulkCount: $('bulkCount'),
  toastContainer: $('toastContainer'), btnDarkMode: $('btnDarkMode'),
  btnSync: $('btnSync'), btnApprovals: $('btnApprovals'), btnAllUsers: $('btnAllUsers'),
  btnUnauthorize: $('btnUnauthorize'), approvalPanel: $('approvalPanel'), approvalList: $('approvalList'),
  usersPanel: $('usersPanel'), usersList: $('usersList'),
};

// ==================== UTILITIES ====================
const toast = (msg, type='info') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  DOM.toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(() => el.remove(),300); }, 3000);
};
const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
const fmtBytes = b => {
  if(!b) return '0 B';
  const u=['B','KB','MB','GB','TB']; let i=0, s=b;
  while(s>=1024 && i<u.length-1){ s/=1024; i++; }
  return s.toFixed(1)+' '+u[i];
};
const getIcon = m => {
  if(!m) return '📄';
  if(m.startsWith('video/')) return '🎬';
  if(m.startsWith('audio/')) return '🎵';
  if(m.startsWith('image/')) return '🖼️';
  if(m==='application/pdf') return '📕';
  if(m.startsWith('text/')) return '📝';
  return '📄';
};
const previewType = m => {
  if(!m) return 'other';
  if(m.startsWith('video/')) return 'video';
  if(m.startsWith('audio/')) return 'audio';
  if(m.startsWith('image/')) return 'image';
  if(m==='application/pdf') return 'pdf';
  if(m.startsWith('text/')||m==='application/json') return 'text';
  return 'other';
};

// ==================== DARK MODE ====================
(function(){
  if(state.darkMode) document.documentElement.setAttribute('data-theme','dark');
  DOM.btnDarkMode.addEventListener('click',()=>{
    state.darkMode=!state.darkMode;
    document.documentElement.setAttribute('data-theme',state.darkMode?'dark':'light');
    localStorage.setItem('darkMode',state.darkMode);
  });
})();

// ==================== AUTH INIT ====================
async function init() {
  const params = new URLSearchParams(location.search);
  const utoken = params.get('utoken'), admToken = params.get('admin_token');
  if (admToken) {
    state.adminSessionToken = admToken;
    localStorage.setItem('adminSessionToken', admToken);
    history.replaceState({},'',location.pathname);
    await validateAdminSession();
    return;
  }
  if (utoken) {
    state.userToken = utoken;
    localStorage.setItem('userToken', utoken);
    history.replaceState({},'',location.pathname);
    await fetchUserInfo();
    renderUI();
    return;
  }
  if (state.adminSessionToken) { await validateAdminSession(); if (state.isAdmin) return; }
  if (state.userToken) { await fetchUserInfo(); renderUI(); return; }
  renderLoginScreen();
}

async function validateAdminSession() {
  try {
    const res = await fetch(`${WORKER_BASE}/admin-session?token=${state.adminSessionToken}`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (data.admin) {
      state.isAdmin = true;
      state.userEmail = data.email;
      renderUI();
      DOM.adminBar.classList.remove('hidden');
      loadPendingCount();
      refreshFileList();
    } else {
      localStorage.removeItem('adminSessionToken');
      state.adminSessionToken = null;
      state.isAdmin = false;
      renderLoginScreen();
    }
  } catch(e) {
    localStorage.removeItem('adminSessionToken');
    state.adminSessionToken = null;
    renderLoginScreen();
  }
}

async function fetchUserInfo() {
  if (!state.userToken) return;
  try {
    const res = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
    if (!res.ok) throw new Error('Invalid token');
    const info = await res.json();
    state.userEmail = info.email;
    state.userApproved = info.approved;
    state.userRole = info.role;
  } catch(e) {
    localStorage.removeItem('userToken');
    state.userToken = null;
    state.userEmail = null;
    state.userApproved = false;
  }
}

function renderLoginScreen() {
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML = '';
  DOM.fileGrid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
      <h2>Welcome to File Vault</h2>
      <p style="margin:16px 0; color:var(--text-secondary);">Choose how to access:</p>
      <div style="display:flex; gap:12px; justify-content:center;">
        <button class="btn btn-primary" id="adminLoginBtn">🔑 Admin Login</button>
        <button class="btn btn-outline" id="userLoginBtn">👤 User Login</button>
      </div>
    </div>`;
  document.querySelector('.hint-text').style.display='none';
  DOM.storageStats.textContent='';
  document.getElementById('adminLoginBtn').addEventListener('click', async ()=>{
    const res = await fetch(`${WORKER_BASE}/admin-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
  document.getElementById('userLoginBtn').addEventListener('click', async ()=>{
    const res = await fetch(`${WORKER_BASE}/user-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
}

function renderPendingScreen() {
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML='';
  DOM.fileGrid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
      <h2>🔐 Waiting for Approval</h2>
      <p>Your email: <strong>${state.userEmail}</strong></p>
      <p style="color:var(--text-secondary);">Your access is pending. The admin will review your request.</p>
      <p style="margin-top:16px;">You can refresh this page or wait – permissions update automatically.</p>
      <button class="btn btn-outline btn-sm" onclick="location.reload()" style="margin-top:12px;">🔄 Check Again</button>
    </div>`;
  document.querySelector('.hint-text').style.display='none';
  DOM.storageStats.textContent='';
}

function renderMainApp() {
  document.querySelector('.hint-text').style.display='block';
  if (!state.isAdmin) {
    DOM.adminBar.classList.add('hidden');
    DOM.adminUI.innerHTML = state.userEmail ? `<span style="font-size:0.85rem; color:var(--text-secondary);">👤 ${state.userEmail} (${state.userRole||''})</span>` : '';
  }
}

function renderUI() {
  if (state.rolePollInterval) clearInterval(state.rolePollInterval);
  if (state.approvalPollInterval) clearInterval(state.approvalPollInterval);
  if (state.isAdmin) {
    renderMainApp();
    DOM.adminBar.classList.remove('hidden');
    loadPendingCount();
    refreshFileList();
    return;
  }
  if (!state.userEmail) { renderLoginScreen(); return; }
  if (!state.userApproved) {
    renderPendingScreen();
    startApprovalPolling();
    return;
  }
  renderMainApp();
  applyPermissionsUI(state.userRole);
  refreshFileList();
  startRolePolling();
}

// ==================== ADMIN BAR ====================
DOM.btnSync.addEventListener('click', async ()=>{ /* ... same as before ... */ });
DOM.btnApprovals.addEventListener('click', ()=>{ /* toggles panel, loads pending */ });
DOM.btnUnauthorize.addEventListener('click', async ()=>{ /* logs out admin, keeps vault running */ });
DOM.btnAllUsers.addEventListener('click', ()=>{ /* toggles all users panel */ });

// ==================== LOAD ALL USERS (with re-approve) ====================
async function loadAllUsers() {
  if (!state.adminSessionToken) return;
  const res = await fetch(`${WORKER_BASE}/admin/users/all`, { headers: { 'X-Admin-Token': state.adminSessionToken } });
  if (!res.ok) return;
  const users = await res.json();
  DOM.usersList.innerHTML = users.map(u => `
    <div class="approval-item">
      <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role ? `(${u.role})` : ''}</span>
      <div style="display:flex; gap:6px;">
        ${u.status === 'pending' ? `
          <select class="role-select-${u.email}" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
            <option value="full">Full</option><option value="delete">Delete</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option>
          </select>
          <button class="btn btn-sm" style="background:var(--success); color:#fff;" data-approve="${u.email}">✅ Approve</button>
        ` : ''}
        ${u.status === 'approved' || u.status === 'revoked' ? `
          <select class="role-select-${u.email}" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
            <option value="full" ${u.role==='full'?'selected':''}>Full</option>
            <option value="delete" ${u.role==='delete'?'selected':''}>Delete</option>
            <option value="download" ${u.role==='download'?'selected':''}>Download</option>
            <option value="read" ${u.role==='read'?'selected':''}>Read</option>
            <option value="none" ${u.role==='none'?'selected':''}>None</option>
          </select>
          <button class="btn btn-sm" style="background:var(--accent); color:#fff;" data-update="${u.email}">Update</button>
          ${u.status === 'revoked' ? `<button class="btn btn-sm" style="background:var(--warn); color:#222;" data-reapprove="${u.email}">Re‑approve</button>` : ''}
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-revoke="${u.email}">Revoke</button>
        ` : ''}
      </div>
    </div>
  `).join('');
  attachAllUsersEvents();
}

function attachAllUsersEvents() {
  DOM.usersList.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const row = btn.closest('.approval-item');
      const roleSelect = row.querySelector(`.role-select-${btn.dataset.approve}`);
      const role = roleSelect.value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':state.adminSessionToken},
        body: JSON.stringify({ email: btn.dataset.approve, role })
      });
      toast(`${btn.dataset.approve} approved`, 'success');
      loadAllUsers();
    });
  });
  DOM.usersList.querySelectorAll('[data-update]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const email = btn.dataset.update;
      const select = document.querySelector(`.role-select-${email}`);
      const role = select.value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':state.adminSessionToken},
        body: JSON.stringify({ email, role })
      });
      toast(`Updated ${email}`, 'success');
      loadAllUsers();
    });
  });
  DOM.usersList.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      if (!confirm(`Revoke access for ${btn.dataset.revoke}?`)) return;
      await fetch(`${WORKER_BASE}/admin/revoke`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':state.adminSessionToken},
        body: JSON.stringify({ email: btn.dataset.revoke })
      });
      toast(`${btn.dataset.revoke} revoked`, 'success');
      loadAllUsers();
    });
  });
  DOM.usersList.querySelectorAll('[data-reapprove]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const email = btn.dataset.reapprove;
      const select = document.querySelector(`.role-select-${email}`);
      const role = select ? select.value : 'full';
      await fetch(`${WORKER_BASE}/admin/reapprove`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':state.adminSessionToken},
        body: JSON.stringify({ email, role })
      });
      toast(`${email} re‑approved`, 'success');
      loadAllUsers();
    });
  });
}

// ==================== ROLE-BASED UI ====================
function applyPermissionsUI(role) {
  const canUpload = role === 'full' || role === 'delete' || role === 'download';
  DOM.dropzone.style.display = canUpload ? '' : 'none';
  document.querySelector('.hint-text').style.display = canUpload ? '' : 'none';
  renderFileList();
}

function getAvailableActions(publicId) {
  if (state.isAdmin) return ['play', 'preview', 'download', 'delete', 'replace'];
  if (!state.userRole) return [];
  const file = state.currentFileList.find(f => f.publicId === publicId);
  if (!file) return [];
  const pt = previewType(file.fileType);
  const actions = [];
  if ((pt==='video'||pt==='audio') && ['full','delete','download','read'].includes(state.userRole)) actions.push('play');
  if (['image','pdf','text'].includes(pt) && ['full','delete','download','read'].includes(state.userRole)) actions.push('preview');
  if (['full','delete','download'].includes(state.userRole)) actions.push('download');
  if (['full','delete'].includes(state.userRole)) actions.push('delete');
  if (state.userRole === 'full') actions.push('replace');
  return actions;
}

// ==================== DRAG & DROP, PASTE, KEYBOARD ====================
// ... (all handlers as before) ...

// ==================== UPLOAD ENGINE ====================
// ... (full chunked upload with resume) ...

// ==================== FILE LIST (with role-based buttons) ====================
function renderFileList() {
  // filters, sorts, renders cards with buttons based on getAvailableActions
}

// ==================== PREVIEW, DOWNLOAD, DELETE, REPLACE ====================
// ... (implemented as before) ...

// ==================== POLLING ====================
function startRolePolling() { /* polls every 5 sec for role changes */ }
function startApprovalPolling() { /* polls every 10 sec until approved */ }

// ==================== INIT ====================
init();
