#!/bin/bash

# Start Ollama Server for Cursor
echo "🚀 Starting Ollama server..."

# Kill any existing ollama processes
pkill ollama 2>/dev/null

# Wait a moment
sleep 2

# Start ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for it to start
sleep 5

# Test if it's working
echo "🧪 Testing Ollama API..."
if curl -s http://localhost:11434/api/version > /dev/null; then
    echo "✅ Ollama is running on http://localhost:11434"
    echo "✅ PID: $OLLAMA_PID"
    echo ""
    echo "📋 Available models:"
    ollama list
    echo ""
    echo "🎯 Now open Cursor and configure:"
    echo "   1. Go to: Cursor → Settings → Cursor Settings"
    echo "   2. Find Models section"
    echo "   3. Enable 'Override OpenAI Base URL'"
    echo "   4. Set Base URL: http://localhost:11434/v1"
    echo "   5. Set API Key: ollama"
    echo "   6. Click Verify"
    echo ""
    echo "💡 Your models will then appear in the model dropdown!"
else
    echo "❌ Ollama failed to start"
    exit 1
fi
