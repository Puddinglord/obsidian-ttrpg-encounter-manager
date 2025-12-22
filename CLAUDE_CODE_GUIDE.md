# Nimble Statblocks - Claude Code Development Guide

This guide explains how to work with this Obsidian plugin project, including setup, development, and build processes.

## Project Overview

This is an Obsidian plugin built with TypeScript. It provides TTRPG (Tabletop RPG) statblock rendering and an encounter tracker for the Nimble TTRPG system.

## Project Structure

```
nimble-statblocks/
├── main.ts              # Main plugin source code (TypeScript)
├── styles.css           # Plugin styles
├── manifest.json        # Obsidian plugin manifest
├── package.json         # Node.js dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── main.js              # Compiled output (generated)
└── node_modules/        # Dependencies (generated)
```

## Initial Setup

When first cloning or setting up the project:

```bash
# Navigate to project directory
cd nimble-statblocks

# Install dependencies
npm install
```

## Development Workflow

### Making Changes

1. Edit the source files:
   - `main.ts` - Plugin logic, views, settings
   - `styles.css` - All styling
   - `manifest.json` - Plugin metadata, version

2. Build the plugin:
   ```bash
   npm run build
   ```

3. The build process compiles `main.ts` → `main.js`

### Build Commands

```bash
# Production build (minified)
npm run build

# Development build with watch mode (rebuilds on file changes)
npm run dev
```

## Installing in Obsidian

### Method 1: Direct Copy (Development)

Copy these three files to your Obsidian vault's plugin folder:

```
<vault>/.obsidian/plugins/nimble-statblocks/
├── main.js
├── manifest.json
└── styles.css
```

Then reload Obsidian or disable/enable the plugin.

### Method 2: Create Distribution Zip

To create a distributable zip file:

```bash
# Create output directory and copy built files
mkdir -p dist/nimble-statblocks
cp main.js manifest.json styles.css dist/nimble-statblocks/

# Create zip
cd dist
zip -r nimble-statblocks.zip nimble-statblocks

# Clean up
rm -rf nimble-statblocks
```

The resulting `nimble-statblocks.zip` can be:
- Extracted directly into `<vault>/.obsidian/plugins/`
- Shared for others to install

## Key Files Explained

### main.ts
The entire plugin logic in one file:
- **Types/Interfaces** (lines 1-110): Data structures for monsters, encounters, conditions
- **EncounterTrackerView** (lines 115-700): The sidebar panel for managing encounters
- **Statblock Renderers** (lines 700-1400): Functions that render monster stat blocks
- **Settings Tab** (lines 1420-1580): Plugin settings UI including custom conditions
- **Plugin Class** (lines 1600-end): Main plugin initialization and commands

### styles.css
All CSS for:
- Statblock appearance (`.nimble-statblock`)
- Encounter tracker panel (`.nimble-encounter-tracker`)
- Condition picker (`.condition-picker`)
- Settings UI (`.custom-condition-*`)

### manifest.json
```json
{
  "id": "nimble-statblocks",
  "name": "Nimble Statblocks",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "author": "Your Name",
  "description": "Create Nimble TTRPG statblocks and track encounters"
}
```

Update `version` when releasing new versions.

## Common Development Tasks

### Adding a New Setting

1. Add to `NimbleStatblocksSettings` interface
2. Add default value to `DEFAULT_SETTINGS`
3. Add UI in `NimbleSettingsTab.display()`
4. Use setting value where needed

### Adding a New Condition (Built-in)

Add to the `NIMBLE_CONDITIONS` array near the top of `main.ts`:

```typescript
{ name: 'ConditionName', description: 'What it does.' },
```

### Modifying Statblock Rendering

- Regular monsters: `renderRegularStatblock()` and `renderInlineRegular()`
- Solo monsters: `renderSoloStatblock()` and `renderInlineSolo()`

### Adding New Badge Types

1. Create SVG string constant
2. Add badge rendering logic in the header section
3. Add CSS for `.stat-badge.your-badge` class

## Testing Changes

1. Build: `npm run build`
2. Copy `main.js`, `styles.css`, `manifest.json` to test vault
3. Reload Obsidian (Ctrl/Cmd + R) or toggle plugin off/on
4. Test the changes

## Troubleshooting

### Build Errors
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Clean rebuild
rm -rf node_modules
npm install
npm run build
```

### Plugin Not Loading
- Check Obsidian console (Ctrl+Shift+I) for errors
- Verify all three files are in the plugin folder
- Ensure plugin is enabled in Obsidian settings

### Styles Not Applying
- Hard reload Obsidian (Ctrl+Shift+R)
- Check CSS selector specificity
- Verify styles.css is in plugin folder

## Release Checklist

1. Update version in `manifest.json`
2. Update version in `package.json`
3. Run `npm run build`
4. Test thoroughly in Obsidian
5. Create zip with `main.js`, `manifest.json`, `styles.css`
6. Create GitHub release with zip attached

## Dependencies

From `package.json`:
- `@types/node` - Node.js type definitions
- `esbuild` - Fast bundler/compiler
- `obsidian` - Obsidian API types
- `typescript` - TypeScript compiler

These are all dev dependencies - the built plugin has no runtime dependencies.
