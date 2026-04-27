// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const ST = {
    token: localStorage.getItem('vtoken') || null,
    email: null,
    isAdmin: false,
    approved: false,
    role: null,
    files: [],
    selected: new Set(),
    sort: localStorage.getItem('sort') || 'newest',
    query: '',
    uploadCtrl: null,
    dark: localStorage.getItem('darkMode') === 'true',
    pollTimers: { files: null, admin: null, role: null },
    shareToken: null,
};

// ==================== DOM Elements ====================
const $ = id => document.getElementById(id);
const D = {
    stats: $('storageStats'), userUI: $('userUI'), adminBar: $('adminBar'),
    dropzone: $('dropzone'), fileInp: $('fileInput'), progBox: $('progressBox'),
    progFill: $('progressFill'), pctDisp: $('percentDisplay'), sizeDisp: $('sizeDisplay'),
    cancelBtn: $('cancelUpload'), grid: $('fileGrid'), prevOv: $('previewOverlay'),
    prevCont: $('previewContainer'), btnFull: $('btnFullscreen'), btnCloseP: $('btnClosePreview'),
    search: $('searchInput'), sortSel: $('sortSelect'), bulkBar: $('bulkBar'),
    bulkCnt: $('bulkCount'), toastBox: $('toastContainer'), btnDark: $('btnDarkMode'),
    btnSync: $('btnSync'), btnAppr: $('btnApprovals'), btnAllUsers: $('btnAllUsers'),
    btnLogs: $('btnLogs'), btnAnalytics: $('btnAnalytics'), btnShare: $('btnShareManager'),
    btnUnAuth: $('btnAdminLogout'), pnlAppr: $('approvalPanel'), listAppr: $('approvalList'),
    pnlUsers: $('usersPanel'), listUsers: $('usersList'), pnlLogs: $('logsPanel'),
    logsCt: $('logsContent'), pnlAnalytics: $('analyticsPanel'), analyticsCt: $('analyticsContent'),
    pnlShare: $('sharePanel'), shareCt: $('shareContent'), pendingBadge: $('pendingBadge'),
    btnClearLogs: $('btnClearLogs'),
};

