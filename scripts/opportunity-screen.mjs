/**
 * @file opportunity-screen.mjs
 * @description Screens solopreneur businesses that replace expensive manual work
 *   with AI and Earth-observation data. State is a graph. Each stage is a loop
 *   that reads the graph and writes it back. Model calls go only to OpenRouter.
 * @security Reads OPENROUTER_API_KEY from the environment or .env.local.
 *   The key is never logged, written to the graph, or included in errors.
 *
 * Usage:
 *   node scripts/opportunity-screen.mjs            # run every unfinished stage
 *   node scripts/opportunity-screen.mjs --selftest # renderer + score math, no API
 *   node scripts/opportunity-screen.mjs --report   # re-render the markdown only
 *
 * Roles are pinned at runtime from GET /api/v1/models (2026-10-06 catalogue
 * used as the preference list). Web search uses the openrouter:web_search
 * server tool. The deprecated ":online" suffix is not required.
 */

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, "Business", "opportunity-screens")
const GRAPH_PATH = path.join(OUT_DIR, "graph.json")
const REPORT_PATH = path.join(OUT_DIR, "2026-10-eo-ai-solopreneur.md")

/** Preferred ids from the live catalogue on 2026-10-06. Runtime pin confirms each still exists. */
const PREFERRED = {
  cheapOnline: "google/gemini-3.5-flash-lite",
  evidenceOnline: "google/gemini-3.8-flash",
  cheapStructured: "z-ai/glm-5.3-flash",
  strongJudge: "x-ai/grok-4.7",
  factCheck: "xiaomi/mimo-v2.6-flash",
}

const WEIGHTS = {
  existingSpend: 1.4,
  aiLeverage: 1.2,
  eoLeverage: 1.0,
  salesCycle: 1.3,
  timeToRevenue: 1.3,
  usProof: 1.2,
  founderMoat: 1.0,
}

const SCORE_KEYS = Object.keys(WEIGHTS)

const PLAN_SECTIONS = [
  ["executiveSummary", "1. Executive Summary"],
  ["companyDescription", "2. Company Description"],
  ["marketAnalysis", "3. Market Analysis"],
  ["organization", "4. Organization and Management"],
  ["products", "5. Products and Services"],
  ["marketing", "6. Marketing and Sales Strategy"],
  ["financials", "7. Financial Projections"],
  ["funding", "8. Funding Requirements"],
]

const SECTORS = [
  { id: "insurance-catastrophe", name: "Insurance and catastrophe", brief: "Claims, underwriting, and accumulation that insurers and reinsurers still do with adjusters, desktop surveys, or slow vendor reports." },
  { id: "crop-subsidy", name: "Crops, subsidies, and carbon", brief: "Farm payments, conditionality checks, yield estimates, and carbon or regenerative claims that inspectors still walk." },
  { id: "infrastructure-utilities", name: "Infrastructure and utilities inspection", brief: "Rails, roads, bridges, power lines, pipelines, and vegetation management that asset owners pay crews or helicopter patrols to inspect." },
  { id: "construction-quantities", name: "Construction quantities and progress", brief: "Earthworks, progress claims, and stockpile volumes that surveyors still measure on site for contractors and lenders." },
  { id: "ports-commodities", name: "Ports and commodity signals", brief: "Port congestion, tank inventories, ship queues, and bulk commodity flows that traders and operators still buy as expensive manual or delayed research." },
  { id: "mining-quarry", name: "Mining and quarry volumes", brief: "Stockpiles, pit volumes, and compliance surveys that mines and quarries pay survey teams to repeat." },
  { id: "forestry", name: "Forestry and timber", brief: "Standing timber inventory, harvest compliance, pest and windthrow detection that owners and agencies still cruise on foot." },
  { id: "solar-wind-ops", name: "Solar and wind operations", brief: "Site screening, soiling, wake, and asset-health checks that developers and operators still send people or manned aircraft to do." },
  { id: "environmental-compliance", name: "Environmental compliance", brief: "Methane, water quality, illegal dumping, and permit monitoring that regulators and operators still staff with site visits." },
  { id: "flood-property", name: "Flood and property diligence", brief: "Flood, subsidence, and change-detection checks that insurers, lenders, and conveyancers still buy as slow desktop or surveyor reports." },
  { id: "planning-enforcement", name: "Planning enforcement", brief: "Unauthorised development and land-use change that UK and EU local authorities still find by complaint and site visit." },
]

const SYSTEM = `You screen businesses for a UK solopreneur who is already strong with current AI models and has been doing space and Earth-observation work. He will not build a satellite.

Never invent a company, a person, a price, a funding round, or a customer. If a search did not retrieve a source, omit the claim. A missing number is a valid result. Put every factual claim's URL inside the JSON. Return JSON only, with no prose before or after it.`

function log(message) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
}

function isFatalKey(error) {
  return /OPENROUTER_API_KEY|credits exhausted/.test(error instanceof Error ? error.message : String(error))
}

function loadKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim()
  const envPath = path.join(ROOT, ".env.local")
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, "utf8").match(/^OPENROUTER_API_KEY=(.+)$/m)
    if (match) return match[1].trim().replace(/^["']|["']$/g, "")
  }
  throw new Error("OPENROUTER_API_KEY is not set and .env.local does not contain it")
}

function emptyGraph() {
  return {
    createdAt: new Date().toISOString(),
    models: null,
    weights: WEIGHTS,
    ideas: [],
    nodes: [],
    edges: [],
    log: [],
    usage: { calls: 0, promptTokens: 0, completionTokens: 0, estimatedUsd: 0 },
  }
}

function loadGraph() {
  if (!fs.existsSync(GRAPH_PATH)) return emptyGraph()
  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8"))
  graph.ideas ||= []
  graph.log ||= []
  graph.usage ||= { calls: 0, promptTokens: 0, completionTokens: 0, estimatedUsd: 0 }
  graph.weights = WEIGHTS
  return graph
}

let saveChain = Promise.resolve()

