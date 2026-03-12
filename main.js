class WindowManager {
    constructor() {
        this.windows = new Map();
        this.zIndexCounter = 100;
        this.activeWindows = {};
        this.devApps = {};
        this.devUrls = {};

        // System State
        this.accounts = {};
        this.currentAccount = null;
        this.sessionID = null;

        // Runtime User Data
        this.userName = "";
        this.pin = "";
        this.profilePic = "";
        this.wallpaper = "var(--bg-image)";
        this.theme = (() => {
            try {
                const raw = localStorage.getItem('aether_theme');
                return raw === 'light' ? 'light' : 'dark';
            } catch (err) {
                return 'dark';
            }
        })();
        this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.timeFormat = "24h";
        this.accessibility = this.getDefaultAccessibility();
        this.uiPreferences = this.getDefaultUIPreferences();
        this.vfs = {};
        this.installedApps = [];
        this.activeWidgets = []; // V3: Track widgets
        this.customApps = JSON.parse(localStorage.getItem('aether_custom_apps') || '[]'); // V3.1: Local AI Apps
        this.pathPickerState = null;

        this.sysVersion = "AetherOS v3.0 - Singularity";
        this.releaseVersion = "3.0.0";
        this.releaseHighlights = [
            {
                icon: "🤖",
                title: "Support APK (Bêta)",
                description: "Installez des fichiers .apk directement. Le sous-système Android gère la compatibilité mobile."
            },
            {
                icon: "🧩",
                title: "Widgets Bureau",
                description: "Personnalisez votre espace avec des widgets météo, horloge et système interactifs."
            },
            {
                icon: "🎨",
                title: "Design V3",
                description: "Transparence corrigée, horloge taskbar ajustée et nouvelles animations fluides."
            },
            {
                icon: "🚀",
                title: "Performance",
                description: "Nouveau moteur de recherche SpotNode et gestionnaire de fichiers optimisé."
            }
        ];
        this.appsRegistry = [];
        this.setupMode = 'existing';
        this.supabaseConfig = this.loadSupabaseConfig();
        this.supabaseSchemaProfile = null;
        this.storeSyncInterval = null;
        this.storeSyncInFlight = false;
        this.lastStoreSyncFingerprint = '';
        this.storeRemoteReady = null;
        this.accountProfileRemoteReady = null;
        this.accountCloudSyncTimer = null;
        this.accountCloudHydrationInFlight = false;
        this.groqApiKey = this.getStoredGroqApiKey();
        this.immersiveMode = false;
        this.keyboardLockActive = false;
        this.loginClockInterval = null;

        this.setTheme(this.theme);
        this.initOS();
        this.injectSystemStyles(); // V3 CSS Fixes

        window.addEventListener('message', (e) => {
            if (e.data.type === 'OS_VFS_WRITE') {
                this.vfs_write(e.data.path, e.data.content, e.data.nodeType);
            } else if (e.data.type === 'OS_VFS_DELETE') {
                this.vfs_delete(e.data.path);
            } else if (e.data.type === 'OS_RESOLVE_PATH_PICKER') {
                this.resolvePathPicker(e.data.requestId, e.data.path);
            }
        });

        window.addEventListener('resize', () => {
            this.applyUIPreferences();
            this.refreshViewportProfile();
            this.fitWindowsToViewport();
        });

        document.addEventListener('fullscreenchange', () => {
            this.handleFullscreenStateChange();
        });

        document.addEventListener('click', (event) => {
            const login = document.getElementById('login-overlay');
            if (!login || login.style.display === 'none') return;
            if (event.target.closest('#lockscreen-access-panel') || event.target.closest('.lockscreen-corner-btn')) return;
            this.closeLockscreenAccessibility();
        });
    }

    // V3: Injection de styles correctifs pour répondre aux demandes (Horloge, Transparence, Stretch)
    injectSystemStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* Fix Horloge Taskbar */
            .system-tray {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 20px !important;
                height: 40px !important;
                bottom: 20px !important;
                right: 20px !important;
                border-radius: 20px !important;
                z-index: 5000 !important;
            }
            
            /* Fix Transparence Fenêtres (Glass bleu opaque) */
            .window {
                background: var(--glass-bg) !important;
                backdrop-filter: blur(20px) saturate(180%) !important;
                border: 1px solid var(--glass-border) !important;
                box-shadow: var(--glass-shadow) !important;
            }
            
            /* Fix App Stretching & Browser */
            .window-content iframe {
                width: 100% !important;
                height: 100% !important;
                display: block !important;
            }

            /* Widgets Container */
            #desktop-widgets {
                position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
            }
            .widget { 
                pointer-events: auto; position: absolute; background: var(--glass-bg); backdrop-filter: blur(20px); padding: 20px; border-radius: 20px; color: var(--text-main); border: 1px solid var(--glass-border); transition: transform 0.1s, background 0.3s; cursor: grab; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .widget:active { cursor: grabbing; transform: scale(1.02); background: rgba(255, 255, 255, 0.12); z-index: 10; }
        `;
        document.head.appendChild(style);
    }

    async initOS() {
        await this.loadSupabaseConfigFromEnv();
        this.refreshViewportProfile();
        this.loadAccounts();
        await this.fetchAppsRegistry();
        this.startStoreSync();
    }

    getReleaseStorageKey() {
        return `aether_whats_new_hidden_${this.releaseVersion}`;
    }

    getPlatformLabel() {
        const ua = navigator.userAgent || "";
        if (/Android/i.test(ua)) return "Android";
        if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
        if (/Windows/i.test(ua)) return "Windows";
        if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
        if (/Linux/i.test(ua)) return "Linux";
        return "Web";
    }

    getViewportProfile() {
        const width = window.innerWidth || 1280;
        if (width <= 700) return "mobile";
        if (width <= 1100) return "tablet";
        return "desktop";
    }

    refreshViewportProfile() {
        const body = document.body;
        if (!body) return;
        const profile = this.getViewportProfile();
        const platform = this.getPlatformLabel();
        const platformClass = platform.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        body.classList.remove('viewport-mobile', 'viewport-tablet', 'viewport-desktop');
        body.classList.add(`viewport-${profile}`);

        Array.from(body.classList)
            .filter(cn => cn.startsWith('platform-'))
            .forEach(cn => body.classList.remove(cn));
        body.classList.add(`platform-${platformClass}`);

        const platformLabel = document.getElementById('lockscreen-platform');
        if (platformLabel) platformLabel.textContent = platform;

        const viewportLabel = document.getElementById('lockscreen-viewport');
        if (viewportLabel) {
            const friendly = profile.charAt(0).toUpperCase() + profile.slice(1);
            viewportLabel.textContent = `${friendly} ${window.innerWidth}x${window.innerHeight}`;
        }
    }

    updateLockscreenClock() {
        const timeEl = document.getElementById('lockscreen-live-time');
        const dateEl = document.getElementById('lockscreen-live-date');
        if (!timeEl || !dateEl) return;

        const now = new Date();
        const timeOptions = {
            timeZone: this.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: this.timeFormat === '12h'
        };
        const dateOptions = {
            timeZone: this.timeZone,
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        };

        timeEl.textContent = now.toLocaleTimeString('fr-FR', timeOptions);
        dateEl.textContent = now.toLocaleDateString('fr-FR', dateOptions);
    }

    startLockscreenClock() {
        this.stopLockscreenClock();
        this.updateLockscreenClock();
        this.loginClockInterval = setInterval(() => this.updateLockscreenClock(), 1000);
    }

    stopLockscreenClock() {
        if (this.loginClockInterval) {
            clearInterval(this.loginClockInterval);
            this.loginClockInterval = null;
        }
    }

    toggleLockscreenAccessibility(event) {
        if (event) event.stopPropagation();
        const panel = document.getElementById('lockscreen-access-panel');
        const button = event && event.currentTarget ? event.currentTarget : document.querySelector('.lockscreen-corner-btn');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        if (button) button.classList.toggle('active', isOpen);
    }

    closeLockscreenAccessibility() {
        const panel = document.getElementById('lockscreen-access-panel');
        const button = document.querySelector('.lockscreen-corner-btn');
        if (panel) panel.classList.remove('open');
        if (button) button.classList.remove('active');
    }

    syncLockscreenAccessibilityUi() {
        const narrator = document.getElementById('lockscreen-tool-narrator');
        const magnifier = document.getElementById('lockscreen-tool-magnifier');
        const contrast = document.getElementById('lockscreen-tool-contrast');
        if (narrator) narrator.textContent = this.accessibility && this.accessibility.narrator ? 'On' : 'Off';
        if (magnifier) magnifier.textContent = this.accessibility && this.accessibility.magnifier ? 'On' : 'Off';
        if (contrast) contrast.textContent = this.accessibility && this.accessibility.highContrast ? 'On' : 'Off';
        const login = document.getElementById('login-overlay');
        if (login) login.classList.toggle('lockscreen-magnifier', !!(this.accessibility && this.accessibility.magnifier));
    }

    toggleLockscreenTool(tool) {
        this.accessibility = { ...this.getDefaultAccessibility(), ...(this.accessibility || {}) };
        if (tool === 'contrast') {
            this.accessibility.highContrast = !this.accessibility.highContrast;
            this.applyAccessibilitySettings();
        } else if (tool === 'magnifier') {
            this.accessibility.magnifier = !this.accessibility.magnifier;
        } else if (tool === 'narrator') {
            this.accessibility.narrator = !this.accessibility.narrator;
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                if (this.accessibility.narrator) {
                    const utterance = new SpeechSynthesisUtterance(`Bienvenue ${this.currentAccount || 'utilisateur'}. Entrez votre code PIN.`);
                    utterance.lang = 'fr-FR';
                    window.speechSynthesis.speak(utterance);
                }
            }
        } else {
            return;
        }
        this.syncLockscreenAccessibilityUi();
        this.saveAccounts();
    }

    activateLockscreenKeyboard() {
        const input = document.getElementById('login-pin-input');
        if (input) {
            input.focus();
            input.click();
        }
        this.notify('Accessibilite', 'Champ PIN actif.', 'security');
    }

    showWhatsNew(force = false) {
        const modal = document.getElementById('whats-new-modal');
        const grid = document.getElementById('whats-new-grid');
        if (!modal || !grid) return;

        if (!force && localStorage.getItem(this.getReleaseStorageKey()) === '1') {
            return;
        }

        grid.innerHTML = (this.releaseHighlights || []).map(item => `
            <article class="whats-new-item">
                <div class="whats-new-icon">${item.icon || 'N'}</div>
                <h3>${item.title || 'Nouveau'}</h3>
                <p>${item.description || ''}</p>
            </article>
        `).join('');

        const skipCheckbox = document.getElementById('whats-new-skip-version');
        if (skipCheckbox) skipCheckbox.checked = false;

        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => modal.classList.add('active'));
    }

    closeWhatsNew() {
        const modal = document.getElementById('whats-new-modal');
        if (!modal) return;

        const skipCheckbox = document.getElementById('whats-new-skip-version');
        if (skipCheckbox && skipCheckbox.checked) {
            localStorage.setItem(this.getReleaseStorageKey(), '1');
        } else {
            localStorage.removeItem(this.getReleaseStorageKey());
        }

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.style.display = 'none';
            }
        }, 180);
    }

    loadAccounts() {
        const data = localStorage.getItem('aether_accounts');
        const legacy = localStorage.getItem('funnyweb_accounts') || localStorage.getItem('funnyweb_user');

        if (data) {
            this.accounts = JSON.parse(data);
        } else if (legacy) {
            // Migrate legacy data
            try {
                const parsed = JSON.parse(legacy);
                if (parsed.name) { // Old single-user format
                    this.accounts[parsed.name] = { ...parsed, name: undefined };
                } else { // Old multi-user format
                    this.accounts = parsed;
                }
                this.saveAccounts();
                localStorage.removeItem('funnyweb_accounts');
                localStorage.removeItem('funnyweb_user');
            } catch (e) { console.error("Migration failed"); }
        }

        const lastUser = localStorage.getItem('aether_last_user');
        const lastUserKey = this.findAccountKey(lastUser);
        if (lastUserKey && this.accounts[lastUserKey]) {
            this.prepareAccount(lastUserKey);
            this.showLogin();
        } else if (Object.keys(this.accounts).length > 0) {
            this.showLogin();
        } else {
            this.showSetup();
        }
    }

    saveAccounts() {
        if (this.currentAccount) {
            const dockInstalledApps = Array.from(document.querySelectorAll('#installed-apps .dock-item'))
                .map(item => item.getAttribute('data-id'))
                .filter(Boolean);
            const installedSnapshot = dockInstalledApps.length > 0 ? dockInstalledApps : (Array.isArray(this.installedApps) ? this.installedApps : []);
            this.accounts[this.currentAccount] = {
                pin: this.pin,
                sessionID: this.sessionID || (this.accounts[this.currentAccount] && this.accounts[this.currentAccount].sessionID) || null,
                profilePic: this.profilePic,
                wallpaper: this.wallpaper,
                theme: this.theme,
                timeZone: this.timeZone,
                timeFormat: this.timeFormat,
                accessibility: this.accessibility,
                uiPreferences: this.uiPreferences,
                vfs: this.vfs,
                installedApps: installedSnapshot
            };
        }
        localStorage.setItem('aether_accounts', JSON.stringify(this.accounts));
        this.scheduleAccountCloudSync();
    }

    saveUserData() { this.saveAccounts(); }

    normalizeAccountLookup(name = '') {
        return String(name || '').trim().toLowerCase();
    }

    findAccountKey(name = '') {
        const normalized = this.normalizeAccountLookup(name);
        if (!normalized) return null;
        return Object.keys(this.accounts || {}).find(key => this.normalizeAccountLookup(key) === normalized) || null;
    }

    generateSessionId(seed = '') {
        try {
            const bytes = new Uint8Array(9);
            if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
                crypto.getRandomValues(bytes);
            } else {
                for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
            }
            const raw = String.fromCharCode(...bytes);
            const b64 = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
            return b64.slice(0, 12);
        } catch (err) {
            const fallback = btoa(`${seed}|${Date.now()}|${Math.random()}`).replace(/=+$/g, '');
            return fallback.slice(0, 12);
        }
    }

    isAdminAccount(name = '') {
        return String(name || '').trim().toLowerCase() === 'mouns';
    }

    ensureAdminToolsInstalled() {
        if (!this.currentAccount || !this.isAdminAccount(this.currentAccount)) return;
        if (!Array.isArray(this.installedApps)) this.installedApps = [];
        if (this.installedApps.includes('admin')) return;

        this.installedApps = [...this.installedApps, 'admin'];
        if (this.accounts && this.accounts[this.currentAccount]) {
            this.accounts[this.currentAccount].installedApps = this.installedApps;
            this.saveAccounts();
        }
        this.scheduleAccountCloudSync();
    }

    prepareAccount(name) {
        const resolvedName = this.findAccountKey(name) || name;
        const user = this.accounts[resolvedName];
        if (!user) return;

        this.currentAccount = resolvedName;
        this.userName = resolvedName;
        this.pin = user.pin;
        this.profilePic = user.profilePic || "";
        this.wallpaper = user.wallpaper || "var(--bg-image)";
        this.theme = user.theme || this.theme || 'dark';
        this.timeZone = user.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.timeFormat = user.timeFormat || "24h";
        this.accessibility = { ...this.getDefaultAccessibility(), ...(user.accessibility || {}) };
        this.uiPreferences = this.sanitizeUIPreferences(user.uiPreferences || {});
        this.vfs = user.vfs || this.getDefaultVFS();
        const savedInstalledApps = Array.isArray(user.installedApps) ? user.installedApps : [];
        this.installedApps = savedInstalledApps.length > 0 ? savedInstalledApps : ["word", "excel", "powerpoint", "store", "explorer", "wiki"];
        this.ensureAdminToolsInstalled();
        this.sessionID = user.sessionID || this.generateSessionId(this.userName);
        if (!user.sessionID) {
            this.accounts[resolvedName].sessionID = this.sessionID;
            this.saveAccounts();
        }

        // Call proper wallpaper logic instead of shorthand background property
        setTimeout(() => {
            this.setTheme(this.theme || 'dark');
            this.setWallpaper(this.wallpaper);
            this.applyAccessibilitySettings();
            this.applyUIPreferences();
        }, 0);
        this.hydrateAccountFromSupabase(resolvedName).catch(() => {});
        localStorage.setItem('aether_last_user', resolvedName);
    }

    getDefaultVFS() {
        return {
            "/": { type: "folder", children: { "/Bureau": "folder", "/Documents": "folder", "/Images": "folder", "/Downloads": "folder" } },
            "/Bureau": { type: "folder", children: {} },
            "/Documents": { type: "folder", children: {} },
            "/Images": { type: "folder", children: {} },
            "/Downloads": { type: "folder", children: {} },
            "/System": { type: "folder", children: { "/System/Apps": "folder" } },
            "/System/Apps": { type: "folder", children: {} }
        };
    }

    getDefaultAccessibility() {
        return { fontSize: "14px", highContrast: false, narrator: false, magnifier: false };
    }

    getDefaultUIPreferences() {
        return {
            dockPosition: 'left',
            dockSize: 'normal',
            trayStyle: 'floating',
            clockSeconds: false,
            notifications: this.getDefaultNotificationPreferences()
        };
    }

    getDefaultNotificationPreferences() {
        return {
            enabled: true,
            durationMs: 5000,
            types: {
                system: true,
                settings_change: true,
                security: true,
                accounts: true,
                store: true,
                install: true,
                dock: true,
                immersive: true,
                file: true
            }
        };
    }

    sanitizeUIPreferences(raw = {}) {
        const defaults = this.getDefaultUIPreferences();
        const allowedDockPositions = ['left', 'bottom', 'right', 'top'];
        const allowedDockSizes = ['compact', 'normal', 'large'];
        const allowedTrayStyles = ['floating', 'attached'];
        const notifDefaults = this.getDefaultNotificationPreferences();
        const rawNotif = (raw && typeof raw.notifications === 'object' && raw.notifications) ? raw.notifications : {};
        const rawTypes = (rawNotif && typeof rawNotif.types === 'object' && rawNotif.types) ? rawNotif.types : {};
        const allowedNotifTypes = Object.keys(notifDefaults.types);
        const sanitizedTypes = {};
        allowedNotifTypes.forEach((k) => {
            sanitizedTypes[k] = typeof rawTypes[k] === 'boolean' ? rawTypes[k] : notifDefaults.types[k];
        });
        const durationMsRaw = Number(rawNotif.durationMs);
        const durationMs = Number.isFinite(durationMsRaw)
            ? Math.min(20000, Math.max(1500, Math.round(durationMsRaw)))
            : notifDefaults.durationMs;
        return {
            dockPosition: allowedDockPositions.includes(raw.dockPosition) ? raw.dockPosition : defaults.dockPosition,
            dockSize: allowedDockSizes.includes(raw.dockSize) ? raw.dockSize : defaults.dockSize,
            trayStyle: allowedTrayStyles.includes(raw.trayStyle) ? raw.trayStyle : defaults.trayStyle,
            clockSeconds: !!raw.clockSeconds,
            notifications: {
                enabled: typeof rawNotif.enabled === 'boolean' ? rawNotif.enabled : notifDefaults.enabled,
                durationMs,
                types: sanitizedTypes
            }
        };
    }

    getDefaultSupabaseConfig() {
        return {
            url: '',
            anonKey: '',
            serviceKey: '',
            table: 'aether_accounts',
            usernameColumn: 'username',
            passwordColumn: 'password'
        };
    }

    sanitizeSupabaseConfig(raw = {}) {
        const defaults = this.getDefaultSupabaseConfig();
        const cleanUrl = typeof raw.url === 'string'
            ? raw.url.trim().replace(/\/+$/, '')
            : '';
        const cleanKey = typeof raw.anonKey === 'string' ? raw.anonKey.trim() : '';
        const cleanServiceKey = typeof raw.serviceKey === 'string' ? raw.serviceKey.trim() : '';
        const cleanTable = typeof raw.table === 'string' ? raw.table.trim() : '';
        const cleanUsernameColumn = typeof raw.usernameColumn === 'string' ? raw.usernameColumn.trim() : '';
        const cleanPasswordColumn = typeof raw.passwordColumn === 'string' ? raw.passwordColumn.trim() : '';
        return {
            url: cleanUrl || defaults.url,
            anonKey: cleanKey || defaults.anonKey,
            serviceKey: cleanServiceKey || defaults.serviceKey,
            table: cleanTable || defaults.table,
            usernameColumn: cleanUsernameColumn || defaults.usernameColumn,
            passwordColumn: cleanPasswordColumn || defaults.passwordColumn
        };
    }

    loadSupabaseConfig() {
        const defaults = this.getDefaultSupabaseConfig();
        const runtimeEnv = (typeof window !== 'undefined' && window.AETHER_RUNTIME_ENV)
            ? window.AETHER_RUNTIME_ENV
            : {};
        const fromWindow = (typeof window !== 'undefined' && window.AETHER_SUPABASE_CONFIG)
            ? window.AETHER_SUPABASE_CONFIG
            : {};
        const fromRuntime = {
            url: runtimeEnv.AETHER_SUPABASE_URL || '',
            anonKey: runtimeEnv.AETHER_SUPABASE_ANON_KEY || '',
            serviceKey: runtimeEnv.AETHER_SUPABASE_SERVICE_ROLE_KEY || '',
            table: runtimeEnv.AETHER_SUPABASE_TABLE || '',
            usernameColumn: runtimeEnv.AETHER_SUPABASE_USERNAME_COLUMN || '',
            passwordColumn: runtimeEnv.AETHER_SUPABASE_PASSWORD_COLUMN || ''
        };
        return this.sanitizeSupabaseConfig({ ...defaults, ...fromRuntime, ...fromWindow });
    }

    parseEnvText(text = '') {
        const parsed = {};
        String(text)
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .forEach(line => {
                const eqIndex = line.indexOf('=');
                if (eqIndex <= 0) return;
                const key = line.slice(0, eqIndex).trim();
                let value = line.slice(eqIndex + 1).trim();
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

    getStoredGroqApiKey() {
        try {
            const value = localStorage.getItem('aether_groq_api_key');
            return typeof value === 'string' ? value.trim() : '';
        } catch (err) {
            return '';
        }
    }

    setGroqApiKey(value = '', { persist = true } = {}) {
        const next = typeof value === 'string' ? value.trim() : '';
        this.groqApiKey = next;
        if (!persist) return this.groqApiKey;

        try {
            if (next) localStorage.setItem('aether_groq_api_key', next);
            else localStorage.removeItem('aether_groq_api_key');
        } catch (err) { }

        return this.groqApiKey;
    }

    async loadSupabaseConfigFromEnv() {
        const candidates = ['.env', './.env', '/.env', 'env', './env', '/env', 'config/.env'];
        const base = this.sanitizeSupabaseConfig(this.supabaseConfig || this.loadSupabaseConfig());
        let resolved = base;

        for (const path of candidates) {
            try {
                const response = await fetch(path, { cache: 'no-store' });
                if (!response.ok) continue;
                const text = await response.text();
                const env = this.parseEnvText(text);
                // Allow loading optional keys (ex: Groq) even if Supabase isn't configured in this file.
                if (env.AETHER_GROQ_API_KEY) this.setGroqApiKey(env.AETHER_GROQ_API_KEY);
                if (!env.AETHER_SUPABASE_URL && !env.AETHER_SUPABASE_ANON_KEY && !env.AETHER_SUPABASE_SERVICE_ROLE_KEY && !env.AETHER_SUPABASE_TABLE) continue;
                resolved = this.sanitizeSupabaseConfig({
                    ...resolved,
                    url: env.AETHER_SUPABASE_URL || resolved.url,
                    anonKey: env.AETHER_SUPABASE_ANON_KEY || resolved.anonKey,
                    serviceKey: env.AETHER_SUPABASE_SERVICE_ROLE_KEY || resolved.serviceKey,
                    table: env.AETHER_SUPABASE_TABLE || resolved.table,
                    usernameColumn: env.AETHER_SUPABASE_USERNAME_COLUMN || resolved.usernameColumn,
                    passwordColumn: env.AETHER_SUPABASE_PASSWORD_COLUMN || resolved.passwordColumn
                });
                break;
            } catch (err) { }
        }

        const runtimeEnv = (typeof window !== 'undefined' && window.AETHER_RUNTIME_ENV)
            ? window.AETHER_RUNTIME_ENV
            : {};
        resolved = this.sanitizeSupabaseConfig({
            ...resolved,
            url: runtimeEnv.AETHER_SUPABASE_URL || resolved.url,
            anonKey: runtimeEnv.AETHER_SUPABASE_ANON_KEY || resolved.anonKey,
            serviceKey: runtimeEnv.AETHER_SUPABASE_SERVICE_ROLE_KEY || resolved.serviceKey,
            table: runtimeEnv.AETHER_SUPABASE_TABLE || resolved.table,
            usernameColumn: runtimeEnv.AETHER_SUPABASE_USERNAME_COLUMN || resolved.usernameColumn,
            passwordColumn: runtimeEnv.AETHER_SUPABASE_PASSWORD_COLUMN || resolved.passwordColumn
        });

        if (runtimeEnv.AETHER_GROQ_API_KEY) this.setGroqApiKey(runtimeEnv.AETHER_GROQ_API_KEY);
        if (!this.groqApiKey) this.groqApiKey = this.getStoredGroqApiKey();
        this.supabaseConfig = resolved;
        this.supabaseSchemaProfile = null;
        return this.supabaseConfig;
    }

    isSupabaseReady(config = this.supabaseConfig) {
        return !!(config && config.url && (config.anonKey || config.serviceKey) && config.table);
    }

    isSupabaseApiReady(config = this.supabaseConfig) {
        return !!(config && config.url && (config.anonKey || config.serviceKey));
    }

    showSetupError(message = '') {
        const errorEl = document.getElementById('setup-error');
        if (errorEl) errorEl.textContent = message;
    }

    setSetupBusy(isBusy) {
        const submitBtn = document.getElementById('setup-submit-btn');
        const modeButtons = document.querySelectorAll('.setup-mode-btn');
        if (submitBtn) {
            submitBtn.disabled = !!isBusy;
            submitBtn.style.opacity = isBusy ? '0.6' : '1';
            submitBtn.style.pointerEvents = isBusy ? 'none' : 'auto';
        }
        modeButtons.forEach(btn => {
            btn.disabled = !!isBusy;
            btn.style.opacity = isBusy ? '0.6' : '1';
            btn.style.pointerEvents = isBusy ? 'none' : 'auto';
        });
    }

    hydrateSetupFields() {
        this.supabaseConfig = this.sanitizeSupabaseConfig(this.supabaseConfig || this.loadSupabaseConfig());
    }

    resolveSetupSupabaseConfig() {
        return this.sanitizeSupabaseConfig(this.supabaseConfig || this.getDefaultSupabaseConfig());
    }

    async supabaseRequest(path, config, options = {}) {
        const method = options.method || 'GET';
        const authKey = options.useAnonKey
            ? (config.anonKey || config.serviceKey)
            : (config.serviceKey || config.anonKey);
        if (!authKey) throw new Error('Supabase key missing');
        const headers = {
            apikey: authKey,
            Authorization: `Bearer ${authKey}`,
            Accept: 'application/json',
            ...(options.headers || {})
        };
        const fetchOptions = { method, headers };
        if (typeof options.body !== 'undefined') {
            headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(options.body);
        }

        const response = await fetch(`${config.url}/rest/v1/${path}`, fetchOptions);
        const raw = await response.text();
        let payload = null;
        try { payload = raw ? JSON.parse(raw) : null; } catch (err) { payload = null; }

        if (!response.ok) {
            const reason = (payload && (payload.message || payload.hint || payload.details))
                ? `${payload.message || payload.hint || payload.details}`
                : `HTTP ${response.status}`;
            throw new Error(reason);
        }
        return payload;
    }

    applyRegistryOverridesFromStorage() {
        try {
            const overrides = JSON.parse(localStorage.getItem('aether_apps_overrides') || '{}');
            if (!overrides || typeof overrides !== 'object') return;
            if (!Array.isArray(this.appsRegistry)) return;
            this.appsRegistry = this.appsRegistry.map(app => {
                if (!app || !app.id) return app;
                if (overrides[app.id]) return { ...app, ...overrides[app.id] };
                return app;
            });
        } catch (err) {
            console.error("Error applying overrides:", err);
        }
    }

    getDeletedAppIds() {
        try {
            const parsed = JSON.parse(localStorage.getItem('aether_deleted_apps') || '[]');
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (err) {
            return [];
        }
    }

    setDeletedAppIds(ids = []) {
        const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
        localStorage.setItem('aether_deleted_apps', JSON.stringify(unique));
        return unique;
    }

    refreshInstalledAppsMetadata() {
        try {
            if (!Array.isArray(this.installedApps) || !Array.isArray(this.appsRegistry)) return;
            this.installedApps.forEach(id => {
                const appData = this.appsRegistry.find(app => app && app.id === id);
                if (!appData) return;

                const title = appData.title || id;
                const dockItem = document.getElementById(`dock-item-${id}`);
                if (dockItem) {
                    dockItem.title = title;
                    const iconNode = document.getElementById(`icon-${id}`);
                    if (iconNode) {
                        if (appData && appData.icon) iconNode.innerHTML = this.renderAppIconMarkup(appData.icon, '📦');
                    }
                }

                const win = document.getElementById(`window-${id}`);
                if (win) {
                    const titleEl = win.querySelector('.window-title');
                    if (titleEl) {
                        const suffix = id.startsWith('online_') ? ' [ONLINE]' : '';
                        titleEl.textContent = `${title}${suffix}`;
                    }
                }
            });
        } catch (err) { }
    }

    hashString(input = '') {
        const str = String(input);
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    }

    escapeHtmlAttr(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    renderAppIconMarkup(iconValue, fallback = '📦') {
        const icon = typeof iconValue === 'string' ? iconValue.trim() : '';
        
        if (!icon) return fallback;

        // Si c'est une URL
        if (/^(https?:\/\/|data:image\/)/i.test(icon)) {
            return `<img class="app-icon-img" src="${this.escapeHtmlAttr(icon)}" alt="">`;
        }

        // Match store behavior: allow URL-ish values without protocol (ex: "th.bing.com/...").
        if (!/\s/.test(icon) && (icon.includes('.') || icon.includes('/') || icon.startsWith('www.') || icon.includes(':'))) {
            const normalized = `https://${icon.replace(/^\/\//, '')}`;
            try {
                const url = new URL(normalized);
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    return `<img class="app-icon-img" src="${this.escapeHtmlAttr(url.href)}" alt="">`;
                }
            } catch (err) { }
        }

        return icon || fallback;
    }

    getStoreSupabaseTables() {
        return {
            apps: 'aether_store_apps',
            overrides: 'aether_store_overrides',
            talkyMessages: 'aether_talky_messages'
        };
    }

    getAccountProfileTable() {
        return 'aether_account_profiles';
    }

    getVfsFilesTable() {
        return 'aether_vfs_files';
    }

    async checkStoreTablesAvailability(config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        try {
            const readKey = resolved.serviceKey || resolved.anonKey;
            const response = await fetch(`${resolved.url}/rest/v1/`, {
                method: 'GET',
                headers: {
                    apikey: readKey,
                    Authorization: `Bearer ${readKey}`,
                    Accept: 'application/openapi+json'
                }
            });
            if (!response.ok) return false;
            const openApi = await response.json();
            const paths = openApi && openApi.paths ? openApi.paths : {};
            const tables = this.getStoreSupabaseTables();
            return !!(
                paths[`/${tables.apps}`] &&
                paths[`/${tables.overrides}`]
            );
        } catch (err) {
            return false;
        }
    }

    async checkAccountProfileTableAvailability(config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        try {
            const readKey = resolved.serviceKey || resolved.anonKey;
            const response = await fetch(`${resolved.url}/rest/v1/`, {
                method: 'GET',
                headers: {
                    apikey: readKey,
                    Authorization: `Bearer ${readKey}`,
                    Accept: 'application/openapi+json'
                }
            });
            if (!response.ok) return false;
            const openApi = await response.json();
            const paths = openApi && openApi.paths ? openApi.paths : {};
            const table = this.getAccountProfileTable();
            return !!paths[`/${table}`];
        } catch (err) {
            return false;
        }
    }

    async checkVfsFilesTableAvailability(config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        try {
            const readKey = resolved.serviceKey || resolved.anonKey;
            const response = await fetch(`${resolved.url}/rest/v1/`, {
                method: 'GET',
                headers: {
                    apikey: readKey,
                    Authorization: `Bearer ${readKey}`,
                    Accept: 'application/openapi+json'
                }
            });
            if (!response.ok) return false;
            const openApi = await response.json();
            const paths = openApi && openApi.paths ? openApi.paths : {};
            const table = this.getVfsFilesTable();
            return !!paths[`/${table}`];
        } catch (err) {
            return false;
        }
    }

    buildCurrentAccountCloudPayload() {
        if (!this.currentAccount) return null;
        const account = this.accounts[this.currentAccount] || {};
        return {
            pin: this.pin || account.pin || '0000',
            sessionID: this.sessionID || account.sessionID || null,
            profilePic: this.profilePic || account.profilePic || "",
            wallpaper: this.wallpaper || account.wallpaper || "var(--bg-image)",
            timeZone: this.timeZone || account.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            timeFormat: this.timeFormat || account.timeFormat || "24h",
            accessibility: this.accessibility || account.accessibility || this.getDefaultAccessibility(),
            uiPreferences: this.uiPreferences || account.uiPreferences || this.getDefaultUIPreferences(),
            vfs: this.vfs || account.vfs || this.getDefaultVFS(),
            installedApps: Array.isArray(this.installedApps) ? this.installedApps : (account.installedApps || ["word", "excel", "powerpoint", "store", "explorer", "wiki"])
        };
    }

    sanitizeAccountCloudPayload(payload = {}) {
        return {
            pin: String(payload.pin || '0000'),
            sessionID: payload.sessionID || null,
            profilePic: payload.profilePic || "",
            wallpaper: payload.wallpaper || "var(--bg-image)",
            timeZone: payload.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            timeFormat: payload.timeFormat || "24h",
            accessibility: { ...this.getDefaultAccessibility(), ...(payload.accessibility || {}) },
            uiPreferences: this.sanitizeUIPreferences(payload.uiPreferences || {}),
            vfs: payload.vfs || this.getDefaultVFS(),
            installedApps: Array.isArray(payload.installedApps) && payload.installedApps.length > 0
                ? payload.installedApps
                : ["word", "excel", "powerpoint", "store", "explorer", "wiki"]
        };
    }

    serializeVfsEntryForCloud(userName, path, entry = {}) {
        const type = entry && entry.type ? entry.type : 'file';
        const rawContent = type === 'folder' ? '' : (typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content ?? ''));
        return {
            username: String(userName),
            path: this.normalizeVfsPath(path),
            node_type: type,
            content: rawContent,
            meta: {
                lastModified: entry && entry.lastModified ? entry.lastModified : Date.now()
            }
        };
    }

    rebuildVfsTree(vfs = {}) {
        const normalized = { ...vfs };
        if (!normalized['/']) {
            normalized['/'] = { type: 'folder', children: {} };
        }

        Object.keys(normalized).forEach(path => {
            const entry = normalized[path];
            if (!entry) return;
            if (entry.type === 'folder') {
                entry.children = {};
                delete entry.content;
            }
        });

        Object.keys(normalized).forEach(path => {
            if (path === '/') return;
            const entry = normalized[path];
            if (!entry) return;
            const lastSlash = path.lastIndexOf('/');
            let parent = path.substring(0, lastSlash);
            if (!parent) parent = '/';
            if (!normalized[parent]) {
                normalized[parent] = { type: 'folder', children: {} };
            }
            if (normalized[parent].type !== 'folder') {
                normalized[parent] = { type: 'folder', children: {} };
            }
            if (!normalized[parent].children) normalized[parent].children = {};
            normalized[parent].children[path] = entry.type || 'file';
        });

        return normalized;
    }

    buildCloudVfsFromRows(rows = []) {
        const nextVfs = this.getDefaultVFS();
        (Array.isArray(rows) ? rows : []).forEach(row => {
            if (!row || !row.path) return;
            const normalizedPath = this.normalizeVfsPath(row.path);
            if (normalizedPath === '/') return;
            const nodeType = row.node_type === 'folder' ? 'folder' : (row.node_type || 'file');
            nextVfs[normalizedPath] = {
                type: nodeType,
                content: nodeType === 'folder' ? undefined : (typeof row.content === 'string' ? row.content : ''),
                lastModified: row.meta && row.meta.lastModified ? row.meta.lastModified : Date.now(),
                children: nodeType === 'folder' ? {} : undefined
            };
        });
        return this.rebuildVfsTree(nextVfs);
    }

    async fetchVfsRowsFromSupabase(userName, config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return [];
        const table = this.getVfsFilesTable();
        const rows = await this.supabaseRequest(
            `${table}?select=path,node_type,content,meta,updated_at&username=eq.${encodeURIComponent(String(userName))}&order=path.asc&limit=5000`,
            resolved,
            { useAnonKey: true }
        );
        return Array.isArray(rows) ? rows : [];
    }

    async upsertVfsEntryToSupabase(userName, path, entry, config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        const table = this.getVfsFilesTable();
        await this.supabaseRequest(`${table}?on_conflict=username,path`, resolved, {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: [this.serializeVfsEntryForCloud(userName, path, entry)]
        });
        return true;
    }

    async deleteVfsEntryFromSupabase(userName, path, config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        const table = this.getVfsFilesTable();
        await this.supabaseRequest(
            `${table}?username=eq.${encodeURIComponent(String(userName))}&path=eq.${encodeURIComponent(this.normalizeVfsPath(path))}`,
            resolved,
            {
                method: 'DELETE',
                useServiceKey: true,
                headers: { Prefer: 'return=minimal' }
            }
        );
        return true;
    }

    async syncCurrentVfsToSupabase(config = null) {
        if (!this.currentAccount) return false;
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        this.vfsFilesRemoteReady = await this.checkVfsFilesTableAvailability(resolved);
        if (!this.vfsFilesRemoteReady) return false;

        const table = this.getVfsFilesTable();
        const entries = Object.entries(this.vfs || {})
            .filter(([path]) => this.normalizeVfsPath(path) !== '/')
            .map(([path, entry]) => this.serializeVfsEntryForCloud(this.currentAccount, path, entry));

        await this.supabaseRequest(
            `${table}?username=eq.${encodeURIComponent(String(this.currentAccount))}`,
            resolved,
            {
                method: 'DELETE',
                useServiceKey: true,
                headers: { Prefer: 'return=minimal' }
            }
        );

        if (entries.length > 0) {
            await this.supabaseRequest(`${table}?on_conflict=username,path`, resolved, {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: entries
            });
        }
        this.lastVfsCloudSyncAccount = this.currentAccount;
        return true;
    }

    async fetchAccountProfileFromSupabase(userName, config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return null;
        const table = this.getAccountProfileTable();
        const rows = await this.supabaseRequest(
            `${table}?select=username,payload,updated_at&username=eq.${encodeURIComponent(String(userName))}&limit=1`,
            resolved,
            { useAnonKey: true }
        );
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async upsertAccountProfileToSupabase(userName, payload, config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return false;
        const table = this.getAccountProfileTable();
        await this.supabaseRequest(`${table}?on_conflict=username`, resolved, {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
            body: [{ username: String(userName), payload: payload || {} }]
        });
        return true;
    }

    scheduleAccountCloudSync() {
        if (!this.currentAccount) return;
        if (this.accountCloudSyncTimer) clearTimeout(this.accountCloudSyncTimer);
        this.accountCloudSyncTimer = setTimeout(() => {
            this.syncCurrentAccountToSupabase().catch(() => {});
        }, 700);
    }

    async syncCurrentAccountToSupabase() {
        if (!this.currentAccount || this.accountCloudHydrationInFlight) return false;
        const config = this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(config)) return false;
        this.accountProfileRemoteReady = await this.checkAccountProfileTableAvailability(config);
        this.vfsFilesRemoteReady = await this.checkVfsFilesTableAvailability(config);
        if (!this.accountProfileRemoteReady && !this.vfsFilesRemoteReady) return false;
        const payload = this.buildCurrentAccountCloudPayload();
        if (!payload) return false;
        if (this.accountProfileRemoteReady) {
            await this.upsertAccountProfileToSupabase(this.currentAccount, payload, config);
        }
        if (this.vfsFilesRemoteReady && this.lastVfsCloudSyncAccount !== this.currentAccount) {
            await this.syncCurrentVfsToSupabase(config);
        }
        return true;
    }

    async hydrateAccountFromSupabase(userName) {
        const config = this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(config)) return false;
        this.accountProfileRemoteReady = await this.checkAccountProfileTableAvailability(config);
        this.vfsFilesRemoteReady = await this.checkVfsFilesTableAvailability(config);
        if (!this.accountProfileRemoteReady && !this.vfsFilesRemoteReady) return false;
        this.accountCloudHydrationInFlight = true;
        try {
            let remote = null;
            if (this.accountProfileRemoteReady) {
                const row = await this.fetchAccountProfileFromSupabase(userName, config);
                if (row && row.payload) {
                    remote = this.sanitizeAccountCloudPayload(row.payload);
                }
            }
            if (!remote) {
                remote = this.sanitizeAccountCloudPayload(this.accounts[userName] || {});
            }
            if (this.vfsFilesRemoteReady) {
                const vfsRows = await this.fetchVfsRowsFromSupabase(userName, config);
                if (Array.isArray(vfsRows) && vfsRows.length > 0) {
                    remote.vfs = this.buildCloudVfsFromRows(vfsRows);
                }
            }
            this.accounts[userName] = {
                ...(this.accounts[userName] || {}),
                ...remote
            };
            if (this.currentAccount === userName) {
                this.pin = remote.pin;
                this.sessionID = remote.sessionID || this.generateSessionId(userName);
                this.profilePic = remote.profilePic;
                this.wallpaper = remote.wallpaper;
                this.timeZone = remote.timeZone;
                this.timeFormat = remote.timeFormat;
                this.accessibility = remote.accessibility;
                this.uiPreferences = remote.uiPreferences;
                this.vfs = remote.vfs;
                this.installedApps = remote.installedApps;
                this.ensureAdminToolsInstalled();
                setTimeout(() => {
                    this.setWallpaper(this.wallpaper);
                    this.applyAccessibilitySettings();
                    this.applyUIPreferences();
                    this.renderDesktop();
                }, 0);
            }
            localStorage.setItem('aether_accounts', JSON.stringify(this.accounts));
            this.lastVfsCloudSyncAccount = userName;
            return true;
        } catch (err) {
            return false;
        } finally {
            this.accountCloudHydrationInFlight = false;
        }
    }

    async fetchStoreCatalogFromSupabase(config = null) {
        const resolved = config || this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(resolved)) return null;

        const tables = this.getStoreSupabaseTables();
        const approved = await this.supabaseRequest(
            `${tables.apps}?select=id,app,updated_at&status=eq.approved&order=updated_at.desc&limit=1000`,
            resolved,
            { useAnonKey: true }
        );
        const pending = await this.supabaseRequest(
            `${tables.apps}?select=id,app,updated_at&status=eq.pending&order=updated_at.desc&limit=1000`,
            resolved,
            { useAnonKey: true }
        );
        const overridesRows = await this.supabaseRequest(
            `${tables.overrides}?select=app_id,payload,updated_at&order=updated_at.desc&limit=2000`,
            resolved,
            { useAnonKey: true }
        );

        const safeApproved = Array.isArray(approved) ? approved.map(r => r && r.app).filter(Boolean) : [];
        const safePending = Array.isArray(pending) ? pending.map(r => r && r.app).filter(Boolean) : [];
        const overrides = {};
        const deleted = [];
        (Array.isArray(overridesRows) ? overridesRows : []).forEach(row => {
            if (!row || !row.app_id || !row.payload) return;
            overrides[row.app_id] = row.payload;
            if (row.payload.hidden === true) deleted.push(row.app_id);
        });

        return { approved: safeApproved, pending: safePending, overrides, deleted };
    }

    async syncStoreCatalogFromSupabase(force = false) {
        if (this.storeSyncInFlight) return;
        const config = this.resolveSetupSupabaseConfig();
        if (!this.isSupabaseApiReady(config)) return;
        this.storeRemoteReady = await this.checkStoreTablesAvailability(config);
        if (!this.storeRemoteReady) {
            this.windows.forEach(win => {
                if (win && win.iframe && win.iframe.contentWindow) {
                    win.iframe.contentWindow.postMessage({ type: 'AETHER_STORE_REMOTE_DISABLED' }, '*');
                }
            });
            return;
        }

        this.storeSyncInFlight = true;
        try {
            const remote = await this.fetchStoreCatalogFromSupabase(config);
            if (!remote) return;

            const approvedJson = JSON.stringify(remote.approved || []);
            const pendingJson = JSON.stringify(remote.pending || []);
            const overridesJson = JSON.stringify(remote.overrides || {});
            const deletedJson = JSON.stringify(remote.deleted || []);
            const fingerprint = `${this.hashString(approvedJson)}|${this.hashString(pendingJson)}|${this.hashString(overridesJson)}|${this.hashString(deletedJson)}`;
            if (!force && fingerprint === this.lastStoreSyncFingerprint) return;

            localStorage.setItem('aether_approved_apps', approvedJson);
            localStorage.setItem('aether_pending_apps', pendingJson);
            localStorage.setItem('aether_apps_overrides', overridesJson);
            localStorage.setItem('aether_deleted_apps', deletedJson);
            this.lastStoreSyncFingerprint = fingerprint;

            await this.fetchAppsRegistry();
            this.applyRegistryOverridesFromStorage();
            this.refreshInstalledAppsMetadata();

            if (document.getElementById('launchpad-grid')) this.renderLaunchpad();
            this.windows.forEach(win => {
                if (win && win.iframe && win.iframe.contentWindow) {
                    win.iframe.contentWindow.postMessage({ type: 'AETHER_STORE_SYNCED' }, '*');
                }
            });
        } catch (err) {
            console.warn("Store sync failed:", err);
        } finally {
            this.storeSyncInFlight = false;
        }
    }

    startStoreSync() {
        this.stopStoreSync();
        const run = () => this.syncStoreCatalogFromSupabase(false);
        run();
        this.storeSyncInterval = setInterval(run, 15000);
    }

    stopStoreSync() {
        if (this.storeSyncInterval) {
            clearInterval(this.storeSyncInterval);
            this.storeSyncInterval = null;
        }
    }

    getSupabaseSchemaCacheKey(config) {
        return `${config.url}|${config.table}|${config.usernameColumn}|${config.passwordColumn}`;
    }

    hashString32(value = '') {
        const input = String(value);
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    computeCompactAccountId(userName = '') {
        const normalized = String(userName).trim().toLowerCase();
        return (this.hashString32(`user:${normalized}`) % 2147483646) + 1;
    }

    computeCompactPasswordTimestamp(userName = '', password = '') {
        const baseEpochSeconds = 946684800; // 2000-01-01T00:00:00Z
        const hash = this.hashString32(`pwd:${String(userName)}:${String(password)}`);
        return new Date((baseEpochSeconds + hash) * 1000).toISOString();
    }

    compareTimestampSeconds(left, right) {
        const leftTime = Date.parse(left);
        const rightTime = Date.parse(right);
        if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
        return Math.floor(leftTime / 1000) === Math.floor(rightTime / 1000);
    }

    pickSupabaseColumnPair(columns = [], preferredUsername = 'username', preferredPassword = 'password') {
        const canonical = new Map();
        columns.forEach(col => canonical.set(String(col).toLowerCase(), col));

        const candidatePairs = [
            [preferredUsername, preferredPassword],
            ['username', 'password'],
            ['user_name', 'password'],
            ['user', 'password'],
            ['email', 'password'],
            ['login', 'password'],
            ['nom', 'motdepasse'],
            ['nom', 'mot_de_passe']
        ];

        for (const [candidateUser, candidatePassword] of candidatePairs) {
            const userColumn = canonical.get(String(candidateUser).toLowerCase());
            const passwordColumn = canonical.get(String(candidatePassword).toLowerCase());
            if (userColumn && passwordColumn) {
                return { usernameColumn: userColumn, passwordColumn: passwordColumn };
            }
        }
        return null;
    }

    async getSupabaseAccountSchema(config) {
        const cacheKey = this.getSupabaseSchemaCacheKey(config);
        if (this.supabaseSchemaProfile && this.supabaseSchemaProfile.key === cacheKey) {
            return this.supabaseSchemaProfile.value;
        }

        const fallback = {
            mode: 'native',
            tableExists: true,
            columns: [config.usernameColumn, config.passwordColumn],
            usernameColumn: config.usernameColumn,
            passwordColumn: config.passwordColumn
        };

        let profile = fallback;
        try {
            const readKey = config.serviceKey || config.anonKey;
            const response = await fetch(`${config.url}/rest/v1/`, {
                method: 'GET',
                headers: {
                    apikey: readKey,
                    Authorization: `Bearer ${readKey}`,
                    Accept: 'application/openapi+json'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const openApi = await response.json();
            const paths = openApi && openApi.paths ? openApi.paths : {};
            const hasTablePath = !!(paths[`/${config.table}`] || paths[`/public.${config.table}`]);
            if (!hasTablePath) {
                profile = { mode: 'missing_table', tableExists: false, columns: [] };
            } else {
                const definitions = openApi && openApi.definitions ? openApi.definitions : {};
                const tableDefinition = definitions[config.table] || definitions[`public.${config.table}`] || {};
                const columns = tableDefinition.properties ? Object.keys(tableDefinition.properties) : [];
                const columnPair = this.pickSupabaseColumnPair(columns, config.usernameColumn, config.passwordColumn);

                if (columnPair) {
                    profile = {
                        mode: 'native',
                        tableExists: true,
                        columns,
                        usernameColumn: columnPair.usernameColumn,
                        passwordColumn: columnPair.passwordColumn
                    };
                } else if (columns.includes('id') && columns.includes('created_at')) {
                    profile = {
                        mode: 'compact',
                        tableExists: true,
                        columns,
                        idColumn: 'id',
                        createdAtColumn: 'created_at'
                    };
                } else {
                    profile = { mode: 'incompatible', tableExists: true, columns };
                }
            }
        } catch (err) {
            profile = fallback;
        }

        this.supabaseSchemaProfile = { key: cacheKey, value: profile };
        return profile;
    }

    async supabaseFindByUsernameCompact(userName, config) {
        const accountId = this.computeCompactAccountId(userName);
        const params = new URLSearchParams();
        params.set('select', 'id,created_at');
        params.set('id', `eq.${accountId}`);
        params.set('limit', '1');
        const rows = await this.supabaseRequest(`${config.table}?${params.toString()}`, config);
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async supabaseFindByCredentialsCompact(userName, password, config) {
        const row = await this.supabaseFindByUsernameCompact(userName, config);
        if (!row) return null;
        const expectedTimestamp = this.computeCompactPasswordTimestamp(userName, password);
        return this.compareTimestampSeconds(row.created_at, expectedTimestamp) ? row : null;
    }

    async supabaseCreateUserCompact(userName, password, config) {
        const accountId = this.computeCompactAccountId(userName);
        const createdAt = this.computeCompactPasswordTimestamp(userName, password);
        await this.supabaseRequest(config.table, config, {
            method: 'POST',
            useServiceKey: true,
            headers: { Prefer: 'return=minimal' },
            body: { id: accountId, created_at: createdAt }
        });
    }

    async supabaseFindByCredentials(userName, password, config) {
        const schema = await this.getSupabaseAccountSchema(config);
        if (schema.mode === 'missing_table') {
            throw new Error(`Could not find the table public.${config.table}`);
        }
        if (schema.mode === 'compact') {
            return this.supabaseFindByCredentialsCompact(userName, password, config);
        }
        if (schema.mode === 'incompatible') {
            throw new Error(`Schema incompatible on public.${config.table}`);
        }

        const usernameColumn = schema.usernameColumn || config.usernameColumn;
        const passwordColumn = schema.passwordColumn || config.passwordColumn;
        const params = new URLSearchParams();
        params.set('select', `${usernameColumn},${passwordColumn}`);
        params.set(usernameColumn, `eq.${userName}`);
        params.set(passwordColumn, `eq.${password}`);
        params.set('limit', '1');
        const rows = await this.supabaseRequest(`${config.table}?${params.toString()}`, config);
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async supabaseFindByUsername(userName, config) {
        const schema = await this.getSupabaseAccountSchema(config);
        if (schema.mode === 'missing_table') {
            throw new Error(`Could not find the table public.${config.table}`);
        }
        if (schema.mode === 'compact') {
            return this.supabaseFindByUsernameCompact(userName, config);
        }
        if (schema.mode === 'incompatible') {
            throw new Error(`Schema incompatible on public.${config.table}`);
        }

        const usernameColumn = schema.usernameColumn || config.usernameColumn;
        const params = new URLSearchParams();
        params.set('select', usernameColumn);
        params.set(usernameColumn, `eq.${userName}`);
        params.set('limit', '1');
        const rows = await this.supabaseRequest(`${config.table}?${params.toString()}`, config);
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async supabaseCreateUser(userName, password, config) {
        const schema = await this.getSupabaseAccountSchema(config);
        if (schema.mode === 'missing_table') {
            throw new Error(`Could not find the table public.${config.table}`);
        }
        if (schema.mode === 'compact') {
            return this.supabaseCreateUserCompact(userName, password, config);
        }
        if (schema.mode === 'incompatible') {
            throw new Error(`Schema incompatible on public.${config.table}`);
        }

        const usernameColumn = schema.usernameColumn || config.usernameColumn;
        const passwordColumn = schema.passwordColumn || config.passwordColumn;
        await this.supabaseRequest(config.table, config, {
            method: 'POST',
            useServiceKey: true,
            headers: { Prefer: 'return=minimal' },
            body: { [usernameColumn]: userName, [passwordColumn]: password }
        });
    }

    formatSupabaseSetupError(error, config = this.supabaseConfig) {
        const raw = String((error && error.message) || error || '').trim();
        const table = (config && config.table) ? config.table : 'aether_accounts';
        const lower = raw.toLowerCase();

        if (lower.includes('pgrst205') || lower.includes('schema cache') || lower.includes('could not find the table')) {
            return `Table Supabase introuvable: public.${table}. Cree la table puis reessaie.`;
        }
        if (lower.includes('schema incompatible')) {
            return `Schema Supabase incompatible sur public.${table}. Ajoute les colonnes username/password ou utilise supabase_setup.sql.`;
        }
        if (lower.includes('column') && lower.includes('does not exist')) {
            return `Colonnes manquantes sur public.${table}. Execute supabase_setup.sql pour corriger la table.`;
        }
        if (lower.includes('permission denied') || lower.includes('new row violates row-level security') || lower.includes('42501')) {
            return `Permissions Supabase manquantes (RLS/policies) sur ${table}. Execute supabase_setup.sql ou renseigne AETHER_SUPABASE_SERVICE_ROLE_KEY.`;
        }
        if (lower.includes('duplicate key value') || lower.includes('23505')) {
            return `Ce compte existe deja dans Supabase.`;
        }
        if (!raw) return 'Connexion Supabase impossible.';
        return `Supabase: ${raw}`;
    }

    setSetupMode(mode = 'existing') {
        const normalized = (mode === 'create' || mode === 'local') ? mode : 'existing';
        this.setupMode = normalized;
        const modeInput = document.getElementById('setup-mode');
        const existingBtn = document.getElementById('setup-mode-existing-btn');
        const createBtn = document.getElementById('setup-mode-create-btn');
        const localBtn = document.getElementById('setup-mode-local-btn');
        const submitBtn = document.getElementById('setup-submit-btn');
        const password = document.getElementById('setup-password');
        const username = document.getElementById('setup-username');
        if (modeInput) modeInput.value = normalized;
        if (existingBtn) existingBtn.classList.toggle('active', normalized === 'existing');
        if (createBtn) createBtn.classList.toggle('active', normalized === 'create');
        if (localBtn) localBtn.classList.toggle('active', normalized === 'local');
        if (submitBtn) {
            if (normalized === 'existing') submitBtn.textContent = 'RELIER & LANCER';
            else submitBtn.textContent = 'CREER & LANCER';
        }
        if (password) {
            password.style.display = normalized === 'local' ? 'none' : '';
            password.autocomplete = normalized === 'existing' ? 'current-password' : 'new-password';
            if (normalized === 'local') password.value = '';
        }
        if (username) {
            username.placeholder = normalized === 'local' ? "Nom d'utilisateur local" : "Nom d'utilisateur Supabase";
        }
        this.showSetupError('');
    }

    showSetup(startStep = 1) {
        this.hideAllOverlays();
        this.stopLockscreenClock();
        document.getElementById('setup-overlay').style.display = 'flex';
        this.hydrateSetupFields();
        const defaultMode = this.isSupabaseReady()
            ? (Object.keys(this.accounts || {}).length > 0 ? 'existing' : 'create')
            : 'local';
        this.setSetupMode(defaultMode);
        this.showSetupError('');
        if (!this.isSupabaseReady()) {
            this.showSetupError("Supabase n'est pas configure. Tu peux creer un compte local (onglet « Compte local ») ou configurer .env pour le cloud.");
        }
        const userInput = document.getElementById('setup-username');
        const passInput = document.getElementById('setup-password');
        const pinInput = document.getElementById('setup-pin');
        if (userInput) userInput.value = '';
        if (passInput) passInput.value = '';
        if (pinInput) pinInput.value = '';
        this.nextSetupStep(startStep);
    }

    showLogin() {
        this.hideAllOverlays();
        const login = document.getElementById('login-overlay');
        const greeting = document.getElementById('login-greeting');
        const switcher = document.getElementById('login-account-switcher');
        const pinInput = document.getElementById('login-pin-input');
        const err = document.getElementById('login-error');
        const profileAvatar = document.getElementById('login-profile-avatar');
        const profileSubtitle = document.getElementById('login-profile-subtitle');
        if (!login || !greeting || !switcher || !pinInput) return;

        login.style.display = 'flex';
        this.refreshViewportProfile();
        this.startLockscreenClock();
        this.closeLockscreenAccessibility();
        this.syncLockscreenAccessibilityUi();

        const accountList = Object.keys(this.accounts || {});
        let html = `<div class="lockscreen-account-row">`;

        accountList.forEach(name => {
            const isActive = name === this.currentAccount;
            const accountProfile = (this.accounts[name] && this.accounts[name].profilePic) || "";
            const safeName = String(name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const profileMarkup = (typeof accountProfile === 'string' && (accountProfile.startsWith('data:') || accountProfile.startsWith('http')))
                ? `<img src="${accountProfile}" alt="${name}" class="lockscreen-avatar-img">`
                : `<span>${accountProfile || name.charAt(0).toUpperCase()}</span>`;

            html += `
                <button type="button" class="lockscreen-account ${isActive ? 'active' : ''}" onclick="windowManager.prepareAccount('${safeName}'); windowManager.showLogin();">
                    <div class="lockscreen-account-avatar">${profileMarkup}</div>
                    <div class="lockscreen-account-name">${name}</div>
                </button>
            `;
        });

        html += `
            <button type="button" class="lockscreen-account lockscreen-account-new" onclick="windowManager.showSetup(2)">
                <div class="lockscreen-account-avatar">+</div>
                <div class="lockscreen-account-name">Nouveau</div>
            </button>
        `;
        html += `</div>`;
        switcher.innerHTML = html;

        if (profileAvatar) {
            if (this.profilePic && (this.profilePic.startsWith('data:') || this.profilePic.startsWith('http'))) {
                profileAvatar.innerHTML = `<img src="${this.profilePic}" alt="${this.currentAccount || 'Profil'}">`;
            } else {
                profileAvatar.textContent = this.profilePic || (this.currentAccount ? this.currentAccount.charAt(0).toUpperCase() : 'U');
            }
        }
        greeting.textContent = this.currentAccount || 'Utilisateur';
        if (profileSubtitle) profileSubtitle.textContent = this.currentAccount ? 'Entrez votre code PIN' : 'Choisissez un compte pour continuer';
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 120);
        if (err) {
            err.textContent = '';
            err.style.opacity = '0';
        }
    }

    hideAllOverlays() {
        const setup = document.getElementById('setup-overlay');
        const login = document.getElementById('login-overlay');
        const desktop = document.getElementById('desktop');
        const whatsNew = document.getElementById('whats-new-modal');

        if (setup) setup.style.display = 'none';
        if (login) login.style.display = 'none';
        if (desktop) desktop.style.display = 'none';
        if (whatsNew) {
            whatsNew.style.display = 'none';
            whatsNew.classList.remove('active');
            whatsNew.setAttribute('aria-hidden', 'true');
        }

        this.stopLockscreenClock();
        this.closeLockscreenAccessibility();
    }

    handleLockscreenPad(value) {
        const input = document.getElementById('login-pin-input');
        if (!input) return;

        if (value === 'clear') {
            input.value = '';
        } else if (value === 'backspace') {
            input.value = input.value.slice(0, -1);
        } else if (/^\d$/.test(value) && input.value.length < 4) {
            input.value += value;
        }

        input.focus();
        if (input.value.length === 4 && this.currentAccount) {
            setTimeout(() => this.attemptLogin(), 90);
        }
    }

    attemptLogin() {
        if (!this.currentAccount) return this.notify("Erreur", "Veuillez choisir un compte.", 'system');
        const input = (document.getElementById('login-pin-input').value || '').trim();
        const err = document.getElementById('login-error');
        if (input === String(this.pin || '0000')) {
            this.unlockOS();
        } else if (err) {
            err.textContent = "PIN incorrect";
            err.style.opacity = "1";
            setTimeout(() => {
                err.style.opacity = "0";
            }, 2000);
        }
    }

    lockSession() {
        const login = document.getElementById('login-overlay');
        if (login && login.style.display !== 'none') return;

        const desktop = document.getElementById('desktop');
        if (desktop) {
            desktop.style.opacity = '0';
            desktop.style.filter = 'blur(14px)';
        }

        const launchpad = document.getElementById('launchpad');
        const spotlight = document.getElementById('spotlight-search');
        const controlCenter = document.querySelector('.control-center');
        if (launchpad && launchpad.classList.contains('active')) this.toggleLaunchpad();
        if (spotlight && spotlight.classList.contains('active')) this.toggleSearch();
        if (controlCenter) controlCenter.classList.remove('active');

        this.showLogin();
        this.notify('Session', 'Session verrouillee.', 'security');
    }

    unlockOS() {
        const login = document.getElementById('login-overlay');
        if (!login) return;
        this.stopLockscreenClock();
        login.style.transition = "opacity 0.5s";
        login.style.opacity = '0';
        setTimeout(() => {
            login.style.display = 'none';
            login.style.opacity = '1';
            this.launchDesktop();
        }, 500);
    }

    launchDesktop() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;

        desktop.style.display = "block";
        
        // Init default widgets if empty
        if (this.activeWidgets.length === 0) this.initDefaultWidgets();
        
        this.renderWidgets(); // V3 Widgets
        this.renderDesktop();
        setTimeout(() => {
            desktop.style.opacity = "1";
            desktop.style.filter = "blur(0)";
            this.setWallpaper(this.wallpaper);
            this.applyAccessibilitySettings();
            this.applyUIPreferences();
            this.refreshViewportProfile();
            this.syncImmersiveUI();
            this.fitWindowsToViewport();

            this.installedApps.forEach(id => this.installApp(id, null, true));

            const avatar = document.getElementById('start-avatar');
            const nameDisp = document.getElementById('start-username');
            if (avatar) {
                if (this.profilePic && (this.profilePic.startsWith('data:') || this.profilePic.startsWith('http'))) {
                    avatar.innerHTML = `<img src="${this.profilePic}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else if (this.profilePic) {
                    avatar.innerHTML = `<div style="width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px;">${this.profilePic}</div>`;
                } else {
                    avatar.textContent = this.userName.charAt(0).toUpperCase();
                }
            }
            if (nameDisp) nameDisp.textContent = this.userName;

            this.notify('AetherOS v2', `Content de vous revoir, ${this.userName}.`, 'system');
            setTimeout(() => this.showWhatsNew(), 360);
        }, 100);
    }

    async fetchAppsRegistry() {
        // Fallback robust for local files/server issues
        const fallbackRegistry = [
            { id: "snake", title: "Snake OS", creator: "FunnyCorp", description: "Le classique revisité.", category: "online", icon: "🐍" },
            { id: "tetris", title: "Tetris Neon", creator: "FunnyCorp", description: "Empilez les blocs.", category: "online", icon: "🧱" },
            { id: "flappy", title: "Flappy Futur", creator: "FunnyCorp", description: "Volez dans le futur.", category: "online", icon: "🐦" },
            { id: "talky", title: "Talky", creator: "FunnyCorp", description: "Messagerie instantanée.", category: "online", icon: "💬" },
            { id: "focusbox", title: "FocusBox", creator: "Vasseta1", description: "Timer Pomodoro.", category: "productivity", icon: "⏰" },
            { id: "android", title: "Android Subsystem", creator: "System", description: "APK Runner", category: "system", icon: "🤖" },
            { id: "maps", title: "AetherMaps", creator: "FunnyCorp", description: "Cartes", category: "productivity", icon: "🗺️" },
            { id: "camera", title: "SnapCam", creator: "FunnyCorp", description: "Camera", category: "productivity", icon: "📸" }
        ];

        try {
            const response = await fetch('apps/registry.json');
            if (response.ok) {
                this.appsRegistry = await response.json();
            } else {
                this.appsRegistry = fallbackRegistry;
            }

            // 2. Try to "scan" for extra .html apps
            try {
                const dirResp = await fetch('apps/');
                if (dirResp.ok) {
                    const text = await dirResp.text();
                    const htmlMatch = /href="([^"]+\.html)"/g;
                    let match;
                    while ((match = htmlMatch.exec(text)) !== null) {
                        const filename = match[1];
                        const id = filename.split('/').pop().replace('.html', '');
                        const systemApps = ['registry', 'index', 'store', 'settings', 'terminal', 'activity', 'calc', 'browser'];
                        if (!this.appsRegistry.find(a => a.id === id) && !systemApps.includes(id)) {
                            const cleanTitle = id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ').replace(/-/g, ' ');
                            this.appsRegistry.push({
                                id: id, title: cleanTitle, creator: "Auto Discovery",
                                description: "Application trouvée automatiquement.", category: "all", icon: "📦"
                            });
                        }
                    }
                }
            } catch (scanErr) { }
        } catch (e) {
            console.warn("Registry fetch failed, using fallback.");
            this.appsRegistry = fallbackRegistry;
        }

    // V3.1: Merge Custom AI Apps
    if (this.customApps && this.customApps.length > 0) {
        // Filter out duplicates if any
        const customIds = new Set(this.customApps.map(a => a.id));
        this.appsRegistry = [...this.appsRegistry.filter(a => !customIds.has(a.id)), ...this.customApps];
    }

        const deletedIds = new Set(this.getDeletedAppIds());
        if (deletedIds.size > 0) {
            this.appsRegistry = this.appsRegistry.filter(app => app && !deletedIds.has(app.id));
        }

        // --- APPLY PERSISTENT OVERRIDES (Moderation) ---
        this.applyRegistryOverridesFromStorage();

        // --- RELOAD UI IF NEEDED ---
        if (document.getElementById('launchpad-grid')) this.renderLaunchpad();
        // Notify store if it's open to refresh its local 'apps' metadata
        const storeWin = this.windows.get('store');
        if (storeWin && storeWin.iframe) {
            storeWin.iframe.contentWindow.postMessage({ type: 'AETHER_REGISTRY_UPDATED' }, '*');
        }
    }

    registerCustomApp(app) {
        const existingIndex = this.customApps.findIndex(a => a.id === app.id);
        if (existingIndex >= 0) this.customApps[existingIndex] = app;
        else this.customApps.push(app);
        
        localStorage.setItem('aether_custom_apps', JSON.stringify(this.customApps));
        this.setDeletedAppIds(this.getDeletedAppIds().filter(id => id !== app.id));
        this.fetchAppsRegistry();
        this.notify('App Store', `Application ${app.title} ajoutée au registre !`, 'store');
    }

    deleteRegistryApp(id) {
        if (!id) return false;

        this.customApps = this.customApps.filter(app => app && app.id !== id);
        localStorage.setItem('aether_custom_apps', JSON.stringify(this.customApps));

        const deletedIds = this.getDeletedAppIds();
        if (!deletedIds.includes(id)) deletedIds.push(id);
        this.setDeletedAppIds(deletedIds);

        this.uninstallApp(id);
        this.fetchAppsRegistry();
        this.notify('Moderation', `${id} a ete supprime du registre.`, 'store');
        return true;
    }

    setNotificationPreferences(partial = {}) {
        const current = (this.uiPreferences && this.uiPreferences.notifications)
            ? this.uiPreferences.notifications
            : this.getDefaultNotificationPreferences();
        const next = {
            ...current,
            ...(partial && typeof partial === 'object' ? partial : {}),
            types: {
                ...(current.types || {}),
                ...((partial && typeof partial === 'object' && partial.types && typeof partial.types === 'object') ? partial.types : {})
            }
        };
        this.uiPreferences = this.sanitizeUIPreferences({ ...(this.uiPreferences || {}), notifications: next });
        if (this.saveUserData) this.saveUserData();
        return this.uiPreferences.notifications;
    }

    notify(title, msg, type = 'system', opts = null) {
        if (type && typeof type === 'object') {
            opts = type;
            type = 'system';
        }
        const options = (opts && typeof opts === 'object') ? opts : {};
        const prefs = (this.uiPreferences && this.uiPreferences.notifications)
            ? this.uiPreferences.notifications
            : this.getDefaultNotificationPreferences();
        if (!options.force) {
            if (!prefs.enabled) return;
            if (prefs.types && Object.prototype.hasOwnProperty.call(prefs.types, type) && prefs.types[type] === false) return;
        }

        const container = document.getElementById('notifications-container');
        if (!container) return;
        const n = document.createElement('div');
        n.className = 'notification';
        n.setAttribute('data-type', String(type || 'system'));
        n.innerHTML = `<strong>${title}</strong><br><small style="opacity:0.8;">${msg}</small>`;
        n.onclick = () => n.remove();
        container.appendChild(n);
        while (container.children.length > 6) {
            container.removeChild(container.firstElementChild);
        }
        const duration = Number.isFinite(Number(options.durationMs)) ? Number(options.durationMs) : prefs.durationMs;
        setTimeout(() => n.remove(), Math.min(60000, Math.max(800, duration)));
    }

    getDefaultWindowRect(index = this.windows.size) {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const mobile = vw <= 900;
        const margin = mobile ? 8 : 18;

        const widthRatio = mobile ? 0.96 : 0.74;
        const heightRatio = mobile ? 0.7 : 0.76;

        const maxWidth = Math.max(280, vw - (margin * 2));
        const maxHeight = Math.max(240, vh - (mobile ? 95 : 70));

        const width = Math.max(Math.min(560, maxWidth), Math.min(maxWidth, Math.round(vw * widthRatio)));
        const height = Math.max(Math.min(360, maxHeight), Math.min(maxHeight, Math.round(vh * heightRatio)));

        // V3: Mobile App Window Logic (Portrait)
        if (this.windows.get('android_running')) {
             return {
                top: '50px',
                left: 'calc(50% - 180px)',
                width: '360px',
                height: '640px'
            };
        }

        const stagger = mobile ? 12 : 24;
        const left = Math.min(Math.max(margin, margin + (index * stagger)), Math.max(margin, vw - width - margin));
        const top = Math.min(Math.max(margin, 52 + (index * stagger)), Math.max(margin, vh - height - margin));

        return {
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            height: `${height}px`
        };
    }

    fitWindowsToViewport() {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const margin = vw <= 900 ? 8 : 16;
        const dockSafeArea = vw <= 900 ? 95 : 32;

        this.windows.forEach(winData => {
            if (!winData || !winData.element || winData.isMaximized) return;
            const el = winData.element;

            const maxWidth = Math.max(260, vw - (margin * 2));
            const maxHeight = Math.max(220, vh - dockSafeArea - margin);

            const currentWidth = parseFloat(el.style.width) || maxWidth;
            const currentHeight = parseFloat(el.style.height) || maxHeight;
            const minWidth = Math.min(360, maxWidth);
            const minHeight = Math.min(260, maxHeight);

            const width = Math.max(minWidth, Math.min(currentWidth, maxWidth));
            const height = Math.max(minHeight, Math.min(currentHeight, maxHeight));

            const currentLeft = parseFloat(el.style.left) || margin;
            const currentTop = parseFloat(el.style.top) || margin;
            const left = Math.min(Math.max(currentLeft, margin), Math.max(margin, vw - width - margin));
            const top = Math.min(Math.max(currentTop, margin), Math.max(margin, vh - height - margin));

            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;

            winData.originalRect = {
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${height}px`
            };
        });
    }

    createWindow(id, title, isApp = false) {
        if (this.windows.has(id)) {
            const winData = this.windows.get(id);
            if (winData.element.classList.contains('minimized')) this.restoreWindow(id);
            this.focusWindow(id);
            return;
        }

        const win = document.createElement('div');
        win.id = `window-${id}`;
        win.className = 'window';

        const rect = this.getDefaultWindowRect(this.windows.size);
        win.style.top = rect.top;
        win.style.left = rect.left;
        win.style.width = rect.width;
        win.style.height = rect.height;

        // V3: Special handling for Android Apps (Portrait Mode)
        if (id.startsWith('apk_') || id === 'android') {
            win.style.width = '375px';
            win.style.height = '680px';
            win.style.borderRadius = '24px'; // Phone look
        }

        const isOnline = id.startsWith('online_');
        win.innerHTML = `
            <div class="window-titlebar">
                <div class="window-controls">
                    <div class="control control-close" onclick="windowManager.closeWindow('${id}')"></div>
                    <div class="control control-min" onclick="windowManager.minimizeWindow('${id}')"></div>
                    <div class="control control-max" onclick="windowManager.toggleMaximizeWindow('${id}')"></div>
                </div>
                <div class="window-title">${title} ${isOnline ? '[ONLINE]' : ''}</div>
            </div>
            ${isOnline ? `
                <div class="p2p-bar" style="background:rgba(0,0,0,0.5); padding:8px; display:flex; gap:10px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:11px; align-items:center;">
                    <span id="my-id-${id}" style="color:#0f0;">ID: ...</span>
                    <input type="text" id="peer-id-${id}" placeholder="Entrer ID Ami" style="background:rgba(255,255,255,0.1); border:1px solid #444; color:white; padding:4px 8px; border-radius:6px; flex:1; outline:none;">
                    <button onclick="windowManager.connectToPeer('${id}')" style="background:#0A84FF; border:none; color:white; padding:4px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">Connecter</button>
                    <span id="status-${id}" style="color:#FFBC2E;">Attente</span>
                </div>
            ` : ''}
            <div class="window-content" id="content-${id}" style="flex: 1; overflow:hidden; position:relative;">
                ${this.getAppContent(id)}
            </div>
        `;

        document.getElementById('window-container').appendChild(win);
        this.focusWindow(id);

        const iframe = document.getElementById(`iframe-${id}`);
        const winData = {
            element: win,
            iframe: iframe,
            isMaximized: false,
            originalRect: { top: win.style.top, left: win.style.left, width: win.style.width, height: win.style.height },
            peer: isOnline ? new Peer() : null
        };

        if (isOnline) {
            winData.peer.on('open', (pid) => {
                const el = document.getElementById(`my-id-${id}`);
                if (el) el.textContent = `ID: ${pid.slice(0, 6)}`;
            });
            winData.peer.on('connection', (c) => this.setupConnection(id, c));
        }

        this.windows.set(id, winData);
        this.setupDragging(win, id);
        win.addEventListener('mousedown', () => this.focusWindow(id));
        win.addEventListener('blur', () => win.classList.remove('focused'));

        const dockItem = document.getElementById(`dock-item-${id}`);
        if (dockItem) dockItem.classList.add('active-app');

        this.fitWindowsToViewport();
        this.initAppLogic(id);
    }

    getAppContent(id) {
        const localFileAliases = { webos: 'browser', sheets: 'excel', slides: 'powerpoint', docs: 'word' };
        const localFirstApps = new Set(['docs', 'word', 'sheets', 'excel', 'slides', 'powerpoint']);
        if (localFirstApps.has(id)) {
            const resolvedId = localFileAliases[id] || id;
            const appFile = `apps/${resolvedId}.html`;
            return `<iframe src="${appFile}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        const registryAppInfo = this.appsRegistry.find(app => app && app.id === id);
        if (registryAppInfo && registryAppInfo.url) {
            // V3.1: URL-based apps are wrapped in the browser component (proxy-capable)
            const browserSrc = `apps/newbrowser.html#url=${encodeURIComponent(registryAppInfo.url)}`;
            return `<iframe src="${browserSrc}" style="width:100%; height:100%; border:none; background:#1e1e1e;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        // V3: Running an installed APK
        if (id.startsWith('apk_')) {
            const realName = id.replace('apk_', '');
            // Simulation of running the app via a web wrapper
            let webUrl = 'https://www.google.com/search?igu=1&q=' + realName;
            if (realName.includes('tiktok')) webUrl = 'https://www.tiktok.com/embed';
            if (realName.includes('instagram')) webUrl = 'https://www.instagram.com';
            if (realName.includes('spotify')) webUrl = 'https://open.spotify.com';
            if (realName.includes('discord')) webUrl = 'https://discord.com/app';
            
            return `<iframe src="${webUrl}" style="width:100%; height:100%; border:none; background:white;" allow="camera;microphone;geolocation"></iframe>`;
        }

        // V3: New Apps
        if (id === 'maps') return `<iframe src="https://www.openstreetmap.org/export/embed.html" style="width:100%; height:100%; border:none;"></iframe>`;
        if (id === 'camera') return `<div style="height:100%; display:flex; flex-direction:column; background:black;"><video id="cam-${id}" autoplay style="flex:1; object-fit:cover;"></video><div style="padding:20px; text-align:center;"><button onclick="alert('Photo prise !')" style="width:60px; height:60px; border-radius:50%; background:white; border:4px solid rgba(0,0,0,0.2);"></button></div><script>navigator.mediaDevices.getUserMedia({video:true}).then(s=>document.getElementById('cam-${id}').srcObject=s)</script></div>`;

        const normalizeExternalUrl = (raw) => {
            const value = (raw || '').trim();
            if (!value) return '';
            const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
            try {
                const parsed = new URL(withProtocol);
                return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
            } catch (err) {
                return '';
            }
        };

        const registryApp = Array.isArray(this.appsRegistry)
            ? this.appsRegistry.find(app => app && app.id === id)
            : null;

        if (registryApp) {
            if (registryApp.type === 'site') {
                const registryUrl = normalizeExternalUrl(registryApp.url);
                if (registryUrl) {
                    const browserSrc = `apps/newbrowser.html#url=${encodeURIComponent(registryUrl)}`;
                    return `<iframe src="${browserSrc}" style="width:100%; height:100%; border:none; background:#1e1e1e;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                }
            }

            if (registryApp.type === 'microtool') {
                const toolId = encodeURIComponent(registryApp.toolId || registryApp.id || id);
                const toolName = encodeURIComponent(registryApp.title || id);
                return `<iframe src="apps/microtools.html?tool=${toolId}&name=${toolName}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }

            if (typeof registryApp.appFile === 'string' && registryApp.appFile.trim()) {
                const rawFile = registryApp.appFile.trim();
                const appSrc = rawFile.startsWith('apps/') ? rawFile : `apps/${rawFile}`;
                return `<iframe src="${appSrc}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }
        }
    
    // V3.1: Custom AI Apps (Code based)
    if (registryApp && registryApp.code) {
        return `<iframe srcdoc='${registryApp.code.replace(/'/g, "&#39;")}' style="width:100%; height:100%; border:none; background:white;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
    }

        if (id.startsWith('dev_app_')) {
            const code = (this.devApps[id] || '').replace(/'/g, "&#39;");
            return `<iframe srcdoc='${code}' style="width:100%; height:100%; border:none; background:white;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        if (id.startsWith('dev_url_')) {
            const previewUrl = normalizeExternalUrl(this.devUrls[id]);
            if (previewUrl) {
                return `<iframe src="${previewUrl}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }
        }

        try {
            const approved = JSON.parse(localStorage.getItem('aether_approved_apps') || '[]');
            const communityApp = approved.find(app => app.id === id);
            if (communityApp) {
                if (communityApp.type === 'site') {
                    const siteUrl = normalizeExternalUrl(communityApp.url);
                    if (siteUrl) {
                        return `<iframe src="${siteUrl}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                    }
                } else if (communityApp.code) {
                    return `<iframe srcdoc='${communityApp.code.replace(/'/g, "&#39;")}' style="width:100%; height:100%; border:none; background:white;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                }
            }
        } catch (err) {
            console.warn('Unable to resolve community app payload', err);
        }

        const fileAliases = { webos: 'browser', sheets: 'excel', slides: 'powerpoint', docs: 'word' };
        const resolvedId = fileAliases[id] || id;
        const appFile = ['store', 'settings', 'terminal', 'activity', 'calc', 'webos', 'sheets', 'slides'].includes(id)
            ? `apps/${fileAliases[id] || id}.html`
            : `apps/${resolvedId}.html`;

        return `<iframe src="${appFile}" style="width:100%; height:100%; border:none; background:#0f172a;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
    }

    initIframeUser(id) {
        const iframe = document.getElementById(`iframe-${id}`);
        if (!iframe) return;

        iframe.contentWindow.postMessage({
            type: 'funnyweb_user_sync',
            userName: this.userName,
            pin: this.pin,
            sessionID: this.sessionID,
            profilePic: this.profilePic,
            theme: this.theme,
            timeZone: this.timeZone,
            timeFormat: this.timeFormat,
            accessibility: this.accessibility,
            uiPreferences: this.uiPreferences,
            vfs: this.vfs
        }, '*');

        if (this.pendingDocumentOpens && this.pendingDocumentOpens.has(id)) {
            this.flushDocumentOpen(id);
        }
    }

    scheduleDocumentOpen(id, payload) {
        if (!this.pendingDocumentOpens) this.pendingDocumentOpens = new Map();
        this.pendingDocumentOpens.set(id, payload);
        this.flushDocumentOpen(id);
    }

    flushDocumentOpen(id, attempt = 0) {
        const pending = this.pendingDocumentOpens && this.pendingDocumentOpens.get(id);
        if (!pending) return;

        const iframe = document.getElementById(`iframe-${id}`);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(pending, '*');
        }

        if (attempt >= 5) {
            this.pendingDocumentOpens.delete(id);
            return;
        }

        setTimeout(() => {
            if (this.pendingDocumentOpens && this.pendingDocumentOpens.has(id)) {
                this.flushDocumentOpen(id, attempt + 1);
            }
        }, 250 + (attempt * 150));
    }

    syncAllIframes() {
        this.windows.forEach((win, id) => {
            const iframe = document.getElementById(`iframe-${id}`);
            if (iframe) {
                iframe.contentWindow.postMessage({
                    type: 'funnyweb_vfs_update',
                    vfs: this.vfs
                }, '*');
            }
        });
    }

    normalizeVfsPath(path) {
        const raw = typeof path === 'string' ? path.trim() : '';
        if (!raw) return '/';
        const withSlashes = raw.replace(/\\/g, '/');
        const withLeading = withSlashes.startsWith('/') ? withSlashes : `/${withSlashes}`;
        const collapsed = withLeading.replace(/\/{2,}/g, '/');
        if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
        return collapsed;
    }

    vfs_read(path) {
        const normalized = this.normalizeVfsPath(path);
        return this.vfs[normalized];
    }

    vfs_write(path, content, type = "file") {
        path = this.normalizeVfsPath(path);
        this.vfs[path] = {
            type: type,
            content: content,
            lastModified: Date.now(),
            children: type === "folder" ? {} : undefined
        };

        const lastSlash = path.lastIndexOf('/');
        let parentDir = path.substring(0, lastSlash);
        if (parentDir === "") parentDir = "/";

        if (this.vfs[parentDir] && this.vfs[parentDir].type === "folder") {
            if (!this.vfs[parentDir].children) this.vfs[parentDir].children = {};
            this.vfs[parentDir].children[path] = type;
        }

        this.saveUserData();
        this.syncAllIframes();
        this.renderDesktop(); // Refresh desktop icons
        if (this.currentAccount) {
            this.upsertVfsEntryToSupabase(this.currentAccount, path, this.vfs[path]).catch(() => {});
        }
    }

    vfs_delete(path) {
        path = this.normalizeVfsPath(path);
        delete this.vfs[path];
        const lastSlash = path.lastIndexOf('/');
        let parentDir = path.substring(0, lastSlash);
        if (parentDir === "") parentDir = "/";

        if (this.vfs[parentDir] && this.vfs[parentDir].children) {
            delete this.vfs[parentDir].children[path];
        }
        this.saveUserData();
        this.syncAllIframes();
        this.renderDesktop(); // Refresh desktop icons
        if (this.currentAccount) {
            this.deleteVfsEntryFromSupabase(this.currentAccount, path).catch(() => {});
        }
    }

    setWallpaper(theme) {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;
        const selectedTheme = typeof theme === 'string' ? theme : '';

        if (selectedTheme === 'default') this.wallpaper = "var(--bg-image)";
        else if (selectedTheme === 'gradient') this.wallpaper = "linear-gradient(135deg, #1e293b, #4c1d95)";
        else if (selectedTheme === 'blue') this.wallpaper = "#0f172a";
        else if (selectedTheme === 'dark') this.wallpaper = "#020617";
        else if (selectedTheme === 'sunset') this.wallpaper = "linear-gradient(135deg, #f64f59, #12c2e9)";
        else this.wallpaper = (selectedTheme.startsWith('data:') || selectedTheme.startsWith('http')) ? `url('${selectedTheme}')` : selectedTheme;

        // V3: Fix wallpaper stretching
        if (desktop) {
            desktop.style.backgroundSize = "cover";
            desktop.style.backgroundRepeat = "no-repeat";
            desktop.style.backgroundPosition = "center";
        }

        const layers = document.querySelectorAll('#setup-overlay, #login-overlay, #desktop');
        const hasImageLayer = /url\(|gradient|var\(/.test(this.wallpaper);
        layers.forEach(el => {
            if (hasImageLayer) {
                el.style.backgroundImage = this.wallpaper;
                el.style.backgroundColor = 'transparent';
                el.style.backgroundSize = "cover";
                el.style.backgroundPosition = "center center";
                el.style.backgroundRepeat = "no-repeat";
                el.style.backgroundAttachment = "fixed";
                el.style.height = "100vh"; // Force full height
                el.style.width = "100vw";
            } else {
                el.style.backgroundColor = this.wallpaper;
                el.style.backgroundImage = 'none';
            }
        });

        this.saveUserData();
    }

    setTheme(theme = 'dark') {
        const normalized = theme === 'light' ? 'light' : 'dark';
        const root = document.documentElement;
        if (root) root.setAttribute('data-theme', normalized);
        if (document.body) document.body.dataset.theme = normalized;
        this.theme = normalized;
        try { localStorage.setItem('aether_theme', normalized); } catch (err) { }
        if (this.currentAccount) this.saveUserData();
    }

    setAccentColor(color = '#0078d4') {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--accent', color);
        root.style.setProperty('--accent-glow', color);
        root.style.setProperty('--primary', color);
        this.saveUserData();
    }

    setUIScale(scale = 100) {
        const safeScale = Math.max(80, Math.min(150, Number(scale) || 100));
        document.body.style.zoom = `${safeScale}%`;
        this.uiScale = safeScale;
        this.saveUserData();
    }

    applyAccessibilitySettings() {
        const root = document.body;
        if (!root) return;
        root.style.fontSize = this.accessibility.fontSize || '14px';
        root.classList.toggle('high-contrast', !!this.accessibility.highContrast);
    }

    applyUIPreferences() {
        const dock = document.getElementById('dock');
        const tray = document.querySelector('.system-tray');
        const installed = document.getElementById('installed-apps');
        if (!dock || !tray || !installed) return;

        this.uiPreferences = this.sanitizeUIPreferences(this.uiPreferences || {});
        const prefs = this.uiPreferences;
        const responsiveMobile = window.innerWidth <= 900;
        const effectiveDockPosition = responsiveMobile ? 'bottom' : prefs.dockPosition;

        const basePreset = {
            compact: { item: 38, icon: 22, padding: '10px 8px', gap: 7, radius: '22px' },
            normal: { item: 46, icon: 26, padding: '15px 10px', gap: 10, radius: '28px' },
            large: { item: 56, icon: 30, padding: '18px 14px', gap: 12, radius: '30px' }
        }[prefs.dockSize];

        const sizePreset = responsiveMobile
            ? {
                item: Math.min(42, basePreset.item),
                icon: Math.min(22, basePreset.icon),
                padding: '8px 8px',
                gap: Math.max(6, basePreset.gap - 2),
                radius: '18px'
            }
            : basePreset;

        dock.dataset.layout = effectiveDockPosition;
        dock.dataset.traystyle = prefs.trayStyle;
        tray.dataset.layout = effectiveDockPosition;
        tray.dataset.mode = prefs.trayStyle;
        tray.classList.toggle('tray-attached', prefs.trayStyle === 'attached');

        dock.style.left = 'auto';
        dock.style.right = 'auto';
        dock.style.top = 'auto';
        dock.style.bottom = 'auto';
        dock.style.transform = 'none';
        tray.style.left = 'auto';
        tray.style.right = 'auto';
        tray.style.top = 'auto';
        tray.style.bottom = 'auto';
        tray.style.transform = 'none';

        if (effectiveDockPosition === 'bottom') {
            dock.style.left = '50%';
            dock.style.bottom = responsiveMobile ? '8px' : '18px';
            dock.style.transform = 'translateX(-50%)';
            dock.style.flexDirection = 'row';
            installed.style.flexDirection = 'row';
            installed.style.alignItems = 'center';
            dock.style.maxWidth = `calc(100vw - ${responsiveMobile ? 16 : 28}px)`;
        } else if (effectiveDockPosition === 'right') {
            dock.style.right = '20px';
            dock.style.top = '50%';
            dock.style.transform = 'translateY(-50%)';
            dock.style.flexDirection = 'column';
            installed.style.flexDirection = 'column';
            installed.style.alignItems = 'center';
            dock.style.maxWidth = '';
        } else if (effectiveDockPosition === 'top') {
            dock.style.left = '50%';
            dock.style.top = responsiveMobile ? '8px' : '18px';
            dock.style.transform = 'translateX(-50%)';
            dock.style.flexDirection = 'row';
            installed.style.flexDirection = 'row';
            installed.style.alignItems = 'center';
            dock.style.maxWidth = `calc(100vw - ${responsiveMobile ? 16 : 28}px)`;
        } else {
            dock.style.left = '20px';
            dock.style.top = '50%';
            dock.style.transform = 'translateY(-50%)';
            dock.style.flexDirection = 'column';
            installed.style.flexDirection = 'column';
            installed.style.alignItems = 'center';
            dock.style.maxWidth = '';
        }

        dock.style.padding = effectiveDockPosition === 'bottom'
            ? `${Math.max(7, sizePreset.gap)}px ${Math.max(10, sizePreset.gap + 6)}px`
            : sizePreset.padding;
        dock.style.gap = `${sizePreset.gap}px`;
        dock.style.borderRadius = sizePreset.radius;
        installed.style.gap = `${Math.max(6, sizePreset.gap)}px`;
        installed.style.flexWrap = responsiveMobile ? 'wrap' : 'nowrap';

        document.querySelectorAll('#dock .dock-item').forEach(item => {
            item.style.width = `${sizePreset.item}px`;
            item.style.height = `${sizePreset.item}px`;
        });
        document.querySelectorAll('#dock .dock-icon').forEach(icon => {
            icon.style.fontSize = `${sizePreset.icon}px`;
        });

        const positionTray = () => {
            const dockRect = dock.getBoundingClientRect();
            tray.style.right = responsiveMobile ? '12px' : '24px';
            tray.style.bottom = responsiveMobile ? '84px' : '24px';

            if (prefs.trayStyle !== 'attached') {
                if (responsiveMobile) tray.style.left = 'auto';
                return;
            }

            if (effectiveDockPosition === 'bottom') {
                const margin = responsiveMobile ? 8 : 12;
                const dockBottom = parseFloat(dock.style.bottom || (responsiveMobile ? '8' : '18')) || (responsiveMobile ? 8 : 18);
                tray.style.bottom = responsiveMobile ? `${dockBottom + 64}px` : `${dockBottom}px`;

                if (responsiveMobile) {
                    tray.style.right = '12px';
                    tray.style.left = 'auto';
                    return;
                }

                const preferredLeft = dockRect.right + margin;
                const trayWidth = tray.offsetWidth || 90;
                if (preferredLeft + trayWidth <= window.innerWidth - 10) {
                    tray.style.left = `${preferredLeft}px`;
                    tray.style.right = 'auto';
                } else {
                    const fallbackLeft = Math.max(10, dockRect.left - trayWidth - margin);
                    tray.style.left = `${fallbackLeft}px`;
                    tray.style.right = 'auto';
                }
            } else if (effectiveDockPosition === 'right') {
                tray.style.right = `${Math.ceil(dockRect.width) + 18}px`;
                tray.style.bottom = '24px';
            } else if (effectiveDockPosition === 'top') {
                tray.style.top = responsiveMobile ? '74px' : `${Math.ceil(dockRect.bottom) + 12}px`;
                tray.style.right = '24px';
                tray.style.bottom = 'auto';
                tray.style.left = 'auto';
            } else {
                tray.style.left = `${Math.ceil(dockRect.right) + 16}px`;
                tray.style.bottom = '24px';
                tray.style.right = 'auto';
            }
        };

        requestAnimationFrame(positionTray);
        this.fitWindowsToViewport();
        updateClock();
    }

    isEditableTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toLowerCase();
        if (['input', 'textarea', 'select'].includes(tag)) return true;
        if (target.isContentEditable) return true;
        return false;
    }

    syncImmersiveUI() {
        const btn = document.getElementById('immersive-toggle-btn');
        if (!btn) return;
        btn.textContent = this.immersiveMode ? 'Quitter mode immersif' : 'Activer mode immersif';
        btn.style.background = this.immersiveMode ? '#ff5e57' : '#0A84FF';
    }

    async lockMetaKey() {
        const keyboard = navigator.keyboard;
        if (!keyboard || typeof keyboard.lock !== 'function') {
            this.keyboardLockActive = false;
            return false;
        }
        try {
            await keyboard.lock(['Meta']);
            this.keyboardLockActive = true;
            return true;
        } catch (err) {
            this.keyboardLockActive = false;
            return false;
        }
    }

    unlockMetaKey() {
        const keyboard = navigator.keyboard;
        if (keyboard && typeof keyboard.unlock === 'function') {
            keyboard.unlock();
        }
        this.keyboardLockActive = false;
    }

    handleFullscreenStateChange() {
        this.immersiveMode = !!document.fullscreenElement;
        if (!this.immersiveMode) {
            this.unlockMetaKey();
        } else {
            this.lockMetaKey();
        }
        this.syncImmersiveUI();
    }

    async toggleImmersiveMode(force = null) {
        const shouldEnable = typeof force === 'boolean'
            ? force
            : !document.fullscreenElement;

        if (shouldEnable) {
            if (!document.fullscreenElement) {
                try {
                    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
                } catch (err) {
                    this.notify('Mode immersif', 'Le navigateur a bloqué le plein écran.', 'immersive');
                    return;
                }
            }
            this.immersiveMode = true;
            const locked = await this.lockMetaKey();
            this.syncImmersiveUI();
            this.notify('Mode immersif', locked
                ? 'Plein écran activé. La touche Windows ouvre le menu Aether.'
                : 'Plein écran activé. Verrou clavier indisponible sur ce navigateur.', 'immersive');
            return;
        }

        try {
            if (document.fullscreenElement && document.exitFullscreen) {
                await document.exitFullscreen();
            }
        } catch (err) { }
        this.immersiveMode = false;
        this.unlockMetaKey();
        this.syncImmersiveUI();
        this.notify('Mode immersif', 'Désactivé.', 'immersive');
    }

    handleWallpaperUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.setWallpaper(event.target.result);
        };
        reader.readAsDataURL(file);
    }

    handleProfilePicUpload(e) {
        const file = e && e.target && e.target.files ? e.target.files[0] : null;
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.profilePic = event.target.result;
            this.saveUserData();
            this.syncAllIframes();
            const avatar = document.getElementById('start-avatar');
            if (avatar) {
                avatar.innerHTML = `<img src="${this.profilePic}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            }
            this.notify("Profil", "Photo de profil mise à jour.", 'settings_change');
        };
        reader.readAsDataURL(file);
    }

    // V3: Desktop Widgets System
    initDefaultWidgets() {
        this.activeWidgets = [
            { id: 'w_clock', type: 'clock', x: window.innerWidth - 340, y: 40 },
            { id: 'w_sys', type: 'system', x: window.innerWidth - 340, y: 180 }
        ];
    }

    renderWidgets() {
        let container = document.getElementById('desktop-widgets');
        if (!container) {
            container = document.createElement('div');
            container.id = 'desktop-widgets';
            document.getElementById('desktop').appendChild(container);
        }
        container.innerHTML = ''; // Clear and redraw
        
        this.activeWidgets.forEach(w => {
            const el = document.createElement('div');
            el.className = 'widget';
            el.id = w.id;
            el.style.left = w.x + 'px';
            el.style.top = w.y + 'px';
            el.style.width = w.type === 'clock' ? '280px' : '280px';
            
            // Content based on type
            if (w.type === 'clock') {
                const date = new Date();
                el.innerHTML = `
                    <div style="font-size:42px; font-weight:800; line-height:1;">${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}</div>
                    <div style="opacity:0.7; font-size:14px; margin-top:5px;">${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                `;
            } else if (w.type === 'system') {
                el.innerHTML = `
                    <div style="font-size:11px; font-weight:700; margin-bottom:10px; opacity:0.6; letter-spacing:1px;">SYSTÈME</div>
                    <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;"><span>CPU</span> <span style="color:#28c840">12%</span></div>
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-bottom:10px;"><div style="width:12%; height:100%; background:#28c840; border-radius:2px;"></div></div>
                    <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;"><span>RAM</span> <span style="color:#0A84FF">3.4GB</span></div>
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px;"><div style="width:45%; height:100%; background:#0A84FF; border-radius:2px;"></div></div>
                `;
            } else if (w.type === 'battery') {
                el.innerHTML = `
                    <div style="font-size:24px;">🔋 85%</div>
                    <div style="font-size:12px; opacity:0.7;">Sur batterie</div>
                `;
            } else if (w.type === 'note') {
                el.style.width = '280px';
                el.style.height = '200px';
                el.innerHTML = `
                    <div style="font-size:11px; font-weight:700; margin-bottom:10px; opacity:0.6; letter-spacing:1px;">NOTE RAPIDE</div>
                    <textarea style="width:100%; height: 120px; background:transparent; border:none; color:white; resize:none; font-family:inherit; font-size:13px;" placeholder="Écrivez quelque chose...">${w.content || ''}</textarea>
                `;
                const textarea = el.querySelector('textarea');
                textarea.onchange = (e) => {
                    w.content = e.target.value;
                    this.saveUserData();
                };
            }

            // Drag Logic
            el.onmousedown = (e) => this.handleWidgetDrag(e, w);
            
            container.appendChild(el);
        });
    }

    handleWidgetDrag(e, widget) {
        e.stopPropagation();
        const el = document.getElementById(widget.id);
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseInt(el.style.left || 0);
        const startTop = parseInt(el.style.top || 0);

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            el.style.left = (startLeft + dx) + 'px';
            el.style.top = (startTop + dy) + 'px';
        };

        const onUp = (ev) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            // Save position
            widget.x = parseInt(el.style.left);
            widget.y = parseInt(el.style.top);
            this.saveUserData(); // Persist widget positions
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

removeWidget(id) {
    this.activeWidgets = this.activeWidgets.filter(w => w.id !== id);
    this.renderWidgets();
    this.saveUserData();
}

    renderDesktop() {
        const grid = document.getElementById('desktop-icons');
        if (!grid) return;

        const desktopFiles = Object.keys(this.vfs).filter(path => path.startsWith('/Bureau/') && path.split('/').length === 3);

        const html = desktopFiles.map(path => {
            const item = this.vfs[path];
            const name = path.split('/').pop();
            const icon = item.type === 'folder' ? '📁' : this.getFileIcon(name);

            return `
                <div class="desktop-icon" 
                     data-path="${path}" 
                     draggable="true" 
                     ondblclick="windowManager.openFile('${path}')"
                     ondragstart="windowManager.handleIconDragStart(event, '${path}')"
                     ondragover="event.preventDefault()">
                    <div class="icon-img">${icon}</div>
                    <div class="icon-label">${name}</div>
                </div>
            `;
        }).join('');

        grid.innerHTML = html;
    }

    getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
        if (ext === 'apk') return '🤖'; // V3 Icon
        if (ext === 'txt') return '📄';
        if (ext === 'html') return '🌐';
        if (ext === 'md' || ext === 'fdoc') return '📝';
        if (['fsheet', 'xlsx', 'xls', 'csv'].includes(ext)) return '📊';
        if (['fslides', 'ppt', 'pptx'].includes(ext)) return '📽️';
        if (ext === 'js') return '⚙️';
        return '📄';
    }

    openDocumentInApp(appId, title, path) {
        path = this.normalizeVfsPath(path);
        const item = this.vfs[path];
        const payload = {
            type: 'open_file',
            path,
            name: path.split('/').pop(),
            content: item ? item.content : null
        };
        this.createWindow(appId, title, true);
        this.scheduleDocumentOpen(appId, payload);
    }

    openPathPicker(targetWindowId, options = {}) {
        const requestId = `picker_${Date.now()}`;
        this.pathPickerState = {
            requestId,
            targetWindowId,
            mode: options.mode || 'folder',
            startPath: options.startPath || '/Documents'
        };
        this.createWindow('explorer', 'Fichiers', true);
        setTimeout(() => {
            const iframe = document.getElementById('iframe-explorer');
            if (iframe && iframe.contentWindow && this.pathPickerState && this.pathPickerState.requestId === requestId) {
                iframe.contentWindow.postMessage({
                    type: 'OS_PICK_PATH',
                    requestId,
                    mode: this.pathPickerState.mode,
                    startPath: this.pathPickerState.startPath
                }, '*');
            }
        }, 400);
        return requestId;
    }

    resolvePathPicker(requestId, path) {
        if (!this.pathPickerState || this.pathPickerState.requestId !== requestId) return;
        const targetWindowId = this.pathPickerState.targetWindowId;
        const iframe = document.getElementById(`iframe-${targetWindowId}`);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'OS_PATH_PICKED',
                requestId,
                path
            }, '*');
        }
        this.pathPickerState = null;
        if (this.windows.has('explorer')) this.focusWindow(targetWindowId);
    }

    openFile(path) {
        path = this.normalizeVfsPath(path);
        const item = this.vfs[path];
        if (!item) return;
        const name = path.split('/').pop();
        if (item.type === 'folder') {
            openApp('explorer');
        } else if (name.endsWith('.apk')) {
            // V3: APK Handler
            this.installApk(path);
        } else {
            const ext = name.split('.').pop().toLowerCase();
            if (ext === 'exe') {
                this.openDocumentInApp('windows_subsystem', 'Windows Subsystem', path);
            } else if (ext === 'txt' || ext === 'md' || ext === 'fdoc') {
                this.openDocumentInApp('word', 'FunnyWord Pro', path);
            } else if (['fsheet', 'xlsx', 'xls', 'csv'].includes(ext)) {
                this.openDocumentInApp('excel', 'FunnySheets', path);
            } else if (ext === 'json') {
                const content = typeof item.content === 'string' ? item.content : '';
                try {
                    const parsed = JSON.parse(content);
                    if (parsed && Array.isArray(parsed.sheets)) {
                        this.openDocumentInApp('excel', 'FunnySheets', path);
                    } else if (parsed && Array.isArray(parsed.slides)) {
                        this.openDocumentInApp('powerpoint', 'FunnySlides', path);
                    } else {
                        this.notify("SystÃ¨me", `Impossible d'ouvrir ${name} : format JSON non pris en charge.`, 'file');
                    }
                } catch (err) {
                    this.notify("SystÃ¨me", `Impossible d'ouvrir ${name} : JSON invalide.`, 'file');
                }
            } else if (['fslides', 'ppt', 'pptx'].includes(ext)) {
                this.openDocumentInApp('powerpoint', 'FunnySlides', path);
            } else if (ext === 'html') {
                const html = typeof item.content === 'string' ? item.content : '';
                const looksLikeWordDoc =
                    html.includes('font-family:Calibri,sans-serif;max-width:800px') ||
                    html.includes('data-aether-doc="word"');
                if (looksLikeWordDoc) {
                    this.openDocumentInApp('word', 'FunnyWord Pro', path);
                } else {
                    if (!this.devApps) this.devApps = {};
                    const testId = 'dev_app_' + Date.now();
                    this.devApps[testId] = item.content;
                    this.createWindow(testId, name, true);
                }
            } else {
                this.notify("Système", `Impossible d'ouvrir ${name} : aucun programme associé.`, 'file');
            }
        }
    }


    handleIconDragStart(e, path) {
        const iconNode = e.target.closest('.desktop-icon') || e.target;
        const rect = iconNode.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        e.dataTransfer.setData('sourcePath', path);
        e.dataTransfer.setData('offsetX', offsetX);
        e.dataTransfer.setData('offsetY', offsetY);
        e.dataTransfer.effectAllowed = 'move';

        // Hide original briefly if desired, or just use ghost
        iconNode.style.opacity = '0.4';
        setTimeout(() => { if (iconNode) iconNode.style.opacity = '1'; }, 10);
    }

    // V3: APK Installation Logic
    installApk(path) {
        const filename = path.split('/').pop();
        const appName = filename.replace('.apk', '').replace(/_/g, ' ');
        const id = 'apk_' + filename.replace('.apk', '').toLowerCase().replace(/[^a-z0-9]/g, '');
        
        this.notify("Android Subsystem", `Analyse du package ${filename}...`, 'install');
        
        setTimeout(() => {
            this.notify("Installation", `Installation de ${appName}...`, 'install');
            setTimeout(() => {
                // Add to installed apps
                this.installApp(id, appName);
                this.notify("Succès", `${appName} est installé !`, 'install');
            }, 2000);
        }, 1500);
    }

    handleDesktopDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const sourcePath = e.dataTransfer.getData('sourcePath');
        if (sourcePath) {
            // Already handled by CSS Grid layout.
            // If we wanted to allow custom sorting, we would slice/splice the vfs keys array, 
            // but for now auto-flow manages it gracefully.
            return;
        }

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target.result;
                    const isText = /\.(txt|html|md|js|css|json)$/i.test(file.name) && !file.name.endsWith('.apk');
                    const path = '/Bureau/' + file.name;
                    this.vfs_write(path, content, isText ? 'file' : 'binary');
                    this.saveUserData();
                    this.renderDesktop();
                };
                if (/\.(txt|html|md|js|css|json)$/i.test(file.name) && !file.name.endsWith('.apk')) reader.readAsText(file);
                else reader.readAsDataURL(file);
            }
        }
    }

    uninstallApp(id, winId = null) {
        // Remove from installedApps list
        this.installedApps = this.installedApps.filter(appId => appId !== id);
        this.saveUserData();

        // Update UI
        const dockItem = document.getElementById(`dock-item-${id}`);
        if (dockItem) dockItem.remove();

        // Some legacy ID check
        const icon = document.getElementById(`icon-${id}`);
        if (icon) {
            const dockItemFallback = icon.closest('.dock-item');
            if (dockItemFallback) dockItemFallback.remove();
        }

        const instAppsCont = document.getElementById(`inst-app-${id}`);
        if (instAppsCont) instAppsCont.remove();
        this.applyUIPreferences();

        // Close window if open
        this.closeWindow(id);

        this.notify("Désinstallation", `${id} a été supprimé du système.`, 'install');
        this.syncAllIframes(); // To update the Store view

        if (winId) {
            this.openProductPage(winId, id); // Refresh page to show OBTENIR
        }
    }

    toggleLaunchpad() {
        const lp = document.getElementById('launchpad');
        const input = document.querySelector('#launchpad .launchpad-search input');
        const isActive = lp.classList.contains('active');
        if (!isActive) {
            if (input) input.value = '';
            this.renderLaunchpad();
            lp.style.display = 'flex';
            setTimeout(() => lp.classList.add('active'), 10);
        } else {
            lp.classList.remove('active');
            setTimeout(() => { if (!lp.classList.contains('active')) lp.style.display = 'none'; }, 300);
        }
    }

    getApprovedAppsCatalog() {
        try {
            const parsed = JSON.parse(localStorage.getItem('aether_approved_apps') || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    resolveAppCatalogEntry(id) {
        if (!id) return null;

        const registryApp = this.appsRegistry.find(app => app && app.id === id);
        if (registryApp) {
            return {
                id,
                title: registryApp.title || gameTitles[id] || id,
                icon: registryApp.icon || appIcons[id] || '📦',
                description: registryApp.description || '',
                category: registryApp.category || 'productivity'
            };
        }

        const approvedApp = this.getApprovedAppsCatalog().find(app => app && app.id === id);
        if (approvedApp) {
            return {
                id,
                title: approvedApp.name || id,
                icon: approvedApp.icon || '📦',
                description: approvedApp.desc || '',
                category: approvedApp.cat || 'productivity'
            };
        }

        if (id.startsWith('dev_url_')) {
            return {
                id,
                title: `Site ${id.slice(-4)}`,
                icon: '🌐',
                description: 'Site installe localement.',
                category: 'online'
            };
        }

        if (id.startsWith('dev_app_')) {
            return {
                id,
                title: `App ${id.slice(-4)}`,
                icon: '🧪',
                description: 'Application HTML locale.',
                category: 'productivity'
            };
        }

        if (id.startsWith('apk_')) {
            return {
                id,
                title: id.replace('apk_', ''),
                icon: '🤖',
                description: 'Application Android',
                category: 'mobile'
            };
        }

        return {
            id,
            title: gameTitles[id] || id,
            icon: appIcons[id] || '📦',
            description: '',
            category: 'productivity'
        };
    }

    getInstalledLaunchpadApps(query = '') {
        const installedIds = Array.from(new Set((Array.isArray(this.installedApps) ? this.installedApps : []).filter(Boolean)));
        const normalizedQuery = String(query || '').trim().toLowerCase();
        
        const apps = installedIds
            .map(id => this.resolveAppCatalogEntry(id))
            .filter(Boolean);

        if (!normalizedQuery) return apps;

        return apps.filter(app => {
            const haystack = [app.id, app.title, app.description, app.category].join(' ').toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }

    renderLaunchpad() {
        const grid = document.getElementById('launchpad-grid');
        if (!grid) return;
        const apps = this.getInstalledLaunchpadApps();
        
        if (apps.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; padding:28px; border:1px solid rgba(255,255,255,0.08); border-radius:18px; background:rgba(255,255,255,0.04);">
                    <div style="font-size:15px; font-weight:700; margin-bottom:8px;">Aucune app installee</div>
                    <div style="font-size:12px; opacity:0.7; margin-bottom:14px;">Installe des apps via GridStore, puis elles apparaitront ici.</div>
                    <button class="launchpad-btn-sm" onclick="openApp('store')">Ouvrir GridStore</button>
                </div>
            `;
            return;
        }

        grid.innerHTML = apps.map(app => `
            <div class="launchpad-item" onclick="windowManager.installApp('${app.id}'); windowManager.toggleLaunchpad();">
                <div class="launchpad-icon">${this.renderAppIconMarkup(app.icon, '📦')}</div>
                <span>${app.title}</span>
            </div>
        `).join('');
    }

    toggleSearch() {
        const spotlight = document.getElementById('spotlight-search');
        if (!spotlight) return;
        const isActive = spotlight.classList.contains('active');
        if (!isActive) {
            spotlight.style.display = 'block';
            setTimeout(() => spotlight.classList.add('active'), 10);
            setTimeout(() => document.getElementById('spotlight-input').focus(), 150);
            if (document.getElementById('launchpad').classList.contains('active')) this.toggleLaunchpad();
        } else {
            spotlight.classList.remove('active');
            setTimeout(() => { if (!spotlight.classList.contains('active')) spotlight.style.display = 'none'; }, 300);
        }
    }

    filterSearch(q) {
        const query = q.toLowerCase();
        const spotlightResults = document.getElementById('search-results');
        const launchpadGrid = document.getElementById('launchpad-grid');
        const isLaunchpadActive = document.getElementById('launchpad').classList.contains('active');

        let results = [];

        // 1. Apps search
        const allApps = this.appsRegistry.length > 0 ? this.appsRegistry : [];
        allApps.forEach(app => {
            // V3 Fix: Better search matching
            if ((app.title || '').toLowerCase().includes(query) || app.id.toLowerCase().includes(query)) {
                results.push({ type: 'app', id: app.id, title: app.title, icon: app.icon || '📦', cat: app.category });
            }
        });

        // 2. VFS Files search (Spotlight only usually, but let's include)
        if (query.length > 1) {
            Object.keys(this.vfs).forEach(path => {
                const name = path.split('/').pop();
                if (name.toLowerCase().includes(query)) {
                    results.push({ type: 'file', id: path, title: name, icon: this.getFileIcon(name), cat: 'Fichier' });
                }
            });
        }

        // --- UPDATE SPOTLIGHT UI ---
        if (spotlightResults) {
            const spotlightHtml = results.slice(0, 8).map(res => `
                 <div class="search-item" style="display:flex; align-items:center; gap:15px; padding:12px 20px; cursor:pointer;" 
                      onclick="${res.type === 'app' ? `windowManager.installApp('${res.id}');` : `windowManager.openFile('${res.id}');`} windowManager.toggleSearch();">
                    <div style="font-size:24px; min-width:40px; text-align:center;">${res.icon}</div>
                    <div>
                        <div style="font-weight:600; font-size:14px;">${res.title}</div>
                        <div style="font-size:11px; opacity:0.5;">${res.cat || 'Élément'}</div>
                    </div>
                </div>
            `).join('');
            spotlightResults.innerHTML = spotlightHtml || '<p style="padding:40px; opacity:0.5; text-align:center; font-size:14px;">Aucun résultat trouvé pour "' + q + '"</p>';
        }

        // --- UPDATE LAUNCHPAD UI ---
        if (isLaunchpadActive && launchpadGrid) {
            const launchpadApps = this.getInstalledLaunchpadApps(q);
            const launchpadHtml = launchpadApps.map(app => `
                <div class="launchpad-item" onclick="windowManager.installApp('${app.id}'); windowManager.toggleLaunchpad();">
                    <div class="launchpad-icon">${this.renderAppIconMarkup(app.icon, '📦')}</div>
                    <span>${app.title}</span>
                </div>
            `).join('');
            launchpadGrid.innerHTML = launchpadHtml || '<p style="grid-column: 1/-1; padding:40px; opacity:0.5; text-align:center;">Aucune application installee trouvee.</p>';
        }
    }

    // --- P2P FIX ---
    setupConnection(id, conn) {
        this.activeWindows[id] = conn;
        const status = document.getElementById(`status-${id}`);
        if (status) { status.textContent = "Connecté !"; status.style.color = "#28c840"; }
        conn.on('data', (data) => {
            if (window[`onReceiveData_${id}`]) window[`onReceiveData_${id}`](data);
        });
    }

    connectToPeer(id) {
        const peerId = document.getElementById(`peer-id-${id}`).value;
        const conn = this.windows.get(id).peer.connect(peerId);
        conn.on('open', () => this.setupConnection(id, conn));
    }

    // --- MISC UTILS ---
    calcInput(k) {
        const d = document.getElementById('calc-display');
        if (!d) return;
        if (k === 'C') d.textContent = '0';
        else if (k === '=') { try { d.textContent = eval(d.textContent.replace('x', '*')); } catch { d.textContent = "Erreur"; } }
        else {
            if (d.textContent === '0' || d.textContent === 'Erreur') d.textContent = k;
            else d.textContent += k;
        }
    }

    browserNav(dir) {
        const frame = document.getElementById('browser-frame');
        if (frame) { if (dir === 'back') history.back(); else history.forward(); }
    }

    browserGoTo(url) {
        if (!url.startsWith('http')) url = 'https://' + url;
        const frame = document.getElementById('browser-frame');
        if (frame) frame.src = url;
    }

    // --- SETUP / OOBE ---
    nextSetupStep(step) {
        document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
        const next = document.getElementById(`step-${step}`);
        if (next) next.classList.add('active');
        if (step === 2) {
            this.setSetupBusy(false);
            setTimeout(() => {
                const input = document.getElementById('setup-username');
                if (input) input.focus();
            }, 100);
        }
    }

    finishSetupLegacy() {
        const nameInput = document.getElementById('setup-username-legacy') || document.getElementById('setup-username');
        const pinInput = document.getElementById('setup-pin-legacy') || document.getElementById('setup-pin');
        const name = nameInput.value.trim() || "Utilisateur";
        const existingKey = this.findAccountKey(name);

        if (existingKey) {
            return alert("Ce nom d'utilisateur existe déjà.");
        }

        this.currentAccount = name;
        this.userName = name;
        this.pin = pinInput.value || "0000";
        this.sessionID = this.generateSessionId(this.userName);
        this.accessibility = this.getDefaultAccessibility();
        this.uiPreferences = this.getDefaultUIPreferences();
        this.vfs = this.getDefaultVFS();
        this.installedApps = ["word", "excel", "powerpoint", "store", "explorer", "wiki"];
        this.saveAccounts();

        this.nextSetupStep('loading');
        setTimeout(() => {
            const overlay = document.getElementById('setup-overlay');
            overlay.style.transition = "opacity 0.8s, transform 0.8s";
            overlay.style.opacity = "0";
            overlay.style.transform = "scale(1.05)";
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.style.opacity = '1';
                overlay.style.transform = 'scale(1)';
                this.launchDesktop();
            }, 800);
        }, 1500);
    }

    async finishSetup() {
        await this.loadSupabaseConfigFromEnv();
        this.hydrateSetupFields();

        const modeInput = document.getElementById('setup-mode');
        const nameInput = document.getElementById('setup-username');
        const passwordInput = document.getElementById('setup-password');
        const pinInput = document.getElementById('setup-pin');

        const rawMode = (modeInput && modeInput.value) ? String(modeInput.value) : 'existing';
        const mode = (rawMode === 'create' || rawMode === 'local') ? rawMode : 'existing';
        const userName = (nameInput ? nameInput.value : '').trim();
        const password = (passwordInput ? passwordInput.value : '').trim();
        const pinValue = (pinInput ? pinInput.value : '').trim();
        const localPin = pinValue || '0000';
        const supabaseConfig = this.resolveSetupSupabaseConfig();

        this.showSetupError('');

        if (!userName) return this.showSetupError("Nom d'utilisateur requis.");
        if (!/^\d{4}$/.test(localPin)) return this.showSetupError("Le PIN local doit contenir exactement 4 chiffres.");
        if (mode !== 'local') {
            if (!password) return this.showSetupError("Mot de passe requis.");
            if (!this.isSupabaseReady(supabaseConfig)) {
                return this.showSetupError("Supabase non configure. Choisis « Compte local » ou renseigne .env (AETHER_SUPABASE_URL, AETHER_SUPABASE_ANON_KEY ou AETHER_SUPABASE_SERVICE_ROLE_KEY, AETHER_SUPABASE_TABLE).");
            }
        }

        this.setSetupBusy(true);
        try {
            const existingLocalKey = this.findAccountKey(userName);
            const existingLocal = existingLocalKey ? this.accounts[existingLocalKey] : null;

            if (mode === 'local') {
                if (!existingLocal) {
                    this.currentAccount = userName;
                    this.userName = userName;
                    this.pin = localPin;
                    this.sessionID = this.generateSessionId(this.userName);
                    this.profilePic = "";
                    this.wallpaper = "var(--bg-image)";
                    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    this.timeFormat = "24h";
                    this.accessibility = this.getDefaultAccessibility();
                    this.uiPreferences = this.getDefaultUIPreferences();
                    this.vfs = this.getDefaultVFS();
                    this.installedApps = ["word", "excel", "powerpoint", "store", "explorer", "wiki"];
                    this.saveAccounts();
                } else {
                    this.prepareAccount(existingLocalKey);
                    this.pin = localPin;
                    this.accounts[existingLocalKey].pin = localPin;
                    this.saveAccounts();
                }
            } else {
                if (mode === 'existing') {
                    const remoteUser = await this.supabaseFindByCredentials(userName, password, supabaseConfig);
                    if (!remoteUser) throw new Error("Nom ou mot de passe introuvable dans Supabase.");
                } else {
                    const existingRemote = await this.supabaseFindByUsername(userName, supabaseConfig);
                    if (existingRemote) throw new Error("Ce nom d'utilisateur existe deja dans Supabase.");
                    await this.supabaseCreateUser(userName, password, supabaseConfig);
                }

                if (!existingLocal) {
                    this.currentAccount = userName;
                    this.userName = userName;
                    this.pin = localPin;
                    this.sessionID = this.generateSessionId(this.userName);
                    this.profilePic = "";
                    this.wallpaper = "var(--bg-image)";
                    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    this.timeFormat = "24h";
                    this.accessibility = this.getDefaultAccessibility();
                    this.uiPreferences = this.getDefaultUIPreferences();
                    this.vfs = this.getDefaultVFS();
                    this.installedApps = ["word", "excel", "powerpoint", "store", "explorer", "wiki"];
                    this.saveAccounts();
                    await this.hydrateAccountFromSupabase(userName);
                    await this.syncCurrentAccountToSupabase();
                } else {
                    this.prepareAccount(existingLocalKey);
                    this.pin = localPin;
                    this.accounts[existingLocalKey].pin = localPin;
                    this.saveAccounts();
                    await this.hydrateAccountFromSupabase(existingLocalKey);
                    await this.syncCurrentAccountToSupabase();
                }
            }

            this.nextSetupStep('loading');
            setTimeout(() => {
                const overlay = document.getElementById('setup-overlay');
                overlay.style.transition = "opacity 0.8s, transform 0.8s";
                overlay.style.opacity = "0";
                overlay.style.transform = "scale(1.05)";
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.style.opacity = '1';
                    overlay.style.transform = 'scale(1)';
                    this.launchDesktop();
                }, 800);
            }, 900);
        } catch (err) {
            this.showSetupError(this.formatSupabaseSetupError(err, supabaseConfig));
        } finally {
            this.setSetupBusy(false);
        }
    }

    // --- WINDOW MGMT REPAIRS ---
    closeWindow(id) {
        const win = this.windows.get(id);
        if (win) {
            win.element.classList.add('closing');
            if (win.isMaximized) {
                const dock = document.getElementById('dock');
                const tray = document.querySelector('.system-tray');
                if (dock) dock.classList.remove('dock-hidden');
                if (tray) tray.classList.remove('tray-hidden');
            }
            setTimeout(() => {
                win.element.remove();
                this.windows.delete(id);

                // Clear indicator
                const dockItem = document.getElementById(`dock-item-${id}`);
                if (dockItem) dockItem.classList.remove('active-app');
            }, 300);
        }
    }

    focusWindow(id) {
        // Remove focus from all
        document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));

        const win = document.getElementById(`window-${id}`);
        if (win) {
            win.classList.add('focused');
            win.style.zIndex = ++this.zIndexCounter;
        }
    }

    minimizeWindow(id) { this.windows.get(id)?.element.classList.add('minimized'); }
    restoreWindow(id) { const w = this.windows.get(id); if (w) { w.element.classList.remove('minimized'); this.focusWindow(id); } }

    toggleMaximizeWindow(id) {
        const win = this.windows.get(id);
        const dock = document.getElementById('dock');
        const tray = document.querySelector('.system-tray');
        if (!win) return;

        if (win.isMaximized) {
            win.element.classList.remove('fullscreen');
            win.element.style.top = win.originalRect.top;
            win.element.style.left = win.originalRect.left;
            win.element.style.width = win.originalRect.width;
            win.element.style.height = win.originalRect.height;
            if (dock) dock.classList.remove('dock-hidden');
            if (tray) tray.classList.remove('tray-hidden');
        } else {
            win.originalRect = { top: win.element.style.top, left: win.element.style.left, width: win.element.style.width, height: win.element.style.height };
            win.element.classList.add('fullscreen');
            win.element.style.top = '0'; win.element.style.left = '0';
            win.element.style.width = '100vw'; win.element.style.height = '100vh';
            if (dock) dock.classList.add('dock-hidden');
            if (tray) tray.classList.add('tray-hidden');
        }
        win.isMaximized = !win.isMaximized;
    }

    setupDragging(win, id) {
        const bar = win.querySelector('.window-titlebar');
        let d = false, sx, sy, wx, wy;
        bar.onmousedown = (e) => {
            if (this.windows.get(id).isMaximized) return;
            d = true; sx = e.clientX; sy = e.clientY;
            wx = parseInt(win.style.left); wy = parseInt(win.style.top);
            this.focusWindow(id);
        };
        window.addEventListener('mousemove', (e) => {
            if (!d) return;
            win.style.left = (wx + (e.clientX - sx)) + "px";
            win.style.top = (wy + (e.clientY - sy)) + "px";
        });
        window.addEventListener('mouseup', () => d = false);
    }

    renderAppGridItems(filter = '', category = 'all') {
        const q = filter.toLowerCase();
        // Use registry first, then fallback to gameTitles
        const allApps = this.appsRegistry.length > 0 ? this.appsRegistry : Object.keys(gameTitles).map(id => ({ id, title: gameTitles[id], category: 'productivity', icon: '📦' }));
        
        // Add "Create App" card at the beginning if no filter
        let html = '';
        if (!q && category === 'all') {
            html += `
            <div class="app-card" onclick="windowManager.openAICreator()" style="border:1px dashed rgba(255,255,255,0.3); background:rgba(255,255,255,0.02);">
                <div class="app-card-icon" style="background:linear-gradient(45deg, #ff00cc, #333399);">✨</div>
                <div style="font-size:14px; font-weight:700; margin-bottom:5px;">Créer une App IA</div>
                <div style="font-size:11px; color:rgba(255,255,255,0.5);">Générez votre app avec Groq</div>
                <div style="margin-top:12px; width:100%;">
                    <button class="install-btn-v9" style="width:100%; background:linear-gradient(90deg, #ff00cc, #333399); border:none;">COMMENCER</button>
                </div>
            </div>`;
        }

        html += allApps
            .filter(app => {
                const t = app.title.toLowerCase();
                const matchesSearch = t.includes(q) || app.id.includes(q);
                if (category === 'all') return matchesSearch;
                return matchesSearch && app.category === category;
            })
            .map(app => {
                const isInstalled = document.getElementById(`icon-${app.id}`);
                return `
                <div class="app-card" onclick="if(!event.target.closest('button')) windowManager.openProductPage('store', '${app.id}')">
                    <div class="app-card-icon">${app.icon || '📦'}</div>
                    <div style="font-size:14px; font-weight:700; margin-bottom:5px;">${app.title}</div>
                    <div style="font-size:11px; color:rgba(255,255,255,0.5);">${app.creator || 'FunnyCorp'}</div>
                    <div style="display:flex; gap:8px; margin-top:12px; width:100%;">
                        ${isInstalled ? `
                            <button class="install-btn-v9" style="flex:1; padding:4px; font-size:10px; border-radius:8px;" onclick="windowManager.installApp('${app.id}')">OUVRIR</button>
                            <button class="install-btn-v9" style="background:#ff3b30; flex:1; padding:4px; font-size:10px; border-radius:8px; box-shadow:none;" onclick="windowManager.uninstallApp('${app.id}')">DÉSINSTALLER</button>
                        ` : `
                            <button class="install-btn-v9" style="width:100%; padding:4px; font-size:10px; border-radius:8px;" onclick="windowManager.installApp('${app.id}')">OBTENIR</button>
                        `}
                    </div>
                </div>`;
            }).join('');
            
        return html;
    }

    openWidgetPicker() {
        let picker = document.getElementById('widget-picker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'widget-picker';
            picker.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(30,30,40,0.9); backdrop-filter:blur(20px); border-radius:16px; padding:20px; z-index:10000; border:1px solid rgba(255,255,255,0.1); box-shadow:0 10px 40px rgba(0,0,0,0.4);';
            document.body.appendChild(picker);
        }

        const availableWidgets = [
            { type: 'clock', name: 'Horloge', icon: '⏰' },
            { type: 'system', name: 'Moniteur Système', icon: '⚙️' },
            { type: 'note', name: 'Note Rapide', icon: '📝' },
            { type: 'battery', name: 'Batterie', icon: '🔋' }
        ];

        picker.innerHTML = `
            <h3 style="margin:0 0 20px 0; color:white; text-align:center;">Ajouter un Widget</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                ${availableWidgets.map(w => `
                    <div onclick="windowManager.addWidget('${w.type}')" style="background:rgba(255,255,255,0.05); padding:20px; border-radius:12px; text-align:center; cursor:pointer;">
                        <div style="font-size:24px; margin-bottom:8px;">${w.icon}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.7);">${w.name}</div>
                    </div>
                `).join('')}
            </div>
            <button onclick="document.getElementById('widget-picker').remove()" style="width:100%; margin-top:20px; background:rgba(255,255,255,0.1); border:none; color:white; padding:8px; border-radius:8px;">Fermer</button>
        `;
    }

    addWidget(type) {
        const newWidget = { id: 'w_' + Date.now(), type: type, x: 200, y: 200, content: '' };
        this.activeWidgets.push(newWidget);
        this.renderWidgets();
        this.saveUserData();
        const picker = document.getElementById('widget-picker');
        if (picker) picker.remove();
    }

    // V3: AI App Creator Interface
    openAICreator() {
        const winId = 'ai_creator_' + Date.now();
        const content = `
            <div style="padding:30px; height:100%; display:flex; flex-direction:column; background:linear-gradient(135deg, #1a1a2e, #16213e); color:white;">
                <div style="text-align:center; margin-bottom:30px;">
                    <div style="font-size:48px; margin-bottom:10px;">✨</div>
                    <h2 style="margin:0;">Aether AI Studio</h2>
                    <p style="opacity:0.7;">Décrivez votre application, l'IA la codera pour vous.</p>
                </div>
                
                <div style="flex:1; display:flex; flex-direction:column; gap:15px;">
                    <input type="text" placeholder="Clé API Groq (sk-...)" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:12px; border-radius:8px; color:white; font-family:monospace;">
                    <textarea placeholder="Ex: Une application de liste de tâches avec un design néon..." style="flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:12px; border-radius:8px; color:white; resize:none;"></textarea>
                    <button onclick="alert('Génération en cours... (Fonctionnalité à venir avec votre clé Groq)')" style="background:linear-gradient(90deg, #ff00cc, #333399); border:none; color:white; padding:15px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:16px;">GÉNÉRER L'APPLICATION</button>
                </div>
            </div>
        `;
        
        // Create a temporary window for the creator
        this.createWindow(winId, 'AI Studio', true);
        setTimeout(() => {
            const win = document.getElementById(`content-${winId}`);
            if(win) win.innerHTML = content;
        }, 100);
    }

    openProductPage(winId, appId) {
        const app = this.appsRegistry.find(a => a.id === appId) || { id: appId, title: gameTitles[appId], description: "Application système", creator: "FunnyCorp", category: "System", icon: "⚙️" };
        const gridView = document.getElementById(`store-grid-view-${winId}`);
        const productView = document.getElementById(`store-product-view-${winId}`);

        if (!gridView || !productView) return;

        gridView.style.display = 'none';
        productView.style.display = 'block';

        const isInstalled = document.getElementById(`icon-${appId}`);

        productView.innerHTML = `
            <div class="product-page">
                <div class="product-back-btn" onclick="windowManager.backToStoreGrid('${winId}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Retour
                </div>
                <div class="product-hero">
                    <div class="product-icon-large">${app.icon || '📦'}</div>
                    <div class="product-main-info">
                        <div class="product-title-v9">${app.title}</div>
                        <div class="product-creator-v9">${app.creator || 'FunnyCorp'}</div>
                        <div style="display:flex; gap:12px;">
                            ${isInstalled ? `
                                <button class="install-btn-v9" onclick="windowManager.installApp('${app.id}')">OUVRIR</button>
                                <button class="install-btn-v9" style="background:#ff3b30; box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);" onclick="windowManager.uninstallApp('${app.id}', '${winId}')">DÉSINSTALLER</button>
                            ` : `
                                <button class="install-btn-v9" onclick="windowManager.installApp('${app.id}')">OBTENIR</button>
                            `}
                        </div>
                    </div>
                </div>
                <!-- ... grid and description sections same as before ... -->
                <div class="product-details-grid">
                    <div class="description-section">
                        <h2>Description</h2>
                        <p>${app.description || "Aucune description disponible pour le moment."}</p>
                        
                        <div class="screenshots-row">
                            ${(app.screenshots || []).map(emoji => `<div class="screenshot-v9" style="display:flex; align-items:center; justify-content:center; font-size:48px; min-width:120px; height:180px; background:rgba(255,255,255,0.05); border-radius:12px;">${emoji}</div>`).join('') || '<div class="screenshot-v9" style="display:flex; align-items:center; justify-content:center;">Aucun screenshot</div>'}
                        </div>
                    </div>
                    
                    <div class="info-sidebar-v9">
                        <div class="info-item-v9">
                            <div class="info-label-v9">Catégorie</div>
                            <div class="info-value-v9">${app.category || 'Inconnue'}</div>
                        </div>
                        <div class="info-item-v9">
                            <div class="info-label-v9">Développeur</div>
                            <div class="info-value-v9">${app.creator || 'FunnyCorp'}</div>
                        </div>
                        <div class="info-item-v9">
                            <div class="info-label-v9">Compatibilité</div>
                            <div class="info-value-v9">FunnyWEB! V9+</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    unpinApp(id) {
        const icon = document.getElementById(`icon-${id}`);
        if (icon) {
            const dockItem = icon.closest('.dock-item');
            if (dockItem) dockItem.remove();
        }
        const dockItemById = document.getElementById(`dock-item-${id}`);
        if (dockItemById) dockItemById.remove();

        // Also remove from saved installed apps
        this.installedApps = this.installedApps.filter(appId => appId !== id);
        this.saveUserData();
        this.notify('Dock', `Application retirée du système.`, 'dock');
    }

    backToStoreGrid(winId) {
        const gridView = document.getElementById(`store-grid-view-${winId}`);
        const productView = document.getElementById(`store-product-view-${winId}`);
        if (gridView && productView) {
            gridView.style.display = 'block';
            productView.style.display = 'none';
        }
    }

    filterStore(id, q) { const g = document.getElementById(`app-grid-${id}`); if (g) g.innerHTML = this.renderAppGridItems(q); }
    filterStoreCategory(id, cat) { const g = document.getElementById(`app-grid-${id}`); if (g) g.innerHTML = this.renderAppGridItems('', cat); }

    installApp(id, forcedTitle = null, isRestoring = false) {
        const appData = this.appsRegistry.find(a => a.id === id);
        const title = forcedTitle || (appData ? appData.title : (gameTitles[id] || id));

        if (document.getElementById(`window-${id}`)) {
            this.focusWindow(id);
            return;
        }
        
        if (document.getElementById(`dock-item-${id}`)) {
            if (isRestoring) return;
            this.createWindow(id, title, true);
            return;
        }

        if (!isRestoring) this.notify("Installation", `Installation de ${title}...`, 'install');

        setTimeout(() => {
            const dock = document.getElementById('installed-apps');
            if (!dock) return;
            const item = document.createElement('div');
            item.className = 'dock-item';
            item.id = `dock-item-${id}`;
            item.title = title;
            item.setAttribute('data-id', id);
            item.onclick = () => this.installApp(id);
            const iconContent = appData && appData.icon
                ? this.renderAppIconMarkup(appData.icon, '📦')
                : (appIcons[id] || `<svg viewBox="0 0 100 100">${this.getGameIcon(id)}</svg>`);
            item.innerHTML = `<div class="dock-icon" id="icon-${id}">${iconContent}</div>`;
            dock.appendChild(item);
            this.applyUIPreferences();

            if (!this.installedApps.includes(id)) {
                this.installedApps.push(id);
            }

            if (!isRestoring) {
                this.saveUserData();
                this.notify("Succès", `${title} est prêt !`, 'install');
                this.syncAllIframes(); // Synchronize UI after installation
            }
            
            // During session restore, only repin apps to the dock.
            if (isRestoring) return;

            const sys = ['store', 'webos', 'music', 'notes', 'settings', 'terminal', 'files', 'sysinfo', 'calc', 'weather', 'docs', 'word', 'sheets', 'excel', 'slides', 'powerpoint', 'mail', 'outlook', 'activity', 'coder', 'designer', 'android', 'maps', 'camera'];
            this.createWindow(id, title, sys.includes(id) || (appData && appData.category === 'productivity') || id.startsWith('dev_app_'));
        }, isRestoring ? 10 : 800);
    }

    getGameIcon(id) {
        if (id.includes('snake')) return '<rect x="10" y="40" width="80" height="20" rx="10" fill="#2ecc71"/>';
        if (id.includes('tetris')) return '<rect x="20" y="20" width="30" height="30" fill="#3498db"/><rect x="50" y="50" width="30" height="30" fill="#e74c3c"/>';
        if (id === 'docs' || id === 'word') return '<rect x="30" y="20" width="40" height="60" rx="3" fill="#2b579a"/><path d="M40 40 H60 M40 50 H60" stroke="#fff" stroke-width="2"/>';
        if (id === 'sheets' || id === 'excel') return '<rect x="30" y="20" width="40" height="60" rx="3" fill="#217346"/><path d="M40 35 V65 M35 45 H65" stroke="#fff" stroke-width="2"/>';
        if (id === 'slides' || id === 'powerpoint') return '<rect x="28" y="22" width="44" height="56" rx="4" fill="#d24726"/><path d="M38 40 H62 M38 50 H58 M38 60 H54" stroke="#fff" stroke-width="2"/>';
        if (id === 'mail') return '<rect x="25" y="30" width="50" height="40" rx="5" fill="#0078d4"/><path d="M25 30 L50 50 L75 30" stroke="white" stroke-width="3" fill="none"/>';
        return '<circle cx="50" cy="50" r="30" fill="#0A84FF"/>';
    }
}

window.windowManager = new WindowManager();
const windowManager = window.windowManager;

const gameTitles = {
    search: 'SpotNode',
    explorer: 'Fichiers',
    settings: 'Paramètres',
    store: 'App Store',
    word: 'FunnyText',
    excel: 'FunnySheets',
    sheets: 'FunnySheets',
    powerpoint: 'FunnySlides',
    slides: 'FunnySlides',
    video: 'FunnyVideo',
    talky: 'Talky Messenger',
    snake: 'NeonSnake',
    bunny: 'BunnyWorld',
    wiki: 'AetherWiki',
    android: 'Android Subsystem',
    maps: 'AetherMaps',
    camera: 'SnapCam'
};

const appIcons = {
    search: '🎯',
    explorer: '📂',
    settings: '💠',
    store: '📦',
    word: '📝',
    excel: '📊',
    sheets: '📊',
    powerpoint: '📽️',
    slides: '📽️',
    video: '🎞️',
    talky: '💬',
    snake: '🕹️',
    bunny: '🎬',
    wiki: '📚',
    android: '🤖',
    maps: '🗺️',
    camera: '📸'
};
function openGame(id) { windowManager.createWindow(id, gameTitles[id]); }
function openApp(id) {
    const titleFromRegistry = Array.isArray(windowManager.appsRegistry)
        ? (windowManager.appsRegistry.find(app => app && app.id === id) || {}).title
        : '';
    const title = gameTitles[id] || titleFromRegistry || id;
    windowManager.createWindow(id, title, true);
}
function updateClock() {
    const el = document.getElementById('clock');
    if (el) {
        const showSeconds = !!(windowManager.uiPreferences && windowManager.uiPreferences.clockSeconds);
        const options = {
            timeZone: windowManager.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            ...(showSeconds ? { second: '2-digit' } : {}),
            hour12: windowManager.timeFormat === '12h'
        };
        el.textContent = new Date().toLocaleTimeString('fr-FR', options);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000); // Update every second for better responsiveness
});

document.addEventListener('click', (e) => {
    const lp = document.getElementById('launchpad');
    const startBtn = document.querySelector('.dock-item[title="AetherNode"]');
    if (lp && lp.classList.contains('active') && !lp.contains(e.target) && (!startBtn || !startBtn.contains(e.target))) {
        windowManager.toggleLaunchpad();
    }

    const spotlight = document.getElementById('spotlight-search');
    if (spotlight && spotlight.classList.contains('active') && !spotlight.contains(e.target)) {
        windowManager.toggleSearch();
    }

    const controlCenter = document.querySelector('.control-center');
    const tray = document.querySelector('.system-tray');
    if (controlCenter && controlCenter.classList.contains('active') && !controlCenter.contains(e.target) && (!tray || !tray.contains(e.target))) {
        controlCenter.classList.remove('active');
    }

    const whatsNew = document.getElementById('whats-new-modal');
    if (whatsNew && whatsNew.classList.contains('active') && e.target === whatsNew) {
        windowManager.closeWhatsNew();
    }
});

window.addEventListener('keydown', (e) => {
    const isMetaKey = e.key === 'Meta' || e.key === 'OS' || e.code === 'MetaLeft' || e.code === 'MetaRight';
    if (isMetaKey && !e.repeat && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (!windowManager.isEditableTarget(e.target)) {
            e.preventDefault();
            windowManager.toggleLaunchpad();
        }
        return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        windowManager.lockSession();
        return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        windowManager.showWhatsNew(true);
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        windowManager.toggleImmersiveMode();
        return;
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        openApp('mickey');
        return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        windowManager.toggleSearch();
    }

    if (e.key === 'Escape') {
        const lp = document.getElementById('launchpad');
        const spotlight = document.getElementById('spotlight-search');
        const controlCenter = document.querySelector('.control-center');
        const whatsNew = document.getElementById('whats-new-modal');
        if (lp && lp.classList.contains('active')) windowManager.toggleLaunchpad();
        if (spotlight && spotlight.classList.contains('active')) windowManager.toggleSearch();
        if (controlCenter && controlCenter.classList.contains('active')) controlCenter.classList.remove('active');
        if (whatsNew && whatsNew.classList.contains('active')) windowManager.closeWhatsNew();
        closeContextMenu();
    }
});

// ============================================================
//  CONTEXT MENU ENGINE
// ============================================================

function closeContextMenu() {
    const old = document.querySelector('.ctx-menu');
    if (old) old.remove();
}

function showContextMenu(x, y, items) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';

    items.forEach(item => {
        if (item === '---') {
            const sep = document.createElement('div');
            sep.className = 'ctx-separator';
            menu.appendChild(sep);
            return;
        }
        if (item.header) {
            const h = document.createElement('div');
            h.className = 'ctx-header';
            h.textContent = item.header;
            menu.appendChild(h);
            return;
        }

        const row = document.createElement('div');
        row.className = 'ctx-item' + (item.disabled ? ' disabled' : '') + (item.danger ? ' danger' : '');
        row.innerHTML = `
            <span class="ctx-icon">${item.icon || ''}</span>
            <span class="ctx-label">${item.label}</span>
            ${item.shortcut ? `<span class="ctx-shortcut">${item.shortcut}</span>` : ''}
        `;
        row.onclick = () => {
            closeContextMenu();
            if (item.action) item.action();
        };
        menu.appendChild(row);
    });

    document.body.appendChild(menu);

    // Position: keep on screen
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        if (x < 0) x = 4;
        if (y < 0) y = 4;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    });
}

// ============================================================
// UNIFIED OS INTERFACE HANDLERS
// ============================================================

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const x = e.clientX;
    const y = e.clientY;

    // A.0 Widget
    const widget = e.target.closest('.widget');
    if (widget) {
        showContextMenu(x, y, [
            { header: 'Widget' },
            { icon: '🗑️', label: 'Supprimer', danger: true, action: () => windowManager.removeWidget(widget.id) }
        ]);
        return;
    }

    // A. Desktop Icon clicked
    const desktopIcon = e.target.closest('.desktop-icon');
    if (desktopIcon) {
        const path = desktopIcon.getAttribute('data-path');
        if (!path) return;
        const name = path.split('/').pop();
        const isImage = /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(name);
        showContextMenu(x, y, [
            { header: name },
            { icon: '🚀', label: 'Ouvrir', action: () => windowManager.openFile(path) },
            '---',
            { icon: '📋', label: 'Copier', action: () => windowManager.notify('Système', 'Option de copie activée.') },
            ...(isImage ? [{
                icon: '🖼️', label: 'Fond d\'écran', action: () => {
                    const item = windowManager.vfs[path];
                    if (item && item.content) windowManager.setWallpaper(item.content);
                }
            }] : []),
            '---',
            { icon: '🗑️', label: 'Supprimer', danger: true, action: () => { if (confirm(`Déplacer ${name} à la corbeille ?`)) windowManager.vfs_delete(path); } }
        ]);
        return;
    }

    // B. Dock / Taskbar
    const dock = e.target.closest('#dock');
    if (dock) {
        const item = e.target.closest('.dock-item');
        if (item) {
            const title = item.getAttribute('title') || 'App';
            const id = (item.getAttribute('id') || '').replace('dock-item-', '') || item.getAttribute('data-id') || '';
            const isInstalled = !!item.closest('#installed-apps');

            const items = [{ header: title }];
            if (title === 'AetherNode') {
                items.push({ icon: '🏠', label: 'Menu Aether', action: () => windowManager.toggleLaunchpad() });
                items.push('---');
                items.push({ icon: '🔄', label: 'Redémarrer', action: () => location.reload() });
            } else if (id) {
                items.push({ icon: '🚀', label: 'Ouvrir', action: () => openApp(id) });
                if (windowManager.windows.has(id)) items.push({ icon: '❌', label: 'Fermer', danger: true, action: () => windowManager.closeWindow(id) });
                if (isInstalled) items.push({ icon: '📌', label: 'Désépingler', action: () => windowManager.unpinApp(id) });
            }
            showContextMenu(x, y, items);
        } else {
            showContextMenu(x, y, [
                { header: 'AetherBar' },
                { icon: '⚙️', label: 'Paramètres', action: () => openApp('settings') },
                { icon: '🖥️', label: 'Afficher le bureau', action: () => windowManager.windows.forEach((w, id) => windowManager.minimizeWindow(id)) }
            ]);
        }
        return;
    }

    // C. Window Titlebar
    const titlebar = e.target.closest('.window-titlebar');
    if (titlebar) {
        const win = titlebar.closest('.window');
        const id = win.id.replace('window-', '');
        const title = titlebar.querySelector('.window-title')?.textContent || 'App';
        showContextMenu(x, y, [
            { header: title },
            { icon: '🔽', label: 'Réduire', action: () => windowManager.minimizeWindow(id) },
            { icon: '❌', label: 'Fermer', danger: true, action: () => windowManager.closeWindow(id) }
        ]);
        return;
    }

    // D. Empty Desktop Background
    const desktop = document.getElementById('desktop');
    if (e.target === desktop || e.target.id === 'desktop-icons' || e.target.id === 'desktop') {
        showContextMenu(x, y, [
            { header: 'Bureau' },
            { icon: '📁', label: 'Dossier', action: () => { const n = prompt("Nom :"); if (n) windowManager.vfs_write('/Bureau/' + n, '', 'folder'); } },
            { icon: '📄', label: 'Fichier', action: () => { const n = prompt("Nom :"); if (n) windowManager.vfs_write('/Bureau/' + n + '.txt', 'Contenu'); } },
            '---',
            { icon: '🧩', label: 'Ajouter un Widget', action: () => windowManager.openWidgetPicker() },
            { icon: '🖼️', label: 'Changer le fond', action: () => document.getElementById('wallpaper-upload').click() },
            { icon: '🔧', label: 'Paramètres', action: () => openApp('settings') },
            '---',
            { icon: '🔄', label: 'Actualiser', action: () => windowManager.renderDesktop() }
        ]);
    }
});

// Global close for context menus
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.ctx-menu')) closeContextMenu();
});

// Drag & Drop handlers
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.target.closest('#desktop')) e.dataTransfer.dropEffect = 'move';
});

document.addEventListener('drop', (e) => {
    if (e.target.closest('#desktop')) {
        e.preventDefault();
        windowManager.handleDesktopDrop(e);
    }
});
