// =============================================================================
// File Vault – Frontend Application Logic
// =============================================================================
// Configuration
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev'; // CHANGE ME

// =============================================================================
// Application State (persisted in localStorage for session survival)
// =============================================================================
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

// =============================================================================
// DOM References (cached for performance)
// =============================================================================
const DOM = {
  storageStats: document.getElementById('storageStats'),
  adminUI: document.getElementById('adminUI'),
  adminBar: document.getElementById('adminBar'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  progressBox: document.getElementById('progressBox'),
  progressFill: document.getElementById('progressFill'),
  percentDisplay: document.getElementById('percentDisplay'),
  sizeDisplay: document.getElementById('sizeDisplay'),
  cancelUploadBtn: document.getElementById('cancelUpload'),
  fileGrid: document.getElementById('fileGrid'),
  previewOverlay: document.getElementById('previewOverlay'),
  previewContainer: document.getElementById('previewContainer'),
  btnFullscreen: document.getElementById('btnFullscreen'),
  btnClosePreview: document.getElementById('btnClosePreview'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  bulkBar: document.getElementById('bulkBar'),
  bulkCount: document.getElementById('bulkCount'),
  toastContainer: document.getElementById('toastContainer'),
  btnDarkMode: document.getElementById('btnDarkMode'),
  pendingBadge: document.getElementById('pendingBadge'),
  approvalPanel: document.getElementById('approvalPanel'),
  approvalList: document.getElementById('approvalList'),
  usersPanel: document.getElementById('usersPanel'),
  usersList: document.getElementById('usersList'),
};

// =============================================================================
// Utility Functions
// =============================================================================
const toast = (msg, type = 'info') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  DOM.toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3000);
};

const esc = (s) => {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
};

const fmtBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, s = bytes;
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
  return s.toFixed(1) + ' ' + units[i];
};

const getIcon = (mime) => {
  if (!mime) return '📄';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime.startsWith('text/')) return '📝';
  return '📄';
};

const previewType = (mime) => {
  if (!mime) return 'other';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return 'other';
};

// =============================================================================
// Dark Mode Toggle
// =============================================================================
(function initDarkMode() {
  if (state.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  DOM.btnDarkMode.addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', state.darkMode);
  });
})();

// =============================================================================
// Initialization Flow
// =============================================================================
async function init() {
  // 1. Check URL params for fresh tokens from OAuth redirect
  const params = new URLSearchParams(location.search);
  const utoken = params.get('utoken');
  const admToken = params.get('admin_token');

  if (admToken) {
    // Admin just logged in
    state.adminSessionToken = admToken;
    localStorage.setItem('adminSessionToken', admToken);
    history.replaceState({}, '', location.pathname);
    await validateAdminSession();
    return;
  }

  if (utoken) {
    // User just logged in
    state.userToken = utoken;
    localStorage.setItem('userToken', utoken);
    history.replaceState({}, '', location.pathname);
    await fetchUserInfo();
    renderUI();
    return;
  }

  // 2. No fresh tokens – check localStorage
  if (state.adminSessionToken) {
    await validateAdminSession();
    if (state.isAdmin) return;
  }

  if (state.userToken) {
    await fetchUserInfo();
    renderUI();
    return;
  }

  // 3. Nobody logged in
  renderLoginScreen();
}

// =============================================================================
// Authentication Validation
// =============================================================================
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
      // Session expired
      localStorage.removeItem('adminSessionToken');
      state.adminSessionToken = null;
      state.isAdmin = false;
      renderLoginScreen();
    }
  } catch (e) {
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
  } catch (e) {
    // Token expired or invalid
    localStorage.removeItem('userToken');
    state.userToken = null;
    state.userEmail = null;
    state.userApproved = false;
  }
}

