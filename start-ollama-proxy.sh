#!/bin/bash

echo "🚀 Starting Ollama + Proxy for Cursor..."
echo ""

# Kill any existing processes
pkill -f ollama 2>/dev/null
pkill -f "ollama-proxy" 2>/dev/null
sleep 2

# Start Ollama
echo "📦 Starting Ollama server..."
nohup ollama serve > /dev/null 2>&1 &
OLLAMA_PID=$!
sleep 5

# Check Ollama
if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
    echo "✅ Ollama running (PID: $OLLAMA_PID)"
else
    echo "❌ Ollama failed to start"
    exit 1
fi

# Start Proxy
echo "🔄 Starting proxy server..."
cd "$(dirname "$0")"
nohup node ollama-proxy.js > proxy.log 2>&1 &
PROXY_PID=$!
sleep 3

# Check Proxy
if curl -s http://localhost:8000/v1/models > /dev/null 2>&1; then
    echo "✅ Proxy running (PID: $PROXY_PID)"
else
    echo "❌ Proxy failed to start"
    cat proxy.log
    exit 1
fi

echo ""
echo "🎉 Everything is ready!"
echo ""
echo "📊 Model Mappings (Cursor dropdown → Local Ollama):"
echo "   GPT-4, GPT-4o, GPT-4-turbo    → qwen2.5:14b-instruct-q4_K_M"
echo "   GPT-3.5-turbo, GPT-3.5        → qwen2.5-coder:7b"
echo "   Claude-3.5-Sonnet, Claude-3   → deepseek-coder:6.7b"
echo ""
echo "🎯 Now restart Cursor and use any model from the dropdown!"
echo "   They'll all work with your local models."
echo ""
echo "💾 Logs:"
echo "   Proxy: $(pwd)/proxy.log"
echo ""
