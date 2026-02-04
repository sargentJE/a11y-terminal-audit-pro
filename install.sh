#!/bin/bash
# install.sh - Install a11y-audit-pro as a global CLI command
# Usage: ./install.sh

set -e

echo "🔧 Installing A11Y Terminal Audit Pro..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "   Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Link globally
echo ""
echo "🔗 Creating global symlink..."
npm link

echo ""
echo "✅ Installation complete!"
echo ""
echo "You can now run the tool from anywhere using:"
echo "  $ a11y-audit-pro --url https://example.com --limit 5"
echo ""
echo "For help, run:"
echo "  $ a11y-audit-pro --help"
echo ""
echo "To uninstall, run:"
echo "  $ npm unlink -g a11y-terminal-audit-pro"
