// ─── Sticky Notepad v5 — Folders + Tags ──────────────────────────────────────

// ─── Palette ─────────────────────────────────────────────────────────────────
const COLORS = [
  null,
  { name:'Yellow',   value:'#fde68a', deep:'#d97706' },
  { name:'Green',    value:'#bbf7d0', deep:'#16a34a' },
  { name:'Pink',     value:'#fbcfe8', deep:'#db2777' },
  { name:'Purple',   value:'#ddd6fe', deep:'#7c3aed' },
  { name:'Blue',     value:'#bae6fd', deep:'#0284c7' },
  { name:'Peach',    value:'#fed7aa', deep:'#ea580c' },
  { name:'Mint',     value:'#a7f3d0', deep:'#059669' },
  { name:'Lavender', value:'#e9d5ff', deep:'#9333ea' },
];

// ─── Storage keys ────────────────────────────────────────────────────────────
const SK = { notes:'sp5_notes', folders:'sp5_folders', tabs:'sp5_tabs', active:'sp5_active', theme:'notepad_theme' };

// ─── State ───────────────────────────────────────────────────────────────────
let notes    = {};   // { [id]: note }
let folders  = {};   // { [id]: { id, name, createdAt } }
let openTabs = [];   // [id]
let activeId = null;

let activeFilter = { type: 'all' }; // { type: 'all'|'pinned'|'archived'|'folder'|'tag', value? }
let ctxNoteId    = null;
let saveTimer    = null;

// ─── DOM ─────────────────────────────────────────────────────────────────────
const editor      = document.getElementById('editor');
const tabsEl      = document.getElementById('tabs');
const saveStatus  = document.getElementById('saveStatus');
const wordCountEl = document.getElementById('wordCount');
const contextMenu = document.getElementById('contextMenu');
const tagPopup    = document.getElementById('tagPopup');
const folderPopup = document.getElementById('folderPopup');
const editorWrap  = document.getElementById('editorWrap');
const page        = document.getElementById('page');
const drawer      = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');

// ─── Init ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  loadTheme();
  buildCtxColors();
  renderAll();

  editor.addEventListener('input', onEditorInput);
  document.addEventListener('click', closeAllPopups);
  // Only block browser context menu outside the editor (preserves spellcheck)
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('#editor')) e.preventDefault();
  });
  document.addEventListener('keydown', handleKeyboard);
});

function renderAll() {
  renderTabs();
  applyActive();
  renderDrawerNav();
  renderDrawerList();
}

// ─── Note CRUD ───────────────────────────────────────────────────────────────
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

