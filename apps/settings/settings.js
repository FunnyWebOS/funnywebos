/**
 * Settings Manager - Main Controller
 * Coordinates all settings modules and handles navigation
 */

class SettingsManager {
    constructor() {
        this.core = window.SettingsCore;
        this.currentCategory = 'apps';
        this.modules = {
            apps: window.AppsManager,
            personalization: window.PersonalizationManager,
            security: window.SecurityManager,
            accounts: window.AccountsManager,
            accessibility: window.AccessibilityManager,
            system: window.SystemManager
        };
        
        this.init();
    }

    init() {
        // Initialize the settings interface
        this.setupEventListeners();
        this.loadInitialCategory();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        // Listen for navigation changes
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'ArrowLeft') {
                this.navigatePrevious();
            } else if (e.altKey && e.key === 'ArrowRight') {
                this.navigateNext();
            }
        });

        // Listen for window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Listen for theme changes from parent window
        window.addEventListener('message', (event) => {
            if (event.data.type === 'funnyweb_theme_change') {
                this.core.applyTheme();
            }
            if (event.data.type === 'funnyweb_settings_sync') {
                this.syncSettings();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + , for settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                this.focusSearch();
            }
            
            // Escape to close settings
            if (e.key === 'Escape') {
                this.closeSettings();
            }
            
            // Ctrl/Cmd + F for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.focusSearch();
            }
        });
    }

    loadInitialCategory() {
        // Load category from URL hash or default to apps
        const hash = window.location.hash.substring(1);
        const category = this.modules[hash] ? hash : 'apps';
        this.showCategory(category);
    }

    showCategory(category) {
        if (!this.modules[category]) {
            console.error(`Unknown category: ${category}`);
            return;
        }

        this.currentCategory = category;
        
        // Update URL hash
        window.location.hash = category;
        
        // Update core category info
        this.core.updateCategory(category);
        
        // Render the category content
        this.modules[category].render();
        
        // Focus management
        this.manageFocus();
    }

    navigatePrevious() {
        const categories = Object.keys(this.modules);
        const currentIndex = categories.indexOf(this.currentCategory);
        const previousIndex = currentIndex > 0 ? currentIndex - 1 : categories.length - 1;
        this.showCategory(categories[previousIndex]);
    }

    navigateNext() {
        const categories = Object.keys(this.modules);
        const currentIndex = categories.indexOf(this.currentCategory);
        const nextIndex = currentIndex < categories.length - 1 ? currentIndex + 1 : 0;
        this.showCategory(categories[nextIndex]);
    }

    focusSearch() {
        // Create or focus search input
        let searchInput = document.getElementById('settings-search');
        if (!searchInput) {
            searchInput = document.createElement('input');
            searchInput.id = 'settings-search';
            searchInput.type = 'text';
            searchInput.placeholder = 'Search settings...';
            searchInput.className = 'form-input';
            searchInput.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 300px; z-index: 1000;';
            
            searchInput.addEventListener('input', (e) => {
                this.performSearch(e.target.value);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.remove();
                }
            });
            
            document.body.appendChild(searchInput);
        }
        
        searchInput.focus();
        searchInput.select();
    }

    performSearch(query) {
        if (!query) {
            this.modules[this.currentCategory].render();
            return;
        }

        const results = this.searchSettings(query.toLowerCase());
        this.displaySearchResults(results, query);
    }

    searchSettings(query) {
        const results = [];
        
        // Search in current category
        const module = this.modules[this.currentCategory];
        if (module && module.search) {
            results.push(...module.search(query));
        }
        
        // Search in all categories if needed
        Object.entries(this.modules).forEach(([category, mod]) => {
            if (category !== this.currentCategory && mod.search) {
                const categoryResults = mod.search(query);
                results.push(...categoryResults.map(result => ({ ...result, category })));
            }
        });
        
        return results;
    }

    displaySearchResults(results, query) {
        const content = document.getElementById('settings-content');
        
        if (results.length === 0) {
            content.innerHTML = `
                <div class="text-center" style="padding: 60px 20px;">
                    <i class="fas fa-search" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 16px;"></i>
                    <h3>No results found</h3>
                    <p class="text-secondary">No settings match "${query}"</p>
                </div>
            `;
            return;
        }

        const resultsHtml = results.map(result => `
            <div class="list-item" onclick="SettingsManager.navigateToResult('${result.category}', '${result.action}')">
                <div class="list-item-content">
                    <div class="list-item-title">${result.title}</div>
                    <div class="list-item-description">${result.description}</div>
                    <div class="text-secondary" style="font-size: 12px;">Category: ${result.category}</div>
                </div>
                <div class="list-item-actions">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="mb-4">
                <h3>Search Results</h3>
                <p class="text-secondary">${results.length} results for "${query}"</p>
            </div>
            ${resultsHtml}
        `;
    }

    navigateToResult(category, action) {
        this.showCategory(category);
        
        // Remove search input
        const searchInput = document.getElementById('settings-search');
        if (searchInput) {
            searchInput.remove();
        }
        
        // Execute action if available
        setTimeout(() => {
            if (this.modules[category] && this.modules[category][action]) {
                this.modules[category][action]();
            }
        }, 100);
    }

    syncSettings() {
        // Sync settings with parent window
        if (this.core.wm && this.core.wm.syncSettings) {
            this.core.wm.syncSettings();
        }
    }

    handleResize() {
        // Adjust layout for different screen sizes
        const width = window.innerWidth;
        const sidebar = document.querySelector('.sidebar');
        
        if (width < 768) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    manageFocus() {
        // Set appropriate focus after category change
        const firstInput = document.querySelector('.form-input, .form-select, .btn');
        if (firstInput) {
            firstInput.focus();
        }
    }

    closeSettings() {
        // Close settings window
        if (window.parent && window.parent.closeWindow) {
            window.parent.closeWindow('settings');
        } else if (window.close) {
            window.close();
        }
    }

    // Utility methods
    exportAllSettings() {
        const exportData = {
            timestamp: new Date().toISOString(),
            version: this.core.wm?.sysVersion || 'AetherOS v3.0',
            settings: this.core.settings,
            system: this.core.getSystemInfo?.() || {}
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aether-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.core.showNotification('Settings', 'All settings exported successfully', 'success');
    }

    importSettings(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                
                if (importData.settings) {
                    this.core.settings = { ...this.core.settings, ...importData.settings };
                    this.core.saveSettings();
                    this.core.showNotification('Settings', 'Settings imported successfully', 'success');
                    
                    // Refresh current view
                    this.showCategory(this.currentCategory);
                } else {
                    throw new Error('Invalid settings file format');
                }
            } catch (error) {
                this.core.showNotification('Settings', 'Failed to import settings: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    resetAllSettings() {
        if (!confirm('Reset all settings to default values? This action cannot be undone.')) {
            return;
        }
        
        if (!confirm('This will reset all your preferences, customizations, and settings. Are you sure?')) {
            return;
        }
        
        // Clear settings and reload
        localStorage.removeItem('aether_settings');
        this.core.settings = this.core.loadSettings();
        this.core.saveSettings();
        
        this.core.showNotification('Settings', 'All settings have been reset to defaults', 'info');
        this.showCategory(this.currentCategory);
    }

    // Module-specific helpers
    getModule(category) {
        return this.modules[category];
    }

    getCurrentModule() {
        return this.modules[this.currentCategory];
    }

    refreshCurrentCategory() {
        this.modules[this.currentCategory].render();
    }

    // Statistics and diagnostics
    getSettingsStats() {
        const stats = {
            totalSettings: Object.keys(this.core.settings).length,
            categories: Object.keys(this.modules).length,
            lastModified: new Date().toISOString(),
            storageUsage: JSON.stringify(this.core.settings).length
        };
        
        return stats;
    }

    validateSettings() {
        const issues = [];
        
        // Check for invalid settings
        if (!this.core.settings.theme || !['light', 'dark', 'auto'].includes(this.core.settings.theme)) {
            issues.push('Invalid theme setting');
        }
        
        if (!this.core.settings.security || !['low', 'normal', 'high', 'strict'].includes(this.core.settings.security.level)) {
            issues.push('Invalid security level');
        }
        
        return issues;
    }

    repairSettings() {
        const issues = this.validateSettings();
        
        if (issues.length === 0) {
            this.core.showNotification('Settings', 'No issues found in settings', 'success');
            return;
        }
        
        // Fix common issues
        if (!this.core.settings.theme || !['light', 'dark', 'auto'].includes(this.core.settings.theme)) {
            this.core.settings.theme = 'light';
        }
        
        if (!this.core.settings.security || !['low', 'normal', 'high', 'strict'].includes(this.core.settings.security.level)) {
            this.core.settings.security = { level: 'normal' };
        }
        
        this.core.saveSettings();
        this.core.showNotification('Settings', `Repaired ${issues.length} setting issues`, 'success');
        this.refreshCurrentCategory();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.SettingsManager = new SettingsManager();
    
    // Add global keyboard shortcut for settings
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            // Settings should already be open, but we can focus it
            if (window.SettingsManager) {
                window.SettingsManager.focusSearch();
            }
        }
    });
});

// Export for global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsManager;
}
