/**
 * @file token-counter.ts
 *
 * @description Accurate token counting for the Observational Memory system.
 * Uses gpt-tokenizer for cl100k_base encoding (GPT-4/Claude compatible).
 *
 * @dependencies gpt-tokenizer (pure JS, no native deps)
 */

import { encode } from 'gpt-tokenizer'

/**
 * Count the number of tokens in a text string.
 *
 * @param text - The text to count tokens for
 * @returns The number of tokens
 */
export function countTokens(text: string): number {
  if (!text) return 0
  return encode(text).length
}

/**
 * Count tokens across an array of chat messages.
 * Accounts for message framing overhead (~4 tokens per message).
 *
 * @param messages - Array of messages with role and content
 * @returns Total token count including message framing
 */
export function countMessagesTokens(
  messages: Array<{ role: string; content: string }>
): number {
  if (!messages.length) return 0

  let total = 0
  for (const msg of messages) {
    // ~4 tokens per message for role + framing
    total += 4
    total += countTokens(msg.content)
  }
  // +2 for the overall conversation framing
  return total + 2
}
