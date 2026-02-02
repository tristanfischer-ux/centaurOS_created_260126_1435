---
name: telegram-integration
description: Patterns for integrating Telegram bots in CentaurOS. Use when implementing telegram, bot, notifications, chat integration, or when working with the Telegram Bot API.
---

# Telegram Bot Integration

This skill provides patterns for integrating Telegram bots in CentaurOS.

## Reference Files

- `src/lib/telegram/bot.ts` - Bot client functions
- `src/lib/telegram/types.ts` - Telegram API types
- `src/lib/telegram/ai-processor.ts` - AI processing for messages
- `src/lib/telegram/index.ts` - Exports

---

## Environment Setup

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
```

Get your bot token from [@BotFather](https://t.me/BotFather) on Telegram.

---

## 1. Bot Client Setup

### Make API Requests

```typescript
// src/lib/telegram/bot.ts
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set')
  }
  return token
}

async function telegramRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = getBotToken()
  const url = `${TELEGRAM_API_BASE}${token}/${method}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json()

  if (!data.ok) {
    console.error('Telegram API Error:', data)
    throw new Error(data.description || 'Telegram API request failed')
  }

  return data.result
}
```

---

## 2. Core Bot Functions

### Send Message

```typescript
export interface SendMessageOptions {
  chat_id: number | string
  text: string
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  reply_markup?: InlineKeyboardMarkup
  reply_to_message_id?: number
}

export async function sendMessage(options: SendMessageOptions): Promise<{ message_id: number }> {
  return telegramRequest<{ message_id: number }>('sendMessage', {
    chat_id: options.chat_id,
    text: options.text,
    parse_mode: options.parse_mode,
    reply_markup: options.reply_markup,
    reply_to_message_id: options.reply_to_message_id,
  })
}
```

### Edit Message

```typescript
export async function editMessage(options: EditMessageOptions): Promise<void> {
  await telegramRequest('editMessageText', {
    chat_id: options.chat_id,
    message_id: options.message_id,
    text: options.text,
    parse_mode: options.parse_mode,
    reply_markup: options.reply_markup,
  })
}
```

### Answer Callback Query (Button Press)

```typescript
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert?: boolean
): Promise<void> {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  })
}
```

---

## 3. Inline Keyboards

### Create Confirmation Keyboard

```typescript
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
}

export function createConfirmationKeyboard(intentId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: `confirm:${intentId}` },
        { text: '❌ Cancel', callback_data: `reject:${intentId}` },
      ],
      [
        { text: '✏️ Edit', callback_data: `edit:${intentId}` },
      ],
    ],
  }
}
```

### Parse Callback Data

```typescript
function parseCallbackData(data: string): { action: string; id: string; extra?: string } {
  const parts = data.split(':')
  return {
    action: parts[0],
    id: parts[1],
    extra: parts[2],
  }
}
```

---

## 4. Webhook Handler

### API Route for Webhooks

```typescript
// src/app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { TelegramUpdate } from '@/lib/telegram/types'
import { handleTelegramMessage, handleCallbackQuery } from '@/lib/telegram/handlers'

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json()
    
    // Handle text/voice messages
    if (update.message) {
      await handleTelegramMessage(update.message)
    }
    
    // Handle button presses
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}
```

### Set Webhook URL

```bash
# Set webhook (run once during deployment)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourapp.com/api/telegram/webhook"}'
```

---

## 5. Telegram Types

### Core Types

```typescript
export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  voice?: TelegramVoice
  audio?: TelegramAudio
  caption?: string
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  chat_instance: string
  data?: string  // Button callback_data
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}
```

---

## 6. Voice Message Handling

### Download Voice File

```typescript
export async function getFile(fileId: string): Promise<TelegramFile> {
  return telegramRequest<TelegramFile>('getFile', { file_id: fileId })
}

export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  const token = getBotToken()
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`)
  }

  return response.arrayBuffer()
}

