// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const ST = {
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

// ==================== DOM REFS ====================
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

// ==================== UTILS ====================
function getAuthHeaders() {
    const h = {};
    if (ST.token) {
        if (ST.isAdmin) h['X-Admin-Token'] = ST.token;
        else h['X-User-Token'] = ST.token;
    }
    return h;
}
function toast(msg, type='info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    D.toastBox.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const fmtSz = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0,s=b; while(s>=1024 && i<3) { s/=1024; i++; } return s.toFixed(1)+' '+u[i]; };
const icn = m => { if(!m) return '📄'; if(m.startsWith('video')) return '🎬'; if(m.startsWith('audio')) return '🎵'; if(m.startsWith('image')) return '🖼️'; if(m==='application/pdf') return '📕'; if(m.startsWith('text')) return '📝'; return '📄'; };
const prevType = m => { if(!m) return ''; if(m.startsWith('video')) return 'video'; if(m.startsWith('audio')) return 'audio'; if(m.startsWith('image')) return 'image'; if(m==='application/pdf') return 'pdf'; if(m.startsWith('text')) return 'text'; return ''; };

// ==================== DARK MODE ====================
(function(){
    if(ST.dark) document.documentElement.setAttribute('data-theme','dark');
    D.btnDark.addEventListener('click', () => {
        ST.dark = !ST.dark;
        document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
        localStorage.setItem('darkMode', ST.dark);
        if(ST.isAdmin && ST.token) {
            fetch(`${WORKER_BASE}/admin/set-engine`, {
                method:'POST', headers:{'Content-Type':'application/json', ...getAuthHeaders()},
                body:JSON.stringify({ engine:'d1' })
            }).catch(()=>{});
        }
    });
})();

// ==================== AUTH ====================
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
async function fetchUserInfo() {
    if (!ST.token) return false;
    const r = await fetch(`${WORKER_BASE}/user-info?utoken=${ST.token}`);
    if (!r.ok) { ST.token = null; localStorage.removeItem('vtoken'); return false; }
    const i = await r.json();
    ST.email = i.email; ST.isAdmin = i.isAdmin === true; ST.approved = i.approved; ST.role = i.role;
    return true;
}
function showLogin() {
    D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
    D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>Welcome to File Vault</h2><p style="margin:16px 0;">Sign in to access your files.</p><button class="btn btn-primary" id="btnLogin">🔑 Login with Google</button></div>`;
    document.getElementById('btnLogin').onclick = async () => {
        const r = await fetch(`${WORKER_BASE}/auth-url`);
        if(r.ok) window.location = (await r.json()).authUrl;
        else toast('Login failed','error');
    };
}
function showPending() {
    D.adminBar.classList.add('hidden'); D.userUI.innerHTML = '';
    D.dropzone.style.display = 'none';
    document.querySelector('.hint-text').style.display = 'none';
    D.grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;"><h2>🔐 Waiting for Approval</h2><p>Your email: <strong>${ST.email}</strong></p><p>You will be notified automatically.</p><button class="btn btn-outline btn-sm" onclick="location.reload()">🔄 Refresh</button><button class="btn btn-danger btn-sm" id="btnSelfRevoke">❌ Cancel Request</button></div>`;
    document.getElementById('btnSelfRevoke').onclick = selfRevoke;
    startRolePoll();
}
async function selfRevoke() {
    if(!confirm('Cancel your access request?')) return;
    await fetch(`${WORKER_BASE}/user-revoke-self`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({utoken:ST.token}) });
    ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Request cancelled.');
}
function showMain() {
    document.querySelector('.hint-text').style.display = '';
    if(ST.isAdmin) {
        D.adminBar.classList.remove('hidden'); D.userUI.innerHTML = ''; D.dropzone.style.display = '';
        loadPendingCount();
    } else {
        D.adminBar.classList.add('hidden');
        D.userUI.innerHTML = `<span style="font-size:0.85rem;">👤 ${ST.email} (${ST.role}) <button class="btn btn-sm btn-outline" id="btnUserLogout">🔒 Logout</button></span>`;
        document.getElementById('btnUserLogout').onclick = userLogout;
    }
}
function userLogout() { ST.token = null; localStorage.removeItem('vtoken'); clearTimers(); showLogin(); toast('Logged out.'); }
function render() {
    clearTimers();
    if(!ST.email) { showLogin(); return; }
    if(ST.isAdmin) { showMain(); fetchFiles(); startAdminPoll(); startRolePoll(); return; }
    if(!ST.approved) { showPending(); startRolePoll(); return; }
    showMain(); applyRoleUI(); fetchFiles(); startUserPoll(); startRolePoll();
}
function clearTimers() { ['files','admin','role'].forEach(k => { if(ST.timers[k]) clearTimeout(ST.timers[k]); }); }