function createNote(name, folderId) {
  const id = makeId();
  notes[id] = {
    id, name: name || ('Note ' + (Object.keys(notes).length + 1)),
    color: 0, content: '',
    pinned: false, archived: false,
    folderId: folderId || null,
    tags: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  return notes[id];
}

function newNote(folderId) {
  saveCurrent();
  // If a folder filter is active, default new note into that folder
  const folder = folderId || (activeFilter.type === 'folder' ? activeFilter.value : null);
  const n = createNote(null, folder);
  openTabs.push(n.id);
  activeId = n.id;
  saveState();
  renderAll();
  editor.focus();
}

function openNote(id) {
  if (!notes[id]) return;
  saveCurrent();
  if (!openTabs.includes(id)) openTabs.push(id);
  activeId = id;
  saveState();
  renderTabs();
  applyActive();
}

function closeTab(id) {
  saveCurrent();
  const idx = openTabs.indexOf(id);
  if (idx === -1) return;
  openTabs.splice(idx, 1);
  if (openTabs.length === 0) {
    const n = createNote();
    openTabs.push(n.id);
    activeId = n.id;
  } else {
    activeId = openTabs[Math.min(idx, openTabs.length - 1)];
  }
  saveState();
  renderTabs();
  applyActive();
  renderDrawerList();
}

function archiveNote(id) {
  if (!notes[id]) return;
  notes[id].archived = true;
  notes[id].pinned = false;
  const idx = openTabs.indexOf(id);
  if (idx !== -1) openTabs.splice(idx, 1);
  if (!openTabs.includes(activeId)) {
    if (openTabs.length === 0) { const n = createNote(); openTabs.push(n.id); activeId = n.id; }
    else activeId = openTabs[Math.max(0, idx - 1)];
  }
  saveState(); renderAll();
}

function unarchiveNote(id) {
  if (!notes[id]) return;
  notes[id].archived = false;
  saveState(); openNote(id); renderDrawerList();
}

function deleteNote(id) {
  delete notes[id];
  const idx = openTabs.indexOf(id);
  if (idx !== -1) openTabs.splice(idx, 1);
  if (openTabs.length === 0) { const n = createNote(); openTabs.push(n.id); activeId = n.id; }
  else if (!openTabs.includes(activeId)) activeId = openTabs[Math.max(0, idx - 1)];
  saveState(); renderAll();
}

function duplicateNote(id) {
  const o = notes[id]; if (!o) return;
  saveCurrent();
  const n = createNote(o.name + ' (copy)', o.folderId);
  n.color = o.color; n.content = o.content; n.tags = [...o.tags];
  openNote(n.id); renderDrawerList();
}

function togglePin(id) {
  if (!notes[id]) return;
  notes[id].pinned = !notes[id].pinned;
  saveState(); renderTabs(); renderDrawerList();
}

function setNoteColor(id, ci) {
  if (!notes[id]) return;
  notes[id].color = ci; notes[id].updatedAt = Date.now();
  saveState(); renderTabs();
  if (id === activeId) applyNoteColor();
  renderDrawerList();
}

function setNoteFolder(id, folderId) {
  if (!notes[id]) return;
  notes[id].folderId = folderId; notes[id].updatedAt = Date.now();
  saveState(); renderDrawerNav(); renderDrawerList();
}

// ─── Tag management ──────────────────────────────────────────────────────────
function getAllTags() {
  const set = new Set();
  Object.values(notes).filter(n => !n.archived).forEach(n => (n.tags || []).forEach(t => set.add(t)));
  return [...set].sort();
}

function addTag(noteId, tag) {
  tag = tag.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  if (!tag.startsWith('#')) tag = '#' + tag;
  const n = notes[noteId]; if (!n) return;
  if (!n.tags) n.tags = [];
  if (!n.tags.includes(tag)) { n.tags.push(tag); n.updatedAt = Date.now(); }
  saveState(); renderActiveTagChips(); renderDrawerNav(); renderDrawerList();
}

function removeTag(noteId, tag) {
  const n = notes[noteId]; if (!n) return;
  n.tags = (n.tags || []).filter(t => t !== tag);
  n.updatedAt = Date.now();
  saveState(); renderActiveTagChips(); renderDrawerNav(); renderDrawerList();
}

function toggleTag(noteId, tag) {
  const n = notes[noteId]; if (!n) return;
  if ((n.tags || []).includes(tag)) removeTag(noteId, tag);
  else addTag(noteId, tag);
}

// ─── Folder CRUD ─────────────────────────────────────────────────────────────
function createFolder(name) {
  const id = makeId();
  folders[id] = { id, name: name || 'New Folder', createdAt: Date.now() };
  saveState(); renderDrawerNav(); return folders[id];
}

function renameFolder(id) {
  const name = prompt('Rename folder:', folders[id]?.name);
  if (!name?.trim()) return;
  folders[id].name = name.trim();
  saveState(); renderDrawerNav();
}

function deleteFolder(id) {
  if (!confirm(`Delete folder "${folders[id]?.name}"? Notes inside will move to No Folder.`)) return;
  Object.values(notes).forEach(n => { if (n.folderId === id) n.folderId = null; });
  delete folders[id];
  if (activeFilter.type === 'folder' && activeFilter.value === id) setFilter('all');
  saveState(); renderAll();
}

function getFolderCount(id) {
  return Object.values(notes).filter(n => n.folderId === id && !n.archived).length;
}

function exportFolder(folderId) {
  if (typeof JSZip === 'undefined') { alert('JSZip not loaded. Make sure you have an internet connection.'); return; }
  const folderNotes = Object.values(notes).filter(n => n.folderId === folderId && !n.archived);
  if (folderNotes.length === 0) { alert('No notes in this folder to export.'); return; }
  const zip = new JSZip();
  const folderName = folders[folderId]?.name || 'folder';
  folderNotes.forEach(n => {
    const text = stripHtml(n.content);
    const safe = n.name.replace(/[^a-z0-9\-_ ]/gi, '_');
    zip.file(safe + '.txt', text);
  });
  zip.generateAsync({ type: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = folderName.replace(/[^a-z0-9\-_ ]/gi,'_') + '-notes.zip';
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus(`Exported ${folderNotes.length} notes from "${folderName}"`);
  });
}

// ─── Tab Rendering ───────────────────────────────────────────────────────────
function renderTabs() {
  tabsEl.innerHTML = '';
  const sorted = [...openTabs].sort((a,b) => (notes[b]?.pinned ? 1:0) - (notes[a]?.pinned ? 1:0));
  sorted.forEach(id => {
    const note = notes[id]; if (!note) return;
    const color = COLORS[note.color ?? 0];
    const hasColor = color !== null;
    const isActive = id === activeId;
    const el = document.createElement('div');
    el.className = `tab${isActive ? ' active '+(hasColor?'has-color':'no-color') : ''}`;
    el.dataset.id = id; el.title = note.name;
    el.innerHTML = `
      ${note.pinned ? '<span class="tab-pin">📌</span>' : ''}
      <div class="tab-dot${hasColor?'':' nc'}" style="${hasColor?'background:'+color.value:''}" data-action="noop"></div>
      <span class="tab-name">${escHtml(note.name)}</span>
      <span class="tab-menu" data-action="menu">⋯</span>
      <span class="tab-close" data-action="close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>`;
    el.addEventListener('click', e => onTabClick(e, id));
    el.addEventListener('dblclick', () => startRename(id));
    el.addEventListener('contextmenu', e => showContextMenu(e, id));
    tabsEl.appendChild(el);
  });
}

function onTabClick(e, id) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'close') { e.stopPropagation(); closeTab(id); return; }
  if (action === 'menu')  { e.stopPropagation(); showContextMenu(e, id); return; }
  if (id !== activeId) switchTab(id);
}

