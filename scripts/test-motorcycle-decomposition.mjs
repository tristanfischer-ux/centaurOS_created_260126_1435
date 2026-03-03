/**
 * End-to-end test: simulate the exact decomposition fallback chain
 * with a realistic motorcycle product prompt.
 *
 * Tests: Opus(120s,1) → Sonnet(120s,1) → Gemini
 */
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(import.meta.dirname, "../.env.local") })

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY

if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1) }
if (!GOOGLE_KEY) { console.error("Missing GOOGLE_AI_API_KEY"); process.exit(1) }

// --- Exact system prompt from getModuleDecompositionPrompt("electromechanical") ---
// SYNC: Must match domain-prompts.ts MODULE_DECOMPOSITION_ROLE.electromechanical + BASE_MODULE_DECOMPOSITION
const SYSTEM_PROMPT = `You are a senior systems engineer specialising in electromechanical systems (drones, robots, motorised assemblies). Decompose into modules such as motor assemblies, battery/ESC, structure, payload.

Given a product description and research report, break the product down into 4-8 distinct physical modules. Each module represents a sub-assembly that could be:
- Designed independently
- Procured from different suppliers
- Tested separately
- Modelled as its own 3D CAD model

Output STRICTLY as a JSON array with this exact structure for each module:

[
  {
    "id": "lowercase_no_spaces",
    "name": "Human Readable Name",
    "purpose": "One sentence: what this module does",
    "inputs": ["Input stream or signal 1", "Input 2"],
    "outputs": ["Output stream or signal 1"],
    "keyParts": ["Part 1 with spec", "Part 2 with spec", "Part 3"],
    "leadWeeks": 6,
    "description": "1-2 paragraph technical description of what this module physically is, its operating principle, and key material choices.",
    "whyItMatters": "Why this module is critical to the overall system.",
    "failureModes": ["Failure mode 1", "Failure mode 2"],
    "unknowns": ["Open question 1", "Open question 2"]
  }
]

RULES:
- Generate 4-8 modules (more for complex products, fewer for simple ones)
- Each module MUST have at least 3 keyParts
- leadWeeks should be realistic (1-2 for off-the-shelf, 4-8 for custom, 12+ for specialised)
- Every module must have at least 1 input and 1 output
- CRITICAL: When module A's output feeds module B, use the EXACT SAME label for A's output and B's input (e.g., if Battery Pack outputs "Electrical power", then Lift Motors must have an input called "Electrical power" — not "Power supply" or "Electricity"). Consistent naming is essential for the system to detect connections between modules.
- IMPORTANT: Only list inter-module interfaces — inputs that come from another module's output, and outputs that feed another module's input. Do NOT include external/environmental interfaces (e.g., "ground reaction forces", "external charger input", "user control input", "telemetry to ground station", "ambient air intake"). If a module interfaces with the outside world, describe that in its purpose or description — not in inputs/outputs.
- Modules should cover the ENTIRE product — no gaps
- Use dimensions from the research report — do not invent new ones
- If the research report mentions sub-components, those are good module candidates
- Output ONLY the JSON array — no markdown, no explanation`

// --- Realistic motorcycle user prompt (truncated research report style) ---
const USER_PROMPT = `Product: Electric Motorcycle

Research Report:
The electric motorcycle is a high-performance two-wheeled vehicle designed for urban commuting and light touring. Key specifications include a 72V 40Ah lithium-ion battery pack providing approximately 150km range, a 10kW hub motor or mid-drive motor with peak output of 15kW, and a top speed of 120 km/h.

The chassis is a tubular steel trellis frame with a 1400mm wheelbase. Front suspension uses 41mm inverted forks with 120mm travel, rear uses a monoshock with linkage providing 100mm travel. Braking is handled by a 280mm front disc with dual-piston caliper and 220mm rear disc with single-piston caliper, both hydraulic.

The battery management system (BMS) monitors cell voltages, temperatures, and state of charge. A 1.5kW onboard charger accepts 110-240V AC input. The motor controller handles regenerative braking and torque mapping across three ride modes (Eco, Standard, Sport).

Dashboard features a 7" TFT display showing speed, battery level, range estimate, ride mode, and trip data. Bluetooth connectivity enables smartphone app integration for diagnostics and ride logging. LED lighting package includes headlight, tail light, and turn signals.

Overall dimensions: 2050mm L × 750mm W × 1100mm H. Curb weight approximately 140kg. Target price point $6,000-$8,000.

Decompose this product into physical modules (sub-assemblies). Output ONLY the JSON array.`

