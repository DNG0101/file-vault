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
DOM.btnSync.addEventListener('click', async ()=>{
  toast('Syncing files from storage…','info');
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
DOM.dropzone.addEventListener('click', ()=>DOM.fileInput.click());
DOM.fileInput.addEventListener('change', e=>{ if(e.target.files.length) processFiles(e.target.files); e.target.value=''; });
DOM.dropzone.addEventListener('dragover', e=>{ e.preventDefault(); DOM.dropzone.classList.add('dragover'); });
DOM.dropzone.addEventListener('dragleave', ()=>DOM.dropzone.classList.remove('dragover'));
DOM.dropzone.addEventListener('drop', e=>{ e.preventDefault(); DOM.dropzone.classList.remove('dragover'); if(e.dataTransfer.files.length) processFiles(e.dataTransfer.files); });
document.addEventListener('paste', e=>{
  const items=e.clipboardData?.items;
  if(!items) return;
  const files=[];
  for(const item of items) if(item.kind==='file'){ const file=item.getAsFile(); if(file) files.push(file); }
  if(files.length){ e.preventDefault(); processFiles(files); }
});
document.addEventListener('keydown', e=>{
  if(e.ctrlKey&&e.key==='u'){ e.preventDefault(); DOM.fileInput.click(); }
  if(e.ctrlKey&&e.key==='f'){ e.preventDefault(); DOM.searchInput.focus(); }
  if(e.key==='Escape'){
    if(!DOM.previewOverlay.classList.contains('hidden')) closePreview();
    if(state.selectedFiles.size){ state.selectedFiles.clear(); renderFileList(); updateBulkBar(); }
  }
});

// ==================== UPLOAD ENGINE ====================
async function processFiles(files){
  for(const file of files){
    const tempId='temp_'+Date.now()+Math.random();
    state.currentFileList.unshift({publicId:tempId, fileName:file.name, fileType:file.type||'application/octet-stream', size:file.size, uploadedAt:Date.now()});
    renderFileList();
    try{ await uploadFile(file,tempId); }catch(err){ toast(`Upload failed: ${err.message}`,'error'); state.currentFileList=state.currentFileList.filter(f=>f.publicId!==tempId); renderFileList(); }
  }
  await refreshFileList();
}

async function uploadFile(file, tempId){
  if(state.uploadAbortController) state.uploadAbortController.abort();
  state.uploadAbortController=new AbortController();
  const signal=state.uploadAbortController.signal;
  DOM.progressBox.classList.remove('hidden');

  try{
    const initRes=await fetch(`${WORKER_BASE}/upload-init`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fileName:file.name, fileSize:file.size, fileType:file.type||'application/octet-stream'}), signal
    });
    if(!initRes.ok) throw new Error(((await initRes.json().catch(()=>({}))).error)||'Init failed');
    const {publicId}=await initRes.json();
    const entry=state.currentFileList.find(f=>f.publicId===tempId);
    if(entry) entry.publicId=publicId;
    renderFileList();

    let uploaded=0;
    try{
      const statusRes=await fetch(`${WORKER_BASE}/upload-status/${publicId}`,{signal});
      if(statusRes.ok){ const d=await statusRes.json(); if(d.complete){ DOM.progressBox.classList.add('hidden'); return; } uploaded=d.uploaded||0; }
    }catch(e){}

    const CHUNK=10*1024*1024;
    while(uploaded < file.size){
      if(signal.aborted) throw new Error('Cancelled');
      const end=Math.min(uploaded+CHUNK-1, file.size-1);
      const chunk=file.slice(uploaded, end+1);
      let retries=0, done=false;
      while(retries<3 && !done){
        try{
          const res=await fetch(`${WORKER_BASE}/upload-chunk/${publicId}`,{
            method:'PUT', headers:{'Content-Range':`bytes ${uploaded}-${end}/${file.size}`}, body:chunk, signal
          });
          const data=await res.json().catch(()=>({}));
          if(!res.ok) throw new Error(data.error||`Chunk error`);
          if(data.complete){ done=true; break; }
          if(data.uploaded!==undefined){ uploaded=data.uploaded; updateProgress(uploaded,file.size); done=true; }
        }catch(err){ if(retries>=2) throw err; retries++; await new Promise(r=>setTimeout(r,1000*retries)); }
      }
      if(done && uploaded>=file.size-1) break;
      if(!done){
        const statusRes=await fetch(`${WORKER_BASE}/upload-status/${publicId}`,{signal});
        if(statusRes.ok){ const s=await statusRes.json(); uploaded=s.uploaded||uploaded; updateProgress(uploaded,file.size); }
      }
    }
    toast(`${file.name} uploaded!`,'success');
  }finally{ DOM.progressBox.classList.add('hidden'); state.uploadAbortController=null; }
}

