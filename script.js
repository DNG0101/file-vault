// ======================== CONFIGURATION ========================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev'; // Replace with your domain

// ======================== GLOBAL STATE ========================
let currentFileList = [];
let selectedFiles = new Set();
let sortOrder = 'newest';
let searchQuery = '';
let userEmail = null;
let userApproved = false;
let userRole = null;
let userToken = null;
let isAdmin = false;
let adminSessionToken = null;
let uploadAbortController = null;
let rolePollInterval, approvalPollInterval;

// ======================== DOM REFS ========================
const $ = id => document.getElementById(id);
const adminUI = $('adminUI');
const adminBar = $('adminBar');
const storageStats = $('storageStats');
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const progressBox = $('progressBox');
const progressFill = $('progressFill');
const percentDisplay = $('percentDisplay');
const sizeDisplay = $('sizeDisplay');
const cancelBtn = $('cancelUpload');
const fileGrid = $('fileGrid');
const previewOverlay = $('previewOverlay');
const previewContainer = $('previewContainer');
const btnFullscreen = $('btnFullscreen');
const btnClosePreview = $('btnClosePreview');
const searchInput = $('searchInput');
const sortSelect = $('sortSelect');
const bulkBar = $('bulkBar');
const bulkCount = $('bulkCount');
const toastContainer = $('toastContainer');
const btnDarkMode = $('btnDarkMode');

// ======================== UTILITY FUNCTIONS ========================
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B','KB','MB','GB','TB']; let i = 0, s = bytes;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return s.toFixed(1) + ' ' + u[i];
}

function getIcon(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime.startsWith('text/')) return '📝';
  return '📄';
}

function previewType(mime) {
  if (!mime) return 'other';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return 'other';
}

// ======================== DARK MODE ========================
(function() {
  if (localStorage.getItem('darkMode') === 'true') document.documentElement.setAttribute('data-theme', 'dark');
  btnDarkMode.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('darkMode', next === 'dark');
  });
})();

// ======================== INIT ========================
async function init() {
  const params = new URLSearchParams(location.search);
  const utoken = params.get('utoken');
  const admToken = params.get('admin_token');

  if (admToken) {
    adminSessionToken = admToken;
    isAdmin = true;
    history.replaceState({}, '', location.pathname);
    localStorage.setItem('adminSessionToken', admToken);
    renderMainApp();
    adminBar.classList.remove('hidden');
    await loadPendingCount();
    await refreshFileList();
    return;
  }

  if (utoken) {
    userToken = utoken;
    history.replaceState({}, '', location.pathname);
    await checkUserInfo();
    if (userApproved) {
      renderMainApp();
      applyPermissionsUI(userRole);
      await refreshFileList();
      startRolePolling();
    } else {
      renderApprovalScreen();
      startApprovalPolling();
    }
    return;
  }

  const savedAdmin = localStorage.getItem('adminSessionToken');
  if (savedAdmin) {
    try {
      const res = await fetch(`${WORKER_BASE}/admin-session?token=${savedAdmin}`);
      if ((await res.json()).admin) {
        adminSessionToken = savedAdmin;
        isAdmin = true;
        renderMainApp();
        adminBar.classList.remove('hidden');
        await loadPendingCount();
        await refreshFileList();
        return;
      } else {
        localStorage.removeItem('adminSessionToken');
      }
    } catch (e) {}
  }

  renderLoginScreen();
}

async function checkUserInfo() {
  if (!userToken) return;
  try {
    const res = await fetch(`${WORKER_BASE}/user-info?utoken=${userToken}`);
    if (!res.ok) throw new Error('Failed');
    const info = await res.json();
    userEmail = info.email;
    userApproved = info.approved;
    userRole = info.role;
  } catch (e) {
    toast('Failed to load user info', 'error');
  }
}

