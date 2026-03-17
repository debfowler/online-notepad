// ─── Sticky Notepad v4 ───────────────────────────────────────────────────────
// Architecture: notes = permanent library, openTabs = currently visible notes

// ─── Palette (index 0 = no color) ────────────────────────────────────────────
const COLORS = [
  null,
  { name: 'Yellow',   value: '#fde68a', deep: '#d97706' },
  { name: 'Green',    value: '#bbf7d0', deep: '#16a34a' },
  { name: 'Pink',     value: '#fbcfe8', deep: '#db2777' },
  { name: 'Purple',   value: '#ddd6fe', deep: '#7c3aed' },
  { name: 'Blue',     value: '#bae6fd', deep: '#0284c7' },
  { name: 'Peach',    value: '#fed7aa', deep: '#ea580c' },
  { name: 'Mint',     value: '#a7f3d0', deep: '#059669' },
  { name: 'Lavender', value: '#e9d5ff', deep: '#9333ea' },
];

// ─── Storage keys ────────────────────────────────────────────────────────────
const SK_NOTES  = 'sp4_notes';
const SK_TABS   = 'sp4_tabs';
const SK_ACTIVE = 'sp4_active';
const SK_THEME  = 'notepad_theme';

// ─── State ───────────────────────────────────────────────────────────────────
let notes        = {};   // { [id]: { id, name, color, content, pinned, archived, createdAt, updatedAt } }
let openTabs     = [];   // [id, ...]  — IDs of notes currently open as tabs
let activeId     = null; // string — ID of the active note
let ctxNoteId    = null; // ID being acted on by context menu
let drawerFilter = 'all';
let saveTimer    = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const editor      = document.getElementById('editor');
const tabsEl      = document.getElementById('tabs');
const saveStatus  = document.getElementById('saveStatus');
const wordCountEl = document.getElementById('wordCount');
const contextMenu = document.getElementById('contextMenu');
const editorWrap  = document.getElementById('editorWrap');
const page        = document.getElementById('page');
const drawer      = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');

// ─── Init ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  loadTheme();
  buildCtxColors();
  renderTabs();
  applyActive();

  editor.addEventListener('input', onEditorInput);
  document.addEventListener('click', closeAllPopups);
  // Prevent browser context menu everywhere
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('.tab, .tab-bar')) e.preventDefault();
});
  document.addEventListener('keydown', handleKeyboard);
});

