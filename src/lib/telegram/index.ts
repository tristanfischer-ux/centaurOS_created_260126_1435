/**
 * Telegram Bot Integration for ForgeOS
 * 
 * This module provides:
 * - Telegram Bot API client for sending messages
 * - Voice transcription using OpenAI Whisper
 * - AI processing to convert text to structured objectives
 * - Inline keyboard interactions for confirmation flow
 * - Notification bridge for pushing notifications to Telegram
 * - Daily briefing functionality
 * - Decision queue and approval workflow
 */

export * from './types'
export * from './bot'
export * from './ai-processor'
export * from './notification-bridge'
