/**
 * @file test-cad-lab-pipeline.mjs
 *
 * End-to-end CAD Lab pipeline test: runs 3 made-up products through
 * Decomposition → Edge Building → Signal Classification → Interface Contracts
 * → Diagnostic Prefill → Hybrid Edges.
 *
 * Phases 1, 3, 4 hit the AI APIs. Phases 2, 5 are pure logic (no AI).
 *
 * Usage: node scripts/test-cad-lab-pipeline.mjs
 * Env:   ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY (in .env.local)
 */
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(import.meta.dirname, "../.env.local") })

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY
if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1) }
if (!GOOGLE_KEY) { console.error("Missing GOOGLE_AI_API_KEY"); process.exit(1) }

// ─── Constants ─────────────────────────────────────────────────────────

const TIMEOUT_MS = 120_000
const MODEL = "claude-sonnet-4-6" // Use Sonnet for speed in tests

// ─── Prompts (synced with domain-prompts.ts) ───────────────────────────

const DECOMPOSITION_ROLES = {
  electromechanical:
    "You are a senior systems engineer specialising in electromechanical systems (drones, robots, motorised assemblies). Decompose into modules such as motor assemblies, battery/ESC, structure, payload.",
  electronics:
    "You are a senior systems engineer specialising in electronics/PCB assemblies. Decompose the product into physical sub-assemblies (e.g. power supply, main board, display, connectors).",
}

const BASE_DECOMPOSITION = `Given a product description and research report, break the product down into 4-8 distinct physical modules. Each module represents a sub-assembly that could be:
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
    "description": "1-2 paragraph technical description.",
    "whyItMatters": "Why this module is critical.",
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

const INTERFACE_CONTRACT_SYSTEM = `You are an engineering systems integration specialist. Analyse the module interfaces and identify which output ports connect to which input ports across modules.

For each connection, determine:
1. The port type: power, data, mechanical, thermal, fluid, optical, or other
2. Any specs you can infer (e.g., "24V DC", "M8 bolt pattern", "CAN bus")
3. Whether the connection appears compatible based on the specs

Return a JSON array of contracts. Each contract:
{
  "sourceModuleId": "module-id",
  "sourcePort": "exact output name",
  "targetModuleId": "module-id",
  "targetPort": "exact input name",
  "portType": "power|data|mechanical|thermal|fluid|optical|other",
  "sourceSpec": "optional spec string",
  "targetSpec": "optional spec string",
  "compatible": true,
  "incompatibilityReason": "optional reason if compatible=false"
}

Rules:
- Match outputs to inputs across different modules (never within same module)
- Copy port names EXACTLY as listed — do not rephrase, abbreviate, or expand them
- Set compatible=null if you cannot determine compatibility
- Your response MUST contain at least one contract for EVERY listed port
- For ports that interface with the external environment, use "external" as the sourceModuleId or targetModuleId
- Return ONLY the JSON array, no markdown fences or explanation`

const DIAGNOSTICS_ROLE = {
  electromechanical:
    "You are an expert electromechanical manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module. Consider both structural and electrical/thermal environments.",
  electronics:
    "You are an expert electronics manufacturing engineer. Given a research report and module list, recommend diagnostic answers for each module. Prefer PCB/Electronic material and appropriate tolerances for PCBA.",
}

const BASE_DIAGNOSTICS = `For each module, output exactly these 6 fields:
- mfg_process: One of: FDM 3D Print, SLA/Resin Print, SLS/Powder Print, CNC Machining, Sheet Metal, Injection Molding, Casting, Manual/Assembly, Other
- material: One of: PLA/PETG, ABS/Nylon, Resin (standard), Aluminum 6061, Steel (mild), Stainless Steel, Titanium, Copper/Brass, Carbon Fiber, Wood/Plywood, Other
- tolerance: One of: Loose (±1mm), Standard (±0.5mm), Precision (±0.1mm), Tight (±0.05mm), Ultra-tight (±0.01mm)
- surface_finish: One of: As-manufactured, Sanded/Deburred, Painted/Coated, Anodized, Polished, Plated, N/A
- batch_size: One of: Prototype (1-5), Small batch (10-50), Medium (50-500), Production (500+), Mass production (10k+)
- environment: One of: Indoor (office), Indoor (industrial), Outdoor (temperate), Outdoor (harsh), High temperature, Wet/Marine, Corrosive, Cleanroom, Space/Vacuum