// ─── Note CRUD ──────────────────────────────────────────────────────────────
function createNote(name) {
  const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  const note = {
    id,
    name:      name || ('Note ' + (Object.keys(notes).length + 1)),
    color:     0,
    content:   '',
    pinned:    false,
    archived:  false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes[id] = note;
  return note;
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

function newNote(name) {
  const n = createNote(name);
  openNote(n.id);
  editor.focus();
  renderDrawer();
}

function closeTab(id) {
  // Close tab but keep note in library
  saveCurrent();
  const idx = openTabs.indexOf(id);
  if (idx === -1) return;
  openTabs.splice(idx, 1);

  if (openTabs.length === 0) {
    // No tabs left — create a fresh note
    const n = createNote();
    openTabs.push(n.id);
    activeId = n.id;
  } else {
    activeId = openTabs[Math.min(idx, openTabs.length - 1)];
  }
  saveState();
  renderTabs();
  applyActive();
}

function archiveNote(id) {
  if (!notes[id]) return;
  notes[id].archived = true;
  notes[id].pinned   = false;
  // Remove from open tabs if present
  const idx = openTabs.indexOf(id);
  if (idx !== -1) {
    openTabs.splice(idx, 1);
    if (openTabs.length === 0) {
      const n = createNote();
      openTabs.push(n.id);
      activeId = n.id;
    } else {
      activeId = openTabs[Math.min(idx, openTabs.length - 1)];
    }
  }
  saveState();
  renderTabs();
  applyActive();
  renderDrawer();
}

function unarchiveNote(id) {
  if (!notes[id]) return;
  notes[id].archived = false;
  saveState();
  openNote(id);
  renderDrawer();
}

function deleteNote(id) {
  delete notes[id];
  const idx = openTabs.indexOf(id);
  if (idx !== -1) openTabs.splice(idx, 1);
  if (openTabs.length === 0) {
    const n = createNote();
    openTabs.push(n.id);
    activeId = n.id;
  } else if (!openTabs.includes(activeId)) {
    activeId = openTabs[Math.max(0, idx - 1)];
  }
  saveState();
  renderTabs();
  applyActive();
  renderDrawer();
}

function duplicateNote(id) {
  const orig = notes[id];
  if (!orig) return;
  saveCurrent();
  const n = createNote(orig.name + ' (copy)');
  n.color   = orig.color;
  n.content = orig.content;
  openNote(n.id);
  renderDrawer();
}

function togglePin(id) {
  if (!notes[id]) return;
  notes[id].pinned = !notes[id].pinned;
  saveState();
  renderTabs();
  renderDrawer();
}

function setNoteColor(id, colorIndex) {
  if (!notes[id]) return;
  notes[id].color = colorIndex;
  notes[id].updatedAt = Date.now();
  saveState();
  renderTabs();
  if (id === activeId) applyNoteColor();
  renderDrawer();
}

// ─── Tab Rendering ───────────────────────────────────────────────────────────
function renderTabs() {
  tabsEl.innerHTML = '';

  // Pinned tabs first, then rest in open order
  const sorted = [...openTabs].sort((a, b) => {
    const pa = notes[a]?.pinned ? 0 : 1;
    const pb = notes[b]?.pinned ? 0 : 1;
    return pa - pb;
  });

  sorted.forEach(id => {
    const note = notes[id];
    if (!note) return;

    const color    = COLORS[note.color ?? 0];
    const hasColor = color !== null;
    const isActive = id === activeId;

    const el = document.createElement('div');
    el.className = `tab${isActive ? ' active ' + (hasColor ? 'has-color' : 'no-color') : ''}`;
    el.dataset.id = id;
    el.title = note.name;

    const dotClass = hasColor ? 'tab-dot' : 'tab-dot no-color-dot';
    const dotStyle = hasColor ? `background:${color.value}` : '';

    el.innerHTML = `
      ${note.pinned ? '<span class="tab-pin">📌</span>' : ''}
      <div class="${dotClass}" style="${dotStyle}" data-action="noop"></div>
      <span class="tab-name">${escHtml(note.name)}</span>
      <span class="tab-menu" data-action="menu" title="Note options (or right-click)">⋯</span>
      <span class="tab-close" data-action="close" title="Close tab (note stays in library)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </span>`;

    el.addEventListener('click',       (e) => onTabClick(e, id));
    el.addEventListener('dblclick',    ()  => startRename(id));
    el.addEventListener('contextmenu', (e) => showContextMenu(e, id));
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
  saveCurrent();
  activeId = id;
  saveState();
  renderTabs();
  applyActive();
}

function applyActive() {
  const note = notes[activeId];
  if (!note) return;
  editor.innerHTML = note.content || '';
  applyNoteColor();
  updateWordCount();
}

function applyNoteColor() {
  const note     = notes[activeId];
  const color    = COLORS[note?.color ?? 0];
  const hasColor = color !== null;

  document.documentElement.style.setProperty('--note-color',      hasColor ? color.value : 'transparent');
  document.documentElement.style.setProperty('--note-color-deep', hasColor ? color.deep  : '#c17f3a');

  editorWrap.classList.toggle('has-color', hasColor);
  editorWrap.classList.toggle('no-color',  !hasColor);
  page.classList.toggle('has-color', hasColor);
  page.classList.toggle('no-color',  !hasColor);
}

// ─── Rename ──────────────────────────────────────────────────────────────────
function startRename(id) {
  const tabEl  = tabsEl.querySelector(`[data-id="${id}"]`);
  const nameEl = tabEl?.querySelector('.tab-name');
  if (!nameEl) return;

  const input = document.createElement('input');
  input.className = 'tab-name-input';
  input.value = notes[id]?.name || '';
  nameEl.replaceWith(input);
  input.focus(); input.select();

  const finish = () => {
    const val = input.value.trim() || 'Untitled';
    if (notes[id]) { notes[id].name = val; notes[id].updatedAt = Date.now(); }
    saveState();
    renderTabs();
    renderDrawer();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter')  input.blur();
    if (ev.key === 'Escape') { input.value = notes[id]?.name || ''; input.blur(); }
    ev.stopPropagation();
  });
}

// ─── Context Menu ────────────────────────────────────────────────────────────
function buildCtxColors() {
  const row = document.getElementById('ctxColorRow');
  row.innerHTML = '';
  COLORS.forEach((c, i) => {
    const sw = document.createElement('button');
    sw.dataset.ci = i;
    if (c === null) {
      sw.className = 'ctx-swatch none-swatch';
      sw.textContent = '∅';
      sw.title = 'No color';
    } else {
      sw.className = 'ctx-swatch';
      sw.style.background = c.value;
      sw.title = c.name;
    }
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctxNoteId) setNoteColor(ctxNoteId, i);
      updateCtxSwatchSelection();
      closeAllPopups();
    });
    row.appendChild(sw);
  });
}

