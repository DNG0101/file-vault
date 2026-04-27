// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

let ST = {
    token: localStorage.getItem('vtoken'),
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
    timers: { files: null, admin: null, role: null },
    shareToken: null,
};

const D = {
    stats: document.getElementById('storageStats'), userUI: document.getElementById('userUI'), adminBar: document.getElementById('adminBar'),
    dropzone: document.getElementById('dropzone'), fileInp: document.getElementById('fileInput'), progBox: document.getElementById('progressBox'),
    progFill: document.getElementById('progressFill'), pctDisp: document.getElementById('percentDisplay'), speedDisp: document.getElementById('speedDisplay'),
    sizeDisp: document.getElementById('sizeDisplay'), cancelBtn: document.getElementById('cancelUpload'), grid: document.getElementById('fileGrid'),
    prevOv: document.getElementById('previewOverlay'), prevCont: document.getElementById('previewContainer'), btnFull: document.getElementById('btnFullscreen'),
    btnCloseP: document.getElementById('btnClosePreview'), search: document.getElementById('searchInput'), sortSel: document.getElementById('sortSelect'),
    bulkBar: document.getElementById('bulkBar'), bulkCnt: document.getElementById('bulkCount'), toastBox: document.getElementById('toastContainer'),
    btnDark: document.getElementById('btnDarkMode'), btnSync: document.getElementById('btnSync'), btnAppr: document.getElementById('btnApprovals'),
    btnAllUsers: document.getElementById('btnAllUsers'), btnLogs: document.getElementById('btnLogs'), btnAnalytics: document.getElementById('btnAnalytics'),
    btnShare: document.getElementById('btnShareManager'), btnUnAuth: document.getElementById('btnAdminLogout'), pnlAppr: document.getElementById('approvalPanel'),
    listAppr: document.getElementById('approvalList'), pnlUsers: document.getElementById('usersPanel'), listUsers: document.getElementById('usersList'),
    pnlLogs: document.getElementById('logsPanel'), logsCt: document.getElementById('logsContent'), pnlAnalytics: document.getElementById('analyticsPanel'),
    analyticsCt: document.getElementById('analyticsContent'), pnlShare: document.getElementById('sharePanel'), shareCt: document.getElementById('shareContent'),
    pendingBadge: document.getElementById('pendingBadge'), btnClearLogs: document.getElementById('btnClearLogs'),
    btnBulkDelete: document.getElementById('btnBulkDelete'), btnBulkCancel: document.getElementById('btnBulkCancel'),
};