function saveGraph(graph) {
  rebuildDerived(graph)
  saveChain = saveChain.then(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const tmp = `${GRAPH_PATH}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(graph, null, 2))
    fs.renameSync(tmp, GRAPH_PATH)
  })
  return saveChain
}

function slug(value) {
  return String(value || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "x"
}

function mermaidId(value) {
  const cleaned = slug(value).replace(/-/g, "_")
  return /^[0-9]/.test(cleaned) ? `n_${cleaned}` : cleaned
}

function mermaidLabel(value) {
  return String(value || "").replace(/"/g, "'").replace(/[\[\]{}|]/g, " ").slice(0, 72)
}

function clip(value, max) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "")
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function weightedScore(scores) {
  let num = 0
  let den = 0
  for (const key of SCORE_KEYS) {
    const raw = Number(scores?.[key])
    if (!Number.isFinite(raw)) continue
    num += raw * WEIGHTS[key]
    den += WEIGHTS[key]
  }
  return den ? Math.round((num / den) * 100) / 100 : 0
}

function passesHard(idea) {
  const filters = idea.hardFilters || {}
  return Boolean(filters.payer && filters.solopreneur && filters.namedCompany && filters.ukeuWedge)
}

function hasSource(idea) {
  return (idea.sources || []).some((source) => /^https?:\/\//.test(source.url || ""))
    || /^https?:\/\//.test(idea.analog?.url || "")
}

function parseJson(text) {
  if (!text || !String(text).trim()) throw new Error("empty model text")
  let body = String(text).trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) body = fenced[1].trim()
  const objectStart = body.indexOf("{")
  const arrayStart = body.indexOf("[")
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart)
  if (start < 0) throw new Error(`no JSON in: ${body.slice(0, 180)}`)
  const open = body[start]
  const close = open === "{" ? "}" : "]"
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error("truncated JSON")
  return JSON.parse(body.slice(start, end + 1))
}

function messageText(message) {
  if (!message) return ""
  const content = message.content
  if (typeof content === "string" && content.trim()) return content
  if (Array.isArray(content)) {
    const joined = content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n")
    if (joined.trim()) return joined
  }
  return message.reasoning_content || message.reasoning || ""
}

function priceOf(modelInfo, kind) {
  const raw = modelInfo?.pricing?.[kind]
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

async function pinModels(graph) {
  const response = await fetch("https://openrouter.ai/api/v1/models")
  if (!response.ok) throw new Error(`model catalogue HTTP ${response.status}`)
  const payload = await response.json()
  const models = payload.data || []
  const byId = new Map(models.map((model) => [model.id, model]))

  function pick(preferred, fallback) {
    if (byId.has(preferred)) return byId.get(preferred)
    const found = models.find(fallback)
    if (!found) throw new Error(`no catalogue match for ${preferred}`)
    log(`preferred ${preferred} missing; using ${found.id}`)
    return found
  }

  const chosen = {
    cheapOnline: pick(PREFERRED.cheapOnline, (model) => /^google\/gemini-.*flash-lite$/.test(model.id) && !model.id.includes("image")),
    evidenceOnline: pick(PREFERRED.evidenceOnline, (model) => /^google\/gemini-3\.\d-flash$/.test(model.id)),
    cheapStructured: pick(PREFERRED.cheapStructured, (model) => /^z-ai\/glm-.*flash$/.test(model.id) && !model.id.includes("batch")),
    strongJudge: pick(PREFERRED.strongJudge, (model) => /^x-ai\/grok-4\.\d+$/.test(model.id)),
    factCheck: pick(PREFERRED.factCheck, (model) => /^xiaomi\/mimo-.*-flash$/.test(model.id)),
  }

  graph.models = {
    pinnedAt: new Date().toISOString(),
    catalogueCount: models.length,
    roles: Object.fromEntries(Object.entries(chosen).map(([role, model]) => [role, {
      id: model.id,
      promptPerToken: priceOf(model, "prompt"),
      completionPerToken: priceOf(model, "completion"),
      webSearchUsd: priceOf(model, "web_search"),
    }])),
  }
  graph.log.push({ at: new Date().toISOString(), stage: "pin", detail: Object.values(graph.models.roles).map((role) => role.id).join(", ") })
  await saveGraph(graph)
  log(`pinned ${graph.models.catalogueCount} models; judge=${graph.models.roles.strongJudge.id}`)
}

function roleModel(graph, role) {
  const info = graph.models?.roles?.[role]
  if (!info?.id) throw new Error(`models not pinned; missing ${role}`)
  return info
}

async function chat(graph, { role, system, user, web, maxTokens, temperature, reasoning }) {
  const apiKey = loadKey()
  const info = roleModel(graph, role)
  const body = {
    model: info.id,
    messages: [
      { role: "system", content: system || SYSTEM },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens ?? 4000,
    temperature: temperature ?? 0.2,
  }
  if (web) body.tools = [{ type: "openrouter:web_search", parameters: web }]
  if (reasoning) body.reasoning = { effort: reasoning }

  let lastError = ""
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://fractionalforge.com",
          "X-Title": "ForgeOS opportunity screen",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      })
      const raw = await response.text()
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${raw.slice(0, 240)}`
        if (response.status === 402) throw new Error(`OpenRouter credits exhausted: ${lastError}`)
        if (![408, 409, 429, 500, 502, 503, 529].includes(response.status) || attempt === 3) {
          throw new Error(lastError)
        }
        await delay(1500 * attempt)
        continue
      }
      const json = JSON.parse(raw)
      const text = messageText(json.choices?.[0]?.message)
      const usage = json.usage || {}
      const promptTokens = usage.prompt_tokens || 0
      const completionTokens = usage.completion_tokens || 0
      graph.usage.calls += 1
      graph.usage.promptTokens += promptTokens
      graph.usage.completionTokens += completionTokens
      graph.usage.estimatedUsd += promptTokens * info.promptPerToken + completionTokens * info.completionPerToken
      if (web) graph.usage.estimatedUsd += info.webSearchUsd || 0
      if (!text.trim()) {
        lastError = "empty content"
        if (attempt === 3) throw new Error("empty content")
        await delay(1000 * attempt)
        continue
      }
      return text
    } catch (error) {
      if (String(error.message || error).includes("credits exhausted")) throw error
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === 3) throw new Error(lastError)
      await delay(1500 * attempt)
    }
  }
  throw new Error(lastError || "chat failed")
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function chatJson(graph, options) {
  let extra = ""
  let lastError = ""
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const text = await chat(graph, { ...options, user: options.user + extra })
    try {
      return parseJson(text)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      extra = `\n\nYour previous reply was not valid JSON (${lastError}). Return only the JSON object.`
    }
  }
  throw new Error(`JSON parse failed: ${lastError}`)
}

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

function normaliseIdea(raw, sector) {
  const analog = raw.analog || {}
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((source) => source && source.url) : []
  return {
    id: `${sector.id}-${slug(raw.title).slice(0, 28)}-${Math.random().toString(36).slice(2, 6)}`,
    sector: sector.id,
    sectorName: sector.name,
    title: String(raw.title || "").trim(),
    oneLiner: String(raw.oneLiner || "").trim(),
    job: String(raw.job || "").trim(),
    payer: String(raw.payer || "").trim(),
    manualCost: String(raw.manualCost || "").trim(),
    whyAi: String(raw.whyAi || "").trim(),
    whyEo: String(raw.whyEo || "").trim(),
    deathRisk: String(raw.deathRisk || "").trim(),
    ukeuWedge: String(raw.ukeuWedge || "").trim(),
    displacedBy: String(raw.displacedBy || raw.manualMethod || "").trim(),
    dataSources: Array.isArray(raw.dataSources) ? raw.dataSources.map(String) : [],
    analog: {
      name: String(analog.name || "").trim(),
      what: String(analog.what || "").trim(),
      signal: String(analog.signal || "").trim(),
      url: String(analog.url || "").trim(),
      whyAhead: String(analog.whyAhead || "").trim(),
    },
    sources,
    tier: "pool",
  }
}

function ideaBrief(idea) {
  return {
    id: idea.id,
    title: idea.title,
    sector: idea.sectorName,
    oneLiner: idea.oneLiner,
    job: idea.job,
    payer: idea.payer,
    manualCost: idea.manualCost,
    whyAi: idea.whyAi,
    whyEo: idea.whyEo,
    deathRisk: idea.deathRisk,
    ukeuWedge: idea.ukeuWedge,
    displacedBy: idea.displacedBy,
    dataSources: idea.dataSources,
    analog: idea.analog,
    sources: idea.sources,
  }
}

const SWEEP_SHAPE = `Return ONLY this JSON shape:
{"ideas":[{"title":"","oneLiner":"","job":"","payer":"","manualCost":"","displacedBy":"","whyAi":"","whyEo":"","deathRisk":"","ukeuWedge":"","dataSources":[""],"analog":{"name":"","what":"","signal":"","url":"","whyAhead":""},"sources":[{"claim":"","url":""}]}]}`