function updateCtxSwatchSelection() {
  const ci = notes[ctxNoteId]?.color ?? 0;
  document.querySelectorAll('.ctx-swatch').forEach((sw, i) => {
    sw.classList.toggle('selected', i === ci);
  });
}

function showContextMenu(e, id) {
  e.preventDefault();     // ← THE FIX: stops browser context menu
  e.stopPropagation();
  ctxNoteId = id;

  // Update pin label
  const note = notes[id];
  document.getElementById('ctxPinLabel').textContent    = note?.pinned   ? 'Unpin Note' : 'Pin Note';
  document.getElementById('ctxArchiveLabel').textContent = note?.archived ? 'Unarchive'  : 'Archive';

  updateCtxSwatchSelection();

  const x = Math.min(e.clientX, window.innerWidth  - 210);
  const y = Math.min(e.clientY, window.innerHeight - 280);
  contextMenu.style.left = x + 'px';
  contextMenu.style.top  = y + 'px';
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
  const name = notes[ctxNoteId]?.name || 'this note';
  if (confirm(`Permanently delete "${name}"? This cannot be undone.`)) {
    deleteNote(ctxNoteId);
  }
  closeAllPopups();
}

function closeAllPopups(e) {
  if (!e || !contextMenu.contains(e.target)) contextMenu.classList.remove('visible');
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
function toggleDrawer() {
  const isOpen = drawer.classList.contains('open');
  drawer.classList.toggle('open', !isOpen);
  drawerOverlay.classList.toggle('visible', !isOpen);
  if (!isOpen) renderDrawer();
}

function setFilter(f) {
  drawerFilter = f;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  renderDrawer();
}

function renderDrawer() {
  const list    = document.getElementById('drawerList');
  const query   = (document.getElementById('drawerSearch')?.value || '').toLowerCase().trim();

  let allNotes = Object.values(notes);

  // Filter
  if (drawerFilter === 'pinned')   allNotes = allNotes.filter(n => n.pinned && !n.archived);
  else if (drawerFilter === 'archived') allNotes = allNotes.filter(n => n.archived);
  else                              allNotes = allNotes.filter(n => !n.archived);

  // Search
  if (query) {
    allNotes = allNotes.filter(n =>
      n.name.toLowerCase().includes(query) ||
      stripHtml(n.content).toLowerCase().includes(query)
    );
  }

  // Sort: pinned first, then by updatedAt desc
  allNotes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  list.innerHTML = '';

  if (allNotes.length === 0) {
    list.innerHTML = `<div class="drawer-empty">${
      query ? 'No notes match your search.' :
      drawerFilter === 'archived' ? 'No archived notes.' :
      drawerFilter === 'pinned'   ? 'No pinned notes.' :
      'No notes yet.'
    }</div>`;
    return;
  }

  // Section labels when not searching
  let hasPinnedLabel = false;
  let hasRestLabel   = false;

  allNotes.forEach(note => {
    if (!query && drawerFilter === 'all') {
      if (note.pinned && !hasPinnedLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'drawer-section-label';
        lbl.textContent = 'Pinned';
        list.appendChild(lbl);
        hasPinnedLabel = true;
      }
      if (!note.pinned && hasPinnedLabel && !hasRestLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'drawer-section-label';
        lbl.textContent = 'Notes';
        list.appendChild(lbl);
        hasRestLabel = true;
      }
    }

    const color    = COLORS[note.color ?? 0];
    const hasColor = color !== null;
    const isOpen   = openTabs.includes(note.id);

    const card = document.createElement('div');
    card.className = 'note-card' + (isOpen ? ' is-open' : '');
    card.title = isOpen ? 'Currently open — click to switch' : 'Click to open';

    const dotClass = hasColor ? 'note-card-dot' : 'note-card-dot no-color-dot';
    const dotStyle = hasColor ? `background:${color.value}` : '';

    const preview = stripHtml(note.content).slice(0, 60).replace(/\s+/g, ' ').trim();
    const dateStr = formatDate(note.updatedAt);

    card.innerHTML = `
      <div class="${dotClass}" style="${dotStyle}"></div>
      <div class="note-card-body">
        <div class="note-card-name">
          ${escHtml(note.name)}
          ${note.pinned ? '<span class="pin-badge">📌</span>' : ''}
        </div>
        ${preview ? `<div class="note-card-preview">${escHtml(preview)}…</div>` : ''}
        <div class="note-card-date">${dateStr}</div>
      </div>
      <div class="note-card-actions">
        ${note.archived
          ? `<button class="card-action-btn" title="Unarchive" onclick="event.stopPropagation();unarchiveNote('${note.id}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
             </button>`
          : `<button class="card-action-btn" title="${note.pinned ? 'Unpin' : 'Pin'}" onclick="event.stopPropagation();togglePin('${note.id}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
             </button>
             <button class="card-action-btn" title="Archive" onclick="event.stopPropagation();archiveNote('${note.id}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
             </button>`
        }
        <button class="card-action-btn danger" title="Delete forever" onclick="event.stopPropagation();confirmDeleteFromDrawer('${note.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`;

    card.addEventListener('click', () => {
      if (note.archived) unarchiveNote(note.id);
      else openNote(note.id);
      if (window.innerWidth < 700) toggleDrawer();
    });

    list.appendChild(card);
  });
}

function confirmDeleteFromDrawer(id) {
  const name = notes[id]?.name || 'this note';
  if (confirm(`Permanently delete "${name}"?`)) deleteNote(id);
}

// ─── Editor input & autosave ─────────────────────────────────────────────────
function onEditorInput() {
  updateWordCount();
  setSaveStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrent();
    saveState();
    setSaveStatus('All changes saved');
  }, 600);
}