function updateProgress(uploaded,total){
  const pct=total?Math.round((uploaded/total)*100):0;
  DOM.progressFill.style.width=pct+'%';
  DOM.percentDisplay.textContent=pct+'%';
  DOM.sizeDisplay.textContent=`${fmtBytes(uploaded)} / ${fmtBytes(total)}`;
}
DOM.cancelUploadBtn.addEventListener('click',()=>{ if(state.uploadAbortController){ state.uploadAbortController.abort(); state.uploadAbortController=null; DOM.progressBox.classList.add('hidden'); } });

// ==================== FILE LIST ====================
async function refreshFileList(){
  try{
    const res=await fetch(`${WORKER_BASE}/list`);
    if(!res.ok) throw new Error('List failed');
    const serverFiles=await res.json();
    const optimistic=state.currentFileList.filter(f=>f.publicId?.startsWith('temp_'));
    const serverIds=new Set(serverFiles.map(f=>f.publicId));
    state.currentFileList=[...optimistic.filter(f=>!serverIds.has(f.publicId)),...serverFiles];
    updateStats();
    renderFileList();
  }catch(e){ console.error(e); }
}

function updateStats(){
  const real=state.currentFileList.filter(f=>!f.publicId?.startsWith('temp_'));
  DOM.storageStats.textContent=`${real.length} file${real.length!==1?'s':''} · ${fmtBytes(real.reduce((a,b)=>a+(b.size||0),0))}`;
}

function renderFileList(){
  let files=[...state.currentFileList];
  if(state.searchQuery) files=files.filter(f=>f.fileName.toLowerCase().includes(state.searchQuery.toLowerCase()));
  switch(state.sortOrder){
    case 'newest': files.sort((a,b)=>(b.uploadedAt||0)-(a.uploadedAt||0)); break;
    case 'oldest': files.sort((a,b)=>(a.uploadedAt||0)-(b.uploadedAt||0)); break;
    case 'name-asc': files.sort((a,b)=>a.fileName.localeCompare(b.fileName)); break;
    case 'name-desc': files.sort((a,b)=>b.fileName.localeCompare(a.fileName)); break;
    case 'size-desc': files.sort((a,b)=>(b.size||0)-(a.size||0)); break;
    case 'size-asc': files.sort((a,b)=>(a.size||0)-(b.size||0)); break;
  }
  DOM.fileGrid.innerHTML='';
  if(!files.length){ DOM.fileGrid.innerHTML=`<p style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-secondary);">${state.searchQuery?'No files match your search.':'No files yet. Upload or Sync.'}</p>`; return; }
  files.forEach(f=>{
    const isUp=f.publicId?.startsWith('temp_');
    const actions=getAvailableActions(f.publicId);
    const card=document.createElement('div');
    card.className=`card${isUp?' uploading':''}${state.selectedFiles.has(f.publicId)?' selected':''}`;
    card.dataset.publicId=f.publicId;
    card.innerHTML=`
      ${!isUp?`<input type="checkbox" class="card-checkbox" data-id="${f.publicId}" ${state.selectedFiles.has(f.publicId)?'checked':''}>`:''}
      <div class="file-icon">${getIcon(f.fileType)}</div>
      <div class="file-name">${esc(f.fileName)}</div>
      <div class="file-meta">${fmtBytes(f.size)} · ${new Date(f.uploadedAt).toLocaleString()}${isUp?' · Uploading...':''}</div>
      <div class="actions">
        ${actions.includes('play')?`<button class="btn-xs btn-xs-play" data-action="play" data-id="${f.publicId}">▶ Play</button>`:''}
        ${actions.includes('preview')?`<button class="btn-xs btn-xs-preview" data-action="preview" data-id="${f.publicId}">🔍 Preview</button>`:''}
        ${actions.includes('download')?`<button class="btn-xs btn-xs-download" data-action="download" data-id="${f.publicId}">⬇</button>`:''}
        ${actions.includes('delete')?`<button class="btn-xs btn-xs-delete" data-action="delete" data-id="${f.publicId}">🗑</button>`:''}
        ${actions.includes('replace')?`<button class="btn-xs btn-xs-replace" data-action="replace" data-id="${f.publicId}">🔄</button>`:''}
      </div>`;
    DOM.fileGrid.appendChild(card);
  });
  DOM.fileGrid.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const action=btn.dataset.action, id=btn.dataset.id;
      if(action==='play') openPreview(id,'video');
      else if(action==='preview') openPreview(id,previewType(state.currentFileList.find(f=>f.publicId===id)?.fileType));
      else if(action==='download') downloadFile(id);
      else if(action==='delete') deleteFile(id);
      else if(action==='replace') replaceFile(id);
    });
  });
  DOM.fileGrid.querySelectorAll('.card-checkbox').forEach(cb=>{
    cb.addEventListener('click',e=>{ e.stopPropagation(); const id=cb.dataset.id; if(cb.checked) state.selectedFiles.add(id); else state.selectedFiles.delete(id); updateBulkBar(); renderFileList(); });
  });
  DOM.fileGrid.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click',e=>{
      if(e.target.tagName==='BUTTON'||e.target.tagName==='INPUT') return;
      const id=card.dataset.publicId;
      if(!id||id.startsWith('temp_')) return;
      if(state.selectedFiles.has(id)) state.selectedFiles.delete(id); else state.selectedFiles.add(id);
      updateBulkBar();
      renderFileList();
    });
  });
  updateBulkBar();
}