// =============================================================================
// Screen Renderers
// =============================================================================
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
  document.querySelector('.hint-text').style.display = 'none';
  DOM.storageStats.textContent = '';
  document.getElementById('adminLoginBtn').addEventListener('click', async () => {
    const res = await fetch(`${WORKER_BASE}/admin-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
  document.getElementById('userLoginBtn').addEventListener('click', async () => {
    const res = await fetch(`${WORKER_BASE}/user-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
}

function renderPendingScreen() {
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML = '';
  DOM.fileGrid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
      <h2>🔐 Waiting for Approval</h2>
      <p>Your email: <strong>${state.userEmail}</strong></p>
      <p style="color:var(--text-secondary);">Your access is pending. The admin will review your request.</p>
      <p style="margin-top:16px;">You can refresh this page or wait – permissions update automatically.</p>
      <button class="btn btn-outline btn-sm" onclick="location.reload()" style="margin-top:12px;">🔄 Check Again</button>
    </div>`;
  document.querySelector('.hint-text').style.display = 'none';
  DOM.storageStats.textContent = '';
}

function renderMainApp() {
  document.querySelector('.hint-text').style.display = 'block';
  if (!state.isAdmin) {
    DOM.adminBar.classList.add('hidden');
    DOM.adminUI.innerHTML = state.userEmail
      ? `<span style="font-size:0.85rem; color:var(--text-secondary);">👤 ${state.userEmail} (${state.userRole || ''})</span>`
      : '';
  }
}

function renderUI() {
  // Clear any existing poll intervals
  if (state.rolePollInterval) clearInterval(state.rolePollInterval);
  if (state.approvalPollInterval) clearInterval(state.approvalPollInterval);

  if (state.isAdmin) {
    renderMainApp();
    DOM.adminBar.classList.remove('hidden');
    loadPendingCount();
    refreshFileList();
    return;
  }

  if (!state.userEmail) {
    renderLoginScreen();
    return;
  }

  if (!state.userApproved) {
    renderPendingScreen();
    startApprovalPolling();
    return;
  }

  // Approved user
  renderMainApp();
  applyPermissionsUI(state.userRole);
  refreshFileList();
  startRolePolling();
}

// =============================================================================
// Admin Bar Event Handlers
// =============================================================================
document.getElementById('btnSync').addEventListener('click', async () => {
  toast('Syncing files from storage…', 'info');
  const res = await fetch(`${WORKER_BASE}/sync`, { method: 'POST' });
  if (res.ok) {
    await refreshFileList();
    toast('Sync complete!', 'success');
  } else {
    toast('Sync failed', 'error');
  }
});

document.getElementById('btnApprovals').addEventListener('click', () => {
  DOM.approvalPanel.classList.toggle('hidden');
  if (!DOM.approvalPanel.classList.contains('hidden')) loadPendingApprovals();
});

document.getElementById('btnUsers').addEventListener('click', () => {
  DOM.usersPanel.classList.toggle('hidden');
  if (!DOM.usersPanel.classList.contains('hidden')) loadUsers();
});

document.getElementById('btnUnauthorize').addEventListener('click', async () => {
  if (!confirm('Logout as admin? The vault will still work for users.')) return;
  if (state.adminSessionToken) {
    await fetch(`${WORKER_BASE}/admin-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_token: state.adminSessionToken }),
    });
  }
  localStorage.removeItem('adminSessionToken');
  state.adminSessionToken = null;
  state.isAdmin = false;
  DOM.adminBar.classList.add('hidden');
  DOM.adminUI.innerHTML = '';
  toast('Admin logged out', 'info');
  // If a user token exists, show user UI; otherwise login
  if (state.userToken) {
    await fetchUserInfo();
    renderUI();
  } else {
    renderLoginScreen();
  }
});

