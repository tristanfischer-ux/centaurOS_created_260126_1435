# EXACT Steps to Add Models to Cursor (Ollama + Kimi 2.5)

## ⚠️ IMPORTANT: Use Cursor's GUI

Cursor requires models to be added through its Settings interface. You cannot just edit a config file.

## 📋 Part 1: Add Local Ollama Models

**Prerequisite:** Ensure Ollama is running (`ollama serve`).

### Step 1: Open Settings
1. Press `Cmd + ,` (Command + Comma)
2. Go to **"Models"** section

### Step 2: Add Your Local Models
For each model below, click **"Add Model"** and enter these EXACT details:

#### Model 1: Qwen Coder (Fast & Good)
- **Name:** `qwen2.5-coder:7b`
- **Override OpenAI Base URL:** ✅ (Checked)
- **Base URL:** `https://poikiloblastic-nonemendable-roxann.ngrok-free.dev/v1`
- **API Key:** `ollama`

#### Model 2: Qwen 14B (Powerful)
- **Name:** `qwen2.5:14b-instruct-q4_K_M`
- **Override OpenAI Base URL:** ✅ (Checked)
- **Base URL:** `https://poikiloblastic-nonemendable-roxann.ngrok-free.dev/v1`
- **API Key:** `ollama`

#### Model 3: DeepSeek Coder
- **Name:** `deepseek-coder:6.7b`
- **Override OpenAI Base URL:** ✅ (Checked)
- **Base URL:** `https://poikiloblastic-nonemendable-roxann.ngrok-free.dev/v1`
- **API Key:** `ollama`

> **Note:** The ngrok URL tunnels to your local Ollama. If ngrok restarts, you'll get a new URL and need to update these settings.

---

## 📋 Part 2: Add Kimi 2.5 (Moonshot AI)

Kimi 2.5 is a large model that runs best via API. You have two options:

### Option A: Via OpenRouter (Recommended for "Kimi 2.5")
*Best if you want the specific "Kimi 2.5" version.*

1. Get an API key from [openrouter.ai](https://openrouter.ai)
2. In Cursor Settings > Models, click **"Add Model"**:
   - **Name:** `moonshotai/kimi-k2.5`
   - **Override OpenAI Base URL:** ✅ (Checked)
   - **Base URL:** `https://openrouter.ai/api/v1`
   - **API Key:** `sk-or-v1-...` (Your OpenRouter Key)

### Option B: Via Official Moonshot API
*Best if you have a direct Moonshot account.*

1. Get an API key from [platform.moonshot.ai](https://platform.moonshot.ai)
2. In Cursor Settings > Models, click **"Add Model"**:
   - **Name:** `moonshot-v1-32k` (or `moonshot-v1-128k`)
   - **Override OpenAI Base URL:** ✅ (Checked)
   - **Base URL:** `https://api.moonshot.cn/v1`
   - **API Key:** `sk-...` (Your Moonshot Key)

---

## ✅ Verification
1. Open Chat (`Cmd + L`)
2. Click the model dropdown at the top
3. Select your new model (e.g., `qwen2.5-coder:7b` or `moonshotai/kimi-k2.5`)
4. Send a test message like "Hello"

## 🆘 Troubleshooting
- **"Verify" fails for Local:** Check if `http://localhost:11434/v1/models` works in your browser.
- **"Verify" fails for Kimi:** Check your API key and ensure you have credits.
