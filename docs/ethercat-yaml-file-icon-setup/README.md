# EtherCAT File Icon Configuration Guide

This extension provides custom icon support for EtherCAT configuration files.

## Automatic Configuration (Recommended)

### Supported Icon Themes

The extension can automatically configure EtherCAT icons for the following themes:

- **Material Icon Theme** - Full support, automatically adds custom icons
- **VSCode Icons** - Full support, automatically adds custom icons
- **Other Themes** - Uses fallback (displays YAML icon)

### Demo

- Material Icon Theme
   ![material-icon-theme](https://github.com/user-attachments/assets/85bb60db-040c-409b-a3b8-8d0bf87c7ba9)

- VSCode Icons
   ![vscode-icons](https://github.com/user-attachments/assets/56219ffa-fe12-4812-b4cc-76c69fa47c2b)

### Quick Start

1. **Install an icon theme** (if you haven't already):
   - Recommended: [Material Icon Theme](https://marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme)
   - Or: [VSCode Icons](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons)

2. **Run the configuration command**:
   - Open Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: `Configure EtherCAT File Icon`
   - Press Enter

3. **Verify the result**:
   - Open any EtherCAT configuration file
   - You should see the EtherCAT custom icon in the file explorer immediately

## How It Works

### Material Icon Theme

The extension automatically:

1. Locates the Material Icon Theme installation directory
2. Copies the icon file (`icon-nobg.png`) to the theme's `icons/` directory
3. Modifies `dist/material-icons.json` to add icon definition
4. Adds language association: `ethercat-yaml` → `_ethercat`

**Configuration file locations**:

```bash
~/.vscode/extensions/pkief.material-icon-theme-*/icons/ethercat.png
~/.vscode/extensions/pkief.material-icon-theme-*/dist/material-icons.json
```

### VSCode Icons

The extension automatically:

1. Locates the VSCode Icons installation directory
2. Copies the icon file to the theme's `icons/` directory (named `file_type_ethercat.png`)
3. Modifies `vsicons-icon-theme.json` to add icon definition
4. Adds language association: `ethercat-yaml` → `_file_type_ethercat`

**Configuration file locations**:

```bash
~/.vscode/extensions/vscode-icons-team.vscode-icons-*/icons/file_type_ethercat.png
~/.vscode/extensions/vscode-icons-team.vscode-icons-*/dist/src/vsicons-icon-theme.json
```

### Fallback Solution

If automatic configuration fails (e.g., theme directory not found or unable to write files), the extension will:

- Automatically use language association to link `ethercat-yaml` to the `yaml` icon
- Display an informational message
- EtherCAT files will display the YAML icon (instead of the custom icon)

## Important Notes

### Theme Updates

**Issue**: EtherCAT icon may disappear after icon theme updates

**Reason**: Theme updates overwrite configuration files

**Solution**:

- Re-run the configuration command: `Configure EtherCAT File Icon`
- Takes only a few seconds to restore

### Permission Issues

**Issue**: Unable to write to theme directory

**Solutions**:

1. Run VS Code with administrator privileges
2. Or accept the fallback solution (use YAML icon)

### File Recognition

**Important**: Only files correctly recognized as `ethercat-yaml` language will display the custom icon.

**How to check**:

- Open an EtherCAT configuration file
- Check the status bar in the bottom right corner
- Should display "EtherCAT Task Config" or "EtherCAT YAML"

**If it shows "YAML"**:

- File is not recognized as EtherCAT configuration
- Extension automatically detects YAML files containing `slaves:` and `tasks:` structure
- May need to edit file content to trigger re-detection

## Troubleshooting

### Icon Not Displaying

**Symptom**: Icon still not displaying or showing as blank after configuration

**Troubleshooting steps**:

1. **Check file language**
   - Bottom right should show "EtherCAT Task Config"
   - If it shows "YAML", file is not recognized

2. **Check icon file**

   ```bash
   # Material Icon Theme
   ls -la ~/.vscode/extensions/pkief.material-icon-theme-*/icons/ethercat.png
   
   # VSCode Icons
   ls -la ~/.vscode/extensions/vscode-icons-team.vscode-icons-*/icons/file_type_ethercat.png
   ```

3. **Check configuration file**

   ```bash
   # Material Icon Theme
   cat ~/.vscode/extensions/pkief.material-icon-theme-*/dist/material-icons.json | grep ethercat
   
   # VSCode Icons
   cat ~/.vscode/extensions/vscode-icons-team.vscode-icons-*/dist/src/vsicons-icon-theme.json | grep ethercat
   ```

4. **Check Developer Tools**
   - Help → Toggle Developer Tools
   - Check Console for errors

5. **Re-run configuration**
   - `Cmd+Shift+P` → "Configure EtherCAT File Icon"

### Configuration Failed

**Symptom**: Shows "Could not find ... installation directory"

**Reasons**:

- Theme not installed
- Theme installed in non-standard location
- Theme version incompatible

**Solutions**:

1. Confirm icon theme is installed and enabled
2. Check theme version (recommend using latest version)
3. Accept fallback solution (use YAML icon)

### Permission Errors

**Symptom**: Shows "Failed to configure ... permission denied"

**Solutions**:

1. **Mac/Linux**:

   ```bash
   sudo code
   ```

   Then re-run the configuration command

2. **Windows**:
   - Right-click VS Code icon
   - Select "Run as administrator"
   - Re-run the configuration command

3. **Or use fallback solution**:
   - Extension will automatically switch to fallback
   - Uses YAML icon

## Manual Configuration

If automatic configuration doesn't work, you can configure manually:

### For Material Icon Theme

Add to VS Code settings (`settings.json`):

```json
{
  "material-icon-theme.languages.associations": {
    "ethercat-yaml": "yaml"
  }
}
```

### For VSCode Icons

Add to VS Code settings (`settings.json`):

```json
{
  "vsicons.associations.files": {
    ".ethercat.yaml": "yaml",
    ".ethercat.yml": "yaml"
  }
}
```

### For Other Themes

Please refer to your icon theme's documentation for how to add language associations or custom icons.

## Uninstallation

To remove EtherCAT icon configuration:

1. **Delete icon files** (optional):

   ```bash
   # Material Icon Theme
   rm ~/.vscode/extensions/pkief.material-icon-theme-*/icons/ethercat.png
   
   # VSCode Icons
   rm ~/.vscode/extensions/vscode-icons-team.vscode-icons-*/icons/file_type_ethercat.png
   ```

2. **Remove configuration**:
   - Open VS Code settings (`Cmd+,`)
   - Search for the theme's association settings
   - Delete `ethercat-yaml` related entries

## Tips

- **First time use**: Recommend using Material Icon Theme for highest success rate
- **After theme updates**: Remember to re-run the configuration command
- **Multiple computers**: Each computer needs to be configured separately
- **Team collaboration**: Recommend team uses the same icon theme

## Getting Help

If you encounter issues:

1. Check the Troubleshooting section in this document
2. Check the extension's [GitHub Issues](https://github.com/your-repo/issues)
3. Submit a new Issue with:
   - Icon theme and version you're using
   - Error messages or screenshots
   - VS Code version
   - Operating system

## Related Resources

- [Material Icon Theme Documentation](https://github.com/PKief/vscode-material-icon-theme)
- [VSCode Icons Documentation](https://github.com/vscode-icons/vscode-icons)
- [VS Code Icon Theme API](https://code.visualstudio.com/api/extension-guides/file-icon-theme)