function renderLoginScreen() {
  adminBar.classList.add('hidden');
  adminUI.innerHTML = '';
  fileGrid.innerHTML = `<div class="login-box" style="grid-column:1/-1;text-align:center;padding:60px 20px;">
    <h2>Welcome to File Vault</h2>
    <p style="color:var(--text-secondary); margin:16px 0;">Choose how to access:</p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button class="btn btn-primary" id="adminLoginBtn">🔑 Admin Login</button>
      <button class="btn btn-outline" id="userLoginBtn">👤 User Login</button>
    </div>
  </div>`;
  document.querySelector('.hint-text').style.display = 'none';
  storageStats.textContent = '';
  $('adminLoginBtn').addEventListener('click', async () => {
    const res = await fetch(`${WORKER_BASE}/admin-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
  $('userLoginBtn').addEventListener('click', async () => {
    const res = await fetch(`${WORKER_BASE}/user-auth-url`);
    window.location.href = (await res.json()).authUrl;
  });
}

function renderApprovalScreen() {
  adminBar.classList.add('hidden');
  adminUI.innerHTML = '';
  fileGrid.innerHTML = `<div class="login-box" style="grid-column:1/-1;text-align:center;padding:60px 20px;">
    <h2>🔐 Waiting for Approval</h2>
    <p style="margin-top:8px;">Your email: <strong>${userEmail}</strong></p>
    <p style="color:var(--text-secondary);">Your access is pending. The admin will review your request.</p>
    <p style="margin-top:16px;font-size:0.9rem;">You can refresh this page or wait – permissions will update automatically.</p>
    <button class="btn btn-outline btn-sm" onclick="location.reload()" style="margin-top:12px;">🔄 Check Again</button>
  </div>`;
  document.querySelector('.hint-text').style.display = 'none';
  storageStats.textContent = '';
}

function renderMainApp() {
  document.querySelector('.hint-text').style.display = 'block';
  if (!isAdmin) {
    adminBar.classList.add('hidden');
    adminUI.innerHTML = userEmail ? `<span style="font-size:0.85rem;color:var(--text-secondary);">👤 ${userEmail} (${userRole || ''})</span>` : '';
  }
}

// ======================== ADMIN BAR ========================
$('btnSync').addEventListener('click', async () => {
  toast('Syncing files from storage…', 'info');
  const res = await fetch(`${WORKER_BASE}/sync`, { method: 'POST' });
  if (res.ok) { await refreshFileList(); toast('Sync complete!', 'success'); }
  else toast('Sync failed', 'error');
});

$('btnApprovals').addEventListener('click', () => {
  const panel = $('approvalPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadPendingApprovals();
});

$('btnUsers').addEventListener('click', () => {
  const panel = $('usersPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadUsers();
});

$('btnUnauthorize').addEventListener('click', async () => {
  if (!confirm('Logout as admin? The vault will still work for users.')) return;
  if (adminSessionToken) {
    await fetch(`${WORKER_BASE}/admin-logout`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ admin_token: adminSessionToken })
    });
  }
  localStorage.removeItem('adminSessionToken');
  isAdmin = false;
  adminSessionToken = null;
  adminBar.classList.add('hidden');
  adminUI.innerHTML = '';
  toast('Admin logged out', 'info');
  if (!userEmail) renderLoginScreen();
});

async function loadPendingCount() {
  if (!adminSessionToken) return;
  const res = await fetch(`${WORKER_BASE}/admin/pending`, { headers: {'X-Admin-Token':adminSessionToken} });
  const emails = await res.json();
  const badge = $('pendingBadge');
  if (emails.length) { badge.textContent = emails.length; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

async function loadPendingApprovals() {
  const res = await fetch(`${WORKER_BASE}/admin/pending`, { headers: {'X-Admin-Token':adminSessionToken} });
  const emails = await res.json();
  const list = $('approvalList');
  if (!emails.length) { list.innerHTML = '<p style="color:var(--text-secondary);">No pending users.</p>'; return; }
  list.innerHTML = emails.map(email => `
    <div class="approval-item">
      <span>${email}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <select class="role-select" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);">
          <option value="full">Full</option>
          <option value="delete">Delete</option>
          <option value="download">Download</option>
          <option value="read">Read</option>
          <option value="none">None</option>
        </select>
        <button class="btn btn-sm" style="background:var(--success);color:#fff;" data-approve="${email}">✅ Approve</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-deny="${email}">❌ Deny</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const role = btn.closest('.approval-item').querySelector('.role-select').value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':adminSessionToken},
        body: JSON.stringify({ email: btn.dataset.approve, role })
      });
      toast(`${btn.dataset.approve} approved as ${role}`, 'success');
      loadPendingApprovals();
      loadPendingCount();
    });
  });
  list.querySelectorAll('[data-deny]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${WORKER_BASE}/admin/deny`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':adminSessionToken},
        body: JSON.stringify({ email: btn.dataset.deny })
      });
      toast(`${btn.dataset.deny} denied`, 'info');
      loadPendingApprovals();
      loadPendingCount();
    });
  });
}

