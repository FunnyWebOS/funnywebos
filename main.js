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
        this.locale = (() => {
            try { return (navigator.languages && navigator.languages[0]) || navigator.language || 'fr-FR'; } catch (err) { return 'fr-FR'; }
        })();
        this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.timeFormat = "24h";
        this.accessibility = this.getDefaultAccessibility();
        this.uiPreferences = this.getDefaultUIPreferences();
        this.vfs = {};
        this.installedApps = [];
        this.pinnedApps = [];
        this.activeWidgets = []; // V3: Track widgets
        this.customApps = JSON.parse(localStorage.getItem('aether_custom_apps') || '[]'); // V3.1: Local AI Apps
        this.pathPickerState = null;
        this.launchpadOpenTimer = null;
        this.webWrapApps = {};

        // Desktop layout (smartphone-like organization)
        this.desktopIconOrder = [];
        this.desktopFolderNavStack = [];

        // Phone shell state (mobile-first UI)
        this.shellMode = 'desktop'; // desktop|phone
        this.phoneRecents = [];
        this.phoneLastApp = '';
        this.phoneDrawerQuery = '';
        this.phoneMasterVolume = 1;
        this._phoneBound = false;
        this._phoneClockInterval = null;

        // Music widget state (updated by apps via postMessage)
        this.musicWidgetState = {
            sourceAppId: '',
            title: '',
            artist: '',
            album: '',
            coverUrl: '',
            duration: 0,
            currentTime: 0,
            isPlaying: false,
            volume: 1
        };
        this._musicWidgetLastTick = 0;

        // Apps that manage their own theme and should NOT be forced by the OS theme.
        this.themeSyncExclusions = new Set(['word', 'excel', 'powerpoint', 'docs', 'sheets', 'slides']);

        // Cached copy of Settings-app preferences (aether_settings) for fast checks.
        this.aetherSettings = null;

        // Preferences driven by Settings app (blur/spacing/perf/autostart/sleep).
        this.transparencyEffectsEnabled = true;
        this.letterSpacing = 'normal';
        this.performanceMode = false;
        this.autostartEnabled = true;
        this.firewallEnabled = false;
        this.developerMode = false;
        this.sleepMinutes = 0;
        this._idleLastActivity = Date.now();
        this._idleTimer = null;
        this._idleBound = false;
        this._autostartRestored = false;

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
        // Load and apply the Settings app state (theme/accent/wallpaper/font/etc.) at boot.
        this.applyAetherSettingsFromStorage();
        this.initOS();
        this.injectSystemStyles(); // V3 CSS Fixes

        window.addEventListener('message', (e) => {
            if (e.data.type === 'OS_VFS_WRITE') {
                this.vfs_write(e.data.path, e.data.content, e.data.nodeType);
            } else if (e.data.type === 'OS_VFS_DELETE') {
                this.vfs_delete(e.data.path);
            } else if (e.data.type === 'OS_RESOLVE_PATH_PICKER') {
                this.resolvePathPicker(e.data.requestId, e.data.path);
            } else if (e.data && (e.data.type === 'AETHER_SETTINGS_UPDATED' || e.data.type === 'AETHER_SETTINGS_APPLY')) {
                // Settings app -> OS bridge: apply settings system-wide and sync to all apps.
                try {
                    const next = e.data.settings && typeof e.data.settings === 'object' ? e.data.settings : null;
                    if (next) this.applyAetherSettings(next, { persist: false });
                } catch (err) { }
            } else if (e.data && e.data.type === 'AETHER_MUSIC_UPDATE') {
                try {
                    this.updateMusicWidgetStateFromMessage(e.data.state || {}, e.source);
                } catch (err) { }
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
            
            /* Widgets Container (layout only; visuals defined in style.css) */
            #desktop-widgets { position:absolute; inset:0; pointer-events:none; z-index:20; overflow:hidden; }
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

        const locale = this.locale || 'fr-FR';
        timeEl.textContent = now.toLocaleTimeString(locale, timeOptions);
        dateEl.textContent = now.toLocaleDateString(locale, dateOptions);
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
        let data = null;
        let legacy = null;
        try { data = localStorage.getItem('aether_accounts'); } catch (_) { data = null; }
        try { legacy = localStorage.getItem('funnyweb_accounts') || localStorage.getItem('funnyweb_user'); } catch (_) { legacy = null; }

        let loaded = false;
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.accounts = (parsed && typeof parsed === 'object') ? parsed : {};
                loaded = true;
            } catch (e) {
                // Corrupted/truncated storage: remove and try legacy migration instead of forcing OOBE on every reload.
                this.accounts = {};
                try { localStorage.removeItem('aether_accounts'); } catch (_) { }
            }
        }

        if (!loaded && legacy) {
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

        // If localStorage is unavailable/full, fall back to a tiny cookie backup (keeps PIN screen usable).
        if (!this.accounts || Object.keys(this.accounts).length === 0) {
            try {
                const backup = this.readAccountsCookieBackup();
                if (backup && backup.accounts && typeof backup.accounts === 'object' && Object.keys(backup.accounts).length > 0) {
                    this.accounts = backup.accounts;
                    if (backup.lastUser) {
                        try { localStorage.setItem('aether_last_user', String(backup.lastUser)); } catch (_) { }
                    }
                }
            } catch (_) { }
        }

        let lastUser = '';
        try { lastUser = String(localStorage.getItem('aether_last_user') || ''); } catch (_) { lastUser = ''; }
        if (!lastUser) {
            try {
                const backup = this.readAccountsCookieBackup();
                if (backup && backup.lastUser) lastUser = String(backup.lastUser);
            } catch (_) { }
        }
        const lastUserKey = this.findAccountKey(lastUser);
        if (lastUserKey && this.accounts[lastUserKey]) {
            this.prepareAccount(lastUserKey);
            try { this.writeAccountsCookieBackup(); } catch (_) { }
            this.showLogin();
        } else if (Object.keys(this.accounts).length > 0) {
            try {
                if (!this.currentAccount) {
                    const first = Object.keys(this.accounts || {})[0];
                    if (first) this.prepareAccount(first);
                }
            } catch (_) { }
            try { this.writeAccountsCookieBackup(); } catch (_) { }
            this.showLogin();
        } else {
            this.showSetup();
        }
    }

    saveAccounts() {
        if (this.currentAccount) {
            const dockPinnedApps = Array.from(document.querySelectorAll('#installed-apps .dock-item'))
                .map(item => item.getAttribute('data-id'))
                .filter(Boolean);

            const pinnedSnapshot = dockPinnedApps.length > 0
                ? dockPinnedApps
                : (Array.isArray(this.pinnedApps) ? this.pinnedApps : []);

            const installedSnapshot = Array.isArray(this.installedApps) ? this.installedApps : [];

            const normalizedPinned = [...new Set(pinnedSnapshot.filter(Boolean))];
            const normalizedInstalled = [...new Set([...installedSnapshot, ...normalizedPinned].filter(Boolean))];

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
                  webWrapApps: this.webWrapApps,
                  activeWidgets: Array.isArray(this.activeWidgets) ? this.activeWidgets : [],
                  desktopIconOrder: Array.isArray(this.desktopIconOrder) ? this.desktopIconOrder : [],
                  installedApps: normalizedInstalled,
                  pinnedApps: normalizedPinned
              };
          }
        try {
            localStorage.setItem('aether_accounts', JSON.stringify(this.accounts));
            // Keep a small cookie backup even on success so reloads still work in constrained storage contexts.
            try { this.writeAccountsCookieBackup(); } catch (_) { }
        } catch (err) {
            // If localStorage is full, evict known large app caches so users don't get forced back into setup.
            try { localStorage.removeItem('musicLibrary'); } catch (e) {}
            try { localStorage.removeItem('spotaether_musicLibrary'); } catch (e) {}
            try { localStorage.removeItem('aether_music_cache'); } catch (e) {}
            // Evict other recoverable OS caches/settings if quota is exceeded.
            try { localStorage.removeItem('aether_custom_apps'); } catch (e) {}
            try { localStorage.removeItem('aether_settings'); } catch (e) {}
            try { localStorage.removeItem('aether_last_windows_v2'); } catch (e) {}
            try { localStorage.removeItem('aether_last_windows_v1'); } catch (e) {}
            try { localStorage.removeItem('aether_pending_apps'); } catch (e) {}
            try { localStorage.removeItem('aether_approved_apps'); } catch (e) {}
            try { localStorage.removeItem('aether_apps_overrides'); } catch (e) {}
            try { localStorage.removeItem('aether_deleted_apps'); } catch (e) {}
            try {
                localStorage.setItem('aether_accounts', JSON.stringify(this.accounts));
                try { this.writeAccountsCookieBackup(); } catch (_) { }
                this.notify('SystÃ¨me', 'Stockage local plein : cache musique supprimÃ© pour sauvegarder votre session.', 'system');
            } catch (e) {
                // Last resort: save a minimal account snapshot (keeps username/PIN) without heavy fields (VFS, webwrap).
                const minimalAccounts = {};
                try {
                    Object.keys(this.accounts || {}).forEach((name) => {
                        const acc = (this.accounts && this.accounts[name]) ? this.accounts[name] : {};
                        const rawProfilePic = typeof acc.profilePic === 'string' ? acc.profilePic : "";
                        const rawWallpaper = typeof acc.wallpaper === 'string' ? acc.wallpaper : "";
                        const safeProfilePic = (rawProfilePic.startsWith('data:') && rawProfilePic.length > 8000) ? "" : rawProfilePic;
                        const safeWallpaper = (rawWallpaper.startsWith('data:') && rawWallpaper.length > 8000)
                            ? "var(--bg-image)"
                            : (rawWallpaper || "var(--bg-image)");
                        minimalAccounts[name] = {
                            pin: acc.pin,
                            sessionID: acc.sessionID || null,
                            profilePic: safeProfilePic,
                            wallpaper: safeWallpaper,
                            theme: acc.theme || "dark",
                            timeZone: acc.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                            timeFormat: acc.timeFormat || "24h",
                            accessibility: acc.accessibility || this.getDefaultAccessibility(),
                            uiPreferences: acc.uiPreferences || this.getDefaultUIPreferences(),
                            installedApps: Array.isArray(acc.installedApps) ? acc.installedApps : [],
                            pinnedApps: Array.isArray(acc.pinnedApps) ? acc.pinnedApps : []
                        };
                    });
                    try { localStorage.setItem('aether_accounts', JSON.stringify(minimalAccounts)); } catch (_) { }
                    try { this.writeAccountsCookieBackup(); } catch (_) { }
                    this.notify('SystÃ¨me', 'Stockage local plein : sauvegarde minimale (connexion conservee).', 'system');
                } catch (_) {
                    try { this.writeAccountsCookieBackup(); } catch (_) { }
                    this.notify('SystÃ¨me', 'Impossible de sauvegarder la session (stockage local plein). LibÃ¨re de l\u2019espace puis recharge la page.', 'system');
                }
            }
        }
        this.scheduleAccountCloudSync();
    }

    saveUserData() { this.saveAccounts(); }

    getCookie(name) {
        try {
            const needle = `${encodeURIComponent(name)}=`;
            const parts = String(document.cookie || '').split(';');
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.startsWith(needle)) return decodeURIComponent(trimmed.slice(needle.length));
            }
        } catch (_) { }
        return '';
    }

    setCookie(name, value, days = 60) {
        try {
            const maxAge = Math.max(0, Math.floor(days * 86400));
            document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(String(value || ''))}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
        } catch (_) { }
    }

    deleteCookie(name) {
        try {
            document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`;
        } catch (_) { }
    }

    readAccountsCookieBackup() {
        try {
            const raw = this.getCookie('aether_accounts_backup');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    writeAccountsCookieBackup() {
        try {
            let lastUser = this.currentAccount || '';
            if (!lastUser) {
                try { lastUser = localStorage.getItem('aether_last_user') || ''; } catch (_) { lastUser = ''; }
            }
            const key = this.findAccountKey(lastUser) || String(lastUser || '');
            const acc = key && this.accounts && this.accounts[key] ? this.accounts[key] : null;
            const pin = acc && acc.pin ? String(acc.pin) : (this.pin ? String(this.pin) : '');
            if (!key || !pin) return;
            const payload = {
                lastUser: key,
                accounts: {
                    [key]: {
                        pin,
                        sessionID: (acc && acc.sessionID) ? String(acc.sessionID) : (this.sessionID ? String(this.sessionID) : null),
                        theme: (acc && acc.theme) ? String(acc.theme) : (this.theme || 'dark')
                    }
                }
            };
            this.setCookie('aether_accounts_backup', JSON.stringify(payload), 60);
        } catch (_) { }
    }

    clearAccountsCookieBackup() {
        this.deleteCookie('aether_accounts_backup');
    }

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

    ensureNotepadDefaultInstalled(accountKey = '') {
        const resolvedKey = this.findAccountKey(accountKey) || String(accountKey || '').trim();
        if (!resolvedKey) return;
        const markerKey = `aether_mig_notepad_v1_${this.normalizeAccountLookup(resolvedKey)}`;

        try {
            if (localStorage.getItem(markerKey) === '1') return;
        } catch (_) { }

        const oldDefaultPinned = ["word", "excel", "powerpoint", "store", "wiki"];
        const oldDefaultPinnedSig = oldDefaultPinned.join('|');

        if (!Array.isArray(this.installedApps)) this.installedApps = [];
        if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];

        let changed = false;

        if (!this.installedApps.includes('notepad')) {
            this.installedApps.push('notepad');
            changed = true;
        }

        // If the user still has the legacy default dock, add Bloc-notes there too.
        const pinnedSig = this.pinnedApps.filter(Boolean).join('|');
        if (pinnedSig === oldDefaultPinnedSig && !this.pinnedApps.includes('notepad')) {
            this.pinnedApps = ["word", "notepad", "excel", "powerpoint", "store", "wiki"];
            changed = true;
        }

        if (!changed) {
            try { localStorage.setItem(markerKey, '1'); } catch (_) { }
            return;
        }

        this.pinnedApps = [...new Set(this.pinnedApps.filter(Boolean))];
        this.installedApps = [...new Set([...this.installedApps, ...this.pinnedApps].filter(Boolean))];

        if (this.accounts && this.accounts[resolvedKey]) {
            this.accounts[resolvedKey].installedApps = this.installedApps;
            this.accounts[resolvedKey].pinnedApps = this.pinnedApps;
        }

        try { localStorage.setItem('aether_accounts', JSON.stringify(this.accounts)); } catch (_) { }
        try { this.writeAccountsCookieBackup(); } catch (_) { }
        try { localStorage.setItem(markerKey, '1'); } catch (_) { }
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
         this.webWrapApps = (user.webWrapApps && typeof user.webWrapApps === 'object') ? user.webWrapApps : {};
         this.desktopIconOrder = Array.isArray(user.desktopIconOrder) ? user.desktopIconOrder : [];
         this.activeWidgets = Array.isArray(user.activeWidgets) ? user.activeWidgets : (Array.isArray(this.activeWidgets) ? this.activeWidgets : []);
  
         const defaultInstalledApps = ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"];
         const defaultPinnedApps = ["word", "notepad", "excel", "powerpoint", "store", "wiki"];

        const savedInstalledApps = Array.isArray(user.installedApps) ? user.installedApps : [];
        const savedPinnedApps = Array.isArray(user.pinnedApps) ? user.pinnedApps : [];

        // Migration legacy: before v3.0.1, "installedApps" effectively meant "pinned to dock".
        const nextPinned = savedPinnedApps.length > 0
            ? savedPinnedApps
            : (savedInstalledApps.length > 0 ? savedInstalledApps : defaultPinnedApps);

        const nextInstalled = savedInstalledApps.length > 0
            ? savedInstalledApps
            : defaultInstalledApps;

        this.pinnedApps = [...new Set(nextPinned.filter(Boolean))];
        this.installedApps = [...new Set([...nextInstalled, ...this.pinnedApps].filter(Boolean))];
        this.ensureNotepadDefaultInstalled(resolvedName);
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
        try { localStorage.setItem('aether_last_user', resolvedName); } catch (_) { }
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
        return {
            fontSize: "14px",
            fontPx: 14,
            highContrast: false,
            reducedMotion: false,
            // Optional accessibility extensions used by the Settings app.
            colorBlind: 'off',
            stickyKeys: false,
            pointerSpeed: 5,
            screenReader: false,
            captions: false,
            narrator: false,
            magnifier: false
        };
    }

    getDefaultUIPreferences() {
        return {
            dockPosition: 'left',
            dockSize: 'normal',
            trayStyle: 'floating',
            clockSeconds: false,
            shellMode: 'auto', // auto|desktop|phone
            phoneWidgets: ['music', 'todo', 'quote', 'quicklaunch'],
            notifications: this.getDefaultNotificationPreferences()
        };
    }

    getDefaultNotificationPreferences() {
        return {
            enabled: true,
            dnd: false,
            sound: true,
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
        const allowedShellModes = ['auto', 'desktop', 'phone'];
        const allowedPhoneWidgets = ['music', 'todo', 'news', 'quote', 'quicklaunch'];
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
            shellMode: allowedShellModes.includes(String(raw.shellMode || '')) ? String(raw.shellMode) : defaults.shellMode,
            phoneWidgets: (() => {
                const list = Array.isArray(raw.phoneWidgets) ? raw.phoneWidgets.map(x => String(x || '').trim()) : defaults.phoneWidgets;
                const cleaned = list.filter(x => allowedPhoneWidgets.includes(x));
                const unique = Array.from(new Set(cleaned));
                return unique.length ? unique : defaults.phoneWidgets;
            })(),
            notifications: {
                enabled: typeof rawNotif.enabled === 'boolean' ? rawNotif.enabled : notifDefaults.enabled,
                dnd: typeof rawNotif.dnd === 'boolean' ? rawNotif.dnd : notifDefaults.dnd,
                sound: typeof rawNotif.sound === 'boolean' ? rawNotif.sound : notifDefaults.sound,
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

    getSupabaseConfigRemoteUrl() {
        const runtimeEnv = (typeof window !== 'undefined' && window.AETHER_RUNTIME_ENV)
            ? window.AETHER_RUNTIME_ENV
            : {};

        const sanitizeUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            try {
                const parsed = new URL(raw);
                if (!['http:', 'https:'].includes(parsed.protocol)) return '';
                return parsed.href.replace(/\/+$/, '');
            } catch (err) {
                return '';
            }
        };

        const explicit = sanitizeUrl(runtimeEnv.AETHER_SUPABASE_CONFIG_URL);
        if (explicit) return explicit;

        // Convenience fallback: if you already deployed the AI proxy Worker, it can also serve config.
        const proxy = sanitizeUrl(runtimeEnv.AETHER_AI_PROXY_URL);
        if (proxy) return `${proxy}/aether/v1/supabase-config`;

        return '';
    }

    coerceWorkerSupabaseConfig(payload) {
        const obj = (payload && typeof payload === 'object') ? payload : {};
        const cfg = (obj.config && typeof obj.config === 'object') ? obj.config : obj;

        const pick = (key) => {
            try {
                const v = cfg[key];
                return (typeof v === 'string') ? v.trim() : '';
            } catch (err) {
                return '';
            }
        };

        const url = pick('url') || pick('supabaseUrl') || pick('supabaseURL') || pick('AETHER_SUPABASE_URL');
        const anonKey = pick('anonKey') || pick('anon_key') || pick('anon') || pick('AETHER_SUPABASE_ANON_KEY');
        const serviceKey = pick('serviceKey') || pick('service_key') || pick('AETHER_SUPABASE_SERVICE_ROLE_KEY');
        const table = pick('table') || pick('AETHER_SUPABASE_TABLE');
        const usernameColumn = pick('usernameColumn') || pick('username_column') || pick('AETHER_SUPABASE_USERNAME_COLUMN');
        const passwordColumn = pick('passwordColumn') || pick('password_column') || pick('AETHER_SUPABASE_PASSWORD_COLUMN');

        const clean = { url, anonKey, serviceKey, table, usernameColumn, passwordColumn };

        // Never accept a service-role key in the browser. Keep it server-side and proxy privileged ops.
        if (clean.serviceKey) {
            console.warn('[AetherOS] Ignoring Supabase serviceRole key from remote config (client-side).');
            clean.serviceKey = '';
        }

        return clean;
    }

    async loadSupabaseConfigFromWorker() {
        // Désactiver le chargement depuis le worker pour éviter les erreurs 403
        return null;
        
        const endpoint = 'https://aetheros-ai-proxy.aetheros.workers.dev/aether/v1/supabase-config';
        const timeoutMs = 4000;
        const controller = new AbortController();
        const t = setTimeout(() => controller?.abort(), timeoutMs);

        try {
            const resp = await fetch(endpoint, {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            const remote = this.coerceWorkerSupabaseConfig(data);
            const sanitized = this.sanitizeSupabaseConfig(remote);
            if (!this.isSupabaseReady(sanitized)) return null;
            return sanitized;
        } catch (err) {
            return null;
        } finally {
            clearTimeout(t);
        }
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
        const runtimeEnv = (typeof window !== 'undefined' && window.AETHER_RUNTIME_ENV)
            ? window.AETHER_RUNTIME_ENV
            : {};
        const hasExplicitRemote = typeof runtimeEnv.AETHER_SUPABASE_CONFIG_URL === 'string' && runtimeEnv.AETHER_SUPABASE_CONFIG_URL.trim();

        // Optional: load from a Cloudflare Worker endpoint so you don't ship keys in env.js.
        try {
            const fromWorker = await this.loadSupabaseConfigFromWorker();
            if (fromWorker) resolved = this.sanitizeSupabaseConfig({ ...resolved, ...fromWorker });
        } catch (err) { }

        // If a remote config URL is explicitly configured, don't probe local .env files.
        // (Static hosting: those files should not exist; probing can also add startup latency.)
        // Désactiver la recherche des fichiers .env pour éviter les erreurs 404
        const filteredCandidates = [];
        
        for (const path of filteredCandidates) {
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

    appendUrlParam(url, key, value = '1') {
        const raw = String(url || '').trim();
        if (!raw) return raw;
        const k = encodeURIComponent(String(key || '').trim());
        const v = encodeURIComponent(String(value || '').trim());
        if (!k) return raw;
        const parts = raw.split('#');
        const base = parts[0];
        const hash = parts.length > 1 ? parts.slice(1).join('#') : '';
        const sep = base.includes('?') ? '&' : '?';
        const next = `${base}${sep}${k}=${v}`;
        return hash ? `${next}#${hash}` : next;
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
            theme: this.theme || account.theme || 'dark',
            timeZone: this.timeZone || account.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            timeFormat: this.timeFormat || account.timeFormat || "24h",
             accessibility: this.accessibility || account.accessibility || this.getDefaultAccessibility(),
             uiPreferences: this.uiPreferences || account.uiPreferences || this.getDefaultUIPreferences(),
             vfs: this.vfs || account.vfs || this.getDefaultVFS(),
             webWrapApps: (this.webWrapApps && typeof this.webWrapApps === 'object') ? this.webWrapApps : (account.webWrapApps || {}),
             activeWidgets: Array.isArray(this.activeWidgets) ? this.activeWidgets : (Array.isArray(account.activeWidgets) ? account.activeWidgets : []),
             desktopIconOrder: Array.isArray(this.desktopIconOrder) ? this.desktopIconOrder : (Array.isArray(account.desktopIconOrder) ? account.desktopIconOrder : []),
             installedApps: Array.isArray(this.installedApps) ? this.installedApps : (account.installedApps || ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"]),
             pinnedApps: Array.isArray(this.pinnedApps) ? this.pinnedApps : (account.pinnedApps || [])
         };
      }

    sanitizeAccountCloudPayload(payload = {}) {
        return {
            pin: String(payload.pin || '0000'),
            sessionID: payload.sessionID || null,
            profilePic: payload.profilePic || "",
            wallpaper: payload.wallpaper || "var(--bg-image)",
            theme: payload.theme === 'light' ? 'light' : 'dark',
            timeZone: payload.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            timeFormat: payload.timeFormat || "24h",
             accessibility: { ...this.getDefaultAccessibility(), ...(payload.accessibility || {}) },
             uiPreferences: this.sanitizeUIPreferences(payload.uiPreferences || {}),
             vfs: payload.vfs || this.getDefaultVFS(),
             webWrapApps: (payload.webWrapApps && typeof payload.webWrapApps === 'object' && !Array.isArray(payload.webWrapApps)) ? payload.webWrapApps : {},
             activeWidgets: Array.isArray(payload.activeWidgets) ? payload.activeWidgets : [],
             desktopIconOrder: Array.isArray(payload.desktopIconOrder) ? payload.desktopIconOrder : [],
             installedApps: Array.isArray(payload.installedApps) && payload.installedApps.length > 0
                 ? payload.installedApps
                 : ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"],
             pinnedApps: Array.isArray(payload.pinnedApps) ? payload.pinnedApps : []
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
                this.theme = remote.theme || this.theme || 'dark';
                this.timeZone = remote.timeZone;
                this.timeFormat = remote.timeFormat;
                this.accessibility = remote.accessibility;
                this.uiPreferences = remote.uiPreferences;
                this.vfs = remote.vfs;
                this.desktopIconOrder = Array.isArray(remote.desktopIconOrder) ? remote.desktopIconOrder : [];
                this.activeWidgets = Array.isArray(remote.activeWidgets) ? remote.activeWidgets : this.activeWidgets;
                this.pinnedApps = Array.isArray(remote.pinnedApps) ? remote.pinnedApps : [];
                this.installedApps = Array.isArray(remote.installedApps) ? remote.installedApps : [];
                this.installedApps = [...new Set([...this.installedApps, ...this.pinnedApps].filter(Boolean))];
                this.ensureNotepadDefaultInstalled(userName);
                this.ensureAdminToolsInstalled();
                setTimeout(() => {
                    this.setTheme(this.theme || 'dark');
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
            return `Permissions Supabase manquantes (RLS/policies) sur ${table}. Execute supabase_setup.sql, ou utilise un proxy serveur (Worker) pour les operations privilegiees (ne jamais exposer une service-role key dans le navigateur).`;
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

        const phone = document.getElementById('phone');
        if (phone) {
            phone.style.opacity = '0';
        }

        const launchpad = document.getElementById('launchpad');
        const spotlight = document.getElementById('spotlight-search');
        const controlCenter = document.querySelector('.control-center');
        if (launchpad && (launchpad.classList.contains('active') || launchpad.style.display === 'flex')) this.closeLaunchpad(true);
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
            this.launchShell();
        }, 500);
    }

    getPreferredShell() {
        const pref = this.uiPreferences && this.uiPreferences.shellMode ? String(this.uiPreferences.shellMode) : 'auto';
        if (pref === 'desktop' || pref === 'phone') return pref;
        const profile = this.getViewportProfile();
        return profile === 'mobile' ? 'phone' : 'desktop';
    }

    isPhoneShellActive() {
        return this.shellMode === 'phone' || (document.body && document.body.classList.contains('shell-phone'));
    }

    launchShell() {
        const preferred = this.getPreferredShell();
        if (preferred === 'phone') this.launchPhone();
        else this.launchDesktop();
    }

    launchDesktop() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;

        this.shellMode = 'desktop';
        try { document.body.classList.remove('shell-phone'); } catch (err) { }
        try { if (this._phoneClockInterval) clearInterval(this._phoneClockInterval); } catch (_) { }
        this._phoneClockInterval = null;
        try {
            const phone = document.getElementById('phone');
            if (phone) {
                phone.style.opacity = '0';
                phone.style.display = 'none';
            }
        } catch (err) { }

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

            (Array.isArray(this.pinnedApps) ? this.pinnedApps : []).forEach(id => this.pinApp(id, null, true));

            // Autostart: restore previously open app windows.
            if (this.autostartEnabled && !this._autostartRestored) {
                this._autostartRestored = true;
                setTimeout(() => {
                    try { this.restoreSessionWindows(); } catch (err) { }
                }, 120);
            }

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

    // ==================== PHONE SHELL (MOBILE-FIRST) ====================
    bindPhoneShellOnce() {
        if (this._phoneBound) return;
        this._phoneBound = true;

        this._phoneTapSuppressedUntil = 0;
        this._phoneLongPressTimer = null;
        this._phoneLongPressStart = null;
        this._phoneActionsAppId = '';

        const status = document.getElementById('phone-statusbar');
        if (status) {
            status.addEventListener('click', (ev) => {
                if (this.isEditableTarget(ev.target)) return;
                this.togglePhoneControlCenter();
            });
        }

        const actions = document.getElementById('phone-actions');
        if (actions) {
            actions.addEventListener('click', (ev) => {
                if (ev.target === actions) this.closePhoneActions();
            });
        }

        const drawer = document.getElementById('phone-drawer');
        if (drawer) {
            drawer.addEventListener('click', (ev) => {
                if (ev.target === drawer) this.togglePhoneDrawer(false);
            });
        }

        const recents = document.getElementById('phone-recents');
        if (recents) {
            recents.addEventListener('click', (ev) => {
                if (ev.target === recents) this.closePhoneRecents();
            });
        }

        const cc = document.getElementById('phone-control-center');
        if (cc) {
            cc.addEventListener('click', (ev) => {
                if (ev.target === cc) this.closePhoneControlCenter();
            });
        }

        const home = document.getElementById('phone-home');
        if (home) {
            let start = null;
            home.addEventListener('pointerdown', (ev) => {
                if (this.isEditableTarget(ev.target)) return;
                start = { x: ev.clientX, y: ev.clientY, t: Date.now() };
            }, { passive: true });
            home.addEventListener('pointerup', (ev) => {
                if (!start) return;
                const dx = ev.clientX - start.x;
                const dy = ev.clientY - start.y;
                const nearBottom = (window.innerHeight - start.y) < 140;
                const quick = (Date.now() - start.t) < 500;
                start = null;
                if (!nearBottom) return;
                if (quick && dy < -42 && Math.abs(dx) < 80) this.togglePhoneDrawer(true);
            }, { passive: true });
        }

        // Long-press on app icons (home/drawer/dock) -> actions sheet
        const phoneRoot = document.getElementById('phone');
        if (phoneRoot) {
            const clear = () => {
                if (this._phoneLongPressTimer) clearTimeout(this._phoneLongPressTimer);
                this._phoneLongPressTimer = null;
                this._phoneLongPressStart = null;
            };

            phoneRoot.addEventListener('pointerdown', (ev) => {
                const widget = ev.target && ev.target.closest ? ev.target.closest('[data-phone-widget]') : null;
                const btn = ev.target && ev.target.closest ? ev.target.closest('[data-phone-app]') : null;
                if (!widget && !btn) return;
                if (this.isEditableTarget(ev.target)) return;

                const mode = btn ? 'app' : 'widget';
                const id = mode === 'widget'
                    ? String(widget.getAttribute('data-phone-widget') || '').trim()
                    : String(btn.getAttribute('data-phone-app') || '').trim();
                if (!id) return;

                // Don't trigger widget long-press when the user holds a control inside the widget (play buttons, checkboxes, etc.).
                if (mode === 'widget') {
                    const isControl = !!(ev.target && ev.target.closest && ev.target.closest('button,input,select,textarea,a,[role=\"button\"]'));
                    if (isControl) return;
                }

                clear();
                this._phoneLongPressStart = { x: ev.clientX, y: ev.clientY, id, mode, t: Date.now() };
                this._phoneLongPressTimer = setTimeout(() => {
                    try {
                        this._phoneTapSuppressedUntil = Date.now() + 700;
                        if (mode === 'widget') this.openPhoneWidgetActions(id);
                        else this.openPhoneActions(id);
                        console.log('Appui long détecté pour:', id); // Debug
                    } catch (_) { }
                    clear();
                }, 400); // Réduit de 520ms à 400ms pour plus de réactivité
            }, { passive: true });

            phoneRoot.addEventListener('pointermove', (ev) => {
                const s = this._phoneLongPressStart;
                if (!s) return;
                const dx = ev.clientX - s.x;
                const dy = ev.clientY - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // Augmenter la tolérance de mouvement pour éviter d'annuler trop facilement
                if (dist > 20) { 
                    clear();
                }
            }, { passive: true });

            phoneRoot.addEventListener('pointerup', clear, { passive: true });
            phoneRoot.addEventListener('pointercancel', clear, { passive: true });
        }

        const appStage = document.getElementById('phone-appstage');
        if (appStage) {
            let start = null;
            appStage.addEventListener('pointerdown', (ev) => {
                if (this.isEditableTarget(ev.target)) return;
                start = { x: ev.clientX, y: ev.clientY, t: Date.now() };
            }, { passive: true });
            appStage.addEventListener('pointerup', (ev) => {
                if (!start) return;
                const dx = ev.clientX - start.x;
                const dy = ev.clientY - start.y;
                const leftEdge = start.x < 26;
                start = null;
                if (leftEdge && dx > 70 && Math.abs(dy) < 110) this.phoneBack();
            }, { passive: true });
        }
    }

    launchPhone() {
        const phone = document.getElementById('phone');
        if (!phone) return;

        this.shellMode = 'phone';
        try { document.body.classList.add('shell-phone'); } catch (err) { }

        // Hide desktop shell if it was running.
        try {
            const desktop = document.getElementById('desktop');
            if (desktop) {
                desktop.style.opacity = '0';
                desktop.style.filter = 'blur(14px)';
                desktop.style.display = 'none';
            }
        } catch (err) { }

        phone.style.display = 'block';
        setTimeout(() => { try { phone.style.opacity = '1'; } catch (e) { } }, 40);

        this.bindPhoneShellOnce();
        this.refreshViewportProfile();
        this.setWallpaper(this.wallpaper);
        this.applyAccessibilitySettings();
        this.applyUIPreferences();

        this.renderPhoneHome();
        this.togglePhoneDrawer(false);
        this.closePhoneRecents();
        this.closePhoneControlCenter();

        const vol = document.getElementById('phone-volume');
        if (vol) {
            const next = typeof this.musicWidgetState.volume === 'number' ? this.musicWidgetState.volume : 1;
            vol.value = String(next);
        }

        this.startPhoneClock();
        this.notify('AetherOS', `Mode téléphone • ${this.userName || 'Utilisateur'}`, 'system');
    }

    startPhoneClock() {
        try { if (this._phoneClockInterval) clearInterval(this._phoneClockInterval); } catch (_) { }
        const tick = () => {
            try {
                const el = document.getElementById('phone-time');
                if (!el) return;
                const showSeconds = !!(this.uiPreferences && this.uiPreferences.clockSeconds);
                const locale = this.locale || 'fr-FR';
                const options = {
                    timeZone: this.timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                    ...(showSeconds ? { second: '2-digit' } : {}),
                    hour12: this.timeFormat === '12h'
                };
                el.textContent = new Date().toLocaleTimeString(locale, options);
            } catch (_) { }
        };
        tick();
        this._phoneClockInterval = setInterval(tick, 1000);
    }

    togglePhoneControlCenter(force) {
        const cc = document.getElementById('phone-control-center');
        if (!cc) return;
        const open = typeof force === 'boolean' ? force : !cc.classList.contains('active');
        if (open) {
            this.togglePhoneDrawer(false);
            this.closePhoneRecents();
            cc.classList.add('active');
            cc.setAttribute('aria-hidden', 'false');
        } else {
            this.closePhoneControlCenter();
        }
    }

    closePhoneControlCenter() {
        const cc = document.getElementById('phone-control-center');
        if (!cc) return;
        cc.classList.remove('active');
        cc.setAttribute('aria-hidden', 'true');
    }

    setPhoneMasterVolume(value) {
        const v = Math.max(0, Math.min(1, Number(value)));
        this.phoneMasterVolume = v;
        this.musicWidgetVolume(v);
    }

    togglePhoneTheme() {
        const next = (this.theme === 'light') ? 'dark' : 'light';
        this.setTheme(next);
        this.saveUserData();
        this.renderPhoneHome();
    }

    switchToDesktopShell() {
        if (!this.uiPreferences || typeof this.uiPreferences !== 'object') this.uiPreferences = this.getDefaultUIPreferences();
        this.uiPreferences.shellMode = 'desktop';
        this.saveUserData();
        this.launchDesktop();
    }

    switchToPhoneShell() {
        if (!this.uiPreferences || typeof this.uiPreferences !== 'object') this.uiPreferences = this.getDefaultUIPreferences();
        this.uiPreferences.shellMode = 'phone';
        this.saveUserData();
        this.launchPhone();
    }

    ensurePhoneDefaults() {
        if (!Array.isArray(this.pinnedApps) || this.pinnedApps.length === 0) {
            this.pinnedApps = ['explorer', 'browser', 'spotaether', 'store', 'settings'];
        }
    }

    getPhoneAppMeta(id) {
        const safeId = String(id || '').trim();
        const fromRegistry = Array.isArray(this.appsRegistry)
            ? this.appsRegistry.find(a => a && a.id === safeId)
            : null;
        const title = (fromRegistry && fromRegistry.title) ? String(fromRegistry.title) : (gameTitles[safeId] || safeId);
        const icon = (fromRegistry && fromRegistry.icon) ? String(fromRegistry.icon) : (appIcons[safeId] || '🧩');
        return { id: safeId, title, icon };
    }

    renderPhoneHome() {
        if (!this.isPhoneShellActive()) return;
        this.ensurePhoneDefaults();
        this.renderPhoneWidgets();
        this.renderPhoneHomeGrid();
        this.renderPhoneDock();
        this.renderPhoneDrawer(this.phoneDrawerQuery || '');
    }

    renderPhoneWidgets() {
        const wrap = document.getElementById('phone-widgets');
        if (!wrap) return;

        const prefList = (this.uiPreferences && Array.isArray(this.uiPreferences.phoneWidgets))
            ? this.uiPreferences.phoneWidgets.map(x => String(x || '').trim())
            : this.getDefaultUIPreferences().phoneWidgets;
        const allowed = new Set(['music', 'todo', 'news', 'quote', 'quicklaunch']);
        const widgets = Array.from(new Set(prefList.filter(x => allowed.has(x))));

        const music = this.musicWidgetState || {};
        const musicTitle = String(music.title || 'Aucune lecture');
        const musicArtist = String(music.artist || '—');
        const musicAlbum = String(music.album || '');
        const cover = String(music.coverUrl || '');
        const playing = !!music.isPlaying;

        const todoWidget = Array.isArray(this.activeWidgets) ? this.activeWidgets.find(w => w && w.type === 'todo') : null;
        const todoItems = todoWidget && todoWidget.data && Array.isArray(todoWidget.data.items) ? todoWidget.data.items : [];
        const remaining = todoItems.filter(t => t && !t.done).length;

        const quote = this.getDailyQuote('phone');

        const cards = [];

        if (widgets.includes('music')) {
            cards.push(`
            <div class="phone-widget-card" data-phone-widget="music">
                <div class="phone-widget-head">
                    <div class="phone-widget-title">MUSIQUE</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="widget-mini" onclick="windowManager.musicWidgetControl('prev')" aria-label="Précédent">⏮</button>
                        <button class="widget-mini" onclick="windowManager.musicWidgetControl('${playing ? 'pause' : 'play'}')" aria-label="Play/Pause">${playing ? '⏸' : '▶'}</button>
                        <button class="widget-mini" onclick="windowManager.musicWidgetControl('next')" aria-label="Suivant">⏭</button>
                    </div>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <div style="width:52px; height:52px; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.08); flex:0 0 auto;">
                        ${cover ? `<img src="${this.escapeHtmlAttr(cover)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;">🎵</div>`}
                    </div>
                    <div style="min-width:0; flex:1;">
                        <div style="font-weight:900; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtmlAttr(musicTitle)}</div>
                        <div style="opacity:0.75; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtmlAttr(musicArtist)}${musicAlbum ? ` • ${this.escapeHtmlAttr(musicAlbum)}` : ''}</div>
                        <div style="margin-top:10px; height:6px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden;" onclick="windowManager.musicWidgetSeek(event)">
                            <div style="height:100%; width:${(Number(music.duration) > 0 ? (Math.max(0, Math.min(1, Number(music.currentTime) / Number(music.duration))) * 100) : 0).toFixed(2)}%; background:rgba(255,255,255,0.85); border-radius:999px;"></div>
                        </div>
                    </div>
                </div>
            </div>`);
        }

        if (widgets.includes('todo')) {
            cards.push(`
            <div class="phone-widget-card" data-phone-widget="todo">
                <div class="phone-widget-head">
                    <div class="phone-widget-title">AGENDA / TO‑DO</div>
                    <button class="widget-mini" onclick="windowManager.openPhoneWidgetPicker()" aria-label="Widgets">＋</button>
                </div>
                <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:10px;">
                    <div style="font-size:28px; font-weight:900; letter-spacing:-0.03em;">${remaining}</div>
                    <div style="opacity:0.76; font-size:13px;">tâche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${(todoItems.slice(0, 4)).map((t, idx) => `
                        <label style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.06); cursor:pointer;">
                            <input type="checkbox" ${t && t.done ? 'checked' : ''} onchange="${todoWidget ? `windowManager.todoToggle('${todoWidget.id}', ${idx})` : ''}">
                            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${t && t.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${this.escapeHtmlAttr(t && t.text ? t.text : '')}</span>
                        </label>
                    `).join('') || `<div style="opacity:0.75;">Aucune tâche (ajoute un widget To‑Do sur le bureau).</div>`}
                </div>
            </div>`);
        }

        if (widgets.includes('quote')) {
            cards.push(`
            <div class="phone-widget-card" data-phone-widget="quote">
                <div class="phone-widget-head">
                    <div class="phone-widget-title">CITATION</div>
                    <button class="widget-mini" onclick="windowManager.renderPhoneWidgets()" aria-label="Rafraîchir">✨</button>
                </div>
                <div style="font-weight:900; font-size:16px; line-height:1.25;">“${this.escapeHtmlAttr(quote.text)}”</div>
                <div style="margin-top:10px; opacity:0.78; font-size:12px;">— ${this.escapeHtmlAttr(quote.author)}</div>
            </div>`);
        }

        if (widgets.includes('quicklaunch')) {
            const ids = (Array.isArray(this.pinnedApps) ? this.pinnedApps : []).slice(0, 8);
            const items = ids.map(id => this.getPhoneAppMeta(id)).filter(a => a && a.id);
            cards.push(`
            <div class="phone-widget-card" data-phone-widget="quicklaunch">
                <div class="phone-widget-head">
                    <div class="phone-widget-title">RACCOURCIS</div>
                    <button class="widget-mini" onclick="windowManager.togglePhoneDrawer(true)" aria-label="Apps">▦</button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px;">
                    ${items.map(app => `
                        <button type="button" class="phone-app-icon" data-phone-app="${this.escapeHtmlAttr(app.id)}" style="min-height:auto; padding:10px 6px;" onclick="windowManager.openPhoneApp('${this.escapeHtmlAttr(app.id)}')">
                            <div class="phone-app-emoji">${this.renderAppIconMarkup(app.icon, '🧩')}</div>
                            <div class="phone-app-label">${this.escapeHtmlAttr(app.title)}</div>
                        </button>
                    `).join('')}
                </div>
            </div>`);
        }

        if (widgets.length === 0) {
            cards.push(`
                <div class="phone-widget-card" data-phone-widget="picker">
                    <div class="phone-widget-head">
                        <div class="phone-widget-title">WIDGETS</div>
                        <button class="widget-mini" onclick="windowManager.openPhoneWidgetPicker()" aria-label="Ajouter">＋</button>
                    </div>
                    <div style="opacity:0.78;">Maintiens un widget pour le gérer, ou ajoute-en avec +.</div>
                </div>
            `);
        }

        wrap.innerHTML = cards.join('');
    }

    renderPhoneHomeGrid() {
        const grid = document.getElementById('phone-home-grid');
        if (!grid) return;
        const apps = this.getPhoneAllApps();
        const home = apps.slice(0, 16);
        grid.innerHTML = home.map(app => this.renderPhoneAppIcon(app)).join('');
    }

    renderPhoneDock() {
        const dock = document.getElementById('phone-dock');
        if (!dock) return;
        
        // Conserver les éléments statiques (recherche, paramètres)
        const staticElements = [];
        const staticItems = dock.querySelectorAll('.dock-item');
        staticItems.forEach(item => {
            const title = item.getAttribute('title');
            if (title === 'Recherche' || title === 'Paramètres') {
                staticElements.push(item.outerHTML);
            }
        });
        
        // Ajouter les applications épinglées dynamiquement
        const ids = (Array.isArray(this.pinnedApps) ? this.pinnedApps : []).slice(0, 4); // Plus de place maintenant
        const items = ids.map(id => this.getPhoneAppMeta(id)).filter(a => a && a.id);
        const dynamicItems = items.map(app => `
            <button type="button" class="phone-app-icon" data-phone-app="${this.escapeHtmlAttr(app.id)}" style="min-height:auto; height:46px; padding:8px;" onclick="windowManager.openPhoneApp('${this.escapeHtmlAttr(app.id)}')">
                <div class="phone-app-emoji">${this.renderAppIconMarkup(app.icon, '🧩')}</div>
            </button>
        `).join('');
        
        // Combiner éléments statiques et dynamiques
        dock.innerHTML = staticElements.join('') + dynamicItems;
    }

    getPhoneAllApps() {
        const seen = new Set();
        const list = [];
        const add = (id) => {
            const key = String(id || '').trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(this.getPhoneAppMeta(key));
        };
        (Array.isArray(this.pinnedApps) ? this.pinnedApps : []).forEach(add);
        (Array.isArray(this.installedApps) ? this.installedApps : []).forEach(add);
        (Array.isArray(this.appsRegistry) ? this.appsRegistry : []).forEach(app => add(app && app.id));
        return list.filter(a => a && a.id);
    }

    renderPhoneAppIcon(app) {
        const id = this.escapeHtmlAttr(app.id);
        const label = this.escapeHtmlAttr(app.title);
        const iconMarkup = this.renderAppIconMarkup(app.icon, '🧩');
        return `
            <button type="button" class="phone-app-icon" data-phone-app="${id}" onclick="windowManager.openPhoneApp('${id}')">
                <div class="phone-app-emoji">${iconMarkup}</div>
                <div class="phone-app-label">${label}</div>
            </button>
        `;
    }

    renderPhoneDrawer(query = '') {
        const grid = document.getElementById('phone-drawer-grid');
        if (!grid) return;
        const q = String(query || '').trim().toLowerCase();
        const apps = this.getPhoneAllApps().filter(app => {
            if (!q) return true;
            return (String(app.title || '').toLowerCase().includes(q) || String(app.id || '').toLowerCase().includes(q));
        });
        grid.innerHTML = apps.map(app => this.renderPhoneAppIcon(app)).join('');
    }

    filterPhoneDrawer(value) {
        this.phoneDrawerQuery = String(value || '');
        this.renderPhoneDrawer(this.phoneDrawerQuery);
    }

    togglePhoneDrawer(force) {
        const drawer = document.getElementById('phone-drawer');
        if (!drawer) return;
        const open = typeof force === 'boolean' ? force : !drawer.classList.contains('active');
        if (open) {
            this.closePhoneControlCenter();
            this.closePhoneRecents();
            drawer.classList.add('active');
            drawer.setAttribute('aria-hidden', 'false');
            const input = document.getElementById('phone-drawer-search');
            if (input) {
                try { input.value = this.phoneDrawerQuery || ''; } catch (_) { }
                try { input.focus(); } catch (_) { }
            }
            this.renderPhoneDrawer(this.phoneDrawerQuery || '');
        } else {
            drawer.classList.remove('active');
            drawer.setAttribute('aria-hidden', 'true');
        }
    }

    openPhoneApp(id) {
        if (Date.now() < (Number(this._phoneTapSuppressedUntil) || 0)) return;
        const meta = this.getPhoneAppMeta(id);
        if (!meta || !meta.id) return;

        this.phoneLastApp = meta.id;
        this.trackPhoneRecent(meta.id);

        const stage = document.getElementById('phone-appstage');
        const title = document.getElementById('phone-app-title');
        const frame = document.getElementById('phone-app-frame');
        if (!stage || !frame) return;

        if (title) title.textContent = meta.title || meta.id;
        frame.innerHTML = this.getAppContent(meta.id);

        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        this.closePhoneRecents();

        try { document.body.classList.add('phone-app-open'); } catch (_) { }
        stage.classList.add('active');
        stage.setAttribute('aria-hidden', 'false');
    }

    openPhoneActions(id) {
        const meta = this.getPhoneAppMeta(id);
        if (!meta || !meta.id) return;
        const wrap = document.getElementById('phone-actions');
        const title = document.getElementById('phone-actions-title');
        const grid = document.getElementById('phone-actions-grid');
        const danger = document.getElementById('phone-actions-danger');
        if (!wrap || !grid || !danger) return;

        this._phoneActionsMode = 'app';
        this._phoneActionsAppId = meta.id;
        if (title) title.textContent = meta.title || meta.id;

        const isInstalled = Array.isArray(this.installedApps) ? this.installedApps.includes(meta.id) : false;
        const isPinned = Array.isArray(this.pinnedApps) ? this.pinnedApps.includes(meta.id) : false;

        grid.innerHTML = `
            <button type="button" onclick="windowManager.openPhoneApp('${this.escapeHtmlAttr(meta.id)}'); windowManager.closePhoneActions();">Ouvrir</button>
            <button type="button" onclick="windowManager.phoneTogglePin('${this.escapeHtmlAttr(meta.id)}'); windowManager.closePhoneActions();">${isPinned ? 'Retirer du dock' : 'Épingler au dock'}</button>
            <button type="button" onclick="windowManager.openPhoneWidgetPicker()">Widgets</button>
            <button type="button" onclick="windowManager.createDesktopShortcutForApp('${this.escapeHtmlAttr(meta.id)}'); windowManager.notify('Bureau', 'Raccourci créé.', 'system'); windowManager.closePhoneActions();">Raccourci bureau</button>
            <button type="button" onclick=\"windowManager.togglePhoneDrawer(true); windowManager.closePhoneActions();\">Voir apps</button>
        `;

        danger.innerHTML = isInstalled ? `
            <button type="button" onclick="windowManager.phoneUninstallApp('${this.escapeHtmlAttr(meta.id)}')">Désinstaller</button>
        ` : '';

        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        this.closePhoneRecents();

        wrap.classList.add('active');
        wrap.setAttribute('aria-hidden', 'false');
    }

    openPhoneWidgetActions(type) {
        const wrap = document.getElementById('phone-actions');
        const title = document.getElementById('phone-actions-title');
        const grid = document.getElementById('phone-actions-grid');
        const danger = document.getElementById('phone-actions-danger');
        if (!wrap || !grid || !danger) return;

        const t = String(type || '').trim();
        const mapTitle = { music: 'Musique', todo: 'Agenda / To‑Do', news: 'Actualités', quote: 'Citation', quicklaunch: 'Raccourcis' };
        const list = (this.uiPreferences && Array.isArray(this.uiPreferences.phoneWidgets))
            ? this.uiPreferences.phoneWidgets.map(x => String(x || '').trim())
            : this.getDefaultUIPreferences().phoneWidgets;
        const idx = list.indexOf(t);
        const canMoveUp = idx > 0;
        const canMoveDown = idx !== -1 && idx < (list.length - 1);

        this._phoneActionsMode = 'widget';
        this._phoneActionsAppId = '';
        this._phoneActionsWidgetType = t;
        if (title) title.textContent = `Widget • ${mapTitle[t] || t}`;

        grid.innerHTML = `
            <button type="button" onclick="windowManager.openPhoneWidgetPicker()">Ajouter / Retirer</button>
            <button type="button" onclick="windowManager.phoneWidgetMove('${this.escapeHtmlAttr(t)}', -1)" ${canMoveUp ? '' : 'disabled'}>Monter</button>
            <button type="button" onclick="windowManager.phoneWidgetMove('${this.escapeHtmlAttr(t)}', 1)" ${canMoveDown ? '' : 'disabled'}>Descendre</button>
            <button type="button" onclick="windowManager.closePhoneActions()">Fermer</button>
        `;

        danger.innerHTML = (idx !== -1) ? `
            <button type="button" onclick="windowManager.phoneWidgetRemove('${this.escapeHtmlAttr(t)}')">Retirer ce widget</button>
        ` : '';

        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        this.closePhoneRecents();

        wrap.classList.add('active');
        wrap.setAttribute('aria-hidden', 'false');
    }

    openPhoneWidgetPicker() {
        const wrap = document.getElementById('phone-actions');
        const title = document.getElementById('phone-actions-title');
        const grid = document.getElementById('phone-actions-grid');
        const danger = document.getElementById('phone-actions-danger');
        if (!wrap || !grid || !danger) return;

        const allowed = [
            { id: 'music', name: 'Musique' },
            { id: 'todo', name: 'Agenda / To‑Do' },
            { id: 'quote', name: 'Citation' },
            { id: 'quicklaunch', name: 'Raccourcis' }
        ];

        const list = (this.uiPreferences && Array.isArray(this.uiPreferences.phoneWidgets))
            ? this.uiPreferences.phoneWidgets.map(x => String(x || '').trim())
            : this.getDefaultUIPreferences().phoneWidgets;
        const set = new Set(list);

        this._phoneActionsMode = 'widget_picker';
        this._phoneActionsWidgetType = '';
        if (title) title.textContent = 'Widgets (appui long pour gérer)';

        grid.innerHTML = allowed.map(w => {
            const on = set.has(w.id);
            return `<button type="button" onclick="windowManager.phoneWidgetToggle('${this.escapeHtmlAttr(w.id)}')">${on ? '✅' : '➕'} ${this.escapeHtmlAttr(w.name)}</button>`;
        }).join('') + `<button type="button" onclick="windowManager.closePhoneActions()">Terminé</button>`;

        danger.innerHTML = ``;

        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        this.closePhoneRecents();

        wrap.classList.add('active');
        wrap.setAttribute('aria-hidden', 'false');
    }

    phoneWidgetToggle(type) {
        const t = String(type || '').trim();
        if (!t) return;
        if (!this.uiPreferences || typeof this.uiPreferences !== 'object') this.uiPreferences = this.getDefaultUIPreferences();
        if (!Array.isArray(this.uiPreferences.phoneWidgets)) this.uiPreferences.phoneWidgets = this.getDefaultUIPreferences().phoneWidgets.slice();
        const list = this.uiPreferences.phoneWidgets.map(x => String(x || '').trim()).filter(Boolean);
        const exists = list.includes(t);
        const next = exists ? list.filter(x => x !== t) : [...list, t];
        this.uiPreferences.phoneWidgets = next;
        this.saveUserData();
        this.renderPhoneWidgets();
        if (this._phoneActionsMode === 'widget_picker') this.openPhoneWidgetPicker();
    }

    phoneWidgetRemove(type) {
        const t = String(type || '').trim();
        if (!t) return;
        if (!this.uiPreferences || typeof this.uiPreferences !== 'object') this.uiPreferences = this.getDefaultUIPreferences();
        if (!Array.isArray(this.uiPreferences.phoneWidgets)) this.uiPreferences.phoneWidgets = this.getDefaultUIPreferences().phoneWidgets.slice();
        this.uiPreferences.phoneWidgets = this.uiPreferences.phoneWidgets.map(x => String(x || '').trim()).filter(x => x && x !== t);
        this.saveUserData();
        this.closePhoneActions();
        this.renderPhoneWidgets();
    }

    phoneWidgetMove(type, dir = 0) {
        const t = String(type || '').trim();
        const d = Number(dir) || 0;
        if (!t || !d) return;
        if (!this.uiPreferences || typeof this.uiPreferences !== 'object') this.uiPreferences = this.getDefaultUIPreferences();
        if (!Array.isArray(this.uiPreferences.phoneWidgets)) this.uiPreferences.phoneWidgets = this.getDefaultUIPreferences().phoneWidgets.slice();
        const list = this.uiPreferences.phoneWidgets.map(x => String(x || '').trim()).filter(Boolean);
        const idx = list.indexOf(t);
        if (idx === -1) return;
        const nidx = Math.max(0, Math.min(list.length - 1, idx + (d < 0 ? -1 : 1)));
        if (nidx === idx) return;
        const copy = list.slice();
        const [it] = copy.splice(idx, 1);
        copy.splice(nidx, 0, it);
        this.uiPreferences.phoneWidgets = copy;
        this.saveUserData();
        this.renderPhoneWidgets();
        this.openPhoneWidgetActions(t);
    }

    closePhoneActions() {
        const wrap = document.getElementById('phone-actions');
        if (!wrap) return;
        wrap.classList.remove('active');
        wrap.setAttribute('aria-hidden', 'true');
        this._phoneActionsAppId = '';
        this._phoneActionsMode = '';
        this._phoneActionsWidgetType = '';
    }

    phoneTogglePin(id) {
        const appId = String(id || '').trim();
        if (!appId) return;
        if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];
        const exists = this.pinnedApps.includes(appId);
        if (exists) this.pinnedApps = this.pinnedApps.filter(x => x !== appId);
        else this.pinnedApps = [appId, ...this.pinnedApps].slice(0, 8);
        this.saveUserData();
        if (this.isPhoneShellActive()) this.renderPhoneHome();
    }

    phoneUninstallApp(id) {
        const appId = String(id || '').trim();
        if (!appId) return;
        const ok = confirm(`Désinstaller ${appId} ?`);
        if (!ok) return;
        this.uninstallApp(appId);
        this.closePhoneActions();
        if (this.isPhoneShellActive()) this.renderPhoneHome();
    }

    closePhoneApp() {
        const stage = document.getElementById('phone-appstage');
        const frame = document.getElementById('phone-app-frame');
        if (frame) frame.innerHTML = '';
        if (stage) {
            stage.classList.remove('active');
            stage.setAttribute('aria-hidden', 'true');
        }
        try { document.body.classList.remove('phone-app-open'); } catch (_) { }
    }

    phoneHome() {
        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        this.closePhoneRecents();
        this.closePhoneApp();
    }

    phoneBack() {
        const drawer = document.getElementById('phone-drawer');
        if (drawer && drawer.classList.contains('active')) { this.togglePhoneDrawer(false); return; }
        const cc = document.getElementById('phone-control-center');
        if (cc && cc.classList.contains('active')) { this.closePhoneControlCenter(); return; }
        const actions = document.getElementById('phone-actions');
        if (actions && actions.classList.contains('active')) { this.closePhoneActions(); return; }
        const recents = document.getElementById('phone-recents');
        if (recents && recents.classList.contains('active')) { this.closePhoneRecents(); return; }
        const stage = document.getElementById('phone-appstage');
        if (stage && stage.classList.contains('active')) { this.phoneHome(); return; }
        this.togglePhoneDrawer(true);
    }

    trackPhoneRecent(id) {
        const meta = this.getPhoneAppMeta(id);
        if (!meta || !meta.id) return;
        this.phoneRecents = (Array.isArray(this.phoneRecents) ? this.phoneRecents : []).filter(r => r && r.id !== meta.id);
        this.phoneRecents.unshift({ id: meta.id, title: meta.title, icon: meta.icon, ts: Date.now() });
        this.phoneRecents = this.phoneRecents.slice(0, 12);
        this.renderPhoneRecentsList();
    }

    showPhoneRecents() {
        const wrap = document.getElementById('phone-recents');
        if (!wrap) return;
        this.togglePhoneDrawer(false);
        this.closePhoneControlCenter();
        wrap.classList.add('active');
        wrap.setAttribute('aria-hidden', 'false');
        this.renderPhoneRecentsList();
    }

    closePhoneRecents() {
        const wrap = document.getElementById('phone-recents');
        if (!wrap) return;
        wrap.classList.remove('active');
        wrap.setAttribute('aria-hidden', 'true');
    }

    renderPhoneRecentsList() {
        const list = document.getElementById('phone-recents-list');
        if (!list) return;
        const recents = Array.isArray(this.phoneRecents) ? this.phoneRecents : [];
        if (recents.length === 0) {
            list.innerHTML = `<div style="opacity:0.75; padding: 8px 4px;">Aucune app récente.</div>`;
            return;
        }
        list.innerHTML = recents.map(r => `
            <div class="phone-recents-item" onclick="windowManager.openPhoneApp('${this.escapeHtmlAttr(r.id)}')">
                <div class="meta">
                    <div style="font-size:20px;">${this.escapeHtmlAttr(r.icon || '🧩')}</div>
                    <div class="name">${this.escapeHtmlAttr(r.title || r.id)}</div>
                </div>
                <div style="opacity:0.7; font-weight:900;">›</div>
            </div>
        `).join('');
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

        const normalizeRegistryEntry = (app) => {
            if (!app || typeof app !== 'object') return null;
            const id = String(app.id || '').trim();
            if (!id) return null;

            const title = String(app.title || app.name || '').trim() || id;
            const creator = String(app.creator || app.dev || app.developer || '').trim() || 'Community';
            const description = String(app.description || app.desc || '').trim();
            const category = String(app.category || app.cat || '').trim() || 'productivity';

            const iconRaw = app.icon !== undefined && app.icon !== null ? String(app.icon) : '';
            const icon = iconRaw.trim() ? iconRaw : '📦';

            const typeRaw = String(app.type || '').trim();
            const type = typeRaw || (app.url ? 'site' : '');

            const normalized = {
                ...app,
                id,
                title,
                creator,
                description,
                category,
                icon,
                type
            };

            if (typeof app.url === 'string') normalized.url = app.url;
            if (typeof app.code === 'string') normalized.code = app.code;
            if (typeof app.appFile === 'string') normalized.appFile = app.appFile;
            if (Array.isArray(app.screenshots)) normalized.screenshots = app.screenshots;

            return normalized;
        };

        // Merge Store-approved community apps into the OS registry (so Dock/Desktop use correct title/icon).
        try {
            const approvedRaw = JSON.parse(localStorage.getItem('aether_approved_apps') || '[]');
            const approved = (Array.isArray(approvedRaw) ? approvedRaw : [])
                .map(normalizeRegistryEntry)
                .filter(Boolean);
            if (approved.length > 0) {
                const ids = new Set(approved.map(a => a.id));
                this.appsRegistry = [...this.appsRegistry.filter(a => a && !ids.has(a.id)), ...approved];
            }
        } catch (e) { }

        // V3.1: Merge Custom AI Apps
        if (this.customApps && this.customApps.length > 0) {
            const normalizedCustom = (Array.isArray(this.customApps) ? this.customApps : [])
                .map(normalizeRegistryEntry)
                .filter(Boolean);
            this.customApps = normalizedCustom;
            const customIds = new Set(normalizedCustom.map(a => a.id));
            this.appsRegistry = [...this.appsRegistry.filter(a => a && !customIds.has(a.id)), ...normalizedCustom];
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
            if (prefs.dnd && type !== 'security') return;
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

        if (!options.force) {
            if (prefs.sound && !prefs.dnd) {
                try { this.playNotificationSound(); } catch (err) { }
            }
        }
    }

    playNotificationSound() {
        // Lightweight beep. Browsers may block audio until user interaction.
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!this._notifAudioCtx) this._notifAudioCtx = new Ctx();
            const ctx = this._notifAudioCtx;
            if (ctx.state === 'suspended') ctx.resume().catch(() => { });
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = 880;
            g.gain.value = 0.0001;
            o.connect(g);
            g.connect(ctx.destination);
            const now = ctx.currentTime;
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
            o.start(now);
            o.stop(now + 0.20);
        } catch (err) { }
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
        this.persistSessionWindows();
    }

    openWebWrap(url, name = '', icon = '🌐') {
        const raw = String(url || '').trim();
        if (!raw) return;
        const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        let safeUrl = '';
        try {
            const parsed = new URL(withProtocol);
            if (!['http:', 'https:'].includes(parsed.protocol)) return;
            safeUrl = parsed.href;
        } catch (err) {
            return;
        }

        // Security warning for external websites (Store web games, unknown domains, etc.).
        if (!this.maybeOpenExternalUrlWithSecurityPrompt(safeUrl, { name, icon })) return;
        return this.openWebWrapUnsafe(safeUrl, name, icon);
    }

    openWebWrapUnsafe(url, name = '', icon = '') {
        const safeUrl = String(url || '').trim();
        if (!safeUrl) return;
        const safeName = String(name || '').trim();
        const safeIcon = String(icon || '').trim();
         const id = `webwrap_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
         if (!this.webWrapApps || typeof this.webWrapApps !== 'object') this.webWrapApps = {};
         this.webWrapApps[id] = { url: safeUrl, name: safeName, icon: safeIcon };
         this.saveUserData();
 
         let title = safeName;
         if (!title) {
             try { title = new URL(safeUrl).hostname; } catch (err) { title = 'Web'; }
         }
        if (safeIcon) title = `${safeIcon} ${title}`;
        this.createWindow(id, title, true);
        return id;
    }

    getSecuritySettings() {
        const s = this.aetherSettings || this.loadAetherSettingsFromStorage() || {};
        const sec = (s.security && typeof s.security === 'object') ? s.security : {};
        const warnings = (typeof sec.warnings === 'boolean') ? sec.warnings : true;
        const level = String(sec.level || 'normal').trim() || 'normal';
        const firewall = (typeof sec.firewall === 'boolean') ? sec.firewall : false;
        const developerMode = (typeof sec.developerMode === 'boolean') ? sec.developerMode : false;
        const verifiedApps = Array.isArray(sec.verifiedApps) ? sec.verifiedApps.map(String) : [];
        return { warnings, level, firewall, developerMode, verifiedApps, raw: s };
    }

    isDomainTrusted(host) {
        const h = String(host || '').trim().toLowerCase();
        if (!h) return false;
        const { verifiedApps } = this.getSecuritySettings();
        return verifiedApps.includes(`domain:${h}`) || verifiedApps.includes(h);
    }

    trustDomain(host) {
        const h = String(host || '').trim().toLowerCase();
        if (!h) return;
        const s = this.loadAetherSettingsFromStorage() || {};
        if (!s.security || typeof s.security !== 'object') s.security = { level: 'normal', verifiedApps: [], warnings: true };
        if (!Array.isArray(s.security.verifiedApps)) s.security.verifiedApps = [];
        const token = `domain:${h}`;
        if (!s.security.verifiedApps.includes(token)) s.security.verifiedApps.push(token);
        try { localStorage.setItem('aether_settings', JSON.stringify(s)); } catch (err) { }
        this.applyAetherSettings(s, { persist: false });
    }

    maybeOpenExternalUrlWithSecurityPrompt(url, { name = '', icon = '' } = {}) {
        const { warnings, level, firewall } = this.getSecuritySettings();
        if (!warnings) return true;

        let host = '';
        try { host = new URL(String(url)).hostname || ''; } catch (err) { host = ''; }
        const hostLower = String(host || '').toLowerCase();
        if (!hostLower) return true;

        // Always allow local dev hosts without nagging.
        if (hostLower === 'localhost' || hostLower === '127.0.0.1') return true;

        if (this.isDomainTrusted(hostLower)) return true;

        const mode = (firewall || level === 'high' || level === 'strict') ? 'warn_strict' : 'warn';
        this.showSecurityPrompt({ url, host: hostLower, title: String(name || hostLower), mode }, (decision) => {
            if (!decision || !decision.open) return;
            if (decision.trust) this.trustDomain(hostLower);
            // Open after confirmation (no recursion).
            this.openWebWrapUnsafe(url, name, icon);
        });

        return false;
    }

    showSecurityPrompt(payload, onDone) {
        const overlay = document.getElementById('security-prompt-modal');
        if (!overlay) {
            const ok = confirm(`Ouvrir un site externe non vérifié ?\n${payload && payload.url ? payload.url : ''}`);
            if (ok && typeof onDone === 'function') onDone({ open: true, trust: false });
            return;
        }
        const titleEl = document.getElementById('sec-prompt-title');
        const urlEl = document.getElementById('sec-prompt-url');
        const hostEl = document.getElementById('sec-prompt-host');
        const subEl = document.getElementById('sec-prompt-sub');
        const trustEl = document.getElementById('sec-prompt-trust');
        const openBtn = document.getElementById('sec-prompt-open');
        const cancelBtn = document.getElementById('sec-prompt-cancel');

        const url = String(payload && payload.url || '').trim();
        const host = String(payload && payload.host || '').trim();
        const title = String(payload && payload.title || host || 'Site externe').trim();
        const mode = String(payload && payload.mode || 'warn');

        if (titleEl) titleEl.textContent = title || 'Site externe';
        if (urlEl) urlEl.textContent = url;
        if (hostEl) hostEl.textContent = host ? `Domaine: ${host}` : '';
        if (subEl) subEl.textContent = (mode === 'warn_strict')
            ? 'Niveau de sécurité élevé: vérifiez bien l’URL avant d’ouvrir. Si vous lui faites confiance, cochez la case pour ne plus voir cet avertissement.'
            : 'Ce site n’est pas vérifié. Il peut afficher des publicités, demander des permissions ou rediriger vers d’autres pages.';
        if (trustEl) trustEl.checked = false;

        if (openBtn) openBtn.textContent = 'Ouvrir quand même';

        const cleanup = () => {
            try { overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); } catch (err) { }
            setTimeout(() => { try { overlay.style.display = 'none'; } catch (err) { } }, 150);
            try {
                openBtn && openBtn.removeEventListener('click', onOpen);
                cancelBtn && cancelBtn.removeEventListener('click', onCancel);
                overlay && overlay.removeEventListener('click', onOverlay);
            } catch (err) { }
        };
        const done = (result) => {
            cleanup();
            if (typeof onDone === 'function') onDone(result);
        };

        const onOpen = (e) => { e && e.preventDefault(); done({ open: true, trust: !!(trustEl && trustEl.checked) }); };
        const onCancel = (e) => { e && e.preventDefault(); done({ open: false, trust: false }); };
        const onOverlay = (e) => { if (e && e.target === overlay) onCancel(e); };

        try { overlay.style.display = 'flex'; overlay.setAttribute('aria-hidden', 'false'); } catch (err) { }
        requestAnimationFrame(() => { try { overlay.classList.add('active'); } catch (err) { } });

        try {
            openBtn && openBtn.addEventListener('click', onOpen);
            cancelBtn && cancelBtn.addEventListener('click', onCancel);
            overlay && overlay.addEventListener('click', onOverlay);
        } catch (err) { }
    }

    getAppContent(id) {
        const phoneParamIds = new Set(['store', 'settings', 'explorer', 'admin', 'spotaether', 'browser']);
        const maybePhone = (src) => {
            if (!this.isPhoneShellActive()) return src;
            if (!phoneParamIds.has(String(id || '').trim())) return src;
            return this.appendUrlParam(src, 'phone', '1');
        };

        const localFileAliases = { webos: 'browser', sheets: 'excel', slides: 'powerpoint', docs: 'word' };
        const localFirstApps = new Set(['docs', 'word', 'sheets', 'excel', 'slides', 'powerpoint']);
        if (localFirstApps.has(id)) {
            const resolvedId = localFileAliases[id] || id;
            const appFile = `apps/${resolvedId}.html`;
            return `<iframe src="${maybePhone(appFile)}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        if (id.startsWith('webwrap_') && this.webWrapApps && this.webWrapApps[id] && this.webWrapApps[id].url) {
            const cfg = this.webWrapApps[id];
            const url = encodeURIComponent(String(cfg.url || '').trim());
            const name = encodeURIComponent(String(cfg.name || '').trim());
            const icon = encodeURIComponent(String(cfg.icon || '').trim());
            const src = `apps/webwrap.html#url=${url}&name=${name}&icon=${icon}`;
            return `<iframe src="${src}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        const registryAppInfo = this.appsRegistry.find(app => app && app.id === id);
        if (registryAppInfo && registryAppInfo.url) {
            // V3.1: URL-based apps are wrapped in the browser component (proxy-capable)
            const browserSrc = `apps/newbrowser.html#embed=1&url=${encodeURIComponent(registryAppInfo.url)}`;
            return `<iframe src="${maybePhone(browserSrc)}" style="width:100%; height:100%; border:none; background:#1e1e1e;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
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
                    const browserSrc = `apps/newbrowser.html#embed=1&url=${encodeURIComponent(registryUrl)}`;
                    return `<iframe src="${maybePhone(browserSrc)}" style="width:100%; height:100%; border:none; background:#1e1e1e;" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                }
            }

            if (registryApp.type === 'microtool') {
                const toolId = encodeURIComponent(registryApp.toolId || registryApp.id || id);
                const toolName = encodeURIComponent(registryApp.title || id);
                return `<iframe src="apps/microtools.html?tool=${toolId}&name=${toolName}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }

            if (typeof registryApp.appFile === 'string' && registryApp.appFile.trim()) {
                const rawFile = registryApp.appFile.trim();
                const appSrc = rawFile.startsWith('apps/') ? rawFile : `apps/${rawFile}`;
                return `<iframe src="${maybePhone(appSrc)}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }
        }
    
    // V3.1: Custom AI Apps (Code based)
    if (registryApp && registryApp.code) {
        return `<iframe srcdoc='${registryApp.code.replace(/'/g, "&#39;")}' style="width:100%; height:100%; border:none; background:white;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
    }

        if (id.startsWith('dev_app_')) {
            const code = (this.devApps[id] || '').replace(/'/g, "&#39;");
            return `<iframe srcdoc='${code}' style="width:100%; height:100%; border:none; background:white;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
        }

        if (id.startsWith('dev_url_')) {
            const previewUrl = normalizeExternalUrl(this.devUrls[id]);
            if (previewUrl) {
                return `<iframe src="${previewUrl}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
            }
        }

            try {
                const approved = JSON.parse(localStorage.getItem('aether_approved_apps') || '[]');
                const communityApp = approved.find(app => app.id === id);
                if (communityApp) {
                    if (communityApp.type === 'site') {
                        const siteUrl = normalizeExternalUrl(communityApp.url);
                        if (siteUrl) {
                        const runtimeEnv = (typeof window !== 'undefined' && window.AETHER_RUNTIME_ENV)
                            ? window.AETHER_RUNTIME_ENV
                            : {};
                        const uvOrigin = String(runtimeEnv.AETHER_UV_ORIGIN || '').trim();
                        if (uvOrigin) {
                            const browserSrc = `apps/newbrowser.html#embed=1&url=${encodeURIComponent(siteUrl)}`;
                            return `<iframe src="${browserSrc}" style="width:100%; height:100%; border:none; background:#1e1e1e;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                        }
                        return `<iframe src="${siteUrl}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
                        }
                    } else if (communityApp.code) {
                        return `<iframe srcdoc='${communityApp.code.replace(/'/g, "&#39;")}' style="width:100%; height:100%; border:none; background:white;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
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

        return `<iframe src="${appFile}" style="width:100%; height:100%; border:none; background:#0f172a;" allow="autoplay; encrypted-media" id="iframe-${id}" onload="windowManager.initIframeUser('${id}')"></iframe>`;
    }

    initIframeUser(id) {
        const iframe = document.getElementById(`iframe-${id}`);
        if (!iframe) return;

        // Keep iframe theme in sync with the OS (same-origin only; safe-guarded inside syncThemeToIframe).
        this.syncThemeToIframe(id);

        iframe.contentWindow.postMessage({
            type: 'funnyweb_user_sync',
            userName: this.userName,
            pin: this.pin,
            sessionID: this.sessionID,
            profilePic: this.profilePic,
            theme: this.theme,
            accentColor: this.getComputedAccentColor ? this.getComputedAccentColor() : '',
            fontFamily: this.fontFamily || '',
            baseFontSizePx: Number(this.baseFontSizePx) || 14,
            locale: this.locale,
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
        const existed = !!this.vfs[path];
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

        if (!existed && this.isDesktopRootPath(path)) {
            if (!Array.isArray(this.desktopIconOrder)) this.desktopIconOrder = [];
            const normalized = this.normalizeVfsPath(path);
            this.desktopIconOrder = [...this.desktopIconOrder.filter(p => this.normalizeVfsPath(p) !== normalized), normalized];
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
        if (this.isDesktopRootPath(path)) {
            this.desktopIconOrder = (Array.isArray(this.desktopIconOrder) ? this.desktopIconOrder : [])
                .filter(p => this.normalizeVfsPath(p) !== path);
        }
        this.saveUserData();
        this.syncAllIframes();
        this.renderDesktop(); // Refresh desktop icons
        if (this.currentAccount) {
            this.deleteVfsEntryFromSupabase(this.currentAccount, path).catch(() => {});
        }
    }

    vfs_move(oldPath, newPath) {
        oldPath = this.normalizeVfsPath(oldPath);
        newPath = this.normalizeVfsPath(newPath);
        if (!oldPath || !newPath || oldPath === '/' || newPath === '/') return false;
        if (!this.vfs[oldPath]) return false;
        if (newPath.startsWith(oldPath + '/')) return false;
        if (this.vfs[newPath]) return false;

        const movedKeys = Object.keys(this.vfs).filter(p => p === oldPath || p.startsWith(oldPath + '/'));
        if (movedKeys.length === 0) return false;

        const nextVfs = { ...this.vfs };
        movedKeys.forEach((p) => {
            const suffix = p.slice(oldPath.length);
            const dest = `${newPath}${suffix}`;
            nextVfs[dest] = nextVfs[p];
            delete nextVfs[p];
        });

        this.vfs = this.rebuildVfsTree(nextVfs);

        // Keep desktop order consistent (root only)
        if (Array.isArray(this.desktopIconOrder)) {
            this.desktopIconOrder = this.desktopIconOrder
                .map(p => {
                    const normalized = this.normalizeVfsPath(p);
                    if (normalized === oldPath) return newPath;
                    if (normalized.startsWith(oldPath + '/')) return `${newPath}${normalized.slice(oldPath.length)}`;
                    return normalized;
                })
                .filter(Boolean);
        }

        this.saveUserData();
        this.syncAllIframes();
        this.renderDesktop();

        if (this.currentAccount) {
            try {
                movedKeys.forEach((p) => {
                    const suffix = p.slice(oldPath.length);
                    const dest = `${newPath}${suffix}`;
                    this.upsertVfsEntryToSupabase(this.currentAccount, dest, this.vfs[dest]).catch(() => {});
                    this.deleteVfsEntryFromSupabase(this.currentAccount, p).catch(() => {});
                });
            } catch (_) { }
        }

        return true;
    }

    setWallpaper(theme) {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;
        const selectedTheme = typeof theme === 'string' ? theme.trim() : '';
        if (!selectedTheme) return;

        const presets = {
            default: "var(--bg-image)",
            gradient: "linear-gradient(135deg, #1e293b, #4c1d95)",
            blue: "#0f172a",
            dark: "#020617",
            sunset: "linear-gradient(135deg, #f64f59, #12c2e9)",
            // Settings app presets (v3 settings modules)
            forest: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
            ocean: "linear-gradient(135deg, #2E3192 0%, #1bffff 100%)"
        };

        const resolveCustomWallpaper = () => {
            try {
                const raw = localStorage.getItem('aether_settings');
                if (!raw) return '';
                const parsed = JSON.parse(raw);
                const value = parsed && parsed.personalization ? parsed.personalization.customWallpaper : '';
                return (typeof value === 'string' && value.trim()) ? value.trim() : '';
            } catch (err) {
                return '';
            }
        };

        if (selectedTheme === 'custom') {
            const custom = resolveCustomWallpaper();
            this.wallpaper = custom
                ? `url('${custom}')`
                : (this.wallpaper || presets.default);
        } else if (Object.prototype.hasOwnProperty.call(presets, selectedTheme)) {
            this.wallpaper = presets[selectedTheme];
        } else if (selectedTheme.startsWith('data:') || selectedTheme.startsWith('http')) {
            this.wallpaper = `url('${selectedTheme}')`;
        } else if (typeof CSS !== 'undefined' && CSS && typeof CSS.supports === 'function') {
            const supportsImage = CSS.supports('background-image', selectedTheme);
            const supportsColor = CSS.supports('background-color', selectedTheme);
            this.wallpaper = (supportsImage || supportsColor) ? selectedTheme : presets.default;
        } else {
            this.wallpaper = selectedTheme;
        }

        // V3: Fix wallpaper stretching
        if (desktop) {
            desktop.style.backgroundSize = "cover";
            desktop.style.backgroundRepeat = "no-repeat";
            desktop.style.backgroundPosition = "center";
        }

        const layers = document.querySelectorAll('#setup-overlay, #login-overlay, #desktop');
        const hasImageLayer = /url\(|gradient|var\(/.test(this.wallpaper);

        // CSS forces `background-image: var(--bg-image) !important;` on the desktop/overlays.
        // Update the variable so custom images/gradients actually apply (and avoid a black screen).
        const root = document.documentElement;
        const isDefaultVar = this.wallpaper === presets.default || this.wallpaper === 'var(--bg-image)';
        if (root) {
            if (hasImageLayer) {
                if (isDefaultVar) root.style.removeProperty('--bg-image');
                else root.style.setProperty('--bg-image', this.wallpaper);
            } else {
                root.style.setProperty('--bg-image', 'none');
            }
        }

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

    syncThemeToIframe(id) {
        // Backwards-compatible theme-only sync, now delegates to the full style sync.
        const iframe = document.getElementById(`iframe-${id}`);
        if (!iframe || !iframe.contentWindow) return;
        const normalized = this.theme === 'light' ? 'light' : 'dark';
        const excludeTheme = !!(this.themeSyncExclusions && this.themeSyncExclusions.has(String(id || '')));

        if (!excludeTheme) {
            try { iframe.contentWindow.postMessage({ type: 'funnyweb_theme_change', theme: normalized }, '*'); } catch (err) { }
        }
        this.syncStyleToIframe(id);
    }

    syncThemeToIframes() {
        this.windows.forEach((win, id) => this.syncThemeToIframe(id));
    }

    setTheme(theme = 'dark') {
        const normalized = theme === 'light' ? 'light' : 'dark';
        const root = document.documentElement;
        if (root) root.setAttribute('data-theme', normalized);
        if (document.body) document.body.dataset.theme = normalized;
        this.theme = normalized;
        try { localStorage.setItem('aether_theme', normalized); } catch (err) { }
        if (this.currentAccount) this.saveUserData();
        this.syncStyleToIframes();
    }

    setAccentColor(color = '#0078d4') {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--accent', color);
        root.style.setProperty('--accent-glow', color);
        root.style.setProperty('--primary', color);
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setFontFamily(fontName = '') {
        const raw = typeof fontName === 'string' ? fontName.trim() : '';
        if (!raw) return;
        // Store as a simple family name and build a safe stack.
        const quoted = /[\\s,]/.test(raw) ? `'${raw.replace(/'/g, "\\'")}'` : raw;
        const stack = `${quoted}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const root = document.documentElement;
        if (root) root.style.setProperty('--font-main', stack);
        this.fontFamily = raw;
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setBaseFontSizePx(px = 14) {
        const v = Math.max(11, Math.min(22, Math.round(Number(px) || 14)));
        const root = document.documentElement;
        if (root) root.style.fontSize = `${v}px`;
        this.baseFontSizePx = v;
        this.applyAccessibilitySettings();
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setReducedMotion(enabled) {
        if (!this.accessibility) this.accessibility = this.getDefaultAccessibility();
        this.accessibility.reducedMotion = !!enabled;
        // Reduce motion on the shell as well.
        const root = document.documentElement;
        if (root) {
            if (this.accessibility.reducedMotion) {
                root.style.setProperty('--dur', '0s');
                root.style.setProperty('--transition-fast', '0s');
                root.style.setProperty('--transition-normal', '0s');
            } else {
                root.style.removeProperty('--dur');
                root.style.removeProperty('--transition-fast');
                root.style.removeProperty('--transition-normal');
            }
        }
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setHighContrast(enabled) {
        if (!this.accessibility) this.accessibility = this.getDefaultAccessibility();
        this.accessibility.highContrast = !!enabled;
        this.applyAccessibilitySettings();
        this.syncStyleToIframes();
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
        // Keep one source of truth: base font size in px (Settings slider).
        const base = Number(this.baseFontSizePx) || 14;
        root.style.fontSize = `${base}px`;
        root.classList.toggle('high-contrast', !!this.accessibility.highContrast);

        // Color-blindness simulation (approximation).
        try {
            const cb = String(this.accessibility && this.accessibility.colorBlind || 'off');
            const cbFilter = (cb === 'protanopia')
                ? 'grayscale(0.05) saturate(0.85) hue-rotate(-18deg)'
                : (cb === 'deuteranopia')
                    ? 'grayscale(0.05) saturate(0.85) hue-rotate(12deg)'
                    : (cb === 'tritanopia')
                        ? 'grayscale(0.05) saturate(0.85) hue-rotate(40deg)'
                        : '';
            const parts = [];
            if (this.accessibility.highContrast) parts.push('contrast(1.25)');
            if (cbFilter) parts.push(cbFilter);
            const filter = parts.length ? parts.join(' ') : '';
            const docEl = document.documentElement;
            if (docEl) {
                if (filter) docEl.style.filter = filter;
                else docEl.style.removeProperty('filter');
                docEl.dataset.colorblind = cb;
            }
        } catch (err) { }
    }

    speak(text, { interrupt = true } = {}) {
        const msg = String(text || '').replace(/\s+/g, ' ').trim();
        if (!msg) return;
        if (!('speechSynthesis' in window)) return;

        const now = Date.now();
        if (!this._lastSpoken) this._lastSpoken = { text: '', at: 0 };
        if (this._lastSpoken.text === msg && (now - this._lastSpoken.at) < 700) return;
        this._lastSpoken = { text: msg, at: now };

        try {
            if (interrupt) window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(msg);
            u.lang = this.locale || 'fr-FR';
            u.rate = 1;
            u.pitch = 1;
            window.speechSynthesis.speak(u);
        } catch (err) { }
    }

    getSpeakableTextFromElement(el, doc) {
        try {
            if (!el || el.nodeType !== 1) return '';
            const e = el;
            const getAttr = (k) => {
                try { return String(e.getAttribute(k) || '').trim(); } catch (err) { return ''; }
            };

            // Prefer explicit accessible names.
            let label = getAttr('aria-label') || getAttr('title') || getAttr('alt');

            // Try associated <label for="..."> for form fields.
            if (!label && e.id && doc && doc.querySelector) {
                try {
                    const cssEscape = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape : null;
                    const q = cssEscape ? `label[for="${cssEscape(e.id)}"]` : `label[for="${e.id.replace(/\"/g, '')}"]`;
                    const l = doc.querySelector(q);
                    if (l && l.textContent) label = String(l.textContent).trim();
                } catch (err) { }
            }

            const tag = String(e.tagName || '').toLowerCase();
            if (!label && (tag === 'input' || tag === 'textarea')) {
                label = getAttr('placeholder') || String(e.value || '').trim() || getAttr('name');
            }
            if (!label && tag === 'select') {
                try {
                    const opt = e.selectedOptions && e.selectedOptions[0];
                    label = (opt && opt.textContent) ? String(opt.textContent).trim() : '';
                } catch (err) { }
            }

            if (!label) {
                const txt = String(e.textContent || '').replace(/\s+/g, ' ').trim();
                label = txt;
            }

            if (!label) return '';
            if (label.length > 140) label = label.slice(0, 140) + '…';
            return label;
        } catch (err) {
            return '';
        }
    }

    setScreenReaderEnabled(enabled, { announce = true } = {}) {
        if (!this.accessibility) this.accessibility = this.getDefaultAccessibility();
        const next = !!enabled;
        const prev = !!this.accessibility.screenReader;
        this.accessibility.screenReader = next;

        if (prev !== next) {
            if (announce) this.speak(next ? 'Lecture d’écran activée' : 'Lecture d’écran désactivée');
            try { if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (err) { }
        }

        // Shell listeners (start menu, spotlight, etc.)
        if (!this._srShellHandlers) this._srShellHandlers = null;
        if (next && !this._srShellHandlers) {
            const onFocus = (e) => {
                const t = this.getSpeakableTextFromElement(e && e.target, document);
                if (t) this.speak(t, { interrupt: true });
            };
            const onClick = (e) => {
                const t = this.getSpeakableTextFromElement(e && e.target, document);
                if (t) this.speak(t, { interrupt: true });
            };
            this._srShellHandlers = { onFocus, onClick };
            try {
                document.addEventListener('focusin', onFocus, true);
                document.addEventListener('click', onClick, true);
            } catch (err) { }
        } else if (!next && this._srShellHandlers) {
            try {
                document.removeEventListener('focusin', this._srShellHandlers.onFocus, true);
                document.removeEventListener('click', this._srShellHandlers.onClick, true);
            } catch (err) { }
            this._srShellHandlers = null;
        }

        // Apply to all open apps (same-origin).
        try { this.syncStyleToIframes(); } catch (err) { }
    }

    syncScreenReaderToDocument(doc) {
        try {
            const win = doc && doc.defaultView;
            if (!win || !doc || !doc.addEventListener) return;
            const enabled = !!(this.accessibility && this.accessibility.screenReader);

            if (!enabled) {
                const h = win.__aether_sr_handlers;
                if (h) {
                    try { doc.removeEventListener('focusin', h.onFocus, true); } catch (err) { }
                    try { doc.removeEventListener('click', h.onClick, true); } catch (err) { }
                    try { delete win.__aether_sr_handlers; } catch (err) { win.__aether_sr_handlers = null; }
                }
                return;
            }

            if (win.__aether_sr_handlers) return;

            const onFocus = (e) => {
                const t = this.getSpeakableTextFromElement(e && e.target, doc);
                if (t) this.speak(t, { interrupt: true });
            };
            const onClick = (e) => {
                const t = this.getSpeakableTextFromElement(e && e.target, doc);
                if (t) this.speak(t, { interrupt: true });
            };
            win.__aether_sr_handlers = { onFocus, onClick };
            doc.addEventListener('focusin', onFocus, true);
            doc.addEventListener('click', onClick, true);
        } catch (err) { }
    }

    setLocale(locale = 'fr-FR') {
        const raw = String(locale || '').trim();
        if (!raw) return;
        this.locale = raw;
        this.saveUserData();
        try { updateClock(); } catch (err) { }
    }

    setTimeZone(timeZone = '') {
        const tz = String(timeZone || '').trim();
        if (!tz) return;
        this.timeZone = tz;
        this.saveUserData();
        try { updateClock(); } catch (err) { }
        this.syncStyleToIframes();
    }

    setTransparencyEffectsEnabled(enabled) {
        const on = !!enabled;
        this.transparencyEffectsEnabled = on;
        try {
            if (document.body) document.body.classList.toggle('no-blur', !on);
        } catch (err) { }
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setLetterSpacing(mode = 'normal') {
        const m = String(mode || 'normal').trim();
        this.letterSpacing = (m === 'wide' || m === 'tight') ? m : 'normal';
        const css = (this.letterSpacing === 'wide') ? '0.04em' : (this.letterSpacing === 'tight') ? '-0.02em' : 'normal';
        try {
            const root = document.documentElement;
            if (root) root.style.letterSpacing = css;
        } catch (err) { }
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setPerformanceMode(enabled) {
        const on = !!enabled;
        this.performanceMode = on;
        try {
            if (document.body) document.body.classList.toggle('performance-mode', on);
        } catch (err) { }
        // Actual behavior is applied by applyAetherSettings (reduced motion, blur, etc.).
        this.syncStyleToIframes();
        this.saveUserData();
    }

    setAutostartEnabled(enabled) {
        this.autostartEnabled = !!enabled;
        this.saveUserData();
    }

    setSleepMinutes(minutes = 0) {
        const m = Math.max(0, Math.min(60, Math.round(Number(minutes) || 0)));
        this.sleepMinutes = m;
        this.configureIdleSleepTimer();
        this.saveUserData();
    }

    setFirewallEnabled(enabled) {
        this.firewallEnabled = !!enabled;
        this.saveUserData();
    }

    setDeveloperMode(enabled) {
        this.developerMode = !!enabled;
        try {
            if (document.body) document.body.classList.toggle('developer-mode', this.developerMode);
        } catch (err) { }
        this.saveUserData();
    }

    bindIdleActivityListeners() {
        if (this._idleBound) return;
        this._idleBound = true;
        const bump = () => { this._idleLastActivity = Date.now(); };
        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'pointerdown', 'wheel'].forEach((ev) => {
            try { window.addEventListener(ev, bump, { passive: true }); } catch (err) { }
        });
    }

    configureIdleSleepTimer() {
        this.bindIdleActivityListeners();
        if (this._idleTimer) {
            clearInterval(this._idleTimer);
            this._idleTimer = null;
        }
        if (!this.sleepMinutes || this.sleepMinutes <= 0) return;
        this._idleTimer = setInterval(() => {
            try {
                const idleMs = Date.now() - (this._idleLastActivity || Date.now());
                if (idleMs >= (this.sleepMinutes * 60 * 1000)) {
                    this._idleLastActivity = Date.now();
                    this.lockSession();
                }
            } catch (err) { }
        }, 5000);
    }

    getSessionWindowsStorageKey() {
        const base = 'aether_last_windows_v1';
        const name = String(this.currentAccount || this.userName || '').trim().toLowerCase();
        return name ? `${base}:${name}` : base;
    }

    persistSessionWindows() {
        try {
            const key = this.getSessionWindowsStorageKey();
            const ids = Array.from(this.windows.keys()).filter((id) => {
                const s = String(id || '');
                if (!s) return false;
                return true;
            });
            localStorage.setItem(key, JSON.stringify({ ids, at: Date.now() }));
        } catch (err) { }
    }

    restoreSessionWindows() {
        try {
            const key = this.getSessionWindowsStorageKey();
            let raw = localStorage.getItem(key);
            if (!raw && key !== 'aether_last_windows_v1') {
                raw = localStorage.getItem('aether_last_windows_v1');
                if (raw) {
                    try { localStorage.setItem(key, raw); } catch (err) { }
                }
            }
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const ids = (parsed && Array.isArray(parsed.ids)) ? parsed.ids.map(String) : [];
            ids.forEach((id) => {
                 if (!id || this.windows.has(id)) return;
                 if (id.startsWith('webwrap_')) {
                     const cfg = (this.webWrapApps && this.webWrapApps[id] && this.webWrapApps[id].url) ? this.webWrapApps[id] : null;
                     if (!cfg) return;
                     const rawUrl = String(cfg.url || '').trim();
                     const rawName = String(cfg.name || '').trim();
                     const rawIcon = String(cfg.icon || '').trim();
                     let title = rawName;
                     if (!title) {
                         try { title = new URL(rawUrl).hostname; } catch (err) { title = 'Web'; }
                     }
                     if (rawIcon) title = `${rawIcon} ${title}`;
                     this.createWindow(id, title || id, true);
                     return;
                 }
                 this.createWindow(id, id, true);
             });
         } catch (err) { }
     }

    getComputedAccentColor() {
        try {
            const root = document.documentElement;
            if (!root) return '#C084FC';
            const v = getComputedStyle(root).getPropertyValue('--accent').trim();
            return v || '#C084FC';
        } catch (err) {
            return '#C084FC';
        }
    }

    getComputedFontStack() {
        try {
            const root = document.documentElement;
            if (!root) return '';
            return getComputedStyle(root).getPropertyValue('--font-main').trim();
        } catch (err) {
            return '';
        }
    }

    syncStyleToIframe(id) {
        const iframe = document.getElementById(`iframe-${id}`);
        if (!iframe || !iframe.contentWindow) return;
        const normalized = this.theme === 'light' ? 'light' : 'dark';
        const accent = this.getComputedAccentColor();
        const fontStack = this.getComputedFontStack();
        const baseFontPx = Number(this.baseFontSizePx) || 14;
        const accessibility = this.accessibility || this.getDefaultAccessibility();
        const excludeTheme = !!(this.themeSyncExclusions && this.themeSyncExclusions.has(String(id || '')));
        const letterSpacingMode = (this.letterSpacing === 'wide' || this.letterSpacing === 'tight') ? this.letterSpacing : 'normal';
        const letterSpacingCss = (letterSpacingMode === 'wide') ? '0.04em' : (letterSpacingMode === 'tight') ? '-0.02em' : 'normal';
        const baselineFontPx = 14;
        const textScale = Math.max(0.78, Math.min(1.57, baseFontPx / baselineFontPx));

        // Notify apps that support postMessage-based sync.
        try {
            iframe.contentWindow.postMessage({
                type: 'funnyweb_style_sync',
                theme: excludeTheme ? null : normalized,
                accentColor: excludeTheme ? null : accent,
                fontFamily: this.fontFamily || '',
                fontStack: fontStack || '',
                baseFontSizePx: baseFontPx,
                letterSpacing: letterSpacingMode,
                accessibility
            }, '*');
        } catch (err) { }

        // Same-origin only: enforce styles via injected CSS so ALL apps follow the system settings.
        try {
            const doc = iframe.contentDocument;
            if (!doc || !doc.documentElement) return;
            if (!excludeTheme) {
                doc.documentElement.setAttribute('data-theme', normalized);
                if (doc.body) doc.body.dataset.theme = normalized;
            } else {
                // Let the app decide its own theme.
                try { doc.documentElement.removeAttribute('data-theme'); } catch (err) { }
                try { if (doc.body) delete doc.body.dataset.theme; } catch (err) { }
            }

            // Set variables that many apps use.
            if (!excludeTheme) {
                doc.documentElement.style.setProperty('--accent', accent);
                doc.documentElement.style.setProperty('--primary', accent);
            } else {
                try { doc.documentElement.style.removeProperty('--accent'); } catch (err) { }
                try { doc.documentElement.style.removeProperty('--primary'); } catch (err) { }
            }
            // Helpful derived accent vars for apps that support them (Explorer, Settings, etc.).
            try {
                const hex = String(accent || '').trim();
                const m = /^#?([0-9a-f]{6})$/i.exec(hex);
                if (m) {
                    const n = parseInt(m[1], 16);
                    const r = (n >> 16) & 255;
                    const g = (n >> 8) & 255;
                    const b = n & 255;
                    doc.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
                    doc.documentElement.style.setProperty('--accent-bg', `rgba(${r},${g},${b},0.15)`);
                    doc.documentElement.style.setProperty('--accent-hover', `rgba(${r},${g},${b},0.10)`);
                }
            } catch (err) { }
            if (fontStack) doc.documentElement.style.setProperty('--font-main', fontStack);
            // Force a stable baseline and scale the whole UI so even px-based apps respond to "Taille du texte".
            doc.documentElement.style.fontSize = `${baselineFontPx}px`;
            doc.documentElement.style.letterSpacing = letterSpacingCss;
            doc.documentElement.style.setProperty('--aether-text-scale', String(textScale));
            if (doc.body) {
                if (Math.abs(textScale - 1) < 0.01) doc.body.style.removeProperty('zoom');
                else doc.body.style.zoom = `${Math.round(textScale * 100)}%`;
            }

            let styleEl = doc.getElementById('aether-os-injected-style');
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'aether-os-injected-style';
                (doc.head || doc.documentElement).appendChild(styleEl);
            }
            const reduce = !!accessibility.reducedMotion;
            const contrast = !!accessibility.highContrast;
            const cb = String(accessibility.colorBlind || 'off');
            const cbFilter = (cb === 'protanopia')
                ? 'grayscale(0.05) saturate(0.85) hue-rotate(-18deg)'
                : (cb === 'deuteranopia')
                    ? 'grayscale(0.05) saturate(0.85) hue-rotate(12deg)'
                    : (cb === 'tritanopia')
                        ? 'grayscale(0.05) saturate(0.85) hue-rotate(40deg)'
                        : '';
            const filterParts = [];
            if (contrast) filterParts.push('contrast(1.25)');
            if (cbFilter) filterParts.push(cbFilter);
            const filterCss = filterParts.length ? `html{filter:${filterParts.join(' ')} !important;}` : '';
            styleEl.textContent = `
                :root{ ${excludeTheme ? '' : `--accent:${accent}; --primary:${accent};`} ${fontStack ? `--font-main:${fontStack};` : ''} }
                html,body{ ${fontStack ? `font-family:var(--font-main) !important;` : ''} font-size:${baselineFontPx}px !important; letter-spacing:${letterSpacingCss} !important; }
                ${filterCss}
                ${reduce ? '*{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;scroll-behavior:auto !important;}' : ''}
            `;

            // Screen reader hooks (same-origin only).
            this.syncScreenReaderToDocument(doc);
        } catch (err) { }
    }

    syncStyleToIframes() {
        this.windows.forEach((win, id) => this.syncStyleToIframe(id));
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

    loadAetherSettingsFromStorage() {
        try {
            const raw = localStorage.getItem('aether_settings');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    applyAetherSettingsFromStorage() {
        const settings = this.loadAetherSettingsFromStorage();
        if (settings) this.applyAetherSettings(settings, { persist: false });
    }

    applyAetherSettings(settings, { persist = false } = {}) {
        if (!settings || typeof settings !== 'object') return;

        // Cache for fast checks (security warnings, locale, etc.).
        this.aetherSettings = settings;
        const isFirstApply = !this._aetherSettingsAppliedOnce;
        this._aetherSettingsAppliedOnce = true;

        let animationsEnabled = true;
        let blurEffectsEnabled = true;
        let perfMode = false;
        let reducedMotionPref = null;
        let screenReaderPref = null;

        // Profile (username/email/status)
        try {
            if (settings.profile && typeof settings.profile === 'object') {
                const p = settings.profile;
                if (typeof p.userName === 'string' && p.userName.trim()) this.userName = p.userName.trim();
                if (typeof p.email === 'string') this.profileEmail = String(p.email || '');
                if (typeof p.status === 'string') this.profileStatus = String(p.status || '');
            }
        } catch (err) { }

        if (settings.theme === 'light' || settings.theme === 'dark') this.setTheme(settings.theme);
        if (typeof settings.accentColor === 'string' && settings.accentColor.trim()) this.setAccentColor(settings.accentColor.trim());

        // Personalization
        if (settings.personalization && typeof settings.personalization === 'object') {
            const p = settings.personalization;
            if (typeof p.wallpaper === 'string' && p.wallpaper.trim()) this.setWallpaper(p.wallpaper.trim());
            if (Number.isFinite(Number(p.uiScale))) this.setUIScale(Number(p.uiScale));
            if (typeof p.fontFamily === 'string' && p.fontFamily.trim()) this.setFontFamily(p.fontFamily.trim());
            if (typeof p.animations === 'boolean') animationsEnabled = p.animations;
            if (typeof p.blurEffects === 'boolean') blurEffectsEnabled = p.blurEffects;
            if (typeof p.letterSpacing === 'string' && p.letterSpacing.trim()) this.setLetterSpacing(p.letterSpacing.trim());
        }

        // System (locale/time zone)
        if (settings.system && typeof settings.system === 'object') {
            const sys = settings.system;
            if (typeof sys.language === 'string' && sys.language.trim()) this.setLocale(sys.language.trim());
            if (typeof sys.timeZone === 'string' && sys.timeZone.trim()) this.setTimeZone(sys.timeZone.trim());
            if (typeof sys.timeFormat === 'string' && sys.timeFormat.trim()) {
                this.timeFormat = (sys.timeFormat.trim() === '12h') ? '12h' : '24h';
                try { updateClock(); } catch (err) { }
            }
            if (typeof sys.performanceMode === 'boolean') {
                perfMode = !!sys.performanceMode;
                this.setPerformanceMode(perfMode);
            }
            if (typeof sys.autostart === 'boolean') this.setAutostartEnabled(!!sys.autostart);
            if (Number.isFinite(Number(sys.sleepMinutes))) this.setSleepMinutes(Number(sys.sleepMinutes));
        }

        // Security
        if (settings.security && typeof settings.security === 'object') {
            const sec = settings.security;
            if (typeof sec.firewall === 'boolean') this.setFirewallEnabled(sec.firewall);
            if (typeof sec.developerMode === 'boolean') this.setDeveloperMode(sec.developerMode);
        }

        // Accessibility
        if (settings.accessibility && typeof settings.accessibility === 'object') {
            const a = settings.accessibility;
            if (typeof a.highContrast === 'boolean') this.setHighContrast(a.highContrast);
            if (typeof a.reducedMotion === 'boolean') reducedMotionPref = a.reducedMotion;
            if (Number.isFinite(Number(a.fontPx))) this.setBaseFontSizePx(Number(a.fontPx));
            if (typeof a.fontSize === 'string' && a.fontSize.trim()) {
                if (!this.accessibility) this.accessibility = this.getDefaultAccessibility();
                this.accessibility.fontSize = a.fontSize.trim();
                this.applyAccessibilitySettings();
            }
            if (!this.accessibility) this.accessibility = this.getDefaultAccessibility();
            if (typeof a.colorBlind === 'string') this.accessibility.colorBlind = String(a.colorBlind || 'off');
            if (typeof a.stickyKeys === 'boolean') this.accessibility.stickyKeys = !!a.stickyKeys;
            if (Number.isFinite(Number(a.pointerSpeed))) this.accessibility.pointerSpeed = Math.max(1, Math.min(10, Math.round(Number(a.pointerSpeed))));
            if (typeof a.screenReader === 'boolean') screenReaderPref = !!a.screenReader;
            if (typeof a.captions === 'boolean') this.accessibility.captions = !!a.captions;
            this.applyAccessibilitySettings();
            // Attach/detach SR hooks (shell + same-origin apps). Avoid speaking on boot.
            if (screenReaderPref !== null) this.setScreenReaderEnabled(screenReaderPref, { announce: !isFirstApply });
        }

        // Effective derived prefs (perf/animations/blur).
        const effectiveReducedMotion = !!reducedMotionPref || !animationsEnabled || !!perfMode;
        const effectiveBlur = !!blurEffectsEnabled && !perfMode;
        this.setReducedMotion(effectiveReducedMotion);
        this.setTransparencyEffectsEnabled(effectiveBlur);

        // Dock/taskbar + notifications
        try {
            const nextUi = { ...(this.uiPreferences || {}) };
            if (settings.taskbar && typeof settings.taskbar === 'object') {
                nextUi.dockPosition = settings.taskbar.position || nextUi.dockPosition;
                nextUi.trayStyle = settings.taskbar.style || nextUi.trayStyle;
                nextUi.dockSize = settings.taskbar.size || nextUi.dockSize;
            }
            if (settings.notifications && typeof settings.notifications === 'object') {
                nextUi.notifications = settings.notifications;
            }
            this.uiPreferences = this.sanitizeUIPreferences(nextUi);
            this.applyUIPreferences();
        } catch (err) { }

        if (persist) {
            try { localStorage.setItem('aether_settings', JSON.stringify(settings)); } catch (err) { }
        }

        // Ensure all current windows immediately reflect the new settings.
        this.syncStyleToIframes();
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
            { id: 'w_music', type: 'music', x: window.innerWidth - 340, y: 180, data: {} },
            { id: 'w_todo', type: 'todo', x: window.innerWidth - 340, y: 430, data: { items: [], events: [] } }
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
            el.style.width = w.type === 'music' ? '320px' : '280px';
            
            // Content based on type
            if (w.type === 'clock') {
                const date = new Date();
                const locale = this.locale || 'fr-FR';
                const timeLabel = (() => {
                    try {
                        return new Intl.DateTimeFormat(locale, {
                            timeZone: this.timeZone,
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: this.timeFormat === '12h'
                        }).format(date);
                    } catch (err) {
                        return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                    }
                })();
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Horloge</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <div class="widget-clock-time">${timeLabel}</div>
                        <div class="widget-clock-date">${date.toLocaleDateString(locale, { timeZone: this.timeZone, weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    </div>
                `;
            } else if (w.type === 'system') {
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Système</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <div class="sys-row"><span>CPU</span><span class="sys-val ok">12%</span></div>
                        <div class="sys-bar"><div class="sys-fill ok" style="width:12%"></div></div>
                        <div class="sys-row"><span>RAM</span><span class="sys-val info">3.4GB</span></div>
                        <div class="sys-bar"><div class="sys-fill info" style="width:45%"></div></div>
                    </div>
                `;
            } else if (w.type === 'battery') {
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Batterie</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <div class="widget-kpi">🔋 85%</div>
                        <div class="widget-sub">Sur batterie</div>
                    </div>
                `;
            } else if (w.type === 'note') {
                el.style.width = '280px';
                el.style.height = '200px';
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Note</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <textarea class="widget-note" placeholder="Écrivez quelque chose...">${w.content || ''}</textarea>
                    </div>
                `;
                const textarea = el.querySelector('textarea');
                textarea.onchange = (e) => {
                    w.content = e.target.value;
                    this.saveUserData();
                };
            } else if (w.type === 'music') {
                const s = this.musicWidgetState || {};
                const title = s.title || 'Aucune musique';
                const artist = s.artist || '—';
                const album = s.album || '';
                const cover = s.coverUrl || '';
                const dur = Number(s.duration) || 0;
                const cur = Number(s.currentTime) || 0;
                const pct = dur > 0 ? Math.max(0, Math.min(100, (cur / dur) * 100)) : 0;
                const vol = Math.max(0, Math.min(1, Number(s.volume)));
                const playing = !!s.isPlaying;
                const accent = this.hashToColor(`${title}|${artist}|${album}`);

                el.classList.add('widget-music');
                el.style.setProperty('--music-accent', accent);
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Musique</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <div class="music-row">
                            <div class="music-cover ${playing ? 'playing' : ''}">
                                ${cover ? `<img src="${this.escapeHtmlAttr(cover)}" alt="">` : `<div class="music-cover-placeholder">🎵</div>`}
                            </div>
                            <div class="music-meta">
                                <div class="music-title">${this.escapeHtmlAttr(title)}</div>
                                <div class="music-artist">${this.escapeHtmlAttr(artist)}</div>
                                ${album ? `<div class="music-album">${this.escapeHtmlAttr(album)}</div>` : ``}
                            </div>
                        </div>

                        <div class="music-controls">
                            <button class="music-btn" onclick="windowManager.musicWidgetControl('prev')" aria-label="Précédent">⏮</button>
                            <button class="music-btn primary" onclick="windowManager.musicWidgetControl('${playing ? 'pause' : 'play'}')" aria-label="Play/Pause">${playing ? '⏸' : '▶'}</button>
                            <button class="music-btn" onclick="windowManager.musicWidgetControl('next')" aria-label="Suivant">⏭</button>
                        </div>

                        <div class="music-progress" onclick="windowManager.musicWidgetSeek(event)">
                            <div class="music-progress-track"></div>
                            <div class="music-progress-fill" style="width:${pct.toFixed(2)}%"></div>
                            <div class="music-progress-glow ${playing ? 'on' : ''}" style="left:${pct.toFixed(2)}%"></div>
                        </div>
                        <div class="music-time">
                            <span>${this.formatSeconds(cur)}</span>
                            <span>${this.formatSeconds(dur)}</span>
                        </div>

                        <div class="music-visual ${playing ? 'on' : ''}">
                            ${Array.from({ length: 12 }).map((_, i) => `<div class="bar" style="--i:${i}"></div>`).join('')}
                        </div>

                        <div class="music-volume">
                            <span class="vol-ico">🔊</span>
                            <input type="range" min="0" max="1" step="0.01" value="${vol}" oninput="windowManager.musicWidgetVolume(this.value)">
                        </div>
                    </div>
                `;

                // Ask apps for a fresh state (best effort)
                this.requestMusicStateRefresh();
            } else if (w.type === 'todo') {
                if (!w.data || typeof w.data !== 'object') w.data = { items: [], events: [] };
                if (!Array.isArray(w.data.items)) w.data.items = [];
                if (!Array.isArray(w.data.events)) w.data.events = [];

                const today = new Date();
                const ymd = today.toISOString().slice(0, 10);
                const items = w.data.items;
                const remaining = items.filter(t => !t.done).length;
                const events = w.data.events.filter(ev => String(ev.date || '') === ymd).slice(0, 3);

                el.style.width = '320px';
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Agenda / To‑Do</div>
                        <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                    </div>
                    <div class="widget-body">
                        <div class="todo-summary">
                            <div class="todo-kpi">${remaining}</div>
                            <div class="todo-sub">tâche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} aujourd’hui</div>
                        </div>

                        <div class="todo-add">
                            <input class="todo-input" id="todo-input-${w.id}" placeholder="Ajouter une tâche..." onkeypress="if(event.key==='Enter') windowManager.todoAdd('${w.id}')">
                            <button class="todo-add-btn" onclick="windowManager.todoAdd('${w.id}')">＋</button>
                        </div>

                        <div class="todo-list">
                            ${items.slice(0, 6).map((t, idx) => `
                                <label class="todo-item ${t.done ? 'done' : ''}">
                                    <input type="checkbox" ${t.done ? 'checked' : ''} onchange="windowManager.todoToggle('${w.id}', ${idx})">
                                    <span>${this.escapeHtmlAttr(t.text || '')}</span>
                                </label>
                            `).join('') || `<div class="todo-empty">Aucune tâche</div>`}
                        </div>

                        <div class="todo-events-head">
                            <div>Événements du jour</div>
                            <button class="todo-mini-btn" onclick="windowManager.todoAddEvent('${w.id}')">Ajouter</button>
                        </div>
                        <div class="todo-events">
                            ${events.map(ev => `
                                <div class="todo-event">
                                    <div class="todo-event-time">${this.escapeHtmlAttr(ev.time || '')}</div>
                                    <div class="todo-event-title">${this.escapeHtmlAttr(ev.title || '')}</div>
                                </div>
                            `).join('') || `<div class="todo-empty">Aucun événement</div>`}
                        </div>
                    </div>
                `;
            } else if (w.type === 'news') {
                if (!w.data || typeof w.data !== 'object') w.data = { feeds: [], items: [], lastError: '' };
                if (!Array.isArray(w.data.feeds)) w.data.feeds = [];
                if (!Array.isArray(w.data.items)) w.data.items = [];
                const items = w.data.items.slice(0, 6);
                el.style.width = '360px';
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Actualités</div>
                        <div class="widget-actions">
                            <button class="widget-mini" onclick="windowManager.newsConfigure('${w.id}')" aria-label="Flux">⚙️</button>
                            <button class="widget-mini" onclick="windowManager.newsRefresh('${w.id}')" aria-label="Rafraîchir">⟳</button>
                            <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                        </div>
                    </div>
                    <div class="widget-body">
                        ${w.data.lastError ? `<div class="widget-warn">${this.escapeHtmlAttr(w.data.lastError)}</div>` : ``}
                        <div class="news-list">
                            ${items.map((it) => `
                                <div class="news-item" onclick="windowManager.openUrlMini(${JSON.stringify(it.link || '')}, ${JSON.stringify(it.title || 'News')})">
                                    <div class="news-thumb">${it.image ? `<img src="${this.escapeHtmlAttr(it.image)}" alt="">` : `<div class="news-thumb-ph">📰</div>`}</div>
                                    <div class="news-text">
                                        <div class="news-title">${this.escapeHtmlAttr(it.title || '')}</div>
                                        <div class="news-sub">${this.escapeHtmlAttr(it.source || '')}</div>
                                    </div>
                                </div>
                            `).join('') || `<div class="todo-empty">Aucun item (ajoute un flux RSS).</div>`}
                        </div>
                    </div>
                `;
            } else if (w.type === 'quote') {
                const quote = this.getDailyQuote(w.data && w.data._nonce ? w.data._nonce : '');
                el.style.width = '320px';
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Citation</div>
                        <div class="widget-actions">
                            <button class="widget-mini" onclick="windowManager.quoteNext('${w.id}')" aria-label="Changer">✨</button>
                            <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                        </div>
                    </div>
                    <div class="widget-body">
                        <div class="quote-card">
                            <div class="quote-mark">“</div>
                            <div class="quote-text">${this.escapeHtmlAttr(quote.text)}</div>
                            <div class="quote-author">${this.escapeHtmlAttr(quote.author)}</div>
                        </div>
                    </div>
                `;
            } else if (w.type === 'quicklaunch') {
                if (!w.data || typeof w.data !== 'object') w.data = { appIds: [] };
                if (!Array.isArray(w.data.appIds) || w.data.appIds.length === 0) {
                    w.data.appIds = Array.from(new Set((Array.isArray(this.pinnedApps) ? this.pinnedApps : []).filter(Boolean))).slice(0, 10);
                }
                const apps = w.data.appIds.map(id => this.resolveAppCatalogEntry(id)).filter(Boolean);
                el.style.width = '360px';
                el.innerHTML = `
                    <div class="widget-head">
                        <div class="widget-title">Quick Launch</div>
                        <div class="widget-actions">
                            <button class="widget-mini" onclick="windowManager.quickLaunchEdit('${w.id}')" aria-label="Modifier">✎</button>
                            <button class="widget-close" onclick="windowManager.removeWidget('${w.id}')" aria-label="Supprimer">×</button>
                        </div>
                    </div>
                    <div class="widget-body">
                        <div class="ql-grid" ondragover="event.preventDefault()">
                            ${apps.map((app, idx) => `
                                <div class="ql-item" draggable="true"
                                    ondragstart="windowManager.quickLaunchDragStart('${w.id}', ${idx})"
                                    ondrop="windowManager.quickLaunchDrop('${w.id}', ${idx}); event.preventDefault();"
                                    onclick="windowManager.installApp('${this.escapeHtmlAttr(app.id)}')">
                                    <div class="ql-ico">${this.renderAppIconMarkup(app.icon, '📦')}</div>
                                    <div class="ql-label">${this.escapeHtmlAttr(app.title || app.id)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Drag Logic
            el.onmousedown = (e) => this.handleWidgetDrag(e, w);
            
            container.appendChild(el);
        });
    }

    handleWidgetDrag(e, widget) {
        e.stopPropagation();
        // Don't drag when interacting with controls/inputs inside widgets.
        try {
            if (e.target && (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select') || e.target.closest('a'))) {
                return;
            }
        } catch (_) { }
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

    isDesktopRootPath(path) {
        const normalized = this.normalizeVfsPath(path);
        return normalized.startsWith('/Bureau/') && normalized.split('/').length === 3;
    }

    getDesktopRootPaths() {
        return Object.keys(this.vfs || {}).filter(p => this.isDesktopRootPath(p));
    }

    normalizeDesktopIconOrder(order = [], desktopRootPaths = []) {
        const rootSet = new Set((Array.isArray(desktopRootPaths) ? desktopRootPaths : []).map(p => this.normalizeVfsPath(p)));
        const rawOrder = Array.isArray(order) ? order : [];
        const seen = new Set();
        const cleaned = rawOrder
            .map(p => this.normalizeVfsPath(p))
            .filter(p => rootSet.has(p))
            .filter(p => {
                if (seen.has(p)) return false;
                seen.add(p);
                return true;
            });
        const rest = Array.from(rootSet).filter(p => !seen.has(p)).sort();
        return [...cleaned, ...rest];
    }

    ensureDesktopOrderUpToDate() {
        const roots = this.getDesktopRootPaths();
        this.desktopIconOrder = this.normalizeDesktopIconOrder(this.desktopIconOrder, roots);
    }

    sanitizeDesktopName(name = '') {
        const raw = String(name || '').trim();
        const compact = raw.replace(/\s+/g, ' ');
        const cleaned = compact.replace(/[\\\/:*?"<>|]/g, '').trim();
        return cleaned || 'Nouveau';
    }

    ensureUniqueNameInFolder(folderPath, baseName) {
        const folder = this.normalizeVfsPath(folderPath);
        const base = this.sanitizeDesktopName(baseName);
        const existing = new Set(Object.keys(this.vfs || {}).filter(p => {
            const parent = p.substring(0, p.lastIndexOf('/')) || '/';
            return parent === folder;
        }).map(p => p.split('/').pop()));

        if (!existing.has(base)) return base;
        for (let i = 2; i < 99; i++) {
            const candidate = `${base} (${i})`;
            if (!existing.has(candidate)) return candidate;
        }
        return `${base} (${Date.now()})`;
    }

    // ==================== WIDGET HELPERS ====================
    getWidgetById(id) {
        return (Array.isArray(this.activeWidgets) ? this.activeWidgets : []).find(w => w && w.id === id) || null;
    }

    saveWidgetData() {
        this.saveUserData();
        try { this.renderWidgets(); } catch (_) { }
        try { if (this.isPhoneShellActive()) this.renderPhoneWidgets(); } catch (_) { }
    }

    escapeText(value = '') {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    formatSeconds(value = 0) {
        const seconds = Math.max(0, Math.floor(Number(value) || 0));
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    hashToColor(seed = '') {
        const s = String(seed || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        const hue = h % 360;
        return `hsl(${hue} 88% 58%)`;
    }

    // ==================== MUSIC WIDGET ====================
    findMusicIframes() {
        const ids = [];
        try {
            this.windows.forEach((win, id) => {
                if (!win || !win.iframe || !win.iframe.contentWindow) return;
                const key = String(id || '');
                if (key === 'spotaether' || key === 'music' || key.includes('spotaether') || key.includes('music')) ids.push({ id: key, win });
            });
        } catch (_) { }
        return ids;
    }

    requestMusicStateRefresh() {
        try {
            const now = Date.now();
            if (now - (this._musicWidgetLastTick || 0) < 600) return;
            this._musicWidgetLastTick = now;
            this.findMusicIframes().forEach(({ win }) => {
                try { win.iframe.contentWindow.postMessage({ type: 'AETHER_MUSIC_REQUEST' }, '*'); } catch (_) { }
            });
        } catch (_) { }
    }

    updateMusicWidgetStateFromMessage(state = {}, sourceWindow = null) {
        const next = state && typeof state === 'object' ? state : {};
        const merged = {
            ...this.musicWidgetState,
            sourceAppId: String(next.sourceAppId || this.musicWidgetState.sourceAppId || ''),
            title: String(next.title || ''),
            artist: String(next.artist || ''),
            album: String(next.album || ''),
            coverUrl: String(next.coverUrl || ''),
            duration: Number(next.duration) || 0,
            currentTime: Number(next.currentTime) || 0,
            isPlaying: !!next.isPlaying,
            volume: typeof next.volume === 'number' ? Math.max(0, Math.min(1, next.volume)) : (this.musicWidgetState.volume || 1)
        };
        this.musicWidgetState = merged;
        this.renderWidgets();
        if (this.isPhoneShellActive()) this.renderPhoneWidgets();
    }

    musicWidgetControl(action) {
        const act = String(action || '').trim();
        if (!act) return;
        this.findMusicIframes().forEach(({ win }) => {
            try { win.iframe.contentWindow.postMessage({ type: 'AETHER_MUSIC_CONTROL', action: act }, '*'); } catch (_) { }
        });
    }

    musicWidgetSeek(ev) {
        try {
            const bar = ev.currentTarget;
            const rect = bar.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            const duration = Number(this.musicWidgetState.duration) || 0;
            const time = duration > 0 ? duration * pos : 0;
            this.findMusicIframes().forEach(({ win }) => {
                try { win.iframe.contentWindow.postMessage({ type: 'AETHER_MUSIC_CONTROL', action: 'seek', time }, '*'); } catch (_) { }
            });
        } catch (_) { }
    }

    musicWidgetVolume(value) {
        const volume = Math.max(0, Math.min(1, Number(value)));
        this.musicWidgetState.volume = volume;
        this.findMusicIframes().forEach(({ win }) => {
            try { win.iframe.contentWindow.postMessage({ type: 'AETHER_MUSIC_CONTROL', action: 'volume', volume }, '*'); } catch (_) { }
        });
    }

    // ==================== TODO / AGENDA WIDGET ====================
    todoAdd(widgetId) {
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = { items: [], events: [] };
        if (!Array.isArray(w.data.items)) w.data.items = [];

        const input = document.getElementById(`todo-input-${widgetId}`);
        const text = input ? String(input.value || '').trim() : '';
        if (!text) return;
        w.data.items.unshift({ text, done: false, createdAt: Date.now(), date: new Date().toISOString().slice(0, 10) });
        if (input) input.value = '';
        this.saveWidgetData();
    }

    todoToggle(widgetId, idx) {
        const w = this.getWidgetById(widgetId);
        if (!w || !w.data || !Array.isArray(w.data.items)) return;
        const item = w.data.items[idx];
        if (!item) return;
        item.done = !item.done;
        item.updatedAt = Date.now();
        this.saveWidgetData();
    }

    todoAddEvent(widgetId) {
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = { items: [], events: [] };
        if (!Array.isArray(w.data.events)) w.data.events = [];

        const title = prompt('Titre de l’événement :');
        if (!title) return;
        const time = prompt('Heure (ex: 14:30) :', '09:00') || '';
        const date = prompt('Date (YYYY-MM-DD) :', new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);
        w.data.events.unshift({ title: String(title).trim(), time: String(time).trim(), date: String(date).trim() });
        this.saveWidgetData();
    }

    // ==================== NEWS (RSS) WIDGET ====================
    newsConfigure(widgetId) {
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = { feeds: [], items: [], lastError: '' };
        const current = Array.isArray(w.data.feeds) ? w.data.feeds.join('\n') : '';
        const next = prompt('Flux RSS (1 par ligne) :', current);
        if (next === null) return;
        const feeds = String(next || '').split('\n').map(s => s.trim()).filter(Boolean);
        w.data.feeds = feeds;
        this.saveWidgetData();
        this.newsRefresh(widgetId);
    }

    async newsRefresh(widgetId) {
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = { feeds: [], items: [], lastError: '' };
        if (!Array.isArray(w.data.feeds) || w.data.feeds.length === 0) {
            w.data.items = [];
            w.data.lastError = '';
            this.saveWidgetData();
            return;
        }

        const all = [];
        w.data.lastError = '';
        for (const feed of w.data.feeds.slice(0, 6)) {
            try {
                const resp = await fetch(feed, { method: 'GET' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const xmlText = await resp.text();
                const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
                const channelTitle = (doc.querySelector('channel > title')?.textContent || '').trim();
                const items = Array.from(doc.querySelectorAll('item')).slice(0, 8).map((it) => {
                    const title = (it.querySelector('title')?.textContent || '').trim();
                    const link = (it.querySelector('link')?.textContent || '').trim();
                    const pub = (it.querySelector('pubDate')?.textContent || '').trim();
                    const enc = it.querySelector('enclosure[url]');
                    const media = it.querySelector('media\\:thumbnail[url], thumbnail[url]');
                    const image = (media && media.getAttribute('url')) || (enc && enc.getAttribute('url')) || '';
                    return { title, link, pub, image, source: channelTitle || feed };
                }).filter(it => it.title && it.link);
                all.push(...items);
            } catch (err) {
                w.data.lastError = `Impossible de charger certains flux (CORS/URL).`;
            }
        }
        w.data.items = all.slice(0, 20);
        this.saveWidgetData();
    }

    openUrlMini(url, title = 'Lien') {
        const raw = String(url || '').trim();
        if (!raw) return;
        const id = 'dev_url_' + Date.now();
        if (!this.devUrls) this.devUrls = {};
        this.devUrls[id] = raw;
        this.createWindow(id, String(title || 'Lien'), true);
    }

    // ==================== QUOTE WIDGET ====================
    getDailyQuote(extraSeed = '') {
        const quotes = [
            { text: 'Fais simple, puis améliore.', author: 'AetherOS' },
            { text: 'La discipline bat la motivation.', author: 'Anonyme' },
            { text: 'Un petit pas aujourd’hui, un grand changement demain.', author: 'Anonyme' },
            { text: 'Construis ce que tu veux utiliser.', author: 'Anonyme' },
            { text: 'La constance est une super‑puissance.', author: 'Anonyme' }
        ];
        const dayKey = new Date().toISOString().slice(0, 10) + '|' + String(extraSeed || '');
        let h = 0;
        for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
        return quotes[h % quotes.length];
    }

    quoteNext(widgetId) {
        // Just re-render: daily quote is deterministic, but user wants motion.
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = {};
        w.data._nonce = Date.now();
        this.saveWidgetData();
    }

    // ==================== QUICK LAUNCH ====================
    quickLaunchEdit(widgetId) {
        const w = this.getWidgetById(widgetId);
        if (!w) return;
        if (!w.data || typeof w.data !== 'object') w.data = { appIds: [] };
        const current = Array.isArray(w.data.appIds) ? w.data.appIds.join(',') : '';
        const next = prompt('IDs d’apps séparés par des virgules :', current);
        if (next === null) return;
        const ids = String(next || '').split(',').map(s => s.trim()).filter(Boolean);
        w.data.appIds = Array.from(new Set(ids));
        this.saveWidgetData();
    }

    quickLaunchDragStart(widgetId, idx) {
        try {
            const w = this.getWidgetById(widgetId);
            if (!w || !w.data || !Array.isArray(w.data.appIds)) return;
            this._qlDrag = { widgetId, idx };
        } catch (_) { }
    }

    quickLaunchDrop(widgetId, idx) {
        const drag = this._qlDrag;
        if (!drag || drag.widgetId !== widgetId) return;
        const w = this.getWidgetById(widgetId);
        if (!w || !w.data || !Array.isArray(w.data.appIds)) return;
        const from = drag.idx;
        const to = idx;
        if (from === to) return;
        const arr = w.data.appIds;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        this._qlDrag = null;
        this.saveWidgetData();
    }

    createDesktopShortcutForApp(appId, folderPath = '/Bureau') {
        const id = String(appId || '').trim();
        if (!id) return null;
        const entry = this.resolveAppCatalogEntry(id);
        const title = entry ? entry.title : id;
        const folder = this.normalizeVfsPath(folderPath || '/Bureau');
        const filename = this.ensureUniqueNameInFolder(folder, title);
        const path = `${folder}/${filename}`;

        if (folder === '/Bureau') {
            if (!Array.isArray(this.desktopIconOrder)) this.desktopIconOrder = [];
            this.desktopIconOrder = [...this.desktopIconOrder.filter(p => this.normalizeVfsPath(p) !== path), path];
        }

        this.vfs_write(path, { targetType: 'app', targetId: id }, 'shortcut');
        return path;
    }

    renameDesktopItem(path, nextName) {
        const oldPath = this.normalizeVfsPath(path);
        const item = this.vfs[oldPath];
        if (!item) return false;
        const parent = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
        const name = this.ensureUniqueNameInFolder(parent, nextName);
        const newPath = `${parent}/${name}`;
        if (newPath === oldPath) return false;
        return this.vfs_move(oldPath, newPath);
    }

    activateDesktopItem(path) {
        const normalized = this.normalizeVfsPath(path);
        const item = this.vfs[normalized];
        if (!item) return;

        if (item.type === 'folder') {
            this.openDesktopFolderQuick(normalized, { reset: true });
            return;
        }

        if (item.type === 'shortcut') {
            const payload = (item.content && typeof item.content === 'object') ? item.content : {};
            const targetType = String(payload.targetType || '').trim();
            const targetId = String(payload.targetId || '').trim();
            const targetPath = String(payload.targetPath || '').trim();

            if (targetType === 'app' && targetId) {
                this.installApp(targetId);
                return;
            }
            if (targetType === 'file' && targetPath) {
                this.openFile(targetPath);
                return;
            }

            this.notify('Système', 'Raccourci invalide.', 'file');
            return;
        }

        this.openFile(normalized);
    }

    handleDesktopIconClick(event, path) {
        try {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        } catch (_) { }
        const normalized = this.normalizeVfsPath(path);
        const item = this.vfs[normalized];
        if (!item) return;
        if (item.type === 'folder') {
            this.openDesktopFolderQuick(normalized, { reset: true });
        }
    }

    desktopPointerDown(event, path) {
        try {
            if (!event) return;
            const pointerType = String(event.pointerType || '').toLowerCase();
            const isTouch = pointerType === 'touch' || pointerType === 'pen';
            if (!isTouch) return; // Mouse: rely on native HTML5 drag/drop.

            const source = this.normalizeVfsPath(path);
            if (!this.isDesktopRootPath(source) || !this.vfs[source]) return;

            // Long-press to enter drag mode (keeps single tap usable)
            const startX = event.clientX;
            const startY = event.clientY;
            const iconEl = event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('desktop-icon')
                ? event.currentTarget
                : (event.target ? event.target.closest('.desktop-icon') : null);

            if (!iconEl) return;

            const state = {
                sourcePath: source,
                startX,
                startY,
                lastX: startX,
                lastY: startY,
                iconEl,
                ghost: null,
                dragging: false,
                timer: null,
                hoverPath: '',
                lastReorderKey: ''
            };

            const cleanup = () => {
                if (state.timer) clearTimeout(state.timer);
                try { window.removeEventListener('pointermove', onMove, { passive: false }); } catch (_) { window.removeEventListener('pointermove', onMove); }
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                if (state.ghost && state.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
                state.iconEl.classList.remove('dragging-touch');
                state.iconEl.style.opacity = '';
                const hl = document.querySelector('.desktop-icon.drop-target');
                if (hl) hl.classList.remove('drop-target');
                this._desktopTouchDrag = null;
            };

            const beginDrag = () => {
                state.dragging = true;
                this.ensureDesktopOrderUpToDate();
                state.iconEl.classList.add('dragging-touch');
                state.iconEl.style.opacity = '0.3';

                const rect = state.iconEl.getBoundingClientRect();
                const ghost = state.iconEl.cloneNode(true);
                ghost.classList.add('desktop-icon-ghost');
                ghost.style.position = 'fixed';
                ghost.style.left = rect.left + 'px';
                ghost.style.top = rect.top + 'px';
                ghost.style.width = rect.width + 'px';
                ghost.style.height = rect.height + 'px';
                ghost.style.zIndex = '99999';
                ghost.style.pointerEvents = 'none';
                ghost.style.opacity = '0.95';
                ghost.style.transform = 'scale(1.03)';
                document.body.appendChild(ghost);
                state.ghost = ghost;
            };

            const reorderNear = (targetPath, after = false) => {
                const src = state.sourcePath;
                const tgt = this.normalizeVfsPath(targetPath);
                if (!this.isDesktopRootPath(src) || !this.isDesktopRootPath(tgt) || src === tgt) return;
                const roots = this.getDesktopRootPaths();
                const order = this.normalizeDesktopIconOrder(this.desktopIconOrder, roots)
                    .filter(p => this.normalizeVfsPath(p) !== src);
                const idx = order.indexOf(tgt);
                const insertAt = Math.min(order.length, Math.max(0, (idx >= 0 ? idx : order.length) + (after ? 1 : 0)));
                order.splice(insertAt, 0, src);
                this.desktopIconOrder = order;
                this.saveUserData();
                this.renderDesktop();
            };

            const detectDropTarget = (x, y) => {
                const el = document.elementFromPoint(x, y);
                const icon = el ? el.closest('.desktop-icon') : null;
                if (!icon) return '';
                const p = String(icon.getAttribute('data-path') || '');
                return p ? this.normalizeVfsPath(p) : '';
            };

            const onMove = (ev) => {
                state.lastX = ev.clientX;
                state.lastY = ev.clientY;

                const dx = ev.clientX - state.startX;
                const dy = ev.clientY - state.startY;
                const moved = (dx * dx + dy * dy) > 36;
                if (!state.dragging) {
                    if (moved) {
                        // Cancel tap if user is moving before long-press; keep waiting for drag activation.
                        try { ev.preventDefault(); } catch (_) { }
                    }
                    return;
                }

                try { ev.preventDefault(); } catch (_) { }

                if (state.ghost) {
                    state.ghost.style.left = (ev.clientX - 50) + 'px';
                    state.ghost.style.top = (ev.clientY - 55) + 'px';
                }

                const hovered = detectDropTarget(ev.clientX, ev.clientY);
                if (hovered && hovered !== state.sourcePath) {
                    const node = this.vfs[hovered];
                    document.querySelectorAll('.desktop-icon.drop-target').forEach(n => n.classList.remove('drop-target'));
                    const hoverEl = (() => {
                        try {
                            const esc = (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') ? CSS.escape(hovered) : hovered.replace(/\"/g, '\\\"');
                            return document.querySelector(`.desktop-icon[data-path="${esc}"]`);
                        } catch (_) { return null; }
                    })();
                    if (hoverEl) hoverEl.classList.add('drop-target');

                    if (node && node.type === 'folder') {
                        state.hoverPath = hovered;
                        state.lastReorderKey = '';
                        return;
                    }

                    state.hoverPath = '';
                    const rect = (hoverEl && hoverEl.getBoundingClientRect) ? hoverEl.getBoundingClientRect() : null;
                    const after = rect ? (ev.clientX > rect.left + rect.width / 2) : false;
                    const key = `${hovered}|${after ? '1' : '0'}`;
                    if (key !== state.lastReorderKey) {
                        state.lastReorderKey = key;
                        reorderNear(hovered, after);
                    }
                } else {
                    state.hoverPath = '';
                    state.lastReorderKey = '';
                    document.querySelectorAll('.desktop-icon.drop-target').forEach(n => n.classList.remove('drop-target'));
                }
            };

            const onUp = (ev) => {
                if (state.timer) clearTimeout(state.timer);
                if (state.dragging) {
                    // Drop into folder if hovered
                    const target = state.hoverPath;
                    if (target && this.vfs[target] && this.vfs[target].type === 'folder') {
                        const name = state.sourcePath.split('/').pop();
                        const destName = this.ensureUniqueNameInFolder(target, name);
                        const dest = `${target}/${destName}`;
                        this.desktopIconOrder = (Array.isArray(this.desktopIconOrder) ? this.desktopIconOrder : [])
                            .filter(p => this.normalizeVfsPath(p) !== state.sourcePath);
                        this.vfs_move(state.sourcePath, dest);
                    }
                }
                cleanup();
            };

            state.timer = setTimeout(() => {
                beginDrag();
            }, 220);

            this._desktopTouchDrag = state;

            try { window.addEventListener('pointermove', onMove, { passive: false }); } catch (_) { window.addEventListener('pointermove', onMove); }
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        } catch (_) { }
    }

    renderDesktop() {
        const grid = document.getElementById('desktop-icons');
        if (!grid) return;

        const desktopFiles = this.getDesktopRootPaths();
        this.ensureDesktopOrderUpToDate();
        const ordered = this.normalizeDesktopIconOrder(this.desktopIconOrder, desktopFiles);

        const html = ordered.map(path => {
            const item = this.vfs[path];
            if (!item) return '';
            const name = path.split('/').pop();

            let label = name;
            let iconMarkup = item.type === 'folder' ? '📁' : this.getFileIcon(name);
            let extraClass = '';

            if (item.type === 'shortcut') {
                extraClass = ' is-shortcut';
                const payload = (item.content && typeof item.content === 'object') ? item.content : {};
                const targetType = String(payload.targetType || '').trim();
                const targetId = String(payload.targetId || '').trim();
                if (targetType === 'app' && targetId) {
                    const entry = this.resolveAppCatalogEntry(targetId);
                    if (entry) {
                        label = entry.title || label;
                        iconMarkup = this.renderAppIconMarkup(entry.icon, '📦');
                    } else {
                        label = targetId;
                        iconMarkup = '📦';
                    }
                } else {
                    label = name;
                    iconMarkup = '🔗';
                }
            } else if (item.type === 'folder') {
                label = name;
                iconMarkup = '📁';
            }

            return `
                <div class="desktop-icon${extraClass}" 
                     data-path="${this.escapeHtmlAttr(path)}" 
                     draggable="true" 
                     onpointerdown="windowManager.desktopPointerDown(event, ${JSON.stringify(path)})"
                     onclick="windowManager.handleDesktopIconClick(event, ${JSON.stringify(path)})"
                     ondblclick="windowManager.activateDesktopItem(${JSON.stringify(path)})"
                     ondragstart="windowManager.handleIconDragStart(event, ${JSON.stringify(path)})"
                     ondragover="event.preventDefault()"
                     ondrop="windowManager.handleDesktopDrop(event)">
                    <div class="icon-img">${iconMarkup}</div>
                    <div class="icon-label">${label}</div>
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

    ensureDesktopFolderOverlay() {
        const existing = document.getElementById('desktop-folder-overlay');
        if (existing) return existing;

        const desktop = document.getElementById('desktop');
        if (!desktop) return null;

        const overlay = document.createElement('div');
        overlay.id = 'desktop-folder-overlay';
        overlay.className = 'desktop-folder-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="desktop-folder-card glass" role="dialog" aria-modal="true">
                <div class="desktop-folder-head">
                    <button type="button" class="desktop-folder-btn" id="desktop-folder-back" aria-label="Retour" style="display:none;">←</button>
                    <div class="desktop-folder-title" id="desktop-folder-title">Dossier</div>
                    <div class="desktop-folder-actions">
                        <button type="button" class="desktop-folder-btn" id="desktop-folder-open-explorer" aria-label="Ouvrir dans l'explorateur">📁</button>
                        <button type="button" class="desktop-folder-btn" id="desktop-folder-close" aria-label="Fermer">×</button>
                    </div>
                </div>
                <div class="desktop-folder-grid" id="desktop-folder-grid"></div>
            </div>
        `;

        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) this.closeDesktopFolderQuick();
        });

        desktop.appendChild(overlay);

        const closeBtn = document.getElementById('desktop-folder-close');
        if (closeBtn) closeBtn.onclick = () => this.closeDesktopFolderQuick();

        const backBtn = document.getElementById('desktop-folder-back');
        if (backBtn) backBtn.onclick = () => {
            if (!Array.isArray(this.desktopFolderNavStack)) this.desktopFolderNavStack = [];
            if (this.desktopFolderNavStack.length > 1) {
                this.desktopFolderNavStack.pop();
                this.renderDesktopFolderQuick();
            }
        };

        const explorerBtn = document.getElementById('desktop-folder-open-explorer');
        if (explorerBtn) explorerBtn.onclick = () => openApp('explorer');

        return overlay;
    }

    openDesktopFolderQuick(folderPath, opts = {}) {
        const normalized = this.normalizeVfsPath(folderPath);
        const item = this.vfs[normalized];
        if (!item || item.type !== 'folder') return;

        const overlay = this.ensureDesktopFolderOverlay();
        if (!overlay) return;

        const reset = !!opts.reset;
        const push = opts.push !== false;

        if (!Array.isArray(this.desktopFolderNavStack)) this.desktopFolderNavStack = [];
        if (reset) this.desktopFolderNavStack = [normalized];
        else if (push) {
            const last = this.desktopFolderNavStack[this.desktopFolderNavStack.length - 1];
            if (last !== normalized) this.desktopFolderNavStack.push(normalized);
        }

        overlay.style.display = 'flex';
        this.renderDesktopFolderQuick();
    }

    closeDesktopFolderQuick() {
        const overlay = document.getElementById('desktop-folder-overlay');
        if (overlay) overlay.style.display = 'none';
        this.desktopFolderNavStack = [];
    }

    handleDesktopFolderItemClick(path) {
        const normalized = this.normalizeVfsPath(path);
        const item = this.vfs[normalized];
        if (!item) return;
        if (item.type === 'folder') {
            this.openDesktopFolderQuick(normalized, { push: true });
            return;
        }
        this.activateDesktopItem(normalized);
    }

    renderDesktopFolderQuick() {
        const overlay = document.getElementById('desktop-folder-overlay');
        if (!overlay || overlay.style.display === 'none') return;
        if (!Array.isArray(this.desktopFolderNavStack) || this.desktopFolderNavStack.length === 0) return;

        const folderPath = this.desktopFolderNavStack[this.desktopFolderNavStack.length - 1];
        const folder = this.vfs[folderPath];
        if (!folder || folder.type !== 'folder') return;

        const titleEl = document.getElementById('desktop-folder-title');
        if (titleEl) titleEl.textContent = folderPath.split('/').pop() || 'Dossier';

        const backBtn = document.getElementById('desktop-folder-back');
        if (backBtn) backBtn.style.display = this.desktopFolderNavStack.length > 1 ? 'inline-flex' : 'none';

        const grid = document.getElementById('desktop-folder-grid');
        if (!grid) return;

        const depth = folderPath.split('/').length;
        const children = Object.keys(this.vfs || {})
            .filter(p => p.startsWith(folderPath + '/') && p.split('/').length === depth + 1)
            .sort((a, b) => a.localeCompare(b));

        grid.innerHTML = children.map(p => {
            const item = this.vfs[p];
            if (!item) return '';
            const name = p.split('/').pop();

            let label = name;
            let iconMarkup = item.type === 'folder' ? '📁' : this.getFileIcon(name);
            let extraClass = '';

            if (item.type === 'shortcut') {
                extraClass = ' is-shortcut';
                const payload = (item.content && typeof item.content === 'object') ? item.content : {};
                const targetType = String(payload.targetType || '').trim();
                const targetId = String(payload.targetId || '').trim();
                if (targetType === 'app' && targetId) {
                    const entry = this.resolveAppCatalogEntry(targetId);
                    if (entry) {
                        label = entry.title || label;
                        iconMarkup = this.renderAppIconMarkup(entry.icon, '📦');
                    } else {
                        label = targetId;
                        iconMarkup = '📦';
                    }
                } else {
                    iconMarkup = '🔗';
                }
            } else if (item.type === 'folder') {
                iconMarkup = '📁';
            }

            return `
                <div class="desktop-folder-item${extraClass}" data-path="${this.escapeHtmlAttr(p)}" onclick="windowManager.handleDesktopFolderItemClick(${JSON.stringify(p)})">
                    <div class="desktop-folder-icon">${iconMarkup}</div>
                    <div class="desktop-folder-label">${label}</div>
                </div>
            `;
        }).join('') || `<div class="desktop-folder-empty">Vide</div>`;
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
        if (item.type === 'shortcut') {
            // Allow opening shortcuts from anywhere (desktop, folder panel, etc.)
            this.activateDesktopItem(path);
            return;
        }
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
            const source = this.normalizeVfsPath(sourcePath);
            if (!this.vfs[source]) return;

            const targetIcon = e.target.closest('.desktop-icon');
            const targetAttr = targetIcon ? String(targetIcon.getAttribute('data-path') || '') : '';
            const targetPath = targetAttr ? this.normalizeVfsPath(targetAttr) : '';

            const findNearestDesktopIcon = () => {
                try {
                    const icons = Array.from(document.querySelectorAll('#desktop-icons .desktop-icon'));
                    if (!icons.length) return null;
                    let best = { el: null, dist: Infinity };
                    icons.forEach((el) => {
                        const rect = el.getBoundingClientRect();
                        const cx = rect.left + rect.width / 2;
                        const cy = rect.top + rect.height / 2;
                        const dx = e.clientX - cx;
                        const dy = e.clientY - cy;
                        const d = dx * dx + dy * dy;
                        if (d < best.dist) best = { el, dist: d };
                    });
                    if (!best.el) return null;
                    return {
                        el: best.el,
                        path: String(best.el.getAttribute('data-path') || ''),
                        rect: best.el.getBoundingClientRect()
                    };
                } catch (_) {
                    return null;
                }
            };

            // Drop onto a folder => move into it
            if (targetPath && targetPath !== source) {
                const targetItem = this.vfs[targetPath];
                if (targetItem && targetItem.type === 'folder') {
                    const parent = source.substring(0, source.lastIndexOf('/')) || '/';
                    if (parent === targetPath) return;

                    const name = source.split('/').pop();
                    const destName = this.ensureUniqueNameInFolder(targetPath, name);
                    const dest = `${targetPath}/${destName}`;

                    if (this.isDesktopRootPath(source)) {
                        this.desktopIconOrder = (Array.isArray(this.desktopIconOrder) ? this.desktopIconOrder : [])
                            .filter(p => this.normalizeVfsPath(p) !== source);
                    }

                    this.vfs_move(source, dest);
                    return;
                }

                // Reorder within the desktop grid (root only)
                if (this.isDesktopRootPath(source) && this.isDesktopRootPath(targetPath)) {
                    this.ensureDesktopOrderUpToDate();
                    const roots = this.getDesktopRootPaths();
                    const order = this.normalizeDesktopIconOrder(this.desktopIconOrder, roots)
                        .filter(p => this.normalizeVfsPath(p) !== source);
                    const idx = order.indexOf(targetPath);
                    order.splice(idx >= 0 ? idx : order.length, 0, source);
                    this.desktopIconOrder = order;
                    this.saveUserData();
                    this.renderDesktop();
                    return;
                }
            }

            // Dropped on empty desktop area => try nearest icon, else send to end (root only)
            if (this.isDesktopRootPath(source)) {
                const nearestInfo = findNearestDesktopIcon();
                const nearest = (nearestInfo && nearestInfo.path) ? this.normalizeVfsPath(nearestInfo.path) : '';
                if (nearest && nearest !== source && this.isDesktopRootPath(nearest)) {
                    this.ensureDesktopOrderUpToDate();
                    const roots = this.getDesktopRootPaths();
                    const order = this.normalizeDesktopIconOrder(this.desktopIconOrder, roots)
                        .filter(p => this.normalizeVfsPath(p) !== source);
                    const idx = order.indexOf(nearest);
                    let insertAt = idx >= 0 ? idx : order.length;
                    if (nearestInfo && nearestInfo.rect) {
                        const rect = nearestInfo.rect;
                        const after = e.clientX > (rect.left + rect.width / 2) || e.clientY > (rect.top + rect.height / 2);
                        if (after) insertAt += 1;
                    }
                    order.splice(Math.min(order.length, Math.max(0, insertAt)), 0, source);
                    this.desktopIconOrder = order;
                    this.saveUserData();
                    this.renderDesktop();
                    return;
                }
                this.ensureDesktopOrderUpToDate();
                const roots = this.getDesktopRootPaths();
                const order = this.normalizeDesktopIconOrder(this.desktopIconOrder, roots)
                    .filter(p => this.normalizeVfsPath(p) !== source);
                order.push(source);
                this.desktopIconOrder = order;
                this.saveUserData();
                this.renderDesktop();
            }
            return;
        }

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            for (const file of files) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target.result;
                    const isText = /\.(txt|html|md|js|css|json)$/i.test(file.name) && !file.name.endsWith('.apk');
                    const safeName = this.ensureUniqueNameInFolder('/Bureau', file.name);
                    const path = '/Bureau/' + safeName;
                    if (!Array.isArray(this.desktopIconOrder)) this.desktopIconOrder = [];
                    this.desktopIconOrder = [...this.desktopIconOrder.filter(p => this.normalizeVfsPath(p) !== path), path];
                    this.vfs_write(path, content, isText ? 'file' : 'binary');
                };
                if (/\.(txt|html|md|js|css|json)$/i.test(file.name) && !file.name.endsWith('.apk')) reader.readAsText(file);
                else reader.readAsDataURL(file);
            }
        }
    }

    uninstallApp(id, winId = null) {
        if (!id) return;
        // Remove from installed/pinned state
        if (!Array.isArray(this.installedApps)) this.installedApps = [];
        if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];
        this.installedApps = this.installedApps.filter(appId => appId !== id);
        this.pinnedApps = this.pinnedApps.filter(appId => appId !== id);
        this.saveUserData();

        // Update UI (only remove user-pinned dock items, never the fixed system ones)
        const pinnedContainer = document.getElementById('installed-apps');
        const dockItem = document.getElementById(`dock-item-${id}`);
        if (dockItem && pinnedContainer && pinnedContainer.contains(dockItem)) dockItem.remove();

        // Some legacy ID check
        const icon = document.getElementById(`icon-${id}`);
        if (icon) {
            const dockItemFallback = icon.closest('.dock-item');
            if (dockItemFallback && pinnedContainer && pinnedContainer.contains(dockItemFallback)) dockItemFallback.remove();
        }

        const instAppsCont = document.getElementById(`inst-app-${id}`);
        if (instAppsCont) instAppsCont.remove();
        this.applyUIPreferences();

        // Close window if open
        this.closeWindow(id);

        this.notify("Désinstallation", `${id} a été supprimé du système.`, 'install');
        this.syncAllIframes(); // To update the Store view
        if (document.getElementById('launchpad-grid')) this.renderLaunchpad();

        if (winId) {
            this.openProductPage(winId, id); // Refresh page to show OBTENIR
        }
    }

    closeLaunchpad(immediate = false) {
        const lp = document.getElementById('launchpad');
        if (!lp) return;

        if (this.launchpadOpenTimer) {
            clearTimeout(this.launchpadOpenTimer);
            this.launchpadOpenTimer = null;
        }

        const wasActive = lp.classList.contains('active');
        lp.classList.remove('active');

        if (immediate || !wasActive) {
            lp.style.display = 'none';
            return;
        }

        setTimeout(() => { if (!lp.classList.contains('active')) lp.style.display = 'none'; }, 300);
    }

    toggleLaunchpad() {
        const lp = document.getElementById('launchpad');
        if (!lp) return;
        const input = document.querySelector('#launchpad .launchpad-search input');
        const isVisible = lp.classList.contains('active') || lp.style.display === 'flex';
        if (!isVisible) {
            if (input) input.value = '';
            this.renderLaunchpad();
            lp.style.display = 'flex';
            if (this.launchpadOpenTimer) clearTimeout(this.launchpadOpenTimer);
            this.launchpadOpenTimer = setTimeout(() => {
                this.launchpadOpenTimer = null;
                lp.classList.add('active');
            }, 10);
            return;
        }

        this.closeLaunchpad();
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
            <div class="launchpad-item" data-id="${this.escapeHtmlAttr(app.id)}" data-title="${this.escapeHtmlAttr(app.title)}" onclick="windowManager.installApp(this.dataset.id); windowManager.closeLaunchpad();">
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
            this.closeLaunchpad();
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
                <div class="launchpad-item" data-id="${this.escapeHtmlAttr(app.id)}" data-title="${this.escapeHtmlAttr(app.title)}" onclick="windowManager.installApp(this.dataset.id); windowManager.closeLaunchpad();">
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
        this.installedApps = ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"];
        this.pinnedApps = ["word", "notepad", "excel", "powerpoint", "store", "wiki"];
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
                this.launchShell();
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
                return this.showSetupError("Supabase non configure. Choisis « Compte local » ou configure soit une URL distante (AETHER_SUPABASE_CONFIG_URL via Worker Cloudflare), soit .env/env.js (AETHER_SUPABASE_URL, AETHER_SUPABASE_ANON_KEY, AETHER_SUPABASE_TABLE).");
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
                    this.installedApps = ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"];
                    this.pinnedApps = ["word", "notepad", "excel", "powerpoint", "store", "wiki"];
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
                    this.installedApps = ["word", "notepad", "excel", "powerpoint", "store", "explorer", "wiki"];
                    this.pinnedApps = ["word", "notepad", "excel", "powerpoint", "store", "wiki"];
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
                this.launchShell();
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

                 // Cleanup ephemeral web wrapper entries
                 if (this.webWrapApps && Object.prototype.hasOwnProperty.call(this.webWrapApps, id)) {
                     delete this.webWrapApps[id];
                     this.saveUserData();
                 }
 
                 this.persistSessionWindows();
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

    getFocusedWindowId() {
        const el = document.querySelector('.window.focused');
        if (!el) return '';
        const raw = String(el.id || '');
        return raw.startsWith('window-') ? raw.slice('window-'.length) : '';
    }

    closeFocusedWindow() {
        const id = this.getFocusedWindowId();
        if (id) this.closeWindow(id);
    }

    cycleWindows(direction = 1) {
        const nodes = Array.from(document.querySelectorAll('.window'));
        if (!nodes.length) return;
        const sorted = nodes
            .map((el) => ({ el, z: Number(el.style.zIndex) || 0 }))
            .sort((a, b) => a.z - b.z);
        const focusedId = this.getFocusedWindowId();
        let idx = sorted.findIndex(x => x.el.id === `window-${focusedId}`);
        if (idx === -1) idx = sorted.length - 1;
        const next = (idx + (direction >= 0 ? 1 : -1) + sorted.length) % sorted.length;
        const nextEl = sorted[next] && sorted[next].el;
        if (!nextEl) return;
        const id = String(nextEl.id || '').replace(/^window-/, '');
        if (id) {
            this.restoreWindow(id);
            this.focusWindow(id);
        }
    }

    async captureScreenshot() {
        try {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
                this.notify && this.notify('Capture', "Capture d'écran non supportée par ce navigateur.", 'system');
                return;
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'window' }, audio: false });
            const track = stream.getVideoTracks()[0];
            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();

            const w = video.videoWidth || 1280;
            const h = video.videoHeight || 720;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);

            // Cleanup
            try { track.stop(); } catch (err) { }
            try { stream.getTracks().forEach(t => t.stop()); } catch (err) { }

            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Impossible de générer l’image');
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `aether-screenshot-${ts}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 8000);
            if (this.notify) this.notify('Capture', 'Capture enregistrée.', 'system');
        } catch (err) {
            try { if (this.notify) this.notify('Capture', 'Capture annulée ou bloquée.', 'system'); } catch (e) { }
        }
    }

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
            { type: 'music', name: 'Musique', icon: '🎵' },
            { type: 'todo', name: 'Agenda / To‑Do', icon: '✅' },
            { type: 'news', name: 'Actualités (RSS)', icon: '📰' },
            { type: 'quote', name: 'Citation', icon: '✨' },
            { type: 'quicklaunch', name: 'Quick Launch', icon: '🚀' },
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
        const newWidget = { id: 'w_' + Date.now(), type: type, x: 200, y: 200, content: '', data: {} };
        if (type === 'todo') newWidget.data = { items: [], events: [] };
        if (type === 'news') newWidget.data = { feeds: [], items: [], lastError: '' };
        if (type === 'quicklaunch') newWidget.data = { appIds: Array.from(new Set((Array.isArray(this.pinnedApps) ? this.pinnedApps : []).filter(Boolean))).slice(0, 10) };
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

    pinApp(id, forcedTitle = null, isRestoring = false) {
        if (!id) return;

        const dock = document.getElementById('installed-apps');
        if (!dock) return;

        // If the dock item already exists (either fixed system icon or already pinned), don't duplicate.
        const existing = document.getElementById(`dock-item-${id}`);
        if (existing) {
            if (!dock.contains(existing)) return;
            try {
                const entry = this.resolveAppCatalogEntry(id);
                if (entry) {
                    existing.title = forcedTitle || entry.title || existing.title || id;
                    const iconEl = document.getElementById(`icon-${id}`);
                    if (iconEl && entry.icon) iconEl.innerHTML = this.renderAppIconMarkup(entry.icon, '📦');
                }
            } catch (e) { }
            if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];
            if (!this.pinnedApps.includes(id)) this.pinnedApps.push(id);
            if (!Array.isArray(this.installedApps)) this.installedApps = [];
            if (!this.installedApps.includes(id)) this.installedApps.push(id);
            if (!isRestoring) this.saveUserData();
            return;
        }

        const appData = this.appsRegistry.find(a => a.id === id);
        const entry = this.resolveAppCatalogEntry(id);
        const title = forcedTitle || (entry ? entry.title : (appData ? appData.title : (gameTitles[id] || id)));

        const item = document.createElement('div');
        item.className = 'dock-item';
        item.id = `dock-item-${id}`;
        item.title = title;
        item.setAttribute('data-id', id);
        item.onclick = () => this.installApp(id);
        const iconContent = (appData && appData.icon) || (entry && entry.icon)
            ? this.renderAppIconMarkup((appData && appData.icon) ? appData.icon : entry.icon, '📦')
            : (appIcons[id] || `<svg viewBox="0 0 100 100">${this.getGameIcon(id)}</svg>`);
        item.innerHTML = `<div class="dock-icon" id="icon-${id}">${iconContent}</div>`;

        dock.appendChild(item);
        this.applyUIPreferences();

        if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];
        if (!this.pinnedApps.includes(id)) this.pinnedApps.push(id);

        // Pinned implies installed (for launchpad, store, etc.)
        if (!Array.isArray(this.installedApps)) this.installedApps = [];
        if (!this.installedApps.includes(id)) this.installedApps.push(id);

        if (!isRestoring) {
            this.saveUserData();
            this.notify('Dock', `${title} épinglée.`, 'dock');
            if (document.getElementById('launchpad-grid')) this.renderLaunchpad();
            this.syncAllIframes();
        }
    }

    unpinApp(id) {
        if (!id) return;

        if (!Array.isArray(this.pinnedApps)) this.pinnedApps = [];
        this.pinnedApps = this.pinnedApps.filter(appId => appId !== id);

        const dock = document.getElementById('installed-apps');
        const dockItemById = document.getElementById(`dock-item-${id}`);
        if (dockItemById && dock && dock.contains(dockItemById)) dockItemById.remove();

        // Legacy safety: remove via icon id, but only inside the user-pinned container.
        const icon = document.getElementById(`icon-${id}`);
        if (icon) {
            const dockItemFallback = icon.closest('.dock-item');
            if (dockItemFallback && dock && dock.contains(dockItemFallback)) dockItemFallback.remove();
        }

        this.saveUserData();
        this.applyUIPreferences();
        this.notify('Dock', `Application désépinglée.`, 'dock');
        if (document.getElementById('launchpad-grid')) this.renderLaunchpad();
        this.syncAllIframes();
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
        if (!id) return;

        if (isRestoring) {
            this.pinApp(id, forcedTitle, true);
            return;
        }

        const appData = this.appsRegistry.find(a => a.id === id);
        const entry = this.resolveAppCatalogEntry(id);
        const title = forcedTitle || (entry ? entry.title : (appData ? appData.title : (gameTitles[id] || id)));

        if (document.getElementById(`window-${id}`)) {
            this.focusWindow(id);
            return;
        }

        if (!Array.isArray(this.installedApps)) this.installedApps = [];
        const isInstalled = this.installedApps.includes(id);

        const openWindow = () => {
            const sys = ['store', 'webos', 'music', 'notes', 'settings', 'terminal', 'files', 'sysinfo', 'calc', 'weather', 'docs', 'word', 'sheets', 'excel', 'slides', 'powerpoint', 'mail', 'outlook', 'activity', 'coder', 'designer', 'android', 'maps', 'camera'];
            this.createWindow(id, title, sys.includes(id) || (appData && appData.category === 'productivity') || (entry && entry.category === 'productivity') || id.startsWith('dev_app_'));
        };

        if (isInstalled) {
            openWindow();
            return;
        }

        this.notify("Installation", `Installation de ${title}...`, 'install');

        setTimeout(() => {
            if (!Array.isArray(this.installedApps)) this.installedApps = [];
            if (!this.installedApps.includes(id)) this.installedApps.push(id);
            this.installedApps = [...new Set(this.installedApps.filter(Boolean))];
            this.saveUserData();
            this.notify("Succès", `${title} est installé !`, 'install');
            if (document.getElementById('launchpad-grid')) this.renderLaunchpad();
            this.syncAllIframes();
            openWindow();
        }, 800);
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
    notepad: 'Bloc-notes',
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
    notepad: '🗒️',
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
    if (windowManager && typeof windowManager.isPhoneShellActive === 'function' && windowManager.isPhoneShellActive()) {
        try { windowManager.openPhoneApp(id); } catch (err) { }
        return;
    }
    const titleFromRegistry = Array.isArray(windowManager.appsRegistry)
        ? (windowManager.appsRegistry.find(app => app && app.id === id) || {}).title
        : '';
    const title = gameTitles[id] || titleFromRegistry || id;
    windowManager.createWindow(id, title, true);
    windowManager.closeLaunchpad();
}
function updateClock() {
    const el = document.getElementById('clock');
    const phoneEl = document.getElementById('phone-time');
    if (!el && !phoneEl) return;
    const showSeconds = !!(windowManager.uiPreferences && windowManager.uiPreferences.clockSeconds);
    const options = {
        timeZone: windowManager.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        ...(showSeconds ? { second: '2-digit' } : {}),
        hour12: windowManager.timeFormat === '12h'
    };
    const locale = windowManager.locale || 'fr-FR';
    const now = new Date().toLocaleTimeString(locale, options);
    if (el) el.textContent = now;
    if (phoneEl) phoneEl.textContent = now;
}

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000); // Update every second for better responsiveness
});

