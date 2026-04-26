// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE (persisted in localStorage) ====================
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
  // Admin specific
  btnSync: $('btnSync'), btnApprovals: $('btnApprovals'), btnAllUsers: $('btnAllUsers'),
  btnUnauthorize: $('btnUnauthorize'), approvalPanel: $('approvalPanel'), approvalList: $('approvalList'),
  usersPanel: $('usersPanel'), usersList: $('usersList'),
};

// Utility functions (toast, esc, fmtBytes, etc.) remain unchanged
// ==================== UTILITIES ====================
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  DOM.toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(() => el.remove(),300); }, 3000);
}
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function fmtBytes(b){ if(!b)return '0 B'; const u=['B','KB','MB','GB','TB']; let i=0,s=b; while(s>=1024&&i<u.length-1){s/=1024;i++;} return s.toFixed(1)+' '+u[i]; }
function getIcon(mime){...} // same as before
function previewType(mime){...} // same as before

// ==================== DARK MODE ====================
(function(){
  if(state.darkMode) document.documentElement.setAttribute('data-theme','dark');
  DOM.btnDarkMode.addEventListener('click',()=>{
    state.darkMode=!state.darkMode;
    document.documentElement.setAttribute('data-theme',state.darkMode?'dark':'light');
    localStorage.setItem('darkMode',state.darkMode);
  });
})();

// ==================== INIT ====================
async function init() {
  const params = new URLSearchParams(location.search);
  const utoken = params.get('utoken'), admToken = params.get('admin_token');
  if (admToken) {
    state.adminSessionToken = admToken;
    localStorage.setItem('adminSessionToken', admToken);
    history.replaceState({}, '', location.pathname);
    await validateAdminSession();
    return;
  }
  if (utoken) {
    state.userToken = utoken;
    localStorage.setItem('userToken', utoken);
    history.replaceState({}, '', location.pathname);
    await fetchUserInfo();
    renderUI();
    return;
  }
  if (state.adminSessionToken) { await validateAdminSession(); if (state.isAdmin) return; }
  if (state.userToken) { await fetchUserInfo(); renderUI(); return; }
  renderLoginScreen();
}

// ... (validateAdminSession, fetchUserInfo, renderLoginScreen, renderPendingScreen, renderMainApp)
// ... (They are identical to the previous script.js, with minor adjustments for the new "All Users" button)
// The key addition is the "All Users" panel loading and action handlers.

// ==================== LOAD ALL USERS ====================
async function loadAllUsers() {
  if (!state.adminSessionToken) return;
  const res = await fetch(`${WORKER_BASE}/admin/users/all`, { headers: {'X-Admin-Token': state.adminSessionToken} });
  if (!res.ok) return;
  const users = await res.json();
  const list = DOM.usersList;
  if (!users.length) { list.innerHTML = '<p style="color:var(--text-secondary);">No users registered.</p>'; return; }
  list.innerHTML = users.map(u => `
    <div class="approval-item">
      <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role ? `(${u.role})` : ''}</span>
      <div style="display:flex;gap:6px;">
        ${u.status === 'pending' ? `
          <select class="role-select-${u.email}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);">
            <option value="full">Full</option><option value="delete">Delete</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option>
          </select>
          <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-approve="${u.email}">✅ Approve</button>
        ` : ''}
        ${u.status === 'approved' || u.status === 'revoked' ? `
          <select class="role-select-${u.email}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);">
            <option value="full" ${u.role==='full'?'selected':''}>Full</option>
            <option value="delete" ${u.role==='delete'?'selected':''}>Delete</option>
            <option value="download" ${u.role==='download'?'selected':''}>Download</option>
            <option value="read" ${u.role==='read'?'selected':''}>Read</option>
            <option value="none" ${u.role==='none'?'selected':''}>None</option>
          </select>
          <button class="btn btn-sm" style="background:var(--accent);color:#fff;" data-update="${u.email}">Update</button>
          ${u.status === 'revoked' ? `<button class="btn btn-sm" style="background:var(--warn);color:#222;" data-reapprove="${u.email}">Re‑approve</button>` : ''}
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-revoke="${u.email}">Revoke</button>
        ` : ''}
      </div>
    </div>
  `).join('');
  attachAllUsersEvents();
}

function attachAllUsersEvents() {
  DOM.usersList.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
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
    btn.addEventListener('click', async () => {
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
    btn.addEventListener('click', async () => {
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
    btn.addEventListener('click', async () => {
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

// Attach new button handler
DOM.btnAllUsers.addEventListener('click', () => {
  DOM.usersPanel.classList.toggle('hidden');
  if (!DOM.usersPanel.classList.contains('hidden')) loadAllUsers();
});
