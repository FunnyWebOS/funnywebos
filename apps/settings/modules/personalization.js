/**
 * Personalization Module
 * Handles themes, colors, wallpapers, and appearance settings
 */

class PersonalizationManager {
    constructor() {
        this.core = window.SettingsCore;
        this.themes = {
            light: {
                name: 'Light',
                description: 'Clean and bright interface',
                preview: 'linear-gradient(135deg, #ffffff 0%, #f3f2f1 100%)'
            },
            dark: {
                name: 'Dark',
                description: 'Easy on the eyes in low light',
                preview: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)'
            },
            auto: {
                name: 'Auto',
                description: 'Automatically switch based on time of day',
                preview: 'linear-gradient(135deg, #ffffff 0%, #0f0f0f 100%)'
            }
        };
        
        this.accentColors = [
            { name: 'Blue', value: '#0078d4', preview: '#0078d4' },
            { name: 'Green', value: '#107c10', preview: '#107c10' },
            { name: 'Orange', value: '#ff8c00', preview: '#ff8c00' },
            { name: 'Red', value: '#d13438', preview: '#d13438' },
            { name: 'Purple', value: '#8764b8', preview: '#8764b8' },
            { name: 'Teal', value: '#008272', preview: '#008272' },
            { name: 'Pink', value: '#e3008c', preview: '#e3008c' },
            { name: 'Yellow', value: '#ffb900', preview: '#ffb900' }
        ];
        
