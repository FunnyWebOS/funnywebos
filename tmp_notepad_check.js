
    const LS = {
      state: 'aether_notepad_state_v1',
      theme: 'aether_notepad_theme',
      wrap: 'aether_notepad_wrap',
      mono: 'aether_notepad_mono',
      zoom: 'aether_notepad_zoom'
    };

    const tabsEl = document.getElementById('tabs');
    const ta = document.getElementById('ta');
    const stL = document.getElementById('stL');
    const stWrap = document.getElementById('stWrap');
    const kWrap = document.getElementById('kWrap');
    const kMono = document.getElementById('kMono');
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
    const aNext = document.getElementById('aNext');
    const aRep = document.getElementById('aRep');
    const aAll = document.getElementById('aAll');
    const dlgX = document.getElementById('dlgX');
    const openFile = document.getElementById('openFile');

    let S = {
      tabs: [],
      active: '',
      wrap: true,
      mono: false,
      zoom: 100,
      theme: 'dark'
    };

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
          tabs: S.tabs.map(t=>({id:t.id,title:t.title,content:t.content,dirty:!!t.dirty})),
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

    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function setZoom(z){
      S.zoom = clamp(Math.round(z), 50, 250);
      ta.style.fontSize = (15*(S.zoom/100)).toFixed(2)+'px';
      zLab.textContent = S.zoom + '%';
      try{ localStorage.setItem(LS.zoom, String(S.zoom)); }catch(e){}
    }

    function loadPrefs(){
      const theme = (localStorage.getItem(LS.theme)||'').trim();
      const wrap  = (localStorage.getItem(LS.wrap)||'').trim();
      const mono  = (localStorage.getItem(LS.mono)||'').trim();
      const zoom  = Number(localStorage.getItem(LS.zoom)||100) || 100;
      if (!theme) {
        try{ setTheme(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); }catch(e){ setTheme('dark'); }
      } else setTheme(theme);
      setWrap(wrap === '0' ? false : true);
      setMono(mono === '1');
      setZoom(zoom);
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
            dirty: !!t.dirty
          }));
          const a = String(d.active||'');
          S.active = S.tabs.find(t=>t.id===a) ? a : S.tabs[0].id;
          return;
        }
      }catch(e){}
      const id = uid();
      S.tabs = [{ id, title:'Sans titre', content:'', dirty:false }];
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
      S.active = t.id;
      ta.value = t.content;
      renderTabs();
      updateStatus();
      persistSoon();
      focus();
    }

    function newTab(text='', title='Sans titre'){
      const id = uid();
      S.tabs.push({ id, title, content:String(text||''), dirty:false });
      S.active = id;
      ta.value = String(text||'');
      renderTabs();
      updateStatus();
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
      if (S.tabs.length === 1) {
        S.tabs[0] = { id: S.tabs[0].id, title:'Sans titre', content:'', dirty:false };
        S.active = S.tabs[0].id;
        ta.value = '';
        renderTabs();
        updateStatus();
        persistSoon();
        return;
      }
      const was = S.active === id;
      S.tabs.splice(idx, 1);
      if (was) {
        const next = S.tabs[Math.min(idx, S.tabs.length-1)];
        S.active = next.id;
        ta.value = next.content;
      }
      renderTabs();
      updateStatus();
      persistSoon();
      focus();
    }

    function markDirty(on){
      const t = activeTab();
      if (!t) return;
      const next = !!on;
      if (t.dirty === next) return;
      t.dirty = next;
      renderTabs();
      persistSoon();
    }

    function syncActive(){
      const t = activeTab();
      if (!t) return;
      t.content = ta.value;
      markDirty(true);
      persistSoon();
    }

    function focus(){
      setTimeout(()=>{ try{ ta.focus(); }catch(e){} }, 0);
    }

    function menuCloseAll(){
      Object.values(menus).forEach(m=>m.classList.remove('open'));
    }

    function menuOpen(which, anchor){
      menuCloseAll();
      const m = menus[which];
      if (!m || !anchor) return;
      const r = anchor.getBoundingClientRect();
      m.style.top = Math.ceil(r.bottom + 6) + 'px';
      m.style.left = Math.ceil(r.left) + 'px';
      m.classList.add('open');
      m.setAttribute('aria-hidden','false');
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
      return /\.(txt|md)$/i.test(clean) ? clean : (clean + '.txt');
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

      if (window.showSaveFilePicker) {
        try{
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{ description:'Text', accept:{ 'text/plain':['.txt','.md'] } }]
          });
          const w = await handle.createWritable();
          await w.write(content);
          await w.close();
          t.title = suggested.replace(/\.(txt|md)$/i,'');
          t.dirty = false;
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
        t.title = name.replace(/\.(txt|md)$/i,'');
      }
      downloadText(sanitizeFilename(t.title), content);
      t.dirty = false;
      renderTabs();
      persistSoon();
    }

    function open(){
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
    }

    function updateStatus(){
      const pos = ta.selectionStart || 0;
      const before = ta.value.slice(0, pos);
      const line = before.split('\n').length;
      const col = before.length - (before.lastIndexOf('\n') + 1) + 1;
      stL.textContent = `Ln ${line}, Col ${col}`;
    }

    function dialogOpen(mode){
      const rep = mode === 'replace';
      dlgT.textContent = rep ? 'Remplacer' : 'Rechercher';
      repWrap.style.display = rep ? '' : 'none';
      aRep.style.display = rep ? '' : 'none';
      aAll.style.display = rep ? '' : 'none';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      setTimeout(()=>qFind.focus(), 0);
    }

    function dialogClose(){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
      focus();
    }

    function findNext(q){
      const s = String(q||'');
      if (!s) return false;
      const hay = ta.value;
      const from = Math.max(ta.selectionEnd || 0, 0);
      let idx = hay.indexOf(s, from);
      if (idx < 0 && from > 0) idx = hay.indexOf(s, 0);
      if (idx < 0) return false;
      ta.focus();
      ta.setSelectionRange(idx, idx + s.length);
      return true;
    }

    function replaceOne(findStr, repStr){
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel !== findStr) return false;
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + repStr + ta.value.slice(e);
      const p = s + repStr.length;
      ta.setSelectionRange(p, p);
      syncActive();
      return true;
    }

    function replaceAll(findStr, repStr){
      if (!findStr) return 0;
      const parts = ta.value.split(findStr);
      if (parts.length <= 1) return 0;
      ta.value = parts.join(repStr);
      syncActive();
      return parts.length - 1;
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
      updateStatus();
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
      updateStatus();
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
      else if (act === 'close') closeTab(S.active);
      else if (act === 'undo') { try{ ta.focus(); document.execCommand('undo'); }catch(e){} }
      else if (act === 'redo') { try{ ta.focus(); document.execCommand('redo'); }catch(e){} }
      else if (act === 'cut') await doCut();
      else if (act === 'copy') await doCopy();
      else if (act === 'paste') await doPaste();
      else if (act === 'selectAll') { ta.focus(); ta.select(); }
      else if (act === 'find') dialogOpen('find');
      else if (act === 'replace') dialogOpen('replace');
      else if (act === 'timeDate') timeDate();
      else if (act === 'wrap') setWrap(!S.wrap);
      else if (act === 'mono') setMono(!S.mono);
      else if (act === 'zoomIn') setZoom(S.zoom + 10);
      else if (act === 'zoomOut') setZoom(S.zoom - 10);
      else if (act === 'zoomReset') setZoom(100);
      else if (act === 'about') alert('Bloc-notes — style Windows 11\\nAetherOS / NOVA');
      else if (act === 'shortcuts') alert(
        'Raccourcis:\\n' +
        'Ctrl+N nouveau\\nCtrl+O ouvrir\\nCtrl+S enregistrer\\nCtrl+Shift+S enregistrer sous\\n' +
        'Ctrl+F rechercher\\nCtrl+H remplacer\\nCtrl+W fermer onglet\\nCtrl+0/+/− zoom\\nF5 date/heure'
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

    ta.addEventListener('input', ()=>{ syncActive(); updateStatus(); });
    ta.addEventListener('click', updateStatus);
    ta.addEventListener('keyup', updateStatus);

    openFile.addEventListener('change', async ()=>{
      const f = openFile.files && openFile.files[0] ? openFile.files[0] : null;
      if (!f) return;
      const text = await f.text().catch(()=> '');
      newTab(text, f.name || 'Sans titre');
      const t = activeTab();
      if (t) { t.dirty = false; renderTabs(); persistSoon(); }
    });

    dlgX.onclick = dialogClose;
    modal.addEventListener('click', (e)=>{ if (e.target === modal) dialogClose(); });

    aNext.onclick = ()=>{
      const q = qFind.value || '';
      if (!findNext(q)) alert('Introuvable');
      updateStatus();
    };
    aRep.onclick = ()=>{
      const f = qFind.value || '';
      const r = qRep.value || '';
      if (replaceOne(f, r)) {
        findNext(f);
      } else {
        if (!findNext(f)) alert('Introuvable');
      }
      updateStatus();
    };
    aAll.onclick = ()=>{
      const f = qFind.value || '';
      const r = qRep.value || '';
      const n = replaceAll(f, r);
      alert(n ? `${n} remplacement(s)` : 'Aucun remplacement');
      updateStatus();
    };

    window.addEventListener('keydown', (e)=>{
      const k = (e.key || '').toLowerCase();
      const meta = e.ctrlKey || e.metaKey;
      if (meta && k==='n') { e.preventDefault(); newTab(); return; }
      if (meta && k==='o') { e.preventDefault(); open(); return; }
      if (meta && k==='s' && e.shiftKey) { e.preventDefault(); save(true); return; }
      if (meta && k==='s') { e.preventDefault(); save(false); return; }
      if (meta && k==='w') { e.preventDefault(); closeTab(S.active); return; }
      if (meta && (k==='=' || k==='+')) { e.preventDefault(); setZoom(S.zoom + 10); return; }
      if (meta && k==='-') { e.preventDefault(); setZoom(S.zoom - 10); return; }
      if (meta && k==='0') { e.preventDefault(); setZoom(100); return; }
      if (meta && k==='f') { e.preventDefault(); dialogOpen('find'); return; }
      if (meta && k==='h') { e.preventDefault(); dialogOpen('replace'); return; }
      if (e.key === 'F5') { e.preventDefault(); timeDate(); return; }
      if (e.key === 'Escape') { menuCloseAll(); if (modal.classList.contains('open')) dialogClose(); }
    });

    // Boot
    loadPrefs();
    loadState();
    renderTabs();
    const t = activeTab();
    ta.value = t ? t.content : '';
    setWrap(S.wrap);
    setMono(S.mono);
    setZoom(S.zoom);
    updateStatus();
    focus();
  