function saveCurrent() {
  if (notes[activeId]) {
    notes[activeId].content   = editor.innerHTML;
    notes[activeId].updatedAt = Date.now();
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem(SK_NOTES,  JSON.stringify(notes));
  localStorage.setItem(SK_TABS,   JSON.stringify(openTabs));
  localStorage.setItem(SK_ACTIVE, activeId || '');
}

function loadState() {
  const savedNotes = localStorage.getItem(SK_NOTES);

  if (savedNotes) {
    // v4 format
    try {
      notes    = JSON.parse(savedNotes);
      openTabs = JSON.parse(localStorage.getItem(SK_TABS) || '[]');
      activeId = localStorage.getItem(SK_ACTIVE) || null;

      // Clean up: remove open tab IDs that no longer exist
      openTabs = openTabs.filter(id => notes[id]);
      if (!notes[activeId]) activeId = null;
    } catch { notes = {}; openTabs = []; activeId = null; }
  } else {
    // Migrate from v3 format
    const v3Tabs = localStorage.getItem('stickypad_tabs');
    const v3Old  = localStorage.getItem('notepad_content');

    if (v3Tabs) {
      try {
        const old = JSON.parse(v3Tabs);
        old.forEach(t => {
          const id = String(t.id);
          notes[id] = {
            id, name: t.name, color: t.color ?? 0,
            content: t.content || '', pinned: false, archived: false,
            createdAt: parseInt(id) || Date.now(),
            updatedAt: parseInt(id) || Date.now(),
          };
          openTabs.push(id);
        });
        const v3Active = parseInt(localStorage.getItem('stickypad_active') || '0');
        activeId = openTabs[Math.min(v3Active, openTabs.length - 1)] || null;
      } catch {}
    } else if (v3Old) {
      const n = createNote('Note 1');
      n.content = v3Old;
      openTabs.push(n.id);
      activeId = n.id;
    }
  }

  // Ensure there's always at least one open tab
  if (openTabs.length === 0) {
    const n = createNote();
    openTabs.push(n.id);
    activeId = n.id;
  }
  if (!activeId || !notes[activeId]) activeId = openTabs[0];
}

// ─── Export / Import ─────────────────────────────────────────────────────────
function exportBackup() {
  saveCurrent();
  const data = {
    version:   4,
    exportedAt: new Date().toISOString(),
    notes:     notes,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `sticky-notes-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setSaveStatus('Backup exported!');
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.notes || typeof data.notes !== 'object') throw new Error('Invalid format');

      const count = Object.keys(data.notes).length;
      if (!confirm(`Import ${count} note${count !== 1 ? 's' : ''} from backup? Existing notes will be kept.`)) return;

      // Merge — imported notes don't overwrite existing ones with the same ID
      Object.entries(data.notes).forEach(([id, note]) => {
        if (!notes[id]) notes[id] = note;
      });

      saveState();
      renderDrawer();
      setSaveStatus(`Imported ${count} note${count !== 1 ? 's' : ''}!`);
    } catch {
      alert('Could not read backup file. Make sure it\'s a valid Sticky Notes backup (.json).');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Save as .txt ────────────────────────────────────────────────────────────
function saveFile() {
  saveCurrent();
  const blob = new Blob([editor.innerText], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = (notes[activeId]?.name || 'note') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  setSaveStatus('Downloaded as .txt');
}

// ─── Open file ───────────────────────────────────────────────────────────────
function openFile() { document.getElementById('fileInput').click(); }

function handleFileOpen(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const raw = e.target.result;
    const content = file.name.endsWith('.html')
      ? raw
      : raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');

    saveCurrent();
    const n = createNote(file.name.replace(/\.[^.]+$/, ''));
    n.content = content;
    openNote(n.id);
    editor.innerHTML = content;
    applyNoteColor();
    updateWordCount();
    setSaveStatus('Opened: ' + file.name);
    saveCurrent();
    saveState();
    renderDrawer();
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Formatting ──────────────────────────────────────────────────────────────
function fmt(cmd) { editor.focus(); document.execCommand(cmd, false, null); }
function changeFontFamily(v) { editor.focus(); document.execCommand('fontName', false, v); }
function changeFontSize(v) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) { editor.style.fontSize = v; return; }
  const span = document.createElement('span');
  span.style.fontSize = v;
  try { range.surroundContents(span); } catch {}
}
function undoAction() { editor.focus(); document.execCommand('undo'); }
function redoAction() { editor.focus(); document.execCommand('redo'); }

// ─── Word count ──────────────────────────────────────────────────────────────
function updateWordCount() {
  const text  = editor.innerText || '';
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const chars = text.replace(/\n/g,'').length;
  wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''} · ${chars} char${chars !== 1 ? 's' : ''}`;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(SK_THEME, next);
}
function loadTheme() {
  const saved = localStorage.getItem(SK_THEME) || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
function handleKeyboard(e) {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'b': e.preventDefault(); fmt('bold');      break;
      case 'i': e.preventDefault(); fmt('italic');    break;
      case 'u': e.preventDefault(); fmt('underline'); break;
      case 's': e.preventDefault(); saveFile();       break;
      case 't': e.preventDefault(); newNote();        break;
      case 'w': e.preventDefault(); closeTab(activeId); break;
      case 'f': e.preventDefault(); toggleDrawer();   break;
    }
    const n = parseInt(e.key);
    if (n >= 1 && n <= openTabs.length) {
      e.preventDefault();
      switchTab(openTabs[n - 1]);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setSaveStatus(msg) { saveStatus.textContent = msg; }
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html; return d.innerText || ''; }
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)     return 'just now';
  if (diff < 3600000)   return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000)  return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}
