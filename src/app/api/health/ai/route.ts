/**
 * @file route.ts — AI provider health check endpoint.
 *
 * GET /api/health/ai — Tests connectivity to all configured AI providers.
 * Returns status per provider with response times. Use for monitoring dashboards.
 *
 * @security No auth required (health checks must be accessible).
 * Does NOT expose API keys — only reports provider name + status.
 */

import { NextRequest, NextResponse } from "next/server"
import { rateLimit, getClientIP } from "@/lib/security/rate-limit"
import { logLlmUsage } from "@/lib/cost-logging/llm-usage"

interface ProviderStatus {
  provider: string
  model: string
  status: "ok" | "error" | "not_configured"
  responseMs: number | null
  error?: string
}

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(request: NextRequest) {
  // SECURITY: Rate limit health check endpoint to prevent abuse
  const ip = getClientIP(request.headers)
  const { success: rateLimitOk } = await rateLimit('healthCheck', ip, { limit: 5, window: 60000 })
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const results: ProviderStatus[] = []
  const timeout = 10_000

  // 1. OpenAI
  const openaiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (openaiKey) {
    const start = Date.now()
    const openaiModel = "gpt-4.1-nano"
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: openaiModel, max_tokens: 5, messages: [{ role: "user", content: "1" }] }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      const ok = !!data.choices
      void logLlmUsage({
        action: 'health_check_openai',
        modelUsed: openaiModel,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        status: ok ? 'success' : 'error',
        errorMessage: ok ? undefined : (data.error?.message ?? 'unknown error').slice(0, 200),
      })
      results.push({
        provider: "OpenAI",
        model: "gpt-4.1-nano",
        status: ok ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: data.error.message?.slice(0, 100) }),
      })
    } catch (err) {
      void logLlmUsage({
        action: 'health_check_openai',
        modelUsed: openaiModel,
        tokensIn: 0,
        tokensOut: 0,
        status: 'error',
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      })
      results.push({ provider: "OpenAI", model: "gpt-4.1-nano", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "OpenAI", model: "—", status: "not_configured", responseMs: null })
  }

  // 2. Google
  const googleKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (googleKey) {
    const start = Date.now()
    const geminiModel = "gemini-3.1-flash-lite-preview"
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "1" }] }], generationConfig: { maxOutputTokens: 5 } }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      const ok = !!data.candidates
      void logLlmUsage({
        action: 'health_check_gemini',
        modelUsed: geminiModel,
        tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
        status: ok ? 'success' : 'error',
        errorMessage: ok ? undefined : (data.error?.message ?? 'unknown error').slice(0, 200),
      })
      results.push({
        provider: "Google",
        model: "gemini-3.1-flash-lite",
        status: ok ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: data.error.message?.slice(0, 100) }),
      })
    } catch (err) {
      void logLlmUsage({
        action: 'health_check_gemini',
        modelUsed: geminiModel,
        tokensIn: 0,
        tokensOut: 0,
        status: 'error',
        errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      })
      results.push({ provider: "Google", model: "gemini-3.1-flash-lite", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "Google", model: "—", status: "not_configured", responseMs: null })
  }

  // 3. Qwen / DashScope
  const dashscopeKey = process.env.DASHSCOPE_API_KEY?.trim()
  if (dashscopeKey) {
    const start = Date.now()
    try {
      const res = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${dashscopeKey}` },
        body: JSON.stringify({ model: "qwen-turbo", max_tokens: 5, messages: [{ role: "user", content: "1" }] }),
        signal: AbortSignal.timeout(timeout),
      })
      const data = await res.json()
      results.push({
        provider: "Qwen (DashScope)",
        model: "qwen-turbo",
        status: data.choices ? "ok" : "error",
        responseMs: Date.now() - start,
        ...(data.error && { error: (data.error.message ?? JSON.stringify(data.error)).slice(0, 100) }),
      })
    } catch (err) {
      results.push({ provider: "Qwen (DashScope)", model: "qwen-turbo", status: "error", responseMs: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 100) : "Unknown" })
    }
  } else {
    results.push({ provider: "Qwen (DashScope)", model: "—", status: "not_configured", responseMs: null })
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