// =============================================================================
// Admin Data Loaders
// =============================================================================
async function loadPendingCount() {
  if (!state.adminSessionToken) return;
  const res = await fetch(`${WORKER_BASE}/admin/pending`, {
    headers: { 'X-Admin-Token': state.adminSessionToken },
  });
  if (!res.ok) return;
  const emails = await res.json();
  const badge = DOM.pendingBadge;
  if (emails.length > 0) {
    badge.textContent = emails.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function loadPendingApprovals() {
  const res = await fetch(`${WORKER_BASE}/admin/pending`, {
    headers: { 'X-Admin-Token': state.adminSessionToken },
  });
  if (!res.ok) return;
  const emails = await res.json();
  const list = DOM.approvalList;
  if (!emails.length) {
    list.innerHTML = '<p style="color:var(--text-secondary);">No pending users.</p>';
    return;
  }
  list.innerHTML = emails.map(email => `
    <div class="approval-item">
      <span>${email}</span>
      <div style="display:flex; gap:6px; align-items:center;">
        <select class="role-select" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
          <option value="full">Full Access</option>
          <option value="delete">Delete</option>
          <option value="download">Download Only</option>
          <option value="read">Read Only</option>
          <option value="none">None</option>
        </select>
        <button class="btn btn-sm" style="background:var(--success); color:#fff;" data-approve="${email}">✅ Approve</button>
        <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-deny="${email}">❌ Deny</button>
      </div>
    </div>
  `).join('');
  attachPendingEvents();
}

function attachPendingEvents() {
  DOM.approvalList.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.approval-item');
      const roleSelect = row.querySelector('.role-select');
      const role = roleSelect.value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.adminSessionToken },
        body: JSON.stringify({ email: btn.dataset.approve, role }),
      });
      toast(`${btn.dataset.approve} approved as ${role}`, 'success');
      loadPendingApprovals();
      loadPendingCount();
    });
  });
  DOM.approvalList.querySelectorAll('[data-deny]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${WORKER_BASE}/admin/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.adminSessionToken },
        body: JSON.stringify({ email: btn.dataset.deny }),
      });
      toast(`${btn.dataset.deny} denied`, 'info');
      loadPendingApprovals();
      loadPendingCount();
    });
  });
}

async function loadUsers() {
  const res = await fetch(`${WORKER_BASE}/admin/users`, {
    headers: { 'X-Admin-Token': state.adminSessionToken },
  });
  if (!res.ok) return;
  const users = await res.json();
  const list = DOM.usersList;
  if (!users.length) {
    list.innerHTML = '<p style="color:var(--text-secondary);">No approved users.</p>';
    return;
  }
  list.innerHTML = users.map(u => `
    <div class="approval-item">
      <span>${u.email} <span style="color:var(--text-secondary);">(${u.role})</span></span>
      <div style="display:flex; gap:6px;">
        <select class="role-select-${u.email}" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border);">
          <option value="full" ${u.role === 'full' ? 'selected' : ''}>Full</option>
          <option value="delete" ${u.role === 'delete' ? 'selected' : ''}>Delete</option>
          <option value="download" ${u.role === 'download' ? 'selected' : ''}>Download</option>
          <option value="read" ${u.role === 'read' ? 'selected' : ''}>Read</option>
          <option value="none" ${u.role === 'none' ? 'selected' : ''}>None</option>
        </select>
        <button class="btn btn-sm" style="background:var(--accent); color:#fff;" data-update="${u.email}">Update</button>
        <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-revoke="${u.email}">Revoke</button>
      </div>
    </div>
  `).join('');
  attachUserEvents();
}

function attachUserEvents() {
  DOM.usersList.querySelectorAll('[data-update]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.update;
      const select = document.querySelector(`.role-select-${email}`);
      const role = select.value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.adminSessionToken },
        body: JSON.stringify({ email, role }),
      });
      toast(`Updated ${email}`, 'success');
      loadUsers();
    });
  });
  DOM.usersList.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Revoke access for ${btn.dataset.revoke}?`)) return;
      await fetch(`${WORKER_BASE}/admin/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': state.adminSessionToken },
        body: JSON.stringify({ email: btn.dataset.revoke }),
      });
      toast(`${btn.dataset.revoke} revoked`, 'success');
      loadUsers();
    });
  });
}

// =============================================================================
// Role‑Based UI
// =============================================================================
function applyPermissionsUI(role) {
  const canUpload = role === 'full' || role === 'delete' || role === 'download';
  DOM.dropzone.style.display = canUpload ? '' : 'none';
  document.querySelector('.hint-text').style.display = canUpload ? '' : 'none';
  // Force re-render to reflect button changes
  renderFileList();
}

function getAvailableActions(publicId) {
  if (state.isAdmin) return ['play', 'preview', 'download', 'delete', 'replace'];
  if (!state.userRole) return [];
  const file = state.currentFileList.find(f => f.publicId === publicId);
  if (!file) return [];
  const pt = previewType(file.fileType);
  const actions = [];
  if ((pt === 'video' || pt === 'audio') && ['full', 'delete', 'download', 'read'].includes(state.userRole)) {
    actions.push('play');
  }
  if (['image', 'pdf', 'text'].includes(pt) && ['full', 'delete', 'download', 'read'].includes(state.userRole)) {
    actions.push('preview');
  }
  if (['full', 'delete', 'download'].includes(state.userRole)) actions.push('download');
  if (['full', 'delete'].includes(state.userRole)) actions.push('delete');
  if (state.userRole === 'full') actions.push('replace');
  return actions;
}