function updateBulkBar(){ if(state.selectedFiles.size){ DOM.bulkBar.classList.remove('hidden'); DOM.bulkCount.textContent=`${state.selectedFiles.size} selected`; } else DOM.bulkBar.classList.add('hidden'); }
document.getElementById('btnBulkCancel').addEventListener('click',()=>{ state.selectedFiles.clear(); renderFileList(); updateBulkBar(); });
document.getElementById('btnBulkDelete').addEventListener('click',async ()=>{
  if(!confirm(`Delete ${state.selectedFiles.size} file(s)?`)) return;
  for(const id of state.selectedFiles){
    await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:id})}).catch(()=>{});
  }
  state.selectedFiles.clear(); updateBulkBar(); await refreshFileList(); toast('Deleted','success');
});

DOM.searchInput.addEventListener('input',()=>{ state.searchQuery=DOM.searchInput.value; renderFileList(); });
DOM.sortSelect.addEventListener('change',()=>{ state.sortOrder=DOM.sortSelect.value; renderFileList(); });

// ==================== PREVIEW ====================
function openPreview(publicId, type){
  DOM.previewContainer.innerHTML='';
  const url=`${WORKER_BASE}/video/${publicId}`;
  if(type==='video'||type==='audio'){
    const media=document.createElement(type==='audio'?'audio':'video');
    media.src=url; media.controls=true; media.playsInline=true; media.style.maxWidth='95%'; media.style.maxHeight='95%';
    if(type==='audio'){ media.style.width='500px'; media.style.maxHeight='80px'; }
    DOM.previewContainer.appendChild(media);
    media.play().catch(()=>{});
  }else if(type==='image'){
    const img=document.createElement('img'); img.src=url; img.style.maxWidth='95%'; img.style.maxHeight='95%'; img.style.objectFit='contain';
    DOM.previewContainer.appendChild(img);
  }else if(type==='pdf'){
    const iframe=document.createElement('iframe'); iframe.src=url; iframe.style.width='90%'; iframe.style.height='90%';
    DOM.previewContainer.appendChild(iframe);
  }else if(type==='text'){
    fetch(url).then(r=>r.text()).then(t=>{
      const pre=document.createElement('pre'); pre.textContent=t; DOM.previewContainer.appendChild(pre);
    }).catch(()=>{ DOM.previewContainer.innerHTML='<p style="color:#fff;">Failed to load preview</p>'; });
  }else{ downloadFile(publicId); return; }
  DOM.previewOverlay.classList.remove('hidden');
}
function closePreview(){
  DOM.previewContainer.innerHTML='';
  DOM.previewOverlay.classList.add('hidden');
  if(document.fullscreenElement) document.exitFullscreen();
}
DOM.btnClosePreview.addEventListener('click',closePreview);
DOM.btnFullscreen.addEventListener('click',()=>{ if(document.fullscreenElement) document.exitFullscreen(); else DOM.previewOverlay.requestFullscreen(); });

