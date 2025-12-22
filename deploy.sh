#!/bin/bash
# deploy.sh - Build and deploy to Obsidian vault for testing

VAULT_PLUGIN_DIR="$HOME/Documents/DevVault/.obsidian/plugins/nimble-statblocks"

# Build
echo "Building..."
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
    # Ensure plugin directory exists
    mkdir -p "$VAULT_PLUGIN_DIR"

    # Copy to vault
    cp main.js styles.css manifest.json "$VAULT_PLUGIN_DIR/"
    echo ""
    echo "✓ Deployed to $VAULT_PLUGIN_DIR"
    echo "→ Reload Obsidian (Cmd+R) or toggle the plugin to see changes"
else
    echo ""
    echo "✗ Build failed"
    exit 1
fi