document.addEventListener('click', (e) => {
    const lp = document.getElementById('launchpad');
    const startBtn = document.querySelector('.dock-item[title="AetherNode"]');
    if (lp && (lp.classList.contains('active') || lp.style.display === 'flex') && !lp.contains(e.target) && (!startBtn || !startBtn.contains(e.target))) {
        windowManager.closeLaunchpad();
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

    // Spotlight (Settings app shows ⌘ + Space)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.code === 'Space' || e.key === ' ')) {
        if (!windowManager.isEditableTarget(e.target)) {
            e.preventDefault();
            windowManager.toggleSearch();
        }
        return;
    }

    // Screenshot (⌘ + Shift + 3)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === '3' || e.code === 'Digit3')) {
        e.preventDefault();
        windowManager.captureScreenshot();
        return;
    }

    // Close focused window (⌘ + W)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        windowManager.closeFocusedWindow();
        return;
    }

    // New window (⌘ + N) -> open browser for now
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openApp('browser');
        return;
    }

    // Settings (⌘ + ,)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        openApp('settings');
        return;
    }

    // Switch app (⌘ + Tab)
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === 'Tab') {
        e.preventDefault();
        windowManager.cycleWindows(e.shiftKey ? -1 : 1);
        return;
    }

    // App shortcuts (match the Settings list)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && !windowManager.isEditableTarget(e.target)) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); openApp('browser'); return; }
        if (k === 'e') { e.preventDefault(); openApp('files'); return; }
        if (k === 't') { e.preventDefault(); openApp('ide'); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && !windowManager.isEditableTarget(e.target) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        openApp('terminal');
        return;
    }

    // Quit app (⌘ + Q)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        windowManager.closeFocusedWindow();
        return;
    }

    // Show desktop (⌘ + M)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        windowManager.windows.forEach((w, id) => windowManager.minimizeWindow(id));
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
        openApp('activity');
        return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openApp('calc');
    }

    if (e.key === 'Escape') {
        const lp = document.getElementById('launchpad');
        const spotlight = document.getElementById('spotlight-search');
        const controlCenter = document.querySelector('.control-center');
        const whatsNew = document.getElementById('whats-new-modal');
        if (lp && (lp.classList.contains('active') || lp.style.display === 'flex')) windowManager.closeLaunchpad();
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
        const item = windowManager && windowManager.vfs ? windowManager.vfs[windowManager.normalizeVfsPath(path)] : null;
        const isFolder = !!(item && item.type === 'folder');
        const isShortcut = !!(item && item.type === 'shortcut');
        showContextMenu(x, y, [
            { header: name },
            { icon: '🚀', label: 'Ouvrir', action: () => windowManager.activateDesktopItem(path) },
            ...(isFolder ? [{ icon: '📁', label: 'Ouvrir dans l\'explorateur', action: () => windowManager.openFile(path) }] : []),
            '---',
            { icon: '✏️', label: 'Renommer', action: () => { const n = prompt('Nouveau nom :', name); if (n) windowManager.renameDesktopItem(path, n); } },
            { icon: '📋', label: 'Copier', action: () => windowManager.notify('Système', 'Option de copie activée.') },
            ...(isImage ? [{
                icon: '🖼️', label: 'Fond d\'écran', action: () => {
                    const node = windowManager.vfs[windowManager.normalizeVfsPath(path)];
                    if (node && node.content) windowManager.setWallpaper(node.content);
                }
            }] : []),
            '---',
            { icon: '🗑️', label: 'Supprimer', danger: true, action: () => { if (confirm(`Déplacer ${name} à la corbeille ?`)) windowManager.vfs_delete(path); } }
        ]);
        return;
    }

    // A.5 Launchpad / Start Menu item
    const launchpadItem = e.target.closest('.launchpad-item');
    if (launchpadItem) {
        const id = launchpadItem.getAttribute('data-id') || '';
        const title = launchpadItem.getAttribute('data-title') || id || 'App';
        if (!id) return;

        const pinnedContainer = document.getElementById('installed-apps');
        const dockItem = document.getElementById(`dock-item-${id}`);
        const isPinned = !!(dockItem && pinnedContainer && pinnedContainer.contains(dockItem));

        showContextMenu(x, y, [
            { header: title },
            {
                icon: '🚀',
                label: 'Ouvrir',
                action: () => {
                    windowManager.installApp(id);
                    windowManager.closeLaunchpad();
                }
            },
            '---',
            {
                icon: '📌',
                label: isPinned ? 'Désépingler' : 'Épingler',
                action: () => (isPinned ? windowManager.unpinApp(id) : windowManager.pinApp(id))
            },
            {
                icon: '🖥️',
                label: 'Créer un raccourci sur le bureau',
                action: () => windowManager.createDesktopShortcutForApp(id)
            }
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
                items.push({ icon: '🖥️', label: 'Créer un raccourci sur le bureau', action: () => windowManager.createDesktopShortcutForApp(id) });
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

        const pinnedContainer = document.getElementById('installed-apps');
        const dockItem = document.getElementById(`dock-item-${id}`);
        const isPinned = !!(dockItem && pinnedContainer && pinnedContainer.contains(dockItem));
        const isFixedDockIcon = !!(dockItem && pinnedContainer && !pinnedContainer.contains(dockItem));

        const items = [
            { header: title },
            { icon: '🔽', label: 'Réduire', action: () => windowManager.minimizeWindow(id) }
        ];

        if (id && !isFixedDockIcon) {
            items.push({
                icon: '📌',
                label: isPinned ? 'Désépingler' : 'Épingler',
                action: () => (isPinned ? windowManager.unpinApp(id) : windowManager.pinApp(id))
            });
            items.push({ icon: '🖥️', label: 'Créer un raccourci sur le bureau', action: () => windowManager.createDesktopShortcutForApp(id) });
        }

        items.push({ icon: '❌', label: 'Fermer', danger: true, action: () => windowManager.closeWindow(id) });
        showContextMenu(x, y, items);
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