function getAuthHeaders() {
    const h = {};
    if (ST.token) {
        if (ST.isAdmin) h['X-Admin-Token'] = ST.token;
        else h['X-User-Token'] = ST.token;
    }
    return h;
}
function toast(msg, type='info') {
    if (!D.toastBox) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    D.toastBox.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSz = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0,s=b; while(s>=1024 && i<3) { s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const fmtSpeed = bytesPerSec => { if(bytesPerSec<1024) return bytesPerSec.toFixed(0)+' B/s'; if(bytesPerSec<1048576) return (bytesPerSec/1024).toFixed(1)+' KB/s'; return (bytesPerSec/1048576).toFixed(1)+' MB/s'; };
const icn = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const prevType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// Dark mode
(function(){
    if(!D.btnDark) return;
    if(ST.dark) document.documentElement.setAttribute('data-theme','dark');
    D.btnDark.addEventListener('click', () => {
        ST.dark = !ST.dark;
        document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
        localStorage.setItem('darkMode', ST.dark);
        if(ST.isAdmin && ST.token) {
            fetch(`${WORKER_BASE}/admin/set-engine`, {
                method:'POST', headers:{'Content-Type':'application/json', ...getAuthHeaders()},
                body:JSON.stringify({ engine: ST.dark ? 'kv' : 'd1' })
            }).catch(()=>{});
        }
    });
})();

async function fetchUserInfo() {
    if (!ST.token) return false;
    try {
        const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`);
        if (!r.ok) throw new Error();
        const i = await r.json();
        console.log('User info:', i);
        const wasApproved = ST.approved;
        ST.email = i.email; ST.isAdmin = i.isAdmin === true; ST.approved = i.approved; ST.role = i.role;
        if (!wasApproved && ST.approved) {
            toast('You have been approved! Reloading...', 'success');
            setTimeout(() => { window.location.reload(); }, 500);
            return true;
        }
        return true;
    } catch(e) {
        console.error(e);
        ST.token = null;
        localStorage.removeItem('vtoken');
        return false;
    }
}
function showLogin() {
    if(D.adminBar) D.adminBar.classList.add('hidden');
    if(D.userUI) D.userUI.innerHTML = '';
    if(D.grid) D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>Welcome to File Vault</h2><p>Sign in to access your files.</p><button class="btn btn-primary" id="btnLogin">🔑 Login with Google</button></div>`;
    const loginBtn = document.getElementById('btnLogin');
    if(loginBtn) {
        loginBtn.onclick = async () => {
            const r = await fetch(`${WORKER_BASE}/auth-url`);
            if(r.ok) window.location = (await r.json()).authUrl;
            else toast('Login failed','error');
        };
    }
}
function showPending() {
    if(D.adminBar) D.adminBar.classList.add('hidden');
    if(D.userUI) D.userUI.innerHTML = '';
    if(D.dropzone) D.dropzone.style.display = 'none';
    const hint = document.querySelector('.hint-text');
    if(hint) hint.style.display = 'none';
    if(D.grid) D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>🔐 Waiting for Approval</h2><p>Your email: <strong>${ST.email}</strong></p><p>You will be notified automatically.</p><div style="margin-top:16px;"><button class="btn btn-outline btn-sm" id="manualRefreshBtn">🔄 Refresh Status</button> <button class="btn btn-danger btn-sm" id="btnSelfRevoke">❌ Cancel Request</button></div></div>`;
    const refreshBtn = document.getElementById('manualRefreshBtn');
    if(refreshBtn) refreshBtn.onclick = async () => {
        toast('Checking...', 'info');
        const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`);
        if (r.ok) {
            const data = await r.json();
            console.log('Manual refresh:', data);
            if (data.approved) {
                toast('Approved! Reloading...', 'success');
                window.location.reload();
            } else {
                toast('Still pending.', 'info');
            }
        } else {
            toast('Failed to check.', 'error');
        }
    };
    const selfRevokeBtn = document.getElementById('btnSelfRevoke');
    if(selfRevokeBtn) selfRevokeBtn.onclick = async () => {
        if(!confirm('Cancel your access request?')) return;
        await fetch(`${WORKER_BASE}/user-revoke-self`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({utoken:ST.token}) });
        ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Request cancelled.');
    };
}
function showMain() {
    const hint = document.querySelector('.hint-text');
    if(hint) hint.style.display = '';
    if(ST.isAdmin) {
        if(D.adminBar) D.adminBar.classList.remove('hidden');
        if(D.userUI) D.userUI.innerHTML = '';
        if(D.dropzone) D.dropzone.style.display = '';
        loadPendingCount();
    } else {
        if(D.adminBar) D.adminBar.classList.add('hidden');
        if(D.userUI) D.userUI.innerHTML = `<span>👤 ${ST.email} (${ST.role}) <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>`;
        const logoutBtn = document.getElementById('btnUserLogout');
        if(logoutBtn) logoutBtn.onclick = () => { ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Logged out.'); };
    }
}
function render() {
    clearTimers();
    if(!ST.email) { showLogin(); return; }
    if(ST.isAdmin) { showMain(); fetchFiles(); startAdminPoll(); startRolePoll(); return; }
    if(!ST.approved) { showPending(); startRolePoll(); return; }
    showMain(); applyRoleUI(); fetchFiles(); startUserPoll(); startRolePoll();
}
function clearTimers() { ['files','admin','role'].forEach(k => { if(ST.timers[k]) clearTimeout(ST.timers[k]); }); }

function safeAddEvent(element, event, handler) { if(element) element.addEventListener(event, handler); }
safeAddEvent(D.btnSync, 'click', async () => { toast('Syncing...','info'); const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:getAuthHeaders()}); if(r.ok) { await fetchFiles(); toast('Sync done','success'); } else toast('Sync failed','error'); });
safeAddEvent(D.btnAppr, 'click', () => togglePanel(D.pnlAppr, loadPending));
safeAddEvent(D.btnAllUsers, 'click', () => togglePanel(D.pnlUsers, loadAllUsers));
safeAddEvent(D.btnLogs, 'click', () => togglePanel(D.pnlLogs, loadLogs));
safeAddEvent(D.btnAnalytics, 'click', () => togglePanel(D.pnlAnalytics, loadAnalytics));
safeAddEvent(D.btnShare, 'click', () => togglePanel(D.pnlShare, () => { if(D.shareCt) D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'; }));
safeAddEvent(D.btnUnAuth, 'click', adminLogout);
safeAddEvent(D.btnClearLogs, 'click', async () => { if(!confirm('Delete all logs?')) return; await fetch(`${WORKER_BASE}/admin/logs/clear`,{method:'POST',headers:getAuthHeaders()}); loadLogs(); toast('Logs cleared'); });
safeAddEvent(D.btnBulkCancel, 'click', () => { ST.selected.clear(); renderFiles(); updateBulkBar(); });
safeAddEvent(D.btnBulkDelete, 'click', async () => {
    if(!confirm(`Delete ${ST.selected.size} files?`)) return;
    const ids = Array.from(ST.selected);
    const r = await fetch(`${WORKER_BASE}/bulk-delete`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicIds:ids})});
    const d = await r.json();
    ST.selected.clear(); updateBulkBar(); await fetchFiles();
    toast(`${d.deleted} deleted, ${d.failed} failed`);
});

