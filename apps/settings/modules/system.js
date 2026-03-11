/**
 * System Module
 * Advanced system settings and preferences
 */

class SystemManager {
    constructor() {
        this.core = window.SettingsCore;
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // System Information Section
        const infoCard = this.createSystemInfoCard();
        content.appendChild(infoCard);

        // Performance Section
        const performanceCard = this.createPerformanceCard();
        content.appendChild(performanceCard);

        // Storage Section
        const storageCard = this.createStorageCard();
        content.appendChild(storageCard);

        // Updates Section
        const updatesCard = this.createUpdatesCard();
        content.appendChild(updatesCard);

        // Advanced Section
        const advancedCard = this.createAdvancedCard();
        content.appendChild(advancedCard);
    }

    createSystemInfoCard() {
        const systemInfo = this.getSystemInfo();
        
        const content = `
            <div class="mb-4">
                <h3>System Information</h3>
                <p class="text-secondary">View details about your AetherOS system</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Version</div>
                    <div style="font-weight: 600;">${systemInfo.version}</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Build</div>
                    <div style="font-weight: 600;">${systemInfo.build}</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Platform</div>
                    <div style="font-weight: 600;">${systemInfo.platform}</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Browser</div>
                    <div style="font-weight: 600;">${systemInfo.browser}</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Uptime</div>
                    <div style="font-weight: 600;">${systemInfo.uptime}</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">User</div>
                    <div style="font-weight: 600;">${systemInfo.user}</div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('System Report', 'SystemManager.generateSystemReport()', 'btn-primary', 'fas fa-file-alt')}
                ${this.core.createButton('Diagnostics', 'SystemManager.runDiagnostics()', 'btn-secondary', 'fas fa-stethoscope')}
            </div>
        `;

        return this.core.createCard('System Info', 'System specifications and status', content, 'fas fa-info-circle');
    }

    createPerformanceCard() {
        const performance = this.getPerformanceInfo();
        
        const content = `
            <div class="mb-4">
                <h3>Performance</h3>
                <p class="text-secondary">Monitor and optimize system performance</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">Performance Mode</label>
                <select id="performance-mode" class="form-select" onchange="SystemManager.updatePerformanceMode(this.value)">
                    <option value="balanced" ${!this.core.settings.system?.performanceMode || this.core.settings.system.performanceMode === 'balanced' ? 'selected' : ''}>Balanced</option>
                    <option value="power-saver" ${this.core.settings.system?.performanceMode === 'power-saver' ? 'selected' : ''}>Power Saver</option>
                    <option value="high-performance" ${this.core.settings.system?.performanceMode === 'high-performance' ? 'selected' : ''}>High Performance</option>
                </select>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center justify-between mb-2">
                        <span>CPU Usage</span>
                        <span style="font-weight: 600;">${performance.cpu}%</span>
                    </div>
                    <div style="height: 8px; background: var(--border-primary); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${performance.cpu}%; height: 100%; background: ${performance.cpu > 80 ? 'var(--danger)' : performance.cpu > 60 ? 'var(--warning)' : 'var(--success)'};"></div>
                    </div>
                </div>
                
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center justify-between mb-2">
                        <span>Memory Usage</span>
                        <span style="font-weight: 600;">${performance.memory}%</span>
                    </div>
                    <div style="height: 8px; background: var(--border-primary); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${performance.memory}%; height: 100%; background: ${performance.memory > 80 ? 'var(--danger)' : performance.memory > 60 ? 'var(--warning)' : 'var(--success)'};"></div>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('auto-cleanup', this.core.settings.system?.autoCleanup !== false, 'Automatic Cleanup')}
                </label>
                <div class="form-description">Automatically clean up temporary files and optimize performance</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('background-optimization', this.core.settings.system?.backgroundOptimization !== false, 'Background Optimization')}
                </label>
                <div class="form-description">Optimize system performance in the background</div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Performance Test', 'SystemManager.runPerformanceTest()', 'btn-primary', 'fas fa-tachometer-alt')}
                ${this.core.createButton('Cleanup Now', 'SystemManager.runCleanup()', 'btn-secondary', 'fas fa-broom')}
            </div>
        `;

        return this.core.createCard('Performance', 'System performance monitoring', content, 'fas fa-tachometer-alt');
    }

