// ─── STATE ───
let state = {
  docTitle: 'Document1',
  modified: false,
  trackChanges: false,
  comments: [],
  zoom: 100,
  currentFont: 'Calibri',
  currentSize: '11',
  currentTextColor: '#000000',
  currentBgColor: '#ffff00',
  findMatches: [],
  findIndex: 0,
  footnoteCount: 0,
  commentCount: 0,
  undoStack: [],
  redoStack: [],
  savedContent: '',
  view: 'print',
  language: 'fr',
  pageSetup: { mt: 96, mb: 96, ml: 96, mr: 96 },
};
let currentFilePath = null;
let exportPickerRequestId = null;
let exportMode = 'export';

const doc = () => document.getElementById('doc');
const $ = id => document.getElementById(id);

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  initColorGrids();
  initTablePicker();
  initSpecialChars();
  initRuler();
  updateStatusBar();
  updateOutline();
  state.savedContent = doc().innerHTML;
  updateFormatState();
  
  // Close dropdowns on outside click - FIXED VERSION
  document.addEventListener('click', (e) => {
    // Only handle clicks that are actually on the page, not on interactive elements
    if (e.target.tagName === 'BODY' || e.target.tagName === 'HTML') {
      if (!e.target.closest('.dropdown')) closeAllDropdowns();
      if (!e.target.closest('#ctx-menu') && !e.target.closest('#doc')) closeCtxMenu();
      if (!e.target.closest('#mini-toolbar') && !e.target.closest('#doc')) closeMiniToolbar();
    }
  });

  // Auto-save every 60s
  setInterval(autoSave, 60000);
  
  // Update status bar periodically
  setInterval(updateStatusBar, 2000);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', globalShortcuts);
});

// ─── TABS ───
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    $('panel-' + this.dataset.tab).classList.add('active');
  });
});

// ─── FORMATTING ───
function fmt(cmd, val) {
  doc().focus();
  document.execCommand(cmd, false, val || null);
  updateFormatState();
  markModified();
}

function applyFont() {
  const f = $('fontFamily').value;
  state.currentFont = f;
  fmt('fontName', f);
}

function applyFontSize() {
  const sz = $('fontSize').value;
  state.currentSize = sz;
  // Use fontSize command with size 1-7 mapped
  const el = doc();
  el.focus();
  document.execCommand('fontSize', false, '7');
  const spans = el.querySelectorAll('font[size="7"]');
  spans.forEach(s => {
    s.removeAttribute('size');
    s.style.fontSize = sz + 'pt';
  });
  markModified();
}

function applyStyle(tag) {
  doc().focus();
  document.execCommand('formatBlock', false, '<' + tag + '>');
  markModified();
  updateOutline();
}

function applyBlockquote() {
  doc().focus();
  document.execCommand('formatBlock', false, '<blockquote>');
  markModified();
}

function applyCodeBlock() {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const code = document.createElement('pre');
    code.innerHTML = '<code>' + (range.toString() || 'code ici') + '</code>';
    range.deleteContents();
    range.insertNode(code);
  }
  markModified();
}

function setLineHeight(val) {
  doc().focus();
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (node) node.style.lineHeight = val;
  }
  markModified();
  closeAllDropdowns();
}

function indentText(dir) {
  doc().focus();
  document.execCommand(dir, false, null);
  markModified();
}

function execUndo() {
  doc().focus();
  document.execCommand('undo');
  updateFormatState();
  updateOutline();
  updateStatusBar();
}

function execRedo() {
  doc().focus();
  document.execCommand('redo');
  updateFormatState();
  updateOutline();
  updateStatusBar();
}

// ─── FORMAT STATE (for ribbon button states) ───
function updateFormatState() {
  const cmds = ['bold','italic','underline','strikeThrough'];
  const ids = ['rb-bold','rb-italic','rb-underline','rb-strike'];
  cmds.forEach((c, i) => {
    const el = $(ids[i]);
    if (el) el.classList.toggle('pressed', document.queryCommandState(c));
  });

  // Alignment
  ['Left','Center','Right','Full'].forEach(a => {
    const el = $('rb-align' + a);
    if (el) el.classList.toggle('pressed', document.queryCommandState('justify' + a));
  });
  $('rb-ul') && $('rb-ul').classList.toggle('pressed', document.queryCommandState('insertUnorderedList'));
  $('rb-ol') && $('rb-ol').classList.toggle('pressed', document.queryCommandState('insertOrderedList'));

  // Font & size from selection
  try {
    const ff = document.queryCommandValue('fontName');
    if (ff && $('fontFamily')) {
      const opts = $('fontFamily').options;
      for (let o of opts) if (o.value.toLowerCase().includes(ff.toLowerCase())) {
        $('fontFamily').value = o.value;
        break;
      }
    }
    const fs = document.queryCommandValue('fontSize');
    // show computed font size
  } catch(e) {}

  // Table contextual tab
  const inTable = !!getActiveTable();
  $('table-tab-btn').style.display = inTable ? '' : 'none';
}

// ─── COLOR GRIDS ───
const COLORS = [
  '#000000','#434343','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#efefef','#f3f3f3','#ffffff',
  '#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff','#e06666',
  '#f6b26b','#ffd966','#93c47d','#76a5af','#6fa8dc','#6c5ce7','#c27ba0','#cc4125','#e69138','#f1c232',
  '#6aa84f','#45818e','#3d85c6','#674ea7','#a64d79','#85200c','#b45f06','#7f6000','#274e13','#0c343d',
  '#1c4587','#20124d','#4c1130','#1a1a1a','#0d0d0d','#2b579a','#1e8449','#d32f2f','#7b1fa2','#1565c0',
];

function initColorGrids() {
  ['text-color-grid', 'bg-color-grid'].forEach((gid, isHighlight) => {
    const grid = $(gid);
    COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch';
      sw.style.background = c;
      sw.title = c;
      sw.onclick = () => {
        if (!isHighlight) {
          state.currentTextColor = c;
          $('txt-color-bar').style.background = c;
          fmt('foreColor', c);
        } else {
          state.currentBgColor = c;
          $('bg-color-bar').style.background = c;
          fmt('backColor', c);
        }
        closeAllDropdowns();
      };
      grid.appendChild(sw);
    });
  });
}

