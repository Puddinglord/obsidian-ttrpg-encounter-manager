#!/bin/bash
# tag.sh - Create a release tag and push to GitHub
# Usage: ./tag.sh 1.0.0

if [ -z "$1" ]; then
    echo "Usage: ./tag.sh <version>"
    echo "Example: ./tag.sh 1.0.0"
    exit 1
fi

VERSION=$1

MANIFEST_VERSION=$(node -p "require('./manifest.json').version")
if [ "$VERSION" != "$MANIFEST_VERSION" ]; then
    echo "manifest.json is at $MANIFEST_VERSION; bump it (and versions.json) to $VERSION first"
    exit 1
fi

# Stage and commit any changes
git add -A
git commit -m "Release $VERSION" || echo "Nothing to commit"

# Create and push tag
git tag "$VERSION"
git push origin main
git push origin "$VERSION"

echo ""
echo "✓ Tagged and pushed $VERSION"
echo "→ GitHub Actions will build and create the release automatically"
