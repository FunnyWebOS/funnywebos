
    const LS = {
      state: 'aether_notepad_state_v1',
      theme: 'aether_notepad_theme',
      wrap: 'aether_notepad_wrap',
      mono: 'aether_notepad_mono',
      zoom: 'aether_notepad_zoom',
      lines: 'aether_notepad_lines',
      findCase: 'aether_notepad_find_case'
    };

    const tabsEl = document.getElementById('tabs');
    const editorEl = document.getElementById('editor');
    const ta = document.getElementById('ta');
    const gutter = document.getElementById('gutter');
    const gutterInner = document.getElementById('gutterInner');
    const stL = document.getElementById('stL');
    const stWrap = document.getElementById('stWrap');
    const stCount = document.getElementById('stCount');
    const kWrap = document.getElementById('kWrap');
    const kMono = document.getElementById('kMono');
    const kLines = document.getElementById('kLines');
    const zLab = document.getElementById('zLab');

    const menus = {
      file: document.getElementById('mFile'),
      edit: document.getElementById('mEdit'),
      view: document.getElementById('mView'),
      help: document.getElementById('mHelp')
    };

    const modal = document.getElementById('modal');
    const dlgT = document.getElementById('dlgT');
    const qFind = document.getElementById('qFind');
    const qRep = document.getElementById('qRep');
    const repWrap = document.getElementById('repWrap');
    const togCase = document.getElementById('togCase');
    const aPrev = document.getElementById('aPrev');
    const aNext = document.getElementById('aNext');
    const aRep = document.getElementById('aRep');
    const aAll = document.getElementById('aAll');
    const dlgX = document.getElementById('dlgX');
    const openFile = document.getElementById('openFile');
    const importJson = document.getElementById('importJson');

    const cmdModal = document.getElementById('cmdModal');
    const cmdT = document.getElementById('cmdT');
    const cmdL = document.getElementById('cmdL');
    const cmdI = document.getElementById('cmdI');
    const cmdOk = document.getElementById('cmdOk');
    const cmdCancel = document.getElementById('cmdCancel');
    const cmdX = document.getElementById('cmdX');

    let S = {
      tabs: [],
      active: '',
      wrap: true,
      mono: false,
      lines: false,
      zoom: 100,
      theme: 'dark',
      findCase: false,
      lastFind: ''
    };

    const closedTabs = [];
    let cmdMode = null;
    let cmdHandler = null;

    function esc(s){
      return String(s||'')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function uid(){
      try{
        const a=new Uint32Array(4);
        crypto.getRandomValues(a);
        return Array.from(a).map(n=>n.toString(16)).join('');
      }catch(e){
        return String(Date.now())+Math.random().toString(16).slice(2);
      }
    }

    function activeTab(){
      return S.tabs.find(t=>t.id===S.active) || null;
    }

    function persist(){
      try{
        localStorage.setItem(LS.state, JSON.stringify({
          tabs: S.tabs.map(t=>({
            id: t.id,
            title: t.title,
            content: t.content,
            dirty: !!t.dirty,
            scrollTop: Number(t.scrollTop || 0),
            scrollLeft: Number(t.scrollLeft || 0)
          })),
          active: S.active
        }));
      }catch(e){}
    }
    let pT;
    function persistSoon(){ clearTimeout(pT); pT=setTimeout(persist, 250); }

    function setTheme(t){
      S.theme = t === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = S.theme;
      const b = document.getElementById('bTheme');
      if (b) b.textContent = S.theme === 'light' ? '☀️' : '🌙';
      try{ localStorage.setItem(LS.theme, S.theme); }catch(e){}
    }

    function setWrap(on){
      S.wrap = !!on;
      ta.wrap = S.wrap ? 'soft' : 'off';
      stWrap.textContent = S.wrap ? 'Renvoi' : 'Sans renvoi';
      kWrap.textContent = S.wrap ? 'On' : 'Off';
      try{ localStorage.setItem(LS.wrap, S.wrap ? '1' : '0'); }catch(e){}
    }

    function setMono(on){
      S.mono = !!on;
      ta.classList.toggle('mono', S.mono);
      kMono.textContent = S.mono ? 'On' : 'Off';
      try{ localStorage.setItem(LS.mono, S.mono ? '1' : '0'); }catch(e){}
    }

    function setLines(on){
      S.lines = !!on;
      if (editorEl) editorEl.classList.toggle('lines', S.lines);
      if (kLines) kLines.textContent = S.lines ? 'On' : 'Off';
      try{ localStorage.setItem(LS.lines, S.lines ? '1' : '0'); }catch(e){}
      updateGutterSoon();
      syncGutterScroll();
    }

    function setFindCase(on){
      S.findCase = !!on;
      if (togCase) {
        togCase.classList.toggle('on', S.findCase);
        togCase.setAttribute('aria-pressed', S.findCase ? 'true' : 'false');
      }
      try{ localStorage.setItem(LS.findCase, S.findCase ? '1' : '0'); }catch(e){}
    }

    function baseFont(){
      try{ return window.matchMedia('(max-width:520px)').matches ? 14 : 15; }catch(e){ return 15; }
    }

    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function setZoom(z){
      S.zoom = clamp(Math.round(z), 50, 250);
      const px = (baseFont()*(S.zoom/100));
      ta.style.fontSize = px.toFixed(2)+'px';
      if (gutterInner) gutterInner.style.fontSize = ta.style.fontSize;
      zLab.textContent = S.zoom + '%';
      try{ localStorage.setItem(LS.zoom, String(S.zoom)); }catch(e){}
      updateStatusSoon();
      updateGutterSoon();
    }

    function loadPrefs(){
      const theme = (localStorage.getItem(LS.theme)||'').trim();
      const wrap  = (localStorage.getItem(LS.wrap)||'').trim();
      const mono  = (localStorage.getItem(LS.mono)||'').trim();
      const lines = (localStorage.getItem(LS.lines)||'').trim();
      const zoom  = Number(localStorage.getItem(LS.zoom)||100) || 100;
      const findCase = (localStorage.getItem(LS.findCase)||'').trim();
      if (!theme) {
        try{ setTheme(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }catch(e){ setTheme('dark'); }
      } else setTheme(theme);
      setWrap(wrap === '0' ? false : true);
      setMono(mono === '1');
      setLines(lines === '1');
      setZoom(zoom);
      setFindCase(findCase === '1');
    }

    function loadState(){
      const raw = localStorage.getItem(LS.state) || '';
      try{
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.tabs) && d.tabs.length) {
          S.tabs = d.tabs.map(t=>({
            id: String(t.id||uid()),
            title: String(t.title||'Sans titre'),
            content: String(t.content||''),
            dirty: !!t.dirty,
            scrollTop: Number(t.scrollTop || 0),
            scrollLeft: Number(t.scrollLeft || 0)
          }));
          const a = String(d.active||'');
          S.active = S.tabs.find(t=>t.id===a) ? a : S.tabs[0].id;
          return;
        }
      }catch(e){}
      const id = uid();
      S.tabs = [{ id, title:'Sans titre', content:'', dirty:false, scrollTop:0, scrollLeft:0 }];
      S.active = id;
    }

    function renderTabs(){
      tabsEl.innerHTML = S.tabs.map(t=>{
        const on = t.id===S.active;
        return `
          <div class="tab ${on?'on':''} ${t.dirty?'dirty':''}" data-tab="${esc(t.id)}" title="${esc(t.title)}" role="tab" tabindex="0">
            <span class="dot"></span>
            <span class="tname">${esc(t.title||'Sans titre')}</span>
            <span style="flex:1"></span>
            <button type="button" class="x" data-x="${esc(t.id)}" title="Fermer">✕</button>
          </div>
        `;
      }).join('') + `<button class="add" id="addTab" title="Ctrl+N">＋</button>`;
      document.getElementById('addTab').onclick = () => newTab();
    }

    function switchTab(id){
      const t = S.tabs.find(x=>x.id===id);
      if (!t) return;
      const cur = activeTab();
      if (cur) { cur.scrollTop = ta.scrollTop || 0; cur.scrollLeft = ta.scrollLeft || 0; }
      S.active = t.id;
      ta.value = t.content;
      ta.scrollTop = Number(t.scrollTop || 0);
      ta.scrollLeft = Number(t.scrollLeft || 0);
      syncGutterScroll();
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    }

    function newTab(text='', title='Sans titre', opts={}){
      const cur = activeTab();
      if (cur) { cur.scrollTop = ta.scrollTop || 0; cur.scrollLeft = ta.scrollLeft || 0; }
      const id = uid();
      const tab = { id, title, content:String(text||''), dirty: !!opts.dirty, scrollTop: 0, scrollLeft: 0 };
      if (opts && opts.handle) tab.handle = opts.handle;
      S.tabs.push(tab);
      S.active = id;
      ta.value = String(text||'');
      ta.scrollTop = 0;
      ta.scrollLeft = 0;
      syncGutterScroll();
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    }

    function closeTab(id){
      const idx = S.tabs.findIndex(t=>t.id===id);
      if (idx < 0) return;
      const t = S.tabs[idx];
      if (t && t.dirty) {
        const ok = confirm('Cet onglet contient des modifications non enregistrées. Fermer quand même ?');
        if (!ok) return;
      }
      if (t) {
        closedTabs.push({ title: t.title, content: t.content, dirty: !!t.dirty });
        if (closedTabs.length > 30) closedTabs.shift();
      }
      if (S.tabs.length === 1) {
        S.tabs[0] = { id: S.tabs[0].id, title:'Sans titre', content:'', dirty:false, scrollTop:0, scrollLeft:0 };
        S.active = S.tabs[0].id;
        ta.value = '';
        ta.scrollTop = 0;
        ta.scrollLeft = 0;
        syncGutterScroll();
        renderTabs();
        updateStatusSoon();
        updateGutterSoon();
        persistSoon();
        return;
      }
      const was = S.active === id;
      S.tabs.splice(idx, 1);
      if (was) {
        const next = S.tabs[Math.min(idx, S.tabs.length-1)];
        S.active = next.id;
        ta.value = next.content;
        ta.scrollTop = Number(next.scrollTop || 0);
        ta.scrollLeft = Number(next.scrollLeft || 0);
        syncGutterScroll();
      }
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    }

    function renameTab(){
      const t = activeTab();
      if (!t) return;
      cmdOpen('rename', 'Renommer l’onglet', 'Nom', 'Sans titre', t.title || 'Sans titre', 'Renommer', (val)=>{
        const next = String(val||'').trim();
        if (!next) return;
        t.title = next;
        renderTabs();
        persistSoon();
      });
    }

    function duplicateTab(){
      const t = activeTab();
      if (!t) return;
      const name = (t.title || 'Sans titre') + ' (copie)';
      newTab(t.content, name, { dirty: !!t.dirty });
    }

    function reopenClosedTab(){
      const last = closedTabs.pop();
      if (!last) { alert('Aucun onglet à rouvrir.'); return; }
      newTab(last.content, last.title || 'Sans titre', { dirty: !!last.dirty });
    }

    function closeOthers(){
      const active = S.active;
      const others = S.tabs.filter(t=>t.id!==active);
      if (others.some(t=>t.dirty)) {
        const ok = confirm('Certains onglets ont des modifications non enregistrées. Fermer les autres quand même ?');
        if (!ok) return;
      }
      S.tabs = S.tabs.filter(t=>t.id===active);
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    }

    function closeAllTabs(){
      if (S.tabs.some(t=>t.dirty)) {
        const ok = confirm('Certains onglets ont des modifications non enregistrées. Tout fermer quand même ?');
        if (!ok) return;
      }
      const id = uid();
      S.tabs = [{ id, title:'Sans titre', content:'', dirty:false, scrollTop:0, scrollLeft:0 }];
      S.active = id;
      ta.value = '';
      ta.scrollTop = 0;
      ta.scrollLeft = 0;
      syncGutterScroll();
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    }

    function gotoLineDialog(){
      const cur = (ta.selectionStart || 0);
      const line = ta.value.slice(0, cur).split('\n').length;
      cmdOpen('goto', 'Atteindre', 'Ligne', 'Numéro de ligne…', String(line), 'Aller', (val)=>{
        const n = Math.max(1, Math.floor(Number(val)));
        if (!Number.isFinite(n)) return;
        gotoLine(n);
      });
    }

    function gotoLine(n){
      const target = Math.max(1, Math.floor(Number(n)));
      if (!Number.isFinite(target)) return false;
      const v = ta.value;
      let idx = 0;
      let line = 1;
      while (line < target) {
        const j = v.indexOf('\n', idx);
        if (j < 0) { idx = v.length; break; }
        idx = j + 1;
        line++;
      }
      try{
        ta.focus();
        ta.setSelectionRange(idx, idx);
      }catch(e){}
      updateStatusSoon();
      return true;
    }

    function exportAll(){
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        active: S.active,
        tabs: S.tabs.map(t=>({ title: t.title, content: t.content, dirty: !!t.dirty }))
      };
      downloadText('bloc-notes.json', JSON.stringify(payload, null, 2));
    }

    function importAll(){
      if (!importJson) return;
      importJson.value = '';
      importJson.click();
    }

    function printCurrent(){
      const t = activeTab();
      const title = t && t.title ? t.title : 'Bloc-notes';
      const text = ta.value || '';
      try{
        const w = window.open('', '_blank');
        if (!w) { alert('Impossible d’ouvrir la fenêtre d’impression (popup bloquée).'); return; }
        w.document.open();
        w.document.write('<!doctype html><html><head><meta charset=\"utf-8\"/>');
        w.document.write('<title>' + esc(title) + '</title>');
        w.document.write('<style>body{font-family:ui-monospace,Consolas,monospace;margin:24px}pre{white-space:pre-wrap;word-wrap:break-word}</style>');
        w.document.write('</head><body><pre>' + esc(text) + '</pre></body></html>');
        w.document.close();
        w.focus();
        w.print();
      }catch(e){
        alert('Impression indisponible.');
      }
    }

    function markDirty(on){
      const t = activeTab();
      if (!t) return;
      const next = !!on;
      if (t.dirty === next) return;
      t.dirty = next;
      const el = tabsEl.querySelector(`[data-tab="${t.id}"]`);
      if (el) el.classList.toggle('dirty', next);
      persistSoon();
    }

    function syncActive(){
      const t = activeTab();
      if (!t) return;
      t.content = ta.value;
      markDirty(true);
      persistSoon();
      updateGutterSoon();
    }

    function focus(){
      setTimeout(()=>{ try{ ta.focus(); }catch(e){} }, 0);
    }

    function menuCloseAll(){
      Object.values(menus).forEach(m=>{
        m.classList.remove('open');
        m.setAttribute('aria-hidden','true');
      });
    }

    function menuOpen(which, anchor){
      menuCloseAll();
      const m = menus[which];
      if (!m || !anchor) return;
      const r = anchor.getBoundingClientRect();
      const pad = 8;
      m.style.top = Math.ceil(r.bottom + 6) + 'px';
      m.style.left = Math.ceil(r.left) + 'px';
      m.classList.add('open');
      m.setAttribute('aria-hidden','false');
      const mr = m.getBoundingClientRect();
      if (mr.right > window.innerWidth - pad) {
        const left = Math.max(pad, window.innerWidth - pad - mr.width);
        m.style.left = Math.ceil(left) + 'px';
      }
    }

    function menuToggle(which, anchor){
      const m = menus[which];
      if (!m) return;
      const open = m.classList.contains('open');
      menuCloseAll();
      if (!open) menuOpen(which, anchor);
    }

    function sanitizeFilename(name){
      const base = String(name||'Sans titre').trim() || 'Sans titre';
      const clean = base.replace(/[\\/:*?\"<>|]+/g, '_');
      return /\.[a-z0-9]{1,8}$/i.test(clean) ? clean : (clean + '.txt');
    }

    function downloadText(filename, text){
      const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 600);
    }

    async function save(as=false){
      const t = activeTab();
      if (!t) return;
      const content = ta.value;
      const suggested = sanitizeFilename(t.title);

      if (!as && t.handle && t.handle.createWritable) {
        try{
          const w = await t.handle.createWritable();
          await w.write(content);
          await w.close();
          markDirty(false);
          return;
        }catch(e){
          // fall back to picker / download
        }
      }

      if (window.showSaveFilePicker) {
        try{
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{ description:'Texte', accept:{ 'text/plain':['.txt','.md','.json','.js','.html','.css'] } }]
          });
          const w = await handle.createWritable();
          await w.write(content);
          await w.close();
          t.handle = handle;
          if (handle && handle.name) t.title = handle.name;
          markDirty(false);
          renderTabs();
          persistSoon();
          return;
        }catch(e){
          // fallback below
        }
      }

      if (as) {
        const name = prompt('Nom du fichier :', suggested) || '';
        if (!name.trim()) return;
        t.title = sanitizeFilename(name);
        renderTabs();
      }
      downloadText(sanitizeFilename(t.title), content);
      markDirty(false);
      persistSoon();
    }

    async function open(){
      if (window.showOpenFilePicker) {
        try{
          const handles = await window.showOpenFilePicker({
            multiple: true,
            types: [{ description:'Texte', accept:{ 'text/plain':['.txt','.md','.json','.js','.html','.css'] } }]
          });
          for (const h of handles) {
            try{
              const f = await h.getFile();
              const text = await f.text().catch(()=>'');
              newTab(text, f && f.name ? f.name : 'Sans titre', { handle: h });
            }catch(e){}
          }
          return;
        }catch(e){
          // fallback below
        }
      }
      openFile.value = '';
      openFile.click();
    }

    function timeDate(){
      const d = new Date();
      const stamp = d.toLocaleString(undefined, {
        year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
      });
      const s = ta.selectionStart || 0;
      const e = ta.selectionEnd || 0;
      const before = ta.value.slice(0, s);
      const after = ta.value.slice(e);
      ta.value = before + stamp + after;
      const p = s + stamp.length;
      ta.setSelectionRange(p, p);
      syncActive();
      updateStatusSoon();
    }

    function updateStatus(){
      const v = ta.value;
      const s = Math.max(0, Number(ta.selectionStart || 0));
      const e = Math.max(0, Number(ta.selectionEnd || 0));
      const pos = s;
      const before = v.slice(0, pos);
      const line = before.split('\n').length;
      const col = before.length - (before.lastIndexOf('\n') + 1) + 1;
      const sel = Math.max(0, e - s);
      const chars = v.length;
      const words = (v.trim() ? v.trim().split(/\s+/).length : 0);
      stL.textContent = `Ln ${line}, Col ${col}`;
      if (stCount) stCount.textContent = `${chars} car. · ${words} mot${words>1?'s':''}${sel?` · Sel ${sel}`:''}`;
    }

    let uRaf = 0;
    function updateStatusSoon(){
      if (uRaf) return;
      uRaf = requestAnimationFrame(()=>{ uRaf = 0; updateStatus(); });
    }

    let gRaf = 0;
    let lastLineCount = 0;
    function updateGutterSoon(){
      if (!S.lines) return;
      if (gRaf) return;
      gRaf = requestAnimationFrame(()=>{ gRaf = 0; updateGutter(); });
    }

    function updateGutter(){
      if (!S.lines || !gutter || !gutterInner) return;
      const n = ta.value.split('\n').length;
      if (n === lastLineCount && gutterInner.textContent) return;
      lastLineCount = n;
      const digits = String(n).length;
      const w = clamp(34 + digits * 10, 44, 96);
      gutter.style.width = w + 'px';
      let out = '';
      for (let i = 1; i <= n; i++) out += i + '\n';
      gutterInner.textContent = out;
    }

    function syncGutterScroll(){
      if (!S.lines || !gutterInner) return;
      gutterInner.style.transform = `translateY(${-(ta.scrollTop || 0)}px)`;
    }

    function dialogOpen(mode){
      menuCloseAll();
      const rep = mode === 'replace';
      dlgT.textContent = rep ? 'Remplacer' : 'Rechercher';
      repWrap.style.display = rep ? '' : 'none';
      aRep.style.display = rep ? '' : 'none';
      aAll.style.display = rep ? '' : 'none';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      const sel = getSel().text;
      if (sel) qFind.value = sel;
      else if (S.lastFind && !qFind.value) qFind.value = S.lastFind;
      setTimeout(()=>{ try{ qFind.focus(); qFind.select(); }catch(e){} }, 0);
    }

    function dialogClose(){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      focus();
    }

    function cmdOpen(mode, title, label, placeholder, value, okLabel, handler){
      menuCloseAll();
      cmdMode = String(mode || '');
      cmdHandler = typeof handler === 'function' ? handler : null;
      if (cmdT) cmdT.textContent = String(title || 'Commande');
      if (cmdL) cmdL.textContent = String(label || 'Valeur');
      if (cmdI) {
        cmdI.placeholder = String(placeholder || '…');
        cmdI.value = String(value ?? '');
      }
      if (cmdOk) cmdOk.textContent = String(okLabel || 'OK');
      cmdModal.classList.add('open');
      cmdModal.setAttribute('aria-hidden','false');
      setTimeout(()=>{ try{ cmdI.focus(); cmdI.select(); }catch(e){} }, 0);
    }

    function cmdClose(){
      cmdMode = null;
      cmdHandler = null;
      cmdModal.classList.remove('open');
      cmdModal.setAttribute('aria-hidden','true');
      focus();
    }

    function setLastFind(q){
      S.lastFind = String(q||'');
    }

    function findNext(q){
      const s = String(q||'');
      if (!s) return false;
      setLastFind(s);
      const hay = ta.value;
      const from = Math.max(ta.selectionEnd || 0, 0);
      let idx = -1;
      if (S.findCase) {
        idx = hay.indexOf(s, from);
        if (idx < 0 && from > 0) idx = hay.indexOf(s, 0);
      } else {
        const hayL = hay.toLowerCase();
        const sL = s.toLowerCase();
        idx = hayL.indexOf(sL, from);
        if (idx < 0 && from > 0) idx = hayL.indexOf(sL, 0);
      }
      if (idx < 0) return false;
      ta.focus();
      ta.setSelectionRange(idx, idx + s.length);
      return true;
    }

    function findPrev(q){
      const s = String(q||'');
      if (!s) return false;
      setLastFind(s);
      const hay = ta.value;
      const from = Math.max((ta.selectionStart || 0) - 1, 0);
      let idx = -1;
      if (S.findCase) {
        idx = hay.lastIndexOf(s, from);
        if (idx < 0) idx = hay.lastIndexOf(s);
      } else {
        const hayL = hay.toLowerCase();
        const sL = s.toLowerCase();
        idx = hayL.lastIndexOf(sL, from);
        if (idx < 0) idx = hayL.lastIndexOf(sL);
      }
      if (idx < 0) return false;
      ta.focus();
      ta.setSelectionRange(idx, idx + s.length);
      return true;
    }

    function replaceOne(findStr, repStr){
      const f = String(findStr||'');
      if (!f) return false;
      const r = String(repStr ?? '');
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      const ok = S.findCase ? (sel === f) : (sel.toLowerCase() === f.toLowerCase());
      if (!ok) return false;
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + r + ta.value.slice(e);
      const p = s + r.length;
      ta.setSelectionRange(p, p);
      syncActive();
      return true;
    }

    function escapeRegExp(s){
      return String(s||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceAll(findStr, repStr){
      const f = String(findStr||'');
      if (!f) return 0;
      const r = String(repStr ?? '');
      const flags = S.findCase ? 'g' : 'gi';
      let re;
      try{ re = new RegExp(escapeRegExp(f), flags); }catch(e){ return 0; }
      let n = 0;
      const out = ta.value.replace(re, ()=>{ n++; return r; });
      if (!n) return 0;
      ta.value = out;
      syncActive();
      return n;
    }

    function getSel(){
      const s = Math.max(0, Number(ta.selectionStart || 0));
      const e = Math.max(s, Number(ta.selectionEnd || 0));
      return { s, e, text: ta.value.slice(s, e) };
    }

    function replaceSelection(text){
      const { s, e } = getSel();
      const t = String(text ?? '');
      ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
      const p = s + t.length;
      try{ ta.focus(); ta.setSelectionRange(p, p); }catch(e){}
      syncActive();
      updateStatusSoon();
    }

    function indentSelection(outdent){
      const v = ta.value;
      const s0 = Math.max(0, Number(ta.selectionStart || 0));
      const e0 = Math.max(0, Number(ta.selectionEnd || 0));
      const start = Math.min(s0, e0);
      const end = Math.max(s0, e0);
      const endAdj = (end > 0 && v[end - 1] === '\n') ? (end - 1) : end;
      const blockStart = v.lastIndexOf('\n', start - 1) + 1;
      let blockEnd = v.indexOf('\n', endAdj);
      if (blockEnd < 0) blockEnd = v.length;
      const block = v.slice(blockStart, blockEnd);
      const lines = block.split('\n');

      if (!outdent) {
        const ind = '\t';
        const newBlock = lines.map(l => ind + l).join('\n');
        ta.value = v.slice(0, blockStart) + newBlock + v.slice(blockEnd);
        const delta = ind.length * lines.length;
        const ns = start + ind.length;
        const ne = end + delta;
        try{ ta.setSelectionRange(ns, ne); }catch(e){}
        syncActive();
        updateStatusSoon();
        return;
      }

      let removedFirst = 0;
      let removedTotal = 0;
      const newLines = lines.map((l, i)=>{
        let rm = 0;
        if (l.startsWith('\t')) rm = 1;
        else if (l.startsWith('  ')) rm = 2;
        else if (l.startsWith(' ')) rm = 1;
        if (i === 0) removedFirst = rm;
        removedTotal += rm;
        return l.slice(rm);
      });
      ta.value = v.slice(0, blockStart) + newLines.join('\n') + v.slice(blockEnd);
      const ns = Math.max(blockStart, start - removedFirst);
      const ne = Math.max(blockStart, end - removedTotal);
      try{ ta.setSelectionRange(ns, ne); }catch(e){}
      syncActive();
      updateStatusSoon();
    }

    async function clipboardWrite(text){
      const t = String(text ?? '');
      try{
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(t);
          return true;
        }
      }catch(e){}
      try{
        const tmp = document.createElement('textarea');
        tmp.value = t;
        tmp.setAttribute('readonly','');
        tmp.style.position = 'fixed';
        tmp.style.left = '-9999px';
        tmp.style.top = '0';
        document.body.appendChild(tmp);
        tmp.select();
        const ok = document.execCommand('copy');
        tmp.remove();
        try{ ta.focus(); }catch(e){}
        return !!ok;
      }catch(e){
        return false;
      }
    }

    async function clipboardRead(){
      try{
        if (navigator && navigator.clipboard && navigator.clipboard.readText) {
          return await navigator.clipboard.readText();
        }
      }catch(e){}
      return null;
    }

    async function doCopy(){
      const { s, e, text } = getSel();
      if (s === e) return;
      const ok = await clipboardWrite(text);
      if (!ok) {
        let fallbackOk = false;
        try{ ta.focus(); fallbackOk = !!document.execCommand('copy'); }catch(e){}
        if (!fallbackOk) alert('Copie bloquée par le navigateur. Utilise Ctrl+C ou le menu natif (appui long).');
      }
    }

    async function doCut(){
      const { s, e, text } = getSel();
      if (s === e) return;
      const ok = await clipboardWrite(text);
      if (!ok) {
        let fallbackOk = false;
        try{ ta.focus(); fallbackOk = !!document.execCommand('cut'); }catch(e){}
        if (!fallbackOk) alert('Couper bloqué par le navigateur. Utilise Ctrl+X ou le menu natif (appui long).');
        return;
      }
      ta.value = ta.value.slice(0, s) + ta.value.slice(e);
      try{ ta.focus(); ta.setSelectionRange(s, s); }catch(e){}
      syncActive();
      updateStatusSoon();
    }

    async function doPaste(){
      const text = await clipboardRead();
      if (text === null) {
        try{ ta.focus(); if (document.execCommand('paste')) return; }catch(e){}
        alert('Coller est bloqué par le navigateur. Utilise Ctrl+V ou le collage natif (appui long → Coller).');
        return;
      }
      replaceSelection(text);
    }

    async function handleMenuAction(act){
      if (act === 'new') newTab();
      else if (act === 'open') open();
      else if (act === 'save') save(false);
      else if (act === 'saveAs') save(true);
      else if (act === 'rename') renameTab();
      else if (act === 'duplicate') duplicateTab();
      else if (act === 'reopen') reopenClosedTab();
      else if (act === 'close') closeTab(S.active);
      else if (act === 'closeOthers') closeOthers();
      else if (act === 'closeAll') closeAllTabs();
      else if (act === 'undo') { try{ ta.focus(); document.execCommand('undo'); }catch(e){} syncActive(); updateStatusSoon(); }
      else if (act === 'redo') { try{ ta.focus(); document.execCommand('redo'); }catch(e){} syncActive(); updateStatusSoon(); }
      else if (act === 'cut') await doCut();
      else if (act === 'copy') await doCopy();
      else if (act === 'paste') await doPaste();
      else if (act === 'selectAll') { ta.focus(); ta.select(); }
      else if (act === 'find') dialogOpen('find');
      else if (act === 'replace') dialogOpen('replace');
      else if (act === 'goto') gotoLineDialog();
      else if (act === 'timeDate') timeDate();
      else if (act === 'wrap') setWrap(!S.wrap);
      else if (act === 'mono') setMono(!S.mono);
      else if (act === 'lines') setLines(!S.lines);
      else if (act === 'zoomIn') setZoom(S.zoom + 10);
      else if (act === 'zoomOut') setZoom(S.zoom - 10);
      else if (act === 'zoomReset') setZoom(100);
      else if (act === 'exportAll') exportAll();
      else if (act === 'importAll') importAll();
      else if (act === 'print') printCurrent();
      else if (act === 'about') alert('Bloc-notes — style Windows 11\\nAetherOS / NOVA');
      else if (act === 'shortcuts') alert(
        'Raccourcis:\\n' +
        'Ctrl+N nouvel onglet\\nCtrl+O ouvrir\\nCtrl+S enregistrer\\nCtrl+Shift+S enregistrer sous\\n' +
        'Ctrl+F rechercher\\nCtrl+H remplacer\\nF3 suivant\\nShift+F3 précédent\\n' +
        'Ctrl+G atteindre\\nCtrl+W fermer onglet\\nCtrl+D dupliquer onglet\\nCtrl+Shift+T rouvrir onglet\\n' +
        'Ctrl+0/+/− zoom\\nTab/Shift+Tab indenter\\nF2 renommer\\nF5 date/heure'
      );
    }

    // Wire UI
    document.getElementById('bFile').onclick = (e)=>menuToggle('file', e.currentTarget);
    document.getElementById('bEdit').onclick = (e)=>menuToggle('edit', e.currentTarget);
    document.getElementById('bView').onclick = (e)=>menuToggle('view', e.currentTarget);
    document.getElementById('bHelp').onclick = (e)=>menuToggle('help', e.currentTarget);
    document.getElementById('bTheme').onclick = ()=>setTheme(S.theme==='light'?'dark':'light');
    document.getElementById('zIn').onclick = ()=>setZoom(S.zoom + 10);
    document.getElementById('zOut').onclick = ()=>setZoom(S.zoom - 10);

    tabsEl.addEventListener('click', (e)=>{
      const x = e.target && e.target.closest ? e.target.closest('[data-x]') : null;
      if (x) { e.stopPropagation(); closeTab(x.getAttribute('data-x')); return; }
      const t = e.target && e.target.closest ? e.target.closest('[data-tab]') : null;
      if (t) switchTab(t.getAttribute('data-tab'));
    });
    tabsEl.addEventListener('keydown', (e)=>{
      const t = e.target && e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!t) return;
      const id = t.getAttribute('data-tab');
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(id); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); closeTab(id); return; }
    });

    Object.values(menus).forEach(menu=>{
      menu.addEventListener('click', (e)=>{
        const it = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (!it) return;
        const act = it.getAttribute('data-act');
        menuCloseAll();
        handleMenuAction(act);
      });
    });

    document.addEventListener('click', (e)=>{
      const inside = Object.values(menus).some(m=>m.contains(e.target));
      const isBtn = e.target && e.target.classList && e.target.classList.contains('btn');
      if (!inside && !isBtn) menuCloseAll();
    });

    if (togCase) togCase.onclick = ()=>setFindCase(!S.findCase);

    ta.addEventListener('input', ()=>{ syncActive(); updateStatusSoon(); });
    ta.addEventListener('click', updateStatusSoon);
    ta.addEventListener('keyup', updateStatusSoon);
    ta.addEventListener('select', updateStatusSoon);
    ta.addEventListener('scroll', ()=>{
      const t = activeTab();
      if (t) {
        t.scrollTop = ta.scrollTop || 0;
        t.scrollLeft = ta.scrollLeft || 0;
        persistSoon();
      }
      syncGutterScroll();
    });
    ta.addEventListener('keydown', (e)=>{
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const sel = getSel();
        if (e.shiftKey) { indentSelection(true); return; }
        if (sel.s !== sel.e && sel.text.includes('\n')) { indentSelection(false); return; }
        replaceSelection('\t');
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const s = Math.max(0, Number(ta.selectionStart || 0));
        const v = ta.value;
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const toCursor = v.slice(lineStart, s);
        const m = toCursor.match(/^[\t ]+/);
        const indent = m ? m[0] : '';
        const extra = (/\{\s*$/.test(toCursor) ? '\t' : '');
        e.preventDefault();
        replaceSelection('\n' + indent + extra);
        return;
      }
    });

    openFile.addEventListener('change', async ()=>{
      const files = Array.from(openFile.files || []);
      if (!files.length) return;
      for (const f of files) {
        const text = await f.text().catch(()=> '');
        newTab(text, f.name || 'Sans titre');
      }
      openFile.value = '';
    });

    if (importJson) importJson.addEventListener('change', async ()=>{
      const f = importJson.files && importJson.files[0] ? importJson.files[0] : null;
      if (!f) return;
      const raw = await f.text().catch(()=>'');
      let data;
      try{ data = JSON.parse(raw); }catch(e){ alert('JSON invalide.'); return; }
      const tabs = Array.isArray(data && data.tabs) ? data.tabs : null;
      if (!tabs || !tabs.length) { alert('Aucun onglet à importer.'); return; }
      const ok = confirm('Importer ce fichier va remplacer vos onglets actuels. Continuer ?');
      if (!ok) return;
      S.tabs = tabs.map(t=>({
        id: uid(),
        title: String((t && t.title) || 'Sans titre'),
        content: String((t && t.content) || ''),
        dirty: !!(t && t.dirty),
        scrollTop: 0,
        scrollLeft: 0
      }));
      S.active = S.tabs[0].id;
      ta.value = S.tabs[0].content;
      ta.scrollTop = 0;
      ta.scrollLeft = 0;
      syncGutterScroll();
      renderTabs();
      updateStatusSoon();
      updateGutterSoon();
      persistSoon();
      focus();
    });

    // Drag & drop: ouvrir des fichiers dans l’éditeur
    let dragDepth = 0;
    function isFileDrag(e){
      try{ return !!(e && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')); }catch(err){ return false; }
    }
    if (editorEl) {
      editorEl.addEventListener('dragenter', (e)=>{
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth++;
        editorEl.classList.add('drag');
      });
      editorEl.addEventListener('dragover', (e)=>{
        if (!isFileDrag(e)) return;
        e.preventDefault();
      });
      editorEl.addEventListener('dragleave', (e)=>{
        if (!isFileDrag(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) editorEl.classList.remove('drag');
      });
      editorEl.addEventListener('drop', async (e)=>{
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth = 0;
        editorEl.classList.remove('drag');
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files : []);
        for (const f of files) {
          const text = await f.text().catch(()=> '');
          newTab(text, f.name || 'Sans titre');
        }
      });
    }

    window.addEventListener('beforeunload', (e)=>{
      if (S.tabs.some(t=>t.dirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    let rzT;
    window.addEventListener('resize', ()=>{
      clearTimeout(rzT);
      rzT = setTimeout(()=>setZoom(S.zoom), 120);
    });

    dlgX.onclick = dialogClose;
    modal.addEventListener('click', (e)=>{ if (e.target === modal) dialogClose(); });
    qFind.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.shiftKey ? aPrev : aNext).click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dialogClose();
      }
    });
    qRep.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        e.preventDefault();
        aRep.click();
      }
    });

    cmdX.onclick = cmdClose;
    cmdCancel.onclick = cmdClose;
    cmdOk.onclick = ()=>{
      const v = cmdI.value;
      const h = cmdHandler;
      cmdClose();
      try{ if (h) h(v); }catch(e){}
    };
    cmdModal.addEventListener('click', (e)=>{ if (e.target === cmdModal) cmdClose(); });
    cmdI.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); cmdOk.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); cmdClose(); }
    });

    aPrev.onclick = ()=>{
      const q = qFind.value || '';
      if (!findPrev(q)) alert('Introuvable');
      updateStatusSoon();
    };
    aNext.onclick = ()=>{
      const q = qFind.value || '';
      if (!findNext(q)) alert('Introuvable');
      updateStatusSoon();
    };
    aRep.onclick = ()=>{
      const f = qFind.value || '';
      const r = qRep.value || '';
      if (replaceOne(f, r)) {
        findNext(f);
      } else {
        if (!findNext(f)) alert('Introuvable');
      }
      updateStatusSoon();
    };
    aAll.onclick = ()=>{
      const f = qFind.value || '';
      const r = qRep.value || '';
      const n = replaceAll(f, r);
      alert(n ? `${n} remplacement(s)` : 'Aucun remplacement');
      updateStatusSoon();
    };

    window.addEventListener('keydown', (e)=>{
      const k = (e.key || '').toLowerCase();
      const meta = e.ctrlKey || e.metaKey;
      if (meta && k==='n') { e.preventDefault(); newTab(); return; }
      if (meta && k==='o') { e.preventDefault(); open(); return; }
      if (meta && k==='s' && e.shiftKey) { e.preventDefault(); save(true); return; }
      if (meta && k==='s') { e.preventDefault(); save(false); return; }
      if (meta && k==='w') { e.preventDefault(); closeTab(S.active); return; }
      if (meta && k==='g') { e.preventDefault(); gotoLineDialog(); return; }
      if (meta && k==='d') { e.preventDefault(); duplicateTab(); return; }
      if (meta && k==='t' && e.shiftKey) { e.preventDefault(); reopenClosedTab(); return; }
      if (meta && (k==='=' || k==='+')) { e.preventDefault(); setZoom(S.zoom + 10); return; }
      if (meta && k==='-') { e.preventDefault(); setZoom(S.zoom - 10); return; }
      if (meta && k==='0') { e.preventDefault(); setZoom(100); return; }
      if (meta && k==='f') { e.preventDefault(); dialogOpen('find'); return; }
      if (meta && k==='h') { e.preventDefault(); dialogOpen('replace'); return; }
      if (meta && e.key === 'Tab') {
        e.preventDefault();
        const idx = S.tabs.findIndex(t=>t.id===S.active);
        if (idx >= 0 && S.tabs.length > 1) {
          const dir = e.shiftKey ? -1 : 1;
          const next = (idx + dir + S.tabs.length) % S.tabs.length;
          switchTab(S.tabs[next].id);
        }
        return;
      }
      if (e.key === 'F2') { e.preventDefault(); renameTab(); return; }
      if (e.key === 'F5') { e.preventDefault(); timeDate(); return; }
      if (e.key === 'F3') {
        e.preventDefault();
        const q = (qFind && qFind.value) ? qFind.value : (S.lastFind || '');
        if (!q) { dialogOpen('find'); return; }
        const ok = e.shiftKey ? findPrev(q) : findNext(q);
        if (!ok) alert('Introuvable');
        updateStatusSoon();
        return;
      }
      if (e.key === 'Escape') {
        menuCloseAll();
        if (modal.classList.contains('open')) dialogClose();
        if (cmdModal.classList.contains('open')) cmdClose();
      }
    });

    // Boot
    loadPrefs();
    loadState();
    renderTabs();
    const t = activeTab();
    ta.value = t ? t.content : '';
    setWrap(S.wrap);
    setMono(S.mono);
    setLines(S.lines);
    setZoom(S.zoom);
    setFindCase(S.findCase);
    updateStatus();
    updateGutter();
    syncGutterScroll();
    focus();
  