// ==================== Utilities ====================
function getAuthHeaders() {
    const headers = {};
    if (ST.token) {
        if (ST.isAdmin) headers['X-Admin-Token'] = ST.token;
        else headers['X-User-Token'] = ST.token;
    }
    return headers;
}
function toast(msg, type='info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    D.toastBox.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSz = b => { if(!b) return '0 B'; const u = ['B','KB','MB','GB','TB']; let i=0, s=b; while(s>=1024 && i<4) { s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const icn = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const prevType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// ==================== Dark Mode ====================
(function() {
    if (ST.dark) document.documentElement.setAttribute('data-theme', 'dark');
    D.btnDark.addEventListener('click', () => {
        ST.dark = !ST.dark;
        document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
        localStorage.setItem('darkMode', ST.dark);
        if (ST.isAdmin && ST.token) {
            fetch(`${WORKER_BASE}/admin/set-engine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ engine: 'd1' })
            }).catch(e=>console.warn);
        }
    });
})();

// ==================== Authentication Flow ====================
async function init() {
    const params = new URLSearchParams(location.search);
    const token = params.get('utoken');
    const error = params.get('auth_error');
    const share = params.get('share');
    if (share) {
        ST.shareToken = share;
        history.replaceState({}, '', location.pathname);
        await showSharePreview();
        return;
    }
    if (error) {
        toast('Auth error: '+error.replace(/_/g,' '), 'error');
        history.replaceState({}, '', location.pathname);
    }
    if (token) {
        ST.token = token;
        localStorage.setItem('vtoken', token);
        history.replaceState({}, '', location.pathname);
        await fetchUserInfo();
        render();
        return;
    }
    if (ST.token) {
        await fetchUserInfo();
        render();
        return;
    }
    showLogin();
}

async function fetchUserInfo() {
    if (!ST.token) return;
    try {
        const res = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        ST.email = data.email;
        ST.isAdmin = data.isAdmin === true;
        ST.approved = data.approved;
        ST.role = data.role;
    } catch {
        ST.token = null;
        localStorage.removeItem('vtoken');
    }
}

function showLogin() {
    D.adminBar.classList.add('hidden');
    D.userUI.innerHTML = '';
    D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>Welcome to File Vault</h2><p style="margin:16px 0;">Sign in to access your files.</p><button class="btn btn-primary" id="btnLogin">🔑 Login with Google</button></div>`;
    document.getElementById('btnLogin').onclick = async () => {
        const res = await fetch(`${WORKER_BASE}/auth-url`);
        const { authUrl } = await res.json();
        window.location.href = authUrl;
    };
}

function showPending() {
    D.adminBar.classList.add('hidden');
    D.userUI.innerHTML = '';
    D.dropzone.style.display = 'none';
    document.querySelector('.hint-text').style.display = 'none';
    D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>🔐 Waiting for Approval</h2><p>Your email: <strong>${ST.email}</strong></p><p>You will be notified automatically.</p><button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button><button class="btn btn-danger btn-sm" id="btnSelfRevoke" style="margin-left:8px;">❌ Cancel Request</button></div>`;
    document.getElementById('btnSelfRevoke').onclick = selfRevoke;
    startRolePoll(); // poll for approval change
}

function showMain() {
    document.querySelector('.hint-text').style.display = '';
    if (ST.isAdmin) {
        D.adminBar.classList.remove('hidden');
        D.userUI.innerHTML = '';
        D.dropzone.style.display = '';
    } else {
        D.adminBar.classList.add('hidden');
        const roleStr = ST.role ? ` (${ST.role})` : '';
        D.userUI.innerHTML = `<span style="font-size:0.85rem;">👤 ${ST.email}${roleStr} <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>`;
        document.getElementById('btnUserLogout').onclick = userLogout;
    }
}

async function selfRevoke() {
    if (!confirm('Cancel your access request?')) return;
    await fetch(`${WORKER_BASE}/user-revoke-self`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utoken: ST.token })
    });
    ST.token = null;
    localStorage.removeItem('vtoken');
    clearTimers();
    showLogin();
    toast('Request cancelled.');
}

function userLogout() {
    ST.token = null;
    localStorage.removeItem('vtoken');
    clearTimers();
    showLogin();
    toast('Logged out.');
}

function render() {
    clearTimers();
    if (!ST.email) { showLogin(); return; }
    if (ST.isAdmin) {
        showMain();
        fetchFiles();
        startAdminPoll();
        startRolePoll(); // admin also needs role (always admin)
        return;
    }
    if (!ST.approved) {
        showPending();
        startRolePoll(); // poll for approval
        return;
    }
    showMain();
    applyRoleUI();
    fetchFiles();
    startUserPoll();
    startRolePoll(); // poll for role changes
}

function clearTimers() {
    Object.values(ST.pollTimers).forEach(t => t && clearTimeout(t));
}

// ==================== Admin Panels ====================
D.btnSync.addEventListener('click', async () => {
    toast('Syncing...', 'info');
    const res = await fetch(`${WORKER_BASE}/sync`, { method: 'POST', headers: getAuthHeaders() });
    if (res.ok) { await fetchFiles(); toast('Sync done', 'success'); }
    else toast('Sync failed', 'error');
});
D.btnAppr.addEventListener('click', () => togglePanel(D.pnlAppr, loadPending));
D.btnAllUsers.addEventListener('click', () => togglePanel(D.pnlUsers, loadAllUsers));
D.btnLogs.addEventListener('click', () => togglePanel(D.pnlLogs, loadLogs));
D.btnAnalytics.addEventListener('click', () => togglePanel(D.pnlAnalytics, loadAnalytics));
D.btnShare.addEventListener('click', () => togglePanel(D.pnlShare, () => D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'));
D.btnUnAuth.addEventListener('click', adminLogout);

function togglePanel(panel, loadFn) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) loadFn();
}

async function adminLogout() {
    if (!confirm('Logout as admin?')) return;
    localStorage.removeItem('vtoken');
    ST.token = null;
    clearTimers();
    showLogin();
    toast('Admin logged out');
}

// ==================== Pending & Users ====================
async function loadPendingCount() {
    if (!ST.isAdmin) return;
    const res = await fetch(`${WORKER_BASE}/admin/pending`, { headers: getAuthHeaders() });
    const pending = await res.json();
    D.pendingBadge.textContent = pending.length;
    D.pendingBadge.classList.toggle('hidden', pending.length === 0);
}

function loadPending() {
    fetch(`${WORKER_BASE}/admin/pending`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(users => {
            D.listAppr.innerHTML = users.length ? users.map(u => `
                <div class="approval-item">
                    <span>${u.email}</span>
                    <div style="display:flex;gap:6px;">
                        <select class="role-sel"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download Only</option><option value="read">Read Only</option><option value="none">None</option></select>
                        <button class="btn btn-sm btn-success" data-action="approve" data-email="${u.email}">✅ Approve</button>
                        <button class="btn btn-sm btn-danger" data-action="deny" data-email="${u.email}">❌ Deny</button>
                    </div>
                </div>`).join('') : '<p>No pending users.</p>';
            D.listAppr.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const action = btn.dataset.action;
                    const email = btn.dataset.email;
                    if (action === 'approve') {
                        const role = btn.parentElement.querySelector('.role-sel').value;
                        await fetch(`${WORKER_BASE}/admin/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ email, role }) });
                        toast(`${email} approved`);
                    } else {
                        await fetch(`${WORKER_BASE}/admin/deny`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ email }) });
                        toast(`${email} denied`);
                    }
                    loadPending(); loadPendingCount(); loadAllUsers();
                });
            });
        });
}

