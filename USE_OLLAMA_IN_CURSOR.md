# ✅ How to Use Your Ollama Models in Cursor

## 🎯 IMPORTANT: The Models Won't Appear in the Dropdown

With the configuration I've set, ALL AI requests now go to Ollama at `http://localhost:11434/v1`.

## 📝 How to Use Your Models

### Method 1: Type Model Name in Chat (RECOMMENDED)

1. Press `Cmd + L` to open Cursor Chat
2. In the message box, **start your message with the model name:**

```
@qwen2.5-coder:7b write a hello world in python
```

Or:
```
@deepseek-coder:6.7b explain this code
```

Or:
```
@qwen2.5:14b-instruct-q4_K_M help me debug this
```

### Method 2: Use Model Names Directly

When chatting, you can reference models like this:

```
Use qwen2.5-coder:7b to write a function
```

## 🔧 Current Configuration

I've set Cursor to override the OpenAI Base URL:
- **Base URL**: `http://localhost:11434/v1`
- **API Key**: `ollama`
- **Override Enabled**: `true`

This means:
- ✅ ALL requests go to your local Ollama
- ✅ No API credits used
- ✅ Works offline
- ❌ Dropdown won't show Ollama models (they're not registered with Cursor)

## 🎨 Your Available Models

Type these model names in your prompts:

1. **qwen2.5-coder:7b** - Fast, good for coding (4.7 GB)
2. **qwen2.5:14b-instruct-q4_K_M** - Most powerful (9 GB)  
3. **deepseek-coder:6.7b** - Good balance (3.8 GB)

## 🧪 Test It Now

1. Open Cursor Chat (`Cmd + L`)
2. Type: `@qwen2.5-coder:7b say hello`
3. Press Enter
4. Should respond using your local model!

## 🆘 If It's Not Working

Check Ollama is running:
```bash
curl http://localhost:11434/api/version
```

Should return: `{"version":"0.14.3"}`

If not, restart Ollama:
```bash
./start-ollama.sh
```

## 💡 Alternative: Use Default Model Mapping

If you want to use the dropdown normally, I can configure Ollama to respond to "gpt-4" or "claude" requests by mapping them to your local models. Would you like me to set that up instead?