    createStorageCard() {
        const storage = this.getStorageInfo();
        
        const content = `
            <div class="mb-4">
                <h3>Storage</h3>
                <p class="text-secondary">Manage system storage and disk space</p>
            </div>
            
            <div class="p-3" style="background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;">
                <div class="flex items-center justify-between mb-2">
                    <span>Storage Used</span>
                    <span style="font-weight: 600;">${storage.used} GB / ${storage.total} GB</span>
                </div>
                <div style="height: 12px; background: var(--border-primary); border-radius: 6px; overflow: hidden;">
                    <div style="width: ${storage.percentage}%; height: 100%; background: var(--primary);"></div>
                </div>
                <div class="text-secondary" style="font-size: 12px; margin-top: 8px;">${storage.percentage}% used • ${storage.free} GB free</div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Applications</div>
                    <div style="font-weight: 600;">${storage.apps} GB</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Documents</div>
                    <div style="font-weight: 600;">${storage.documents} GB</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">Media</div>
                    <div style="font-weight: 600;">${storage.media} GB</div>
                </div>
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="text-secondary" style="font-size: 12px; margin-bottom: 4px;">System</div>
                    <div style="font-weight: 600;">${storage.system} GB</div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Storage Analysis', 'SystemManager.analyzeStorage()', 'btn-primary', 'fas fa-chart-pie')}
                ${this.core.createButton('Clean Up', 'SystemManager.cleanupStorage()', 'btn-secondary', 'fas fa-trash')}
            </div>
        `;

        return this.core.createCard('Storage Management', 'Disk space and storage analysis', content, 'fas fa-database');
    }