Return a JSON object mapping module IDs to their answers. Only output valid JSON. No explanation.`

// ─── Signal keywords (synced with flow-edge-utils.ts after Bug 2 fix) ──

const SIGNAL_KEYWORDS = {
  power: ["voltage", "battery", "current", "watt", "amp", "dc", "charger", "power", "supply", "energy", "fuel", "charge", "discharge"],
  data: ["signal", "data", "control", "sensor", "telemetry", "pwm", "serial", "usb", "uart", "command", "feedback", "communication", "protocol", "digital", "analog", "throttle", "pilot"],
  mechanical: ["force", "torque", "mount", "structural", "load", "bracket", "axle", "frame", "chassis", "gear", "shaft", "bearing", "mechanical", "assembly", "deploy", "deployment", "propulsion", "thrust", "lift", "arm", "capability"],
  thermal: ["heat", "thermal", "cooling", "temperature", "dissipation", "fan", "heatsink", "ventilation"],
}

// ─── Keyword matching (synced with keyword-matching.ts) ────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "for", "from", "in", "on", "at", "and",
  "or", "via", "per", "with", "each", "all", "into", "between", "by",
])

function extractKeywords(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) ? w.slice(0, -1) : w),
  )
}

function hasKeywordOverlap(a, b, minShared = 2) {
  const kA = extractKeywords(a)
  const kB = extractKeywords(b)
  const effectiveMin = (kA.size <= 2 || kB.size <= 2) ? Math.min(minShared, 1) : minShared
  let shared = 0
  for (const w of kA) {
    if (kB.has(w)) {
      shared++
      if (shared >= effectiveMin) return true
    }
  }
  return false
}

// ─── Signal classification (synced with flow-edge-utils.ts) ────────────

function classifySignalType(label) {
  const lower = label.toLowerCase()
  for (const [type, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return type
  }
  return "other"
}

// ─── Edge building (synced with flow-edge-utils.ts) ────────────────────

function buildEdges(modules) {
  const edges = []
  for (const source of modules) {
    for (const output of source.outputs) {
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (hasKeywordOverlap(output, input)) {
            const isDuplicate = edges.some(
              (e) => e.from === source.id && e.to === target.id && e.label === output,
            )
            if (!isDuplicate) {
              edges.push({
                from: source.id,
                to: target.id,
                sourceHandle: output,
                targetHandle: input,
                label: output,
                signalType: classifySignalType(output),
              })
            }
          }
        }
      }
    }
  }
  return edges
}

function portTypeToSignalType(portType) {
  if (["power", "data", "mechanical", "thermal"].includes(portType)) return portType
  return "other"
}

function buildEdgesFromContracts(contracts, modules) {
  const portLookup = new Map()
  for (const m of modules) {
    portLookup.set(m.id, { inputs: m.inputs, outputs: m.outputs })
  }

  const edges = []
  for (const contract of contracts) {
    if (contract.sourceModuleId === "external" || contract.targetModuleId === "external") continue

    const sourcePorts = portLookup.get(contract.sourceModuleId)
    const targetPorts = portLookup.get(contract.targetModuleId)

    const resolvedSource = sourcePorts
      ? resolvePortName(contract.sourcePort, sourcePorts.outputs)
      : null
    const resolvedTarget = targetPorts
      ? resolvePortName(contract.targetPort, targetPorts.inputs)
      : null

    if (!resolvedSource || !resolvedTarget) continue

    const isDuplicate = edges.some(
      (e) => e.from === contract.sourceModuleId && e.to === contract.targetModuleId && e.label === resolvedSource,
    )
    if (!isDuplicate) {
      edges.push({
        from: contract.sourceModuleId,
        to: contract.targetModuleId,
        sourceHandle: resolvedSource,
        targetHandle: resolvedTarget,
        label: resolvedSource,
        signalType: portTypeToSignalType(contract.portType),
        incompatible: contract.compatible === false,
        incompatibilityReason: contract.incompatibilityReason,
      })
    }
  }
  return edges
}

function resolvePortName(contractPort, actualPorts) {
  if (actualPorts.includes(contractPort)) return contractPort
  for (const port of actualPorts) {
    if (hasKeywordOverlap(contractPort, port)) return port
  }
  const contractLower = contractPort.toLowerCase()
  for (const port of actualPorts) {
    const portLower = port.toLowerCase()
    if (portLower.includes(contractLower) || contractLower.includes(portLower)) return port
  }
  return null
}

function buildEdgesHybrid(contracts, modules) {
  const contractEdges = buildEdgesFromContracts(contracts, modules)
  const connectedOutputs = new Set()
  const connectedInputs = new Set()
  for (const e of contractEdges) {
    if (e.sourceHandle) connectedOutputs.add(`${e.from}::${e.sourceHandle}`)
    if (e.targetHandle) connectedInputs.add(`${e.to}::${e.targetHandle}`)
  }

  const gapEdges = []
  for (const source of modules) {
    for (const output of source.outputs) {
      if (connectedOutputs.has(`${source.id}::${output}`)) continue
      for (const target of modules) {
        if (target.id === source.id) continue
        for (const input of target.inputs) {
          if (connectedInputs.has(`${target.id}::${input}`)) continue
          if (hasKeywordOverlap(output, input, 1)) {
            const isDuplicate =
              contractEdges.some((e) => e.from === source.id && e.to === target.id && e.sourceHandle === output && e.targetHandle === input) ||
              gapEdges.some((e) => e.from === source.id && e.to === target.id && e.sourceHandle === output && e.targetHandle === input)
            if (!isDuplicate) {
              gapEdges.push({
                from: source.id, to: target.id,
                sourceHandle: output, targetHandle: input,
                label: output, signalType: classifySignalType(output),
              })
              connectedOutputs.add(`${source.id}::${output}`)
              connectedInputs.add(`${target.id}::${input}`)
            }
          }
        }
      }
    }
  }

  // Signal-type fallback for orphaned ports
  const orphanedOutputs = []
  const orphanedInputs = []
  for (const m of modules) {
    for (const output of m.outputs) {
      if (!connectedOutputs.has(`${m.id}::${output}`)) {
        const st = classifySignalType(output)
        if (st !== "other") orphanedOutputs.push({ moduleId: m.id, port: output, signalType: st })
      }
    }
    for (const input of m.inputs) {
      if (!connectedInputs.has(`${m.id}::${input}`)) {
        const st = classifySignalType(input)
        if (st !== "other") orphanedInputs.push({ moduleId: m.id, port: input, signalType: st })
      }
    }
  }

  const claimedInputs = new Set()
  for (const out of orphanedOutputs) {
    for (const inp of orphanedInputs) {
      if (inp.moduleId === out.moduleId) continue
      if (claimedInputs.has(`${inp.moduleId}::${inp.port}`)) continue
      if (out.signalType !== inp.signalType) continue
      gapEdges.push({
        from: out.moduleId, to: inp.moduleId,
        sourceHandle: out.port, targetHandle: inp.port,
        label: out.port, signalType: out.signalType,
      })
      claimedInputs.add(`${inp.moduleId}::${inp.port}`)
      break
    }
  }

  return [...contractEdges, ...gapEdges]
}

// ─── Test products ─────────────────────────────────────────────────────

const TEST_PRODUCTS = [
  {
    name: "Electric Skateboard",
    domain: "electromechanical",
    prompt: `Product: Electric Skateboard (Dual Hub Motors)