function loadAllUsers() {
    fetch(`${WORKER_BASE}/admin/users/all`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(users => {
            const active = users.filter(u => u.status !== 'revoked');
            const revoked = users.filter(u => u.status === 'revoked');
            let html = active.map(u => `
                <div class="approval-item">
                    <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role ? `(${u.role})` : ''}</span>
                    <div style="display:flex;gap:6px;">
                        ${u.status === 'pending' ? `
                            <select class="role-sel-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
                            <button class="btn btn-sm btn-success" data-action="approve" data-email="${u.email}">✅ Approve</button>
                        ` : ''}
                        ${u.status === 'approved' ? `
                            <select class="role-sel-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="upload" ${u.role==='upload'?'selected':''}>Upload Only</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select>
                            <button class="btn btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button>
                            <button class="btn btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>
                        ` : ''}
                    </div>
                </div>`).join('');
            if (revoked.length) {
                html += '<hr><h4 style="margin-top:12px;margin-bottom:8px;">Revoked Users</h4>';
                html += revoked.map(u => `
                    <div class="approval-item">
                        <span>${u.email} <span class="status-badge status-revoked">revoked</span> ${u.role ? `(${u.role})` : ''}</span>
                        <div style="display:flex;gap:6px;">
                            <select class="role-sel-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
                            <button class="btn btn-sm btn-warning" data-action="reapprove" data-email="${u.email}">Re‑approve</button>
                        </div>
                    </div>`).join('');
            }
            D.listUsers.innerHTML = html || '<p>No users found.</p>';
            D.listUsers.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    const email = btn.dataset.email;
                    if (['approve','reapprove','update'].includes(action)) {
                        const sel = btn.parentElement.querySelector(`.role-sel-${email}`);
                        const role = sel ? sel.value : 'full';
                        const endpoint = action === 'reapprove' ? 'reapprove' : 'approve';
                        await fetch(`${WORKER_BASE}/admin/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ email, role }) });
                        toast(`${email} updated`);
                    } else if (action === 'revoke') {
                        await fetch(`${WORKER_BASE}/admin/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ email }) });
                        toast(`${email} revoked`);
                    }
                    loadAllUsers();
                    if (['approve','reapprove'].includes(action)) loadPendingCount();
                });
            });
        });
}

// ==================== Logs (only deletions) ====================
function loadLogs() {
    fetch(`${WORKER_BASE}/admin/logs?limit=200`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
            const deleteLogs = d.logs.filter(l => l.action === 'FILE_DELETED');
            D.logsCt.innerHTML = deleteLogs.length ? deleteLogs.map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem;"><strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} deleted <strong>${l.meta?.fileName || l.target}</strong></div>`).join('') : '<p>No deletion logs yet.</p>';
        });
}
D.btnClearLogs.addEventListener('click', async () => {
    if (!confirm('Delete all audit logs?')) return;
    await fetch(`${WORKER_BASE}/admin/logs/clear`, { method: 'POST', headers: getAuthHeaders() });
    loadLogs(); toast('Logs cleared');
});