// ─── TABLE PICKER ───
function initTablePicker() {
  const grid = $('table-grid');
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'table-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.onmouseover = () => highlightTablePicker(r, c);
      cell.onclick = () => { doInsertTableDirect(r, c); closeAllDropdowns(); };
      grid.appendChild(cell);
    }
  }
}

function highlightTablePicker(rows, cols) {
  document.querySelectorAll('.table-cell').forEach(c => {
    c.classList.toggle('hover', +c.dataset.r <= rows && +c.dataset.c <= cols);
  });
  $('table-label').textContent = rows + '×' + cols;
}

// ─── SPECIAL CHARS ───
const SPECIALS = [
  '©','®','™','§','¶','†','‡','•','·','…','–','—','«','»','‹','›',
  '°','±','×','÷','≈','≠','≤','≥','∞','∑','∏','√','∂','∫','∀','∃',
  'α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','π','ρ',
  'σ','τ','υ','φ','χ','ψ','ω','Ω','Δ','Λ','Π','Σ','Φ','Ψ','ℝ','ℕ',
  '←','→','↑','↓','↔','⇒','⇔','⟨','⟩','⌊','⌋','⌈','⌉','∈','∉','⊂',
  '½','⅓','¼','¾','⅔','⅛','⅜','⅝','⅞','¹','²','³','ⁿ','ₐ','ᵢ','ₒ',
  '€','£','¥','¢','¤','₹','₿','₸','₽','₩','₦','₴','₫','₡','₪','฿',
  '★','☆','♠','♣','♥','♦','♩','♪','♫','♬','☀','☁','☂','☃','☎','✉',
];
function initSpecialChars() {
  const grid = $('special-chars-grid');
  SPECIALS.forEach(ch => {
    const btn = document.createElement('button');
    btn.textContent = ch;
    btn.style.cssText = 'width:36px;height:36px;border:1px solid var(--border);border-radius:4px;background:var(--surface);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;';
    btn.onclick = () => { fmt('insertText', ch); };
    btn.onmouseenter = () => btn.style.background = 'var(--blue-light)';
    btn.onmouseleave = () => btn.style.background = 'var(--surface)';
    grid.appendChild(btn);
  });
}

// ─── RULER ───
function initRuler() {
  const ruler = $('ruler-inner');
  const pageW = 816;
  const scrollOff = 220; // sidebar width approx
  ruler.innerHTML = '';
  for (let cm = 0; cm <= 21; cm++) {
    const px = (cm / 21) * pageW + scrollOff;
    const mark = document.createElement('div');
    mark.className = 'ruler-mark';
    mark.style.left = px + 'px';
    const line = document.createElement('div');
    line.className = 'line';
    line.style.height = cm % 5 === 0 ? '12px' : '6px';
    const label = document.createElement('div');
    label.className = 'label';
    if (cm % 5 === 0) label.textContent = cm;
    mark.appendChild(line);
    mark.appendChild(label);
    ruler.appendChild(mark);
  }
}

// ─── DOCUMENT OPERATIONS ───
function newDocument() {
  if (state.modified && !confirm('Les modifications non enregistrées seront perdues. Continuer ?')) return;
  doc().innerHTML = '<h1>Document sans titre</h1><p>Commencez à taper votre document ici.</p>';
  currentFilePath = null;
  state.docTitle = 'Document1';
  state.modified = false;
  state.comments = [];
  state.footnoteCount = 0;
  updateTitle();
  updateStatusBar();
  updateOutline();
  $('header-content').textContent = '';
  $('footer-content').textContent = '';
}

function openDocument() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.fdoc,.html,.htm,.txt,.rtf,.md';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      const content = ev.target.result;
      if (file.name.endsWith('.txt')) {
        doc().innerHTML = '<p>' + content.split('\n').join('</p><p>') + '</p>';
      } else if (file.name.endsWith('.md')) {
        doc().innerHTML = markdownToHTML(content);
      } else {
        const parser = new DOMParser();
        const parsed = parser.parseFromString(content, 'text/html');
        doc().innerHTML = parsed.body.innerHTML;
      }
      state.docTitle = file.name.replace(/\.[^/.]+$/, '');
      state.modified = false;
      updateTitle();
      updateStatusBar();
      updateOutline();
    };
    reader.readAsText(file);
  };
  input.click();
}

function loadDocumentContent(content, fileName = 'Document1', path = null) {
  if (typeof content !== 'string') return;
  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.txt')) {
    doc().innerHTML = '<p>' + content.split('\n').join('</p><p>') + '</p>';
  } else if (lowerName.endsWith('.md')) {
    doc().innerHTML = markdownToHTML(content);
  } else if (lowerName.endsWith('.fdoc')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        doc().innerHTML = parsed.html || '<p><br></p>';
        $('header-content').innerHTML = parsed.headerHTML || '';
        $('footer-content').innerHTML = parsed.footerHTML || '';
        if (parsed.pageSetup && typeof parsed.pageSetup === 'object') {
          state.pageSetup = {
            mt: parsed.pageSetup.mt ?? state.pageSetup.mt,
            mb: parsed.pageSetup.mb ?? state.pageSetup.mb,
            ml: parsed.pageSetup.ml ?? state.pageSetup.ml,
            mr: parsed.pageSetup.mr ?? state.pageSetup.mr,
          };
          doc().style.padding = `${state.pageSetup.mt}px ${state.pageSetup.mr}px ${state.pageSetup.mb}px ${state.pageSetup.ml}px`;
        }
      } else {
        doc().innerHTML = '<p><br></p>';
      }
    } catch (err) {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(content, 'text/html');
      doc().innerHTML = parsed.body ? parsed.body.innerHTML : content;
    }
  } else {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(content, 'text/html');
    doc().innerHTML = parsed.body ? parsed.body.innerHTML : content;
  }
  currentFilePath = path;
  state.docTitle = fileName.replace(/\.[^/.]+$/, '');
  state.modified = false;
  state.savedContent = doc().innerHTML;
  updateTitle();
  updateStatusBar();
  updateOutline();
  updateFormatState();
}

function buildNativeDocumentData() {
  return JSON.stringify({
    version: 1,
    type: 'aetherword',
    title: state.docTitle,
    html: doc().innerHTML,
    headerHTML: $('header-content').innerHTML,
    footerHTML: $('footer-content').innerHTML,
    pageSetup: { ...state.pageSetup },
    savedAt: Date.now()
  });
}

function markdownToHTML(md) {
  return md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hHlp])(.+)$/gm, '<p>$1</p>');
}