// =============================================================================
// Drag & Drop, Paste, Keyboard Shortcuts
// =============================================================================
DOM.dropzone.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', e => {
  if (e.target.files.length) processFiles(e.target.files);
  DOM.fileInput.value = '';
});
DOM.dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.dropzone.classList.add('dragover');
});
DOM.dropzone.addEventListener('dragleave', () => DOM.dropzone.classList.remove('dragover'));
DOM.dropzone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
});

// Paste – handles any file type including images from clipboard
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    e.preventDefault();
    processFiles(files);
  }
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'u') { e.preventDefault(); DOM.fileInput.click(); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); DOM.searchInput.focus(); }
  if (e.key === 'Escape') {
    if (!DOM.previewOverlay.classList.contains('hidden')) closePreview();
    if (state.selectedFiles.size > 0) { state.selectedFiles.clear(); renderFileList(); updateBulkBar(); }
  }
});

// =============================================================================
// Upload Engine with Retry & Resume
// =============================================================================
async function processFiles(files) {
  for (const file of files) {
    const tempId = 'temp_' + Date.now() + Math.random();
    state.currentFileList.unshift({
      publicId: tempId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      size: file.size,
      uploadedAt: Date.now(),
    });
    renderFileList();
    try {
      await uploadFile(file, tempId);
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
      state.currentFileList = state.currentFileList.filter(f => f.publicId !== tempId);
      renderFileList();
    }
  }
  await refreshFileList();
}

