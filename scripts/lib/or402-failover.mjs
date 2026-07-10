/**
 * or402-failover.mjs — OpenRouter-credit-exhaustion failover shim (2026-07-10).
 *
 * Run 48 died FATAL mid-Phase-2 on OpenRouter HTTP 402 (account balance fully
 * consumed: $3,831.05 of $3,831). The chain hard-codes
 * https://openrouter.ai/api/v1/chat/completions across ~35 call-sites, so the fix
 * is ONE fetch-level shim, loaded via NODE_OPTIONS="--import <this file>", not 35
 * edits: OpenRouter stays the primary; ONLY on a 402 does the call re-route to the
 * owner's DIRECT provider key (Google AI / DeepSeek — both already in .env.local).
 * Models with no direct route substitute gemini-3.5-flash, loudly logged — a model
 * shift is preferable to a dead loop, and the stage cache pins previously-settled
 * verdicts. Kill switch: OPENROUTER_402_FAILOVER=0. If the direct route itself
 * fails, the ORIGINAL 402 response is returned so callers see the true error.
 */

const SUBSTITUTE_MODEL = 'gemini-3.5-flash'
// OpenRouter-specific body fields Google/DeepSeek reject or misread. Run 49 proved
// Google's OpenAI-compat endpoint 400s on UNKNOWN names ('seed', 'thinking_level'),
// so this list carries every OpenRouter extension the chain is known to send.
const OR_ONLY_FIELDS = ['provider', 'transforms', 'models', 'route', 'plugins', 'reasoning', 'usage',
  'seed', 'thinking_level', 'top_k', 'min_p', 'top_a', 'repetition_penalty', 'logit_bias', 'prediction']

export function routeFor(model) {
  const m = String(model || '')
  if (m.startsWith('google/')) {
    return { provider: 'google', model: m.slice('google/'.length), substituted: false }
  }
  if (m.startsWith('deepseek/')) {
    const name = /r1|reason/i.test(m) ? 'deepseek-reasoner' : 'deepseek-chat'
    return { provider: 'deepseek', model: name, substituted: false }
  }
  return { provider: 'google', model: SUBSTITUTE_MODEL, substituted: true }
}

export function translateBody(body) {
  const out = { ...body }
  for (const k of OR_ONLY_FIELDS) delete out[k]
  // callLlm defaults max_tokens to 150,000 (anti-truncation); Gemini's output cap
  // is 65,536 and the direct endpoint rejects values above it.
  if (typeof out.max_tokens === 'number' && out.max_tokens > 65536) out.max_tokens = 65536
  return out
}

function providerEndpoint(provider) {
  return provider === 'deepseek'
    ? { url: 'https://api.deepseek.com/chat/completions', key: (process.env.DEEPSEEK_API_KEY || '').trim() }
    : { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: (process.env.GOOGLE_AI_API_KEY || '').trim() }
}

const origFetch = globalThis.fetch

async function failoverFetch(input, init) {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  if (!url.includes('openrouter.ai/api/v1/chat/completions') || process.env.OPENROUTER_402_FAILOVER === '0') {
    return origFetch(input, init)
  }
  const res = await origFetch(input, init)
  if (res.status !== 402) return res
  let body
  try { body = JSON.parse(init?.body ?? '{}') } catch { return res }
  const route = routeFor(body.model)
  const { url: epUrl, key } = providerEndpoint(route.provider)
  if (!key) return res
  console.error(`[or402-failover] OpenRouter 402 on ${body.model} → ${route.provider}:${route.model}` +
    (route.substituted ? ' (SUBSTITUTED — no direct route for this model)' : ''))
  try {
    const direct = await origFetch(epUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...translateBody(body), model: route.model }),
      signal: init?.signal,
    })
    if (!direct.ok) {
      console.error(`[or402-failover] direct ${route.provider} route failed HTTP ${direct.status}: ` +
        (await direct.text().catch(() => '?')).slice(0, 200))
      return res
    }
    return direct
  } catch (e) {
    console.error(`[or402-failover] direct ${route.provider} route threw: ${String(e).slice(0, 200)}`)
    return res
  }
}

globalThis.fetch = failoverFetch
