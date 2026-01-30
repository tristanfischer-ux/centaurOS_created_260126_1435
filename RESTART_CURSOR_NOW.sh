#!/bin/bash

echo "🔧 Configuration has been added to Cursor's database!"
echo ""
echo "📊 Current settings:"
sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/state.vscdb "SELECT key, value FROM ItemTable WHERE key LIKE '%openAI%' OR key LIKE '%override%'"
echo ""
echo "🔄 Now restarting Cursor..."
echo ""

# Kill Cursor
pkill -f "Cursor" 2>/dev/null
sleep 2

# Reopen Cursor
open -a "Cursor"

echo "✅ Cursor is restarting..."
echo ""
echo "📝 After Cursor opens:"
echo "   1. Press Cmd+L to open chat"
echo "   2. Type a model name in the input:"
echo "      - qwen2.5-coder:7b"
echo "      - qwen2.5:14b-instruct-q4_K_M"
echo "      - deepseek-coder:6.7b"
echo "   3. The model should work without using API credits!"
echo ""
echo "💡 Your requests will go to: http://localhost:11434/v1"
