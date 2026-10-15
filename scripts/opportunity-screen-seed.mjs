/**
 * @file opportunity-screen-seed.mjs
 * @description Writes the structured idea graph that matches the sourced report.
 *   Used when OpenRouter chat cannot run. Does not call a model and does not
 *   overwrite the locked markdown.
 * @security No API keys.
 *
 *   node scripts/opportunity-screen-seed.mjs
 */

import fs from "node:fs"
import path from "node:path"

const GRAPH_PATH = path.join(process.cwd(), "Business", "opportunity-screens", "graph.json")
const WEIGHTS = {
  existingSpend: 1.4,
  aiLeverage: 1.2,
  eoLeverage: 1.0,
  salesCycle: 1.3,
  timeToRevenue: 1.3,
  usProof: 1.2,
  founderMoat: 1.0,
}

function weighted(scores) {
  const keys = Object.keys(WEIGHTS)
  const num = keys.reduce((sum, key) => sum + scores[key] * WEIGHTS[key], 0)
  const den = keys.reduce((sum, key) => sum + WEIGHTS[key], 0)
  return Math.round((num / den) * 100) / 100
}

function row(partial) {
  const scores = {
    existingSpend: partial.s[0],
    aiLeverage: partial.s[1],
    eoLeverage: partial.s[2],
    salesCycle: partial.s[3],
    timeToRevenue: partial.s[4],
    usProof: partial.s[5],
    founderMoat: partial.s[6],
  }
  return {
    id: partial.id,
    tier: partial.tier,
    finalistCut: partial.tier === "cut",
    sector: partial.sector,
    sectorName: partial.sectorName,
    title: partial.title,
    oneLiner: partial.oneLiner,
    payer: partial.payer,
    job: partial.job,
    displacedBy: partial.displacedBy,
    whyAi: partial.whyAi,
    whyEo: partial.whyEo,
    deathRisk: partial.deathRisk,
    ukeuWedge: partial.wedge,
    manualCost: partial.manualCost || "",
    dataSources: partial.data,
    analog: partial.analog,
    sources: partial.sources,
    scores,
    weighted: weighted(scores),
    dropReason: partial.dropReason || "",
    hardFilters: { payer: true, solopreneur: true, namedCompany: true, ukeuWedge: true },
    narrative: "Full text is in 2026-10-eo-ai-solopreneur.md. This node is the scored graph.",
  }
}

