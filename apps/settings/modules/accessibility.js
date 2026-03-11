/**
 * Accessibility Module
 * Handles accessibility features and assistive technologies
 */

class AccessibilityManager {
    constructor() {
        this.core = window.SettingsCore;
        this.accessibilityFeatures = {
            visual: {
                highContrast: {
                    name: 'High Contrast',
                    description: 'Increase contrast for better visibility',
                    icon: 'fas fa-adjust',
                    category: 'visual'
                },
                largeText: {
                    name: 'Large Text',
                    description: 'Make text larger and easier to read',
                    icon: 'fas fa-text-height',
                    category: 'visual'
                },
                screenReader: {
                    name: 'Screen Reader',
                    description: 'Read text aloud for visual assistance',
                    icon: 'fas fa-volume-up',
                    category: 'visual'
                },
                colorBlind: {
                    name: 'Color Blind Filters',
                    description: 'Adjust colors for color vision deficiency',
                    icon: 'fas fa-eye',
                    category: 'visual'
                },
                magnifier: {
                    name: 'Screen Magnifier',
                    description: 'Enlarge portions of the screen',
                    icon: 'fas fa-search-plus',
                    category: 'visual'
                }
            },
            hearing: {
                captions: {
                    name: 'Closed Captions',
                    description: 'Show captions for audio and video content',
                    icon: 'fas fa-closed-captioning',
                    category: 'hearing'
                },
                visualAlerts: {
                    name: 'Visual Alerts',
                    description: 'Visual notifications for system sounds',
                    icon: 'fas fa-bell',
                    category: 'hearing'
                },
                monoAudio: {
                    name: 'Mono Audio',
                    description: 'Combine stereo channels into one',
                    icon: 'fas fa-headphones',
                    category: 'hearing'
                }
            },
            interaction: {
                keyboardNavigation: {
                    name: 'Keyboard Navigation',
                    description: 'Navigate interface using keyboard only',
                    icon: 'fas fa-keyboard',
                    category: 'interaction'
                },
                stickyKeys: {
                    name: 'Sticky Keys',
                    description: 'Press modifier keys one at a time',
                    icon: 'fas fa-sticky-note',
                    category: 'interaction'
                },
                mouseKeys: {
                    name: 'Mouse Keys',
                    description: 'Control mouse with numeric keypad',
                    icon: 'fas fa-mouse-pointer',
                    category: 'interaction'
                },
                reducedMotion: {
                    name: 'Reduced Motion',
                    description: 'Minimize animations and transitions',
                    icon: 'fas fa-pause',
                    category: 'interaction'
                }
            },
            cognitive: {
                focusAssist: {
                    name: 'Focus Assist',
                    description: 'Reduce distractions and improve focus',
                    icon: 'fas fa-brain',
                    category: 'cognitive'
                },
                simpleInterface: {
                    name: 'Simple Interface',
                    description: 'Use a simplified desktop layout',
                    icon: 'fas fa-th-large',
                    category: 'cognitive'
                },
                readingMode: {
                    name: 'Reading Mode',
                    description: 'Optimize display for reading text',
                    icon: 'fas fa-book-reader',
                    category: 'cognitive'
                }
            }
        };
    }

    render() {
        const content = document.getElementById('settings-content');
        content.innerHTML = '';

        // Quick Settings Section
        const quickCard = this.createQuickSettingsCard();
        content.appendChild(quickCard);

        // Visual Accessibility Section
        const visualCard = this.createVisualAccessibilityCard();
        content.appendChild(visualCard);

        // Hearing Accessibility Section
        const hearingCard = this.createHearingAccessibilityCard();
        content.appendChild(hearingCard);

        // Interaction Accessibility Section
        const interactionCard = this.createInteractionAccessibilityCard();
        content.appendChild(interactionCard);

        // Cognitive Accessibility Section
        const cognitiveCard = this.createCognitiveAccessibilityCard();
        content.appendChild(cognitiveCard);

        // Advanced Settings Section
        const advancedCard = this.createAdvancedSettingsCard();
        content.appendChild(advancedCard);
    }

