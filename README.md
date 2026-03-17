# ✦ Sticky Notepad

A clean, ad-free sticky notepad with colored tabs — runs entirely in your browser.  
No server. No ads. No accounts. Just write.

---

## Features

- 🎨 **Colored sticky note tabs** — 8 pastel colors per note
- 📑 **Multiple tabs** — open as many notes as you want
- 🖱️ **Right-click tab** → Rename / Copy Note / Delete
- 🖱️ **Double-click tab name** to rename inline
- 🎨 **Click the color dot** on a tab to repick its color
- 📝 Rich text editing (bold, italic, underline, strikethrough)
- 🔤 Font family & size controls
- 📋 Bullet & numbered lists, text alignment
- ↩️ Undo / Redo
- 🌙 Dark / Light theme toggle
- 💾 Auto-saves everything to your browser
- 📥 Save active note as `.txt`
- 📂 Open `.txt` / `.md` / `.html` files as new tabs
- 📊 Live word & character count
- ⬆️ Migrates your notes from v1 automatically

---

## Getting Started (VS Code + Live Server)

1. Download all files into a folder called `notepad`
2. Open VS Code → **File → Open Folder** → select `notepad`
3. Install the **Live Server** extension (search in Extensions panel)
4. Right-click `index.html` → **Open with Live Server**
5. App opens at `http://127.0.0.1:5500`

---

## Deploy to GitHub Pages (Free)

1. Create a GitHub account at [github.com](https://github.com)
2. Click **+** → **New repository** → name it `notepad` → Public → Create
3. Upload all 3 files (`index.html`, `style.css`, `script.js`)
4. Go to **Settings → Pages → Deploy from main branch** → Save
5. Live in ~1 min at `https://YOUR_USERNAME.github.io/notepad`

---

## Keyboard Shortcuts

| Shortcut       | Action              |
|----------------|---------------------|
| `Ctrl+T`       | New tab             |
| `Ctrl+W`       | Close current tab   |
| `Ctrl+1` – `8` | Switch to tab 1-8   |
| `Ctrl+B`       | Bold                |
| `Ctrl+I`       | Italic              |
| `Ctrl+U`       | Underline           |
| `Ctrl+S`       | Save as .txt        |
| `Ctrl+Z`       | Undo                |
| `Ctrl+Y`       | Redo                |

---

## File Structure

```
notepad/
├── index.html   ← App structure & layout
├── style.css    ← Sticky note colors & themes
├── script.js    ← Tabs, colors, all functionality
└── README.md    ← This file
```
