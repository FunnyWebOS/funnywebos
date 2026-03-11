/**
 * Settings Core Module
 * Provides core functionality for the settings system
 */

class SettingsCore {
    constructor() {
        this.currentCategory = 'apps';
        this.settings = this.loadSettings();
        this.wm = window.parent.windowManager;
        this.categories = {
            apps: {
                title: 'Apps',
                description: 'Manage your applications and default programs',
                icon: 'fas fa-grid-2'
            },
            personalization: {
                title: 'Personalization',
                description: 'Customize your desktop appearance and themes',
                icon: 'fas fa-palette'
            },
            security: {
                title: 'Security',
                description: 'Protect your system with Aether Security',
                icon: 'fas fa-shield-halved'
            },
            accounts: {
                title: 'Accounts',
                description: 'Manage your cloud accounts and services',
                icon: 'fas fa-user-circle'
            },
            accessibility: {
                title: 'Accessibility',
                description: 'Make your system easier to use',
                icon: 'fas fa-universal-access'
            },
            system: {
                title: 'System',
                description: 'Advanced system settings and preferences',
                icon: 'fas fa-desktop'
            }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadUserData();
        this.applyTheme();
    }

    setupEventListeners() {
        // Listen for theme changes
        window.addEventListener('message', (event) => {
            if (event.data.type === 'funnyweb_theme_change') {
                this.applyTheme();
            }
            if (event.data.type === 'funnyweb_user_sync') {
                this.loadUserData();
            }
        });
    }

    loadSettings() {
        const defaultSettings = {
            theme: 'light',
            accentColor: '#0078d4',
            language: 'en',
            startupApps: [],
            defaultApps: {
                browser: 'web-browser',
                imageViewer: 'image-viewer',
                videoPlayer: 'video-player',
                textEditor: 'text-editor'
            },
            security: {
                level: 'normal',
                verifiedApps: [],
                warnings: true
            },
            personalization: {
                wallpaper: 'default',
                customWallpaper: null,
                uiScale: 100,
                animations: true
            },
            accounts: {
                onedrive: { connected: false, email: '' },
                googledrive: { connected: false, email: '' }
            },
            accessibility: {
                highContrast: false,
                largeText: false,
                reducedMotion: false,
                screenReader: false
            }
        };

        const saved = localStorage.getItem('aether_settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    }

    saveSettings() {
        localStorage.setItem('aether_settings', JSON.stringify(this.settings));
        this.notifySettingsChanged();
    }

    notifySettingsChanged() {
        // Notify parent window of settings changes
        if (window.parent && window.parent.postMessage) {
            window.parent.postMessage({
                type: 'funnyweb_settings_changed',
                settings: this.settings
            }, '*');
        }
    }

    loadUserData() {
        if (this.wm) {
            const userName = this.wm.userName || 'User';
            const profilePic = this.wm.profilePic || 'https://www.gravatar.com/avatar/000?d=mp&f=y';
            
            const userNameElement = document.getElementById('current-user-name');
            const userAvatar = document.querySelector('.user-avatar');
            
            if (userNameElement) userNameElement.textContent = userName;
            if (userAvatar) userAvatar.src = profilePic;
        }
    }

    applyTheme() {
        const theme = this.settings.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        
        // Apply accent color
        if (this.settings.accentColor) {
            document.documentElement.style.setProperty('--primary', this.settings.accentColor);
        }
    }

    getCategoryInfo(category) {
        return this.categories[category] || this.categories.apps;
    }

    updateCategory(category) {
        this.currentCategory = category;
        const info = this.getCategoryInfo(category);
        
        // Update header
        document.getElementById('category-title').textContent = info.title;
        document.getElementById('category-description').textContent = info.description;
        
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`)?.classList.add('active');
    }

    createCard(title, description, content, icon = null) {
        const card = document.createElement('div');
        card.className = 'settings-card fade-in';
        
        const headerHtml = icon ? 
            `<i class="${icon}"></i>${title}` : 
            title;
        
        card.innerHTML = `
            <div class="settings-card-header">
                <div class="settings-card-title">${headerHtml}</div>
            </div>
            ${description ? `<div class="settings-card-description">${description}</div>` : ''}
            <div class="settings-card-content">
                ${content}
            </div>
        `;
        
        return card;
    }

    createFormGroup(label, description, input) {
        return `
            <div class="form-group">
                ${label ? `<label class="form-label">${label}</label>` : ''}
                ${description ? `<div class="form-description">${description}</div>` : ''}
                ${input}
            </div>
        `;
    }

    createToggle(id, checked = false, label = '') {
        return `
            <label class="toggle">
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            ${label ? `<span style="margin-left: 12px;">${label}</span>` : ''}
        `;
    }

    createSelect(id, options, selectedValue = '') {
        const optionsHtml = options.map(option => 
            `<option value="${option.value}" ${option.value === selectedValue ? 'selected' : ''}>${option.label}</option>`
        ).join('');
        
        return `<select id="${id}" class="form-select">${optionsHtml}</select>`;
    }

    createInput(id, type = 'text', value = '', placeholder = '') {
        return `<input type="${type}" id="${id}" class="form-input" value="${value}" placeholder="${placeholder}">`;
    }

    createButton(text, onClick, className = 'btn-primary', icon = null) {
        const iconHtml = icon ? `<i class="${icon}"></i>` : '';
        return `<button class="btn ${className}" onclick="${onClick}">${iconHtml}${text}</button>`;
    }

    showNotification(title, message, type = 'info') {
        if (this.wm && this.wm.notify) {
            this.wm.notify(title, message);
        } else {
            console.log(`${title}: ${message}`);
        }
    }

    // Security helpers
    generateAppId() {
        return `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    verifyApp(appId) {
        if (!this.settings.security.verifiedApps.includes(appId)) {
            this.settings.security.verifiedApps.push(appId);
            this.saveSettings();
        }
    }

    isAppVerified(appId) {
        return this.settings.security.verifiedApps.includes(appId);
    }

    // App management helpers
    getInstalledApps() {
        if (this.wm && this.wm.installedApps) {
            return this.wm.installedApps;
        }
        return [];
    }

    getAppInfo(appId) {
        if (this.wm && this.wm.appsRegistry) {
            return this.wm.appsRegistry.find(app => app.id === appId);
        }
        return null;
    }

    // Theme helpers
    setTheme(theme) {
        this.settings.theme = theme;
        this.saveSettings();
        this.applyTheme();
    }

    setAccentColor(color) {
        this.settings.accentColor = color;
        this.saveSettings();
        this.applyTheme();
    }

    // Accessibility helpers
    applyAccessibilitySettings() {
        const root = document.documentElement;
        
        if (this.settings.accessibility.highContrast) {
            root.classList.add('high-contrast');
        } else {
            root.classList.remove('high-contrast');
        }
        
        if (this.settings.accessibility.largeText) {
            root.style.fontSize = '16px';
        } else {
            root.style.fontSize = '14px';
        }
        
        if (this.settings.accessibility.reducedMotion) {
            root.style.setProperty('--transition-fast', '0s');
            root.style.setProperty('--transition-normal', '0s');
            root.style.setProperty('--transition-slow', '0s');
        }
    }
}

// Global instance
window.SettingsCore = new SettingsCore();