Research Report:
A high-performance electric longboard with dual 600W hub motors integrated into 90mm polyurethane wheels. The deck is a 38" bamboo/fiberglass composite with moderate flex for shock absorption.

Power comes from a 10S3P lithium-ion battery pack (36V, 7.5Ah, 270Wh) housed in a CNC-machined 6061 aluminium enclosure bolted beneath the deck. A dual-ESC (electronic speed controller) with regenerative braking handles motor control, accepting throttle input from a 2.4GHz wireless remote control. Max speed 40 km/h, range 25-30 km.

Trucks are reverse kingpin style, 50-degree baseplates, 10mm axles. The rear truck integrates both hub motors. A BMS (battery management system) handles cell balancing, over-current, and temperature protection.

LED strip lighting runs along the deck edges. A small OLED display on the remote shows speed, battery %, and ride mode (Eco/Sport/Turbo).

Dimensions: 970mm L x 250mm W x 140mm H (ground clearance 100mm). Weight: 8.5kg. Target price: $800-$1200.

Decompose this product into physical modules. Output ONLY the JSON array.`,
  },
  {
    name: "Desktop CNC Router",
    domain: "electromechanical",
    prompt: `Product: Desktop CNC Router (3-Axis)

Research Report:
A compact 3-axis CNC router for wood, aluminium, and plastic milling. Working area 300x400x80mm. Frame is welded 40x40mm steel box section with linear rails (MGN12H) on all three axes.