async function sweepSector(graph, sector, avoidTitles) {
  const avoid = avoidTitles.length ? `\nDo not repeat these titles or the same workflow under a new name:\n${avoidTitles.map((title) => `- ${title}`).join("\n")}` : ""
  const data = await chatJson(graph, {
    role: "cheapOnline",
    web: { engine: "native", max_uses: 3, search_context_size: "low" },
    maxTokens: 5000,
    temperature: 0.4,
    user: `Today is 2026-10-06. Search the web. Sector: ${sector.name}.
${sector.brief}

Return TWO distinct business ideas a UK solopreneur could start. Each idea is a service sold to an organisation that already pays a lot, or is legally forced to pay, for a manual or field-heavy version of this work. Prefer a US company that is already selling a version of it and growing, where the UK or EU is slower.

Rules:
- Name a real company and one growth or spend signal (funding, revenue, contract, headcount, or a named customer) with the URL you retrieved.
- The founder starts with models he already uses plus Copernicus or a commercial imagery archive. No spacecraft, no field crew, no licence that blocks the first invoice.
- The two ideas must be different workflows.
- manualCost may describe the spend qualitatively when no public number exists. Do not invent a figure.
${avoid}

${SWEEP_SHAPE}`,
  })
  const ideas = Array.isArray(data.ideas) ? data.ideas : []
  return ideas.map((raw) => normaliseIdea(raw, sector)).filter((idea) => idea.title && hasSource(idea))
}

async function stageSweep(graph) {
  const have = new Set(graph.ideas.map((idea) => idea.sector))
  const pending = SECTORS.filter((sector) => !have.has(sector.id))
  if (!pending.length && graph.ideas.length) {
    log(`sweep already has ${graph.ideas.length} ideas`)
    return
  }
  log(`sweep ${pending.length} sectors`)
  await pool(pending, 3, async (sector) => {
    try {
      const ideas = await sweepSector(graph, sector, [])
      graph.ideas.push(...ideas)
      graph.log.push({ at: new Date().toISOString(), stage: "sweep", detail: `${sector.id}: ${ideas.length}` })
      await saveGraph(graph)
      log(`sweep ${sector.id} -> ${ideas.length}`)
    } catch (error) {
      if (isFatalKey(error)) throw error
      log(`sweep ${sector.id} failed: ${error.message}`)
      graph.log.push({ at: new Date().toISOString(), stage: "sweep-error", detail: `${sector.id}: ${error.message}` })
      await saveGraph(graph)
    }
  })
}

async function stageGapFill(graph) {
  const passing = graph.ideas.filter((idea) => idea.tier !== "duplicate" && passesHard(idea) && idea.scores)
  const poolCount = graph.ideas.filter((idea) => idea.tier !== "duplicate" && idea.tier !== "dropped").length
  if (passing.length >= 20 || graph.gapRounds >= 2) return
  graph.gapRounds = (graph.gapRounds || 0) + 1
  const titles = graph.ideas.map((idea) => idea.title).filter(Boolean)
  const weak = SECTORS.map((sector) => ({
    sector,
    count: graph.ideas.filter((idea) => idea.sector === sector.id && idea.tier !== "duplicate").length,
  })).sort((a, b) => a.count - b.count).slice(0, 4)
  log(`gap-fill round ${graph.gapRounds}; live ideas ${poolCount}; scored-pass ${passing.length}`)
  await pool(weak, 2, async ({ sector }) => {
    try {
      const ideas = await sweepSector(graph, sector, titles)
      for (const idea of ideas) {
        idea.gapRound = graph.gapRounds
        graph.ideas.push(idea)
      }
      await saveGraph(graph)
      log(`gap ${sector.id} -> ${ideas.length}`)
    } catch (error) {
      if (isFatalKey(error)) throw error
      log(`gap ${sector.id} failed: ${error.message}`)
    }
  })
}

async function stageDedupe(graph) {
  const live = graph.ideas.filter((idea) => idea.tier !== "duplicate" && idea.tier !== "dropped")
  if (live.length < 2 || graph.dedupedAt) return
  const listing = live.map((idea) => `${idea.id} | ${idea.title} | ${idea.oneLiner}`).join("\n")
  try {
    const data = await chatJson(graph, {
      role: "cheapStructured",
      maxTokens: 3000,
      temperature: 0,
      reasoning: "low",
      user: `Cluster these business ideas. Two ideas are duplicates when a buyer would see them as the same offer. Return JSON {"clusters":[{"keep":"<id>","drop":["<id>"],"reason":""}]}. Only include clusters that drop at least one id. Do not invent ids.\n\n${listing}`,
    })
    const clusters = Array.isArray(data.clusters) ? data.clusters : []
    const byId = new Map(graph.ideas.map((idea) => [idea.id, idea]))
    for (const cluster of clusters) {
      for (const dropId of cluster.drop || []) {
        const idea = byId.get(dropId)
        if (!idea || idea.id === cluster.keep) continue
        idea.tier = "duplicate"
        idea.dropReason = `Duplicate of ${cluster.keep}: ${cluster.reason || "same offer"}`
      }
    }
    graph.dedupedAt = new Date().toISOString()
    graph.log.push({ at: graph.dedupedAt, stage: "dedupe", detail: `${clusters.length} clusters` })
    await saveGraph(graph)
    log(`dedupe clusters ${clusters.length}`)
  } catch (error) {
    log(`dedupe skipped: ${error.message}`)
  }
}

async function stageAnalogs(graph) {
  const needs = graph.ideas.filter((idea) => idea.tier === "pool" && !idea.analog?.url)
  if (!needs.length) return
  log(`analog lookup ${needs.length}`)
  await pool(needs, 3, async (idea) => {
    try {
      const data = await chatJson(graph, {
        role: "cheapOnline",
        web: { engine: "native", max_uses: 2, search_context_size: "low" },
        maxTokens: 2500,
        user: `Search for a real company, preferably in the US, already selling something close to this offer, with a public growth or spend signal from 2024-2026.\n\nOffer: ${idea.title}\n${idea.oneLiner}\nBuyer: ${idea.payer}\n\nReturn JSON {"name":"","what":"","signal":"","url":"","whyAhead":"","sources":[{"claim":"","url":""}]}. If you cannot verify a company, set name to "" and url to "".`,
      })
      if (data.url) {
        idea.analog = {
          name: String(data.name || "").trim(),
          what: String(data.what || "").trim(),
          signal: String(data.signal || "").trim(),
          url: String(data.url || "").trim(),
          whyAhead: String(data.whyAhead || "").trim(),
        }
        for (const source of data.sources || []) {
          if (source?.url) idea.sources.push(source)
        }
      }
      await saveGraph(graph)
      log(`analog ${idea.title.slice(0, 40)} -> ${idea.analog.name || "none"}`)
    } catch (error) {
      log(`analog failed ${idea.id}: ${error.message}`)
    }
  })
}

function clampScore(value) {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return 1
  return Math.min(5, Math.max(1, number))
}