    createUpdatesCard() {
        const updates = this.getUpdateInfo();
        
        const content = `
            <div class="mb-4">
                <h3>System Updates</h3>
                <p class="text-secondary">Keep your system up to date</p>
            </div>
            
            <div class="p-3" style="background: ${updates.available ? 'var(--warning)20' : 'var(--success)20'}; border-radius: 8px; border: 1px solid ${updates.available ? 'var(--warning)' : 'var(--success)'};">
                <div class="flex items-center gap-3">
                    <i class="fas ${updates.available ? 'fa-download' : 'fa-check-circle'}" style="color: ${updates.available ? 'var(--warning)' : 'var(--success)'}; font-size: 20px;"></i>
                    <div>
                        <div style="font-weight: 600;">${updates.available ? 'Updates Available' : 'System Up to Date'}</div>
                        <div class="text-secondary" style="font-size: 12px;">${updates.status}</div>
                    </div>
                </div>
            </div>
            
            ${updates.available ? `
                <div class="mt-4">
                    <h4>Available Updates:</h4>
                    ${updates.updates.map(update => `
                        <div class="list-item">
                            <div class="list-item-content">
                                <div class="list-item-title">${update.name}</div>
                                <div class="list-item-description">${update.description} • ${update.size}</div>
                            </div>
                            <div class="list-item-actions">
                                ${this.core.createButton('Install', `SystemManager.installUpdate('${update.id}')`, 'btn-sm btn-primary')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="form-group mt-4">
                <label class="form-label">
                    ${this.core.createToggle('auto-updates', this.core.settings.system?.autoUpdates !== false, 'Automatic Updates')}
                </label>
                <div class="form-description">Automatically download and install system updates</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Update Schedule</label>
                <select id="update-schedule" class="form-select" onchange="SystemManager.updateSchedule(this.value)">
                    <option value="automatic" ${!this.core.settings.system?.updateSchedule || this.core.settings.system.updateSchedule === 'automatic' ? 'selected' : ''}>Automatic</option>
                    <option value="daily" ${this.core.settings.system?.updateSchedule === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${this.core.settings.system?.updateSchedule === 'weekly' ? 'selected' : ''}>Weekly</option>
                    <option value="manual" ${this.core.settings.system?.updateSchedule === 'manual' ? 'selected' : ''}>Manual only</option>
                </select>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Check for Updates', 'SystemManager.checkForUpdates()', 'btn-primary', 'fas fa-sync')}
                ${this.core.createButton('Update History', 'SystemManager.showUpdateHistory()', 'btn-secondary', 'fas fa-history')}
            </div>
        `;

        return this.core.createCard('Updates', 'System updates and maintenance', content, 'fas fa-download');
    }

    createAdvancedCard() {
        const content = `
            <div class="mb-4">
                <h3>Advanced Settings</h3>
                <p class="text-secondary">Advanced system configuration options</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('developer-mode', this.core.settings.system?.developerMode === true, 'Developer Mode')}
                </label>
                <div class="form-description">Enable advanced developer features and debugging tools</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('experimental-features', this.core.settings.system?.experimentalFeatures === true, 'Experimental Features')}
                </label>
                <div class="form-description">Enable experimental features that may be unstable</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('telemetry', this.core.settings.system?.telemetry !== false, 'Telemetry')}
                </label>
                <div class="form-description">Send anonymous usage data to improve AetherOS</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">System Language</label>
                <select id="system-language" class="form-select" onchange="SystemManager.updateLanguage(this.value)">
                    <option value="en" ${!this.core.settings.system?.language || this.core.settings.system.language === 'en' ? 'selected' : ''}>English</option>
                    <option value="fr" ${this.core.settings.system?.language === 'fr' ? 'selected' : ''}>Français</option>
                    <option value="es" ${this.core.settings.system?.language === 'es' ? 'selected' : ''}>Español</option>
                    <option value="de" ${this.core.settings.system?.language === 'de' ? 'selected' : ''}>Deutsch</option>
                    <option value="ja" ${this.core.settings.system?.language === 'ja' ? 'selected' : ''}>日本語</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Time Zone</label>
                <select id="system-timezone" class="form-select" onchange="SystemManager.updateTimezone(this.value)">
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                </select>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('System Reset', 'SystemManager.systemReset()', 'btn-danger', 'fas fa-exclamation-triangle')}
                ${this.core.createButton('Export Logs', 'SystemManager.exportLogs()', 'btn-secondary', 'fas fa-file-export')}
            </div>
        `;

        return this.core.createCard('Advanced', 'Advanced system configuration', content, 'fas fa-cogs');
    }

    // Helper methods
    getSystemInfo() {
        return {
            version: this.core.wm?.sysVersion || 'AetherOS v3.0',
            build: '3.0.0.20240115',
            platform: navigator.platform,
            browser: navigator.userAgent.split(' ').pop(),
            uptime: this.calculateUptime(),
            user: this.core.wm?.userName || 'User'
        };
    }

    getPerformanceInfo() {
        // Simulate performance data
        return {
            cpu: Math.floor(Math.random() * 40) + 10,
            memory: Math.floor(Math.random() * 30) + 40
        };
    }

    getStorageInfo() {
        // Simulate storage data
        const total = 100;
        const used = 65;
        const free = total - used;
        
        return {
            total,
            used,
            free,
            percentage: Math.round((used / total) * 100),
            apps: 15,
            documents: 8,
            media: 25,
            system: 17
        };
    }

    getUpdateInfo() {
        // Simulate update data
        const hasUpdates = Math.random() > 0.5;
        
        return {
            available: hasUpdates,
            status: hasUpdates ? '2 updates available' : 'Your system is up to date',
            updates: hasUpdates ? [
                {
                    id: 'update-1',
                    name: 'AetherOS 3.0.1',
                    description: 'Security improvements and bug fixes',
                    size: '125 MB'
                },
                {
                    id: 'update-2',
                    name: 'System Components',
                    description: 'Updated system libraries and drivers',
                    size: '45 MB'
                }
            ] : []
        };
    }

    calculateUptime() {
        const uptime = performance.now();
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }

    // Action methods
    generateSystemReport() {
        const report = {
            timestamp: new Date().toISOString(),
            system: this.getSystemInfo(),
            performance: this.getPerformanceInfo(),
            storage: this.getStorageInfo(),
            updates: this.getUpdateInfo(),
            settings: this.core.settings
        };
        
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-report-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.core.showNotification('System', 'System report generated', 'success');
    }

    runDiagnostics() {
        this.core.showNotification('System', 'Running system diagnostics...', 'info');
        
        setTimeout(() => {
            this.core.showNotification('System', 'Diagnostics complete. No issues found.', 'success');
        }, 3000);
    }

    updatePerformanceMode(mode) {
        const systemSettings = this.core.settings.system || {};
        systemSettings.performanceMode = mode;
        this.core.settings.system = systemSettings;
        this.core.saveSettings();
        
        this.core.showNotification('System', `Performance mode set to ${mode}`, 'success');
    }

    runPerformanceTest() {
        this.core.showNotification('System', 'Running performance test...', 'info');
        
        setTimeout(() => {
            const score = Math.floor(Math.random() * 30) + 70;
            this.core.showNotification('System', `Performance test complete. Score: ${score}/100`, 'success');
        }, 2000);
    }

    runCleanup() {
        this.core.showNotification('System', 'Running system cleanup...', 'info');
        
        setTimeout(() => {
            const cleaned = Math.floor(Math.random() * 500) + 100;
            this.core.showNotification('System', `Cleanup complete. Freed ${cleaned} MB of space`, 'success');
        }, 3000);
    }

    analyzeStorage() {
        this.core.showNotification('Storage', 'Analyzing storage usage...', 'info');
        
        setTimeout(() => {
            this.core.showNotification('Storage', 'Storage analysis complete', 'success');
        }, 2000);
    }

    cleanupStorage() {
        if (!confirm('Clean up temporary files and optimize storage?')) {
            return;
        }
        
        this.core.showNotification('Storage', 'Cleaning up storage...', 'info');
        
        setTimeout(() => {
            const freed = Math.floor(Math.random() * 1000) + 500;
            this.core.showNotification('Storage', `Storage cleanup complete. Freed ${freed} MB`, 'success');
        }, 3000);
    }

    checkForUpdates() {
        this.core.showNotification('Updates', 'Checking for updates...', 'info');
        
        setTimeout(() => {
            const updates = this.getUpdateInfo();
            if (updates.available) {
                this.core.showNotification('Updates', `${updates.updates.length} updates available`, 'success');
            } else {
                this.core.showNotification('Updates', 'System is up to date', 'info');
            }
            this.render();
        }, 2000);
    }

    installUpdate(updateId) {
        this.core.showNotification('Updates', 'Installing update...', 'info');
        
        setTimeout(() => {
            this.core.showNotification('Updates', 'Update installed successfully', 'success');
            this.render();
        }, 3000);
    }

    showUpdateHistory() {
        this.core.showNotification('Updates', 'Update history feature coming soon', 'info');
    }

    updateSchedule(schedule) {
        const systemSettings = this.core.settings.system || {};
        systemSettings.updateSchedule = schedule;
        this.core.settings.system = systemSettings;
        this.core.saveSettings();
        
        this.core.showNotification('Updates', `Update schedule set to ${schedule}`, 'success');
    }

    updateLanguage(language) {
        const systemSettings = this.core.settings.system || {};
        systemSettings.language = language;
        this.core.settings.system = systemSettings;
        this.core.saveSettings();
        
        this.core.showNotification('System', `Language set to ${language}`, 'success');
    }

    updateTimezone(timezone) {
        const systemSettings = this.core.settings.system || {};
        systemSettings.timezone = timezone;
        this.core.settings.system = systemSettings;
        this.core.saveSettings();
        
        this.core.showNotification('System', `Time zone set to ${timezone}`, 'success');
    }

    systemReset() {
        if (!confirm('Reset system to factory defaults? This will erase all settings and data.')) {
            return;
        }
        
        if (!confirm('This action cannot be undone. Are you absolutely sure?')) {
            return;
        }
        
        this.core.showNotification('System', 'Resetting system...', 'warning');
        
        setTimeout(() => {
            localStorage.clear();
            window.location.reload();
        }, 2000);
    }

    exportLogs() {
        const logs = {
            timestamp: new Date().toISOString(),
            system: this.getSystemInfo(),
            performance: this.getPerformanceInfo(),
            settings: this.core.settings
        };
        
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.core.showNotification('System', 'System logs exported', 'success');
    }
}

// Global instance
window.SystemManager = new SystemManager();