async function uploadFile(file, tempId) {
  if (state.uploadAbortController) state.uploadAbortController.abort();
  state.uploadAbortController = new AbortController();
  const signal = state.uploadAbortController.signal;
  DOM.progressBox.classList.remove('hidden');

  try {
    // Initiate resumable upload
    const initRes = await fetch(`${WORKER_BASE}/upload-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
      }),
      signal,
    });
    if (!initRes.ok) {
      const errData = await initRes.json().catch(() => ({}));
      throw new Error(errData.error || `Init failed (HTTP ${initRes.status})`);
    }
    const { publicId } = await initRes.json();

    // Update temporary entry with real publicId
    const entry = state.currentFileList.find(f => f.publicId === tempId);
    if (entry) entry.publicId = publicId;
    renderFileList();

    // Check resume progress
    let uploaded = 0;
    try {
      const statusRes = await fetch(`${WORKER_BASE}/upload-status/${publicId}`, { signal });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.complete) {
          DOM.progressBox.classList.add('hidden');
          return;
        }
        uploaded = statusData.uploaded || 0;
      }
    } catch (e) { /* ignore */ }

    // Chunked upload
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
    while (uploaded < file.size) {
      if (signal.aborted) throw new Error('Cancelled');

      const end = Math.min(uploaded + CHUNK_SIZE - 1, file.size - 1);
      const chunk = file.slice(uploaded, end + 1);

      let retries = 0;
      let done = false;
      while (retries < 3 && !done) {
        try {
          const res = await fetch(`${WORKER_BASE}/upload-chunk/${publicId}`, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes ${uploaded}-${end}/${file.size}` },
            body: chunk,
            signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Chunk error HTTP ${res.status}`);
          if (data.complete) {
            done = true;
            break;
          }
          if (data.uploaded !== undefined) {
            uploaded = data.uploaded;
            updateProgress(uploaded, file.size);
            done = true;
          } else {
            throw new Error('Invalid chunk response');
          }
        } catch (err) {
          if (retries >= 2) throw err;
          retries++;
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }

      if (done && uploaded >= file.size - 1) break;

      if (!done) {
        // Fallback: re-check status
        const statusRes = await fetch(`${WORKER_BASE}/upload-status/${publicId}`, { signal });
        if (statusRes.ok) {
          const s = await statusRes.json();
          uploaded = s.uploaded || uploaded;
          updateProgress(uploaded, file.size);
        }
      }
    }
    toast(`${file.name} uploaded!`, 'success');
  } finally {
    DOM.progressBox.classList.add('hidden');
    state.uploadAbortController = null;
  }
}

function updateProgress(uploaded, total) {
  const pct = total ? Math.round((uploaded / total) * 100) : 0;
  DOM.progressFill.style.width = pct + '%';
  DOM.percentDisplay.textContent = pct + '%';
  DOM.sizeDisplay.textContent = `${fmtBytes(uploaded)} / ${fmtBytes(total)}`;
}

DOM.cancelUploadBtn.addEventListener('click', () => {
  if (state.uploadAbortController) {
    state.uploadAbortController.abort();
    state.uploadAbortController = null;
    DOM.progressBox.classList.add('hidden');
  }
});

// =============================================================================
// File List Management
// =============================================================================
async function refreshFileList() {
  try {
    const res = await fetch(`${WORKER_BASE}/list`);
    if (!res.ok) throw new Error('List failed');
    const serverFiles = await res.json();
    // Merge with any optimistic entries that haven't been replaced yet
    const optimistic = state.currentFileList.filter(f => f.publicId?.startsWith('temp_'));
    const serverIds = new Set(serverFiles.map(f => f.publicId));
    state.currentFileList = [
      ...optimistic.filter(f => !serverIds.has(f.publicId)),
      ...serverFiles,
    ];
    updateStats();
    renderFileList();
  } catch (e) {
    console.error('List error:', e);
  }
}

function updateStats() {
  const real = state.currentFileList.filter(f => !f.publicId?.startsWith('temp_'));
  const totalSize = real.reduce((sum, f) => sum + (f.size || 0), 0);
  DOM.storageStats.textContent = `${real.length} file${real.length !== 1 ? 's' : ''} · ${fmtBytes(totalSize)}`;
}

function renderFileList() {
  let files = [...state.currentFileList];

  // Apply search filter
  if (state.searchQuery) {
    files = files.filter(f => f.fileName.toLowerCase().includes(state.searchQuery.toLowerCase()));
  }

  // Apply sort
  switch (state.sortOrder) {
    case 'newest':
      files.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      break;
    case 'oldest':
      files.sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0));
      break;
    case 'name-asc':
      files.sort((a, b) => a.fileName.localeCompare(b.fileName));
      break;
    case 'name-desc':
      files.sort((a, b) => b.fileName.localeCompare(a.fileName));
      break;
    case 'size-desc':
      files.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case 'size-asc':
      files.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
  }

  DOM.fileGrid.innerHTML = '';

  if (!files.length) {
    DOM.fileGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-secondary);">${
      state.searchQuery ? 'No files match your search.' : 'No files yet. Upload or Sync.'
    }</p>`;
    return;
  }

  files.forEach(f => {
    const isUploading = f.publicId?.startsWith('temp_');
    const actions = getAvailableActions(f.publicId);
    const card = document.createElement('div');
    card.className = `card${isUploading ? ' uploading' : ''}${state.selectedFiles.has(f.publicId) ? ' selected' : ''}`;
    card.dataset.publicId = f.publicId;

    card.innerHTML = `
      ${!isUploading ? `<input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${state.selectedFiles.has(f.publicId) ? 'checked' : ''}>` : ''}
      <div class="file-icon">${getIcon(f.fileType)}</div>
      <div class="file-name">${esc(f.fileName)}</div>
      <div class="file-meta">
        ${fmtBytes(f.size)} · ${new Date(f.uploadedAt).toLocaleString()}
        ${isUploading ? ' · <em>Uploading...</em>' : ''}
      </div>
      <div class="actions">
        ${actions.includes('play') ? `<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>` : ''}
        ${actions.includes('preview') ? `<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>` : ''}
        ${actions.includes('download') ? `<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇</button>` : ''}
        ${actions.includes('delete') ? `<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑</button>` : ''}
        ${actions.includes('replace') ? `<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄</button>` : ''}
      </div>`;
    DOM.fileGrid.appendChild(card);
  });

  // Attach action button listeners
  DOM.fileGrid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'play') openPreview(id, 'video');
      else if (action === 'preview') {
        const file = state.currentFileList.find(f => f.publicId === id);
        openPreview(id, previewType(file?.fileType));
      } else if (action === 'download') downloadFile(id);
      else if (action === 'delete') deleteFile(id);
      else if (action === 'replace') replaceFile(id);
    });
  });

  // Checkbox selection logic
  DOM.fileGrid.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('click', e => {
      e.stopPropagation();
      const id = cb.dataset.id;
      if (cb.checked) state.selectedFiles.add(id);
      else state.selectedFiles.delete(id);
      updateBulkBar();
      // Re-render to update selected styling
      renderFileList();
    });
  });

  // Card click to toggle selection
  DOM.fileGrid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      const id = card.dataset.publicId;
      if (!id || id.startsWith('temp_')) return;
      if (state.selectedFiles.has(id)) state.selectedFiles.delete(id);
      else state.selectedFiles.add(id);
      updateBulkBar();
      renderFileList();
    });
  });

  updateBulkBar();
}

