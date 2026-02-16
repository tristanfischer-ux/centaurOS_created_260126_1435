#!/bin/bash

# Start Ollama Server with Latest Qwen3 Models
# Mac Studio M2 Ultra (192GB) — can run up to qwen3:235b-a22b at Q4
# Mac Studio M2 Max  (96GB)  — can run up to qwen3:32b at Q8 or qwen3:30b-a3b
# Mac Studio M2 Max  (64GB)  — can run qwen3:32b at Q4 or qwen3:14b at Q8

echo "============================================"
echo "  ForgeOS — Ollama + Qwen3 Model Launcher"
echo "============================================"
echo ""

# Kill any existing ollama processes
pkill ollama 2>/dev/null
sleep 2

# Start ollama in background
echo "Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!
sleep 5

# Test if it's working
if ! curl -s http://localhost:11434/api/version > /dev/null; then
    echo "ERROR: Ollama failed to start"
    exit 1
fi

echo "Ollama running (PID: $OLLAMA_PID)"
echo ""

# ── Check which Qwen3 models are installed ─────────────────────────────

echo "Checking installed models..."
INSTALLED=$(ollama list 2>/dev/null)
echo "$INSTALLED"
echo ""

# ── Pull latest Qwen3 models if not present ────────────────────────────

# Qwen3 30B-A3B: Best value for Mac Studio — 30B MoE, only 3B active
# Extremely fast inference, great for specialist agents
if ! echo "$INSTALLED" | grep -q "qwen3:30b-a3b"; then
    echo "Pulling qwen3:30b-a3b (MoE, 3B active — blazing fast)..."
    ollama pull qwen3:30b-a3b
fi

# Qwen3 32B: Dense model, best reasoning quality that fits in 64GB
if ! echo "$INSTALLED" | grep -q "qwen3:32b"; then
    echo "Pulling qwen3:32b (dense, strongest reasoning at this size)..."
    ollama pull qwen3:32b
fi

# Qwen3 8B: Lightweight, fast for quick tasks
if ! echo "$INSTALLED" | grep -q "qwen3:8b"; then
    echo "Pulling qwen3:8b (fast, good for quick code tasks)..."
    ollama pull qwen3:8b
fi

# Qwen3 235B-A22B: Only if you have 192GB+ RAM (Mac Studio Ultra)
# This is the full open-weight MoE — closest to Qwen3.5-plus quality
TOTAL_RAM_GB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1073741824)}')
if [ "$TOTAL_RAM_GB" -ge 180 ] 2>/dev/null; then
    if ! echo "$INSTALLED" | grep -q "qwen3:235b-a22b"; then
        echo ""
        echo "192GB+ RAM detected — pulling qwen3:235b-a22b (frontier MoE)..."
        echo "This is the full open-weight MoE model. ~140GB download."
        ollama pull qwen3:235b-a22b
    fi
fi

echo ""
echo "============================================"
echo "  Models Ready"
echo "============================================"
ollama list
echo ""
echo "Recommended model by task:"
echo "  Coding + architecture:   qwen3:32b"
echo "  Fast specialist chat:    qwen3:30b-a3b"
echo "  Quick tasks:             qwen3:8b"
if [ "$TOTAL_RAM_GB" -ge 180 ] 2>/dev/null; then
echo "  Frontier reasoning:      qwen3:235b-a22b"
fi
echo ""
echo "Ollama API: http://localhost:11434"
echo "OpenAI-compat: http://localhost:11434/v1"
echo ""
echo "To use in Cursor: set Base URL to http://localhost:11434/v1"
echo "To use in ForgeOS: set OLLAMA_BASE_URL=http://localhost:11434/v1"
