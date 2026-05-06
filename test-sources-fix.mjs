#!/usr/bin/env node
/**
 * Standalone test to verify the sources=0 fix.
 *
 * Root cause: Gemini Search drops groundingMetadata when prompt >2000 chars.
 * Fix: Don't prepend training data to Gemini prompt.
 *
 * This script calls Gemini directly with a SHORT prompt (no training data)
 * and verifies that sources are returned.
 */

import { readFileSync } from 'fs'

// Load .env.local
const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
  process.env[key] = value
}

const API_KEY = process.env.GOOGLE_AI_API_KEY?.trim()
if (!API_KEY) {
  console.error('GOOGLE_AI_API_KEY not found in .env.local')
  process.exit(1)
}

const MODEL = 'gemini-3.1-pro-preview'
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// SHORT prompt — this is the fix. The old prompt had 4000+ chars of training data prepended.
const SHORT_PROMPT = `Find the real-world specifications for: 10kWh battery energy storage system (BESS) for UK home

I need precise engineering dimensions for 3D CAD modelling. Search for:

1. OVERALL DIMENSIONS — length, width, height in mm
2. WEIGHT — total weight and breakdown if available
3. BATTERY SPECS — cell type, capacity, voltage
4. ENCLOSURE — IP rating, materials, cooling
5. STANDARD PARTS — connector sizes, mounting standards

Include a "Sources" section listing at least 10 sources with title, URL, and source type.
Format your response as a structured specification sheet with exact numbers in millimetres.
Do NOT guess dimensions. Only include measurements you found from real sources.`

// LONG prompt — the old broken version with training data prepended
const TRAINING_DATA = `=== STAGE 0: TRAINING DATA KNOWLEDGE DUMP ===
Models consulted: 10
Models responded: 9

--- GPT-5.5 (US OpenAI) ---
### 1. ENGINEERING SPECIFICATIONS
Battery energy storage systems (BESS) for residential use typically range from 5-15 kWh capacity...
[6000 chars of training data]

### 2. COMPETITOR PRODUCTS
Tesla Powerwall 2: 13.5 kWh, 51kg, 1150mm x 755mm x 155mm...
[more training data]

### 3. REGULATORY REQUIREMENTS
IEC 62619: Safety requirements for secondary lithium cells...
[more training data]

### 4. MARKET DATA
Global BESS market: $7.5B in 2024, CAGR 25%...
[more training data]

### 5. SUPPLIERS AND MANUFACTURERS
CATL, BYD, Samsung SDI, LG Energy Solution...
[more training data]

### 6. COST BENCHMARKS
Residential BESS: $300-500/kWh installed...
[more training data]

### 7. MATERIALS AND CERTIFICATIONS
Lithium iron phosphate (LFP) chemistry preferred for safety...
[more training data]

### 8. APPLICATION-SPECIFIC KNOWLEDGE
UK homes typically have single-phase 230V supply...
[more training data]

--- Gemini 3.1 Pro (US Google) ---
[another 6000 chars of training data from Gemini]

--- Kimi K2.6 (China Moonshot) ---
[another 6000 chars from Kimi]

--- Qwen 3.6-plus (China Alibaba) ---
[another 6000 chars from Qwen]

--- GLM-5.1 (China Zhipu) ---
[another 6000 chars from GLM]

--- DeepSeek V4-Pro (China DeepSeek) ---
[another 6000 chars from DeepSeek]

--- Mistral Large (EU Mistral) ---
[another 6000 chars from Mistral]

--- Grok 4.3 (US xAI) ---
[another 6000 chars from Grok]

--- GPT-5.4 (US OpenAI alt) ---
[another 6000 chars from GPT-5.4]`

const LONG_PROMPT = `Find the real-world specifications for: 10kWh battery energy storage system (BESS) for UK home

${TRAINING_DATA}

I need precise engineering dimensions for 3D CAD modelling. Search for:

1. OVERALL DIMENSIONS — length, width, height in mm
2. WEIGHT — total weight and breakdown if available
3. BATTERY SPECS — cell type, capacity, voltage
4. ENCLOSURE — IP rating, materials, cooling
5. STANDARD PARTS — connector sizes, mounting standards

Include a "Sources" section listing at least 10 sources with title, URL, and source type.
Format your response as a structured specification sheet with exact numbers in millimetres.
Do NOT guess dimensions. Only include measurements you found from real sources.`

async function callGemini(prompt, label) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Testing: ${label}`)
  console.log(`Prompt length: ${prompt.length} chars`)
  console.log(`${'='.repeat(60)}`)

  const start = Date.now()

  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`HTTP ${response.status}: ${errText.slice(0, 500)}`)
      return { ok: false, sources: 0, elapsed: Date.now() - start }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const groundingMeta = data.candidates?.[0]?.groundingMetadata
    const chunks = groundingMeta?.groundingChunks ?? []
    const hasGrounding = groundingMeta?.groundingSupports?.length > 0

    const sources = chunks
      .filter(c => c.web?.uri && c.web?.title)
      .map(c => ({ uri: c.web.uri, title: c.web.title }))

    const elapsed = Date.now() - start

    console.log(`Response: ${text.length} chars in ${elapsed}ms`)
    console.log(`hasGroundingMetadata: ${!!groundingMeta}`)
    console.log(`groundingChunks: ${chunks.length}`)
    console.log(`groundingSupports: ${hasGrounding}`)
    console.log(`Sources found: ${sources.length}`)

    if (sources.length > 0) {
      console.log(`\nFirst 3 sources:`)
      sources.slice(0, 3).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.title}`)
        console.log(`     ${s.uri}`)
      })
    }

    // Print first 500 chars of response
    console.log(`\nResponse preview:\n${text.slice(0, 500)}...`)

    return { ok: true, sources: sources.length, hasGrounding: !!groundingMeta, elapsed, text }
  } catch (err) {
    console.error(`Error: ${err.message}`)
    return { ok: false, sources: 0, elapsed: Date.now() - start }
  }
}

console.log('Testing Gemini sources=0 fix')
console.log('Root cause: Gemini drops groundingMetadata when prompt >2000 chars')

const shortResult = await callGemini(SHORT_PROMPT, 'SHORT prompt (no training data) — the fix')
const longResult = await callGemini(LONG_PROMPT, 'LONG prompt (with training data) — the old bug')

console.log(`\n${'='.repeat(60)}`)
console.log('RESULTS:')
console.log(`${'='.repeat(60)}`)
console.log(`SHORT prompt: ${shortResult.sources} sources, grounding=${shortResult.hasGrounding ?? 'N/A'}, ${shortResult.elapsed}ms`)
console.log(`LONG prompt:  ${longResult.sources} sources, grounding=${longResult.hasGrounding ?? 'N/A'}, ${longResult.elapsed}ms`)

if (shortResult.sources > 0 && longResult.sources === 0) {
  console.log(`\n✅ FIX VERIFIED: Short prompt returns sources, long prompt does not.`)
  console.log(`   The fix (don't prepend training data to Gemini prompt) is correct.`)
} else if (shortResult.sources > 0 && longResult.sources > 0) {
  console.log(`\n⚠️  Both prompts return sources. The prompt length threshold may have changed.`)
} else if (shortResult.sources === 0) {
  console.log(`\n❌ SHORT prompt returned 0 sources. Fix may not be working.`)
} else {
  console.log(`\n❓ Unexpected result pattern.`)
}