const TIMEOUT_MS = 120_000
const MAX_RETRIES = 1

// --- Claude API call (mirrors callClaude exactly) ---
async function callClaude(model, label) {
  console.log(`\n--- ${label} (${model}) | timeout=${TIMEOUT_MS/1000}s, retries=${MAX_RETRIES} ---`)
  const start = Date.now()

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) console.log(`  Retry ${attempt}/${MAX_RETRIES}...`)
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: USER_PROMPT }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        const errText = await res.text()
        const status = res.status
        // Only retry on rate limits (matches shouldRetry in cad-lab.ts)
        if ((status === 429 || status === 529 || errText.includes("overloaded")) && attempt < MAX_RETRIES) {
          console.log(`  Rate limited (${status}), will retry...`)
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`HTTP ${status}: ${errText.slice(0, 300)}`)
      }

      const data = await res.json()
      const text = data.content?.[0]?.text ?? ""
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`  SUCCESS in ${elapsed}s — tokens: ${data.usage?.input_tokens} in / ${data.usage?.output_tokens} out`)

      // Validate JSON parseable
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const modules = JSON.parse(jsonMatch[0])
        console.log(`  Parsed ${modules.length} modules:`)
        for (const m of modules) {
          console.log(`    - ${m.name}: ${m.purpose?.slice(0, 80)}`)
        }
      } else {
        console.log(`  WARNING: No JSON array found in response`)
        console.log(`  Response preview: ${text.slice(0, 300)}`)
      }

      return { text, elapsed, model: label }
    } catch (err) {
      if (attempt < MAX_RETRIES && (err.message.includes("429") || err.message.includes("overloaded"))) {
        console.log(`  Error (retryable): ${err.message.slice(0, 100)}`)
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.error(`  FAILED in ${elapsed}s: ${err.message.slice(0, 200)}`)
      throw err
    }
  }
}

// --- Gemini API call ---
async function callGemini() {
  const model = "gemini-2.5-flash"
  console.log(`\n--- Gemini fallback (${model}) ---`)
  const start = Date.now()
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_KEY}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: USER_PROMPT }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`  SUCCESS in ${elapsed}s — tokens: ${data.usageMetadata?.promptTokenCount} in / ${data.usageMetadata?.candidatesTokenCount} out`)

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const modules = JSON.parse(jsonMatch[0])
      console.log(`  Parsed ${modules.length} modules:`)
      for (const m of modules) {
        console.log(`    - ${m.name}: ${m.purpose?.slice(0, 80)}`)
      }
    }

    return { text, elapsed, model: "Gemini" }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.error(`  FAILED in ${elapsed}s: ${err.message.slice(0, 200)}`)
    throw err
  }
}

// --- Run the exact fallback chain ---
console.log("=== Motorcycle Decomposition Test ===")
console.log("Simulates: Opus(120s,1) → Sonnet(120s,1) → Gemini")
console.log("Vercel cap: 300s | Client timeout: 360s\n")

const chainStart = Date.now()
const triedModels = []
let result

try {
  result = await callClaude("claude-opus-4-6", "Opus")
} catch (opusErr) {
  triedModels.push({ model: "Opus", error: opusErr.message.slice(0, 200) })
  try {
    result = await callClaude("claude-sonnet-4-6", "Sonnet")
  } catch (sonnetErr) {
    triedModels.push({ model: "Sonnet", error: sonnetErr.message.slice(0, 200) })
    try {
      result = await callGemini()
    } catch (geminiErr) {
      triedModels.push({ model: "Gemini", error: geminiErr.message.slice(0, 200) })
    }
  }
}

const totalElapsed = ((Date.now() - chainStart) / 1000).toFixed(1)

console.log("\n=== Summary ===")
if (result) {
  console.log(`SUCCESS via ${result.model} in ${result.elapsed}s (total chain: ${totalElapsed}s)`)
  if (triedModels.length > 0) {
    console.log("Failed models before success:")
    for (const m of triedModels) console.log(`  - ${m.model}: ${m.error.slice(0, 100)}`)
  }
  console.log(`\nWithin Vercel 300s cap? ${parseFloat(totalElapsed) < 300 ? "YES ✓" : "NO ✗ — would be killed!"}`)
  console.log(`Within client 360s cap? ${parseFloat(totalElapsed) < 360 ? "YES ✓" : "NO ✗ — client timeout!"}`)
} else {
  console.log(`ALL MODELS FAILED in ${totalElapsed}s`)
  for (const m of triedModels) console.log(`  - ${m.model}: ${m.error.slice(0, 100)}`)
}