Spindle: 500W ER11 brushless DC spindle, 12,000 RPM max, air-cooled. Z-axis travel 80mm on a ball screw (SFU1204, 4mm pitch). X and Y axes use GT2 belts (9mm width) with NEMA 23 stepper motors (2.0 Nm holding torque). Z-axis has a dedicated NEMA 23 stepper with a 5:1 planetary gearbox.

Controller: GRBL-compatible 32-bit board with USB connection. Accepts G-code from host PC. 3 axis drivers (TMC2209 silent step sticks, 1.4A RMS). 24V 15A power supply.

Limit switches on all 6 endpoints (home + max). Emergency stop button. Probe input for tool height setting. Aluminium T-slot wasteboard with threaded inserts.

Dust shoe attaches to spindle mount, connects to shop vacuum via 36mm port. Enclosure is clear 5mm polycarbonate panels with aluminium extrusion frame.

Dimensions: 650mm L x 550mm W x 500mm H. Weight: 28kg. Target price: $1,500-$2,500.

Decompose this product into physical modules. Output ONLY the JSON array.`,
  },
  {
    name: "Smart Weather Station",
    domain: "electronics",
    prompt: `Product: Smart Weather Station (Solar-Powered, WiFi)

Research Report:
An outdoor IoT weather station with solar-powered ESP32 microcontroller. Measures temperature (BME280, +/-0.5C), humidity (BME280, +/-3%), barometric pressure (BME280), wind speed (cup anemometer, hall effect sensor), wind direction (potentiometer vane, 16 positions), rainfall (tipping bucket, 0.2mm per tip), UV index (VEML6075), and ambient light (BH1750).

Power: 6V 1W monocrystalline solar panel charges a 3.7V 3000mAh LiPo battery via TP4056 charge controller. HT7333 3.3V LDO regulator for ESP32. Deep sleep current <10uA, active current ~180mA during WiFi transmit.

ESP32-WROOM-32E module handles sensor polling (every 60s), local averaging, and WiFi transmission to home server or cloud API. 4MB flash, 520KB SRAM. OTA firmware updates over WiFi.

E-ink display (2.9" 296x128, SPI interface) shows current readings, updated every 5 minutes. Low power — no backlight, sunlight readable.

Enclosure: Stevenson screen design (louvred radiation shield) in UV-stabilised ASA plastic. Mast mounting bracket for 25-50mm poles. Cable glands for external sensor wires. IP55 rated.

Dimensions: 200mm W x 200mm D x 300mm H (excluding mast). Weight: 650g. Target price: $80-$150.

Decompose this product into physical modules. Output ONLY the JSON array.`,
  },
]

// ─── AI API helpers ────────────────────────────────────────────────────

async function callClaude(systemPrompt, userPrompt, label) {
  const start = Date.now()
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`[${label}] HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ""
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  return { text, elapsed, tokensIn: data.usage?.input_tokens, tokensOut: data.usage?.output_tokens }
}