function updateBulkBar() {
  if (state.selectedFiles.size > 0) {
    DOM.bulkBar.classList.remove('hidden');
    DOM.bulkCount.textContent = `${state.selectedFiles.size} selected`;
  } else {
    DOM.bulkBar.classList.add('hidden');
  }
}

// =============================================================================
// Bulk Actions
// =============================================================================
document.getElementById('btnBulkCancel').addEventListener('click', () => {
  state.selectedFiles.clear();
  renderFileList();
  updateBulkBar();
});

document.getElementById('btnBulkDelete').addEventListener('click', async () => {
  if (!confirm(`Delete ${state.selectedFiles.size} file(s)?`)) return;
  let failed = 0;
  for (const id of state.selectedFiles) {
    try {
      const res = await fetch(`${WORKER_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: id }),
      });
      if (!res.ok) failed++;
    } catch (e) { failed++; }
  }
  state.selectedFiles.clear();
  updateBulkBar();
  await refreshFileList();
  if (failed) toast(`Deleted with ${failed} failure(s)`, 'error');
  else toast('Files deleted', 'success');
});

// =============================================================================
// Search & Sort
// =============================================================================
DOM.searchInput.addEventListener('input', () => {
  state.searchQuery = DOM.searchInput.value.trim().toLowerCase();
  renderFileList();
});

DOM.sortSelect.addEventListener('change', () => {
  state.sortOrder = DOM.sortSelect.value;
  localStorage.setItem('sortOrder', state.sortOrder);
  renderFileList();
});

// Restore saved sort order
DOM.sortSelect.value = state.sortOrder;

// =============================================================================
// Preview Overlay (Video, Image, PDF, Text)
// =============================================================================
function openPreview(publicId, type) {
  DOM.previewContainer.innerHTML = '';
  const url = `${WORKER_BASE}/video/${publicId}`;

  if (type === 'video' || type === 'audio') {
    const media = document.createElement(type === 'audio' ? 'audio' : 'video');
    media.src = url;
    media.controls = true;
    media.playsInline = true;
    media.style.maxWidth = '95%';
    media.style.maxHeight = '95%';
    if (type === 'audio') {
      media.style.width = '500px';
      media.style.maxHeight = '80px';
    }
    DOM.previewContainer.appendChild(media);
    media.play().catch(() => {});
  } else if (type === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '95%';
    img.style.maxHeight = '95%';
    img.style.objectFit = 'contain';
    DOM.previewContainer.appendChild(img);
  } else if (type === 'pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '90%';
    iframe.style.height = '90%';
    DOM.previewContainer.appendChild(iframe);
  } else if (type === 'text') {
    fetch(url)
      .then(r => r.text())
      .then(text => {
        const pre = document.createElement('pre');
        pre.textContent = text;
        DOM.previewContainer.appendChild(pre);
      })
      .catch(() => {
        DOM.previewContainer.innerHTML = '<p style="color:#fff;">Failed to load text.</p>';
      });
  } else {
    // Fallback to download
    downloadFile(publicId);
    return;
  }

  DOM.previewOverlay.classList.remove('hidden');
  // Focus trap for keyboard
  DOM.previewContainer.querySelector('video, audio')?.focus();
}

function closePreview() {
  DOM.previewContainer.innerHTML = '';
  DOM.previewOverlay.classList.add('hidden');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}

DOM.btnClosePreview.addEventListener('click', closePreview);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !DOM.previewOverlay.classList.contains('hidden')) {
    closePreview();
  }
});

DOM.btnFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    DOM.previewOverlay.requestFullscreen();
  }
});

// =============================================================================
// Download, Delete, Replace Actions
// =============================================================================
function downloadFile(publicId) {
  const a = document.createElement('a');
  a.href = `${WORKER_BASE}/download/${publicId}`;
  a.download = ''; // Browser will use the filename from Content-Disposition
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function deleteFile(publicId) {
  if (!confirm('Permanently delete this file?')) return;
  const res = await fetch(`${WORKER_BASE}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId }),
  });
  if (res.ok) {
    state.currentFileList = state.currentFileList.filter(f => f.publicId !== publicId);
    state.selectedFiles.delete(publicId);
    renderFileList();
    updateBulkBar();
    updateStats();
    toast('File deleted', 'success');
  } else {
    const err = await res.json().catch(() => ({}));
    toast('Delete failed: ' + (err.error || 'Unknown'), 'error');
  }
}

