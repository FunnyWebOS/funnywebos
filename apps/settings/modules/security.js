/**
 * Aether Security Module
 * Comprehensive security system with levels and app verification
 */

class SecurityManager {
    constructor() {
        this.core = window.SettingsCore;
        this.securityLevels = {
            low: {
                name: 'Low',
                description: 'Basic protection with minimal restrictions',
                color: '#107c10',
                icon: 'fas fa-shield',
                features: ['Basic malware protection', 'App installation allowed']
            },
            normal: {
                name: 'Normal',
                description: 'Balanced security for everyday use',
                color: '#0078d4',
                icon: 'fas fa-shield-alt',
                features: ['Enhanced malware protection', 'App verification', 'Safe browsing']
            },
            high: {
                name: 'High',
                description: 'Strict security for sensitive data',
                color: '#ff8c00',
                icon: 'fas fa-shield-virus',
                features: ['Advanced threat protection', 'App verification required', 'Strict browsing policies']
            },
            strict: {
                name: 'Strict',
                description: 'Maximum security with limited functionality',
                color: '#d13438',
                icon: 'fas fa-lock',
                features: ['Maximum threat protection', 'Verified apps only', 'Restricted network access']
            }
        };
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // Security Level Card
        const levelCard = this.createSecurityLevelCard();
        content.appendChild(levelCard);

        // App Verification Card
        const verificationCard = this.createAppVerificationCard();
        content.appendChild(verificationCard);

        // Security Settings Card
        const settingsCard = this.createSecuritySettingsCard();
        content.appendChild(settingsCard);

        // Security Report Card
        const reportCard = this.createSecurityReportCard();
        content.appendChild(reportCard);
    }