async function saveDocument() {
  const data = buildNativeDocumentData();
  const blob = new Blob([data], { type: 'application/json' });
  const targetPath = currentFilePath || `/Documents/${state.docTitle}.fdoc`;
  const saved = await saveBlobToPath(blob, targetPath, state.docTitle + '.fdoc');
  if (!saved) return false;
  state.modified = false;
  state.savedContent = doc().innerHTML;
  updateTitle();
  showSaveIndicator();
  return true;
}

async function saveDocumentAs() {
  openExportModal('saveAs', 'fdoc');
  return true;
}

function buildFullHTML() {
  return `<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<meta name="aether-doc-type" content="word">\n<title>${state.docTitle}</title>\n<style>body{font-family:Calibri,sans-serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.6;}h1,h2,h3{color:#1a1a2e;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ddd;padding:8px;}th{background:#f5f5f5;}blockquote{border-left:3px solid #1a56db;padding:8px 16px;color:#666;font-style:italic;background:#f8f9fa;}pre{background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto;}</style>\n</head>\n<body data-aether-doc="word">\n${doc().innerHTML}\n</body>\n</html>`;
}

function downloadBlob(blob, name) {
  // S'assurer que le blob a bien du contenu
  if (!blob || blob.size === 0) {
    console.error('Blob is empty or invalid');
    return;
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = name; 
  
  // Ajouter au DOM pour garantir le clic
  document.body.appendChild(a);
  a.click();
  
  // Nettoyer
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

async function saveBlobWithPrompt(blob, name) {
  const wm = window.parent && window.parent.windowManager;
  const defaultPath = currentFilePath || `/Documents/${name}`;
  const rawPath = prompt('Chemin de sauvegarde :', defaultPath);
  const targetPath = wm && typeof wm.normalizeVfsPath === 'function'
    ? wm.normalizeVfsPath(rawPath)
    : rawPath;
  if (!targetPath) return false;

  if (wm && typeof wm.vfs_write === 'function') {
    try {
      const content = await blob.text();
      wm.vfs_write(targetPath, content, 'file');
      currentFilePath = targetPath;
      state.docTitle = targetPath.split('/').pop().replace(/\.[^/.]+$/, '');
      if (wm.notify) wm.notify('AetherWord', `Fichier enregistre dans ${targetPath}`);
      return true;
    } catch (err) {}
  }

  downloadBlob(blob, name);
  return true;
}

async function saveBlobToPath(blob, targetPath, fallbackName) {
  const wm = window.parent && window.parent.windowManager;
  const normalizedPath = wm && typeof wm.normalizeVfsPath === 'function'
    ? wm.normalizeVfsPath(targetPath)
    : targetPath;
  if (!normalizedPath) return false;

  if (wm && typeof wm.vfs_write === 'function') {
    try {
      const content = await blob.text();
      wm.vfs_write(normalizedPath, content, 'file');
      currentFilePath = normalizedPath;
      state.docTitle = normalizedPath.split('/').pop().replace(/\.[^/.]+$/, '');
      if (wm.notify) wm.notify('AetherWord', `Fichier enregistre dans ${normalizedPath}`);
      return true;
    } catch (err) {
      return false;
    }
  }

  downloadBlob(blob, fallbackName || normalizedPath.split('/').pop());
  return true;
}

function showSaveIndicator() {
  const si = $('save-indicator');
  si.textContent = '✓ Enregistré';
  si.style.opacity = '1';
  setTimeout(() => si.style.opacity = '0.4', 2000);
}

function autoSave() {
  if (state.modified) {
    localStorage.setItem('aetherword_autosave', doc().innerHTML);
    localStorage.setItem('aetherword_title', state.docTitle);
    const si = $('save-indicator');
    si.textContent = '↺ Sauvegardé auto';
    setTimeout(() => { si.textContent = ''; }, 1500);
  }
}

function printDocument() {
  const w = window.open('', '_blank');
  w.document.write(buildFullHTML());
  w.document.close();
  w.print();
}

function openExportModal(mode = 'export', forcedFormat = '') {
  exportMode = mode;
  $('exp-filename').value = state.docTitle;
  $('exp-directory').value = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) || '/Documents' : '/Documents';
  $('exp-format').value = forcedFormat || 'fdoc';
  $('exp-format').disabled = !!forcedFormat;
  $('export-modal-title').textContent = mode === 'saveAs' ? 'Enregistrer le document sous' : 'Exporter le document';
  $('export-modal-submit').textContent = mode === 'saveAs' ? 'Enregistrer' : 'Exporter';
  $('modal-export').classList.add('open');
}

async function doExport() {
  const format = $('exp-format').value;
  const name = $('exp-filename').value || state.docTitle;
  const directory = ($('exp-directory').value || '/Documents').trim() || '/Documents';
  let content, mime, ext;

  switch(format) {
    case 'fdoc':
      content = buildNativeDocumentData();
      mime = 'application/json'; ext = 'fdoc'; break;
    case 'html':
      content = buildFullHTML();
      mime = 'text/html'; ext = 'html'; break;
    case 'txt':
      content = doc().innerText;
      mime = 'text/plain'; ext = 'txt'; break;
    case 'rtf':
      content = htmlToRTF(doc().innerHTML);
      mime = 'application/rtf'; ext = 'rtf'; break;
    case 'markdown':
      content = htmlToMarkdown(doc().innerHTML);
      mime = 'text/markdown'; ext = 'md'; break;
  }

  const blob = new Blob([content], { type: mime });
  const targetPath = `${directory.replace(/\/+$/, '')}/${name}.${ext}`;
  const saved = await saveBlobToPath(blob, targetPath, `${name}.${ext}`);
  if (!saved) return;
  if (format === 'fdoc') {
    state.modified = false;
    state.savedContent = doc().innerHTML;
    state.docTitle = name;
    updateTitle();
    showSaveIndicator();
  }
  exportMode = 'export';
  $('exp-format').disabled = false;
  closeModal('modal-export');
}

function pickExportDirectory() {
  const wm = window.parent && window.parent.windowManager;
  if (!wm || typeof wm.openPathPicker !== 'function') return;
  exportPickerRequestId = wm.openPathPicker('word', {
    mode: 'folder',
    startPath: $('exp-directory').value || '/Documents'
  });
}

function htmlToRTF(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = tmp.innerText;
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Calibri;}}\\f0\\fs22 ${text.replace(/\n/g,'\\par ')}}`;
}

function htmlToMarkdown(html) {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
}

// ─── INSERT OPERATIONS ───
function insertLink() {
  const sel = window.getSelection();
  $('link-text').value = sel.toString() || '';
  $('link-url').value = 'https://';
  $('modal-link').classList.add('open');
}

function doInsertLink() {
  const text = $('link-text').value || $('link-url').value;
  const url = $('link-url').value;
  const target = $('link-target').value;
  if (url) {
    const html = `<a href="${url}" target="${target}">${text}</a>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
  closeModal('modal-link');
}

function insertImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      doc().focus();
      const html = `<img src="${ev.target.result}" style="max-width:100%;height:auto;display:block;margin:8pt 0;" alt="${file.name}">`;
      document.execCommand('insertHTML', false, html);
      markModified();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function insertHeader(lvl) {
  doc().focus();
  document.execCommand('formatBlock', false, '<h' + lvl + '>');
  markModified();
  updateOutline();
}

function insertPageBreak() {
  doc().focus();
  const html = '<div class="page-break">⸻ Saut de page ⸻</div><p><br></p>';
  document.execCommand('insertHTML', false, html);
  markModified();
}

function insertHR() {
  doc().focus();
  document.execCommand('insertHorizontalRule', false, null);
  markModified();
}

function insertSpecialChar() {
  $('modal-specials').classList.add('open');
}

function insertFootnote() {
  state.footnoteCount++;
  const n = state.footnoteCount;
  doc().focus();
  const html = `<sup class="footnote-ref" id="fn-ref-${n}" onclick="scrollToFootnote(${n})">[${n}]</sup>`;
  document.execCommand('insertHTML', false, html);
  // Add footnote at end
  const fnSection = doc().querySelector('#footnotes') || (() => {
    const d = document.createElement('div');
    d.id = 'footnotes';
    d.style.cssText = 'border-top:1px solid #ddd;margin-top:24pt;padding-top:8pt;font-size:9pt;';
    doc().appendChild(d);
    return d;
  })();
  const fn = document.createElement('p');
  fn.id = 'fn-' + n;
  fn.innerHTML = `<sup>${n}</sup> `;
  fn.contentEditable = true;
  fnSection.appendChild(fn);
  markModified();
}

function insertEndnote() {
  state.footnoteCount++;
  const n = state.footnoteCount;
  doc().focus();
  const html = `<sup class="footnote-ref">[Note ${n}]</sup>`;
  document.execCommand('insertHTML', false, html);
  markModified();
}

function insertTOC() {
  const headings = doc().querySelectorAll('h1,h2,h3');
  let tocHTML = '<div style="border:1px solid var(--border);padding:16pt 20pt;margin:12pt 0;background:#f8f9fa;"><h2 style="margin:0 0 10pt;font-size:14pt;">Table des matières</h2><ul style="list-style:none;padding:0;margin:0;">';
  headings.forEach((h, i) => {
    const level = +h.tagName[1];
    const id = 'heading-' + i;
    h.id = id;
    const indent = (level - 1) * 20;
    tocHTML += `<li style="padding:3pt 0 3pt ${indent}pt;"><a href="#${id}" style="color:var(--blue);text-decoration:none;">${h.textContent}</a></li>`;
  });
  tocHTML += '</ul></div>';
  doc().focus();
  // Insert at beginning
  const firstChild = doc().firstChild;
  const div = document.createElement('div');
  div.innerHTML = tocHTML;
  doc().insertBefore(div.firstChild, firstChild);
  markModified();
}

function updateTOC() {
  const toc = doc().querySelector('[id^="toc-"]') || doc().querySelector('div[style*="Table des matières"]');
  if (toc) {
    toc.remove();
  }
  insertTOC();
}

function insertTextBox() {
  const html = `<div contenteditable="false" style="border:2px solid var(--border);padding:12pt;margin:10pt 0;background:#fafafa;border-radius:4px;position:relative;" class="text-box"><div contenteditable="true" style="outline:none;min-height:40px;" placeholder="Zone de texte">Texte ici</div></div>`;
  doc().focus();
  document.execCommand('insertHTML', false, html);
  markModified();
}