function togglePanel(panel, loadFn) { if(panel) { panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) loadFn(); } }
async function adminLogout() { if(confirm('Logout as admin?')) { localStorage.removeItem('vtoken'); ST.token=null; clearTimers(); showLogin(); toast('Admin logged out'); } }
async function loadPendingCount() {
    if(!ST.isAdmin || !D.pendingBadge) return;
    const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:getAuthHeaders()});
    const p = await r.json();
    D.pendingBadge.textContent = p.length;
    D.pendingBadge.classList.toggle('hidden', p.length===0);
}
function loadPending() {
    if(!D.listAppr) return;
    fetch(`${WORKER_BASE}/admin/pending`,{headers:getAuthHeaders()}).then(r=>r.json()).then(users => {
        D.listAppr.innerHTML = users.length ? users.map(u => `<div class="approval-item"><span>${u.email}</span><div><select class="role-sel"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download Only</option><option value="read">Read Only</option><option value="none">None</option></select><button class="btn btn-sm btn-success" data-email="${u.email}">Approve</button><button class="btn btn-sm btn-danger" data-email="${u.email}">Deny</button></div></div>`).join('') : '<p>No pending users.</p>';
        D.listAppr.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const email = btn.dataset.email;
                const role = btn.parentElement.querySelector('.role-sel')?.value || 'full';
                const isApprove = btn.classList.contains('btn-success');
                const endpoint = isApprove ? 'approve' : 'deny';
                await fetch(`${WORKER_BASE}/admin/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email, role})});
                toast(`${email} ${isApprove ? 'approved' : 'denied'}`);
                loadPending(); loadPendingCount(); loadAllUsers();
            });
        });
    });
}
function loadAllUsers() {
    if(!D.listUsers) return;
    fetch(`${WORKER_BASE}/admin/users/all`,{headers:getAuthHeaders()}).then(r=>r.json()).then(users => {
        const active = users.filter(u => u.status !== 'revoked');
        let html = active.map(u => `<div class="approval-item">
            <span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role?`(${u.role})` : ''}</span>
            <div>
                ${u.status==='pending' ? 
                    `<select class="role-sel-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select>
                    <button class="btn-sm btn-success" data-action="approve" data-email="${u.email}">Approve</button>` : ''}
                ${u.status==='approved' ? 
                    `<select class="role-sel-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="upload" ${u.role==='upload'?'selected':''}>Upload Only</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select>
                    <button class="btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button>
                    <button class="btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>` : ''}
            </div>
        </div>`).join('');
        D.listUsers.innerHTML = html || '<p>No active users.</p>';
        D.listUsers.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const email = btn.dataset.email;
                let role = 'full';
                const sel = btn.parentElement.querySelector(`.role-sel-${email}`);
                if(sel) role = sel.value;
                let endpoint = '';
                if (action === 'approve') endpoint = 'approve';
                else if (action === 'update') endpoint = 'approve';
                else if (action === 'revoke') endpoint = 'revoke';
                if (endpoint) {
                    await fetch(`${WORKER_BASE}/admin/${endpoint}`, {
                        method:'POST',
                        headers:{'Content-Type':'application/json', ...getAuthHeaders()},
                        body:JSON.stringify({email, role})
                    });
                    toast(`${email} ${action === 'revoke' ? 'revoked' : 'updated'}`);
                    loadPending(); loadPendingCount(); loadAllUsers();
                }
            });
        });
    });
}
function loadLogs() {
    if(!D.logsCt) return;
    fetch(`${WORKER_BASE}/admin/logs?limit=200`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d => {
        const del = d.logs.filter(l=>l.action==='FILE_DELETED');
        D.logsCt.innerHTML = del.length ? del.map(l=>`<div><strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} deleted <strong>${l.meta?.fileName||l.target}</strong></div>`).join('') : '<p>No deletion logs.</p>';
    });
}
function loadAnalytics() {
    if(!D.analyticsCt) return;
    fetch(`${WORKER_BASE}/admin/analytics`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d => {
        D.analyticsCt.innerHTML = `<p>Files: ${d.files.total} (${fmtSz(d.files.totalSize)}) | Users: ${d.users.total}</p>`;
    });
}
async function fetchFiles() {
    try {
        const r = await fetch(`${WORKER_BASE}/list`,{headers:getAuthHeaders()});
        if(!r.ok) throw new Error();
        const data = await r.json();
        ST.files = data.files;
        renderFiles();
    } catch(e) { toast('Failed to load files','error'); }
}
function renderFiles() {
    if(!D.grid) return;
    let list = [...ST.files];
    if(ST.query) list = list.filter(f=>f.name.toLowerCase().includes(ST.query));
    const s = ST.sort;
    list.sort((a,b)=>{ switch(s){
        case 'newest': return b.createdAt - a.createdAt;
        case 'oldest': return a.createdAt - b.createdAt;
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'size-desc': return b.size - a.size;
        case 'size-asc': return a.size - b.size;
        default: return 0;
    }});
    const groups = {};
    list.forEach(f=>{ const key = f.uploadedBy || 'unknown'; if(!groups[key]) groups[key]=[]; groups[key].push(f); });
    D.grid.innerHTML = '';
    if(Object.keys(groups).length===0) { D.grid.innerHTML = '<p style="padding:30px;text-align:center;">No files yet.</p>'; return; }
    for(const [uploader, files] of Object.entries(groups)) {
        const section = document.createElement('div'); section.className='file-section';
        section.innerHTML = `<div class="section-title">📤 ${esc(uploader)} <span>${files.length}</span></div><div class="file-grid"></div>`;
        const gridDiv = section.querySelector('.file-grid');
        files.forEach(f => {
            const actions = getFileActions(f.publicId);
            const card = document.createElement('div'); card.className = `card${ST.selected.has(f.publicId)?' selected':''}`;
            card.dataset.publicId = f.publicId;
            card.innerHTML = `
                <input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${ST.selected.has(f.publicId)?'checked':''}>
                <div class="file-icon">${icn(f.mimeType)}</div>
                <div class="file-name">${esc(f.name)}</div>
                <div class="file-meta">${fmtSz(f.size)} · ${new Date(f.createdAt).toLocaleString()}</div>
                <div class="actions">
                    ${actions.includes('play')?`<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>`:''}
                    ${actions.includes('preview')?`<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>`:''}
                    ${actions.includes('download')?`<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇ Download</button>`:''}
                    ${actions.includes('rename')?`<button class="btn-xs btn-xs-rename" data-action="rename" data-id="${f.publicId}">✏️ Rename</button>`:''}
                    ${actions.includes('share')?`<button class="btn-xs btn-xs-share" data-action="share" data-id="${f.publicId}">🔗 Share</button>`:''}
                    ${actions.includes('delete')?`<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑 Delete</button>`:''}
                    ${actions.includes('replace')?`<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄 Replace</button>`:''}
                </div>`;
            gridDiv.appendChild(card);
        });
        D.grid.appendChild(section);
    }
    attachEvents();
    updateBulkBar();
}
function getFileActions(pid) {
    if(ST.isAdmin) return ['play','preview','download','rename','share','delete','replace'];
    if(!ST.role) return [];
    const f = ST.files.find(f=>f.publicId===pid);
    if(!f) return [];
    const pt = prevType(f.mimeType);
    const a = [];
    if((pt==='video'||pt==='audio') && ['full','delete','upload','download','read'].includes(ST.role)) a.push('play');
    if(['image','pdf','text'].includes(pt) && ['full','delete','upload','download','read'].includes(ST.role)) a.push('preview');
    if(['full','delete','upload','download'].includes(ST.role)) a.push('download');
    if(['full'].includes(ST.role)) a.push('rename','share');
    if(['full','delete'].includes(ST.role)) a.push('delete');
    if(ST.role==='full') a.push('replace');
    return a;
}
function attachEvents() {
    if(!D.grid) return;
    D.grid.querySelectorAll('.card-checkbox').forEach(cb => {
        cb.removeEventListener('change', checkboxHandler);
        cb.addEventListener('change', checkboxHandler);
    });
    D.grid.querySelectorAll('.actions button').forEach(btn => {
        btn.removeEventListener('click', actionHandler);
        btn.addEventListener('click', actionHandler);
    });
    D.grid.querySelectorAll('.card').forEach(card => {
        card.removeEventListener('click', cardClickHandler);
        card.addEventListener('click', cardClickHandler);
    });
}
function checkboxHandler(e) { e.stopPropagation(); toggleSelect(e.target.dataset.id, e.target.checked); }
function actionHandler(e) { e.stopPropagation(); const action = e.currentTarget.dataset.action, id = e.currentTarget.dataset.id; if(action) fileAction(action, id); }
function cardClickHandler(e) { if(e.target.classList.contains('card-checkbox') || e.target.closest('.actions')) return; const cb = this.querySelector('.card-checkbox'); if(cb) toggleSelect(cb.dataset.id, !cb.checked); }
function toggleSelect(id, checked) { if(checked) ST.selected.add(id); else ST.selected.delete(id); updateBulkBar(); const card = document.querySelector(`.card[data-public-id="${id}"]`); if(card) card.classList.toggle('selected',checked); }
function updateBulkBar() { if(D.bulkBar) { if(ST.selected.size) { D.bulkBar.classList.remove('hidden'); if(D.bulkCnt) D.bulkCnt.textContent = `${ST.selected.size} selected`; } else D.bulkBar.classList.add('hidden'); } }
function fileAction(action, id) {
    switch(action) {
        case 'play': openPreview(id,'video'); break;
        case 'preview': openPreview(id, prevType(ST.files.find(f=>f.publicId===id)?.mimeType)); break;
        case 'download': window.location.href = `${WORKER_BASE}/download/${id}`; break;
        case 'delete': deleteFile(id); break;
        case 'replace': replaceFile(id); break;
        case 'rename': renameFile(id); break;
        case 'share': shareFile(id); break;
    }
}
async function deleteFile(pid) {
    if(!confirm('Delete?')) return;
    const r = await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid})});
    if(r.ok) { await fetchFiles(); toast('Deleted'); } else toast('Delete failed','error');
}
function replaceFile(pid) {
    const inp = document.createElement('input'); inp.type='file';
    inp.onchange = async () => {
        const file = inp.files[0];
        if(!file) return;
        const init = await fetch(`${WORKER_BASE}/update`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'})});
        if(!init.ok) { toast('Replace init failed','error'); return; }
        const data = await init.json();
        const replacePublicId = data.publicId;
        await uploadFile(file, replacePublicId);
        await fetchFiles();
    };
    inp.click();
}
async function renameFile(pid) {
    const f = ST.files.find(f=>f.publicId===pid);
    if(!f) return;
    const newName = prompt('New name:', f.name);
    if(!newName || newName===f.name) return;
    const r = await fetch(`${WORKER_BASE}/rename`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,newName})});
    if(r.ok) { await fetchFiles(); toast('Renamed'); } else toast('Rename failed','error');
}
async function shareFile(pid) {
    const label = prompt('Share label (optional):', '');
    const hours = parseInt(prompt('Expires in hours (default 1):', '1'),10);
    const maxDownloads = parseInt(prompt('Max downloads (0=unlimited):', '0'),10);
    const r = await fetch(`${WORKER_BASE}/share/create`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicId:pid,expiresIn:hours*3600,maxDownloads,label})});
    const data = await r.json();
    if(r.ok) { toast('Share link copied!'); navigator.clipboard.writeText(data.shareUrl); }
    else toast('Share failed','error');
}

async function uploadFile(file, existingPid = null) {
    if (ST.uploadCtrl) ST.uploadCtrl.abort();
    ST.uploadCtrl = new AbortController();
    if(D.progBox) D.progBox.classList.remove('hidden');
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
            const initData = await initRes.json();
            pid = initData.publicId;
        }
        const CHUNK = 10 * 1024 * 1024;
        let uploaded = 0;
        let lastBytes = 0;
        let lastTime = Date.now();
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
                    if (typeof data.uploadedBytes === 'number') {
                        uploaded = data.uploadedBytes;
                        const now = Date.now();
                        const timeDiff = Math.max(1, now - lastTime);
                        const bytesDiff = uploaded - lastBytes;
                        const speed = (bytesDiff / timeDiff) * 1000;
                        updateProgress(uploaded, file.size, speed);
                        lastBytes = uploaded;
                        lastTime = now;
                    }
                    done = true;
                } else {
                    if (retries <= 0) throw new Error(data.error || 'Chunk error');
                    await sleep(1000);
                }
            }
            if (done && uploaded >= file.size) break;
            if (!done) {
                const statusRes = await fetch(`${WORKER_BASE}/upload-status/${pid}`, { headers: getAuthHeaders(), signal: ST.uploadCtrl.signal });
                if (statusRes.ok) { const s = await statusRes.json(); uploaded = s.uploadedBytes || uploaded; updateProgress(uploaded, file.size, 0); }
            }
        }
        toast(`${file.name} uploaded`, 'success');
        await fetchFiles();
    } catch (err) {
        if (err.message !== 'Cancelled') toast(`Upload failed: ${err.message}`, 'error');
    } finally {
        if(D.progBox) D.progBox.classList.add('hidden');
        ST.uploadCtrl = null;
    }
}
function updateProgress(uploaded, total, speedBps) {
    if(D.progFill) D.progFill.style.width = Math.round(uploaded/total*100)+'%';
    if(D.pctDisp) D.pctDisp.textContent = Math.round(uploaded/total*100)+'%';
    if(D.speedDisp) D.speedDisp.textContent = speedBps ? fmtSpeed(speedBps) : '--';
    if(D.sizeDisp) D.sizeDisp.textContent = `${fmtSz(uploaded)} / ${fmtSz(total)}`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
safeAddEvent(D.cancelBtn, 'click', () => { if (ST.uploadCtrl) { ST.uploadCtrl.abort(); ST.uploadCtrl = null; if(D.progBox) D.progBox.classList.add('hidden'); } });

function openPreview(pid, type) {
    if(!D.prevCont) return;
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
    if(D.prevOv) D.prevOv.classList.remove('hidden');
}
function closePreview() { if(D.prevCont) D.prevCont.innerHTML = ''; if(D.prevOv) D.prevOv.classList.add('hidden'); if (document.fullscreenElement) document.exitFullscreen(); }
safeAddEvent(D.btnCloseP, 'click', closePreview);
safeAddEvent(D.btnFull, 'click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if(D.prevOv) D.prevOv.requestFullscreen(); });

function startUserPoll() {
    let lastTs = 0;
    const poll = async () => {
        if (!ST.token || !ST.approved || ST.isAdmin) return;
        try {
            const res = await fetch(`${WORKER_BASE}/poll?utoken=${ST.token}&since=${lastTs}&timeout=25`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.changed) { lastTs = data.ts; await fetchFiles(); }
        } catch(e) {}
        ST.timers.files = setTimeout(poll, 2000);
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
                if (!D.pnlAppr?.classList.contains('hidden')) loadPending();
                if (!D.pnlUsers?.classList.contains('hidden')) loadAllUsers();
                if (!D.pnlLogs?.classList.contains('hidden')) loadLogs();
                if (!D.pnlAnalytics?.classList.contains('hidden')) loadAnalytics();
                await fetchFiles();
            }
        } catch(e) {}
        ST.timers.admin = setTimeout(poll, 2000);
    };
    poll();
}
function startRolePoll() {
    const poll = async () => {
        if (!ST.token) return;
        await fetchUserInfo(); // this will reload page if approved
        ST.timers.role = setTimeout(poll, 2000);
    };
    poll();
}
function applyRoleUI() {
    const canUpload = ['full','delete','upload'].includes(ST.role);
    if(D.dropzone) D.dropzone.style.display = canUpload ? '' : 'none';
    const hint = document.querySelector('.hint-text');
    if(hint) hint.style.display = canUpload ? '' : 'none';
}

async function showSharePreview() {
    const res = await fetch(`${WORKER_BASE}/share/verify?token=${ST.shareToken}`);
    if (!res.ok) { toast('Invalid or expired share link', 'error'); showLogin(); return; }
    const data = await res.json();
    if(D.grid) D.grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px;">
            <div class="file-icon" style="font-size:4rem">${icn(data.mimeType)}</div>
            <h2>${esc(data.fileName)}</h2>
            <p>${fmtSz(data.fileSize)}</p>
            <button id="shareDownloadBtn">⬇ Download</button>
            <button onclick="location.href='/'">🔐 Login to Vault</button>
        </div>`;
    const shareBtn = document.getElementById('shareDownloadBtn');
    if(shareBtn) shareBtn.addEventListener('click', () => {
        window.location.href = `${WORKER_BASE}/share/download?token=${ST.shareToken}`;
    });
    if(D.dropzone) D.dropzone.style.display = 'none';
    const hint = document.querySelector('.hint-text');
    if(hint) hint.style.display = 'none';
    if(D.adminBar) D.adminBar.classList.add('hidden');
    if(D.userUI) D.userUI.innerHTML = '';
}

if(D.dropzone) {
    ['dragenter','dragover','dragleave','drop'].forEach(ev => D.dropzone.addEventListener(ev, e => e.preventDefault()));
    ['dragenter','dragover'].forEach(ev => D.dropzone.addEventListener(ev, () => D.dropzone.classList.add('dragover')));
    ['dragleave','drop'].forEach(ev => D.dropzone.addEventListener(ev, () => D.dropzone.classList.remove('dragover')));
    D.dropzone.addEventListener('drop', e => { const files = e.dataTransfer.files; if (files.length) handleFiles(files); });
    D.dropzone.addEventListener('click', () => D.fileInp.click());
}
if(D.fileInp) D.fileInp.addEventListener('change', e => handleFiles(e.target.files));
function handleFiles(files) { for (const f of files) uploadFile(f); }
document.addEventListener('paste', e => {
    const items = e.clipboardData.items;
    for (let i=0; i<items.length; i++) {
        if (items[i].kind === 'file') { uploadFile(items[i].getAsFile()); break; }
    }
});
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'u') { e.preventDefault(); if(D.fileInp) D.fileInp.click(); }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); if(D.search) D.search.focus(); }
    if (e.key === 'Escape') closePreview();
});
if(D.search) D.search.addEventListener('input', () => { ST.query = D.search.value.toLowerCase(); renderFiles(); });
if(D.sortSel) D.sortSel.addEventListener('change', () => { ST.sort = D.sortSel.value; localStorage.setItem('sort', ST.sort); renderFiles(); D.sortSel.value = ST.sort; });

async function init() {
    const p = new URLSearchParams(location.search);
    const utoken = p.get('utoken');
    const share = p.get('share');
    const err = p.get('auth_error');
    if (share) {
        ST.shareToken = share;
        history.replaceState({}, '', location.pathname);
        await showSharePreview();
        return;
    }
    if (err) { toast('Auth error: '+err.replace(/_/g,' '), 'error'); history.replaceState({},'',location.pathname); }
    if (utoken) {
        ST.token = utoken;
        localStorage.setItem('vtoken', utoken);
        history.replaceState({}, '', location.pathname);
    }
    if (ST.token && await fetchUserInfo()) {
        render();
        return;
    }
    showLogin();
}
init();
