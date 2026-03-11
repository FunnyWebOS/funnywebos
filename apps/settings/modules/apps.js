/**
 * Apps Management Module
 * Handles startup apps, default apps, and app management
 */

class AppsManager {
    constructor() {
        this.core = window.SettingsCore;
        this.installedApps = [];
        this.startupApps = this.core.settings.startupApps || [];
        this.defaultApps = this.core.settings.defaultApps || {};
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // Startup Apps Section
        const startupCard = this.createStartupAppsCard();
        content.appendChild(startupCard);

        // Default Apps Section
        const defaultAppsCard = this.createDefaultAppsCard();
        content.appendChild(defaultAppsCard);

        // App Management Section
        const managementCard = this.createAppManagementCard();
        content.appendChild(managementCard);

        // App Store Section
        const appStoreCard = this.createAppStoreCard();
        content.appendChild(appStoreCard);
    }

    createStartupAppsCard() {
        const startupAppsHtml = this.startupApps.map(appId => {
            const appInfo = this.core.getAppInfo(appId);
            const appName = appInfo?.title || appId;
            const isVerified = this.core.isAppVerified(appId);
            
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            ${appName}
                            ${isVerified ? '<i class="fas fa-check-circle" style="color: var(--success); margin-left: 8px;"></i>' : ''}
                        </div>
                        <div class="list-item-description">Launches on system startup</div>
                    </div>
                    <div class="list-item-actions">
                        ${this.core.createToggle(`startup-${appId}`, true, '')}
                        <button class="btn btn-sm btn-ghost" onclick="AppsManager.removeStartupApp('${appId}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const availableApps = this.getAvailableStartupApps();
        const addAppOptions = availableApps.map(app => 
            `<option value="${app.id}">${app.title}</option>`
        ).join('');

        const content = `
            <div class="mb-4">
                <h3>Startup Applications</h3>
                <p class="text-secondary">Choose which applications launch automatically when you start your system</p>
            </div>
            
            ${startupAppsHtml || '<div class="text-secondary mb-4">No startup apps configured</div>'}
            
            <div class="form-group">
                <label class="form-label">Add Startup App</label>
                <div class="flex gap-2">
                    <select id="add-startup-app" class="form-select" style="flex: 1;">
                        <option value="">Select an app...</option>
                        ${addAppOptions}
                    </select>
                    ${this.core.createButton('Add', 'AppsManager.addStartupApp()', 'btn-primary', 'fas fa-plus')}
                </div>
            </div>
        `;

        return this.core.createCard('Startup Apps', 'Configure applications that start with your system', content, 'fas fa-rocket');
    }

    createDefaultAppsCard() {
        const defaultAppTypes = [
            { key: 'browser', label: 'Web Browser', icon: 'fas fa-globe' },
            { key: 'imageViewer', label: 'Image Viewer', icon: 'fas fa-image' },
            { key: 'videoPlayer', label: 'Video Player', icon: 'fas fa-video' },
            { key: 'textEditor', label: 'Text Editor', icon: 'fas fa-file-text' }
        ];

        const defaultAppsHtml = defaultAppTypes.map(type => {
            const currentApp = this.defaultApps[type.key];
            const availableApps = this.getAvailableAppsForType(type.key);
            
            const options = availableApps.map(app => 
                `<option value="${app.id}" ${app.id === currentApp ? 'selected' : ''}>${app.title}</option>`
            ).join('');

            return `
                <div class="form-group">
                    <label class="form-label">
                        <i class="${type.icon}" style="margin-right: 8px;"></i>
                        ${type.label}
                    </label>
                    <select id="default-${type.key}" class="form-select" onchange="AppsManager.updateDefaultApp('${type.key}', this.value)">
                        <option value="">Choose default app...</option>
                        ${options}
                    </select>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Default Applications</h3>
                <p class="text-secondary">Set your preferred applications for different file types and activities</p>
            </div>
            
            ${defaultAppsHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Reset Defaults', 'AppsManager.resetDefaultApps()', 'btn-secondary', 'fas fa-undo')}
            </div>
        `;

        return this.core.createCard('Default Apps', 'Choose your default applications', content, 'fas fa-cog');
    }

    createAppManagementCard() {
        const installedApps = this.core.getInstalledApps();
        const appsHtml = installedApps.map(appId => {
            const appInfo = this.core.getAppInfo(appId);
            const appName = appInfo?.title || appId;
            const isVerified = this.core.isAppVerified(appId);
            const isStartup = this.startupApps.includes(appId);
            
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            ${appName}
                            ${isVerified ? '<i class="fas fa-check-circle" style="color: var(--success); margin-left: 8px;"></i>' : ''}
                            ${!isVerified ? '<i class="fas fa-exclamation-triangle" style="color: var(--warning); margin-left: 8px;"></i>' : ''}
                        </div>
                        <div class="list-item-description">
                            ID: ${appId}
                            ${isStartup ? ' • <span style="color: var(--info);">Startup</span>' : ''}
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-sm btn-ghost" onclick="AppsManager.openApp('${appId}')">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="AppsManager.toggleStartup('${appId}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="AppsManager.uninstallApp('${appId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Installed Applications</h3>
                <p class="text-secondary">Manage your installed applications and their permissions</p>
            </div>
            
            ${appsHtml || '<div class="text-secondary">No applications installed</div>'}
            
            <div class="mt-4 flex gap-2">
                ${this.core.createButton('Check for Updates', 'AppsManager.checkForUpdates()', 'btn-primary', 'fas fa-sync')}
                ${this.core.createButton('Refresh List', 'AppsManager.refreshAppsList()', 'btn-secondary', 'fas fa-refresh')}
            </div>
        `;

        return this.core.createCard('App Management', 'Install, update, and manage your applications', content, 'fas fa-box');
    }

    createAppStoreCard() {
        const featuredApps = [
            { id: 'web-browser', title: 'Web Browser', description: 'Fast and secure web browsing', verified: true },
            { id: 'image-editor', title: 'Image Editor', description: 'Professional photo editing tools', verified: true },
            { id: 'music-player', title: 'Music Player', description: 'Stream and organize your music', verified: false },
            { id: 'file-manager', title: 'File Manager', description: 'Advanced file management', verified: true }
        ];

        const appsHtml = featuredApps.map(app => {
            const isInstalled = this.core.getInstalledApps().includes(app.id);
            const isVerified = this.core.isAppVerified(app.id);
            
            return `
                <div class="settings-card" style="margin-bottom: 16px;">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <strong>${app.title}</strong>
                                ${isVerified ? '<i class="fas fa-check-circle" style="color: var(--success);"></i>' : ''}
                                ${!isVerified ? '<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i>' : ''}
                            </div>
                            <div class="text-secondary">${app.description}</div>
                        </div>
                        <div>
                            ${isInstalled ? 
                                `<button class="btn btn-sm btn-secondary" disabled>Installed</button>` :
                                `<button class="btn btn-sm btn-primary" onclick="AppsManager.installApp('${app.id}')">Install</button>`
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Aether App Store</h3>
                <p class="text-secondary">Browse and install verified applications from the Aether Store</p>
            </div>
            
            ${appsHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Browse App Store', 'AppsManager.openAppStore()', 'btn-primary', 'fas fa-store')}
            </div>
        `;

        return this.core.createCard('App Store', 'Discover new applications', content, 'fas fa-store');
    }

    // Helper methods
    getAvailableStartupApps() {
        const installed = this.core.getInstalledApps();
        return installed.map(appId => {
            const info = this.core.getAppInfo(appId);
            return {
                id: appId,
                title: info?.title || appId
            };
        }).filter(app => !this.startupApps.includes(app.id));
    }

    getAvailableAppsForType(type) {
        const installed = this.core.getInstalledApps();
        const typeMappings = {
            browser: ['web-browser', 'chrome', 'firefox'],
            imageViewer: ['image-viewer', 'photos', 'gimp'],
            videoPlayer: ['video-player', 'vlc', 'media-player'],
            textEditor: ['text-editor', 'notepad', 'code-editor']
        };

        const relevantAppIds = typeMappings[type] || [];
        return installed
            .filter(appId => relevantAppIds.includes(appId))
            .map(appId => {
                const info = this.core.getAppInfo(appId);
                return {
                    id: appId,
                    title: info?.title || appId
                };
            });
    }

    // Action methods
    addStartupApp() {
        const select = document.getElementById('add-startup-app');
        const appId = select.value;
        
        if (!appId) {
            this.core.showNotification('Startup Apps', 'Please select an application', 'warning');
            return;
        }

        if (!this.startupApps.includes(appId)) {
            this.startupApps.push(appId);
            this.core.settings.startupApps = this.startupApps;
            this.core.saveSettings();
            this.core.showNotification('Startup Apps', 'Application added to startup', 'success');
            this.render();
        }
    }

    removeStartupApp(appId) {
        this.startupApps = this.startupApps.filter(id => id !== appId);
        this.core.settings.startupApps = this.startupApps;
        this.core.saveSettings();
        this.core.showNotification('Startup Apps', 'Application removed from startup', 'info');
        this.render();
    }

    toggleStartup(appId) {
        if (this.startupApps.includes(appId)) {
            this.removeStartupApp(appId);
        } else {
            this.startupApps.push(appId);
            this.core.settings.startupApps = this.startupApps;
            this.core.saveSettings();
            this.core.showNotification('Startup Apps', 'Application added to startup', 'success');
            this.render();
        }
    }

    updateDefaultApp(type, appId) {
        this.defaultApps[type] = appId;
        this.core.settings.defaultApps = this.defaultApps;
        this.core.saveSettings();
        this.core.showNotification('Default Apps', `${type} default updated`, 'success');
    }

    resetDefaultApps() {
        this.defaultApps = {
            browser: 'web-browser',
            imageViewer: 'image-viewer',
            videoPlayer: 'video-player',
            textEditor: 'text-editor'
        };
        this.core.settings.defaultApps = this.defaultApps;
        this.core.saveSettings();
        this.core.showNotification('Default Apps', 'Default apps reset to system defaults', 'info');
        this.render();
    }

    openApp(appId) {
        if (this.core.wm && this.core.wm.installApp) {
            this.core.wm.installApp(appId);
        } else {
            this.core.showNotification('App Management', 'Failed to open application', 'error');
        }
    }

    installApp(appId) {
        if (this.core.wm && this.core.wm.installApp) {
            this.core.wm.installApp(appId);
            this.core.showNotification('App Store', 'Application installed successfully', 'success');
            
            // Verify app if it's from the store
            this.core.verifyApp(appId);
            this.render();
        } else {
            this.core.showNotification('App Store', 'Failed to install application', 'error');
        }
    }

    uninstallApp(appId) {
        if (!confirm('Are you sure you want to uninstall this application?')) {
            return;
        }

        if (this.core.wm && this.core.wm.uninstallApp) {
            this.core.wm.uninstallApp(appId);
            
            // Remove from startup apps
            this.startupApps = this.startupApps.filter(id => id !== appId);
            this.core.settings.startupApps = this.startupApps;
            
            // Remove from default apps
            Object.keys(this.defaultApps).forEach(key => {
                if (this.defaultApps[key] === appId) {
                    delete this.defaultApps[key];
                }
            });
            this.core.settings.defaultApps = this.defaultApps;
            
            this.core.saveSettings();
            this.core.showNotification('App Management', 'Application uninstalled', 'info');
            this.render();
        } else {
            this.core.showNotification('App Management', 'Failed to uninstall application', 'error');
        }
    }

    checkForUpdates() {
        this.core.showNotification('App Management', 'Checking for updates...', 'info');
        
        // Simulate update check
        setTimeout(() => {
            this.core.showNotification('App Management', 'All applications are up to date', 'success');
        }, 2000);
    }

    refreshAppsList() {
        if (this.core.wm && this.core.wm.fetchAppsRegistry) {
            this.core.wm.fetchAppsRegistry();
            this.core.showNotification('App Management', 'Application list refreshed', 'success');
            setTimeout(() => this.render(), 1000);
        }
    }

    openAppStore() {
        if (this.core.wm && this.core.wm.createWindow) {
            this.core.wm.createWindow('app-store', 'Aether App Store', true);
        } else {
            this.core.showNotification('App Store', 'Failed to open App Store', 'error');
        }
    }
}

// Global instance
window.AppsManager = new AppsManager();