        this.wallpapers = [
            { id: 'default', name: 'Aether Default', preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
            { id: 'gradient', name: 'Blue Fusion', preview: 'linear-gradient(135deg, #12c2e9 0%, #c471ed 100%)' },
            { id: 'blue', name: 'Deep Space', preview: '#0f172a' },
            { id: 'dark', name: 'OLED Night', preview: '#020617' },
            { id: 'sunset', name: 'Sunset', preview: 'linear-gradient(135deg, #f64f59 0%, #12c2e9 100%)' },
            { id: 'forest', name: 'Forest', preview: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
            { id: 'ocean', name: 'Ocean', preview: 'linear-gradient(135deg, #2E3192 0%, #1bffff 100%)' },
            { id: 'custom', name: 'Custom', preview: 'url(custom)' }
        ];
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // Theme Section
        const themeCard = this.createThemeCard();
        content.appendChild(themeCard);

        // Colors Section
        const colorsCard = this.createColorsCard();
        content.appendChild(colorsCard);

        // Wallpaper Section
        const wallpaperCard = this.createWallpaperCard();
        content.appendChild(wallpaperCard);

        // Display Settings Section
        const displayCard = this.createDisplayCard();
        content.appendChild(displayCard);

        // Effects Section
        const effectsCard = this.createEffectsCard();
        content.appendChild(effectsCard);
    }

    createThemeCard() {
        const currentTheme = this.core.settings.theme || 'light';
        
        const themesHtml = Object.entries(this.themes).map(([key, theme]) => {
            const isActive = key === currentTheme;
            return `
                <div class="settings-card ${isActive ? 'active' : ''}" 
                     style="margin-bottom: 12px; cursor: pointer; border: ${isActive ? '2px solid var(--primary)' : '1px solid var(--border-primary)'}"
                     onclick="PersonalizationManager.setTheme('${key}')">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-lg" style="background: ${theme.preview}; border: 1px solid var(--border-primary);"></div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">${theme.name}</div>
                                <div class="text-secondary" style="font-size: 12px;">${theme.description}</div>
                            </div>
                        </div>
                        ${isActive ? '<i class="fas fa-check-circle" style="color: var(--success);"></i>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Theme</h3>
                <p class="text-secondary">Choose your preferred color scheme</p>
            </div>
            
            ${themesHtml}
            
            <div class="mt-4">
                <div class="form-group">
                    <label class="form-label">Theme Schedule</label>
                    <select id="theme-schedule" class="form-select" onchange="PersonalizationManager.updateThemeSchedule(this.value)">
                        <option value="none">No schedule</option>
                        <option value="sunset">Sunset to sunrise (Dark)</option>
                        <option value="custom">Custom schedule</option>
                    </select>
                </div>
            </div>
        `;

        return this.core.createCard('Theme Selection', 'Customize your visual experience', content, 'fas fa-palette');
    }

    createColorsCard() {
        const currentColor = this.core.settings.accentColor || '#0078d4';
        
        const colorsHtml = this.accentColors.map(color => {
            const isActive = color.value === currentColor;
            return `
                <div class="color-option ${isActive ? 'active' : ''}" 
                     style="width: 60px; height: 60px; border-radius: 12px; background: ${color.preview}; cursor: pointer; border: ${isActive ? '3px solid var(--text-primary)' : '2px solid var(--border-primary)'}; position: relative;"
                     onclick="PersonalizationManager.setAccentColor('${color.value}')"
                     title="${color.name}">
                    ${isActive ? '<i class="fas fa-check" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-shadow: 0 0 4px rgba(0,0,0,0.8);"></i>' : ''}
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Accent Color</h3>
                <p class="text-secondary">Choose an accent color for your interface</p>
            </div>
            
            <div class="flex gap-3 flex-wrap mb-4">
                ${colorsHtml}
            </div>
            
            <div class="form-group">
                <label class="form-label">Custom Color</label>
                <div class="flex gap-2">
                    <input type="color" id="custom-color" class="form-input" value="${currentColor}" style="width: 80px; height: 40px; padding: 4px;">
                    <input type="text" id="custom-color-hex" class="form-input" value="${currentColor}" placeholder="#000000" style="flex: 1;">
                    ${this.core.createButton('Apply', 'PersonalizationManager.applyCustomColor()', 'btn-primary')}
                </div>
            </div>
        `;

        return this.core.createCard('Colors', 'Personalize with your favorite colors', content, 'fas fa-paint-brush');
    }

    createWallpaperCard() {
        const currentWallpaper = this.core.settings.personalization?.wallpaper || 'default';
        const customWallpaper = this.core.settings.personalization?.customWallpaper;
        
        const wallpapersHtml = this.wallpapers.map(wallpaper => {
            const isActive = wallpaper.id === currentWallpaper;
            const previewStyle = wallpaper.id === 'custom' && customWallpaper ? 
                `url(${customWallpaper})` : wallpaper.preview;
            
            return `
                <div class="wallpaper-option ${isActive ? 'active' : ''}" 
                     style="width: 120px; height: 80px; border-radius: 8px; background: ${previewStyle}; background-size: cover; background-position: center; cursor: pointer; border: ${isActive ? '3px solid var(--primary)' : '2px solid var(--border-primary)'}; position: relative;"
                     onclick="PersonalizationManager.setWallpaper('${wallpaper.id}')"
                     title="${wallpaper.name}">
                    ${isActive ? '<i class="fas fa-check" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-shadow: 0 0 4px rgba(0,0,0,0.8);"></i>' : ''}
                    ${wallpaper.id === 'custom' ? '<div style="position: absolute; bottom: 4px; right: 4px; background: var(--background-overlay); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Custom</div>' : ''}
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Wallpaper</h3>
                <p class="text-secondary">Set your desktop background</p>
            </div>
            
            <div class="grid grid-cols-4 gap-3 mb-4">
                ${wallpapersHtml}
            </div>
            
            <div class="form-group">
                <label class="form-label">Custom Wallpaper</label>
                <div class="flex gap-2">
                    <input type="file" id="wallpaper-upload" accept="image/*" style="display: none;" onchange="PersonalizationManager.handleWallpaperUpload(event)">
                    ${this.core.createButton('Choose Image', 'document.getElementById(\'wallpaper-upload\').click()', 'btn-secondary', 'fas fa-upload')}
                    ${customWallpaper ? this.core.createButton('Clear Custom', 'PersonalizationManager.clearCustomWallpaper()', 'btn-ghost', 'fas fa-times') : ''}
                </div>
                ${customWallpaper ? `<div class="text-secondary mt-2" style="font-size: 12px;">Current: ${customWallpaper.split('/').pop()}</div>` : ''}
            </div>
            
            <div class="form-group">
                <label class="form-label">Wallpaper Fit</label>
                <select id="wallpaper-fit" class="form-select" onchange="PersonalizationManager.updateWallpaperFit(this.value)">
                    <option value="cover">Fill screen</option>
                    <option value="contain">Fit to screen</option>
                    <option value="center">Center</option>
                    <option value="repeat">Repeat</option>
                </select>
            </div>
        `;

        return this.core.createCard('Wallpaper', 'Customize your desktop background', content, 'fas fa-image');
    }

    createDisplayCard() {
        const uiScale = this.core.settings.personalization?.uiScale || 100;
        
        const content = `
            <div class="mb-4">
                <h3>Display Settings</h3>
                <p class="text-secondary">Adjust the appearance and size of interface elements</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">UI Scale</label>
                <div class="flex items-center gap-4">
                    <input type="range" id="ui-scale" min="80" max="150" value="${uiScale}" step="10" 
                           oninput="PersonalizationManager.updateUIScale(this.value)" 
                           style="flex: 1;">
                    <span id="ui-scale-value" style="min-width: 60px; text-align: center; font-weight: 600;">${uiScale}%</span>
                </div>
                <div class="form-description">Adjust the size of text, apps, and other items</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Font Size</label>
                <select id="font-size" class="form-select" onchange="PersonalizationManager.updateFontSize(this.value)">
                    <option value="small">Small</option>
                    <option value="normal" ${!this.core.settings.personalization?.fontSize || this.core.settings.personalization.fontSize === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="large">Large</option>
                    <option value="extra-large">Extra Large</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Taskbar Position</label>
                <select id="taskbar-position" class="form-select" onchange="PersonalizationManager.updateTaskbarPosition(this.value)">
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('transparency', this.core.settings.personalization?.transparency !== false, 'Window Transparency')}
                </label>
                <div class="form-description">Enable transparent window effects</div>
            </div>
        `;

        return this.core.createCard('Display', 'Configure display and scaling options', content, 'fas fa-desktop');
    }

    createEffectsCard() {
        const content = `
            <div class="mb-4">
                <h3>Visual Effects</h3>
                <p class="text-secondary">Customize animations and visual effects</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('animations', this.core.settings.personalization?.animations !== false, 'Animations')}
                </label>
                <div class="form-description">Show animations and transitions</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('shadows', this.core.settings.personalization?.shadows !== false, 'Window Shadows')}
                </label>
                <div class="form-description">Show shadows behind windows</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('blur', this.core.settings.personalization?.blur !== false, 'Background Blur')}
                </label>
                <div class="form-description">Apply blur effect to transparent areas</div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Animation Speed</label>
                <select id="animation-speed" class="form-select" onchange="PersonalizationManager.updateAnimationSpeed(this.value)">
                    <option value="slow">Slow</option>
                    <option value="normal" ${!this.core.settings.personalization?.animationSpeed || this.core.settings.personalization.animationSpeed === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="fast">Fast</option>
                    <option value="instant">Instant (No animations)</option>
                </select>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Reset to Default', 'PersonalizationManager.resetEffects()', 'btn-secondary', 'fas fa-undo')}
            </div>
        `;

        return this.core.createCard('Effects', 'Configure visual effects and animations', content, 'fas fa-magic');
    }

    // Action methods
    setTheme(theme) {
        this.core.setTheme(theme);
        this.core.showNotification('Personalization', `Theme changed to ${this.themes[theme].name}`, 'success');
        this.render();
    }

    setAccentColor(color) {
        this.core.setAccentColor(color);
        document.getElementById('custom-color').value = color;
        document.getElementById('custom-color-hex').value = color;
        this.core.showNotification('Personalization', 'Accent color updated', 'success');
        this.render();
    }

    applyCustomColor() {
        const hexColor = document.getElementById('custom-color-hex').value;
        const colorPicker = document.getElementById('custom-color').value;
        const color = hexColor || colorPicker;
        
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            this.setAccentColor(color);
        } else {
            this.core.showNotification('Personalization', 'Invalid color format', 'error');
        }
    }

    setWallpaper(wallpaperId) {
        if (wallpaperId === 'custom') {
            document.getElementById('wallpaper-upload').click();
            return;
        }

        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.wallpaper = wallpaperId;
        this.core.saveSettings();
        
        // Apply wallpaper to parent window
        if (this.core.wm && this.core.wm.setWallpaper) {
            this.core.wm.setWallpaper(wallpaperId);
        }
        
        this.core.showNotification('Personalization', `Wallpaper changed to ${this.wallpapers.find(w => w.id === wallpaperId)?.name}`, 'success');
        this.render();
    }

    handleWallpaperUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.core.showNotification('Personalization', 'Please select an image file', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            this.core.settings.personalization = this.core.settings.personalization || {};
            this.core.settings.personalization.wallpaper = 'custom';
            this.core.settings.personalization.customWallpaper = imageUrl;
            this.core.saveSettings();
            
            // Apply custom wallpaper
            if (this.core.wm && this.core.wm.setWallpaper) {
                this.core.wm.setWallpaper('custom');
            }
            
            this.core.showNotification('Personalization', 'Custom wallpaper uploaded', 'success');
            this.render();
        };
        reader.readAsDataURL(file);
    }

    clearCustomWallpaper() {
        this.core.settings.personalization = this.core.settings.personalization || {};
        delete this.core.settings.personalization.customWallpaper;
        this.core.settings.personalization.wallpaper = 'default';
        this.core.saveSettings();
        
        if (this.core.wm && this.core.wm.setWallpaper) {
            this.core.wm.setWallpaper('default');
        }
        
        this.core.showNotification('Personalization', 'Custom wallpaper removed', 'info');
        this.render();
    }

    updateUIScale(value) {
        document.getElementById('ui-scale-value').textContent = value + '%';
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.uiScale = parseInt(value);
        this.core.saveSettings();
        
        // Apply UI scale
        document.documentElement.style.setProperty('--ui-scale', value / 100);
        document.body.style.transform = `scale(${value / 100})`;
        document.body.style.transformOrigin = 'top left';
        
        this.core.showNotification('Personalization', `UI scale set to ${value}%`, 'success');
    }

    updateFontSize(size) {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.fontSize = size;
        this.core.saveSettings();
        
        const fontSizes = {
            small: '12px',
            normal: '14px',
            large: '16px',
            'extra-large': '18px'
        };
        
        document.documentElement.style.fontSize = fontSizes[size];
        this.core.showNotification('Personalization', 'Font size updated', 'success');
    }

    updateTaskbarPosition(position) {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.taskbarPosition = position;
        this.core.saveSettings();
        
        // Update taskbar position in parent window
        if (this.core.wm && this.core.wm.uiPreferences) {
            this.core.wm.uiPreferences.dockPosition = position === 'bottom' ? 'bottom' : position === 'left' ? 'left' : position === 'right' ? 'right' : 'top';
            this.core.wm.applyUIPreferences();
            this.core.wm.saveUserData();
        }
        
        this.core.showNotification('Personalization', 'Taskbar position updated', 'success');
    }

    updateThemeSchedule(schedule) {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.themeSchedule = schedule;
        this.core.saveSettings();
        
        if (schedule === 'sunset') {
            this.setupAutoTheme();
        }
        
        this.core.showNotification('Personalization', 'Theme schedule updated', 'success');
    }

    updateWallpaperFit(fit) {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.wallpaperFit = fit;
        this.core.saveSettings();
        
        this.core.showNotification('Personalization', 'Wallpaper fit updated', 'success');
    }

    updateAnimationSpeed(speed) {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.animationSpeed = speed;
        this.core.saveSettings();
        
        const speeds = {
            slow: { fast: '300ms', normal: '500ms', slow: '700ms' },
            normal: { fast: '150ms', normal: '250ms', slow: '350ms' },
            fast: { fast: '100ms', normal: '150ms', slow: '200ms' },
            instant: { fast: '0ms', normal: '0ms', slow: '0ms' }
        };
        
        const speedValues = speeds[speed];
        document.documentElement.style.setProperty('--transition-fast', speedValues.fast);
        document.documentElement.style.setProperty('--transition-normal', speedValues.normal);
        document.documentElement.style.setProperty('--transition-slow', speedValues.slow);
        
        this.core.showNotification('Personalization', 'Animation speed updated', 'success');
    }

    resetEffects() {
        this.core.settings.personalization = this.core.settings.personalization || {};
        this.core.settings.personalization.animations = true;
        this.core.settings.personalization.shadows = true;
        this.core.settings.personalization.blur = true;
        this.core.settings.personalization.animationSpeed = 'normal';
        this.core.saveSettings();
        
        this.core.showNotification('Personalization', 'Visual effects reset to default', 'info');
        this.render();
    }

    setupAutoTheme() {
        const now = new Date();
        const hour = now.getHours();
        
        // Simple sunset/sunrise logic (6 AM - 6 PM = light, otherwise dark)
        if (hour >= 6 && hour < 18) {
            this.setTheme('light');
        } else {
            this.setTheme('dark');
        }
        
        // Check every hour
        setTimeout(() => this.setupAutoTheme(), 3600000);
    }
}

// Global instance
window.PersonalizationManager = new PersonalizationManager();