function insertEquation() {
  const eq = prompt('Entrez l\'équation (LaTeX ou texte):', 'E = mc²');
  if (eq) {
    const html = `<span style="font-family:'Times New Roman';font-style:italic;background:#f0f4ff;padding:2px 6px;border-radius:3px;font-size:12pt;">${eq}</span>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
}

function insertDate() {
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('fr-FR', opts);
  doc().focus();
  document.execCommand('insertText', false, dateStr);
  markModified();
}

function insertCitation() {
  const text = prompt('Texte de la citation:', '');
  if (text) {
    const html = `<cite style="font-style:italic;color:var(--text-muted);">${text}</cite>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
}

function insertCaption() {
  const text = prompt('Légende:', 'Figure 1 – Description');
  if (text) {
    const html = `<p style="text-align:center;font-size:9pt;color:var(--text-muted);font-style:italic;margin:4pt 0 12pt;">${text}</p>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
}

function insertCrossRef() {
  const ref = prompt('Identifiant du renvoi:', '');
  if (ref) {
    const html = `<a href="#${ref}" style="color:var(--blue);">[Voir ${ref}]</a>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
}

function insertBookmark() {
  const name = prompt('Nom du signet:', 'signet1');
  if (name) {
    const html = `<a id="${name}" name="${name}" style="color:var(--blue);font-size:0;position:relative;">⚓</a>`;
    doc().focus();
    document.execCommand('insertHTML', false, html);
    markModified();
  }
}

// ─── TABLE OPERATIONS ───
function openInsertTableModal() {
  closeAllDropdowns();
  $('modal-table').classList.add('open');
}

function doInsertTableDirect(rows, cols) {
  buildAndInsertTable(rows, cols, true, 'grid');
}

function doInsertTable() {
  const rows = parseInt($('table-rows').value) || 3;
  const cols = parseInt($('table-cols').value) || 3;
  const hasHeader = $('table-header').checked;
  const style = $('table-style-select').value;
  buildAndInsertTable(rows, cols, hasHeader, style);
  closeModal('modal-table');
}

function buildAndInsertTable(rows, cols, hasHeader, style) {
  let styles = {
    grid: { table: 'border-collapse:collapse;width:100%;margin:8pt 0;', td: 'border:1px solid #ccc;padding:6pt 8pt;', th: 'border:1px solid #999;padding:6pt 8pt;background:#f0f0f0;font-weight:600;' },
    striped: { table: 'border-collapse:collapse;width:100%;margin:8pt 0;', td: 'border:1px solid #e0e0e0;padding:6pt 8pt;', th: 'border:1px solid #bbb;padding:6pt 8pt;background:#2b579a;color:white;font-weight:600;' },
    plain: { table: 'width:100%;margin:8pt 0;', td: 'padding:6pt 8pt;', th: 'padding:6pt 8pt;font-weight:600;' },
    colorful: { table: 'border-collapse:collapse;width:100%;margin:8pt 0;', td: 'border:1px solid #b3c8f5;padding:6pt 8pt;', th: 'border:1px solid #2b579a;padding:6pt 8pt;background:#2b579a;color:white;font-weight:600;' },
    dark: { table: 'border-collapse:collapse;width:100%;margin:8pt 0;', td: 'border:1px solid #555;padding:6pt 8pt;background:#2a2a2a;color:white;', th: 'border:1px solid #333;padding:6pt 8pt;background:#111;color:white;font-weight:600;' },
  };
  const s = styles[style] || styles.grid;
  
  let html = `<table style="${s.table}">`;
  for (let r = 0; r < rows; r++) {
    let rowStyle = '';
    if (style === 'striped' && r % 2 === 0 && r > 0) rowStyle = ' style="background:#f5f8ff"';
    html += `<tr${rowStyle}>`;
    for (let c = 0; c < cols; c++) {
      if (r === 0 && hasHeader) {
        html += `<th style="${s.th}">En-tête ${c+1}</th>`;
      } else {
        html += `<td style="${s.td}">Cellule</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  doc().focus();
  document.execCommand('insertHTML', false, html);
  markModified();
}

function getActiveTable() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  while (node && node.tagName !== 'TABLE') node = node.parentElement;
  return node;
}

function tableAddRow(where) {
  const sel = window.getSelection();
  let td = sel.anchorNode;
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') td = td.parentElement;
  if (!td) return;
  const tr = td.closest('tr');
  const cols = tr.cells.length;
  const newRow = tr.cloneNode(false);
  for (let i = 0; i < cols; i++) {
    const cell = document.createElement('td');
    cell.style = td.style.cssText;
    cell.textContent = '';
    newRow.appendChild(cell);
  }
  if (where === 'above') tr.parentNode.insertBefore(newRow, tr);
  else tr.parentNode.insertBefore(newRow, tr.nextSibling);
  markModified();
}

function tableAddCol(where) {
  const sel = window.getSelection();
  let td = sel.anchorNode;
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') td = td.parentElement;
  if (!td) return;
  const table = td.closest('table');
  const colIdx = td.cellIndex;
  Array.from(table.rows).forEach(row => {
    const newCell = document.createElement('td');
    newCell.style = row.cells[colIdx]?.style?.cssText || '';
    newCell.textContent = '';
    if (where === 'left') row.insertBefore(newCell, row.cells[colIdx]);
    else row.insertBefore(newCell, row.cells[colIdx + 1] || null);
  });
  markModified();
}

function tableDeleteRow() {
  const sel = window.getSelection();
  let td = sel.anchorNode;
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') td = td.parentElement;
  if (td) { td.closest('tr').remove(); markModified(); }
}

function tableDeleteCol() {
  const sel = window.getSelection();
  let td = sel.anchorNode;
  while (td && td.tagName !== 'TD' && td.tagName !== 'TH') td = td.parentElement;
  if (!td) return;
  const table = td.closest('table');
  const idx = td.cellIndex;
  Array.from(table.rows).forEach(row => { if (row.cells[idx]) row.cells[idx].remove(); });
  markModified();
}

function tableDelete() {
  const table = getActiveTable();
  if (table) { table.remove(); markModified(); $('table-tab-btn').style.display = 'none'; }
}

function tableMerge() {
  alert('Sélectionnez plusieurs cellules pour les fusionner (fonctionnalité avancée).');
}

function tableSplit() {
  alert('Fractionnement de cellule : fonctionnalité avancée.');
}

function applyTableStyle(style) {
  const table = getActiveTable();
  if (!table) return;
  const styles = {
    plain: { td:'padding:6pt 8pt;', th:'padding:6pt 8pt;font-weight:600;' },
    grid: { table:'border-collapse:collapse;width:100%;', td:'border:1px solid #ccc;padding:6pt 8pt;', th:'border:1px solid #999;padding:6pt 8pt;background:#f0f0f0;font-weight:600;' },
    colorful: { table:'border-collapse:collapse;width:100%;', td:'border:1px solid #b3c8f5;padding:6pt 8pt;', th:'border:1px solid #2b579a;padding:6pt 8pt;background:#2b579a;color:white;font-weight:600;' },
    dark: { table:'border-collapse:collapse;width:100%;', td:'border:1px solid #555;padding:6pt 8pt;background:#2a2a2a;color:white;', th:'border:1px solid #333;padding:6pt 8pt;background:#111;color:white;font-weight:600;' },
    striped: { table:'border-collapse:collapse;width:100%;', td:'border:1px solid #e0e0e0;padding:6pt 8pt;', th:'border:1px solid #bbb;padding:6pt 8pt;background:#2b579a;color:white;font-weight:600;' },
  };
  const s = styles[style] || styles.grid;
  if (s.table) table.style.cssText = s.table;
  Array.from(table.querySelectorAll('th')).forEach(th => th.style.cssText = s.th || '');
  Array.from(table.querySelectorAll('td')).forEach(td => td.style.cssText = s.td || '');
  if (style === 'striped') {
    Array.from(table.rows).forEach((row, i) => {
      if (i > 0 && i % 2 === 0) Array.from(row.cells).forEach(c => c.style.background = '#f5f8ff');
    });
  }
  markModified();
  closeAllDropdowns();
}

function tableAutoFit() {
  const table = getActiveTable();
  if (table) {
    table.style.width = '100%';
    Array.from(table.querySelectorAll('td,th')).forEach(c => c.style.width = '');
    markModified();
  }
}

// ─── LAYOUT ───
function setMargins(type) {
  const m = { normal:{all:96}, narrow:{all:48}, wide:{all:192}, mirrored:{all:96} };
  const val = m[type]?.all || 96;
  const pc = doc();
  pc.style.padding = val + 'px';
  state.pageSetup = { mt: val, mb: val, ml: val, mr: val };
  closeAllDropdowns();
}

function setOrientation(o) {
  const page = $('page-1');
  if (o === 'landscape') {
    page.style.width = '1056px';
    page.style.minHeight = '816px';
  } else {
    page.style.width = '816px';
    page.style.minHeight = '1056px';
  }
  closeAllDropdowns();
}

function setPaperSize(size) {
  const sizes = {
    a4: { w: 794, h: 1123 },
    letter: { w: 816, h: 1056 },
    legal: { w: 816, h: 1344 },
    a3: { w: 1123, h: 1587 },
  };
  const s = sizes[size] || sizes.letter;
  const page = $('page-1');
  page.style.width = s.w + 'px';
  page.style.minHeight = s.h + 'px';
  closeAllDropdowns();
}

function setColumns(n) {
  const pc = doc();
  if (n === 1) { pc.style.columns = ''; pc.style.columnGap = ''; }
  else { pc.style.columns = n; pc.style.columnGap = '32px'; }
  closeAllDropdowns();
}

function openPageSetupModal() {
  const ps = state.pageSetup;
  $('ps-mt').value = ps.mt; $('ps-mb').value = ps.mb;
  $('ps-ml').value = ps.ml; $('ps-mr').value = ps.mr;
  $('modal-pagesetup').classList.add('open');
}

function applyPageSetup() {
  const mt = +$('ps-mt').value, mb = +$('ps-mb').value;
  const ml = +$('ps-ml').value, mr = +$('ps-mr').value;
  state.pageSetup = { mt, mb, ml, mr };
  doc().style.padding = `${mt}px ${mr}px ${mb}px ${ml}px`;
  closeModal('modal-pagesetup');
}

// ─── VIEW ───
function setDocView(v) {
  state.view = v;
  const page = $('page-1');
  const scrollC = $('scroll-container');
  if (v === 'print') {
    page.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
    scrollC.style.background = '#e8eaed';
    page.style.width = '816px';
    doc().style.fontSize = '';
  } else if (v === 'web') {
    page.style.boxShadow = 'none';
    page.style.width = '100%';
    scrollC.style.background = 'white';
  } else if (v === 'read') {
    page.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
    page.style.width = '700px';
    scrollC.style.background = '#2b579a';
    doc().style.fontSize = '13pt';
  }
  ['rb-view-print','rb-view-web','rb-view-read'].forEach(id => $( id)?.classList.remove('pressed'));
  $('rb-view-' + v)?.classList.add('pressed');
}

function setZoom(val) {
  state.zoom = val;
  $('scroll-container').style.transform = `scale(${val/100})`;
  $('scroll-container').style.transformOrigin = 'top center';
  $('zoom-value').textContent = val + '%';
  $('zoom-display').textContent = val + '%';
  $('zoom-display-bar').textContent = val + '%';
  if ($('zoom-range')) $('zoom-range').value = val;
  if ($('zoom-slider')) $('zoom-slider').value = val;
}

function toggleRuler() {
  const r = $('ruler');
  r.style.display = r.style.display === 'none' ? '' : 'none';
  $('rb-ruler')?.classList.toggle('pressed');
}

function toggleSidebar() {
  $('sidebar').classList.toggle('collapsed');
  $('rb-sidebar')?.classList.toggle('pressed');
  setTimeout(initRuler, 300);
}

function toggleGridlines() {
  const d = doc();
  if (d.style.backgroundImage) {
    d.style.backgroundImage = '';
    $('rb-grid')?.classList.remove('pressed');
  } else {
    d.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)';
    d.style.backgroundSize = '20px 20px';
    $('rb-grid')?.classList.add('pressed');
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

function splitWindow() {
  alert('Fractionnement de fenêtre non disponible dans le navigateur.');
}

// ─── REVIEW ───
function toggleTrackChanges() {
  state.trackChanges = !state.trackChanges;
  $('rb-track')?.classList.toggle('pressed', state.trackChanges);
  $('sb-track-indicator').style.display = state.trackChanges ? 'flex' : 'none';
}

function acceptAllChanges() {
  doc().querySelectorAll('.track-insert').forEach(el => {
    el.outerHTML = el.innerHTML;
  });
  doc().querySelectorAll('.track-delete').forEach(el => el.remove());
  markModified();
}

function rejectAllChanges() {
  doc().querySelectorAll('.track-delete').forEach(el => {
    el.outerHTML = el.innerHTML;
  });
  doc().querySelectorAll('.track-insert').forEach(el => el.remove());
  markModified();
}

function acceptChange() { acceptAllChanges(); }
function rejectChange() { rejectAllChanges(); }

function checkSpelling() {
  doc().spellcheck = true;
  doc().focus();
  alert('Vérification orthographique : activez le correcteur de votre navigateur ou utilisez Ctrl+clic sur les mots soulignés.');
}

function thesaurus() {
  const sel = window.getSelection().toString();
  if (sel) window.open(`https://www.synonymes.com/synonyme.php?mot=${encodeURIComponent(sel)}`, '_blank');
  else alert('Sélectionnez un mot pour chercher ses synonymes.');
}

function addComment() {
  $('modal-comment').classList.add('open');
}

function doAddComment() {
  const author = $('comment-author').value || 'Utilisateur';
  const text = $('comment-text').value;
  if (!text) return;

  const sel = window.getSelection();
  const selectedText = sel.toString();
  const now = new Date().toLocaleString('fr-FR');
  
  state.commentCount++;
  const id = 'comment-' + state.commentCount;

  // Highlight selected text
  if (selectedText) {
    doc().focus();
    const span = `<span class="comment-mark" id="${id}-mark" onclick="scrollToComment('${id}')">${selectedText}</span>`;
    document.execCommand('insertHTML', false, span);
  }

  // Add to comment panel
  const comment = { id, author, text, date: now, selectedText };
  state.comments.push(comment);

  const list = $('comment-list');
  list.innerHTML = '';
  state.comments.forEach(c => {
    const card = document.createElement('div');
    card.className = 'comment-card';
    card.id = c.id;
    card.innerHTML = `
      <div class="comment-meta">${c.author} · ${c.date}</div>
      <div class="comment-text">${c.text}</div>
      ${c.selectedText ? `<div style="font-size:10px;color:#aaa;margin-top:4px;font-style:italic;">"${c.selectedText.slice(0,40)}…"</div>` : ''}
      <div class="comment-reply" onclick="replyToComment('${c.id}')">↩ Répondre</div>
    `;
    list.appendChild(card);
  });

  // Show comment panel
  $('comment-panel').classList.add('open');
  $('comment-text').value = '';
  closeModal('modal-comment');
  markModified();
}

function toggleCommentPanel() {
  $('comment-panel').classList.toggle('open');
}

function deleteComment() {
  if (state.comments.length === 0) return;
  const last = state.comments.pop();
  const mark = doc().querySelector('#' + last.id + '-mark');
  if (mark) mark.outerHTML = mark.innerHTML;
  const card = $(last.id);
  if (card) card.remove();
  markModified();
}

function compareDocs() { alert('Comparaison de documents : ouvrez deux documents pour comparer.'); }
function protectDoc() {
  const pw = prompt('Définir un mot de passe (laisser vide pour annuler):');
  if (pw) {
    doc().contentEditable = 'false';
    alert('Document protégé. Rechargez la page pour modifier.');
  }
}

// ─── FIND & REPLACE ───
function openFindPanel() {
  $('find-panel').classList.add('open');
  $('replace-row').style.display = 'none';
  $('btn-show-replace').textContent = 'Remplacer ▾';
  $('find-panel-title').textContent = 'Rechercher';
  $('find-input').focus();
  $('find-input').select();
}

function openFindReplace() {
  openFindPanel();
  $('replace-row').style.display = 'flex';
  $('btn-show-replace').textContent = 'Remplacer ▴';
  $('find-panel-title').textContent = 'Rechercher et remplacer';
}

function closeFindPanel() {
  $('find-panel').classList.remove('open');
  clearHighlights();
}

function toggleReplaceRow() {
  const row = $('replace-row');
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'flex';
  $('btn-show-replace').textContent = isOpen ? 'Remplacer ▾' : 'Remplacer ▴';
}

function liveFind() {
  clearHighlights();
  const q = $('find-input').value;
  if (!q) { $('find-count').textContent = ''; return; }
  const text = doc().innerHTML;
  const flags = $('find-case').checked ? 'g' : 'gi';
  let pattern;
  try {
    pattern = $('find-regex').checked ? new RegExp(q, flags) : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch(e) { return; }
  
  state.findMatches = [];
  let count = 0;
  const highlighted = doc().innerHTML.replace(pattern, match => {
    count++;
    return `<mark class="find-highlight" id="fh-${count}">${match}</mark>`;
  });
  doc().innerHTML = highlighted;
  state.findMatches = Array.from(doc().querySelectorAll('.find-highlight'));
  state.findIndex = 0;
  $('find-count').textContent = count ? `${count} résultat(s)` : 'Aucun résultat';
  if (count) scrollToMatch(0);
}

function scrollToMatch(i) {
  const m = state.findMatches[i];
  if (m) {
    state.findMatches.forEach(x => x.style.background = '#ffff00');
    m.style.background = '#ff9500';
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function findNext() {
  if (!state.findMatches.length) { liveFind(); return; }
  state.findIndex = (state.findIndex + 1) % state.findMatches.length;
  scrollToMatch(state.findIndex);
}

function findPrev() {
  if (!state.findMatches.length) return;
  state.findIndex = (state.findIndex - 1 + state.findMatches.length) % state.findMatches.length;
  scrollToMatch(state.findIndex);
}

function replaceOne() {
  const q = $('find-input').value;
  const r = $('replace-input').value;
  if (!q) return;
  const m = state.findMatches[state.findIndex];
  if (m) { m.outerHTML = r; liveFind(); }
}

function replaceAll() {
  const q = $('find-input').value;
  const r = $('replace-input').value;
  if (!q) return;
  const flags = $('find-case').checked ? 'g' : 'gi';
  let pattern;
  try {
    pattern = $('find-regex').checked ? new RegExp(q, flags) : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch(e) { return; }
  doc().innerHTML = doc().innerHTML.replace(pattern, r);
  $('find-count').textContent = 'Tout remplacé';
  markModified();
}

function clearHighlights() {
  doc().querySelectorAll('mark.find-highlight').forEach(m => m.outerHTML = m.innerHTML);
  state.findMatches = [];
}

// ─── STATUS BAR ───
function updateStatusBar() {
  const text = doc().innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  $('sb-words').textContent = words + ' mot' + (words !== 1 ? 's' : '');
  $('sb-chars').textContent = chars + ' caractère' + (chars !== 1 ? 's' : '');
  
  const height = doc().scrollHeight;
  const pages = Math.max(1, Math.ceil(height / 1056));
  $('sb-pages').textContent = pages + ' page' + (pages !== 1 ? 's' : '');
}

function wordCount() {
  const text = doc().innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const lines = text.split('\n').length;
  const paragraphs = doc().querySelectorAll('p,h1,h2,h3,h4').length;
  
  $('wc-body').innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:var(--text-muted)">Mots</td><td style="font-weight:600">${words.length}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-muted)">Caractères (avec espaces)</td><td style="font-weight:600">${chars}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-muted)">Caractères (sans espaces)</td><td style="font-weight:600">${charsNoSpace}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-muted)">Lignes</td><td style="font-weight:600">${lines}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-muted)">Paragraphes</td><td style="font-weight:600">${paragraphs}</td></tr>
    </table>
  `;
  $('modal-wc').classList.add('open');
}

function changeLang() {
  const langs = ['fr','en','de','es','it','pt'];
  const names = {'fr':'Français','en':'English','de':'Deutsch','es':'Español','it':'Italiano','pt':'Português'};
  const curr = langs.indexOf(state.language);
  state.language = langs[(curr + 1) % langs.length];
  $('sb-lang').querySelector('span').textContent = names[state.language];
  doc().lang = state.language;
}

// ─── OUTLINE / NAVIGATION ───
function updateOutline() {
  const headings = doc().querySelectorAll('h1,h2,h3,h4');
  const outline = $('nav-outline');
  if (!headings.length) {
    outline.innerHTML = '<em style="font-size:11px;color:var(--text-muted)">Aucun titre trouvé</em>';
    return;
  }
  outline.innerHTML = '';
  headings.forEach((h, i) => {
    const level = h.tagName.toLowerCase();
    const item = document.createElement('div');
    item.className = 'outline-item ' + level;
    item.textContent = h.textContent;
    item.onclick = () => h.scrollIntoView({ behavior: 'smooth' });
    outline.appendChild(item);
  });
}

// ─── CONTEXT MENU ───
function showCtxMenu(e) {
  e.preventDefault();
  const menu = $('ctx-menu');
  menu.style.left = Math.min(e.pageX, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.pageY, window.innerHeight - 320) + 'px';
  menu.classList.add('open');
}

function closeCtxMenu() { $('ctx-menu').classList.remove('open'); }

function ctxAction(action) {
  closeCtxMenu();
  switch(action) {
    case 'cut': document.execCommand('cut'); break;
    case 'copy': document.execCommand('copy'); break;
    case 'paste': document.execCommand('paste'); break;
    case 'pasteText':
      navigator.clipboard.readText().then(t => {
        doc().focus();
        document.execCommand('insertText', false, t);
      }).catch(() => document.execCommand('paste'));
      break;
    case 'bold': fmt('bold'); break;
    case 'italic': fmt('italic'); break;
    case 'underline': fmt('underline'); break;
    case 'link': insertLink(); break;
    case 'comment': addComment(); break;
    case 'paragraph': $('modal-paragraph').classList.add('open'); break;
    case 'selectAll': document.execCommand('selectAll'); break;
  }
}

// ─── MINI TOOLBAR ───
function handleMouseUp(e) {
  setTimeout(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 2) {
      const toolbar = $('mini-toolbar');
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      toolbar.style.left = Math.max(8, rect.left + rect.width / 2 - 100) + 'px';
      toolbar.style.top = (rect.top - 44) + 'px';
      toolbar.classList.add('open');
    } else {
      closeMiniToolbar();
    }
    updateFormatState();
  }, 10);
}

function closeMiniToolbar() { $('mini-toolbar').classList.remove('open'); }

// ─── PARAGRAPH SETTINGS ───
function applyParagraphSettings() {
  const align = $('para-align').value;
  const indLeft = $('para-indent-left').value + 'px';
  const indRight = $('para-indent-right').value + 'px';
  const spaceBefore = $('para-space-before').value + 'px';
  const spaceAfter = $('para-space-after').value + 'px';
  const lh = $('para-lh').value;

  doc().focus();
  document.execCommand('justify' + align.charAt(0).toUpperCase() + align.slice(1), false, null);
  
  const sel = window.getSelection();
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).commonAncestorContainer;
    while (node && node.nodeType !== 1) node = node.parentNode;
    if (node) {
      node.style.paddingLeft = indLeft;
      node.style.paddingRight = indRight;
      node.style.marginTop = spaceBefore;
      node.style.marginBottom = spaceAfter;
      node.style.lineHeight = lh;
    }
  }
  closeModal('modal-paragraph');
  markModified();
}

// ─── SIDEBAR TABS ───
function switchSidebarTab(tab) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.stab === tab));
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
  $('spanel-' + tab).classList.add('active');
  if (tab === 'outline') updateOutline();
}

// ─── DROPDOWNS ───
function toggleDropdown(id) {
  const dd = $(id);
  const wasOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) dd.classList.add('open');
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('open'));
}

// ─── MODALS ───
function closeModal(id) { $(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
    closeCtxMenu();
    closeFindPanel();
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ─── MISC FUNCTIONS ───
function focusHeader() {
  $('header-content').focus();
}

function focusFooter() {
  $('footer-content').focus();
}

function markModified() {
  state.modified = true;
  const si = $('save-indicator');
  si.textContent = '● Non enregistré';
  si.style.opacity = '0.9';
  updateStatusBar();
  updateOutline();
}

function updateTitle() {
  $('doc-title-display').textContent = ' — ' + state.docTitle;
  document.title = 'AetherWord — ' + state.docTitle;
}

function handleInput() {
  markModified();
  updateFormatState();
}

function handleKeyDown(e) {
  // Tab in editor inserts spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertText', false, '\t');
    return;
  }
}

function activeEditorFocus() {
  updateFormatState();
}

function openDocProperties() {
  const text = doc().innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $('wc-body').innerHTML = `
    <div class="form-group"><label class="form-label">Titre</label>
    <input class="form-control" id="prop-title" value="${state.docTitle}"></div>
    <div class="form-group"><label class="form-label">Statistiques</label>
    <p style="font-size:12px;color:var(--text-muted)">${words} mots · ${text.length} caractères</p></div>
    <div class="form-group"><label class="form-label">Créé le</label>
    <p style="font-size:12px;color:var(--text-muted)">${new Date().toLocaleDateString('fr-FR')}</p></div>
  `;
  $('modal-wc').classList.add('open');
  $('modal-wc').querySelector('.modal-title').textContent = 'Propriétés du document';
}

// ─── GLOBAL SHORTCUTS ───
function globalShortcuts(e) {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key.toLowerCase()) {
      case 's': e.preventDefault(); saveDocument(); break;
      case 'o': e.preventDefault(); openDocument(); break;
      case 'n': e.preventDefault(); newDocument(); break;
      case 'p': e.preventDefault(); printDocument(); break;
      case 'f': e.preventDefault(); openFindPanel(); break;
      case 'h': e.preventDefault(); openFindReplace(); break;
      case 'k': e.preventDefault(); insertLink(); break;
      case 'z': if (!e.shiftKey) { e.preventDefault(); execUndo(); } break;
      case 'y': e.preventDefault(); execRedo(); break;
      case '=': if (e.shiftKey) { e.preventDefault(); fmt('superscript'); } break;
      case '-': if (!e.shiftKey) { e.preventDefault(); fmt('subscript'); } break;
    }
    if (e.shiftKey && e.key === 'Z') { e.preventDefault(); execRedo(); }
  }
  if (e.key === 'F7') { e.preventDefault(); checkSpelling(); }
}

// ─── RESTORE AUTOSAVE ───
window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'open_file' && data.path) {
    loadDocumentContent(typeof data.content === 'string' ? data.content : '', data.name || data.path.split('/').pop(), data.path);
  } else if (data.type === 'OS_PATH_PICKED' && data.requestId === exportPickerRequestId) {
    $('exp-directory').value = data.path || '/Documents';
    exportPickerRequestId = null;
  }
});

const saved = localStorage.getItem('aetherword_autosave');
if (saved) {
  const title = localStorage.getItem('aetherword_title') || 'Document1';
  if (confirm(`Restaurer la sauvegarde automatique "${title}" ?`)) {
    doc().innerHTML = saved;
    state.docTitle = title;
    updateTitle();
    updateStatusBar();
    updateOutline();
  }
}