async function stageScore(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "pool" && !idea.scores && hasSource(idea))
  if (!pending.length) return
  log(`score ${pending.length}`)
  const batches = []
  for (let index = 0; index < pending.length; index += 4) batches.push(pending.slice(index, index + 4))
  for (const batch of batches) {
    const packet = batch.map(ideaBrief)
    try {
      const data = await chatJson(graph, {
        role: "strongJudge",
        maxTokens: 4000,
        temperature: 0.1,
        reasoning: "low",
        user: `Score these ideas for a UK solopreneur. Use only the notes given. Do not add companies or numbers that are not in the notes.

Hard filters (true only if the notes support them):
- payer: a buyer already pays, or is forced to pay, for this work done manually
- solopreneur: one founder can start with existing AI models plus buyable or public satellite data, with no spacecraft and no team before the first invoice
- namedCompany: a real company is named and a source URL is present
- ukeuWedge: there is a UK or EU reason this is not already won by the US company opening a London office next quarter

Scores are integers 1-5:
- existingSpend, aiLeverage, eoLeverage, salesCycle (5 = a short cycle a solo founder can run), timeToRevenue (5 = weeks, 1 = years), usProof, founderMoat

Return JSON {"results":[{"id":"","hardFilters":{"payer":true,"solopreneur":true,"namedCompany":true,"ukeuWedge":true},"hardNotes":"","scores":{"existingSpend":1,"aiLeverage":1,"eoLeverage":1,"salesCycle":1,"timeToRevenue":1,"usProof":1,"founderMoat":1},"rationale":""}]}

Ideas:
${JSON.stringify(packet)}`,
      })
      const byId = new Map(batch.map((idea) => [idea.id, idea]))
      for (const row of data.results || []) {
        const idea = byId.get(row.id)
        if (!idea) continue
        idea.hardFilters = {
          payer: Boolean(row.hardFilters?.payer),
          solopreneur: Boolean(row.hardFilters?.solopreneur),
          namedCompany: Boolean(row.hardFilters?.namedCompany) && Boolean(idea.analog?.name) && hasSource(idea),
          ukeuWedge: Boolean(row.hardFilters?.ukeuWedge),
        }
        idea.hardNotes = String(row.hardNotes || "")
        idea.scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, clampScore(row.scores?.[key])]))
        idea.weighted = weightedScore(idea.scores)
        idea.scoreRationale = String(row.rationale || "")
        if (!passesHard(idea)) {
          idea.tier = "dropped"
          idea.dropReason = idea.hardNotes || "Failed a hard filter"
        }
      }
      await saveGraph(graph)
      log(`scored batch ${batch.map((idea) => idea.weighted || "-").join(", ")}`)
    } catch (error) {
      log(`score batch failed: ${error.message}`)
      throw error
    }
  }
}

function selectTier(graph, fromTier, toTier, count, reason) {
  const ranked = graph.ideas
    .filter((idea) => idea.tier === fromTier)
    .sort((a, b) => (b.weighted || 0) - (a.weighted || 0))
  ranked.forEach((idea, index) => {
    if (index < count) idea.tier = toTier
    else {
      idea.tier = "dropped"
      idea.dropReason = reason
    }
  })
  return ranked.filter((idea) => idea.tier === toTier).length
}

async function stageSelect20(graph) {
  if (graph.ideas.some((idea) => idea.tier === "20" || idea.tier === "10" || idea.tier === "5")) return
  const eligible = graph.ideas.filter((idea) => idea.tier === "pool" && idea.scores && passesHard(idea))
  eligible.sort((a, b) => b.weighted - a.weighted)
  eligible.forEach((idea, index) => {
    if (index < 20) idea.tier = "20"
    else {
      idea.tier = "dropped"
      idea.dropReason = "Passed the filters and ranked below the top 20"
    }
  })
  graph.log.push({ at: new Date().toISOString(), stage: "select20", detail: String(graph.ideas.filter((idea) => idea.tier === "20").length) })
  await saveGraph(graph)
  log(`selected ${graph.ideas.filter((idea) => idea.tier === "20").length} of 20`)
}

async function stageKill(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "20" && !idea.kill)
  if (pending.length) {
  log(`kill-pass ${pending.length}`)
  const batches = []
  for (let index = 0; index < pending.length; index += 4) batches.push(pending.slice(index, index + 4))
  for (const batch of batches) {
    const data = await chatJson(graph, {
      role: "strongJudge",
      maxTokens: 4000,
      temperature: 0.2,
      reasoning: "low",
      user: `You are trying to kill these business ideas. A kill is valid only when you can name a concrete failure from the notes: the buyer will not pay a solo founder, the US company is already selling in the UK, the data cannot actually be bought, a certificate blocks the first invoice, or the sales cycle is longer than a year. A vague doubt is not a kill. Set killed to false when the concrete failure is not in the notes.

Return JSON {"results":[{"id":"","killed":false,"case":"","residual":"what still holds if the kill fails"}]}

Ideas:
${JSON.stringify(batch.map(ideaBrief))}`,
    })
    const byId = new Map(batch.map((idea) => [idea.id, idea]))
    for (const row of data.results || []) {
      const idea = byId.get(row.id)
      if (!idea) continue
      idea.kill = {
        killed: Boolean(row.killed),
        case: String(row.case || ""),
        residual: String(row.residual || ""),
      }
    }
    await saveGraph(graph)
  }
  }
  const stillShort = graph.ideas.filter((idea) => idea.tier === "20")
  if (!stillShort.length || stillShort.some((idea) => !idea.kill)) return
  const survivors = graph.ideas.filter((idea) => idea.tier === "20" && idea.kill && !idea.kill.killed)
    .sort((a, b) => b.weighted - a.weighted)
  const wounded = graph.ideas.filter((idea) => idea.tier === "20" && idea.kill?.killed)
    .sort((a, b) => b.weighted - a.weighted)
  const kept = [...survivors, ...wounded].slice(0, 10)
  const keptIds = new Set(kept.map((idea) => idea.id))
  for (const idea of graph.ideas) {
    if (idea.tier !== "20") continue
    if (keptIds.has(idea.id)) {
      idea.tier = "10"
      if (idea.kill?.killed) idea.wounded = true
    } else {
      idea.tier = "dropped"
      idea.dropReason = idea.kill?.case || "Lost the kill-pass cut"
    }
  }
  graph.log.push({ at: new Date().toISOString(), stage: "kill", detail: `kept ${kept.length}; clean ${survivors.length}` })
  await saveGraph(graph)
  log(`kill kept ${kept.length} (clean ${Math.min(10, survivors.length)})`)
}

async function stageEvidence(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "10" && !idea.evidence)
  if (!pending.length) return
  log(`evidence ${pending.length}`)
  await pool(pending, 2, async (idea) => {
    const data = await chatJson(graph, {
      role: "evidenceOnline",
      web: { engine: "native", max_uses: 4, search_context_size: "medium" },
      maxTokens: 7000,
      temperature: 0.3,
      user: `Search and deepen this idea for a UK solopreneur. Mark guesses as [ASSUMPTION]. Every public fact needs a URL you retrieved. Do not invent prices or funding.

Idea:
${JSON.stringify(ideaBrief(idea))}

Return JSON with:
{
  "buyerSpend": "who pays, what the manual method costs or why it is compulsory, with URLs",
  "ukeuWedge": "the UK or EU opening",
  "dataStack": "the specific datasets a founder can pull or buy this month",
  "dataSources": [""],
  "analog": {"name":"","what":"","signal":"","url":"","whyAhead":"","pricing":""},
  "leanCanvas": {"problem":"","customerSegments":"","uvp":"","solution":"","unfairAdvantage":"","revenue":"","cost":"","metrics":"","channels":""},
  "sources": [{"claim":"","url":""}]
}`,
    })
    idea.evidence = data
    idea.buyerSpend = String(data.buyerSpend || "")
    idea.ukeuWedge = String(data.ukeuWedge || idea.ukeuWedge || "")
    idea.dataStack = String(data.dataStack || "")
    if (Array.isArray(data.dataSources) && data.dataSources.length) idea.dataSources = data.dataSources.map(String)
    if (data.analog?.url) {
      idea.analog = { ...idea.analog, ...data.analog, name: data.analog.name || idea.analog.name }
    }
    idea.leanCanvas = data.leanCanvas || {}
    for (const source of data.sources || []) {
      if (source?.url) idea.sources.push(source)
    }
    await saveGraph(graph)
    log(`evidence ${idea.title.slice(0, 48)}`)
  })
}