function switchTab(id) {
  saveCurrent(); activeId = id; saveState(); renderTabs(); applyActive();
}

function applyActive() {
  const note = notes[activeId]; if (!note) return;
  editor.innerHTML = note.content || '';
  applyNoteColor();
  renderActiveTagChips();
  updateWordCount();
}

function applyNoteColor() {
  const note = notes[activeId];
  const color = COLORS[note?.color ?? 0];
  const has = color !== null;
  document.documentElement.style.setProperty('--note-color', has ? color.value : 'transparent');
  document.documentElement.style.setProperty('--note-color-deep', has ? color.deep : '#c17f3a');
  editorWrap.classList.toggle('has-color', has);
  editorWrap.classList.toggle('no-color', !has);
  page.classList.toggle('has-color', has);
  page.classList.toggle('no-color', !has);
}

function renderActiveTagChips() {
  const container = document.getElementById('activeTags');
  const note = notes[activeId];
  const tags = note?.tags || [];
  container.innerHTML = tags.map(t =>
    `<span class="active-tag-chip">${escHtml(t)}</span>`
  ).join('');
}

// ─── Rename ──────────────────────────────────────────────────────────────────
function startRename(id) {
  const tabEl = tabsEl.querySelector(`[data-id="${id}"]`);
  const nameEl = tabEl?.querySelector('.tab-name'); if (!nameEl) return;
  const input = document.createElement('input');
  input.className = 'tab-name-input'; input.value = notes[id]?.name || '';
  nameEl.replaceWith(input); input.focus(); input.select();
  const finish = () => {
    const val = input.value.trim() || 'Untitled';
    if (notes[id]) { notes[id].name = val; notes[id].updatedAt = Date.now(); }
    saveState(); renderTabs(); renderDrawerList();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') { input.value = notes[id]?.name || ''; input.blur(); }
    ev.stopPropagation();
  });
}

