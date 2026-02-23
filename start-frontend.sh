#!/bin/bash

# DisputeAI - Frontend Startup Script

set -e

echo "=========================================="
echo "  DisputeAI - Starting Frontend"
echo "=========================================="
echo ""

cd "$(dirname "$0")/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo ""
echo "Starting frontend development server..."
echo "Frontend will be available at: http://localhost:3000"
echo ""

npx vite --host --port 3000
