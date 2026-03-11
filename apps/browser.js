const wm = window.parent.windowManager;
const storageKey = 'aether_browser_state_v2';

const engines = {
    duckduckgo: { label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
    google: { label: 'Google', template: 'https://www.google.com/search?q=%s' },
    bing: { label: 'Bing', template: 'https://www.bing.com/search?q=%s' }
};

const defaults = {
    tabs: [],
    activeTabId: null,
    bookmarks: [
        { title: 'AetherWiki', url: 'https://example.com' },
        { title: 'OpenAI', url: 'https://openai.com' }
    ],
    history: [],
    downloads: [],
    settings: {
        homePage: 'https://example.com',
        searchEngine: 'duckduckgo',
        openOnStartup: 'last',
        showBookmarksBar: true,
        askBeforeDownload: false,
        blockPopups: false,
        downloadFolder: '/Downloads'
    }
};

let state = null;
let tabCounter = 0;
let panelMode = 'history';
let navigationContext = null;
let navigationTimer = null;
let defaultEmptyMarkup = '';
const compatTimeoutMs = 6500;
let uvAvailable = null;
let proxyConfig = {
    provider: 'rammerhead',
    template: 'https://direct.rammerhead.org/?url=%URL_ENCODED%',
    uvOrigin: '',
    uvPrefix: '',
    uvCodec: ''
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function safeId(prefix) { tabCounter += 1; return `${prefix}_${Date.now()}_${tabCounter}`; }

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
}

function setStatus(text) { document.getElementById('status-left').textContent = text; }
function setMeta(text) { document.getElementById('status-right').textContent = text || ''; }
function clearNavigationTimer() {
    if (navigationTimer) {
        clearTimeout(navigationTimer);
        navigationTimer = null;
    }
}

function captureDefaultEmptyMarkup() {
    const empty = document.getElementById('newtab-empty');
    if (empty && !defaultEmptyMarkup) defaultEmptyMarkup = empty.innerHTML;
}

function restoreDefaultEmptyMarkup() {
    const empty = document.getElementById('newtab-empty');
    if (!empty) return;
    if (defaultEmptyMarkup) empty.innerHTML = defaultEmptyMarkup;
}

function isLikelyErrorHref(frameHref) {
    const lower = (frameHref || '').toLowerCase();
    return (
        lower === 'about:blank' ||
        lower.startsWith('chrome-error://') ||
        lower.startsWith('edge-error://') ||
        lower.startsWith('about:neterror')
    );
}

function openExternalUrl(url) {
    if (!url || url === 'about:newtab') return false;
    try {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        return !!opened;
    } catch (err) {
        return false;
    }
}

function parseEnvText(text = '') {
    const parsed = {};
    String(text)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .forEach(line => {
            const index = line.indexOf('=');
            if (index <= 0) return;
            const key = line.slice(0, index).trim();
            let value = line.slice(index + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            parsed[key] = value;
        });
    return parsed;
}

function sanitizeProxyTemplate(raw) {
    const value = String(raw || '').trim();
    if (!value) return proxyConfig.template;
    if (value.includes('%URL%') || value.includes('%URL_ENCODED%')) return value;
    return value.endsWith('/') ? `${value}%URL_ENCODED%` : `${value}/%URL_ENCODED%`;
}

function sanitizeUvPrefix(raw) {
    const value = String(raw || '/service/').trim() || '/service/';
    const withLeading = value.startsWith('/') ? value : `/${value}`;
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function sanitizeUvCodec(raw) {
    const value = String(raw || 'xor').trim().toLowerCase();
    return ['xor', 'plain', 'base64', 'none'].includes(value) ? value : 'xor';
}

function resolveTemplateProxyUrl(url, templateInput = proxyConfig.template) {
    const template = sanitizeProxyTemplate(templateInput);
    if (template.includes('%URL_ENCODED%')) return template.replace('%URL_ENCODED%', encodeURIComponent(url));
    if (template.includes('%URL%')) return template.replace('%URL%', url);
    return template.endsWith('/') ? `${template}${encodeURIComponent(url)}` : `${template}/${encodeURIComponent(url)}`;
}

function mergeProxyEnv(env = {}) {
    const provider = String(env.AETHER_BROWSER_PROXY_PROVIDER || proxyConfig.provider || 'rammerhead').trim().toLowerCase();
    proxyConfig.provider = provider === 'uv' ? 'ultraviolet' : (provider || 'rammerhead');
    proxyConfig.template = sanitizeProxyTemplate(env.AETHER_RAMMERHEAD_TEMPLATE || env.AETHER_BROWSER_PROXY_TEMPLATE || 'https://direct.rammerhead.org/?url=%URL_ENCODED%');
    proxyConfig.uvOrigin = String(env.AETHER_UV_ORIGIN || '').trim();
    proxyConfig.uvPrefix = sanitizeUvPrefix(env.AETHER_UV_PREFIX || '/service/');
    proxyConfig.uvCodec = sanitizeUvCodec(env.AETHER_UV_CODEC || 'xor');
}

function resolveUvOrigin() {
    const rawOrigin = (proxyConfig.uvOrigin || '').trim();
    if (!rawOrigin) return window.location.origin;
    try {
        return new URL(rawOrigin, window.location.href).origin;
    } catch (err) {
        return window.location.origin;
    }
}

async function detectUvAvailability() {
    uvAvailable = null;
    if ((proxyConfig.provider || '').toLowerCase() !== 'ultraviolet') {
        uvAvailable = true;
        return;
    }

    const origin = resolveUvOrigin();
    const isCrossOrigin = origin !== window.location.origin;
    if (isCrossOrigin) {
        uvAvailable = true;
        return;
    }

    const checks = ['/uv/uv.bundle.js', '/uv.bundle.js', '/uv/uv.config.js', '/uv.config.js'];
    for (const path of checks) {
        try {
            const response = await fetch(`${origin}${path}`, { cache: 'no-store' });
            if (response.ok) {
                uvAvailable = true;
                return;
            }
        } catch (err) { }
    }
    uvAvailable = false;
}

async function loadProxyConfigFromEnv() {
    // This function is the only one loading .env, let's make it global for all apps.
    if (typeof window.parent.AETHER_RUNTIME_ENV === 'undefined') {
        window.parent.AETHER_RUNTIME_ENV = {};
    }

    const candidates = ['../.env', '../env', '/.env', '/env', '.env', './.env'];
    for (const path of candidates) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) continue;
            const text = await response.text();
            const envFromFile = parseEnvText(text);
            Object.assign(window.parent.AETHER_RUNTIME_ENV, envFromFile);
            break; // Found it
        } catch (err) { }
    }

    const runtimeEnv = window.parent.AETHER_RUNTIME_ENV || {};
    const runtimeProxy = (typeof window !== 'undefined' && window.AETHER_BROWSER_PROXY_CONFIG)
        ? window.AETHER_BROWSER_PROXY_CONFIG
        : {};
    mergeProxyEnv({
        ...runtimeEnv,
        AETHER_BROWSER_PROXY_PROVIDER: runtimeProxy.provider || runtimeEnv.AETHER_BROWSER_PROXY_PROVIDER,
        AETHER_BROWSER_PROXY_TEMPLATE: runtimeProxy.template || runtimeEnv.AETHER_BROWSER_PROXY_TEMPLATE,
        AETHER_UV_ORIGIN: runtimeProxy.uvOrigin || runtimeEnv.AETHER_UV_ORIGIN,
        AETHER_UV_PREFIX: runtimeProxy.uvPrefix || runtimeEnv.AETHER_UV_PREFIX,
        AETHER_UV_CODEC: runtimeProxy.uvCodec || runtimeEnv.AETHER_UV_CODEC
    });
}