function loadAnalytics() {
    fetch(`${WORKER_BASE}/admin/analytics`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => { D.analyticsCt.innerHTML = `<p><strong>Files:</strong> ${d.files.total} (${fmtSz(d.files.totalSize)})</p><p><strong>Users:</strong> ${d.users.total}</p>`; });
}

// ==================== File List & Rendering (Sectioned) ====================
async function fetchFiles() {
    try {
        const res = await fetch(`${WORKER_BASE}/list`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error();
        const { files } = await res.json();
        ST.files = files;
        renderFiles();
    } catch(e) { toast('Failed to load files', 'error'); }
}

function renderFiles() {
    let list = [...ST.files];
    if (ST.query) list = list.filter(f => f.name.toLowerCase().includes(ST.query));
    const s = ST.sort;
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
    // Group by uploader
    const grouped = {};
    list.forEach(f => { const uploader = f.uploadedBy || 'unknown'; if (!grouped[uploader]) grouped[uploader] = []; grouped[uploader].push(f); });
    D.grid.innerHTML = '';
    if (Object.keys(grouped).length === 0) {
        D.grid.innerHTML = '<p style="text-align:center;padding:30px;">No files yet.</p>';
        return;
    }
    for (const [uploader, files] of Object.entries(grouped)) {
        const section = document.createElement('div'); section.className = 'file-section';
        section.innerHTML = `<div class="section-title">📤 ${esc(uploader)} <span>${files.length}</span></div><div class="file-grid"></div>`;
        const gridDiv = section.querySelector('.file-grid');
        for (const f of files) {
            const actions = getFileActions(f.publicId);
            const card = document.createElement('div');
            card.className = `card${ST.selected.has(f.publicId) ? ' selected' : ''}`;
            card.dataset.publicId = f.publicId;
            card.innerHTML = `
                <input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${ST.selected.has(f.publicId) ? 'checked' : ''}>
                <div class="file-icon">${icn(f.mimeType)}</div>
                <div class="file-name">${esc(f.name)}</div>
                <div class="file-meta">${fmtSz(f.size)} · ${new Date(f.createdAt).toLocaleString()}</div>
                <div class="actions">
                    ${actions.includes('play') ? `<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>` : ''}
                    ${actions.includes('preview') ? `<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>` : ''}
                    ${actions.includes('download') ? `<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇ Download</button>` : ''}
                    ${actions.includes('rename') ? `<button class="btn-xs btn-xs-rename" data-action="rename" data-id="${f.publicId}">✏️ Rename</button>` : ''}
                    ${actions.includes('share') ? `<button class="btn-xs btn-xs-share" data-action="share" data-id="${f.publicId}">🔗 Share</button>` : ''}
                    ${actions.includes('delete') ? `<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑 Delete</button>` : ''}
                    ${actions.includes('replace') ? `<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄 Replace</button>` : ''}
                </div>`;
            gridDiv.appendChild(card);
        }
        D.grid.appendChild(section);
    }
    attachFileEventListeners();
    updateBulkBar();
}

function getFileActions(pid) {
    if (ST.isAdmin) return ['play','preview','download','rename','share','delete','replace'];
    if (!ST.role) return [];
    const f = ST.files.find(f => f.publicId === pid);
    if (!f) return [];
    const pt = prevType(f.mimeType);
    const a = [];
    if ((pt==='video'||pt==='audio') && ['full','delete','upload','download','read'].includes(ST.role)) a.push('play');
    if (['image','pdf','text'].includes(pt) && ['full','delete','upload','download','read'].includes(ST.role)) a.push('preview');
    if (['full','delete','upload','download'].includes(ST.role)) a.push('download');
    if (['full'].includes(ST.role)) a.push('rename','share');
    if (['full','delete'].includes(ST.role)) a.push('delete');
    if (ST.role==='full') a.push('replace');
    return a;
}

function attachFileEventListeners() {
    D.grid.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
    });
    D.grid.querySelectorAll('.actions button').forEach(btn => {
        btn.removeEventListener('click', handleActionClick);
        btn.addEventListener('click', handleActionClick);
    });
    D.grid.querySelectorAll('.card').forEach(card => {
        card.removeEventListener('click', handleCardClick);
        card.addEventListener('click', handleCardClick);
    });
}
function handleCheckboxChange(e) { e.stopPropagation(); toggleSelect(e.target.dataset.id, e.target.checked); }
function handleActionClick(e) { e.stopPropagation(); const action = e.currentTarget.dataset.action, id = e.currentTarget.dataset.id; if (action) fileAction(action, id); }
function handleCardClick(e) { if (e.target.classList.contains('card-checkbox') || e.target.closest('.actions')) return; const cb = this.querySelector('.card-checkbox'); if (cb) toggleSelect(cb.dataset.id, !cb.checked); }
function toggleSelect(id, checked) { if (checked) ST.selected.add(id); else ST.selected.delete(id); updateBulkBar(); const card = document.querySelector(`.card[data-public-id="${id}"]`); if (card) card.classList.toggle('selected', checked); }
function updateBulkBar() { if (ST.selected.size) { D.bulkBar.classList.remove('hidden'); D.bulkCnt.textContent = `${ST.selected.size} selected`; } else D.bulkBar.classList.add('hidden'); }
D.btnBulkCancel.addEventListener('click', () => { ST.selected.clear(); renderFiles(); updateBulkBar(); });
D.btnBulkDelete.addEventListener('click', async () => {
    if (!confirm(`Delete ${ST.selected.size} files?`)) return;
    const ids = Array.from(ST.selected);
    const res = await fetch(`${WORKER_BASE}/bulk-delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ publicIds: ids }) });
    const d = await res.json();
    ST.selected.clear();
    await fetchFiles();
    toast(`${d.deleted} deleted, ${d.failed} failed`);
});

function fileAction(action, id) {
    switch(action) {
        case 'play': openPreview(id, 'video'); break;
        case 'preview': openPreview(id, prevType(ST.files.find(f=>f.publicId===id)?.mimeType)); break;
        case 'download': window.location.href = `${WORKER_BASE}/download/${id}`; break;
        case 'delete': deleteFile(id); break;
        case 'replace': replaceFile(id); break;
        case 'rename': renameFile(id); break;
        case 'share': shareFile(id); break;
    }
}
async function deleteFile(pid) {
    if (!confirm('Delete?')) return;
    const res = await fetch(`${WORKER_BASE}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ publicId: pid }) });
    if (res.ok) { await fetchFiles(); toast('Deleted'); }
    else toast('Delete failed', 'error');
}
function replaceFile(pid) {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;
        const initRes = await fetch(`${WORKER_BASE}/update`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ publicId: pid, fileName: file.name, fileSize: file.size, fileType: file.type||'application/octet-stream' }) });
        if (!initRes.ok) { toast('Update init failed', 'error'); return; }
        const { publicId } = await initRes.json();
        await uploadFile(file, publicId);
        await fetchFiles();
    };
    inp.click();
}
async function renameFile(pid) {
    const f = ST.files.find(f => f.publicId === pid);
    if (!f) return;
    const newName = prompt('New name:', f.name);
    if (!newName || newName === f.name) return;
    const res = await fetch(`${WORKER_BASE}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ publicId: pid, newName }) });
    if (res.ok) { await fetchFiles(); toast('Renamed'); }
    else toast('Rename failed', 'error');
}
async function shareFile(pid) {
    const label = prompt('Share label (optional):', '');
    const hours = parseInt(prompt('Expires in hours (default 1):', '1'),10);
    const maxDownloads = parseInt(prompt('Max downloads (0=unlimited):', '0'),10);
    const res = await fetch(`${WORKER_BASE}/share/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ publicId: pid, expiresIn: hours*3600, maxDownloads, label }) });
    const data = await res.json();
    if (res.ok) { toast('Share link copied!'); navigator.clipboard.writeText(data.shareUrl); }
    else toast('Share failed', 'error');
}