// ─── Drawer Nav (folders + tags) ─────────────────────────────────────────────
function renderDrawerNav() {
  // Folders
  const fl = document.getElementById('folderList');
  fl.innerHTML = '';
  const allFolders = Object.values(folders).sort((a,b) => a.name.localeCompare(b.name));
  if (allFolders.length === 0) {
    fl.innerHTML = '<div style="padding:4px 12px;font-size:12px;color:var(--text-muted);font-style:italic">No folders yet</div>';
  }
  allFolders.forEach(f => {
    const count = getFolderCount(f.id);
    const isActive = activeFilter.type === 'folder' && activeFilter.value === f.id;
    const row = document.createElement('div');
    row.className = 'folder-row' + (isActive ? ' active' : '');
    row.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span class="folder-name">${escHtml(f.name)}</span>
      <span class="folder-count">${count}</span>
      <div class="folder-actions">
        <button class="folder-act-btn" title="Export as zip" onclick="event.stopPropagation();exportFolder('${f.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="folder-act-btn" title="Rename" onclick="event.stopPropagation();renameFolder('${f.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="folder-act-btn danger" title="Delete folder" onclick="event.stopPropagation();deleteFolder('${f.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`;
    row.addEventListener('click', () => setFilter('folder', f.id));
    fl.appendChild(row);
  });

  // Tags
  const tl = document.getElementById('tagList');
  tl.innerHTML = '';
  const allTags = getAllTags();
  if (allTags.length === 0) {
    tl.innerHTML = '<div style="padding:2px 10px 4px;font-size:12px;color:var(--text-muted);font-style:italic">No tags yet</div>';
  }
  allTags.forEach(tag => {
    const count = Object.values(notes).filter(n => !n.archived && (n.tags||[]).includes(tag)).length;
    const isActive = activeFilter.type === 'tag' && activeFilter.value === tag;
    const chip = document.createElement('button');
    chip.className = 'tag-nav-chip' + (isActive ? ' active' : '');
    chip.innerHTML = `${escHtml(tag)} <span class="tag-nav-count">${count}</span>`;
    chip.addEventListener('click', () => setFilter('tag', tag));
    tl.appendChild(chip);
  });
}

// ─── Drawer Filter ───────────────────────────────────────────────────────────
function setFilter(type, value) {
  activeFilter = { type, value };
  // Sync quick filter buttons
  document.querySelectorAll('.qfilter').forEach(b => {
    b.classList.toggle('active', b.dataset.f === type && !value);
  });
  renderDrawerNav();
  renderDrawerList();
}

// ─── Drawer Note List ────────────────────────────────────────────────────────
function renderDrawerList() {
  const list  = document.getElementById('drawerList');
  const query = (document.getElementById('drawerSearch')?.value || '').toLowerCase().trim();

  let pool = Object.values(notes);

  // Apply filter
  switch (activeFilter.type) {
    case 'pinned':   pool = pool.filter(n => n.pinned && !n.archived); break;
    case 'archived': pool = pool.filter(n => n.archived); break;
    case 'folder':   pool = pool.filter(n => n.folderId === activeFilter.value && !n.archived); break;
    case 'tag':      pool = pool.filter(n => !n.archived && (n.tags||[]).includes(activeFilter.value)); break;
    default:         pool = pool.filter(n => !n.archived); break;
  }

  // Search
  if (query) {
    pool = pool.filter(n =>
      n.name.toLowerCase().includes(query) ||
      stripHtml(n.content).toLowerCase().includes(query) ||
      (n.tags||[]).some(t => t.includes(query))
    );
  }

  // Sort: pinned first, then by updatedAt
  pool.sort((a,b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  list.innerHTML = '';
  if (pool.length === 0) {
    list.innerHTML = `<div class="drawer-empty">${
      query ? 'No notes match your search.' :
      activeFilter.type === 'archived' ? 'No archived notes.' :
      activeFilter.type === 'pinned'   ? 'No pinned notes.' :
      activeFilter.type === 'folder'   ? 'No notes in this folder. Click + to add one.' :
      activeFilter.type === 'tag'      ? `No notes tagged ${activeFilter.value}.` :
      'No notes yet.'
    }</div>`;
    return;
  }

  let lastPinned = null;
  pool.forEach(note => {
    // Section dividers in 'all' view
    if (activeFilter.type === 'all' && !query) {
      const isPinned = note.pinned;
      if (lastPinned === null && isPinned) {
        const lbl = document.createElement('div'); lbl.className = 'drawer-group-label'; lbl.textContent = 'Pinned';
        list.appendChild(lbl);
      }
      if (lastPinned === true && !isPinned) {
        const lbl = document.createElement('div'); lbl.className = 'drawer-group-label'; lbl.textContent = 'Notes';
        list.appendChild(lbl);
      }
      lastPinned = isPinned;
    }

    const color = COLORS[note.color ?? 0];
    const hasColor = color !== null;
    const isOpen = openTabs.includes(note.id);
    const folderName = note.folderId && folders[note.folderId] ? folders[note.folderId].name : null;
    const preview = stripHtml(note.content).slice(0, 55).replace(/\s+/g,' ').trim();

    const card = document.createElement('div');
    card.className = 'note-card' + (isOpen ? ' is-open' : '');

    card.innerHTML = `
      <div class="note-card-dot${hasColor?'':' nc'}" style="${hasColor?'background:'+color.value:''}"></div>
      <div class="note-card-body">
        <div class="note-card-name">
          ${escHtml(note.name)}
          ${note.pinned ? '<span>📌</span>' : ''}
        </div>
        <div class="note-card-meta">
          ${preview ? escHtml(preview) + (preview.length >= 55 ? '…' : '') : ''}
          ${folderName && activeFilter.type !== 'folder' ? '<br>📁 '+escHtml(folderName) : ''}
        </div>
        ${(note.tags||[]).length ? `<div class="note-card-tags">${(note.tags||[]).map(t=>`<span class="note-mini-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="note-card-meta" style="margin-top:3px">${formatDate(note.updatedAt)}</div>
      </div>
      <div class="note-card-actions">
        ${note.archived
          ? `<button class="card-act-btn" title="Unarchive" onclick="event.stopPropagation();unarchiveNote('${note.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg></button>`
          : `<button class="card-act-btn" title="${note.pinned?'Unpin':'Pin'}" onclick="event.stopPropagation();togglePin('${note.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></button>
             <button class="card-act-btn" title="Archive" onclick="event.stopPropagation();archiveNote('${note.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>`
        }
        <button class="card-act-btn danger" title="Delete" onclick="event.stopPropagation();confirmDelete('${note.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
      </div>`;

    card.addEventListener('click', () => {
      if (note.archived) unarchiveNote(note.id);
      else openNote(note.id);
      if (window.innerWidth < 700) toggleDrawer();
    });
    list.appendChild(card);
  });
}

function confirmDelete(id) {
  if (confirm(`Delete "${notes[id]?.name}"? This cannot be undone.`)) deleteNote(id);
}

// ─── Drawer toggle ───────────────────────────────────────────────────────────
function toggleDrawer() {
  const open = drawer.classList.toggle('open');
  drawerOverlay.classList.toggle('visible', open);
  if (open) { renderDrawerNav(); renderDrawerList(); }
}

function promptNewFolder() {
  const name = prompt('Folder name:');
  if (name?.trim()) createFolder(name.trim());
}

function promptNewFolderFromPicker() {
  closeAllPopups();
  const name = prompt('New folder name:');
  if (!name?.trim()) return;
  const f = createFolder(name.trim());
  setNoteFolder(ctxNoteId, f.id);
  renderDrawerNav();
}

// ─── Context menu ────────────────────────────────────────────────────────────
function buildCtxColors() {
  const row = document.getElementById('ctxColorRow');
  COLORS.forEach((c, i) => {
    const sw = document.createElement('button');
    sw.dataset.ci = i;
    if (!c) { sw.className = 'ctx-swatch ns'; sw.textContent = '∅'; sw.title = 'No color'; }
    else    { sw.className = 'ctx-swatch'; sw.style.background = c.value; sw.title = c.name; }
    sw.addEventListener('click', e => {
      e.stopPropagation();
      if (ctxNoteId) setNoteColor(ctxNoteId, i);
      refreshCtxSelection();
      closeAllPopups();
    });
    row.appendChild(sw);
  });
}

function refreshCtxSelection() {
  const ci = notes[ctxNoteId]?.color ?? 0;
  document.querySelectorAll('.ctx-swatch').forEach((sw, i) => sw.classList.toggle('selected', i === ci));
}

function showContextMenu(e, id) {
  e.preventDefault(); e.stopPropagation();
  ctxNoteId = id;
  const note = notes[id];
  document.getElementById('ctxPinLabel').textContent     = note?.pinned    ? 'Unpin Note'  : 'Pin Note';
  document.getElementById('ctxArchiveLabel').textContent = note?.archived   ? 'Unarchive'   : 'Archive';
  refreshCtxSelection();
  const x = Math.min(e.clientX, window.innerWidth - 215);
  const y = Math.min(e.clientY, window.innerHeight - 310);
  contextMenu.style.left = x+'px'; contextMenu.style.top = y+'px';
  contextMenu.classList.add('visible');
}

function ctxRename()    { closeAllPopups(); if (ctxNoteId) startRename(ctxNoteId); }
function ctxPin()       { if (ctxNoteId) togglePin(ctxNoteId); closeAllPopups(); }
function ctxDuplicate() { if (ctxNoteId) duplicateNote(ctxNoteId); closeAllPopups(); }
function ctxCloseTab()  { if (ctxNoteId) closeTab(ctxNoteId); closeAllPopups(); }
function ctxArchive() {
  if (!ctxNoteId) return;
  if (notes[ctxNoteId]?.archived) unarchiveNote(ctxNoteId);
  else archiveNote(ctxNoteId);
  closeAllPopups();
}
function ctxDelete() {
  if (!ctxNoteId) return;
  if (confirm(`Delete "${notes[ctxNoteId]?.name}"? Cannot be undone.`)) deleteNote(ctxNoteId);
  closeAllPopups();
}

// ── Tag editor popup ──────────────────────────────────────────────────────────
function ctxEditTags() {
  if (!ctxNoteId) return;
  // Position near context menu
  const cmRect = contextMenu.getBoundingClientRect();
  tagPopup.style.left = Math.min(cmRect.right + 6, window.innerWidth - 240) + 'px';
  tagPopup.style.top  = Math.min(cmRect.top, window.innerHeight - 220) + 'px';
  closeAllPopups();
  renderTagPopup();
  tagPopup.classList.add('visible');
  document.getElementById('tagInput').focus();
}

function renderTagPopup() {
  const note = notes[ctxNoteId]; if (!note) return;
  const noteTags = note.tags || [];
  const allTags  = getAllTags();

  // Chips: note's own tags (removable)
  const chipList = document.getElementById('tagChipList');
  chipList.innerHTML = noteTags.length === 0
    ? '<span style="font-size:12px;color:#6b6055;font-style:italic">No tags</span>'
    : noteTags.map(t => `
        <button class="tag-chip on" onclick="removeTag('${ctxNoteId}','${escHtml(t)}');renderTagPopup()">
          ${escHtml(t)} <span class="tag-chip-x">×</span>
        </button>`).join('');

  // Suggestions: existing tags not yet on this note
  const sugg = document.getElementById('tagSuggestions');
  const remaining = allTags.filter(t => !noteTags.includes(t));
  sugg.innerHTML = remaining.length === 0 ? ''
    : remaining.map(t => `<button class="tag-sugg" onclick="addTag('${ctxNoteId}','${escHtml(t)}');renderTagPopup()">${escHtml(t)}</button>`).join('');

  document.getElementById('tagInput').value = '';
}

function onTagInputKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); commitTagInput(); }
  if (e.key === 'Escape') tagPopup.classList.remove('visible');
}

function onTagInputChange() {
  const val = document.getElementById('tagInput').value.toLowerCase().trim();
  const sugg = document.getElementById('tagSuggestions');
  if (!val) { renderTagPopup(); return; }
  const allTags = getAllTags();
  const matches = allTags.filter(t => t.includes(val) && !(notes[ctxNoteId]?.tags||[]).includes(t));
  sugg.innerHTML = matches.map(t =>
    `<button class="tag-sugg" onclick="addTag('${ctxNoteId}','${escHtml(t)}');renderTagPopup()">${escHtml(t)}</button>`
  ).join('');
}

function commitTagInput() {
  const input = document.getElementById('tagInput');
  const val = input.value.trim();
  if (val && ctxNoteId) { addTag(ctxNoteId, val); renderTagPopup(); }
  input.value = '';
}

// ── Folder picker popup ───────────────────────────────────────────────────────
function ctxMoveToFolder() {
  if (!ctxNoteId) return;
  const cmRect = contextMenu.getBoundingClientRect();
  folderPopup.style.left = Math.min(cmRect.right + 6, window.innerWidth - 240) + 'px';
  folderPopup.style.top  = Math.min(cmRect.top, window.innerHeight - 250) + 'px';
  closeAllPopups();
  renderFolderPopup();
  folderPopup.classList.add('visible');
}

function renderFolderPopup() {
  const list = document.getElementById('folderPickList');
  const currentFolder = notes[ctxNoteId]?.folderId;
  const allFolders = Object.values(folders).sort((a,b) => a.name.localeCompare(b.name));

  list.innerHTML = `
    <button class="folder-pick-item${!currentFolder?' selected':''}" onclick="setNoteFolder('${ctxNoteId}',null);closeAllPopups();renderDrawerList()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
      No Folder
    </button>
    ${allFolders.map(f => `
      <button class="folder-pick-item${currentFolder===f.id?' selected':''}" onclick="setNoteFolder('${ctxNoteId}','${f.id}');closeAllPopups();renderDrawerList()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        ${escHtml(f.name)}
      </button>`).join('')}`;
}

// ─── Close all popups ────────────────────────────────────────────────────────
function closeAllPopups(e) {
  if (!e || !contextMenu.contains(e.target)) contextMenu.classList.remove('visible');
  if (!e || !tagPopup.contains(e.target))    tagPopup.classList.remove('visible');
  if (!e || !folderPopup.contains(e.target)) folderPopup.classList.remove('visible');
}

// ─── Editor input ────────────────────────────────────────────────────────────
function onEditorInput() {
  updateWordCount();
  setSaveStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrent(); saveState(); setSaveStatus('All changes saved');
  }, 600);
}

function saveCurrent() {
  if (notes[activeId]) { notes[activeId].content = editor.innerHTML; notes[activeId].updatedAt = Date.now(); }
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem(SK.notes,   JSON.stringify(notes));
  localStorage.setItem(SK.folders, JSON.stringify(folders));
  localStorage.setItem(SK.tabs,    JSON.stringify(openTabs));
  localStorage.setItem(SK.active,  activeId || '');
}

function loadState() {
  const saved = localStorage.getItem(SK.notes);
  if (saved) {
    try {
      notes    = JSON.parse(saved);
      folders  = JSON.parse(localStorage.getItem(SK.folders) || '{}');
      openTabs = JSON.parse(localStorage.getItem(SK.tabs)    || '[]').filter(id => notes[id]);
      activeId = localStorage.getItem(SK.active) || null;
      if (!notes[activeId]) activeId = null;
    } catch { notes = {}; folders = {}; openTabs = []; activeId = null; }
  } else {
    // Migrate from v4
    const v4 = localStorage.getItem('sp4_notes');
    if (v4) {
      try {
        notes    = JSON.parse(v4);
        openTabs = JSON.parse(localStorage.getItem('sp4_tabs') || '[]').filter(id => notes[id]);
        activeId = localStorage.getItem('sp4_active') || null;
        // Add missing fields
        Object.values(notes).forEach(n => {
          if (!n.tags)     n.tags = [];
          if (!n.folderId) n.folderId = null;
        });
      } catch {}
    }
  }

  // Ensure tags array exists on all notes
  Object.values(notes).forEach(n => { if (!n.tags) n.tags = []; if (n.folderId === undefined) n.folderId = null; });

  if (openTabs.length === 0) {
    const n = createNote(); openTabs.push(n.id); activeId = n.id;
  }
  if (!activeId || !notes[activeId]) activeId = openTabs[0];
}

// ─── Export / Import ─────────────────────────────────────────────────────────
function exportBackup() {
  saveCurrent();
  const data = { version:5, exportedAt: new Date().toISOString(), notes, folders };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `sticky-notes-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  setSaveStatus('Backup exported!');
}

function importBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.notes) throw new Error();
      const nc = Object.keys(data.notes).length;
      const fc = Object.keys(data.folders||{}).length;
      if (!confirm(`Import ${nc} note${nc!==1?'s':''} and ${fc} folder${fc!==1?'s':''}? Existing notes are kept.`)) return;
      Object.entries(data.notes).forEach(([id, n]) => { if (!notes[id]) notes[id] = n; });
      Object.entries(data.folders||{}).forEach(([id, f]) => { if (!folders[id]) folders[id] = f; });
      saveState(); renderAll(); setSaveStatus(`Imported ${nc} notes!`);
    } catch { alert('Invalid backup file.'); }
  };
  reader.readAsText(file); event.target.value = '';
}

// ─── Save / Open file ────────────────────────────────────────────────────────
function saveFile() {
  saveCurrent();
  const blob = new Blob([editor.innerText], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = (notes[activeId]?.name||'note') + '.txt';
  a.click(); URL.revokeObjectURL(url); setSaveStatus('Downloaded');
}

function openFile() { document.getElementById('fileInput').click(); }

function handleFileOpen(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const raw = e.target.result;
    const content = file.name.endsWith('.html') ? raw
      : raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    saveCurrent();
    const n = createNote(file.name.replace(/\.[^.]+$/,''));
    n.content = content;
    openNote(n.id);
    editor.innerHTML = content; applyNoteColor(); updateWordCount();
    setSaveStatus('Opened: '+file.name);
    saveCurrent(); saveState(); renderDrawerList();
  };
  reader.readAsText(file); event.target.value = '';
}

// ─── Formatting ──────────────────────────────────────────────────────────────
function fmt(cmd) { editor.focus(); document.execCommand(cmd, false, null); }
function changeFontFamily(v) { editor.focus(); document.execCommand('fontName',false,v); }
function changeFontSize(v) {
  editor.focus();
  const sel = window.getSelection(); if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) { editor.style.fontSize = v; return; }
  const span = document.createElement('span'); span.style.fontSize = v;
  try { range.surroundContents(span); } catch {}
}
function undoAction() { editor.focus(); document.execCommand('undo'); }
function redoAction() { editor.focus(); document.execCommand('redo'); }

