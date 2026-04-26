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

async function validateAdminSession() { /* ... same as before ... */ }
async function fetchUserInfo() { /* ... */ }
function renderLoginScreen() { /* ... */ }
function renderPendingScreen() { /* ... */ }
function renderMainApp() { /* ... */ }
function renderUI() { /* ... */ }

// ==================== ADMIN BAR ====================
// ... event listeners

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

function attachAllUsersEvents() { /* event listeners for approve, update, revoke, reapprove */ }

// ==================== ROLE-BASED UI ====================
function applyPermissionsUI(role) { /* shows/hides dropzone and hint */ }
function getAvailableActions(publicId) { /* returns allowed buttons based on role */ }

// ==================== DRAG & DROP, PASTE, KEYBOARD ====================
// ...

// ==================== UPLOAD ENGINE ====================
async function processFiles(files) { /* ... */ }
async function uploadFile(file, tempId) { /* full chunked upload with resume */ }

// ==================== FILE LIST ====================
function renderFileList() { /* filters, sorts, builds cards with role-based buttons */ }
async function refreshFileList() { /* fetches /list and merges with optimistic */ }

// ==================== PREVIEW, DOWNLOAD, DELETE, REPLACE ====================
// ...

// ==================== POLLING ====================
function startRolePolling() { /* polls every 5s for role changes */ }
function startApprovalPolling() { /* polls every 10s until approved */ }

// ==================== INIT ====================
init();