function replaceFile(publicId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      DOM.progressBox.classList.remove('hidden');

      // Initiate update session
      const initRes = await fetch(`${WORKER_BASE}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
        }),
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Update init failed');
      }
      const { publicId: newPid } = await initRes.json();

      // Upload the file using the new session
      let uploaded = 0;
      const CHUNK_SIZE = 10 * 1024 * 1024;
      while (uploaded < file.size) {
        const end = Math.min(uploaded + CHUNK_SIZE - 1, file.size - 1);
        const chunk = file.slice(uploaded, end + 1);
        let retries = 0, done = false;
        while (retries < 3 && !done) {
          try {
            const res = await fetch(`${WORKER_BASE}/upload-chunk/${newPid}`, {
              method: 'PUT',
              headers: { 'Content-Range': `bytes ${uploaded}-${end}/${file.size}` },
              body: chunk,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Chunk error');
            if (data.complete) { done = true; break; }
            if (data.uploaded !== undefined) {
              uploaded = data.uploaded;
              updateProgress(uploaded, file.size);
              done = true;
            } else throw new Error('Invalid chunk response');
          } catch (err) {
            if (retries >= 2) throw err;
            retries++;
            await new Promise(r => setTimeout(r, 1000 * retries));
          }
        }
        if (done && uploaded >= file.size - 1) break;
      }
      await refreshFileList();
      toast('File replaced!', 'success');
    } catch (err) {
      toast('Replace failed: ' + err.message, 'error');
    } finally {
      DOM.progressBox.classList.add('hidden');
    }
  };
  input.click();
}

// =============================================================================
// Real‑time Polling for Role & Approval Changes
// =============================================================================
function startRolePolling() {
  if (state.rolePollInterval) clearInterval(state.rolePollInterval);
  state.rolePollInterval = setInterval(async () => {
    if (!state.userToken || !state.userApproved) return;
    try {
      const res = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
      if (!res.ok) return;
      const info = await res.json();
      if (info.role !== state.userRole) {
        state.userRole = info.role;
        toast(`Permissions updated to: ${state.userRole}`, 'info');
        applyPermissionsUI(state.userRole);
        if (state.userRole === 'none') {
          // Show revoked screen
          DOM.fileGrid.innerHTML = '<p style="text-align:center; padding:2rem;">Your access has been revoked.</p>';
          DOM.dropzone.style.display = 'none';
          document.querySelector('.hint-text').style.display = 'none';
          clearInterval(state.rolePollInterval);
        }
      }
    } catch (e) { /* ignore */ }
  }, 5000);
}

function startApprovalPolling() {
  if (state.approvalPollInterval) clearInterval(state.approvalPollInterval);
  state.approvalPollInterval = setInterval(async () => {
    if (!state.userToken) return;
    try {
      const res = await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
      if (!res.ok) return;
      const info = await res.json();
      if (info.approved) {
        state.userApproved = true;
        state.userRole = info.role;
        clearInterval(state.approvalPollInterval);
        toast('You have been approved!', 'success');
        renderMainApp();
        applyPermissionsUI(state.userRole);
        refreshFileList();
        startRolePolling();
      }
    } catch (e) { /* ignore */ }
  }, 10000);
}

// =============================================================================
// Start the Application
// =============================================================================
init();