    createQuickSettingsCard() {
        const accessibility = this.core.settings.accessibility || {};
        
        const content = `
            <div class="mb-4">
                <h3>Quick Settings</h3>
                <p class="text-secondary">Common accessibility features</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="settings-card">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-text-height" style="color: var(--primary); font-size: 20px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">Text Size</div>
                            <div class="text-secondary" style="font-size: 12px;">Adjust text size</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <select id="quick-text-size" class="form-select" onchange="AccessibilityManager.updateTextSize(this.value)">
                            <option value="small">Small</option>
                            <option value="normal" ${!accessibility.textSize || accessibility.textSize === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="large" ${accessibility.textSize === 'large' ? 'selected' : ''}>Large</option>
                            <option value="extra-large" ${accessibility.textSize === 'extra-large' ? 'selected' : ''}>Extra Large</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-card">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-search-plus" style="color: var(--primary); font-size: 20px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">Display Scale</div>
                            <div class="text-secondary" style="font-size: 12px;">Scale interface</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <select id="quick-display-scale" class="form-select" onchange="AccessibilityManager.updateDisplayScale(this.value)">
                            <option value="100">100%</option>
                            <option value="125" ${accessibility.displayScale === 125 ? 'selected' : ''}>125%</option>
                            <option value="150" ${accessibility.displayScale === 150 ? 'selected' : ''}>150%</option>
                            <option value="175" ${accessibility.displayScale === 175 ? 'selected' : ''}>175%</option>
                            <option value="200" ${accessibility.displayScale === 200 ? 'selected' : ''}>200%</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-card">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-adjust" style="color: var(--primary); font-size: 20px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">High Contrast</div>
                            <div class="text-secondary" style="font-size: 12px;">Increase contrast</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        ${this.core.createToggle('quick-high-contrast', accessibility.highContrast, '')}
                    </div>
                </div>
                
                <div class="settings-card">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-pause" style="color: var(--primary); font-size: 20px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">Reduce Motion</div>
                            <div class="text-secondary" style="font-size: 12px;">Minimize animations</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        ${this.core.createToggle('quick-reduced-motion', accessibility.reducedMotion, '')}
                    </div>
                </div>
            </div>
        `;

        return this.core.createCard('Quick Settings', 'Common accessibility options', content, 'fas fa-magic');
    }

