#!/bin/bash

echo "🔄 Restarting Cursor with Ollama models..."
echo ""

# Verify services are running
if ! ps aux | grep -q "[o]llama serve"; then
    echo "⚠️  Ollama not running, starting it..."
    nohup ollama serve > /dev/null 2>&1 &
    sleep 5
fi

if ! ps aux | grep -q "[o]llama-proxy.js"; then
    echo "⚠️  Proxy not running, starting it..."
    cd "$(dirname "$0")"
    nohup node ollama-proxy.js > proxy.log 2>&1 &
    sleep 3
fi

echo "✅ Ollama running: $(ps aux | grep '[o]llama serve' | awk '{print $2}')"
echo "✅ Proxy running: $(ps aux | grep '[o]llama-proxy' | awk '{print $2}')"
echo ""

# Kill Cursor
echo "🛑 Closing Cursor..."
pkill -f "Cursor" 2>/dev/null
sleep 3

# Reopen Cursor  
echo "🚀 Opening Cursor..."
open -a "Cursor"
sleep 2

echo ""
echo "✅ Cursor restarted!"
echo ""
echo "📋 What to try now:"
echo ""
echo "Method 1 - Check dropdown:"
echo "   1. Press Cmd+L (open chat)"
echo "   2. Look at model dropdown"
echo "   3. See if you can find:"
echo "      - qwen2.5-coder:7b"
echo "      - qwen2.5:14b-instruct-q4_K_M"
echo "      - deepseek-coder:6.7b"
echo ""
echo "Method 2 - Type model name:"
echo "   Type: @qwen2.5-coder:7b say hello"
echo ""
echo "Method 3 - Use dropdown with proxy:"
echo "   Select 'GPT-4' → Uses qwen2.5:14b locally"
echo "   Select 'GPT-3.5' → Uses qwen2.5-coder:7b locally"
echo ""