// ==================== Upload ====================
async function uploadFile(file, existingPid = null) {
    if (ST.uploadCtrl) ST.uploadCtrl.abort();
    ST.uploadCtrl = new AbortController();
    D.progBox.classList.remove('hidden');
    try {
        let pid = existingPid;
        if (!pid) {
            const initRes = await fetch(`${WORKER_BASE}/upload-init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ fileName: file.name, fileSize: file.size, fileType: file.type || 'application/octet-stream' }),
                signal: ST.uploadCtrl.signal
            });
            if (!initRes.ok) throw new Error('Init failed');
            pid = (await initRes.json()).publicId;
        }
        const CHUNK = 10*1024*1024;
        let uploaded = 0;
        while (uploaded < file.size) {
            if (ST.uploadCtrl.signal.aborted) throw new Error('Cancelled');
            const end = Math.min(uploaded + CHUNK - 1, file.size - 1);
            const chunk = file.slice(uploaded, end+1);
            let retries = 3, done = false;
            while (retries-- && !done) {
                const chunkRes = await fetch(`${WORKER_BASE}/upload-chunk/${pid}`, {
                    method: 'PUT',
                    headers: { 'Content-Range': `bytes ${uploaded}-${end}/${file.size}`, ...getAuthHeaders() },
                    body: chunk,
                    signal: ST.uploadCtrl.signal
                });
                const data = await chunkRes.json();
                if (chunkRes.ok) {
                    if (data.complete === true || data.status === 'complete') { done = true; break; }
                    if (typeof data.uploadedBytes === 'number') { uploaded = data.uploadedBytes; updateProgress(uploaded, file.size); }
                    done = true;
                } else {
                    if (retries <= 0) throw new Error(data.error || 'Chunk error');
                    await sleep(1000);
                }
            }
            if (done && uploaded >= file.size) break;
            if (!done) {
                const statusRes = await fetch(`${WORKER_BASE}/upload-status/${pid}`, { headers: getAuthHeaders(), signal: ST.uploadCtrl.signal });
                if (statusRes.ok) { const s = await statusRes.json(); uploaded = s.uploadedBytes || uploaded; updateProgress(uploaded, file.size); }
            }
        }
        toast(`${file.name} uploaded`, 'success');
        await fetchFiles();
    } catch (err) {
        if (err.message !== 'Cancelled') toast(`Upload failed: ${err.message}`, 'error');
    } finally {
        D.progBox.classList.add('hidden');
        ST.uploadCtrl = null;
    }
}
function updateProgress(uploaded, total) { const p = Math.round(uploaded/total*100); D.progFill.style.width = p+'%'; D.pctDisp.textContent = p+'%'; D.sizeDisp.textContent = `${fmtSz(uploaded)} / ${fmtSz(total)}`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
D.cancelBtn.addEventListener('click', () => { if (ST.uploadCtrl) { ST.uploadCtrl.abort(); ST.uploadCtrl = null; D.progBox.classList.add('hidden'); } });

// ==================== Preview ====================
function openPreview(pid, type) {
    D.prevCont.innerHTML = '';
    const url = `${WORKER_BASE}/video/${pid}`;
    if (type === 'video' || type === 'audio') {
        const el = document.createElement(type === 'audio' ? 'audio' : 'video');
        el.src = url; el.controls = true; el.playsInline = true;
        el.style.width = '100%'; el.style.height = '100%'; el.style.objectFit = 'contain';
        D.prevCont.appendChild(el); el.play().catch(()=>{});
    } else if (type === 'image') {
        const img = document.createElement('img'); img.src = url; img.style.maxWidth = '95%'; img.style.maxHeight = '95%';
        D.prevCont.appendChild(img);
    } else if (type === 'pdf') {
        const ifr = document.createElement('iframe'); ifr.src = url; ifr.style.width = '90%'; ifr.style.height = '90%';
        D.prevCont.appendChild(ifr);
    } else if (type === 'text') {
        fetch(url, { headers: getAuthHeaders() }).then(r=>r.text()).then(t => { const pre = document.createElement('pre'); pre.textContent = t; D.prevCont.appendChild(pre); });
    } else { return; }
    D.prevOv.classList.remove('hidden');
}
function closePreview() { D.prevCont.innerHTML = ''; D.prevOv.classList.add('hidden'); if (document.fullscreenElement) document.exitFullscreen(); }
D.btnCloseP.addEventListener('click', closePreview);
D.btnFull.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else D.prevOv.requestFullscreen(); });

// ==================== Polling (Live Updates) ====================
function startUserPoll() {
    let lastTs = 0;
    const poll = async () => {
        if (!ST.token || !ST.approved || ST.isAdmin) return;
        try {
            const res = await fetch(`${WORKER_BASE}/poll?utoken=${ST.token}&since=${lastTs}&timeout=25`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.changed) { lastTs = data.ts; await fetchFiles(); }
        } catch(e) {}
        ST.pollTimers.files = setTimeout(poll, 2000);
    };
    poll();
}
function startAdminPoll() {
    let lastTs = 0;
    const poll = async () => {
        if (!ST.token || !ST.isAdmin) return;
        try {
            const res = await fetch(`${WORKER_BASE}/admin/poll?since=${lastTs}&timeout=25`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.changed) {
                lastTs = data.ts;
                await loadPendingCount();
                if (!D.pnlAppr.classList.contains('hidden')) loadPending();
                if (!D.pnlUsers.classList.contains('hidden')) loadAllUsers();
                if (!D.pnlLogs.classList.contains('hidden')) loadLogs();
                if (!D.pnlAnalytics.classList.contains('hidden')) loadAnalytics();
                await fetchFiles();
            }
        } catch(e) {}
        ST.pollTimers.admin = setTimeout(poll, 2000);
    };
    poll();
}
function startRolePoll() {
    let lastRole = ST.role;
    const poll = async () => {
        if (!ST.token) return;
        try {
            await fetchUserInfo();
            if (ST.role !== lastRole || ST.approved !== (lastRole !== null)) {
                lastRole = ST.role;
                if (ST.approved) {
                    toast(`Permissions changed to ${ST.role || 'none'}`, 'info');
                    render();
                } else {
                    render(); // go to pending screen
                }
            }
        } catch(e) {}
        ST.pollTimers.role = setTimeout(poll, 2000);
    };
    poll();
}

// ==================== UI Helpers ====================
function applyRoleUI() {
    const canUpload = ['full','delete','upload'].includes(ST.role);
    D.dropzone.style.display = canUpload ? '' : 'none';
    document.querySelector('.hint-text').style.display = canUpload ? '' : 'none';
}

// ==================== Share Preview ====================
async function showSharePreview() {
    const res = await fetch(`${WORKER_BASE}/share/verify?token=${ST.shareToken}`);
    if (!res.ok) { toast('Invalid or expired share link', 'error'); showLogin(); return; }
    const data = await res.json();
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

// ==================== Drag & Drop, Paste, Keyboard ====================
['dragenter','dragover','dragleave','drop'].forEach(ev => D.dropzone.addEventListener(ev, e => e.preventDefault()));
['dragenter','dragover'].forEach(ev => D.dropzone.addEventListener(ev, () => D.dropzone.classList.add('dragover')));
['dragleave','drop'].forEach(ev => D.dropzone.addEventListener(ev, () => D.dropzone.classList.remove('dragover')));
D.dropzone.addEventListener('drop', e => { const files = e.dataTransfer.files; if (files.length) handleFiles(files); });
D.dropzone.addEventListener('click', () => D.fileInp.click());
D.fileInp.addEventListener('change', e => handleFiles(e.target.files));
function handleFiles(files) { for (const f of files) uploadFile(f); }
document.addEventListener('paste', e => {
    const items = e.clipboardData.items;
    for (let i=0; i<items.length; i++) {
        if (items[i].kind === 'file') { uploadFile(items[i].getAsFile()); break; }
    }
});
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'u') { e.preventDefault(); D.fileInp.click(); }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); D.search.focus(); }
    if (e.key === 'Escape') closePreview();
});
D.search.addEventListener('input', () => { ST.query = D.search.value.toLowerCase(); renderFiles(); });
D.sortSel.addEventListener('change', () => { ST.sort = D.sortSel.value; localStorage.setItem('sort', ST.sort); renderFiles(); });
D.sortSel.value = ST.sort;

// ==================== Start ====================
init();