    createVisualAccessibilityCard() {
        const visualFeatures = Object.values(this.accessibilityFeatures.visual);
        const accessibility = this.core.settings.accessibility || {};
        
        const featuresHtml = visualFeatures.map(feature => {
            const isEnabled = accessibility[feature.name.toLowerCase().replace(/\s+/g, '')];
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="${feature.icon}" style="margin-right: 8px;"></i>
                            ${feature.name}
                        </div>
                        <div class="list-item-description">${feature.description}</div>
                    </div>
                    <div class="list-item-actions">
                        ${this.core.createToggle(`visual-${feature.name.toLowerCase().replace(/\s+/g, '')}`, isEnabled, '')}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Visual Accessibility</h3>
                <p class="text-secondary">Features to help with visual impairments</p>
            </div>
            
            ${featuresHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Color Filters', 'AccessibilityManager.openColorFilters()', 'btn-secondary', 'fas fa-filter')}
                ${this.core.createButton('Magnifier Settings', 'AccessibilityManager.openMagnifierSettings()', 'btn-secondary', 'fas fa-search-plus')}
            </div>
        `;

        return this.core.createCard('Visual', 'Visual accessibility features', content, 'fas fa-eye');
    }

    createHearingAccessibilityCard() {
        const hearingFeatures = Object.values(this.accessibilityFeatures.hearing);
        const accessibility = this.core.settings.accessibility || {};
        
        const featuresHtml = hearingFeatures.map(feature => {
            const isEnabled = accessibility[feature.name.toLowerCase().replace(/\s+/g, '')];
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="${feature.icon}" style="margin-right: 8px;"></i>
                            ${feature.name}
                        </div>
                        <div class="list-item-description">${feature.description}</div>
                    </div>
                    <div class="list-item-actions">
                        ${this.core.createToggle(`hearing-${feature.name.toLowerCase().replace(/\s+/g, '')}`, isEnabled, '')}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Hearing Accessibility</h3>
                <p class="text-secondary">Features to help with hearing impairments</p>
            </div>
            
            ${featuresHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Audio Settings', 'AccessibilityManager.openAudioSettings()', 'btn-secondary', 'fas fa-volume-up')}
                ${this.core.createButton('Notification Settings', 'AccessibilityManager.openNotificationSettings()', 'btn-secondary', 'fas fa-bell')}
            </div>
        `;

        return this.core.createCard('Hearing', 'Hearing accessibility features', content, 'fas fa-deaf');
    }

    createInteractionAccessibilityCard() {
        const interactionFeatures = Object.values(this.accessibilityFeatures.interaction);
        const accessibility = this.core.settings.accessibility || {};
        
        const featuresHtml = interactionFeatures.map(feature => {
            const isEnabled = accessibility[feature.name.toLowerCase().replace(/\s+/g, '')];
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="${feature.icon}" style="margin-right: 8px;"></i>
                            ${feature.name}
                        </div>
                        <div class="list-item-description">${feature.description}</div>
                    </div>
                    <div class="list-item-actions">
                        ${this.core.createToggle(`interaction-${feature.name.toLowerCase().replace(/\s+/g, '')}`, isEnabled, '')}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Interaction Accessibility</h3>
                <p class="text-secondary">Features to help with motor impairments</p>
            </div>
            
            ${featuresHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Keyboard Settings', 'AccessibilityManager.openKeyboardSettings()', 'btn-secondary', 'fas fa-keyboard')}
                ${this.core.createButton('Mouse Settings', 'AccessibilityManager.openMouseSettings()', 'btn-secondary', 'fas fa-mouse-pointer')}
            </div>
        `;

        return this.core.createCard('Interaction', 'Interaction accessibility features', content, 'fas fa-hand-pointer');
    }

    createCognitiveAccessibilityCard() {
        const cognitiveFeatures = Object.values(this.accessibilityFeatures.cognitive);
        const accessibility = this.core.settings.accessibility || {};
        
        const featuresHtml = cognitiveFeatures.map(feature => {
            const isEnabled = accessibility[feature.name.toLowerCase().replace(/\s+/g, '')];
            return `
                <div class="list-item">
                    <div class="list-item-content">
                        <div class="list-item-title">
                            <i class="${feature.icon}" style="margin-right: 8px;"></i>
                            ${feature.name}
                        </div>
                        <div class="list-item-description">${feature.description}</div>
                    </div>
                    <div class="list-item-actions">
                        ${this.core.createToggle(`cognitive-${feature.name.toLowerCase().replace(/\s+/g, '')}`, isEnabled, '')}
                    </div>
                </div>
            `;
        }).join('');

        const content = `
            <div class="mb-4">
                <h3>Cognitive Accessibility</h3>
                <p class="text-secondary">Features to help with cognitive impairments</p>
            </div>
            
            ${featuresHtml}
            
            <div class="mt-4">
                ${this.core.createButton('Focus Settings', 'AccessibilityManager.openFocusSettings()', 'btn-secondary', 'fas fa-brain')}
                ${this.core.createButton('Reading Preferences', 'AccessibilityManager.openReadingPreferences()', 'btn-secondary', 'fas fa-book-reader')}
            </div>
        `;

        return this.core.createCard('Cognitive', 'Cognitive accessibility features', content, 'fas fa-brain');
    }

    createAdvancedSettingsCard() {
        const accessibility = this.core.settings.accessibility || {};
        
        const content = `
            <div class="mb-4">
                <h3>Advanced Settings</h3>
                <p class="text-secondary">Fine-tune accessibility features</p>
            </div>
            
            <div class="form-group">
                <label class="form-label">Screen Reader Voice</label>
                <select id="screen-reader-voice" class="form-select" onchange="AccessibilityManager.updateScreenReaderVoice(this.value)">
                    <option value="default">System Default</option>
                    <option value="female" ${accessibility.screenReaderVoice === 'female' ? 'selected' : ''}>Female</option>
                    <option value="male" ${accessibility.screenReaderVoice === 'male' ? 'selected' : ''}>Male</option>
                    <option value="child" ${accessibility.screenReaderVoice === 'child' ? 'selected' : ''}>Child</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Speech Rate</label>
                <div class="flex items-center gap-4">
                    <input type="range" id="speech-rate" min="50" max="200" value="${accessibility.speechRate || 100}" 
                           oninput="AccessibilityManager.updateSpeechRate(this.value)" 
                           style="flex: 1;">
                    <span id="speech-rate-value" style="min-width: 60px; text-align: center; font-weight: 600;">${accessibility.speechRate || 100}%</span>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Magnifier Level</label>
                <select id="magnifier-level" class="form-select" onchange="AccessibilityManager.updateMagnifierLevel(this.value)">
                    <option value="2" ${accessibility.magnifierLevel === 2 ? 'selected' : ''}>2x</option>
                    <option value="4" ${accessibility.magnifierLevel === 4 || !accessibility.magnifierLevel ? 'selected' : ''}>4x</option>
                    <option value="6" ${accessibility.magnifierLevel === 6 ? 'selected' : ''}>6x</option>
                    <option value="8" ${accessibility.magnifierLevel === 8 ? 'selected' : ''}>8x</option>
                    <option value="16" ${accessibility.magnifierLevel === 16 ? 'selected' : ''}>16x</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">
                    ${this.core.createToggle('accessibility-shortcuts', accessibility.shortcuts !== false, 'Accessibility Shortcuts')}
                </label>
                <div class="form-description">Enable keyboard shortcuts for accessibility features</div>
            </div>
            
            <div class="mt-4">
                <div class="p-3" style="background: var(--background-secondary); border-radius: 8px;">
                    <div style="font-weight: 600; margin-bottom: 8px;">Common Shortcuts:</div>
                    <div class="text-secondary" style="font-size: 12px;">
                        <div>• Alt + Shift + Print Screen: High Contrast</div>
                        <div>• Alt + Left Shift + Num Lock: Mouse Keys</div>
                        <div>• Shift x5: Sticky Keys</div>
                        <div>• Num Lock for 5 seconds: Toggle Keys</div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4">
                ${this.core.createButton('Reset All', 'AccessibilityManager.resetAllSettings()', 'btn-danger', 'fas fa-undo')}
                ${this.core.createButton('Export Settings', 'AccessibilityManager.exportSettings()', 'btn-secondary', 'fas fa-download')}
            </div>
        `;

        return this.core.createCard('Advanced', 'Advanced accessibility configuration', content, 'fas fa-cogs');
    }

    // Action methods
    updateTextSize(size) {
        const accessibility = this.core.settings.accessibility || {};
        accessibility.textSize = size;
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        
        const fontSizes = {
            small: '12px',
            normal: '14px',
            large: '16px',
            'extra-large': '18px'
        };
        
        document.documentElement.style.fontSize = fontSizes[size];
        this.core.showNotification('Accessibility', 'Text size updated', 'success');
    }

    updateDisplayScale(scale) {
        const accessibility = this.core.settings.accessibility || {};
        accessibility.displayScale = parseInt(scale);
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        
        document.body.style.transform = `scale(${scale / 100})`;
        document.body.style.transformOrigin = 'top left';
        this.core.showNotification('Accessibility', `Display scale set to ${scale}%`, 'success');
    }

    updateScreenReaderVoice(voice) {
        const accessibility = this.core.settings.accessibility || {};
        accessibility.screenReaderVoice = voice;
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        this.core.showNotification('Accessibility', 'Screen reader voice updated', 'success');
    }

    updateSpeechRate(rate) {
        document.getElementById('speech-rate-value').textContent = rate + '%';
        const accessibility = this.core.settings.accessibility || {};
        accessibility.speechRate = parseInt(rate);
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        this.core.showNotification('Accessibility', `Speech rate set to ${rate}%`, 'success');
    }

    updateMagnifierLevel(level) {
        const accessibility = this.core.settings.accessibility || {};
        accessibility.magnifierLevel = parseInt(level);
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        this.core.showNotification('Accessibility', `Magnifier level set to ${level}x`, 'success');
    }

    toggleFeature(category, featureName, enabled) {
        const accessibility = this.core.settings.accessibility || {};
        const key = featureName.toLowerCase().replace(/\s+/g, '');
        accessibility[key] = enabled;
        this.core.settings.accessibility = accessibility;
        this.core.saveSettings();
        
        // Apply specific feature changes
        this.applyFeatureChange(key, enabled);
        
        this.core.showNotification('Accessibility', `${featureName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    }

    applyFeatureChange(feature, enabled) {
        switch (feature) {
            case 'highcontrast':
                if (enabled) {
                    document.documentElement.classList.add('high-contrast');
                } else {
                    document.documentElement.classList.remove('high-contrast');
                }
                break;
            case 'reducedmotion':
                if (enabled) {
                    document.documentElement.style.setProperty('--transition-fast', '0s');
                    document.documentElement.style.setProperty('--transition-normal', '0s');
                    document.documentElement.style.setProperty('--transition-slow', '0s');
                } else {
                    document.documentElement.style.setProperty('--transition-fast', '150ms ease');
                    document.documentElement.style.setProperty('--transition-normal', '250ms ease');
                    document.documentElement.style.setProperty('--transition-slow', '350ms ease');
                }
                break;
            case 'keyboardnavigation':
                if (enabled) {
                    document.body.setAttribute('tabindex', '0');
                } else {
                    document.body.removeAttribute('tabindex');
                }
                break;
        }
    }

    openColorFilters() {
        this.core.showNotification('Accessibility', 'Color filters feature coming soon', 'info');
    }

    openMagnifierSettings() {
        this.core.showNotification('Accessibility', 'Magnifier settings feature coming soon', 'info');
    }

    openAudioSettings() {
        this.core.showNotification('Accessibility', 'Audio settings feature coming soon', 'info');
    }

    openNotificationSettings() {
        this.core.showNotification('Accessibility', 'Notification settings feature coming soon', 'info');
    }

    openKeyboardSettings() {
        this.core.showNotification('Accessibility', 'Keyboard settings feature coming soon', 'info');
    }

    openMouseSettings() {
        this.core.showNotification('Accessibility', 'Mouse settings feature coming soon', 'info');
    }

    openFocusSettings() {
        this.core.showNotification('Accessibility', 'Focus settings feature coming soon', 'info');
    }

    openReadingPreferences() {
        this.core.showNotification('Accessibility', 'Reading preferences feature coming soon', 'info');
    }

    resetAllSettings() {
        if (!confirm('Reset all accessibility settings to default?')) {
            return;
        }
        
        this.core.settings.accessibility = {};
        this.core.saveSettings();
        
        // Reset applied changes
        document.documentElement.classList.remove('high-contrast');
        document.documentElement.style.fontSize = '14px';
        document.body.style.transform = 'scale(1)';
        document.documentElement.style.setProperty('--transition-fast', '150ms ease');
        document.documentElement.style.setProperty('--transition-normal', '250ms ease');
        document.documentElement.style.setProperty('--transition-slow', '350ms ease');
        
        this.core.showNotification('Accessibility', 'All accessibility settings reset', 'info');
        this.render();
    }

    exportSettings() {
        const accessibilityData = {
            accessibility: this.core.settings.accessibility,
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(accessibilityData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accessibility-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.core.showNotification('Accessibility', 'Accessibility settings exported', 'success');
    }
}

// Global instance
window.AccessibilityManager = new AccessibilityManager();