// ==================== ADMIN & PANELS ====================
D.btnSync.addEventListener('click', async () => { toast('Syncing...','info'); const r = await fetch(`${WORKER_BASE}/sync`,{method:'POST',headers:getAuthHeaders()}); if(r.ok) { await fetchFiles(); toast('Sync done','success'); } else toast('Sync failed','error'); });
D.btnAppr.addEventListener('click', () => togglePanel(D.pnlAppr, loadPending));
D.btnAllUsers.addEventListener('click', () => togglePanel(D.pnlUsers, loadAllUsers));
D.btnLogs.addEventListener('click', () => togglePanel(D.pnlLogs, loadLogs));
D.btnAnalytics.addEventListener('click', () => togglePanel(D.pnlAnalytics, loadAnalytics));
D.btnShare.addEventListener('click', () => togglePanel(D.pnlShare, () => D.shareCt.innerHTML = '<p>Create a share link from a file card (🔗 Share).</p>'));
D.btnUnAuth.addEventListener('click', adminLogout);
D.btnClearLogs.addEventListener('click', async () => { if(!confirm('Delete all logs?')) return; await fetch(`${WORKER_BASE}/admin/logs/clear`,{method:'POST',headers:getAuthHeaders()}); loadLogs(); toast('Logs cleared'); });
function togglePanel(panel, loadFn) { panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) loadFn(); }
async function adminLogout() { if(confirm('Logout as admin?')) { localStorage.removeItem('vtoken'); ST.token=null; clearTimers(); showLogin(); toast('Admin logged out'); } }
async function loadPendingCount() {
    if(!ST.isAdmin) return;
    const r = await fetch(`${WORKER_BASE}/admin/pending`,{headers:getAuthHeaders()});
    const p = await r.json();
    D.pendingBadge.textContent = p.length;
    D.pendingBadge.classList.toggle('hidden', p.length===0);
}
function loadPending() {
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
    fetch(`${WORKER_BASE}/admin/users/all`,{headers:getAuthHeaders()}).then(r=>r.json()).then(users => {
        const active = users.filter(u=>u.status!=='revoked');
        const revoked = users.filter(u=>u.status==='revoked');
        let html = active.map(u => `<div class="approval-item"><span>${u.email} <span class="status-badge status-${u.status}">${u.status}</span> ${u.role?`(${u.role})` : ''}</span><div>${u.status==='pending'?`<select class="role-sel-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select><button class="btn-sm btn-success" data-action="approve" data-email="${u.email}">Approve</button>`:''}${u.status==='approved'?`<select class="role-sel-${u.email}"><option value="full" ${u.role==='full'?'selected':''}>Full</option><option value="delete" ${u.role==='delete'?'selected':''}>Delete</option><option value="upload" ${u.role==='upload'?'selected':''}>Upload Only</option><option value="download" ${u.role==='download'?'selected':''}>Download</option><option value="read" ${u.role==='read'?'selected':''}>Read</option><option value="none" ${u.role==='none'?'selected':''}>None</option></select><button class="btn-sm btn-primary" data-action="update" data-email="${u.email}">Update</button><button class="btn-sm btn-danger" data-action="revoke" data-email="${u.email}">Revoke</button>`:''}</div></div>`).join('');
        if(revoked.length) {
            html += '<hr><h4>Revoked Users</h4>';
            html += revoked.map(u => `<div class="approval-item"><span>${u.email} <span class="status-badge status-revoked">revoked</span></span><div><select class="role-sel-${u.email}"><option value="full">Full</option><option value="delete">Delete</option><option value="upload">Upload Only</option><option value="download">Download</option><option value="read">Read</option><option value="none">None</option></select><button class="btn-sm btn-warning" data-action="reapprove" data-email="${u.email}">Re‑approve</button></div></div>`).join('');
        }
        D.listUsers.innerHTML = html || '<p>No users.</p>';
        D.listUsers.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const email = btn.dataset.email;
                if(['approve','reapprove','update'].includes(action)) {
                    let role = 'full';
                    const sel = btn.parentElement.querySelector(`.role-sel-${email}`);
                    if(sel) role = sel.value;
                    const endpoint = action==='reapprove'?'reapprove':'approve';
                    await fetch(`${WORKER_BASE}/admin/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email,role})});
                    toast(`${email} updated`);
                } else if(action==='revoke') {
                    await fetch(`${WORKER_BASE}/admin/revoke`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({email})});
                    toast(`${email} revoked`);
                }
                loadAllUsers(); if(['approve','reapprove'].includes(action)) loadPendingCount();
            });
        });
    });
}
function loadLogs() {
    fetch(`${WORKER_BASE}/admin/logs?limit=200`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d => {
        const del = d.logs.filter(l=>l.action==='FILE_DELETED');
        D.logsCt.innerHTML = del.length ? del.map(l=>`<div><strong>${new Date(l.ts).toLocaleString()}</strong> ${l.actor} deleted <strong>${l.meta?.fileName||l.target}</strong></div>`).join('') : '<p>No deletion logs.</p>';
    });
}
function loadAnalytics() {
    fetch(`${WORKER_BASE}/admin/analytics`,{headers:getAuthHeaders()}).then(r=>r.json()).then(d => {
        D.analyticsCt.innerHTML = `<p>Files: ${d.files.total} (${fmtSz(d.files.totalSize)}) | Users: ${d.users.total}</p>`;
    });
}

// ==================== FILE LIST & RENDER (sectioned) ====================
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
        const sec = document.createElement('div'); sec.className='file-section';
        sec.innerHTML = `<div class="section-title">📤 ${esc(uploader)} <span>${files.length}</span></div><div class="file-grid"></div>`;
        const gridDiv = sec.querySelector('.file-grid');
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
        D.grid.appendChild(sec);
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
function updateBulkBar() { if(ST.selected.size) { D.bulkBar.classList.remove('hidden'); D.bulkCnt.textContent = `${ST.selected.size} selected`; } else D.bulkBar.classList.add('hidden'); }
D.btnBulkCancel.addEventListener('click', () => { ST.selected.clear(); renderFiles(); updateBulkBar(); });
D.btnBulkDelete.addEventListener('click', async () => {
    if(!confirm(`Delete ${ST.selected.size} files?`)) return;
    const ids = Array.from(ST.selected);
    const r = await fetch(`${WORKER_BASE}/bulk-delete`,{method:'POST',headers:{'Content-Type':'application/json',...getAuthHeaders()},body:JSON.stringify({publicIds:ids})});
    const d = await r.json();
    ST.selected.clear(); await fetchFiles();
    toast(`${d.deleted} deleted, ${d.failed} failed`);
});
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
        const {publicId}