async function stageDebate(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "10" && !idea.debate)
  if (pending.length) {
  log(`debate ${pending.length}`)
  const batches = []
  for (let index = 0; index < pending.length; index += 5) batches.push(pending.slice(index, index + 5))
  for (const batch of batches) {
    const packet = batch.map((idea) => ({
      ...ideaBrief(idea),
      weighted: idea.weighted,
      kill: idea.kill,
      buyerSpend: clip(idea.buyerSpend, 800),
      dataStack: clip(idea.dataStack, 800),
      leanCanvas: idea.leanCanvas,
    }))
    const data = await chatJson(graph, {
      role: "strongJudge",
      maxTokens: 5000,
      temperature: 0.2,
      reasoning: "medium",
      user: `Adversarial cull. You have deeper evidence now. Kill an idea only for a concrete reason a careful founder would accept. Rank the survivors. We will keep five ideas across the whole set, so be willing to kill a merely-good idea when a better one is in the batch.

Return JSON {"results":[{"id":"","killed":false,"case":"","whyItStillRanks":""}]}

Ideas:
${JSON.stringify(packet)}`,
    })
    const byId = new Map(batch.map((idea) => [idea.id, idea]))
    for (const row of data.results || []) {
      const idea = byId.get(row.id)
      if (!idea) continue
      idea.debate = {
        killed: Boolean(row.killed),
        case: String(row.case || ""),
        whyItStillRanks: String(row.whyItStillRanks || ""),
      }
    }
    await saveGraph(graph)
  }
  }
  const stillTen = graph.ideas.filter((idea) => idea.tier === "10")
  if (!stillTen.length || stillTen.some((idea) => !idea.debate)) return
  const survivors = graph.ideas.filter((idea) => idea.tier === "10" && idea.debate && !idea.debate.killed)
    .sort((a, b) => b.weighted - a.weighted)
  const wounded = graph.ideas.filter((idea) => idea.tier === "10" && idea.debate?.killed)
    .sort((a, b) => b.weighted - a.weighted)
  const kept = [...survivors, ...wounded].slice(0, 5)
  const keptIds = new Set(kept.map((idea) => idea.id))
  for (const idea of graph.ideas) {
    if (idea.tier !== "10") continue
    if (keptIds.has(idea.id)) idea.tier = "5"
    else {
      idea.tier = "dropped"
      idea.dropReason = idea.debate?.case || "Lost the final cut"
      idea.finalistCut = true
    }
  }
  graph.log.push({ at: new Date().toISOString(), stage: "debate", detail: `finalists ${kept.length}` })
  await saveGraph(graph)
  log(`debate kept ${kept.length}`)
}

async function stagePlans(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "5" && !idea.plan)
  if (!pending.length) return
  log(`plans ${pending.length}`)
  for (const idea of pending) {
    const notes = {
      ...ideaBrief(idea),
      weighted: idea.weighted,
      scores: idea.scores,
      buyerSpend: idea.buyerSpend,
      dataStack: idea.dataStack,
      leanCanvas: idea.leanCanvas,
      kill: idea.kill,
      debate: idea.debate,
    }
    const data = await chatJson(graph, {
      role: "strongJudge",
      maxTokens: 12000,
      temperature: 0.3,
      reasoning: "medium",
      user: `Write the Lean Business Plan for this one idea, using only the notes. This is the ForgeOS startup business-plan stack: eight written sections, a Business Model Canvas, Helmer's 7 Powers, TAM/SAM/SOM both top-down and bottom-up, and unit economics.

Tag every figure [SOURCED] (URL is in the notes), [BENCHMARK] (you are using a stated industry pattern, name it), or [ASSUMPTION] (formula shown). Do not invent companies, rounds, or prices. Where the notes are thin, say what evidence is missing.

The founder is one person in the UK. First channel is one channel. First experiment is 90 days.

Return JSON:
{
  "plan": {"executiveSummary":"","companyDescription":"","marketAnalysis":"","organization":"","products":"","marketing":"","financials":"","funding":""},
  "bmc": {"customerSegments":"","valuePropositions":"","channels":"","customerRelationships":"","revenueStreams":"","keyResources":"","keyActivities":"","keyPartnerships":"","costStructure":""},
  "moat": [{"power":"","strength":"None|Weak|Moderate|Strong","evidence":"","next6Months":""}],
  "primaryMoat": "",
  "market": {"tam":"","sam":"","som":"","bottomUp":"","cagr":"","logic":""},
  "unitEconomics": {"cac":"","ltv":"","ratio":"","payback":"","margin":"","sensitivity":""},
  "risks": ["", "", ""],
  "experiment90": ""
}

The moat array must contain all seven powers: Scale Economies, Network Effects, Counter-Positioning, Switching Costs, Brand, Cornered Resource, Process Power. Be honest: a pre-revenue founder usually has none.

Notes:
${JSON.stringify(notes)}`,
    })
    idea.plan = data.plan || {}
    idea.bmc = data.bmc || {}
    idea.moat = Array.isArray(data.moat) ? data.moat : []
    idea.primaryMoat = String(data.primaryMoat || "")
    idea.market = data.market || {}
    idea.unitEconomics = data.unitEconomics || {}
    idea.risks = Array.isArray(data.risks) ? data.risks.map(String) : []
    idea.experiment90 = String(data.experiment90 || "")
    await saveGraph(graph)
    log(`plan ${idea.title.slice(0, 48)}`)
  }
}

async function stageFactCheck(graph) {
  const pending = graph.ideas.filter((idea) => idea.tier === "5" && idea.plan && !idea.factCheck)
  if (!pending.length) return
  log(`fact-check ${pending.length}`)
  for (const idea of pending) {
    const claims = [
      idea.plan.executiveSummary,
      idea.plan.marketAnalysis,
      idea.plan.financials,
      idea.market && JSON.stringify(idea.market),
      idea.unitEconomics && JSON.stringify(idea.unitEconomics),
      idea.analog && `${idea.analog.name} ${idea.analog.signal} ${idea.analog.url}`,
    ].filter(Boolean).join("\n\n")
    try {
      const data = await chatJson(graph, {
        role: "factCheck",
        web: { engine: "exa", max_uses: 4, max_results: 4, search_context_size: "medium" },
        maxTokens: 4000,
        temperature: 0,
        user: `Fact-check the company names, funding or revenue signals, and any numeric market or price claims in the text. Search the web. Do not add new strategy.

Return JSON {"claims":[{"text":"","status":"verified|unverified|contradicted","url":"","note":""}]}.
status is verified only when a retrieved page supports the claim. contradicted when a retrieved page disagrees. Otherwise unverified.

Text:
${clip(claims, 7000)}`,
      })
      idea.factCheck = { claims: Array.isArray(data.claims) ? data.claims : [] }
    } catch (error) {
      log(`fact-check fallback for ${idea.id}: ${error.message}`)
      const data = await chatJson(graph, {
        role: "evidenceOnline",
        web: { engine: "native", max_uses: 3, search_context_size: "medium" },
        maxTokens: 4000,
        temperature: 0,
        user: `Fact-check company names and numbers. Return JSON {"claims":[{"text":"","status":"verified|unverified|contradicted","url":"","note":""}]}.\n\n${clip(claims, 7000)}`,
      })
      idea.factCheck = { claims: Array.isArray(data.claims) ? data.claims : [], fallback: true }
    }
    await saveGraph(graph)
    log(`fact-check ${idea.title.slice(0, 40)} -> ${(idea.factCheck.claims || []).length} claims`)
  }
}

