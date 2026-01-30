# EXACT Steps to Add Ollama Models to Cursor

## ⚠️ IMPORTANT: Use Cursor's GUI, Not Just Config Files

Cursor requires models to be added through its Settings interface.

## 📋 Step-by-Step Instructions

### STEP 1: Open Cursor Settings
1. Press `Cmd + ,` (Command + Comma)
2. OR: Click **Cursor** menu → **Settings**

### STEP 2: Navigate to Models Section
1. In the left sidebar, look for **"Models"**
2. OR: Use the search bar at the top and type "models"
3. Click on the **"Models"** section

### STEP 3: Add First Model (Qwen Coder)
1. Click the **"Add Model"** button (or **"+"** button)
2. Fill in these EXACT values:

```
Model Name: qwen2.5-coder:7b
Display Name: Qwen Coder 7B (Local)
```

3. **Enable "Override OpenAI Base URL"** checkbox
4. Enter Base URL: `http://localhost:11434/v1`
5. Enter API Key: `ollama` (can be anything, Ollama doesn't need real keys)
6. Click **"Verify"** button to test
7. Click **"Save"** or **"Add"**

### STEP 4: Add Second Model (Qwen 14B)
1. Click **"Add Model"** again
2. Fill in:

```
Model Name: qwen2.5:14b-instruct-q4_K_M
Display Name: Qwen 14B Instruct (Local)
Base URL: http://localhost:11434/v1
API Key: ollama
```

3. Click **"Verify"** then **"Save"**

### STEP 5: Add Third Model (DeepSeek)
1. Click **"Add Model"** again
2. Fill in:

```
Model Name: deepseek-coder:6.7b
Display Name: DeepSeek Coder (Local)
Base URL: http://localhost:11434/v1
API Key: ollama
```

3. Click **"Verify"** then **"Save"**

## 🎯 Where to Find Your Models After Adding

### In Chat (Cmd+L)
1. Press `Cmd + L` to open Cursor Chat
2. Look at the **top of the chat panel**
3. You'll see a **dropdown with model names**
4. Click it to see all your models
5. Select "Qwen Coder 7B (Local)" or any other

### In Cmd+K (Inline)
1. Select code in editor
2. Press `Cmd + K`
3. Model dropdown appears at top of popup
4. Select your local model

## ✅ How to Know It's Working

When using a local model:
- ✅ No API usage/cost displayed
- ✅ Faster initial response (local)
- ✅ Works without internet

## 🔧 If "Verify" Fails

### Check 1: Is Ollama Running?
```bash
# Check if running
ps aux | grep ollama | grep -v grep

# If not running, start it:
ollama serve
```

### Check 2: Test Ollama API Manually
```bash
curl http://localhost:11434/v1/models
```

Should return list of models. If it fails, restart Ollama.

### Check 3: Correct Base URL
Make sure you're using:
- ✅ `http://localhost:11434/v1` (with /v1 at end)
- ❌ NOT `http://localhost:11434` (missing /v1)

## 🆘 Alternative: Override Base URL Globally

If adding individual models doesn't work, try this:

1. Go to Settings > Models
2. Find **"Override OpenAI Base URL"** (global setting)
3. Enable it
4. Enter: `http://localhost:11434/v1`
5. Enter API Key: `ollama`
6. Click Verify

Now Cursor will use Ollama for ALL requests.

⚠️ **Warning**: This will route ALL model requests to Ollama, including Claude/GPT-4 if you select them.

## 📊 Your Available Models

Once configured, you'll have access to:

| Model Name | Click to Select This |
|------------|---------------------|
| Qwen Coder 7B (Local) | Best for code, fastest |
| Qwen 14B Instruct (Local) | Most powerful, slower |
| DeepSeek Coder (Local) | Good balance |

## ⚡ Quick Test

After setup:
1. Open Chat (`Cmd + L`)
2. Select "Qwen Coder 7B (Local)" from dropdown
3. Type: "write hello world in python"
4. Press Enter
5. Should get response in 3-10 seconds

---

**Ollama Server Status**: Should be running on port 11434
**Models Downloaded**: 3 models ready
**Internet Required**: No (completely offline!)

## Need Help?

Run these commands to check status:
```bash
# Check Ollama status
ollama list

# Check if API is responding
curl http://localhost:11434/api/version

# View Ollama logs
tail -f ~/Library/Logs/Ollama/server.log
```
