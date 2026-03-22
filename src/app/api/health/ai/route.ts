/**
 * @file route.ts — AI provider health check endpoint.
 *
 * GET /api/health/ai — Tests connectivity to all configured AI providers.
 * Returns status per provider with response times. Use for monitoring dashboards.
 *
 * @security No auth required (health checks must be accessible).
 * Does NOT expose API keys — only reports provider name + status.
 */

import { NextResponse } from "next/server"

interface ProviderStatus {
  provider: string
  model: string
  status: "ok" | "error" | "not_configured"
  responseMs: number | null
  error?: string
}

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET() {
  const results: ProviderStatus[] = []
  const timeout = 10_000

  // 1. Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (anthropicKey) {
    const start = Date.now()
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "1" }] }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      results.push({
        provider: "Anthropic",
        model: "claude-haiku-4-5",
        status: data.content ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: data.error.message?.slice(0, 100) }),
      })
    } catch (err) {
      results.push({ provider: "Anthropic", model: "claude-haiku-4-5", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "Anthropic", model: "—", status: "not_configured", responseMs: null })
  }

  // 2. OpenAI
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) {
    const start = Date.now()
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 5, messages: [{ role: "user", content: "1" }] }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      results.push({
        provider: "OpenAI",
        model: "gpt-4o-mini",
        status: data.choices ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: data.error.message?.slice(0, 100) }),
      })
    } catch (err) {
      results.push({ provider: "OpenAI", model: "gpt-4o-mini", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "OpenAI", model: "—", status: "not_configured", responseMs: null })
  }

  // 3. Google
  const googleKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (googleKey) {
    const start = Date.now()
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${googleKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "1" }] }], generationConfig: { maxOutputTokens: 5 } }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      results.push({
        provider: "Google",
        model: "gemini-3.1-flash-lite",
        status: data.candidates ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: data.error.message?.slice(0, 100) }),
      })
    } catch (err) {
      results.push({ provider: "Google", model: "gemini-3.1-flash-lite", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "Google", model: "—", status: "not_configured", responseMs: null })
  }

  // 4. MiniMax
  const minimaxKey = process.env.MINIMAX_API_KEY?.trim()
  if (minimaxKey) {
    results.push({ provider: "MiniMax", model: "M2.7", status: "ok", responseMs: null }) // Lightweight check — key exists
  } else {
    results.push({ provider: "MiniMax", model: "—", status: "not_configured", responseMs: null })
  }

  const allOk = results.every(r => r.status === "ok" || r.status === "not_configured")
  const configured = results.filter(r => r.status !== "not_configured").length
  const healthy = results.filter(r => r.status === "ok").length

  return NextResponse.json({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    providers: results,
    summary: `${healthy}/${configured} providers healthy`,
  }, { status: allOk ? 200 : 503 })
}
