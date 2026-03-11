# AetherOS Settings System

A completely redesigned and rebuilt settings application for AetherOS, featuring a modern, modular, and scalable architecture.

## Features

### 🎨 Modern UI Design
- Clean, modern interface inspired by Windows 11, macOS System Settings, and ChromeOS
- Responsive layout with smooth animations and transitions
- Professional design with consistent visual language
- Dark/Light theme support with automatic switching

### 🧩 Modular Architecture
- **Core System**: Central settings management and persistence
- **Apps Module**: Startup apps, default apps, app management, and app store integration
- **Security Module**: Aether Security system with multiple protection levels
- **Personalization Module**: Themes, colors, wallpapers, and display settings
- **Accounts Module**: Cloud service integration (OneDrive, Google Drive, etc.)
- **Accessibility Module**: Comprehensive accessibility features
- **System Module**: Advanced system settings and diagnostics

### 🔒 Aether Security
- **Security Levels**: Low, Normal, High, Strict protection modes
- **App Verification**: Verified apps system from Aether Store
- **Security Scanning**: Automatic threat detection and warnings
- **Security Reports**: Comprehensive security status and recommendations

### 📱 Responsive Design
- Mobile-friendly interface
- Adaptive layouts for different screen sizes
- Touch-friendly controls
- Keyboard navigation support

### ⚡ Performance
- Lazy loading of modules
- Optimized rendering
- Efficient state management
- Minimal memory footprint

## Architecture

```
apps/settings/
├── settings.html              # Main settings interface
├── settings.css               # Complete styling system
├── settings.js                # Main controller and navigation
├── modules/
│   ├── settings-core.js       # Core functionality and utilities
│   ├── apps.js                # Apps management
│   ├── personalization.js     # Themes and personalization
│   ├── security.js            # Aether Security system
│   ├── accounts.js            # Cloud accounts integration
│   ├── accessibility.js       # Accessibility features
│   └── system.js              # System settings and diagnostics
└── README.md                  # This file
```

## Usage

### Navigation
- **Sidebar Navigation**: Click on categories in the left sidebar
- **Keyboard Shortcuts**:
  - `Alt + ←` / `Alt + →`: Navigate between categories
  - `Ctrl/Cmd + ,`: Focus search
  - `Ctrl/Cmd + F`: Search settings
  - `Escape`: Close settings

### Search
- Use `Ctrl/Cmd + ,` or `Ctrl/Cmd + F` to open search
- Search across all settings categories
- Navigate directly to found settings

### Settings Persistence
- All settings are automatically saved to localStorage
- Settings are synced with the main window manager
- Export/import functionality for backup and restore

## Modules

### Apps Management
- **Startup Apps**: Configure applications that launch on system startup
- **Default Apps**: Set default applications for file types
- **App Management**: Install, update, and uninstall applications
- **App Store Integration**: Browse and install verified apps

### Personalization
- **Themes**: Light, Dark, and Auto themes with scheduling
- **Colors**: 8 accent colors plus custom color picker
- **Wallpapers**: Built-in wallpapers plus custom image upload
- **Display**: UI scaling, font size, taskbar position
- **Effects**: Animations, transparency, visual effects

### Security (Aether Security)
- **Protection Levels**: 4-tier security system
- **App Verification**: Verified apps from Aether Store
- **Security Settings**: Warnings, auto-scan, network protection
- **Security Reports**: Comprehensive security analysis

### Accounts & Cloud
- **Cloud Services**: OneDrive, Google Drive, Dropbox, iCloud
- **Sync Settings**: Configure data synchronization
- **Account Security**: 2FA, login alerts, device management

### Accessibility
- **Visual**: High contrast, large text, screen reader, color filters
- **Hearing**: Closed captions, visual alerts, mono audio
- **Interaction**: Keyboard navigation, sticky keys, reduced motion
- **Cognitive**: Focus assist, simple interface, reading mode

### System
- **System Info**: Version, platform, performance monitoring
- **Performance**: Performance modes, optimization settings
- **Storage**: Storage analysis and cleanup tools
- **Updates**: System updates and maintenance
- **Advanced**: Developer mode, experimental features

## API Reference

### Core API
```javascript
// Get settings
const settings = SettingsCore.settings;

// Save settings
SettingsCore.saveSettings();

// Show notification
SettingsCore.showNotification(title, message, type);

// Apply theme
SettingsCore.applyTheme();
```

### Module API
Each module follows a consistent API:
```javascript
// Render module content
ModuleName.render();

// Search within module
ModuleName.search(query);

// Module-specific actions
ModuleName.actionName();
```

## Customization

### Adding New Modules
1. Create new module file in `modules/` directory
2. Follow the established module pattern
3. Register module in `settings.js`
4. Add navigation item to `settings.html`

### Styling
- Uses CSS custom properties for theming
- Component-based CSS architecture
- Responsive grid system
- Consistent spacing and typography scales

### Settings Schema
Settings are stored in a structured format:
```javascript
{
  theme: 'light|dark|auto',
  accentColor: '#0078d4',
  security: {
    level: 'low|normal|high|strict',
    verifiedApps: [],
    warnings: true
  },
  personalization: {
    wallpaper: 'default|custom',
    uiScale: 100,
    animations: true
  },
  // ... other categories
}
```

## Browser Support

- Modern browsers with ES6+ support
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Development

### Building
The settings system is built with vanilla JavaScript and requires no build process.

### Testing
- Manual testing in target browsers
- Responsive design testing
- Accessibility testing
- Performance testing

### Contributing
1. Follow the established code patterns
2. Maintain consistent styling
3. Test across different screen sizes
4. Ensure accessibility compliance

## Migration from Old Settings

The old settings system has been backed up as `settings-old.html`. To migrate:
1. User preferences are automatically migrated
2. Custom settings are preserved
3. New features are available immediately

## License

Part of the AetherOS project. See main project license for details.

---

**AetherOS Settings v3.0** - Modern, Modular, Scalable