function parseJsonFromResponse(text) {
  let jsonText = text.trim()
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonText = fenceMatch[1].trim()
  // Try array first, then object
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/)
  if (arrayMatch) return JSON.parse(arrayMatch[0])
  const objectMatch = jsonText.match(/\{[\s\S]*\}/)
  if (objectMatch) return JSON.parse(objectMatch[0])
  throw new Error("No JSON found in response")
}

// ─── Test result tracking ──────────────────────────────────────────────

let totalTests = 0
let passedTests = 0
let failedTests = 0
const failures = []

function assert(condition, testName, detail = "") {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`    PASS: ${testName}`)
  } else {
    failedTests++
    const msg = `    FAIL: ${testName}${detail ? ` — ${detail}` : ""}`
    console.log(msg)
    failures.push(`${testName}: ${detail}`)
  }
}

// ─── Main test runner ──────────────────────────────────────────────────

console.log("=" .repeat(70))
console.log("  CAD Lab Pipeline End-to-End Test")
console.log("=" .repeat(70))
console.log(`Model: ${MODEL} | Timeout: ${TIMEOUT_MS / 1000}s`)
console.log(`Products: ${TEST_PRODUCTS.map((p) => p.name).join(", ")}`)
console.log("")

const allResults = [] // { name, modules, edges, contracts, diagnostics, hybridEdges }

