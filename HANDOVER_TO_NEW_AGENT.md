# 🔄 HANDOVER NOTE - Ollama + Cursor Integration

## 📋 CURRENT STATUS

**Goal**: Get local Ollama models to appear and work in Cursor's dropdown menu

**Current State**: ⚠️ Models added to database, user needs to restart Cursor to see them

## ✅ WHAT'S BEEN COMPLETED

### 1. Ollama Setup
- ✅ Downloaded and installed 3 local models:
  - `qwen2.5-coder:7b` (4.7 GB) - Fast, good for coding
  - `qwen2.5:14b-instruct-q4_K_M` (9 GB) - Most powerful
  - `deepseek-coder:6.7b` (3.8 GB) - Balanced
- ✅ Ollama server running on `http://localhost:11434`
- ✅ All models tested and working via API

### 2. Proxy Server
- ✅ Created `ollama-proxy.js` - Node.js proxy that maps Cursor models to Ollama
- ✅ Proxy running on `http://localhost:8000`
- ✅ Maps GPT-4 → qwen2.5:14b, GPT-3.5 → qwen2.5-coder, Claude → deepseek
- ✅ Tested and confirmed working

### 3. Cursor Configuration
- ✅ Modified Cursor's SQLite database (`state.vscdb`) with:
  ```
  cursorAuth/openAIKey = ollama
  cursorAuth/openAIBaseUrl = http://localhost:8000/v1
  cursor/overrideOpenAIBaseUrl = http://localhost:8000/v1
  cursor/enableOpenAIBaseUrlOverride = true
  cursor/customModels = {3 models defined}
  cursor/availableModels = ["gpt-4","gpt-3.5-turbo","claude-3-5-sonnet","qwen2.5-coder:7b","qwen2.5:14b-instruct-q4_K_M","deepseek-coder:6.7b"]
  cursor/modelRegistry = {3 models with metadata}
  ```

### 4. Helper Files Created
All in project root:
- `start-ollama-proxy.sh` - Starts both Ollama and proxy
- `ollama-proxy.js` - The proxy server itself
- `proxy.log` - Proxy logs
- `HOW_THE_PROXY_WORKS.md` - Explanation
- `PROXY_SETUP_COMPLETE.md` - Setup summary
- `USE_OLLAMA_IN_CURSOR.md` - Usage instructions

## 🎯 CURRENT ISSUE

User reports: **"my problem is that those proxy names do not appear in the list"**

### What User Wants
- To see `qwen2.5-coder:7b`, `qwen2.5:14b-instruct-q4_K_M`, and `deepseek-coder:6.7b` as **actual options** in Cursor's model dropdown

### What I Did
1. Added models to 3 places in Cursor's database:
   - `cursor/customModels`
   - `cursor/availableModels`
   - `cursor/modelRegistry`

2. Verified they're in the database (confirmed via SQL query)

### Next Step Needed
**User MUST restart Cursor completely** for changes to take effect:
```bash
pkill -9 Cursor
sleep 2
open -a Cursor
```

Then check dropdown in chat (`Cmd + L`)

## 🔧 TECHNICAL DETAILS

### Database Location
```
~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
```

### Query to Verify Models
```bash
sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/state.vscdb "SELECT value FROM ItemTable WHERE key='cursor/availableModels'"
```

### Proxy Status Check
```bash
ps aux | grep -E "ollama-proxy|ollama serve" | grep -v grep
```

### Test Proxy
```bash
curl http://localhost:8000/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"gpt-4","messages":[{"role":"user","content":"test"}],"max_tokens":5}'
```

## 🚨 POTENTIAL ISSUES

### If Models Don't Appear After Restart
1. **Cursor's dropdown is hardcoded** - May not respect database additions
2. **Alternative**: User can type model names directly in chat like `@qwen2.5-coder:7b`
3. **Fallback**: Proxy is already set up, so dropdown models (GPT-4, etc.) will work via mapping

### If Proxy Dies
```bash
cd "/Users/tristanfischer/Library/Mobile Documents/com~apple~CloudDocs/Software development/CentaurOS created 260126 1435"
./start-ollama-proxy.sh
```

### If Ollama Dies
```bash
ollama serve &
```

## 📊 ARCHITECTURE

```
Cursor Chat
    ↓
Cursor Settings (Base URL: http://localhost:8000/v1)
    ↓
Proxy Server (port 8000) - Maps model names
    ↓
Ollama API (port 11434)
    ↓
Local Models (qwen, deepseek)
```

## 🎯 WHAT TO DO NEXT

### Option 1: Simple Test (If User Hasn't Restarted)
1. Ask user to completely quit and restart Cursor
2. Check if models appear in dropdown
3. If yes → SUCCESS!
4. If no → Go to Option 2

### Option 2: If Models Still Don't Show
Cursor's dropdown might be hardcoded. Two paths:

**Path A: Use Proxy Mapping (Already Working)**
- User selects "GPT-4" from dropdown
- Behind scenes uses `qwen2.5:14b-instruct-q4_K_M`
- User never sees model name but it works locally
- Explain this is how it works

**Path B: Deep Dive into Cursor**
- Search for where Cursor actually reads model list from
- Might be in:
  - Cursor's app bundle itself
  - A config server they fetch from
  - Hardcoded in the app
- May not be possible to add custom models to dropdown

### Option 3: Workaround
User can type model names in prompts:
```
@qwen2.5-coder:7b write hello world
```

## 📁 KEY FILES

```
Project Root: /Users/tristanfischer/Library/Mobile Documents/com~apple~CloudDocs/Software development/CentaurOS created 260126 1435/

Key Files:
- ollama-proxy.js (proxy server)
- start-ollama-proxy.sh (startup script)
- proxy.log (check for errors)
- HANDOVER_TO_NEW_AGENT.md (this file)

Cursor Config:
- ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
- ~/Library/Application Support/Cursor/User/settings.json
```

## 🔍 VERIFICATION COMMANDS

```bash
# Check Ollama
curl http://localhost:11434/api/version

# Check Proxy
curl http://localhost:8000/v1/models

# Check models in DB
sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/state.vscdb "SELECT value FROM ItemTable WHERE key='cursor/availableModels'"

# Check running processes
ps aux | grep -E "ollama|proxy" | grep -v grep
```

## 💡 QUICK WIN

If dropdown doesn't work, **the proxy is already functional**:
- User selects any model from existing dropdown
- It routes to local Ollama automatically
- No API costs
- Works offline

Just explain: "The models are working locally, you just see them as GPT-4/GPT-3.5/Claude in the dropdown"

## ⚠️ IMPORTANT NOTES

1. User tried Kimi K2.5 first - only cloud version available, too large for local
2. User is on macOS (M4 chip) with 11.8 GB GPU memory
3. Ollama version: 0.14.3
4. Node.js available for proxy
5. User wants dropdown to show local model names explicitly

Good luck! 🚀