const ideas = [
  row({ id: "land-desk", tier: "5", sector: "solar-wind-ops", sectorName: "Energy land", title: "Parcel Desk — land screening for UK energy projects", oneLiner: "A day to decide if a UK energy parcel is worth an option.", payer: "UK solar, battery, and data-centre development managers", job: "Manual pre-option desk study", displacedBy: "Land-agent desk study", whyAi: "Policy and connection text pinned to a parcel", whyEo: "Sentinel and aerials for land cover", deathRisk: "A US or UK GIS firm ships a UK layer", wedge: "Paces' published product is US permitting", data: ["Planning documents", "Sentinel-2"], s: [5, 5, 3, 4, 4, 5, 3], analog: { name: "Paces", what: "US renewable site screening", signal: "$11 million Series A, 24 July 2024", url: "https://www.paces.com/news/paces-raises-11-million-to-accelerate-clean-energy-development", whyAhead: "US developers already buy this as software" }, sources: [{ claim: "Series A", url: "https://www.paces.com/news/paces-raises-11-million-to-accelerate-clean-energy-development" }] }),
  row({ id: "loss-line", tier: "5", sector: "insurance-catastrophe", sectorName: "Insurance claims", title: "Loss Line — roof measurement for loss adjusters", oneLiner: "Measure the roof from aerials before anyone climbs it.", payer: "UK loss adjusters and small claims teams", job: "Site measurement of damaged roofs", displacedBy: "Adjuster site visit", whyAi: "Vision models extract roof geometry", whyEo: "High-resolution aerial archive", deathRisk: "A UK aerial firm adds the measurement", wedge: "UK claims still send a person", data: ["UK aerial archive"], s: [5, 5, 4, 3, 4, 5, 2], analog: { name: "Nearmap", what: "Property intelligence and claims measurement", signal: "itel acquisition announced 20 May 2025", url: "https://www.nearmap.com/nz/blog/nearmap-to-acquire-itel", whyAhead: "US claims teams already buy imagery measurement" }, sources: [{ claim: "itel acquisition", url: "https://www.nearmap.com/nz/blog/nearmap-to-acquire-itel" }] }),
  row({ id: "habitat-draft", tier: "5", sector: "environmental-compliance", sectorName: "Planning ecology", title: "Habitat Draft — small-site biodiversity baselines", oneLiner: "A draft statutory metric an ecologist corrects, instead of a blank hillside.", payer: "Ecological consultancies and small developers in England", job: "Habitat survey and biodiversity metric", displacedBy: "Ecologist starting from a blank site", whyAi: "Classify habitats and fill the workbook", whyEo: "Aerials for the first map", deathRisk: "Consultancies refuse a model draft", wedge: "The duty and the metric are English", data: ["APGB aerials", "Statutory metric"], s: [5, 4, 4, 4, 4, 4, 3], analog: { name: "AiDASH", what: "Satellite biodiversity and vegetation for infrastructure", signal: "Series C $58.5 million, 30 April 2024; Schneider agreement $350 million, July 2026", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million", whyAhead: "Infrastructure buyers already pay; small English sites are still a walk" }, sources: [{ claim: "Series C", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million" }, { claim: "BNG duty", url: "https://www.gov.uk/guidance/understanding-biodiversity-net-gain" }] }),
  row({ id: "pile-note", tier: "5", sector: "mining-quarry", sectorName: "Quarries", title: "Pile Note — monthly quarry stockpile tonnage", oneLiner: "A monthly tonnage finance will book, from a scan the quarry sends.", payer: "UK quarry finance and site managers", job: "Twice-yearly contractor stock survey", displacedBy: "Contractor survey", whyAi: "Pile volumes from a phone or drone scan", whyEo: "Not Sentinel. Centimetre work wants a scan.", deathRisk: "The site adopts a $100 US app", wedge: "UK quarries still buy local surveys", data: ["Phone or drone scan"], s: [4, 4, 2, 4, 5, 4, 2], analog: { name: "Stockpile Reports", what: "Self-serve pile measurement", signal: "Published price from $100 a month", url: "https://www.stockpilereports.com/pricing.html", whyAhead: "US operators already subscribe" }, sources: [{ claim: "Pricing", url: "https://www.stockpilereports.com/pricing.html" }] }),
  row({ id: "grade-check", tier: "5", sector: "construction-quantities", sectorName: "Housebuilding", title: "Grade Check — earthworks quantities before payment", oneLiner: "Cut and fill against the design, before the contractor is paid.", payer: "Land managers at UK housebuilders", job: "Surveyor check of earthworks invoices", displacedBy: "Site survey", whyAi: "Quantities from a scan and a design surface", whyEo: "Drone scan, not a satellite", deathRisk: "Pilot cost, or survey firms who already fly", wedge: "TraceAir's published customers are American", data: ["Drone scan", "Design surface"], s: [5, 4, 2, 3, 4, 5, 2], analog: { name: "TraceAir", what: "US housebuilder site intelligence", signal: "$25 million Series B, 29 May 2024", url: "https://www.prnewswire.com/news-releases/traceair-secures-25-million-series-b-funding-to-drive-innovation-in-land-development-and-homebuilding-302157483.html", whyAhead: "US builders already pay to check invoices from scans" }, sources: [{ claim: "Series B", url: "https://www.prnewswire.com/news-releases/traceair-secures-25-million-series-b-funding-to-drive-innovation-in-land-development-and-homebuilding-302157483.html" }] }),
  row({ id: "solar-reports", tier: "cut", sector: "solar-wind-ops", sectorName: "Solar operations", title: "Solar defect reports without the robot", oneLiner: "An exception list from a drone flight the site already bought.", payer: "UK solar O&M managers", job: "Walking a site for faults", displacedBy: "Manual inspection", whyAi: "Thermal frames to a fault table", whyEo: "Site drone, not a new satellite", deathRisk: "Raptor Maps already has the model and the robots", wedge: "Independent UK O&M firms are not all on Raptor", dropReason: "Lost the final cut: Raptor Maps' depth and robotics", data: ["Site thermal drone"], s: [4, 4, 3, 3, 3, 5, 2], analog: { name: "Raptor Maps", what: "Solar asset inspection", signal: "$35 million Series C, 10 December 2024", url: "https://www.prnewswire.com/news-releases/raptor-maps-closes-35-million-series-c-financing-to-drive-next-generation-solar-asset-management-solutions-302322933.html", whyAhead: "71 GW reported under management" }, sources: [{ claim: "Series C", url: "https://www.prnewswire.com/news-releases/raptor-maps-closes-35-million-series-c-financing-to-drive-next-generation-solar-asset-management-solutions-302322933.html" }] }),
  row({ id: "planning-queue", tier: "cut", sector: "planning-enforcement", sectorName: "Planning enforcement", title: "Planning-enforcement queue for local authorities", oneLiner: "A weekly list of likely breaches so the visit is the second step.", payer: "English planning enforcement teams", job: "Site visits to check unauthorised works", displacedBy: "Routine site visit", whyAi: "Change detection joined to planning records", whyEo: "Aerials councils already receive", deathRisk: "Council procurement, and one council building it in QGIS", wedge: "Hull uses the pictures and still describes visits as the scarce resource", dropReason: "Lost the final cut: procurement cycle", data: ["APGB aerials"], s: [4, 4, 5, 2, 3, 3, 3], analog: { name: "Nearmap", what: "Government change intelligence", signal: "itel deal and government imagery business", url: "https://www.nearmap.com/nz/blog/nearmap-to-acquire-itel", whyAhead: "US and Australian governments buy the analytics, not only the picture" }, sources: [{ claim: "Hull aerial enforcement", url: "https://bluesky-world.com/wp-content/uploads/2026/03/APGB-Case-Studies-2026_Hull.pdf" }] }),
  row({ id: "storm-pack", tier: "cut", sector: "insurance-catastrophe", sectorName: "Insurance claims", title: "Claims-desk storm pack", oneLiner: "Which roofs changed, so the adjuster is sent once.", payer: "UK household insurer claims desks", job: "Triage after a storm", displacedBy: "Sending an adjuster to every claim", whyAi: "Before-and-after change on roofs", whyEo: "Aerial archive", deathRisk: "Same product as Loss Line, slower buyer", wedge: "UK claims ops still book visits", dropReason: "Lost the final cut: same company as Loss Line", data: ["UK aerial archive"], s: [4, 4, 4, 2, 3, 4, 2], analog: { name: "Nearmap", what: "ImpactResponse and claims imagery", signal: "itel acquisition, May 2025", url: "https://www.nearmap.com/nz/blog/nearmap-to-acquire-itel", whyAhead: "US carriers already buy event imagery" }, sources: [{ claim: "itel", url: "https://www.nearmap.com/nz/blog/nearmap-to-acquire-itel" }] }),
  row({ id: "waste-alerts", tier: "cut", sector: "environmental-compliance", sectorName: "Waste crime", title: "Illegal waste site alerts", oneLiner: "A short list of changed sites for the drone unit to check.", payer: "Environment Agency waste-crime teams", job: "Find illegal sites by report and flight", displacedBy: "Aircraft and complaint-led visits", whyAi: "Change detection to a queue", whyEo: "Sentinel first, commercial scene on hits", deathRisk: "Single public buyer building its own unit", wedge: "The budget is English and the pilots cannot watch every field", dropReason: "Lost the final cut: one buyer", data: ["Sentinel"], s: [4, 4, 5, 2, 3, 3, 2], analog: { name: "Satelytics", what: "Environmental change from commercial imagery", signal: "Maxar partnership, June 2025", url: "https://www.globenewswire.com/news-release/2025/06/25/3105012/0/en/Media-Advisory-Energy-Sector-Gains-New-Edge-in-Vegetation-and-Methane-Emissions-Monitoring-with-Maxar-and-Satelytics-Partnership.html", whyAhead: "US operators already buy satellite alerts" }, sources: [{ claim: "EA budget", url: "https://www.gov.uk/government/news/enhanced-package-of-cutting-edgetechnology-to-combat-waste-crime" }] }),
  row({ id: "landfill-airspace", tier: "cut", sector: "mining-quarry", sectorName: "Landfill", title: "Landfill airspace", oneLiner: "Remaining void from a monthly scan.", payer: "UK landfill operators", job: "Survey of remaining airspace", displacedBy: "Survey crew", whyAi: "Cell volume from a scan", whyEo: "Drone or phone, not Sentinel", deathRisk: "Same desk as Pile Note", wedge: "Propeller lists the feature; UK sites still survey", dropReason: "Lost the final cut: duplicate of Pile Note", data: ["Drone scan"], s: [4, 4, 2, 3, 4, 3, 2], analog: { name: "Propeller", what: "Landfill cell tracking and volumes", signal: "Product page lists cell tracking", url: "https://www.propelleraero.com/platform/volume-calculations/", whyAhead: "The workflow is productised" }, sources: [{ claim: "Cell tracking", url: "https://www.propelleraero.com/platform/volume-calculations/" }] }),
  row({ id: "peril-scores", tier: "dropped", sector: "insurance-catastrophe", sectorName: "Insurance underwriting", title: "Parcel scores for regional insurers", oneLiner: "Peril scores so an underwriter can price without a survey.", payer: "Regional property insurers", job: "Desktop or physical pre-bind survey", displacedBy: "Survey or a coarse postcode rate", whyAi: "Parcel models", whyEo: "Aerial attributes", deathRisk: "Moody's and ZestyAI already own the buyer", wedge: "UK regionals are slower, but the vendor list is global", dropReason: "Killed: Moody's owns Cape and ZestyAI is at tens of millions of assessments", data: ["Aerial attributes"], s: [5, 5, 4, 2, 2, 5, 2], analog: { name: "ZestyAI", what: "Parcel property risk scores", signal: "31 million assessments in 2024; $15 million CIBC facility, June 2025", url: "https://insurtechanalyst.com/2025/06/26/zestyai-bags-15m-from-cibc-to-scale-ai-risk-platform/", whyAhead: "US carriers already buy the score" }, sources: [{ claim: "Facility and volume", url: "https://insurtechanalyst.com/2025/06/26/zestyai-bags-15m-from-cibc-to-scale-ai-risk-platform/" }] }),
  row({ id: "dno-vegetation", tier: "dropped", sector: "infrastructure-utilities", sectorName: "Utilities", title: "Vegetation risk for distribution networks", oneLiner: "Which spans to cut, instead of driving the line.", payer: "UK distribution network operators", job: "Helicopter and foot patrol of vegetation", displacedBy: "Line patrol", whyAi: "Risk ranking of spans", whyEo: "Satellite and aerial vegetation", deathRisk: "Schneider is buying AiDASH", wedge: "Ofgem still treats vegetation as funded business as usual", dropReason: "Killed: Schneider agreed to buy AiDASH, and National Grid was already an investor", data: ["Satellite vegetation"], s: [5, 4, 5, 2, 2, 5, 1], analog: { name: "AiDASH", what: "Utility vegetation management", signal: "Series C $58.5 million; Schneider $350 million agreement, July 2026", url: "https://www.esgtoday.com/schneider-electric-acquires-grid-resilience-solutions-provider-aidash-for-350-million/", whyAhead: "US utilities are investors and customers" }, sources: [{ claim: "Schneider agreement", url: "https://www.esgtoday.com/schneider-electric-acquires-grid-resilience-solutions-provider-aidash-for-350-million/" }] }),
  row({ id: "ag-scouting", tier: "dropped", sector: "crop-subsidy", sectorName: "Agriculture", title: "Leaf-level scouting for agricultural merchants", oneLiner: "Send the agronomist to the bad acres only.", payer: "UK agricultural merchants and agronomists", job: "Walking fields", displacedBy: "Manual scouting", whyAi: "Leaf-level vision", whyEo: "Aircraft, not Sentinel", deathRisk: "Taranis already sells in Europe", wedge: "UK farms are smaller and later", dropReason: "Killed: Taranis already describes a European business", data: ["Aircraft imagery"], s: [4, 5, 2, 3, 3, 5, 2], analog: { name: "Taranis", what: "AI crop scouting", signal: "Syngenta retailer programme; Dealroom reported a May 2026 Series D", url: "https://www.taranis.com/newsroom/syngenta-crop-protection-and-taranis-partner-to-drive-ai-powered-agronomy-solutions-and-business-opportunities-for-retailers/", whyAhead: "US retailers already buy the flight" }, sources: [{ claim: "Syngenta partnership", url: "https://www.taranis.com/newsroom/syngenta-crop-protection-and-taranis-partner-to-drive-ai-powered-agronomy-solutions-and-business-opportunities-for-retailers/" }] }),
  row({ id: "corridor", tier: "dropped", sector: "infrastructure-utilities", sectorName: "Transport corridors", title: "Corridor vegetation for rail and roads", oneLiner: "The utility vegetation product, sold to rail or highways.", payer: "Network Rail or National Highways", job: "Corridor inspection", displacedBy: "Patrol", whyAi: "Same span ranking", whyEo: "Satellite vegetation", deathRisk: "Same Schneider problem", wedge: "UK corridors still patrol", dropReason: "Killed with the AiDASH acquisition", data: ["Satellite vegetation"], s: [4, 4, 5, 2, 2, 5, 1], analog: { name: "AiDASH", what: "Transportation vegetation", signal: "Series C names transportation customers", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million", whyAhead: "Already sold to infrastructure owners" }, sources: [{ claim: "Series C", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million" }] }),
  row({ id: "pipeline", tier: "dropped", sector: "infrastructure-utilities", sectorName: "Pipelines", title: "Pipeline encroachment alerts", oneLiner: "Someone has built or dug on the right of way.", payer: "Pipeline operators", job: "Driving the right of way", displacedBy: "Line drive", whyAi: "Encroachment detection", whyEo: "Commercial high-resolution imagery", deathRisk: "Tasking cost and an enterprise safety sale", wedge: "UK operators still patrol", dropReason: "Killed: commercial tasking and an enterprise sale", data: ["Commercial 30 cm imagery"], s: [4, 4, 5, 2, 2, 4, 1], analog: { name: "Satelytics", what: "Right-of-way and vegetation alerts", signal: "Maxar partnership, June 2025", url: "https://www.globenewswire.com/news-release/2025/06/25/3105012/0/en/Media-Advisory-Energy-Sector-Gains-New-Edge-in-Vegetation-and-Methane-Emissions-Monitoring-with-Maxar-and-Satelytics-Partnership.html", whyAhead: "US energy firms already buy the alert" }, sources: [{ claim: "Partnership", url: "https://www.globenewswire.com/news-release/2025/06/25/3105012/0/en/Media-Advisory-Energy-Sector-Gains-New-Edge-in-Vegetation-and-Methane-Emissions-Monitoring-with-Maxar-and-Satelytics-Partnership.html" }] }),
  row({ id: "oil-tanks", tier: "dropped", sector: "ports-commodities", sectorName: "Commodity signals", title: "Oil-storage signals for traders", oneLiner: "What changed in the tank farm this week.", payer: "Energy traders and analysts", job: "Manual or delayed tank research", displacedBy: "Analyst estimates", whyAi: "Tank-level models", whyEo: "Commercial satellite", deathRisk: "The buyers already have a terminal", wedge: "Thin. Specialists are already global.", dropReason: "Killed: enterprise trader sale, not a solo invoice", data: ["Commercial satellite"], s: [4, 4, 5, 2, 2, 4, 1], analog: { name: "Ursa Space", what: "Satellite commodity analytics", signal: "Sumitomo investment announced 20 August 2025", url: "https://www.prnewswire.com/news-releases/sumitomo-corporation-invests-in-ursa-space-to-accelerate-global-growth-and-expand-into-japan-302533957.html", whyAhead: "Traders already buy the feed" }, sources: [{ claim: "Sumitomo", url: "https://www.prnewswire.com/news-releases/sumitomo-corporation-invests-in-ursa-space-to-accelerate-global-growth-and-expand-into-japan-302533957.html" }] }),
  row({ id: "nature-code", tier: "dropped", sector: "forestry", sectorName: "Nature markets", title: "Woodland and peatland code monitoring", oneLiner: "Year-5 stocking evidence without a full survey.", payer: "Woodland Carbon Code project owners", job: "Validation and verification surveys", displacedBy: "Field survey", whyAi: "Stocking from imagery", whyEo: "Drone and satellite pilots already in the code's own programme", deathRisk: "The code is already procuring this", wedge: "The fees are real and local", dropReason: "Killed: CivTech pilots are already underway", data: ["Drone", "Satellite"], s: [3, 3, 4, 3, 3, 3, 2], analog: { name: "Woodland Carbon Code CivTech pilots", what: "Official remote-sensing trials", signal: "Validation fees £1,800 to £2,500 plus VAT as of April 2025", url: "https://www.woodlandcarboncode.org.uk/3-validation", whyAhead: "The buyer is running the procurement" }, sources: [{ claim: "Validation fees", url: "https://www.woodlandcarboncode.org.uk/3-validation" }] }),
  row({ id: "linear-bng", tier: "dropped", sector: "environmental-compliance", sectorName: "Infrastructure ecology", title: "Linear-infrastructure habitat baselines", oneLiner: "Biodiversity net gain for a road or rail scheme.", payer: "National Highways or Network Rail environmental teams", job: "Corridor habitat survey", displacedBy: "Ecology team", whyAi: "A draft baseline", whyEo: "Aerials", deathRisk: "Slow buyer, and AiDASH already names the mandate", wedge: "English duty", dropReason: "Killed: slower than small-site BNG, and AiDASH already sells the mandate", data: ["Aerials"], s: [4, 3, 4, 2, 2, 4, 2], analog: { name: "AiDASH", what: "Biodiversity net gain for infrastructure", signal: "Named in the Series C release", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million", whyAhead: "Infrastructure is their customer" }, sources: [{ claim: "Series C", url: "https://www.businesswire.com/news/home/20240430874835/en/AiDash-Closes-its-Oversubscribed-Series-C-Funding-Round-at-%2458.5-Million" }] }),
  row({ id: "flytip", tier: "dropped", sector: "environmental-compliance", sectorName: "Local waste", title: "District fly-tip alerts", oneLiner: "The waste list, sold to a district.", payer: "District waste and enforcement teams", job: "Complaint-led visits", displacedBy: "Site visit", whyAi: "Small-site change detection", whyEo: "Aerials and Sentinel", deathRisk: "Duplicate of the Agency product", wedge: "Districts still visit", dropReason: "Killed as a duplicate of illegal-waste alerts", data: ["Aerials"], s: [3, 4, 4, 2, 3, 2, 2], analog: { name: "Buckinghamshire Council drone practice", what: "Drones for waste and planning breaches", signal: "Published operating note", url: "https://www.buckinghamshire.gov.uk/planning-building-and-environment/applications-permission-and-advice/use-of-drones-to-investigate-planning-breaches/", whyAhead: "Councils already fly; they do not yet buy a queue" }, sources: [{ claim: "Drone policy", url: "https://www.buckinghamshire.gov.uk/planning-building-and-environment/applications-permission-and-advice/use-of-drones-to-investigate-planning-breaches/" }] }),
  row({ id: "slurry", tier: "dropped", sector: "crop-subsidy", sectorName: "Farm compliance", title: "Slurry-store and farm compliance maps", oneLiner: "Find stores and spreading risk from imagery.", payer: "Water companies or the Environment Agency", job: "Farm inspections", displacedBy: "Inspector visit", whyAi: "Object detection on stores", whyEo: "Aerial and satellite", deathRisk: "Weak measurement and a single agency buyer", wedge: "JNCC already notes the time saving in Denmark", dropReason: "Killed: weak tank-level science and a single buyer", data: ["Aerials"], s: [3, 3, 4, 2, 3, 3, 2], analog: { name: "Picterra", what: "Geospatial deep learning used by SEGES on slurry tanks", signal: "JNCC note: staff time from months to hours", url: "https://data.jncc.gov.uk/data/c650f50d-092a-4d15-8c66-5e95b70c22ef/regulation-and-compliance.pdf", whyAhead: "A public agency overseas already uses the pattern" }, sources: [{ claim: "JNCC note", url: "https://data.jncc.gov.uk/data/c650f50d-092a-4d15-8c66-5e95b70c22ef/regulation-and-compliance.pdf" }] }),
]

if (ideas.length !== 20) {
  console.error(`expected 20 ideas, got ${ideas.length}`)
  process.exit(1)
}

const existing = fs.existsSync(GRAPH_PATH) ? JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8")) : {}
const graph = {
  createdAt: existing.createdAt || new Date().toISOString(),
  models: existing.models,
  weights: WEIGHTS,
  lockReport: true,
  method: "OpenRouter catalogue pinned. Chat loops did not run because OPENROUTER_API_KEY was absent. Scores and the cut are in this graph. The narrative, canvases, and five plans are in 2026-10-eo-ai-solopreneur.md, locked so --report will not overwrite them.",
  ideas: ideas.map((idea) => ({ ...idea, tier: idea.tier === "cut" ? "10" : idea.tier })),
  nodes: [],
  edges: [],
  log: [{ at: new Date().toISOString(), stage: "seed", detail: "20 sourced ideas; report locked" }],
  usage: existing.usage || { calls: 0, promptTokens: 0, completionTokens: 0, estimatedUsd: 0 },
  gapRounds: 0,
  excludedBeforeScore: [
    { title: "Wind blade inspection", reason: "SkySpecs already inspecting ScottishPower East Anglia ONE", url: "https://skyspecs.com/blog/offshore-wind-inspections-2025/" },
    { title: "Jobsite 360 progress", reason: "OpenSpace acquired Disperse on 28 October 2025", url: "https://www.openspace.ai/press-releases/openspace-acquires-disperse/" },
    { title: "Dark-vessel monitoring", reason: "SynMax federal contracts, not a solo sale", url: "https://www.einpresswire.com/article/858770121/synmax-secures-20-3m-in-federal-contracts-to-expand-maritime-intelligence-capabilities" },
    { title: "Point-source methane", reason: "Satelytics and commercial tasking fail the solo cost test", url: "https://www.globenewswire.com/news-release/2025/06/25/3105012/0/en/Media-Advisory-Energy-Sector-Gains-New-Edge-in-Vegetation-and-Methane-Emissions-Monitoring-with-Maxar-and-Satelytics-Partnership.html" },
  ],
}

function slug(value) {
  return String(value || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "x"
}

const nodes = []
const edges = []
for (const idea of graph.ideas) {
  nodes.push({ id: idea.id, type: "idea", label: idea.title, tier: idea.finalistCut ? "10-cut" : idea.tier })
  const buyerId = `buyer-${slug(idea.payer)}`
  nodes.push({ id: buyerId, type: "buyer", label: idea.payer })
  edges.push({ from: idea.id, to: buyerId, type: "serves" })
  const analogId = `analog-${slug(idea.analog.name)}`
  nodes.push({ id: analogId, type: "analog", label: idea.analog.name, url: idea.analog.url })
  edges.push({ from: idea.id, to: analogId, type: "analog-of" })
  for (const source of idea.dataSources) {
    const dataId = `data-${slug(source)}`
    nodes.push({ id: dataId, type: "data", label: source })
    edges.push({ from: idea.id, to: dataId, type: "uses-data" })
  }
  const manualId = `manual-${slug(idea.displacedBy)}`
  nodes.push({ id: manualId, type: "manual", label: idea.displacedBy })
  edges.push({ from: idea.id, to: manualId, type: "displaced-by" })
}
graph.nodes = nodes
graph.edges = edges

fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2))
const tiers = graph.ideas.reduce((acc, idea) => {
  const key = idea.finalistCut ? "10-cut" : idea.tier
  acc[key] = (acc[key] || 0) + 1
  return acc
}, {})
console.log(JSON.stringify(tiers))
console.log("edges", edges.length, "weighted land", graph.ideas[0].weighted)