// ==================== DOWNLOAD / DELETE / REPLACE ====================
function downloadFile(publicId){
  const a=document.createElement('a');
  a.href=`${WORKER_BASE}/download/${publicId}`; a.download=''; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
async function deleteFile(publicId){
  if(!confirm('Delete?')) return;
  const res=await fetch(`${WORKER_BASE}/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId})});
  if(res.ok){ state.currentFileList=state.currentFileList.filter(f=>f.publicId!==publicId); state.selectedFiles.delete(publicId); renderFileList(); updateBulkBar(); updateStats(); toast('Deleted','success'); }
  else toast('Delete failed','error');
}
function replaceFile(publicId){
  const input=document.createElement('input'); input.type='file';
  input.onchange=async ()=>{
    const file=input.files[0]; if(!file) return;
    try{
      DOM.progressBox.classList.remove('hidden');
      const initRes=await fetch(`${WORKER_BASE}/update`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({publicId, fileName:file.name, fileType:file.type||'application/octet-stream'})
      });
      if(!initRes.ok) throw new Error(((await initRes.json().catch(()=>({}))).error)||'Update init failed');
      const {publicId:newPid}=await initRes.json();
      let uploaded=0;
      const CHUNK=10*1024*1024;
      while(uploaded<file.size){
        const end=Math.min(uploaded+CHUNK-1, file.size-1);
        const chunk=file.slice(uploaded, end+1);
        let retries=0, done=false;
        while(retries<3 && !done){
          try{
            const res=await fetch(`${WORKER_BASE}/upload-chunk/${newPid}`,{
              method:'PUT', headers:{'Content-Range':`bytes ${uploaded}-${end}/${file.size}`}, body:chunk
            });
            const data=await res.json().catch(()=>({}));
            if(!res.ok) throw new Error(data.error||'Chunk error');
            if(data.complete){ done=true; break; }
            if(data.uploaded!==undefined){ uploaded=data.uploaded; updateProgress(uploaded,file.size); done=true; }
          }catch(err){ if(retries>=2) throw err; retries++; await new Promise(r=>setTimeout(r,1000*retries)); }
        }
        if(done && uploaded>=file.size-1) break;
      }
      await refreshFileList();
      toast('File replaced!','success');
    }catch(err){ toast('Replace failed: '+err.message,'error'); }
    finally{ DOM.progressBox.classList.add('hidden'); }
  };
  input.click();
}

// ==================== POLLING ====================
function startRolePolling(){
  if(state.rolePollInterval) clearInterval(state.rolePollInterval);
  state.rolePollInterval=setInterval(async ()=>{
    if(!state.userToken || !state.userApproved) return;
    try{
      const res=await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
      const info=await res.json();
      if(info.role!==state.userRole){
        state.userRole=info.role;
        toast(`Permissions updated to: ${state.userRole}`,'info');
        applyPermissionsUI(state.userRole);
        if(state.userRole==='none'){
          DOM.fileGrid.innerHTML='<p style="text-align:center; padding:2rem;">Access revoked.</p>';
          DOM.dropzone.style.display='none';
          document.querySelector('.hint-text').style.display='none';
          clearInterval(state.rolePollInterval);
        }
      }
    }catch(e){}
  },5000);
}

function startApprovalPolling(){
  if(state.approvalPollInterval) clearInterval(state.approvalPollInterval);
  state.approvalPollInterval=setInterval(async ()=>{
    if(!state.userToken) return;
    try{
      const res=await fetch(`${WORKER_BASE}/user-info?utoken=${state.userToken}`);
      const info=await res.json();
      if(info.approved){
        state.userApproved=true;
        state.userRole=info.role;
        clearInterval(state.approvalPollInterval);
        toast('You have been approved!','success');
        renderMainApp();
        applyPermissionsUI(state.userRole);
        refreshFileList();
        startRolePolling();
      }
    }catch(e){}
  },10000);
}

// ==================== INIT ====================
init();