function uvEncodeUrl(url, codec = 'xor') {
    if (!url) return '';
    const value = String(url);
    if (codec === 'none') return value;
    if (codec === 'plain') return encodeURIComponent(value);
    if (codec === 'base64') return btoa(encodeURIComponent(value));
    let result = '';
    for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        result += i % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char;
    }
    return encodeURIComponent(result);
}

function resolveUltravioletUrl(url) {
    if (!/^https?:\/\//i.test(url)) return url;
    const prefix = sanitizeUvPrefix(proxyConfig.uvPrefix);
    const origin = (resolveUvOrigin() || '').replace(/\/+$/, '');
    const base = origin || '';
    const encoded = uvEncodeUrl(url, sanitizeUvCodec(proxyConfig.uvCodec));
    return `${base}${prefix}${encoded}`;
}

function loadState() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (err) { parsed = null; }
    state = {
        ...clone(defaults),
        ...(parsed || {}),
        settings: { ...clone(defaults.settings), ...((parsed && parsed.settings) || {}) }
    };

    if (!Array.isArray(state.tabs) || state.tabs.length === 0 || state.settings.openOnStartup === 'newtab') {
        state.tabs = [];
        addTabModel(state.settings.openOnStartup === 'home' ? state.settings.homePage : 'about:newtab');
    } else {
        state.tabs = state.tabs.map(tab => ({
            id: tab.id || safeId('tab'),
            title: tab.title || 'Nouvel onglet',
            url: tab.url || 'about:newtab',
            history: Array.isArray(tab.history) && tab.history.length ? tab.history : [tab.url || 'about:newtab'],
            historyIndex: typeof tab.historyIndex === 'number' ? tab.historyIndex : Math.max(0, (tab.history || []).length - 1),
            loading: false
        }));
        state.activeTabId = state.tabs.some(tab => tab.id === state.activeTabId) ? state.activeTabId : state.tabs[0].id;
    }
}