async function loadUsers() {
  const res = await fetch(`${WORKER_BASE}/admin/users`, { headers: {'X-Admin-Token':adminSessionToken} });
  const users = await res.json();
  const list = $('usersList');
  if (!users.length) { list.innerHTML = '<p style="color:var(--text-secondary);">No approved users.</p>'; return; }
  list.innerHTML = users.map(u => `
    <div class="approval-item">
      <span>${u.email} <span style="color:var(--text-secondary);">(${u.role})</span></span>
      <div style="display:flex;gap:6px;">
        <select class="role-select-${u.email}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);">
          <option value="full" ${u.role==='full'?'selected':''}>Full</option>
          <option value="delete" ${u.role==='delete'?'selected':''}>Delete</option>
          <option value="download" ${u.role==='download'?'selected':''}>Download</option>
          <option value="read" ${u.role==='read'?'selected':''}>Read</option>
          <option value="none" ${u.role==='none'?'selected':''}>None</option>
        </select>
        <button class="btn btn-sm" style="background:var(--accent);color:#fff;" data-update="${u.email}">Update</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-revoke="${u.email}">Revoke</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('[data-update]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.update;
      const select = document.querySelector(`.role-select-${email}`);
      const role = select.value;
      await fetch(`${WORKER_BASE}/admin/approve`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':adminSessionToken},
        body: JSON.stringify({ email, role })
      });
      toast(`Updated ${email}`, 'success');
      loadUsers();
    });
  });
  list.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Revoke access for ${btn.dataset.revoke}?`)) return;
      await fetch(`${WORKER_BASE}/admin/revoke`, {
        method:'POST', headers:{'Content-Type':'application/json','X-Admin-Token':adminSessionToken},
        body: JSON.stringify({ email: btn.dataset.revoke })
      });
      toast(`${btn.dataset.revoke} revoked`, 'success');
      loadUsers();
    });
  });
}

// ======================== ROLE UI ========================
function applyPermissionsUI(role) {
  const canUpload = role === 'full' || role === 'delete' || role === 'download';
  dropzone.style.display = canUpload ? '' : 'none';
  document.querySelector('.hint-text').style.display = canUpload ? '' : 'none';
  renderFileList();
}

function getAvailableActions(publicId) {
  if (isAdmin) return ['play','preview','download','delete','replace'];
  if (!userRole) return [];
  const file = currentFileList.find(f => f.publicId === publicId);
  if (!file) return [];
  const pt = previewType(file.fileType);
  const actions = [];
  if ((pt==='video'||pt==='audio') && ['full','delete','download','read'].includes(userRole)) actions.push('play');
  if (['image','pdf','text'].includes(pt) && ['full','delete','download','read'].includes(userRole)) actions.push('preview');
  if (['full','delete','download'].includes(userRole)) actions.push('download');
  if (['full','delete'].includes(userRole)) actions.push('delete');
  if (userRole === 'full') actions.push('replace');
  return actions;
}

// ======================== DRAG & DROP, PASTE, KEYBOARD ========================
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files.length) processFiles(e.target.files);
  fileInput.value = '';
});
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
});
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) { e.preventDefault(); processFiles(files); }
});
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'u') { e.preventDefault(); fileInput.click(); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchInput.focus(); }
  if (e.key === 'Escape') {
    if (!previewOverlay.classList.contains('hidden')) closePreview();
    if (selectedFiles.size) { selectedFiles.clear(); renderFileList(); updateBulkBar(); }
  }
});

// ======================== UPLOAD ENGINE ========================
async function processFiles(files) {
  for (const file of files) {
    const tempId = 'temp_' + Date.now() + Math.random();
    currentFileList.unshift({ publicId: tempId, fileName: file.name, fileType: file.type || 'application/octet-stream', size: file.size, uploadedAt: Date.now() });
    renderFileList();
    try { await uploadFile(file, tempId); } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
      currentFileList = currentFileList.filter(f => f.publicId !== tempId);
      renderFileList();
    }
  }
  await refreshFileList();
}