for (const product of TEST_PRODUCTS) {
  console.log("\n" + "-".repeat(70))
  console.log(`  Product: ${product.name} (${product.domain})`)
  console.log("-".repeat(70))

  const result = { name: product.name, domain: product.domain }

  // ── Phase 1: Decomposition (AI) ────────────────────────────────────

  console.log("\n  Phase 1: Decomposition")
  try {
    const systemPrompt = `${DECOMPOSITION_ROLES[product.domain]}\n\n${BASE_DECOMPOSITION}`
    const res = await callClaude(systemPrompt, product.prompt, `${product.name} decomposition`)
    console.log(`    API: ${res.elapsed}s, ${res.tokensIn} in / ${res.tokensOut} out`)

    const modules = parseJsonFromResponse(res.text)
    result.modules = modules

    // Schema validation
    assert(Array.isArray(modules), "Response is JSON array")
    assert(modules.length >= 4 && modules.length <= 8, `Module count 4-8`, `got ${modules.length}`)

    for (const m of modules) {
      assert(typeof m.id === "string" && /^[a-z0-9_]+$/.test(m.id), `Module "${m.name}" has valid id`, `id="${m.id}"`)
      assert(typeof m.name === "string" && m.name.length > 0, `Module "${m.id}" has name`)
      assert(typeof m.purpose === "string", `Module "${m.id}" has purpose`)
      assert(Array.isArray(m.inputs) && m.inputs.length >= 1, `Module "${m.id}" has >= 1 input`, `got ${m.inputs?.length ?? 0}`)
      assert(Array.isArray(m.outputs) && m.outputs.length >= 1, `Module "${m.id}" has >= 1 output`, `got ${m.outputs?.length ?? 0}`)
      assert(Array.isArray(m.keyParts) && m.keyParts.length >= 3, `Module "${m.id}" has >= 3 keyParts`, `got ${m.keyParts?.length ?? 0}`)
      assert(typeof m.leadWeeks === "number" && m.leadWeeks > 0, `Module "${m.id}" has positive leadWeeks`)
    }

    // Unique IDs
    const ids = modules.map((m) => m.id)
    assert(new Set(ids).size === ids.length, "All module IDs unique")

    // External interface check — no module should have inputs/outputs with environment keywords
    const envKeywords = ["ambient", "ground reaction", "external", "user control", "environment", "weather", "rain", "wind", "sunlight", "rider", "road", "atmosphere"]
    let externalInterfaceCount = 0
    for (const m of modules) {
      for (const port of [...m.inputs, ...m.outputs]) {
        const lower = port.toLowerCase()
        if (envKeywords.some((kw) => lower.includes(kw))) {
          externalInterfaceCount++
          console.log(`    WARN: Possible external interface: "${port}" on ${m.id}`)
        }
      }
    }
    assert(externalInterfaceCount === 0, "No external interfaces in inputs/outputs", `found ${externalInterfaceCount}`)

    // Connectivity check — every output label should appear as an input somewhere
    const allOutputLabels = modules.flatMap((m) => m.outputs)
    const allInputLabels = modules.flatMap((m) => m.inputs)
    let unmatchedOutputs = 0
    for (const output of allOutputLabels) {
      const hasMatch = allInputLabels.some((input) => input === output || hasKeywordOverlap(output, input))
      if (!hasMatch) {
        unmatchedOutputs++
        console.log(`    WARN: Output "${output}" has no matching input`)
      }
    }
    // This is a warning, not a hard fail — some orphaned ports are expected
    console.log(`    INFO: ${unmatchedOutputs}/${allOutputLabels.length} outputs unmatched`)

  } catch (err) {
    console.log(`    ERROR: Decomposition failed — ${err.message.slice(0, 200)}`)
    result.modules = null
  }

  if (!result.modules) {
    console.log("    Skipping remaining phases (no modules)")
    allResults.push(result)
    continue
  }

  // ── Phase 2: Edge Building + Signal Classification (no AI) ─────────

  console.log("\n  Phase 2: Edge Building + Signal Classification (pure logic)")
  const edges = buildEdges(result.modules)
  result.edges = edges

  console.log(`    Built ${edges.length} edges from keyword overlap`)

  // Signal type distribution
  const signalDist = {}
  for (const e of edges) {
    signalDist[e.signalType] = (signalDist[e.signalType] || 0) + 1
  }
  console.log(`    Signal types: ${JSON.stringify(signalDist)}`)

  assert(edges.length > 0, "At least 1 edge built")

  // Check no "motor torque" → data misclassification
  for (const e of edges) {
    if (e.label.toLowerCase().includes("torque")) {
      assert(e.signalType === "mechanical", `"${e.label}" classified as mechanical`, `got ${e.signalType}`)
    }
    // "motor" alone shouldn't trigger data, but "Motor position feedback" is correctly
    // data because "feedback" is a data keyword. Only flag if no other data keyword present.
    if (e.label.toLowerCase().includes("motor")) {
      const otherDataKeywords = SIGNAL_KEYWORDS.data.filter((kw) => kw !== "motor")
      const hasOtherDataKw = otherDataKeywords.some((kw) => e.label.toLowerCase().includes(kw))
      if (!hasOtherDataKw) {
        assert(e.signalType !== "data", `"${e.label}" not classified as data (motor alone is not a data keyword)`)
      }
    }
  }

  // Check no duplicate edges
  const edgeKeys = edges.map((e) => `${e.from}->${e.to}::${e.label}`)
  assert(new Set(edgeKeys).size === edgeKeys.length, "No duplicate edges")

  // ── Phase 3: Interface Contracts (AI) ──────────────────────────────

  console.log("\n  Phase 3: Interface Contracts")
  try {
    const totalOutputs = result.modules.reduce((sum, m) => sum + m.outputs.length, 0)
    const totalInputs = result.modules.reduce((sum, m) => sum + m.inputs.length, 0)

    const moduleSummary = result.modules.map((m) => {
      const outputList = m.outputs.map((o, i) => `  ${i + 1}. "${o}"`).join("\n")
      const inputList = m.inputs.map((inp, i) => `  ${i + 1}. "${inp}"`).join("\n")
      return [
        `## ${m.name} (id: ${m.id})`,
        `Purpose: ${m.purpose}`,
        `Outputs (${m.outputs.length}):`, outputList,
        `Inputs (${m.inputs.length}):`, inputList,
      ].join("\n")
    }).join("\n\n")

    const systemPrompt = INTERFACE_CONTRACT_SYSTEM.replace(
      /\$\{totalOutputs\} outputs and \$\{totalInputs\} inputs/,
      `${totalOutputs} outputs and ${totalInputs} inputs`,
    )

    const userPrompt = `Here are the modules to analyse:\n\n${moduleSummary}`
    const res = await callClaude(systemPrompt, userPrompt, `${product.name} contracts`)
    console.log(`    API: ${res.elapsed}s, ${res.tokensIn} in / ${res.tokensOut} out`)

    const contracts = parseJsonFromResponse(res.text)
    result.contracts = contracts

    assert(Array.isArray(contracts), "Contracts response is JSON array")
    assert(contracts.length > 0, "At least 1 contract")

    // Validate contract schema
    const moduleIds = new Set(result.modules.map((m) => m.id))
    const validPortTypes = new Set(["power", "data", "mechanical", "thermal", "fluid", "optical", "other"])
    let validContracts = 0
    let invalidContracts = 0

    for (const c of contracts) {
      const sourceValid = moduleIds.has(c.sourceModuleId) || c.sourceModuleId === "external"
      const targetValid = moduleIds.has(c.targetModuleId) || c.targetModuleId === "external"
      const typeValid = validPortTypes.has(c.portType)

      if (sourceValid && targetValid && typeValid) {
        validContracts++
      } else {
        invalidContracts++
        if (!sourceValid) console.log(`    WARN: Invalid sourceModuleId "${c.sourceModuleId}"`)
        if (!targetValid) console.log(`    WARN: Invalid targetModuleId "${c.targetModuleId}"`)
        if (!typeValid) console.log(`    WARN: Invalid portType "${c.portType}"`)
      }

      // No self-contracts
      if (c.sourceModuleId !== "external" && c.targetModuleId !== "external") {
        assert(c.sourceModuleId !== c.targetModuleId, `No self-contract`, `${c.sourceModuleId} → ${c.targetModuleId}`)
      }
    }

    assert(validContracts > 0, `Valid contracts exist`, `${validContracts} valid, ${invalidContracts} invalid`)
    console.log(`    ${validContracts} valid contracts, ${invalidContracts} invalid`)

  } catch (err) {
    console.log(`    ERROR: Interface contracts failed — ${err.message.slice(0, 200)}`)
    result.contracts = null
  }

  // ── Phase 4: Diagnostic Prefill (AI) ───────────────────────────────

  console.log("\n  Phase 4: Diagnostic Prefill")
  try {
    const role = DIAGNOSTICS_ROLE[product.domain]
    const systemPrompt = `${role}\n\n${BASE_DIAGNOSTICS}`
    const moduleList = result.modules.map((m) => `- ${m.name} (id: ${m.id}): ${m.purpose}`).join("\n")
    const userPrompt = `Modules:\n${moduleList}\n\nProvide diagnostic prefill for each module.`

    const res = await callClaude(systemPrompt, userPrompt, `${product.name} diagnostics`)
    console.log(`    API: ${res.elapsed}s, ${res.tokensIn} in / ${res.tokensOut} out`)

    const diagnostics = parseJsonFromResponse(res.text)
    result.diagnostics = diagnostics

    assert(typeof diagnostics === "object" && !Array.isArray(diagnostics), "Diagnostics is JSON object")

    const moduleIds = result.modules.map((m) => m.id)
    const diagIds = Object.keys(diagnostics)

    // Check all module IDs present
    for (const id of moduleIds) {
      assert(diagIds.includes(id), `Diagnostic for module "${id}"`, `missing`)
    }

    // Validate field values
    const allowedFields = {
      mfg_process: ["FDM 3D Print", "SLA/Resin Print", "SLS/Powder Print", "CNC Machining", "Sheet Metal", "Injection Molding", "Casting", "Manual/Assembly", "Other"],
      material: ["PLA/PETG", "ABS/Nylon", "Resin (standard)", "Aluminum 6061", "Steel (mild)", "Stainless Steel", "Titanium", "Copper/Brass", "Carbon Fiber", "Wood/Plywood", "Other"],
      tolerance: ["Loose (±1mm)", "Standard (±0.5mm)", "Precision (±0.1mm)", "Tight (±0.05mm)", "Ultra-tight (±0.01mm)"],
      surface_finish: ["As-manufactured", "Sanded/Deburred", "Painted/Coated", "Anodized", "Polished", "Plated", "N/A"],
      batch_size: ["Prototype (1-5)", "Small batch (10-50)", "Medium (50-500)", "Production (500+)", "Mass production (10k+)"],
      environment: ["Indoor (office)", "Indoor (industrial)", "Outdoor (temperate)", "Outdoor (harsh)", "High temperature", "Wet/Marine", "Corrosive", "Cleanroom", "Space/Vacuum"],
    }

    for (const [moduleId, diag] of Object.entries(diagnostics)) {
      if (!moduleIds.includes(moduleId)) continue
      for (const [field, allowed] of Object.entries(allowedFields)) {
        const val = diag[field]
        if (val) {
          // Fuzzy match — AI sometimes adds minor variations
          const exactMatch = allowed.includes(val)
          const fuzzyMatch = allowed.some((a) => val.toLowerCase().includes(a.toLowerCase().slice(0, 8)))
          if (!exactMatch && !fuzzyMatch) {
            console.log(`    WARN: ${moduleId}.${field} = "${val}" — not in allowed list`)
          }
        }
      }
    }

  } catch (err) {
    console.log(`    ERROR: Diagnostic prefill failed — ${err.message.slice(0, 200)}`)
    result.diagnostics = null
  }

  // ── Phase 5: Hybrid Edges (no AI) ──────────────────────────────────

  console.log("\n  Phase 5: Hybrid Edges (pure logic)")
  if (result.contracts) {
    const hybridEdges = buildEdgesHybrid(result.contracts, result.modules)
    result.hybridEdges = hybridEdges

    const contractOnlyEdges = buildEdgesFromContracts(result.contracts, result.modules)

    console.log(`    Contract edges: ${contractOnlyEdges.length}`)
    console.log(`    Hybrid edges: ${hybridEdges.length} (gap-filled ${hybridEdges.length - contractOnlyEdges.length})`)

    assert(hybridEdges.length >= contractOnlyEdges.length, "Hybrid >= contract edges")

    // No duplicate hybrid edges
    const hybridKeys = hybridEdges.map((e) => `${e.from}->${e.to}::${e.sourceHandle}->${e.targetHandle}`)
    assert(new Set(hybridKeys).size === hybridKeys.length, "No duplicate hybrid edges", `${hybridEdges.length} edges, ${new Set(hybridKeys).size} unique`)

    // Signal type distribution
    const hybridDist = {}
    for (const e of hybridEdges) {
      hybridDist[e.signalType] = (hybridDist[e.signalType] || 0) + 1
    }
    console.log(`    Hybrid signal types: ${JSON.stringify(hybridDist)}`)
  } else {
    console.log(`    Skipped — no contracts available`)
  }

  allResults.push(result)
}

