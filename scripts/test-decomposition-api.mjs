/**
 * Minimal test: reproduce the exact API calls decomposition makes.
 * Tests Opus, Sonnet, and Gemini independently.
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import { config } from "dotenv"

config({ path: resolve(import.meta.dirname, "../.env.local") })

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY

if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1) }
if (!GOOGLE_KEY) { console.error("Missing GOOGLE_AI_API_KEY"); process.exit(1) }

const SYSTEM = "You are a mechanical engineer. Respond with a JSON array of 2 objects, each with keys: name, purpose. Example: [{\"name\":\"Frame\",\"purpose\":\"Structural support\"}]"
const USER = "Decompose a simple pallet lift into sub-assemblies. Output ONLY the JSON array."

async function testClaude(model, label) {
  console.log(`\n--- Testing ${label} (${model}) ---`)
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
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: USER }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`FAILED (${res.status}):`, errText.slice(0, 500))
      return false
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ""
    console.log("SUCCESS — tokens:", data.usage?.input_tokens, "in /", data.usage?.output_tokens, "out")
    console.log("Response:", text.slice(0, 200))
    return true
  } catch (err) {
    console.error("EXCEPTION:", err.message)
    return false
  }
}

async function testGemini() {
  const model = "gemini-3.1-pro-preview"
  console.log(`\n--- Testing Gemini (${model}) ---`)
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_KEY}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: USER }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`FAILED (${res.status}):`, errText.slice(0, 500))
      return false
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    console.log("SUCCESS — tokens:", data.usageMetadata?.promptTokenCount, "in /", data.usageMetadata?.candidatesTokenCount, "out")
    console.log("Response:", text.slice(0, 200))
    return true
  } catch (err) {
    console.error("EXCEPTION:", err.message)
    return false
  }
}

console.log("=== Decomposition API Test ===")
console.log("Testing the exact same API calls that decomposeIntoModules makes.\n")

const opusOk = await testClaude("claude-opus-4-6", "Opus")
const sonnetOk = await testClaude("claude-sonnet-4-6", "Sonnet")
const geminiOk = await testGemini()

console.log("\n=== Summary ===")
console.log("Opus:  ", opusOk ? "OK" : "FAILED")
console.log("Sonnet:", sonnetOk ? "OK" : "FAILED")
console.log("Gemini:", geminiOk ? "OK" : "FAILED")

if (!opusOk && !sonnetOk && !geminiOk) {
  console.log("\nALL THREE FAILED — the issue is NOT model-specific.")
  console.log("Check: API keys, network, billing, or a code bug before the API call.")
} else if (opusOk || sonnetOk) {
  console.log("\nAt least one Claude model works — decomposition should succeed with the fallback chain.")
} else if (geminiOk) {
  console.log("\nOnly Gemini works — decomposition should succeed via the Gemini fallback.")
}