function byScore(ideas) {
  return [...ideas].sort((a, b) => (b.weighted || 0) - (a.weighted || 0))
}

function tierIdeas(graph, tier) {
  return byScore(graph.ideas.filter((idea) => idea.tier === tier))
}

function rebuildDerived(graph) {
  const nodes = []
  const edges = []
  const buyers = new Map()
  const data = new Map()
  const analogs = new Map()
  for (const idea of graph.ideas) {
    nodes.push({ id: idea.id, type: "idea", label: idea.title, tier: idea.tier, sector: idea.sector })
    if (idea.payer) {
      const buyerId = `buyer-${slug(idea.payer).slice(0, 40)}`
      if (!buyers.has(buyerId)) {
        buyers.set(buyerId, { id: buyerId, type: "buyer", label: idea.payer })
        nodes.push(buyers.get(buyerId))
      }
      edges.push({ from: idea.id, to: buyerId, type: "serves" })
    }
    if (idea.analog?.name) {
      const analogId = `analog-${slug(idea.analog.name)}`
      if (!analogs.has(analogId)) {
        analogs.set(analogId, { id: analogId, type: "analog", label: idea.analog.name, url: idea.analog.url || "" })
        nodes.push(analogs.get(analogId))
      }
      edges.push({ from: idea.id, to: analogId, type: "analog-of" })
    }
    const sources = idea.dataSources?.length ? idea.dataSources : (idea.dataStack ? [idea.dataStack.slice(0, 80)] : [])
    for (const source of sources.slice(0, 3)) {
      const dataId = `data-${slug(source).slice(0, 40)}`
      if (!data.has(dataId)) {
        data.set(dataId, { id: dataId, type: "data", label: String(source).slice(0, 80) })
        nodes.push(data.get(dataId))
      }
      edges.push({ from: idea.id, to: dataId, type: "uses-data" })
    }
    if (idea.displacedBy) {
      const manualId = `manual-${slug(idea.displacedBy).slice(0, 40)}`
      if (!data.has(manualId)) {
        nodes.push({ id: manualId, type: "manual", label: idea.displacedBy.slice(0, 80) })
        data.set(manualId, true)
      }
      edges.push({ from: idea.id, to: manualId, type: "displaced-by" })
    }
  }
  graph.nodes = nodes
  graph.edges = edges
}

function scoreLine(idea) {
  if (!idea.scores) return "Not scored."
  const parts = SCORE_KEYS.map((key) => `${key} ${idea.scores[key]}`)
  return `${parts.join(" · ")} · weighted ${idea.weighted}`
}

function sourceList(idea) {
  const seen = new Set()
  const lines = []
  for (const source of idea.sources || []) {
    if (!source?.url || seen.has(source.url)) continue
    seen.add(source.url)
    lines.push(`- ${source.claim || "Source"}: ${source.url}`)
  }
  if (idea.analog?.url && !seen.has(idea.analog.url)) lines.push(`- Analog: ${idea.analog.url}`)
  return lines.length ? lines.join("\n") : "- No source URL captured."
}

function renderCard(idea, index) {
  return `### ${index}. ${idea.title}

${idea.oneLiner}

- **Sector:** ${idea.sectorName}
- **Who pays:** ${idea.payer}
- **Job today:** ${idea.job}
- **What it replaces:** ${idea.displacedBy || "the manual method in the job"}
- **Spend:** ${idea.manualCost}
- **AI:** ${idea.whyAi}
- **Earth observation:** ${idea.whyEo}
- **US analog:** ${idea.analog?.name || "none verified"} — ${idea.analog?.what || ""} Signal: ${idea.analog?.signal || "none verified"}.
- **UK/EU wedge:** ${idea.ukeuWedge}
- **Main risk:** ${idea.deathRisk}
- **Scores:** ${scoreLine(idea)}

${sourceList(idea)}
`
}

function renderLean(canvas) {
  const rows = [
    ["Problem", canvas.problem],
    ["Customer segments", canvas.customerSegments],
    ["Unique value proposition", canvas.uvp],
    ["Solution", canvas.solution],
    ["Unfair advantage", canvas.unfairAdvantage],
    ["Revenue", canvas.revenue],
    ["Cost", canvas.cost],
    ["Key metrics", canvas.metrics],
    ["Channels", canvas.channels],
  ]
  return rows.map(([label, value]) => `- **${label}:** ${value || "[ASSUMPTION] not stated"}`).join("\n")
}

function renderTen(idea, index) {
  const wounded = idea.wounded ? "\n\nThe kill-pass wounded this idea and it stayed in because cleaner ideas ran out. Kill case: " + (idea.kill?.case || "") : ""
  return `### ${index}. ${idea.title}

${idea.oneLiner}

Weighted score ${idea.weighted}. ${idea.scoreRationale || ""}

#### Lean Canvas

${renderLean(idea.leanCanvas || {})}

#### Buyer and current spend

${idea.buyerSpend || idea.manualCost}

#### US analog

**${idea.analog?.name || "Unverified"}.** ${idea.analog?.what || ""}

Growth or spend signal: ${idea.analog?.signal || "none verified"}. Why they are ahead: ${idea.analog?.whyAhead || ""}. Pricing note: ${idea.analog?.pricing || "not in the sources"}.

${idea.analog?.url || ""}

#### UK/EU wedge

${idea.ukeuWedge}

#### Data a founder can start on

${idea.dataStack || (idea.dataSources || []).join(", ")}

#### Kill case that did not land

${idea.kill?.case || "No concrete kill."}

What still holds: ${idea.kill?.residual || ""}${wounded}

${sourceList(idea)}
`
}

function renderBmc(bmc) {
  const rows = [
    ["Customer segments", bmc.customerSegments],
    ["Value propositions", bmc.valuePropositions],
    ["Channels", bmc.channels],
    ["Customer relationships", bmc.customerRelationships],
    ["Revenue streams", bmc.revenueStreams],
    ["Key resources", bmc.keyResources],
    ["Key activities", bmc.keyActivities],
    ["Key partnerships", bmc.keyPartnerships],
    ["Cost structure", bmc.costStructure],
  ]
  return rows.map(([label, value]) => `- **${label}:** ${value || ""}`).join("\n")
}

function renderMoat(idea) {
  const lines = (idea.moat || []).map((row) => `- **${row.power}** (${row.strength}): ${row.evidence} Next six months: ${row.next6Months}`)
  return `${lines.join("\n")}\n\nPrimary moat to start: ${idea.primaryMoat || "none yet"}`
}

function renderFact(idea) {
  const claims = idea.factCheck?.claims || []
  if (!claims.length) return "Fact-check did not return claims."
  return claims.map((claim) => `- **${claim.status || "unverified"}** — ${claim.text}${claim.url ? ` (${claim.url})` : ""}${claim.note ? ` ${claim.note}` : ""}`).join("\n")
}