// ─── Summary ───────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70))
console.log("  SUMMARY")
console.log("=".repeat(70))
console.log(`\n  Total tests: ${totalTests}`)
console.log(`  Passed: ${passedTests}`)
console.log(`  Failed: ${failedTests}`)

if (failures.length > 0) {
  console.log("\n  Failures:")
  for (const f of failures) {
    console.log(`    - ${f}`)
  }
}

for (const r of allResults) {
  console.log(`\n  ${r.name} (${r.domain}):`)
  console.log(`    Modules: ${r.modules?.length ?? "FAILED"}`)
  console.log(`    Keyword edges: ${r.edges?.length ?? "N/A"}`)
  console.log(`    Contracts: ${r.contracts?.length ?? "FAILED"}`)
  console.log(`    Diagnostics: ${r.diagnostics ? Object.keys(r.diagnostics).length + " modules" : "FAILED"}`)
  console.log(`    Hybrid edges: ${r.hybridEdges?.length ?? "N/A"}`)
}

console.log("\n" + "=".repeat(70))
if (failedTests === 0) {
  console.log("  ALL TESTS PASSED")
} else {
  console.log(`  ${failedTests} TEST(S) FAILED`)
}
console.log("=".repeat(70))

process.exit(failedTests > 0 ? 1 : 0)
