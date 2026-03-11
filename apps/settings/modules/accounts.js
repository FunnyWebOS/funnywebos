/**
 * Accounts & Cloud Module
 * Handles cloud service integrations and account management
 */

class AccountsManager {
    constructor() {
        this.core = window.SettingsCore;
        this.cloudServices = {
            onedrive: {
                name: 'OneDrive',
                description: 'Microsoft cloud storage service',
                icon: 'fas fa-cloud',
                color: '#0078d4',
                features: ['5 GB free storage', 'Office integration', 'File sharing']
            },
            googledrive: {
                name: 'Google Drive',
                description: 'Google cloud storage service',
                icon: 'fab fa-google-drive',
                color: '#4285f4',
                features: ['15 GB free storage', 'Google Workspace', 'Real-time collaboration']
            },
            dropbox: {
                name: 'Dropbox',
                description: 'File hosting service',
                icon: 'fab fa-dropbox',
                color: '#0061ff',
                features: ['2 GB free storage', 'File sync', 'Version history']
            },
            icloud: {
                name: 'iCloud',
                description: 'Apple cloud service',
                icon: 'fab fa-apple',
                color: '#000000',
                features: ['5 GB free storage', 'Device sync', 'Find My']
            }
        };
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // Connected Accounts Section
        const connectedCard = this.createConnectedAccountsCard();
        content.appendChild(connectedCard);

        // Available Services Section
        const servicesCard = this.createAvailableServicesCard();
        content.appendChild(servicesCard);

        // Sync Settings Section
        const syncCard = this.createSyncSettingsCard();
        content.appendChild(syncCard);

        // Account Security Section
        const securityCard = this.createAccountSecurityCard();
        content.appendChild(securityCard);
    }