function renderFive(idea, index) {
  const plan = idea.plan || {}
  const sections = PLAN_SECTIONS.map(([key, heading]) => `#### ${heading}\n\n${plan[key] || "[NEEDS DATA]"}`).join("\n\n")
  const market = idea.market || {}
  const unit = idea.unitEconomics || {}
  const risks = (idea.risks || []).map((risk) => `- ${risk}`).join("\n")
  return `### ${index}. ${idea.title}

${sections}

#### Business Model Canvas

${renderBmc(idea.bmc || {})}

#### 7 Powers

${renderMoat(idea)}

#### Market sizing

- **TAM:** ${market.tam || ""}
- **SAM:** ${market.sam || ""}
- **SOM:** ${market.som || ""}
- **Bottom-up:** ${market.bottomUp || ""}
- **Growth:** ${market.cagr || ""}
- **Logic:** ${market.logic || ""}

#### Unit economics

- **CAC:** ${unit.cac || ""}
- **LTV:** ${unit.ltv || ""}
- **LTV:CAC:** ${unit.ratio || ""}
- **Payback:** ${unit.payback || ""}
- **Margin:** ${unit.margin || ""}
- **Sensitivity:** ${unit.sensitivity || ""}

#### Risks

${risks || "- None recorded."}

#### 90-day experiment

${idea.experiment90 || ""}

#### Fact-check

${idea.factCheck?.fallback ? "Checked with the evidence model after the fact-check model failed.\n\n" : ""}${renderFact(idea)}

${sourceList(idea)}
`
}

function funnelMermaid(graph) {
  const poolCount = graph.ideas.filter((idea) => idea.tier !== "duplicate").length
  const twenty = graph.ideas.filter((idea) => ["20", "10", "5"].includes(idea.tier) || idea.finalistCut || idea.tier === "dropped" && idea.kill).length
  const kept20 = graph.ideas.filter((idea) => idea.tier === "20" || idea.tier === "10" || idea.tier === "5" || idea.finalistCut).length
  const ten = graph.ideas.filter((idea) => idea.tier === "10" || idea.tier === "5" || idea.finalistCut).length
  const five = graph.ideas.filter((idea) => idea.tier === "5").length
  return `flowchart TD
  pool["Pool ${poolCount}"] --> twenty["Shortlist ${kept20}"]
  twenty --> ten["Evidence set ${ten}"]
  ten --> five["Plans ${five}"]`
}

function bipartiteMermaid(ideas) {
  const lines = ["flowchart LR"]
  const seen = new Set()
  for (const idea of ideas) {
    const ideaId = mermaidId(idea.id)
    lines.push(`  ${ideaId}["${mermaidLabel(idea.title)}"]`)
    if (idea.payer) {
      const buyerId = mermaidId(`b-${idea.payer}`)
      if (!seen.has(buyerId)) {
        lines.push(`  ${buyerId}["${mermaidLabel(idea.payer)}"]`)
        seen.add(buyerId)
      }
      lines.push(`  ${buyerId} --> ${ideaId}`)
    }
    const source = (idea.dataSources && idea.dataSources[0]) || "satellite archive"
    const dataId = mermaidId(`d-${source}`)
    if (!seen.has(dataId)) {
      lines.push(`  ${dataId}["${mermaidLabel(source)}"]`)
      seen.add(dataId)
    }
    lines.push(`  ${ideaId} --> ${dataId}`)
  }
  return lines.join("\n")
}

function competitiveMermaid(ideas) {
  const lines = ["flowchart LR"]
  ideas.forEach((idea, index) => {
    const ideaId = `f${index}`
    const analogId = `a${index}`
    lines.push(`  ${ideaId}["${mermaidLabel(idea.title)}"] --> ${analogId}["${mermaidLabel(idea.analog?.name || "no analog")}"]`)
  })
  return lines.join("\n")
}

function renderReport(graph) {
  const twenty = tierIdeas(graph, "20").concat(tierIdeas(graph, "10"), tierIdeas(graph, "5"), graph.ideas.filter((idea) => idea.finalistCut))
  const uniqueTwenty = []
  const seen = new Set()
  for (const idea of byScore(twenty)) {
    if (seen.has(idea.id)) continue
    seen.add(idea.id)
    uniqueTwenty.push(idea)
  }
  const ten = byScore(graph.ideas.filter((idea) => idea.tier === "10" || idea.tier === "5" || idea.finalistCut))
  const five = tierIdeas(graph, "5")
  const dropped = graph.ideas.filter((idea) => idea.tier === "dropped" || idea.tier === "duplicate")
  const roles = graph.models?.roles || {}
  const roleLine = Object.entries(roles).map(([role, info]) => `${role} \`${info.id}\``).join("; ")
  const usd = graph.usage?.estimatedUsd ? `About $${graph.usage.estimatedUsd.toFixed(2)} of token cost, plus web-search fees the catalogue prices separately from some native calls.` : "Usage not recorded."

  const cards = uniqueTwenty.map((idea, index) => renderCard(idea, index + 1)).join("\n")
  const tens = ten.map((idea, index) => renderTen(idea, index + 1)).join("\n")
  const fives = five.map((idea, index) => renderFive(idea, index + 1)).join("\n")
  const droppedLines = dropped.map((idea) => `- **${idea.title || idea.id}** (${idea.tier}): ${idea.dropReason || ""}`).join("\n")

  return `# Earth observation and AI: businesses one founder could start

**Date:** 6 October 2026
**For:** Tristan Fischer, UK. Existing AI skill, existing space and Earth-observation work, no new spacecraft, no team before the first invoice.
**Design:** The ForgeOS Startup Business Plan workflow. Twenty ideas are cards. Ten add a Lean Canvas, the buyer, the US analog, the wedge, and the data. Five are full Lean Business Plans: the eight sections, a Business Model Canvas, 7 Powers, TAM/SAM/SOM, and unit economics.

${graph.method ? `${graph.method}\n\n` : ""}Models pinned from the OpenRouter catalogue${graph.models?.pinnedAt ? ` at ${graph.models.pinnedAt}` : ""} (${graph.models?.catalogueCount || "unknown"} models): ${roleLine || "not pinned"}.

Calls: ${graph.usage?.calls || 0}. Prompt tokens: ${graph.usage?.promptTokens || 0}. Completion tokens: ${graph.usage?.completionTokens || 0}. ${usd}

Weights on the 1–5 scores: existing spend 1.4, AI leverage 1.2, Earth-observation leverage 1.0, sales cycle 1.3, time to revenue 1.3, US proof 1.2, founder moat 1.0. A hard filter failure drops the idea before the score matters. The filters are: someone already pays or is forced to pay; a solo founder can start; a real company is named with a URL; the UK or EU is a wedge.

## How the field was cut

\`\`\`mermaid
${funnelMermaid(graph)}
\`\`\`

## The 20

The full set is here so the cut is visible. Scores come from the judge, using only the sourced notes.

${cards || "_No shortlist yet._"}

### Who pays, and which data

\`\`\`mermaid
${bipartiteMermaid(uniqueTwenty)}
\`\`\`

## The 10

These survived the kill-pass. Each one now has the middle of the business-plan workflow: Lean Canvas, spend, analog, wedge, and a data stack.

${tens || "_Evidence pass has not run._"}

## The 5

These are the ideas worth a week of looking. Each is written in the eight-section Lean Business Plan, then the canvas, the moat, the market, the unit economics, the risks, and a 90-day experiment. Figures are tagged [SOURCED], [BENCHMARK], or [ASSUMPTION]. The fact-check is a second model and a different search path. A contradicted claim stays visible.

### Where they sit against the companies already ahead

\`\`\`mermaid
${competitiveMermaid(five)}
\`\`\`

${fives || "_Final plans have not been written._"}

## What was cut

${droppedLines || "- Nothing dropped."}

## How to read the limits

The screen is a sourced shortlist, not a decision to incorporate. Public funding announcements and press are thinner than a buyer's budget. Where a price is absent, the plan says so. Re-run \`node scripts/opportunity-screen.mjs\` to resume unfinished stages; the graph is \`Business/opportunity-screens/graph.json\`.
`
}