// Usage in handler
async function handleVoiceMessage(message: TelegramMessage) {
  if (!message.voice) return
  
  // Get file info
  const file = await getFile(message.voice.file_id)
  
  // Download audio
  const audioBuffer = await downloadFile(file.file_path!)
  
  // Process with speech-to-text (e.g., Whisper)
  const transcript = await transcribeAudio(audioBuffer)
  
  // Handle transcript
  await processUserInput(message.chat.id, transcript)
}
```

---

## 7. Message Formatting

### HTML Parse Mode

```typescript
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Format message with HTML
const message = `
<b>Bold text</b>
<i>Italic text</i>
<code>Monospace</code>
<pre>Code block</pre>
<a href="https://example.com">Link</a>
`.trim()

await sendMessage({
  chat_id: chatId,
  text: message,
  parse_mode: 'HTML',
})
```

### Emoji Usage

```typescript
// Common emojis for bot messages
const EMOJIS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  processing: '⏳',
  task: '📋',
  calendar: '📅',
  target: '🎯',
  edit: '✏️',
  back: '⬅️',
}
```

---

## 8. Account Linking

### Database Schema

```sql
-- Add telegram columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN telegram_chat_id BIGINT UNIQUE,
  ADD COLUMN telegram_username TEXT,
  ADD COLUMN telegram_linked_at TIMESTAMPTZ;

-- Verification codes table
CREATE TABLE public.telegram_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Verification Flow

```typescript
// Generate code in CentaurOS settings
export async function generateTelegramCode(userId: string): Promise<string> {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase()
  
  await supabase.from('telegram_verification_codes').insert({
    user_id: userId,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  })
  
  return code
}

// User sends /start <code> to bot
async function handleStartCommand(chatId: number, code: string) {
  const { data: verification } = await supabase
    .from('telegram_verification_codes')
    .select('user_id')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .single()
  
  if (!verification) {
    await sendErrorMessage(chatId, 'Invalid or expired code')
    return
  }
  
  // Link account
  await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq('id', verification.user_id)
  
  // Delete used code
  await supabase
    .from('telegram_verification_codes')
    .delete()
    .eq('code', code)
  
  await sendLinkedConfirmation(chatId, 'User')
}
```

---

## 9. Rate Limiting

### Simple Rate Limiter

```typescript
const rateLimitMap = new Map<number, number[]>()
const RATE_LIMIT = 10 // messages per minute

function isRateLimited(chatId: number): boolean {
  const now = Date.now()
  const windowStart = now - 60000 // 1 minute
  
  const timestamps = rateLimitMap.get(chatId) || []
  const recentTimestamps = timestamps.filter(t => t > windowStart)
  
  if (recentTimestamps.length >= RATE_LIMIT) {
    return true
  }
  
  recentTimestamps.push(now)
  rateLimitMap.set(chatId, recentTimestamps)
  return false
}

// In handler
if (isRateLimited(message.chat.id)) {
  await sendMessage({
    chat_id: message.chat.id,
    text: '⚠️ Too many messages. Please wait a moment.',
  })
  return
}
```

---

## 10. Common Patterns

### Processing Indicator

```typescript
async function processWithIndicator<T>(
  chatId: number,
  processor: () => Promise<T>
): Promise<T> {
  // Send processing message
  const { message_id } = await sendMessage({
    chat_id: chatId,
    text: '⏳ Processing...',
  })
  
  try {
    const result = await processor()
    
    // Delete processing message
    await telegramRequest('deleteMessage', {
      chat_id: chatId,
      message_id,
    })
    
    return result
  } catch (error) {
    // Update with error
    await editMessage({
      chat_id: chatId,
      message_id,
      text: '❌ An error occurred. Please try again.',
    })
    throw error
  }
}
```

### Error Handling

```typescript
async function handleTelegramMessage(message: TelegramMessage) {
  try {
    // Your logic here
  } catch (error) {
    console.error('Error handling Telegram message:', error)
    
    await sendMessage({
      chat_id: message.chat.id,
      text: '❌ Something went wrong. Please try again later.',
    })
  }
}
```

---

## Checklist

Before deploying Telegram integration:

- [ ] Bot token stored securely in environment variables
- [ ] Webhook URL set with valid HTTPS
- [ ] Rate limiting implemented
- [ ] Error handling returns 200 to Telegram (prevents retries)
- [ ] HTML characters escaped in messages
- [ ] Account linking flow tested
- [ ] Callback query acknowledged (answerCallbackQuery)
- [ ] Processing indicators for long operations