    createSecurityLevelCard() {
        const currentLevel = this.core.settings.security.level || 'normal';
        const levelInfo = this.securityLevels[currentLevel];

        const levelsHtml = Object.entries(this.securityLevels).map(([key, level]) => {
            const isActive = key === currentLevel;
            return `
                <div class="settings-card ${isActive ? 'active' : ''}" style="margin-bottom: 12px; cursor: pointer;" 
                     onclick="SecurityManager.setSecurityLevel('${key}')"
                     style="border: ${isActive ? `2px solid ${level.color}` : '1px solid var(--border-primary)'}">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i class="${level.icon}" style="color: ${level.color}; font-size: 24px;"></i>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">${level.name}</div>
                                <div class="text-secondary" style="font-size: 12px;">${level.description}</div>
                            </div>
                        </div>
                        ${isActive ? '<i class="fas fa-check-circle" style="color: var(--success);"></i>' : ''}
                    </div>
                    <div class="mt-3">
                        ${level.features.map(feature => 
                            `<div class="text-secondary" style="font-size: 11px;">• ${feature}</div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Aether Security Level</h3>
                <p class="text-secondary">Choose your security protection level</p>
            </div>
            
            ${levelsHtml}
            
            <div class="mt-4 p-3" style="background: var(--background-secondary); border-radius: 8px;">
                <div class="flex items-center gap-2">
                    <i class="fas fa-info-circle" style="color: var(--info);"></i>
                    <span class="text-secondary" style="font-size: 12px;">
                        Higher security levels provide better protection but may limit functionality
                    </span>
                </div>
            </div>
        `;

        return this.core.createCard('Security Protection', 'Manage your system security level', content, 'fas fa-shield-alt');
    }

    createAppVerificationCard() {
        const verifiedApps = this.core.settings.security.verifiedApps || [];
        const installedApps = this.core.getInstalledApps();
        
        const appsHtml = installedApps.map(appId => {
            const appInfo = this.core.getAppInfo(appId);
            const appName = appInfo?.title || appId;
            const isVerified = verifiedApps.includes(appId);
            
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            ${appName}
                            ${isVerified ? 
                                '<i class="fas fa-check-circle" style="color: var(--success); margin-left: 8px;"></i>' : 
                                '<i class="fas fa-exclamation-triangle" style="color: var(--warning); margin-left: 8px;"></i>'
                            }
                        </div>
                        <div class="list-item-description">
                            ${isVerified ? 'Verified application' : 'Unverified application'}
                        </div>
                    </div>
                    <div class="list-item-actions">
                        ${isVerified ? 
                            `<button class="btn btn-sm btn-secondary" disabled>Verified</button>` :
                            `<button class="btn btn-sm btn-primary" onclick="SecurityManager.verifyApp('${appId}')">Verify</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Application Verification</h3>
                <p class="text-secondary">Manage verified applications from the Aether Store</p>
            </div>
            
            ${appsHtml || '<div class="text-secondary">No applications installed</div>'}
            
            <div class="mt-4">
                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="auto-verify" ${this.core.settings.security.autoVerify ? 'checked' : ''} 
                               onchange="SecurityManager.toggleAutoVerify()">
                        <span style="margin-left: 8px;">Automatically verify apps from Aether Store</span>
                    </label>
                </div>
            </div>
        `;

        return this.core.createCard('App Verification', 'Verify application authenticity', content, 'fas fa-certificate');
    }

    createSecuritySettingsCard() {
        const settings = this.core.settings.security;
        
        const content = `
            <div class="mb-4">
                <h3>Security Settings</h3>
                <p class="text-secondary">Configure additional security options</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('security-warnings', settings.warnings !== false, 'Show security warnings')}
                </label>
                <div class="form-description">Display warnings for potentially dangerous actions</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('auto-scan', settings.autoScan !== false, 'Automatic app scanning')}
                </label>
                <div class="form-description">Automatically scan new apps for threats</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('network-protection', settings.networkProtection !== false, 'Network protection')}
                </label>
                <div class="form-description">Monitor and protect against network threats</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('firewall', settings.firewall !== false, 'Firewall protection')}
                </label>
                <div class="form-description">Block unauthorized network access</div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Run Security Scan', 'SecurityManager.runSecurityScan()', 'btn-primary', 'fas fa-search')}
                ${this.core.createButton('Security Logs', 'SecurityManager.showSecurityLogs()', 'btn-secondary', 'fas fa-list')}
            </div>
        `;

        return this.core.createCard('Security Options', 'Advanced security configuration', content, 'fas fa-cog');
    }

    createSecurityReportCard() {
        const report = this.generateSecurityReport();
        
        const content = `
            <div class="mb-4">
                <h3>Security Report</h3>
                <p class="text-secondary">Overview of your system security status</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fas fa-shield-alt" style="color: var(--info);"></i>
                        <span style="font-weight: 600;">Protection Level</span>
                    </div>
                    <div style="color: ${this.securityLevels[this.core.settings.security.level].color}; font-weight: 600;">
                        ${this.securityLevels[this.core.settings.security.level].name}
                    </div>
                </div>
                
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fas fa-check-circle" style="color: var(--success);"></i>
                        <span style="font-weight: 600;">Verified Apps</span>
                    </div>
                    <div style="font-weight: 600;">${report.verifiedApps} / ${report.totalApps}</div>
                </div>
                
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i>
                        <span style="font-weight: 600;">Risks Found</span>
                    </div>
                    <div style="font-weight: 600; color: var(--warning);">${report.risks}</div>
                </div>
                
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fas fa-clock" style="color: var(--text-secondary);"></i>
                        <span style="font-weight: 600;">Last Scan</span>
                    </div>
                    <div style="font-weight: 600;">${report.lastScan}</div>
                </div>
            </div>
            
            <div class="p-3" style="background: ${report.score >= 80 ? 'var(--success)' : report.score >= 60 ? 'var(--warning)' : 'var(--danger)'}20; border-radius: 8px; border: 1px solid ${report.score >= 80 ? 'var(--success)' : report.score >= 60 ? 'var(--warning)' : 'var(--danger)'};">
                <div class="flex items-center justify-between">
                    <div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Security Score</div>
                        <div class="text-secondary" style="font-size: 12px;">Overall system security rating</div>
                    </div>
                    <div style="font-size: 24px; font-weight: bold; color: ${report.score >= 80 ? 'var(--success)' : report.score >= 60 ? 'var(--warning)' : 'var(--danger)'};">
                        ${report.score}%
                    </div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Detailed Report', 'SecurityManager.showDetailedReport()', 'btn-primary', 'fas fa-chart-line')}
                ${this.core.createButton('Export Report', 'SecurityManager.exportReport()', 'btn-secondary', 'fas fa-download')}
            </div>
        `;

        return this.core.createCard('Security Status', 'Monitor your system security', content, 'fas fa-chart-bar');
    }

    generateSecurityReport() {
        const verifiedApps = this.core.settings.security.verifiedApps || [];
        const installedApps = this.core.getInstalledApps();
        const totalApps = installedApps.length;
        const verifiedCount = verifiedApps.length;
        const risks = totalApps - verifiedCount;
        
        // Calculate security score
        let score = 50; // Base score
        
        // Add points for verified apps
        if (totalApps > 0) {
            score += (verifiedCount / totalApps) * 30;
        }
        
        // Add points for security level
        const levelScores = { low: 0, normal: 10, high: 15, strict: 20 };
        score += levelScores[this.core.settings.security.level] || 0;
        
        // Add points for enabled features
        if (this.core.settings.security.warnings !== false) score += 5;
        if (this.core.settings.security.autoScan !== false) score += 5;
        if (this.core.settings.security.networkProtection !== false) score += 5;
        if (this.core.settings.security.firewall !== false) score += 5;
        
        score = Math.min(100, Math.max(0, Math.round(score)));
        
        return {
            score,
            verifiedApps: verifiedCount,
            totalApps,
            risks,
            lastScan: this.core.settings.security.lastScan || 'Never'
        };
    }

    // Action methods
    setSecurityLevel(level) {
        if (!this.securityLevels[level]) {
            this.core.showNotification('Security', 'Invalid security level', 'error');
            return;
        }

        const confirmMessage = this.securityLevels[level].name === 'Strict' ? 
            'Strict security mode will limit system functionality. Continue?' : 
            `Change security level to ${this.securityLevels[level].name}?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        this.core.settings.security.level = level;
        this.core.saveSettings();
        this.core.showNotification('Security', `Security level changed to ${this.securityLevels[level].name}`, 'success');
        this.render();
    }

    verifyApp(appId) {
        this.core.verifyApp(appId);
        this.core.showNotification('Security', 'Application verified successfully', 'success');
        this.render();
    }

    toggleAutoVerify() {
        const checkbox = document.getElementById('auto-verify');
        this.core.settings.security.autoVerify = checkbox.checked;
        this.core.saveSettings();
        this.core.showNotification('Security', 'Auto-verify setting updated', 'info');
    }

    toggleSetting(setting) {
        const checkbox = document.getElementById(`security-${setting}`);
        this.core.settings.security[setting] = checkbox.checked;
        this.core.saveSettings();
        this.core.showNotification('Security', `${setting} setting updated`, 'info');
    }

    runSecurityScan() {
        this.core.showNotification('Security', 'Running security scan...', 'info');
        
        // Simulate security scan
        setTimeout(() => {
            this.core.settings.security.lastScan = new Date().toLocaleString();
            this.core.saveSettings();
            this.core.showNotification('Security', 'Security scan completed. No threats found.', 'success');
            this.render();
        }, 3000);
    }

    showSecurityLogs() {
        const logs = [
            { time: '2024-01-15 10:30:00', event: 'App verified', details: 'Web Browser verified successfully' },
            { time: '2024-01-15 09:15:00', event: 'Security scan', details: 'Completed scan - no threats found' },
            { time: '2024-01-14 16:45:00', event: 'Security level changed', details: 'Changed from Low to Normal' }
        ];
        
        const logsHtml = logs.map(log => `
            <div class="list-item">
                <div class="list-item-content">
                    <div class="list-item-title">${log.event}</div>
                    <div class="list-item-description">${log.details}</div>
                </div>
                <div class="text-secondary" style="font-size: 12px;">${log.time}</div>
            </div>
        `).join('');
        
        const content = `
            <div class="mb-4">
                <h3>Security Logs</h3>
                <p class="text-secondary">Recent security events and activities</p>
            </div>
            ${logsHtml}
        `;
        
        // This would typically open a modal or new window
        this.core.showNotification('Security', 'Security logs feature coming soon', 'info');
    }

    showDetailedReport() {
        const report = this.generateSecurityReport();
        const content = `
            <h3>Detailed Security Analysis</h3>
            <p>Comprehensive security assessment and recommendations</p>
            <div class="mt-4">
                <div class="mb-3">
                    <strong>Security Score: ${report.score}%</strong>
                    <div class="progress-bar" style="width: ${report.score}%; background: var(--success); height: 8px; border-radius: 4px;"></div>
                </div>
                <div class="text-secondary">
                    <p>• ${report.verifiedApps} of ${report.totalApps} applications are verified</p>
                    <p>• Current protection level: ${this.securityLevels[this.core.settings.security.level].name}</p>
                    <p>• ${report.risks} potential security risks identified</p>
                </div>
            </div>
        `;
        
        this.core.showNotification('Security', 'Detailed report feature coming soon', 'info');
    }

    exportReport() {
        const report = this.generateSecurityReport();
        const reportData = {
            timestamp: new Date().toISOString(),
            securityLevel: this.core.settings.security.level,
            score: report.score,
            verifiedApps: report.verifiedApps,
            totalApps: report.totalApps,
            risks: report.risks,
            lastScan: report.lastScan
        };
        
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `security-report-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.core.showNotification('Security', 'Security report exported', 'success');
    }
}

// Global instance
window.SecurityManager = new SecurityManager();