    createConnectedAccountsCard() {
        const accounts = this.core.settings.accounts || {};
        const connectedServices = Object.entries(accounts).filter(([key, account]) => account.connected);
        
        const connectedHtml = connectedServices.map(([key, account]) => {
            const service = this.cloudServices[key];
            if (!service) return '';
            
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="${service.icon}" style="color: ${service.color}; margin-right: 8px;"></i>
                            ${service.name}
                            <span class="text-secondary" style="margin-left: 8px;">• ${account.email}</span>
                        </div>
                        <div class="list-item-description">
                            Connected • Last sync: ${account.lastSync || 'Never'}
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-sm btn-ghost" onclick="AccountsManager.syncAccount('${key}')">
                            <i class="fas fa-sync"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="AccountsManager.manageAccount('${key}')">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="AccountsManager.disconnectAccount('${key}')">
                            <i class="fas fa-unlink"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Connected Accounts</h3>
                <p class="text-secondary">Manage your connected cloud services</p>
            </div>
            
            ${connectedHtml || '<div class="text-secondary">No accounts connected</div>'}
            
            ${connectedServices.length > 0 ? `
                <div class="mt-4">
                    ${this.core.createButton('Sync All', 'AccountsManager.syncAllAccounts()', 'btn-primary', 'fas fa-sync')}
                    ${this.core.createButton('Manage All', 'AccountsManager.manageAllAccounts()', 'btn-secondary', 'fas fa-cog')}
                </div>
            ` : ''}
        `;

        return this.core.createCard('Connected Services', 'Your connected cloud accounts', content, 'fas fa-link');
    }

    createAvailableServicesCard() {
        const accounts = this.core.settings.accounts || {};
        const availableServices = Object.entries(this.cloudServices).filter(([key]) => !accounts[key]?.connected);
        
        const servicesHtml = availableServices.map(([key, service]) => {
            return `
                <div class="settings-card" style="margin-bottom: 16px;">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-lg flex items-center justify-center" style="background: ${service.color}20;">
                                <i class="${service.icon}" style="color: ${service.color}; font-size: 20px;"></i>
                            </div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">${service.name}</div>
                                <div class="text-secondary" style="font-size: 12px;">${service.description}</div>
                                <div class="text-secondary" style="font-size: 11px; margin-top: 2px;">
                                    ${service.features.map(feature => `• ${feature}`).join(' • ')}
                                </div>
                            </div>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-primary" onclick="AccountsManager.connectAccount('${key}')">
                                Connect
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Available Services</h3>
                <p class="text-secondary">Connect additional cloud services</p>
            </div>
            
            ${servicesHtml || '<div class="text-secondary">All services are connected</div>'}
        `;

        return this.core.createCard('Available Services', 'Connect more cloud services', content, 'fas fa-cloud');
    }

    createSyncSettingsCard() {
        const syncSettings = this.core.settings.syncSettings || {};
        
        const content = `
            <div class="mb-4">
                <h3>Sync Settings</h3>
                <p class="text-secondary">Configure how your data synchronizes across services</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('auto-sync', syncSettings.autoSync !== false, 'Automatic Sync')}
                </label>
                <div class="form-description">Automatically sync files and settings when connected</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Sync Frequency</label>
                <select id="sync-frequency" class="form-select" onchange="AccountsManager.updateSyncFrequency(this.value)">
                    <option value="realtime" ${syncSettings.frequency === 'realtime' ? 'selected' : ''}>Real-time</option>
                    <option value="5min" ${syncSettings.frequency === '5min' ? 'selected' : ''}>Every 5 minutes</option>
                    <option value="15min" ${syncSettings.frequency === '15min' ? 'selected' : ''}>Every 15 minutes</option>
                    <option value="hourly" ${syncSettings.frequency === 'hourly' ? 'selected' : ''}>Hourly</option>
                    <option value="manual" ${syncSettings.frequency === 'manual' ? 'selected' : ''}>Manual only</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Data to Sync</label>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" id="sync-documents" ${syncSettings.documents !== false ? 'checked' : ''} 
                               onchange="AccountsManager.updateSyncSetting('documents', this.checked)">
                        <span>Documents and files</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" id="sync-settings" ${syncSettings.settings !== false ? 'checked' : ''} 
                               onchange="AccountsManager.updateSyncSetting('settings', this.checked)">
                        <span>System settings</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" id="sync-apps" ${syncSettings.apps !== false ? 'checked' : ''} 
                               onchange="AccountsManager.updateSyncSetting('apps', this.checked)">
                        <span>Application data</span>
                    </label>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" id="sync-desktop" ${syncSettings.desktop !== false ? 'checked' : ''} 
                               onchange="AccountsManager.updateSyncSetting('desktop', this.checked)">
                        <span>Desktop customization</span>
                    </label>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Storage Usage</label>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center justify-between mb-2">
                        <span>Total used across services</span>
                        <span style="font-weight: 600;">2.3 GB / 22 GB</span>
                    </div>
                    <div style="height: 8px; background: var(--border-primary); border-radius: 4px; overflow: hidden;">
                        <div style="width: 10%; height: 100%; background: var(--primary);"></div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Sync Now', 'AccountsManager.syncAllAccounts()', 'btn-primary', 'fas fa-sync')}
                ${this.core.createButton('View Storage', 'AccountsManager.viewStorage()', 'btn-secondary', 'fas fa-database')}
            </div>
        `;

        return this.core.createCard('Sync Configuration', 'Manage your synchronization preferences', content, 'fas fa-sync-alt');
    }

    createAccountSecurityCard() {
        const securitySettings = this.core.settings.accountSecurity || {};
        
        const content = `
            <div class="mb-4">
                <h3>Account Security</h3>
                <p class="text-secondary">Manage security settings for your connected accounts</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('two-factor', securitySettings.twoFactor !== false, 'Two-Factor Authentication')}
                </label>
                <div class="form-description">Require additional verification for account access</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('login-alerts', securitySettings.loginAlerts !== false, 'Login Alerts')}
                </label>
                <div class="form-description">Get notified of new sign-ins to your accounts</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('app-passwords', securitySettings.appPasswords !== false, 'App Passwords')}
                </label>
                <div class="form-description">Generate app-specific passwords for enhanced security</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Connected Devices</label>
                <div class="text-secondary" style="font-size: 12px; margin-bottom: 8px;">Devices currently accessing your accounts</div>
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="fas fa-laptop" style="margin-right: 8px;"></i>
                            This Device
                        </div>
                        <div class="list-item-description">Current session • Active now</div>
                    </div>
                    <div class="text-secondary" style="font-size: 12px;">Trusted</div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Security Checkup', 'AccountsManager.securityCheckup()', 'btn-primary', 'fas fa-shield-alt')}
                ${this.core.createButton('Manage Devices', 'AccountsManager.manageDevices()', 'btn-secondary', 'fas fa-mobile-alt')}
            </div>
        `;

        return this.core.createCard('Security', 'Protect your connected accounts', content, 'fas fa-lock');
    }

    // Action methods
    connectAccount(serviceId) {
        const service = this.cloudServices[serviceId];
        if (!service) {
            this.core.showNotification('Accounts', 'Invalid service', 'error');
            return;
        }

        // Simulate OAuth flow
        this.core.showNotification('Accounts', `Connecting to ${service.name}...`, 'info');
        
        setTimeout(() => {
            // Simulate successful connection
            const accounts = this.core.settings.accounts || {};
            accounts[serviceId] = {
                connected: true,
                email: `user@${serviceId}.com`,
                lastSync: new Date().toLocaleString(),
                connectedAt: new Date().toISOString()
            };
            this.core.settings.accounts = accounts;
            this.core.saveSettings();
            
            this.core.showNotification('Accounts', `Connected to ${service.name}`, 'success');
            this.render();
        }, 2000);
    }

    disconnectAccount(serviceId) {
        const service = this.cloudServices[serviceId];
        if (!service) return;
        
        if (!confirm(`Disconnect from ${service.name}? This will stop syncing data.`)) {
            return;
        }
        
        const accounts = this.core.settings.accounts || {};
        delete accounts[serviceId];
        this.core.settings.accounts = accounts;
        this.core.saveSettings();
        
        this.core.showNotification('Accounts', `Disconnected from ${service.name}`, 'info');
        this.render();
    }

    syncAccount(serviceId) {
        const service = this.cloudServices[serviceId];
        if (!service) return;
        
        this.core.showNotification('Accounts', `Syncing ${service.name}...`, 'info');
        
        setTimeout(() => {
            const accounts = this.core.settings.accounts || {};
            if (accounts[serviceId]) {
                accounts[serviceId].lastSync = new Date().toLocaleString();
                this.core.settings.accounts = accounts;
                this.core.saveSettings();
            }
            
            this.core.showNotification('Accounts', `${service.name} synced successfully`, 'success');
            this.render();
        }, 1500);
    }

    syncAllAccounts() {
        const accounts = this.core.settings.accounts || {};
        const connectedServices = Object.keys(accounts).filter(key => accounts[key].connected);
        
        if (connectedServices.length === 0) {
            this.core.showNotification('Accounts', 'No accounts to sync', 'warning');
            return;
        }
        
        this.core.showNotification('Accounts', 'Syncing all accounts...', 'info');
        
        connectedServices.forEach(serviceId => {
            setTimeout(() => this.syncAccount(serviceId), Math.random() * 2000);
        });
    }

    manageAccount(serviceId) {
        const service = this.cloudServices[serviceId];
        if (!service) return;
        
        this.core.showNotification('Accounts', `Manage ${service.name} feature coming soon`, 'info');
    }

    manageAllAccounts() {
        this.core.showNotification('Accounts', 'Account management feature coming soon', 'info');
    }

    updateSyncFrequency(frequency) {
        const syncSettings = this.core.settings.syncSettings || {};
        syncSettings.frequency = frequency;
        this.core.settings.syncSettings = syncSettings;
        this.core.saveSettings();
        
        this.core.showNotification('Sync', 'Sync frequency updated', 'success');
    }

    updateSyncSetting(setting, enabled) {
        const syncSettings = this.core.settings.syncSettings || {};
        syncSettings[setting] = enabled;
        this.core.settings.syncSettings = syncSettings;
        this.core.saveSettings();
        
        this.core.showNotification('Sync', `${setting} sync ${enabled ? 'enabled' : 'disabled'}`, 'success');
    }

    viewStorage() {
        this.core.showNotification('Accounts', 'Storage management feature coming soon', 'info');
    }

    securityCheckup() {
        this.core.showNotification('Security', 'Running security checkup...', 'info');
        
        setTimeout(() => {
            this.core.showNotification('Security', 'Security checkup complete. All accounts secure.', 'success');
        }, 3000);
    }

    manageDevices() {
        this.core.showNotification('Security', 'Device management feature coming soon', 'info');
    }
}

// Global instance
window.AccountsManager = new AccountsManager();