function stageReport(graph) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (graph.lockReport && fs.existsSync(REPORT_PATH)) {
    log("report locked; leaving the sourced markdown in place")
    return
  }
  fs.writeFileSync(REPORT_PATH, renderReport(graph))
  graph.log.push({ at: new Date().toISOString(), stage: "report", detail: REPORT_PATH })
  log(`report ${REPORT_PATH}`)
}

function selftest() {
  const scores = { existingSpend: 5, aiLeverage: 5, eoLeverage: 5, salesCycle: 5, timeToRevenue: 5, usProof: 5, founderMoat: 5 }
  if (weightedScore(scores) !== 5) throw new Error("weighted score of all fives should be 5")
  const partial = { existingSpend: 5, aiLeverage: 1, eoLeverage: 1, salesCycle: 1, timeToRevenue: 1, usProof: 1, founderMoat: 1 }
  const expected = Math.round(((5 * 1.4 + 1 * (1.2 + 1 + 1.3 + 1.3 + 1.2 + 1)) / (1.4 + 1.2 + 1 + 1.3 + 1.3 + 1.2 + 1)) * 100) / 100
  if (weightedScore(partial) !== expected) throw new Error(`weighted mismatch ${weightedScore(partial)} vs ${expected}`)
  const parsed = parseJson("Sure\n```json\n{\"ideas\":[{\"title\":\"A\"}]}\n```")
  if (parsed.ideas[0].title !== "A") throw new Error("parseJson failed")
  const graph = emptyGraph()
  graph.models = { pinnedAt: "test", catalogueCount: 1, roles: { strongJudge: { id: "x-ai/grok-4.7" } } }
  graph.usage = { calls: 1, promptTokens: 10, completionTokens: 10, estimatedUsd: 0.01 }
  graph.ideas = [{
    id: "idea-1",
    tier: "5",
    title: "Quarry volumes",
    oneLiner: "Monthly stockpile volumes for quarry operators.",
    sectorName: "Mining",
    payer: "Quarry managers",
    job: "Walk the stockpile",
    displacedBy: "Survey crew",
    manualCost: "Repeat surveys",
    whyAi: "Segment the pile",
    whyEo: "Sentinel and a drone archive",
    ukeuWedge: "UK planning minerals",
    deathRisk: "Operators already own a drone",
    analog: { name: "Example Aerial", what: "US volumes", signal: "Series A", url: "https://example.com/a" },
    sources: [{ claim: "Series A", url: "https://example.com/a" }],
    scores,
    weighted: 5,
    scoreRationale: "Strong spend.",
    leanCanvas: { problem: "Slow surveys", customerSegments: "Quarries", uvp: "Volumes monthly", solution: "Imagery", unfairAdvantage: "Workflow", revenue: "Subscription", cost: "Imagery", metrics: "Piles measured", channels: "Trade body" },
    buyerSpend: "Operators pay survey crews.",
    dataStack: "Sentinel-2 plus a commercial task.",
    dataSources: ["Sentinel-2"],
    kill: { killed: false, case: "Drone incumbency", residual: "They still pay for the report" },
    debate: { killed: false, whyItStillRanks: "Clear payer" },
    plan: Object.fromEntries(PLAN_SECTIONS.map(([key]) => [key, `${key} text`])),
    bmc: { customerSegments: "Quarries", valuePropositions: "Volumes", channels: "Trade body", customerRelationships: "Annual", revenueStreams: "Subscription", keyResources: "Models", keyActivities: "Measure", keyPartnerships: "Archive", costStructure: "Imagery" },
    moat: [{ power: "Process Power", strength: "Weak", evidence: "Early", next6Months: "Templates" }],
    primaryMoat: "Process Power",
    market: { tam: "[ASSUMPTION]", sam: "[ASSUMPTION]", som: "[ASSUMPTION]", bottomUp: "20 quarries", cagr: "[UNVERIFIED]", logic: "Bottom-up first" },
    unitEconomics: { cac: "[ASSUMPTION]", ltv: "[ASSUMPTION]", ratio: "[ASSUMPTION]", payback: "[ASSUMPTION]", margin: "[ASSUMPTION]", sensitivity: "Churn" },
    risks: ["Drone incumbents"],
    experiment90: "Call ten quarry managers.",
    factCheck: { claims: [{ text: "Series A", status: "unverified", url: "", note: "Press only" }] },
  }]
  const markdown = renderReport(graph)
  for (const [, heading] of PLAN_SECTIONS) {
    if (!markdown.includes(heading)) throw new Error(`missing ${heading}`)
  }
  if (!markdown.includes("Quarry volumes")) throw new Error("missing idea")
  if (!markdown.includes("flowchart TD")) throw new Error("missing funnel")
  if (!markdown.includes("analog-of") && !markdown.includes("Example Aerial")) throw new Error("missing analog")
  rebuildDerived(graph)
  const types = new Set(graph.edges.map((edge) => edge.type))
  for (const type of ["serves", "analog-of", "uses-data", "displaced-by"]) {
    if (!types.has(type)) throw new Error(`missing edge ${type}`)
  }
  log("selftest ok")
}

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has("--selftest")) {
    selftest()
    return
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const graph = loadGraph()
  if (args.has("--fresh")) {
    const models = graph.models
    const createdAt = graph.createdAt
    const reset = emptyGraph()
    reset.createdAt = createdAt || reset.createdAt
    reset.models = models
    fs.writeFileSync(GRAPH_PATH, JSON.stringify(reset, null, 2))
    Object.assign(graph, reset)
  }
  if (args.has("--report")) {
    stageReport(graph)
    await saveGraph(graph)
    return
  }
  loadKey()
  if (!graph.models) await pinModels(graph)
  await stageSweep(graph)
  await stageDedupe(graph)
  await stageAnalogs(graph)
  await stageScore(graph)
  await stageGapFill(graph)
  if ((graph.gapRounds || 0) > 0) {
    graph.dedupedAt = null
    await stageDedupe(graph)
    await stageAnalogs(graph)
    await stageScore(graph)
  }
  await stageSelect20(graph)
  const selected = graph.ideas.filter((idea) => idea.tier === "20").length
  if (selected < 20 && (graph.gapRounds || 0) < 2) {
    await stageGapFill(graph)
    graph.dedupedAt = null
    await stageDedupe(graph)
    await stageAnalogs(graph)
    await stageScore(graph)
    for (const idea of graph.ideas) {
      if (idea.tier === "20") idea.tier = "pool"
    }
    await stageSelect20(graph)
  }
  await stageKill(graph)
  await stageEvidence(graph)
  await stageDebate(graph)
  await stagePlans(graph)
  await stageFactCheck(graph)
  stageReport(graph)
  await saveGraph(graph)
  log(`done calls=${graph.usage.calls} est=$${graph.usage.estimatedUsd.toFixed(2)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
