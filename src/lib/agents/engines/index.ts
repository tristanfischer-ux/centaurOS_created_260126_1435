/**
 * @file engines/index.ts
 *
 * @description Barrel export that registers all ConversationEngine implementations.
 * Import this file to ensure all engines are registered in the ENGINE_FACTORIES.
 *
 * Usage:
 *   import '@/lib/agents/engines' // Registers all engines
 *   import { createConversationEngine } from '@/lib/agents/conversation-engine'
 *   const engine = createConversationEngine('text')
 */

// Tier 0/1: SSE text streaming + optional TTS/STT
export { TextChatEngine } from "./text-chat-engine"

// Tier 2: OpenAI Realtime API for bidirectional voice (EXPERIMENTAL)
export { RealtimeVoiceEngine } from "./realtime-voice-engine"

// Tier 3/4: Voice + visual avatar (EXPERIMENTAL)
export { AvatarEngine, HeyGenAvatarProvider } from "./avatar-engine"