async function uploadFile(file, tempId) {
  if (uploadAbortController) uploadAbortController.abort();
  uploadAbortController = new AbortController();
  const signal = uploadAbortController.signal;
  progressBox.classList.remove('hidden');

  try {
    const initRes = await fetch(`${WORKER_BASE}/upload-init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, fileType: file.type || 'application/octet-stream' }),
      signal,
    });
    if (!initRes.ok) throw new Error(((await initRes.json().catch(()=>({}))).error) || 'Init failed');
    const { publicId } = await initRes.json();
    const entry = currentFileList.find(f => f.publicId === tempId);
    if (entry) entry.publicId = publicId;
    renderFileList();

    let uploaded = 0;
    try {
      const statusRes = await fetch(`${WORKER_BASE}/upload-status/${publicId}`, { signal });
      if (statusRes.ok) {
        const d = await statusRes.json();
        if (d.complete) { progressBox.classList.add('hidden'); return; }
        uploaded = d.uploaded || 0;
      }
    } catch (e) {}

    const CHUNK = 10 * 1024 * 1024;
    while (uploaded < file.size) {
      if (signal.aborted) throw new Error('Cancelled');
      const end = Math.min(uploaded + CHUNK - 1, file.size - 1);
      const chunk = file.slice(uploaded, end + 1);
      let retries = 0, done = false;
      while (retries < 3 && !done) {
        try {
          const res = await fetch(`${WORKER_BASE}/upload-chunk/${publicId}`, {
            method: 'PUT', headers: { 'Content-Range': `bytes ${uploaded}-${end}/${file.size}` }, body: chunk, signal,
          });
          const data = await res.json().catch(()=>({}));
          if (!res.ok) throw new Error(data.error || `Chunk error`);
          if (data.complete) { done = true; break; }
          if (data.uploaded !== undefined) { uploaded = data.uploaded; updateProgress(uploaded, file.size); done = true; }
        } catch (err) { if (retries >= 2) throw err; retries++; await new Promise(r => setTimeout(r, 1000 * retries)); }
      }
      if (done && uploaded >= file.size - 1) break;
      if (!done) {
        const statusRes = await fetch(`${WORKER_BASE}/upload-status/${publicId}`, { signal });
        if (statusRes.ok) { const s = await statusRes.json(); uploaded = s.uploaded || uploaded; updateProgress(uploaded, file.size); }
      }
    }
    toast(`${file.name} uploaded!`, 'success');
  } finally { progressBox.classList.add('hidden'); uploadAbortController = null; }
}

function updateProgress(uploaded, total) {
  const pct = total ? Math.round((uploaded / total) * 100) : 0;
  progressFill.style.width = pct + '%';
  percentDisplay.textContent = pct + '%';
  sizeDisplay.textContent = `${fmtBytes(uploaded)} / ${fmtBytes(total)}`;
}
cancelBtn.addEventListener('click', () => {
  if (uploadAbortController) { uploadAbortController.abort(); uploadAbortController = null; progressBox.classList.add('hidden'); }
});

// ======================== FILE LIST ========================
async function refreshFileList() {
  try {
    const res = await fetch(`${WORKER_BASE}/list`);
    if (!res.ok) throw new Error('List failed');
    const serverFiles = await res.json();
    const optimistic = currentFileList.filter(f => f.publicId?.startsWith('temp_'));
    const serverIds = new Set(serverFiles.map(f => f.publicId));
    currentFileList = [...optimistic.filter(f => !serverIds.has(f.publicId)), ...serverFiles];
    updateStats();
    renderFileList();
  } catch (e) { console.error(e); }
}

function updateStats() {
  const real = currentFileList.filter(f => !f.publicId?.startsWith('temp_'));
  storageStats.textContent = `${real.length} file${real.length !== 1 ? 's' : ''} · ${fmtBytes(real.reduce((a, b) => a + (b.size || 0), 0))}`;
}

function renderFileList() {
  let files = [...currentFileList];
  if (searchQuery) files = files.filter(f => f.fileName.toLowerCase().includes(searchQuery.toLowerCase()));
  switch (sortOrder) {
    case 'newest': files.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)); break;
    case 'oldest': files.sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0)); break;
    case 'name-asc': files.sort((a, b) => a.fileName.localeCompare(b.fileName)); break;
    case 'name-desc': files.sort((a, b) => b.fileName.localeCompare(a.fileName)); break;
    case 'size-desc': files.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
    case 'size-asc': files.sort((a, b) => (a.size || 0) - (b.size || 0)); break;
  }
  fileGrid.innerHTML = '';
  if (!files.length) {
    fileGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-secondary);">${searchQuery ? 'No files match.' : 'No files yet. Upload or Sync.'}</p>`;
    return;
  }
  files.forEach(f => {
    const isUp = f.publicId?.startsWith('temp_');
    const actions = getAvailableActions(f.publicId);
    const card = document.createElement('div');
    card.className = `card${isUp ? ' uploading' : ''}${selectedFiles.has(f.publicId) ? ' selected' : ''}`;
    card.dataset.publicId = f.publicId;
    card.innerHTML = `
      ${!isUp ? `<input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${selectedFiles.has(f.publicId) ? 'checked' : ''}>` : ''}
      <div class="file-icon">${getIcon(f.fileType)}</div>
      <div class="file-name">${esc(f.fileName)}</div>
      <div class="file-meta">${fmtBytes(f.size)} · ${new Date(f.uploadedAt).toLocaleString()}${isUp ? ' · Uploading...' : ''}</div>
      <div class="actions">
        ${actions.includes('play') ? `<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>` : ''}
        ${actions.includes('preview') ? `<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>` : ''}
        ${actions.includes('download') ? `<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇</button>` : ''}
        ${actions.includes('delete') ? `<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑</button>` : ''}
        ${actions.includes('replace') ? `<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄</button>` : ''}
      </div>`;
    fileGrid.appendChild(card);
  });

  fileGrid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action, id = btn.dataset.id;
      if (action === 'play') openPreview(id, 'video');
      else if (action === 'preview') openPreview(id, previewType(currentFileList.find(f => f.publicId === id)?.fileType));
      else if (action === 'download') downloadFile(id);
      else if (action === 'delete') deleteFile(id);
      else if (action === 'replace') replaceFile(id);
    });
  });

  fileGrid.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('click', e => {
      e.stopPropagation();
      if (cb.checked) selectedFiles.add(cb.dataset.id); else selectedFiles.delete(cb.dataset.id);
      updateBulkBar();
      renderFileList();
    });
  });
  fileGrid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      const id = card.dataset.publicId;
      if (!id || id.startsWith('temp_')) return;
      if (selectedFiles.has(id)) selectedFiles.delete(id); else selectedFiles.add(id);
      updateBulkBar();
      renderFileList();
    });
  });
  updateBulkBar();
}

