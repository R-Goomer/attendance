#!/bin/bash
# Simple HTTP server for local development
# Run this file to start the development server

cd "$(dirname "$0")"

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    echo "Starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop"
    python3 -m http.server 8000
# Fallback to Python 2
elif command -v python &> /dev/null; then
    echo "Starting server on http://localhost:8000"
    echo "Press Ctrl+C to stop"
    python -m SimpleHTTPServer 8000
else
    echo "Python not found. Please install Python or start a server manually."
    exit 1
fi
