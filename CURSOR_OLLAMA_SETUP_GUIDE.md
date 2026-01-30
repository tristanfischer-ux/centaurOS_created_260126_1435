# Cursor + Ollama Local Models Setup Guide

## ✅ What's Been Configured

Three local AI models have been installed and configured:

1. **Qwen 2.5 Coder 7B** - Best for code generation
2. **Qwen 2.5 14B Instruct** - Most powerful, general purpose
3. **DeepSeek Coder 6.7B** - Fast code assistance

## 🔍 Where to Find Your Models in Cursor

### Method 1: Model Dropdown in Chat (Cmd+L)
1. Press `Cmd + L` to open Cursor Chat
2. Look at the **top of the chat panel**
3. Click the **model dropdown** (it should show the current model name)
4. Your local models should appear in the list

### Method 2: Settings → Models
1. Press `Cmd + ,` to open Settings
2. Search for "models" in the search bar
3. Look for "Cursor" or "AI" settings section
4. You should see options to add or select custom models

### Method 3: Cmd+K Inline Edit
1. Select some code
2. Press `Cmd + K`
3. Look for the model selector dropdown at the top
4. Your models should be listed there

## 🔧 If Models Don't Appear

### Option A: Manual Configuration via GUI
1. Open Cursor Settings (`Cmd + ,`)
2. Search for "API" or "Models"
3. Look for "Override OpenAI Base URL" or similar
4. Enter: `http://localhost:11434/v1`
5. For API Key, enter: `ollama` (any text works)

### Option B: Test Ollama API Directly
Run this command to verify Ollama is working:
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5-coder:7b",
  "prompt": "Hello",
  "stream": false
}'
```

### Option C: Restart Everything
1. Quit Cursor completely (`Cmd + Q`)
2. Restart Ollama:
   ```bash
   pkill ollama
   ollama serve &
   ```
3. Wait 5 seconds
4. Reopen Cursor

## 📊 Model Details

| Model | Size | Speed | Best For | Context |
|-------|------|-------|----------|---------|
| Qwen 2.5 Coder 7B | 4.7 GB | Fast | Code generation, debugging | 32K tokens |
| Qwen 2.5 14B Instruct | 9 GB | Medium | Complex tasks, reasoning | 32K tokens |
| DeepSeek Coder 6.7B | 3.8 GB | Fast | Quick code help | 16K tokens |

## 🧪 Testing Your Setup

1. Open Cursor Chat (`Cmd + L`)
2. Type: "Write a hello world in Python"
3. If using local models, you should see responses WITHOUT consuming API credits

## ⚙️ Configuration Files

Your settings are stored in:
- **Settings**: `~/Library/Application Support/Cursor/User/settings.json`
- **Ollama Models**: `~/.ollama/models/`
- **Ollama Server**: Running on `http://localhost:11434`

## 🆘 Troubleshooting

**Models not showing up?**
- Make sure Ollama server is running (check Activity Monitor for "ollama")
- Try restarting Cursor
- Check if `http://localhost:11434` is accessible

**Slow responses?**
- Qwen 14B is largest and slowest
- Use Qwen 2.5 Coder 7B for faster responses
- First response is always slower (model loading)

**Need help?**
- Ollama status: `ollama list`
- Restart server: `pkill ollama && ollama serve &`
- Check logs: `~/Library/Logs/Ollama/`

## 🎯 Next Steps

1. **Restart Cursor** to load the new settings
2. **Open Chat** (`Cmd + L`) and look for model dropdown
3. **Select a local model** from the list
4. **Try it out** with a simple code generation task

---

**Server Status**: Ollama is currently running on port 11434
**Models Installed**: 3 local models ready to use
**Internet Required**: No - completely offline!