function updateBulkBar() {
  if (selectedFiles.size) { bulkBar.classList.remove('hidden'); bulkCount.textContent = `${selectedFiles.size} selected`; }
  else bulkBar.classList.add('hidden');
}
$('btnBulkCancel').addEventListener('click', () => { selectedFiles.clear(); renderFileList(); updateBulkBar(); });
$('btnBulkDelete').addEventListener('click', async () => {
  if (!confirm(`Delete ${selectedFiles.size} file(s)?`)) return;
  for (const id of selectedFiles) {
    await fetch(`${WORKER_BASE}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId: id }) }).catch(() => {});
  }
  selectedFiles.clear(); updateBulkBar(); await refreshFileList(); toast('Deleted', 'success');
});

searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderFileList(); });
sortSelect.addEventListener('change', () => { sortOrder = sortSelect.value; renderFileList(); });

// ======================== PREVIEW ========================
function openPreview(publicId, type) {
  previewContainer.innerHTML = '';
  const url = `${WORKER_BASE}/video/${publicId}`;
  if (type === 'video' || type === 'audio') {
    const media = document.createElement(type === 'audio' ? 'audio' : 'video');
    media.src = url; media.controls = true; media.playsInline = true;
    media.style.maxWidth = '95%'; media.style.maxHeight = '95%';
    previewContainer.appendChild(media);
    media.play().catch(() => {});
  } else if (type === 'image') {
    const img = document.createElement('img'); img.src = url; img.style.maxWidth = '95%'; img.style.maxHeight = '95%'; img.style.objectFit = 'contain';
    previewContainer.appendChild(img);
  } else if (type === 'pdf') {
    const iframe = document.createElement('iframe'); iframe.src = url; iframe.style.width = '90%'; iframe.style.height = '90%';
    previewContainer.appendChild(iframe);
  } else if (type === 'text') {
    fetch(url).then(r => r.text()).then(t => {
      const pre = document.createElement('pre'); pre.textContent = t; previewContainer.appendChild(pre);
    }).catch(() => { previewContainer.innerHTML = '<p style="color:#fff;">Failed to load</p>'; });
  } else { downloadFile(publicId); return; }
  previewOverlay.classList.remove('hidden');
}
function closePreview() {
  previewContainer.innerHTML = '';
  previewOverlay.classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen();
}
btnClosePreview.addEventListener('click', closePreview);
btnFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else previewOverlay.requestFullscreen();
});

function downloadFile(publicId) {
  const a = document.createElement('a');
  a.href = `${WORKER_BASE}/download/${publicId}`;
  a.download = '';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function deleteFile(publicId) {
  if (!confirm('Delete?')) return;
  const res = await fetch(`${WORKER_BASE}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId }) });
  if (res.ok) {
    currentFileList = currentFileList.filter(f => f.publicId !== publicId);
    selectedFiles.delete(publicId); renderFileList(); updateBulkBar(); updateStats();
    toast('Deleted', 'success');
  } else toast('Delete failed', 'error');
}

