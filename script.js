:root {
  --bg: #f8fafc; --card-bg: #fff; --text: #1e293b; --text-secondary: #64748b;
  --border: #e2e8f0; --accent: #2563eb; --accent-hover: #1d4ed8; --success: #16a34a;
  --danger: #dc2626; --warn: #f59e0b; --purple: #7c3aed; --radius: 12px;
  --shadow: 0 4px 6px -1px rgba(0,0,0,0.05); --overlay-bg: rgba(0,0,0,0.92);
  --toast-bg: #334155; --toast-text: #f1f5f9;
}
[data-theme="dark"] {
  --bg: #0f172a; --card-bg: #1e293b; --text: #e2e8f0; --text-secondary: #94a3b8;
  --border: #334155; --shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
  --overlay-bg: rgba(0,0,0,0.96); --toast-bg: #475569;
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh; padding: 20px;
  transition: background 0.3s, color 0.3s;
}
.container { max-width: 1200px; margin:0 auto; }
.hidden { display:none !important; }
.header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:24px; }
.header h1 { font-size: clamp(1.8rem, 6vw, 2.2rem); font-weight:700; }
.header-right { display:flex; align-items:center; gap:12px; }
.btn-icon { padding:8px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); color:var(--text); cursor:pointer; min-width:40px; min-height:40px; display:flex; align-items:center; justify-content:center; }
.btn-icon:hover { background:var(--border); }
.btn { padding:10px 18px; border:none; border-radius:8px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:0.9rem; transition:0.15s; min-width:44px; min-height:44px; background:var(--card-bg); color:var(--text); border:1px solid var(--border); }
.btn:hover { background:var(--border); }
.btn-primary { background:var(--accent); color:white; border-color:var(--accent); }
.btn-primary:hover { background:var(--accent-hover); }
.btn-danger { background:var(--danger); color:white; border-color:var(--danger); }
.btn-outline { background:transparent; }
.btn-sm { padding:6px 12px; font-size:0.8rem; border-radius:6px; min-height:36px; }
.toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
.search-box { flex:1; min-width:200px; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); color:var(--text); outline:none; }
.search-box:focus { border-color:var(--accent); }
.sort-select { padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); color:var(--text); cursor:pointer; }
.stats { font-size:0.85rem; color:var(--text-secondary); }
.dropzone {
  border:2px dashed var(--border); border-radius:16px; padding:48px 20px;
  text-align:center; background:var(--card-bg); cursor:pointer; transition:0.2s; margin-bottom:20px;
}
.dropzone:hover, .dragover { border-color:var(--accent); background:#f1f5f9; }
.dropzone input { display:none; }
.hint-text { font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px; text-align:center; }
.hint-text kbd { background:var(--card-bg); border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-family:monospace; }
.progress-box { margin-bottom:20px; }
.progress-bar { height:6px; background:var(--border); border-radius:3px; overflow:hidden; }
.progress-fill { height:100%; width:0%; background:var(--accent); transition:width 0.2s; }
.progress-text { display:flex; justify-content:space-between; font-size:0.75rem; margin-top:6px; color:var(--text-secondary); }
.cancel-btn { background:var(--danger); color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.75rem; }
.file-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:16px; }
.card {
  background:var(--card-bg); border-radius:var(--radius); padding:20px;
  box-shadow:var(--shadow); border:1px solid var(--border); display:flex; flex-direction:column;
  position:relative; transition: box-shadow 0.2s, transform 0.2s;
}
.card:hover { box-shadow:0 10px 25px -5px rgba(0,0,0,0.08); transform:translateY(-2px); }
.card.selected { border-color:var(--accent); }
.card.uploading { opacity:0.5; pointer-events:none; }
.card-checkbox { position:absolute; top:10px; right:10px; width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
.file-icon { font-size:2.4rem; text-align:center; margin-bottom:12px; }
.file-name { font-weight:600; word-break:break-all; margin-bottom:8px; font-size:0.95rem; }
.file-meta { font-size:0.75rem; color:var(--text-secondary); margin-bottom:14px; }
.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:auto; }
.btn-xs { padding:6px 10px; border:none; border-radius:6px; font-size:0.7rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; min-width:32px; min-height:32px; }
.btn-xs-play { background:var(--accent); color:#fff; }
.btn-xs-preview { background:var(--purple); color:#fff; }
.btn-xs-download { background:var(--success); color:#fff; }
.btn-xs-delete { background:var(--danger); color:#fff; }
.btn-xs-replace { background:var(--warn); color:#222; }
.admin-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:12px; background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:16px; }
.panel { background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:16px; }
.panel h3 { margin-bottom:12px; }
.approval-item { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); gap:10px; }
.badge-count { background:var(--danger); color:white; border-radius:10px; padding:1px 6px; font-size:0.7rem; }
.bulk-bar { display:flex; align-items:center; gap:10px; padding:10px 16px; background:var(--accent); color:#fff; border-radius:8px; margin-bottom:12px; }
.bulk-bar button { background:rgba(255,255,255,0.2); color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; }
.preview-overlay { position:fixed; inset:0; background:var(--overlay-bg); z-index:1000; display:flex; justify-content:center; align-items:center; flex-direction:column; }
.preview-container { width:100%; height:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.preview-container img, .preview-container iframe, .preview-container video, .preview-container pre { max-width:95%; max-height:95%; object-fit:contain; border-radius:6px; }
.preview-container pre { background:#1e293b; color:#cbd5e1; padding:24px; overflow:auto; white-space:pre-wrap; word-break:break-all; max-width:85%; max-height:85%; border-radius:8px; font-size:0.85rem; line-height:1.5; }
.preview-toolbar { position:absolute; top:16px; right:16px; display:flex; gap:10px; }
.preview-toolbar button { background:rgba(255,255,255,0.12); border:none; color:#fff; padding:10px 16px; border-radius:8px; cursor:pointer; backdrop-filter:blur(8px); font-size:0.9rem; }
.preview-toolbar button:hover { background:rgba(255,255,255,0.25); }
.toast-container { position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column-reverse; gap:8px; max-width:400px; }
.toast { padding:12px 16px; border-radius:8px; color:var(--toast-text); background:var(--toast-bg); font-size:0.85rem; font-weight:500; box-shadow:0 8px 20px rgba(0,0,0,0.2); animation:slideIn 0.3s ease; }
.toast.error { background:var(--danger); }
.toast.success { background:var(--success); }
@keyframes slideIn { from { transform:translateX(100%); opacity:0; } }
@media (max-width:600px) {
  body { padding:10px; }
  .dropzone { padding:30px 14px; }
  .file-grid { grid-template-columns:1fr; }
}
