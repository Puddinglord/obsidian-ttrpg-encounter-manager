#!/bin/bash
# tag.sh - Create a release tag and push to GitHub
# Usage: ./tag.sh 1.0.0

if [ -z "$1" ]; then
    echo "Usage: ./tag.sh <version>"
    echo "Example: ./tag.sh 1.0.0"
    exit 1
fi

VERSION=$1

# Build the plugin
echo "Building..."
npm run build

if [ $? -ne 0 ]; then
    echo "✗ Build failed"
    exit 1
fi

# Stage and commit
git add -A
git commit -m "Release $VERSION"

# Create and push tag
git tag "$VERSION"
git push origin main
git push origin "$VERSION"

echo ""
echo "✓ Tagged and pushed $VERSION"
echo "→ GitHub Actions will create the release automatically"