function replaceFile(publicId) {
  const input = document.createElement('input'); input.type = 'file';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      progressBox.classList.remove('hidden');
      const initRes = await fetch(`${WORKER_BASE}/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId, fileName: file.name, fileType: file.type || 'application/octet-stream' })
      });
      if (!initRes.ok) throw new Error(((await initRes.json().catch(()=>({}))).error) || 'Update init failed');
      const { publicId: newPid } = await initRes.json();
      let uploaded = 0;
      const CHUNK = 10 * 1024 * 1024;
      while (uploaded < file.size) {
        const end = Math.min(uploaded + CHUNK - 1, file.size - 1);
        const chunk = file.slice(uploaded, end + 1);
        let retries = 0, done = false;
        while (retries < 3 && !done) {
          try {
            const res = await fetch(`${WORKER_BASE}/upload-chunk/${newPid}`, {
              method: 'PUT', headers: { 'Content-Range': `bytes ${uploaded}-${end}/${file.size}` }, body: chunk
            });
            const data = await res.json().catch(()=>({}));
            if (!res.ok) throw new Error(data.error || 'Chunk error');
            if (data.complete) { done = true; break; }
            if (data.uploaded !== undefined) { uploaded = data.uploaded; updateProgress(uploaded, file.size); done = true; }
          } catch (err) { if (retries >= 2) throw err; retries++; await new Promise(r => setTimeout(r, 1000 * retries)); }
        }
        if (done && uploaded >= file.size - 1) break;
      }
      await refreshFileList();
      toast('File replaced!', 'success');
    } catch (err) { toast('Replace failed: ' + err.message, 'error'); }
    finally { progressBox.classList.add('hidden'); }
  };
  input.click();
}

// ======================== POLLING ========================
function startRolePolling() {
  if (rolePollInterval) clearInterval(rolePollInterval);
  rolePollInterval = setInterval(async () => {
    if (!userToken || !userApproved) return;
    try {
      const res = await fetch(`${WORKER_BASE}/user-info?utoken=${userToken}`);
      const info = await res.json();
      if (info.role !== userRole) {
        userRole = info.role;
        toast(`Permissions updated to: ${userRole}`, 'info');
        applyPermissionsUI(userRole);
        if (userRole === 'none') {
          fileGrid.innerHTML = '<p style="text-align:center;padding:2rem;">Access revoked.</p>';
          dropzone.style.display = 'none';
          document.querySelector('.hint-text').style.display = 'none';
          clearInterval(rolePollInterval);
        }
      }
    } catch (e) {}
  }, 5000);
}

function startApprovalPolling() {
  if (approvalPollInterval) clearInterval(approvalPollInterval);
  approvalPollInterval = setInterval(async () => {
    if (!userToken) return;
    try {
      const res = await fetch(`${WORKER_BASE}/user-info?utoken=${userToken}`);
      const info = await res.json();
      if (info.approved) {
        userApproved = true;
        userRole = info.role;
        clearInterval(approvalPollInterval);
        toast('You have been approved!', 'success');
        renderMainApp();
        applyPermissionsUI(userRole);
        await refreshFileList();
        startRolePolling();
      }
    } catch (e) {}
  }, 10000);
}

// ======================== INIT ========================
init();
