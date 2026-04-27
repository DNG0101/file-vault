// ==================== CONFIG ====================
const WORKER_BASE = 'https://gdrive-files-api.donthulanithish53.workers.dev';

// ==================== STATE ====================
const ST = {
  token:   localStorage.getItem('vtoken') || null,
  email:   null,
  isAdmin: false,
  approved: false,
  role:    null,
  files:   [],
  sel:     new Set(),
  sort:    localStorage.getItem('sort') || 'newest',
  query:   '',
  uploadCtrl: null,
  dark:    localStorage.getItem('darkMode') === 'true',
  timers:  { role: null, approval: null, adminPoll: null, userPoll: null },
};

// ... DOM references (identical to your existing D object)

// ==================== UTILITIES (unchanged) ====================
const toast = (msg, type = 'info') => { /* … */ };
const esc = s => { /* … */ };
// ...

// ==================== DARK MODE (plus engine toggle for admin) ====================
(function(){
  if(ST.dark) document.documentElement.setAttribute('data-theme','dark');
  D.btnDark.addEventListener('click', async () => {
    ST.dark = !ST.dark;
    document.documentElement.setAttribute('data-theme', ST.dark ? 'dark' : 'light');
    localStorage.setItem('darkMode', ST.dark);
    // Admin can also switch storage engine (optional)
    if (ST.isAdmin && ST.token) {
      const newEngine = ST.dark ? 'kv' : 'd1';
      try {
        await fetch(`${WORKER_BASE}/admin/set-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ST.token },
          body: JSON.stringify({ engine: newEngine })
        });
        toast(`Storage engine: ${newEngine.toUpperCase()}`);
      } catch (e) { /* ignore */ }
    }
  });
})();

// ==================== AUTH (unchanged) ====================
async function init() { /* … */ }
async function fetchUserInfo() { /* … */ }
function showLogin() { /* … */ }
function showPending() { /* … */ }
function showMain() { /* … */ }
// ... (same as before)

// ==================== ADMIN BAR (unchanged) ====================
// ...

// ==================== FILE LIST & ACTIONS ====================
async function fetchFiles() { /* unchanged */ }
function renderFiles() { /* unchanged, but uses getFileActions which is fine */ }

// ==================== UPLOAD ENGINE (BUG‑FIXED) ====================
async function uploadFile(file, existPid = null) {
  if(ST.uploadCtrl) ST.uploadCtrl.abort();
  ST.uploadCtrl = new AbortController(); const sig = ST.uploadCtrl.signal;
  D.progBox.classList.remove('hidden');
  try {
    let pid = existPid;
    if(!pid) {
      const ir = await fetch(`${WORKER_BASE}/upload-init`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName:file.name,fileSize:file.size,fileType:file.type||'application/octet-stream'}),
        signal:sig
      });
      if(!ir.ok) throw new Error(((await ir.json()).error) || 'Init failed');
      pid = (await ir.json()).publicId;
    }
    const CHUNK = 10*1024*1024; let up = 0;
    while(up < file.size) {
      if(sig.aborted) throw new Error('Cancelled');
      const end = Math.min(up+CHUNK-1, file.size-1);
      const chunk = file.slice(up, end+1);
      let retries = 3, done = false;
      while(retries-- && !done) {
        const cr = await fetch(`${WORKER_BASE}/upload-chunk/${pid}`,{
          method:'PUT',headers:{'Content-Range':`bytes ${up}-${end}/${file.size}`},body:chunk,signal:sig
        });
        const d = await cr.json();
        if(cr.ok) {
          // Use data.complete to check if upload finished (worker now returns complete:true)
          if(d.complete === true) { done = true; break; }
          // update progress with returned bytes
          if(typeof d.uploadedBytes === 'number') {
            up = d.uploadedBytes;
            updateProg(up, file.size);
          }
          done = true;   // chunk accepted, move to next
        } else {
          if(retries <= 0) throw new Error(d.error || 'Chunk error');
          await sleep(1000);
        }
      }
      if(done && up >= file.size) break;   // complete
      if(!done) {
        // fallback: query upload status
        const sr = await fetch(`${WORKER_BASE}/upload-status/${pid}`,{signal:sig});
        if(sr.ok) {
          const s = await sr.json();
          up = s.uploadedBytes || up;
          updateProg(up, file.size);
        }
      }
    }
    toast(`${file.name} uploaded`, 'success');
  } catch(err) { if(err.message!=='Cancelled') toast(`Upload failed: ${err.message}`, 'error'); }
  finally { D.progBox.classList.add('hidden'); ST.uploadCtrl = null; }
}

// ... (rest of script: preview, download, delete, replace, rename, share, polling, etc., unchanged)
// The complete file is available for download.
