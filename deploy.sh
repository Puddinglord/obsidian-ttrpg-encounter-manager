#!/bin/bash
# deploy.sh - Build and deploy to Obsidian vault for testing

VAULT_PLUGIN_DIR="$HOME/Documents/DevVault/.obsidian/plugins/nimble-gm"

# Build
echo "Building..."
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
    # Copy to the vault, with Hot Reload installed so Obsidian picks the build up by itself
    node scripts/dev-vault.mjs "$HOME/Documents/DevVault" --once
    echo ""
    echo "✓ Deployed to $VAULT_PLUGIN_DIR (Hot Reload reloads it in Obsidian)"
    echo "→ For live rebuilds while you edit: npm run dev:vault"
else
    echo ""
    echo "✗ Build failed"
    exit 1
fi
