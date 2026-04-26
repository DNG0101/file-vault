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
const toast = (msg, type='info') => { /* ... same as before */ };
const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
const fmtBytes = b => { /* ... */ };
const getIcon = m => { /* ... */ };
const previewType = m => { /* ... */ };

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

async function fetchUserInfo() { /* ... */ }
function renderLoginScreen() { /* ... */ }
function renderPendingScreen() { /* ... */ }
function renderMainApp() { /* ... */ }
function renderUI() { /* ... */ }

// ==================== ADMIN BAR ====================
DOM.btnSync.addEventListener('click', async ()=>{
  toast('Syncing files from cloud storage…','info');
  const res = await fetch(`${WORKER_BASE}/sync`, { method:'POST' });
  if (res.ok) { await refreshFileList(); toast('Sync complete!','success'); }
  else toast('Sync failed','error');
});
DOM.btnApprovals.addEventListener('click', ()=>{
  DOM.approvalPanel.classList.toggle('hidden');
  if (!DOM.approvalPanel.classList.contains('hidden')) loadPendingApprovals();
});
DOM.btnUnauthorize.addEventListener('click', async ()=>{
  if (!confirm('Logout as admin? The vault will still work for users.')) return;
  if (state.adminSessionToken) {
    await fetch(`${WORKER_BASE}/admin-logout`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_token:state.adminSessionToken}) });
  }
  localStorage.removeItem('adminSessionToken');
  state.adminSessionToken = null;
  state.isAdmin = false;
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML = '';
  toast('Admin logged out','info');
  if (state.userToken) { await fetchUserInfo(); renderUI(); }
  else renderLoginScreen();
});

// ==================== LOAD ALL USERS ====================
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

function attachAllUsersEvents() { /* ... event listeners for approve/update/revoke/reapprove */ }

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
// ... complete implementation as before

// ==================== UPLOAD ENGINE ====================
async function processFiles(files) { /* ... */ }
async function uploadFile(file, tempId) { /* ... */ }
function updateProgress(uploaded, total) { /* ... */ }

// ==================== FILE LIST ====================
async function refreshFileList() { /* ... */ }
function updateStats() { /* ... */ }
function renderFileList() { /* ... */ }
function updateBulkBar() { /* ... */ }

// ==================== PREVIEW ====================
function openPreview(publicId, type) { /* ... */ }
function closePreview() { /* ... */ }

// ==================== DOWNLOAD / DELETE / REPLACE ====================
function downloadFile(publicId) { /* ... */ }
async function deleteFile(publicId) { /* ... */ }
function replaceFile(publicId) { /* ... */ }

// ==================== POLLING ====================
function startRolePolling() { /* poll every 5s for role changes */ }
function startApprovalPolling() { /* poll every 10s until approved */ }

// ==================== INIT ====================
init();
