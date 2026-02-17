#!/bin/bash

echo "============================================"
echo "  ForgeOS — Ollama + Qwen3 Proxy for Cursor"
echo "============================================"
echo ""

# Kill any existing processes
pkill -f ollama 2>/dev/null
sleep 2

# Start Ollama
echo "Starting Ollama server..."
nohup ollama serve > /dev/null 2>&1 &
OLLAMA_PID=$!
sleep 5

# Check Ollama
if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
    echo "Ollama running (PID: $OLLAMA_PID)"
else
    echo "ERROR: Ollama failed to start"
    exit 1
fi

echo ""
echo "============================================"
echo "  Available Qwen3 Models"
echo "============================================"
ollama list 2>/dev/null | grep -E "qwen3|NAME"
echo ""
echo "Cursor Configuration:"
echo "  Base URL: http://localhost:11434/v1"
echo "  API Key:  ollama"
echo ""
echo "Recommended Cursor model names:"
echo "  qwen3:30b-a3b  — MoE, fastest (specialist agents)"
echo "  qwen3:32b      — Dense, best reasoning"
echo "  qwen3:8b       — Lightweight, quick tasks"
echo ""
echo "To upgrade from Qwen 2.5:"
echo "  ollama pull qwen3:30b-a3b"
echo "  ollama pull qwen3:32b"
echo "  ollama pull qwen3:8b"
echo ""
echo "Optional (requires 192GB+ RAM):"
echo "  ollama pull qwen3:235b-a22b"
echo ""
