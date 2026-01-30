# ⚡ SIMPLE Guide: Add Ollama Models to Cursor

## 🎯 The Problem
You need to access **Cursor Settings** (NOT VS Code Settings)

## ✅ SOLUTION - Follow These Exact Steps:

### STEP 1: Open Cursor Settings
Click the menu: **Cursor** → **Settings** → **Cursor Settings**

OR use keyboard:
- Press `Cmd + Shift + P` 
- Type "Cursor Settings"
- Select **"Cursor Settings"**

This opens a special Cursor settings panel (it's different from VS Code settings!)

### STEP 2: Look for Models Section
In the Cursor Settings panel, find the **"Models"** section

### STEP 3: Add Your Local Model

You should see options like:
- Model provider
- Override OpenAI Base URL
- API Key

Fill in:
```
Enable "Override OpenAI Base URL": ✓ (check this)
Base URL: http://localhost:11434/v1
API Key: ollama
```

### STEP 4: Click "Verify"
- This tests the connection
- You should see "✓ Success" or similar

### STEP 5: Save
- Save the settings
- Close and reopen Cursor

### STEP 6: Find Your Models
After reopening:
1. Press `Cmd + L` (open chat)
2. Look for model dropdown at top
3. Your models should appear!

---

## 🔧 If You Can't Find "Cursor Settings"

### Alternative Method:

1. Press `Cmd + Shift + J` to open Cursor Chat
2. Look at the **gear icon** ⚙️ in the chat panel
3. Click it - this might open model settings
4. Look for "Add Model" or "Override Base URL"

---

## ⚠️ IMPORTANT: Make Sure Ollama is Running!

Before all this, check Ollama is running:

```bash
# Check if running
ps aux | grep ollama | grep -v grep

# If not, start it:
ollama serve &

# Test it works:
curl http://localhost:11434/api/version
```

---

## 📊 What Models You Have

Once configured, you'll have:

1. **qwen2.5-coder:7b** - Fast, good for coding
2. **qwen2.5:14b-instruct-q4_K_M** - Most powerful
3. **deepseek-coder:6.7b** - Good balance

---

## 🆘 Still Can't Find It?

Try this:
1. Take a screenshot of your Cursor window
2. Look for any AI/Model settings
3. The setting might be under:
   - "General"
   - "Features"  
   - "Advanced"
   - "Models"

The exact location depends on your Cursor version.

---

## ✨ Once It Works

You'll know it's working when:
- ✅ You see model names in the dropdown
- ✅ Chat responds without using API credits
- ✅ No internet needed

**Your Ollama server is running on:** `http://localhost:11434`
**All 3 models are installed and ready!**