function saveState() {
    const payload = {
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        bookmarks: state.bookmarks.slice(0, 100),
        history: state.history.slice(0, 400),
        downloads: state.downloads.slice(0, 200),
        settings: state.settings
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
}

function activeTab() {
    return state.tabs.find(tab => tab.id === state.activeTabId) || state.tabs[0];
}

function titleFromUrl(url) {
    if (url === 'about:newtab') return 'Nouvel onglet';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (err) { return 'Page'; }
}

function normalizeInput(rawInput) {
    const value = (rawInput || '').trim();
    if (!value || value === 'about:newtab') return 'about:newtab';
    if (/^about:/i.test(value)) return value.toLowerCase();
    const hasProtocol = /^[a-zA-Z]+:\/\//.test(value);
    const looksLikeUrl = hasProtocol || value.includes('.') || value.startsWith('localhost');
    if (!looksLikeUrl || value.includes(' ')) {
        const engine = engines[state.settings.searchEngine] || engines.duckduckgo;
        return engine.template.replace('%s', encodeURIComponent(value));
    }
    const attempt = hasProtocol ? value : `https://${value}`;
    try {
        const parsed = new URL(attempt);
        if (!['http:', 'https:'].includes(parsed.protocol)) return state.settings.homePage;
        return parsed.href;
    } catch (err) {
        return state.settings.homePage;
    }
}

function resolveProxyUrl(url) {
    if (!/^https?:\/\//i.test(url)) return url;
    return resolveTemplateProxyUrl(url, proxyConfig.template);
}

function buildNavigationCandidates(url) {
    const proxy = resolveProxyUrl(url);
    return proxy ? [proxy] : [url];
}

function showBlockedFallback(url, reason, autoOpened = false) {
    const frame = document.getElementById('frame');
    const empty = document.getElementById('newtab-empty');
    if (!frame || !empty) return;

    frame.style.display = 'none';
    restoreDefaultEmptyMarkup();
    empty.innerHTML = `
        <h2>Connexion refusee dans l'iframe</h2>
        <p>${escapeHtml(reason || "Ce site bloque l'affichage integre dans Aether Browser.")}</p>
        <p>Utilise l'ouverture externe pour une compatibilite totale.</p>
        <div class="ri-actions"><button class="tiny" id="compat-open-external-btn">Ouvrir le site</button></div>
        <div class="ri-sub">${escapeHtml(url)}</div>
    `;
    empty.style.display = 'flex';

    const button = document.getElementById('compat-open-external-btn');
    if (button) {
        button.addEventListener('click', () => {
            const opened = openExternalUrl(url);
            setStatus(opened ? 'Ouvert dans le navigateur externe' : 'Popup bloquee. Autorise les popups puis reessaie.');
        });
    }

    if (autoOpened) setStatus('Mode force: site ouvert dans le navigateur externe');
    else setStatus('Le site bloque le chargement integre');
    setMeta(url);
}

function isProxyFailureContent(frame, context, frameUrl) {
    if (!context || !Array.isArray(context.candidates)) return false;
    const candidate = context.candidates[context.index];
    if (!candidate || candidate === context.url) return false;

    try {
        const doc = frame.contentDocument;
        const text = String((doc && doc.body && doc.body.innerText) || '').trim().toLowerCase();
        const title = String((doc && doc.title) || '').trim().toLowerCase();
        const prefix = sanitizeUvPrefix(proxyConfig.uvPrefix).toLowerCase();
        const frameLower = String(frameUrl || '').toLowerCase();

        if (!text && !title) return false;
        if (text.includes(`cannot get ${prefix}`) || text.includes('cannot get /service/')) return true;
        if (text.includes('route not found')) return true;
        if ((title.includes('404') || text.includes('404 not found')) && frameLower.includes(prefix)) return true;
    } catch (err) { }

    return false;
}

function startNavigationAttempt(context) {
    if (!context || !Array.isArray(context.candidates) || !context.candidates.length) return;
    const frame = document.getElementById('frame');
    if (!frame) return;
    const candidate = context.candidates[context.index];
    const usingProxy = candidate !== context.url;
    const total = context.candidates.length;
    frame.src = candidate;
    setStatus(usingProxy
        ? `Chargement compatibilite (${context.index + 1}/${total})...`
        : `Chargement (${context.index + 1}/${total})...`);
    setMeta(usingProxy ? `${context.url} | proxy` : context.url);

    clearNavigationTimer();
    const token = context.token;
    navigationTimer = setTimeout(() => {
        if (!navigationContext || navigationContext.token !== token) return;
        const nextIndex = navigationContext.index + 1;
        if (nextIndex < navigationContext.candidates.length) {
            navigationContext.index = nextIndex;
            setStatus('Tentative alternative...');
            startNavigationAttempt(navigationContext);
            return;
        }

        const failedUrl = navigationContext.url;
        const autoOpened = false;
        navigationContext = null;
        clearNavigationTimer();

        const tab = activeTab();
        if (tab) {
            tab.loading = false;
            saveState();
            renderTabs();
        }
        showBlockedFallback(failedUrl, "Le delai de chargement est depasse. Le site refuse probablement l'integration iframe.", autoOpened);
    }, compatTimeoutMs);
}

function addTabModel(url = 'about:newtab') {
    const normalized = normalizeInput(url);
    const tab = {
        id: safeId('tab'),
        title: titleFromUrl(normalized),
        url: normalized,
        history: [normalized],
        historyIndex: 0,
        loading: false
    };
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    return tab;
}

function pushHistory(url, title) {
    if (url === 'about:newtab') return;
    const last = state.history[0];
    const now = Date.now();
    if (last && last.url === url && Math.abs(last.time - now) < 12000) return;
    state.history.unshift({ id: safeId('h'), url, title, time: now });
}

function navigate(inputValue, updateField = true) {
    const tab = activeTab();
    if (!tab) return;
    const url = normalizeInput(inputValue);
    tab.url = url;
    tab.title = titleFromUrl(url);
    tab.loading = url !== 'about:newtab';
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
    pushHistory(url, tab.title);
    saveState();
    renderAll();
    if (updateField) {
        document.getElementById('address').value = url;
        hideSuggestions();
    }
    loadFrame(url);
}

function loadFrameLegacy(url) {
    const frame = document.getElementById('frame');
    const empty = document.getElementById('newtab-empty');
    if (url === 'about:newtab') {
        frame.style.display = 'none';
        empty.style.display = 'flex';
        setStatus('Nouvel onglet prêt');
        setMeta('');
        return;
    }
    empty.style.display = 'none';
    frame.style.display = 'block';
    const frameUrl = url;
    frame.src = frameUrl;
    const usingProxy = frameUrl !== url;
    setStatus(usingProxy ? 'Chargement (mode compatibilité)...' : 'Chargement...');
    setMeta(usingProxy ? `${url} • proxy` : url);
}

function createTab(url = 'about:newtab') {
    addTabModel(url);
    saveState();
    renderAll();
    loadFrame(activeTab().url);
    setStatus('Nouvel onglet créé');
}

function closeTab(tabId, event) {
    if (event) event.stopPropagation();
    const index = state.tabs.findIndex(tab => tab.id === tabId);
    if (index < 0) return;
    const wasActive = tabId === state.activeTabId;
    state.tabs.splice(index, 1);
    if (state.tabs.length === 0) addTabModel('about:newtab');
    if (wasActive) state.activeTabId = state.tabs[Math.max(0, index - 1)].id;
    saveState();
    renderAll();
    loadFrame(activeTab().url);
}

function selectTab(tabId) {
    if (!state.tabs.some(tab => tab.id === tabId)) return;
    state.activeTabId = tabId;
    saveState();
    renderAll();
    loadFrame(activeTab().url);
}

function goBackTab() {
    const tab = activeTab();
    if (!tab || tab.historyIndex <= 0) return;
    tab.historyIndex -= 1;
    tab.url = tab.history[tab.historyIndex];
    saveState();
    renderAll();
    loadFrame(tab.url);
}

function goForwardTab() {
    const tab = activeTab();
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    tab.historyIndex += 1;
    tab.url = tab.history[tab.historyIndex];
    saveState();
    renderAll();
    loadFrame(tab.url);
}

function togglePanel() {
    document.getElementById('panel').classList.toggle('hidden');
}

function switchPanel(mode) {
    panelMode = mode;
    document.querySelectorAll('.panel-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.panel === mode));
    renderPanel();
}

function renderTabs() {
    const host = document.getElementById('tabs');
    host.innerHTML = state.tabs.map(tab => `
        <div class="tab ${tab.id === state.activeTabId ? 'active' : ''}" onclick="selectTab('${tab.id}')">
            <div class="tab-title">${escapeHtml(tab.loading ? `⏳ ${tab.title}` : tab.title)}</div>
            <div class="tab-x" onclick="closeTab('${tab.id}', event)">✕</div>
        </div>
    `).join('');
}

function renderBookmarks() {
    const bar = document.getElementById('bookmarks');
    if (!state.settings.showBookmarksBar) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = state.bookmarks.map(bookmark => `
        <div class="bookmark" onclick="navigate('${escapeAttr(bookmark.url)}')">${escapeHtml(bookmark.title || bookmark.url)}</div>
    `).join('') || '<div class="ri-sub">Aucun favori</div>';
}

function toggleBookmarkCurrent() {
    const tab = activeTab();
    if (!tab || tab.url === 'about:newtab') return;
    const index = state.bookmarks.findIndex(bookmark => bookmark.url === tab.url);
    if (index >= 0) {
        state.bookmarks.splice(index, 1);
        setStatus('Favori retiré');
    } else {
        state.bookmarks.unshift({ title: tab.title, url: tab.url });
        state.bookmarks = state.bookmarks.slice(0, 100);
        setStatus('Favori ajouté');
    }
    saveState();
    renderBookmarks();
    renderPanel();
}

function quickDownload() {
    const tab = activeTab();
    if (!tab || tab.url === 'about:newtab') return;
    const now = Date.now();
    let host = 'page';
    try { host = new URL(tab.url).hostname.replace(/[^\w.-]/g, '_'); } catch (err) { }
    let fileName = `${host}_${now}.url`;
    if (state.settings.askBeforeDownload) {
        const asked = prompt('Nom du fichier de téléchargement :', fileName);
        if (!asked) return;
        fileName = asked.endsWith('.url') ? asked : `${asked}.url`;
    }
    const folder = state.settings.downloadFolder || '/Downloads';
    const path = `${folder}/${fileName}`;
    const item = {
        id: safeId('d'),
        url: tab.url,
        title: tab.title,
        time: now,
        status: 'Terminé',
        path
    };
    try {
        if (wm && typeof wm.vfs_write === 'function') wm.vfs_write(path, tab.url, 'file');
    } catch (err) {
        item.status = 'Échec';
    }
    state.downloads.unshift(item);
    state.downloads = state.downloads.slice(0, 200);
    saveState();
    renderPanel();
    setStatus(item.status === 'Terminé' ? `Téléchargé: ${fileName}` : 'Téléchargement échoué');
}

function openExternalCurrent() {
    const tab = activeTab();
    if (!tab || tab.url === 'about:newtab') return;
    const opened = openExternalUrl(tab.url);
    setStatus(opened ? 'Ouvert dans le navigateur externe' : 'Popup bloquee. Autorise les popups puis reessaie.');
}

function clearHistory() {
    state.history = [];
    saveState();
    renderPanel();
    setStatus('Historique vidé');
}

function clearDownloads() {
    state.downloads = [];
    saveState();
    renderPanel();
    setStatus('Téléchargements vidés');
}

function removeBookmark(url) {
    state.bookmarks = state.bookmarks.filter(bookmark => bookmark.url !== url);
    saveState();
    renderBookmarks();
    renderPanel();
}

function buildHistoryPanel() {
    const entries = state.history.map(item => `
        <div class="row-item">
            <div class="ri-title">${escapeHtml(item.title || item.url)}</div>
            <div class="ri-sub">${escapeHtml(item.url)}</div>
            <div class="ri-sub">${new Date(item.time).toLocaleString('fr-FR')}</div>
            <div class="ri-actions"><button class="tiny" onclick="navigate('${escapeAttr(item.url)}')">Ouvrir</button></div>
        </div>
    `).join('');
    return `
        <div class="card">
            <h4>Historique complet</h4>
            <div class="ri-actions" style="margin-bottom:8px;">
                <button class="tiny danger" onclick="clearHistory()">Vider l'historique</button>
            </div>
            ${entries || '<div class="ri-sub">Aucune navigation enregistrée.</div>'}
        </div>
    `;
}

function buildDownloadsPanel() {
    const entries = state.downloads.map(item => `
        <div class="row-item">
            <div class="ri-title">${escapeHtml(item.title || 'Téléchargement')}</div>
            <div class="ri-sub">${escapeHtml(item.url)}</div>
            <div class="ri-sub">${item.status} • ${new Date(item.time).toLocaleString('fr-FR')}</div>
            ${item.path ? `<div class="ri-sub">Fichier: ${escapeHtml(item.path)}</div>` : ''}
            <div class="ri-actions">
                <button class="tiny" onclick="navigate('${escapeAttr(item.url)}')">Ouvrir</button>
            </div>
        </div>
    `).join('');
    return `
        <div class="card">
            <h4>Téléchargements</h4>
            <div class="ri-actions" style="margin-bottom:8px;">
                <button class="tiny" onclick="quickDownload()">Télécharger la page actuelle</button>
                <button class="tiny danger" onclick="clearDownloads()">Tout supprimer</button>
            </div>
            ${entries || '<div class="ri-sub">Aucun téléchargement.</div>'}
        </div>
    `;
}

function saveBrowserSettings() {
    state.settings.homePage = normalizeInput(document.getElementById('set-home').value || 'https://example.com');
    state.settings.searchEngine = document.getElementById('set-engine').value;
    state.settings.openOnStartup = document.getElementById('set-startup').value;
    state.settings.showBookmarksBar = document.getElementById('set-bookmarks').value === 'true';
    state.settings.askBeforeDownload = document.getElementById('set-ask').value === 'true';
    state.settings.blockPopups = document.getElementById('set-popups').value === 'true';
    state.settings.downloadFolder = document.getElementById('set-folder').value.trim() || '/Downloads';
    saveState();
    renderBookmarks();
    renderPanel();
    setStatus('Paramètres navigateur enregistrés');
    loadFrame(activeTab().url);
}

function resetBrowserSettings() {
    state.settings = clone(defaults.settings);
    saveState();
    renderBookmarks();
    renderPanel();
    setStatus('Paramètres réinitialisés');
}

function buildSettingsPanel() {
    const s = state.settings;
    const bookmarksRows = state.bookmarks.map(bookmark => `
        <div class="row-item">
            <div class="ri-title">${escapeHtml(bookmark.title || bookmark.url)}</div>
            <div class="ri-sub">${escapeHtml(bookmark.url)}</div>
            <div class="ri-actions">
                <button class="tiny" onclick="navigate('${escapeAttr(bookmark.url)}')">Ouvrir</button>
                <button class="tiny danger" onclick="removeBookmark('${escapeAttr(bookmark.url)}')">Supprimer</button>
            </div>
        </div>
    `).join('') || '<div class="ri-sub">Aucun favori.</div>';

    return `
        <div class="card">
            <h4>Paramètres complets</h4>
            <div class="set-row"><label>Page d'accueil</label><input id="set-home" value="${escapeAttr(s.homePage)}"></div>
            <div class="set-row"><label>Moteur de recherche</label>
                <select id="set-engine">
                    <option value="duckduckgo" ${s.searchEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
                    <option value="google" ${s.searchEngine === 'google' ? 'selected' : ''}>Google</option>
                    <option value="bing" ${s.searchEngine === 'bing' ? 'selected' : ''}>Bing</option>
                </select>
            </div>
            <div class="set-row"><label>Au démarrage</label>
                <select id="set-startup">
                    <option value="last" ${s.openOnStartup === 'last' ? 'selected' : ''}>Restaurer la session</option>
                    <option value="home" ${s.openOnStartup === 'home' ? 'selected' : ''}>Page d'accueil</option>
                    <option value="newtab" ${s.openOnStartup === 'newtab' ? 'selected' : ''}>Nouvel onglet</option>
                </select>
            </div>
            <div class="set-row"><label>Barre favoris</label><select id="set-bookmarks"><option value="true" ${s.showBookmarksBar ? 'selected' : ''}>Afficher</option><option value="false" ${!s.showBookmarksBar ? 'selected' : ''}>Masquer</option></select></div>
            <div class="set-row"><label>Proxy</label><input value="https://direct.rammerhead.org/" disabled></div>
            <div class="set-row"><label>Demander avant téléchargement</label><select id="set-ask"><option value="false" ${!s.askBeforeDownload ? 'selected' : ''}>Non</option><option value="true" ${s.askBeforeDownload ? 'selected' : ''}>Oui</option></select></div>
            <div class="set-row"><label>Bloquer popups (iframe)</label><select id="set-popups"><option value="false" ${!s.blockPopups ? 'selected' : ''}>Non</option><option value="true" ${s.blockPopups ? 'selected' : ''}>Oui</option></select></div>
            <div class="set-row"><label>Dossier téléchargement VFS</label><input id="set-folder" value="${escapeAttr(s.downloadFolder)}"></div>
            <div class="ri-actions">
                <button class="tiny" onclick="saveBrowserSettings()">Enregistrer</button>
                <button class="tiny danger" onclick="resetBrowserSettings()">Réinitialiser</button>
            </div>
        </div>
        <div class="card"><h4>Favoris enregistrés</h4>${bookmarksRows}</div>
    `;
}

function renderPanel() {
    const body = document.getElementById('panel-body');
    if (panelMode === 'downloads') body.innerHTML = buildDownloadsPanel();
    else if (panelMode === 'settings') body.innerHTML = buildSettingsPanel();
    else body.innerHTML = buildHistoryPanel();
}

function renderAll() {
    renderTabs();
    renderBookmarks();
    renderPanel();
    const tab = activeTab();
    if (!tab) return;
    document.getElementById('address').value = tab.url;
    setMeta(tab.url === 'about:newtab' ? '' : tab.url);
}

function buildSuggestions(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const list = [];
    const direct = normalizeInput(query);
    list.push({ title: `Aller à ${query}`, url: direct });
    state.bookmarks.forEach(item => {
        if ((item.title || '').toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) list.push({ title: item.title || item.url, url: item.url });
    });
    state.history.forEach(item => {
        if ((item.title || '').toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) list.push({ title: item.title || item.url, url: item.url });
    });
    const out = [];
    const seen = new Set();
    for (const item of list) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
        if (out.length >= 8) break;
    }
    return out;
}

function showSuggestions(query) {
    const data = buildSuggestions(query);
    const box = document.getElementById('suggestions');
    if (!data.length) { hideSuggestions(); return; }
    box.innerHTML = data.map(item => `
        <div class="s-item" onclick="navigate('${escapeAttr(item.url)}')">
            <div class="s-title">${escapeHtml(item.title)}</div>
            <div class="s-url">${escapeHtml(item.url)}</div>
        </div>
    `).join('');
    box.style.display = 'block';
}

function hideSuggestions() {
    const box = document.getElementById('suggestions');
    box.innerHTML = '';
    box.style.display = 'none';
}

function loadFrame(url) {
    const frame = document.getElementById('frame');
    const empty = document.getElementById('newtab-empty');
    if (!frame || !empty) return;

    clearNavigationTimer();
    navigationContext = null;
    captureDefaultEmptyMarkup();

    if (url === 'about:newtab') {
        frame.style.display = 'none';
        restoreDefaultEmptyMarkup();
        empty.style.display = 'flex';
        setStatus('Nouvel onglet pret');
        setMeta('');
        return;
    }

    empty.style.display = 'none';
    frame.style.display = 'block';
    const candidates = buildNavigationCandidates(url);
    navigationContext = {
        token: safeId('nav'),
        url,
        candidates,
        index: 0
    };
    startNavigationAttempt(navigationContext);
}

function setupEvents() {
    const address = document.getElementById('address');
    document.getElementById('new-tab-btn').addEventListener('click', () => createTab('about:newtab'));
    document.getElementById('back-btn').addEventListener('click', goBackTab);
    document.getElementById('forward-btn').addEventListener('click', goForwardTab);
    document.getElementById('reload-btn').addEventListener('click', () => loadFrame(activeTab().url));
    document.getElementById('home-btn').addEventListener('click', () => navigate(state.settings.homePage));
    document.getElementById('bookmark-btn').addEventListener('click', toggleBookmarkCurrent);
    document.getElementById('download-btn').addEventListener('click', quickDownload);
    document.getElementById('external-btn').addEventListener('click', openExternalCurrent);
    document.getElementById('panel-btn').addEventListener('click', togglePanel);

    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
    });

    address.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') navigate(address.value, true);
    });
    address.addEventListener('input', () => showSuggestions(address.value));
    address.addEventListener('focus', () => showSuggestions(address.value));

    document.addEventListener('click', (event) => {
        if (event.target.tagName === 'BODY' || event.target.tagName === 'HTML') {
            if (!event.target.closest('.address-wrap')) hideSuggestions();
        }
    });

    const frame = document.getElementById('frame');
    frame.addEventListener('load', () => {
        const tab = activeTab();
        if (!tab) return;
        const context = navigationContext;
        clearNavigationTimer();
        let frameUrl = '';
        let readableFrameUrl = false;
        try {
            frameUrl = frame.contentWindow.location.href;
            readableFrameUrl = true;
        } catch (err) { }
        if (context && readableFrameUrl && isLikelyErrorHref(frameUrl)) {
            const nextIndex = context.index + 1;
            if (nextIndex < context.candidates.length) {
                navigationContext.index = nextIndex;
                setStatus('Tentative alternative...');
                startNavigationAttempt(navigationContext);
                return;
            }

            const failedUrl = context.url;
            const autoOpened = false;
            navigationContext = null;
            tab.loading = false;
            saveState();
            renderTabs();
            showBlockedFallback(failedUrl, "Le site refuse la connexion dans l'iframe.", autoOpened);
            return;
        }
        if (context && isProxyFailureContent(frame, context, frameUrl)) {
            const nextIndex = context.index + 1;
            if (nextIndex < context.candidates.length) {
                navigationContext.index = nextIndex;
                setStatus('Proxy indisponible, tentative alternative...');
                startNavigationAttempt(navigationContext);
                return;
            }
        }
        navigationContext = null;
        tab.loading = false;
        if (context && context.url) tab.url = context.url;
        else if (frameUrl && !isLikelyErrorHref(frameUrl)) tab.url = frameUrl;
        tab.title = titleFromUrl(tab.url);
        saveState();
        renderTabs();
        document.getElementById('address').value = tab.url;
        setStatus('Chargement terminé');
        setMeta(tab.url);
    });

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
            event.preventDefault();
            address.focus();
            address.select();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
            event.preventDefault();
            createTab('about:newtab');
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
            event.preventDefault();
            closeTab(activeTab().id);
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
            event.preventDefault();
            document.getElementById('panel').classList.remove('hidden');
            switchPanel('history');
        }
    });
}

async function boot() {
    await loadProxyConfigFromEnv();
    await detectUvAvailability();
    loadState();
    renderAll();
    setupEvents();
    const tab = activeTab();
    if (tab) loadFrame(tab.url);
}

boot();