// ─── Word count ──────────────────────────────────────────────────────────────
function updateWordCount() {
  const text  = editor.innerText || '';
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  wordCountEl.textContent = `${words} word${words!==1?'s':''}`;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(SK.theme, next);
}
function loadTheme() {
  document.documentElement.setAttribute('data-theme', localStorage.getItem(SK.theme) || 'light');
}

// ─── Keyboard ────────────────────────────────────────────────────────────────
function handleKeyboard(e) {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key.toLowerCase()) {
      case 'b': e.preventDefault(); fmt('bold');         break;
      case 'i': e.preventDefault(); fmt('italic');       break;
      case 'u': e.preventDefault(); fmt('underline');    break;
      case 's': e.preventDefault(); saveFile();          break;
      case 't': e.preventDefault(); newNote();           break;
      case 'w': e.preventDefault(); closeTab(activeId); break;
      case 'f': e.preventDefault(); toggleDrawer();      break;
    }
    const n = parseInt(e.key);
    if (n >= 1 && n <= openTabs.length) { e.preventDefault(); switchTab(openTabs[n-1]); }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setSaveStatus(msg) { saveStatus.textContent = msg; }
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function stripHtml(h) { const d=document.createElement('div'); d.innerHTML=h; return d.innerText||''; }
function formatDate(ts) {
  if (!ts) return '';
  const d=new Date(ts), diff=Date.now()-d;
  if (diff<60000)    return 'just now';
  if (diff<3600000)  return Math.floor(diff/60000)+'m ago';
  if (diff<86400000) return Math.floor(diff/3600000)+'h ago';
  if (diff<604800000)return Math.floor(diff/86400000)+'d ago';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
