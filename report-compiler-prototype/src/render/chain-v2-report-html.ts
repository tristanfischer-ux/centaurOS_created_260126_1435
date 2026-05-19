import { analyzeChainV2State, formatGbp, getModifier, modifiersByKind, parseMoney, parseQuantity } from '../chain-v2/analyze'
import type { ChainModule, ChainV2Analysis, ChainV2State, ChainWord } from '../chain-v2/types'

interface ComponentRecord {
  moduleId: string
  moduleLabel: string
  subModuleLabel: string
  component: string
  quantityText: string
  quantity: number | null
  manufacturer: string
  partNumber: string
  material: string
  rating: string
  regulatory: string
  leadTime: string
  unitCost: number | null
  totalCost: number | null
}

export function renderChainV2ReportHtml(state: ChainV2State): string {
  const analysis = analyzeChainV2State(state)
  const title = state.parsedBrief?.product_description ?? state.projectId ?? 'chain-v2 engineering report'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${styleBlock()}
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Adapted chain-v2 engineering dossier</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(state.parsedBrief?.mission_statement ?? state.briefOverviewProse ?? state.moduleDecomposition.brief_overview_prose ?? '')}</p>
    ${summaryCards(analysis, state)}
  </header>

  <section>
    <h2>Architecture Audit</h2>
    ${auditPanel(analysis)}
    ${crossModuleLinks(state)}
  </section>

  <section>
    <h2>Key Metrics</h2>
    ${keyMetricsTable(state.keyMetrics)}
  </section>

  <section>
    <h2>Module Decomposition</h2>
    ${state.moduleDecomposition.modules.map(renderModule).join('')}
  </section>

  <section>
    <h2>BoM Candidate Roll-Up</h2>
    <p class="note">This is imported from chain-v2 component-word modifier characters. Manufacturer names, part numbers, lead times and unit costs are unverified chain-v2 estimates, not independently sourced data from this adapter.</p>
    ${bomSection(state)}
  </section>
</main>
</body>
</html>`
}

function summaryCards(analysis: ChainV2Analysis, state: ChainV2State): string {
  const productClass = state.moduleDecomposition.product_class ?? 'unknown'
  const ready = analysis.issues.every(issue => issue.severity !== 'blocker' && issue.code !== 'low_cross_module_link_count')
  return `<div class="cards">
    <div class="card"><span>Product Class</span><b>${escapeHtml(productClass)}</b></div>
    <div class="card"><span>Modules</span><b>${analysis.moduleCount}</b></div>
    <div class="card"><span>Sub-Modules</span><b>${analysis.subModuleCount}</b></div>
    <div class="card"><span>Component Words</span><b>${analysis.wordCount}</b></div>
    <div class="card"><span>Cross Links</span><b>${analysis.crossModuleLinkCount}</b></div>
    <div class="card"><span>Architecture Gate</span><b class="${ready ? 'ok' : 'bad'}">${ready ? 'Ready for BoM' : 'Blocked'}</b></div>
  </div>`
}

function auditPanel(analysis: ChainV2Analysis): string {
  const rows = [
    ['Module count', String(analysis.moduleCount), analysis.moduleCount >= 8],
    ['Sub-module count', String(analysis.subModuleCount), analysis.subModuleCount >= 30],
    ['Component word count', String(analysis.wordCount), analysis.wordCount >= 120],
    ['Module grammar links', String(analysis.moduleGrammarLinkCount), analysis.moduleGrammarLinkCount >= 20],
    ['Cross-module links', String(analysis.crossModuleLinkCount), analysis.crossModuleLinkCount >= 10],
    ['Priced component words', `${analysis.pricedWordCount} (${Math.round(analysis.pricedWordRatio * 100)}%)`, analysis.pricedWordRatio >= 0.5],
    ['Extracted BoM estimate', formatGbp(analysis.estimatedBomTotalGbp), analysis.estimatedBomTotalGbp > 0],
  ]
  const tableRows = rows.map(([label, value, pass]) => `<tr><td>${label}</td><td>${value}</td><td class="${pass ? 'ok' : 'warn'}">${pass ? 'pass' : 'review'}</td></tr>`).join('')
  const issues = analysis.issues.length
    ? `<ul>${analysis.issues.map(issue => `<li class="${issue.severity === 'blocker' ? 'bad' : 'warn'}">${escapeHtml(issue.severity)} / ${escapeHtml(issue.code)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul>`
    : '<p class="ok">No architecture blockers found by the adapter audit.</p>'
  return `<table><thead><tr><th>Check</th><th>Value</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>${issues}`
}

function crossModuleLinks(state: ChainV2State): string {
  const rows = (state.moduleDecomposition.cross_module_grammar_links ?? []).map(link => `<tr><td>${escapeHtml(link.from_module ?? '')}</td><td>${escapeHtml(link.to_module ?? '')}</td><td>${escapeHtml(link.mechanism)}</td><td>${escapeHtml(link.type ?? '')}</td><td>${escapeHtml(link.detail ?? '')}</td></tr>`).join('')
  return `<h3>Cross-Module Interfaces</h3><table><thead><tr><th>From</th><th>To</th><th>Mechanism</th><th>Type</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`
}

function keyMetricsTable(metrics: Record<string, unknown> | undefined): string {
  if (!metrics) return '<p class="note">No key metrics present.</p>'
  const rows: string[] = []
  for (const [key, value] of Object.entries(metrics)) {
    if (key === 'supporting_metrics' && Array.isArray(value)) {
      for (const item of value as Array<Record<string, unknown>>) rows.push(metricRow('supporting', item))
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(metricRow(key, value as Record<string, unknown>))
    }
  }
  return `<table><thead><tr><th>Group</th><th>Metric</th><th>Value</th><th>Unit</th><th>Notes</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

function metricRow(group: string, item: Record<string, unknown>): string {
  return `<tr><td>${escapeHtml(group)}</td><td>${escapeHtml(String(item.label ?? item.id ?? ''))}</td><td>${escapeHtml(String(item.value ?? ''))}</td><td>${escapeHtml(String(item.unit ?? ''))}</td><td>${escapeHtml(String(item.notes ?? ''))}</td></tr>`
}

function renderModule(module: ChainModule, index: number): string {
  const derived = module.derived_parameters ? derivedTable(module.derived_parameters) : ''
  const links = module.grammar_links?.length ? subModuleLinks(module) : ''
  const records = moduleComponentRecords(module)
  const priced = records.filter(record => record.unitCost !== null)
  const total = records.reduce((sum, record) => sum + (record.totalCost ?? 0), 0)
  return `<article class="module">
    <h3>${index + 1}. ${escapeHtml(module.display_name ?? module.module)}</h3>
    <div class="module-stats">
      <span>${module.sub_modules.length} sub-modules</span>
      <span>${records.length} component words</span>
      <span>${priced.length} priced</span>
      <span>${formatGbp(total)}</span>
    </div>
    <p><b>Role:</b> ${escapeHtml(module.module_brief ?? '')}</p>
    <p>${escapeHtml(module.overview_paragraph_en ?? '')}</p>
    ${derived}
    ${links}
    ${subModuleSummaryTable(module, index)}
  </article>`
}

function derivedTable(values: Record<string, unknown>): string {
  const rows = Object.entries(values).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value))}</td></tr>`).join('')
  return `<details><summary>Derived parameters</summary><table><tbody>${rows}</tbody></table></details>`
}

function subModuleLinks(module: ChainModule): string {
  const rows = (module.grammar_links ?? []).map(link => `<tr><td>${escapeHtml(link.from_sub_module ?? '')}</td><td>${escapeHtml(link.to_sub_module ?? '')}</td><td>${escapeHtml(link.mechanism)}</td><td>${escapeHtml(link.detail ?? '')}</td></tr>`).join('')
  return `<details open><summary>Sub-module grammar links</summary><table><thead><tr><th>From</th><th>To</th><th>Mechanism</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></details>`
}

function subModuleSummaryTable(module: ChainModule, moduleIndex: number): string {
  const rows = module.sub_modules.map((sub, subIndex) => {
    const componentList = sub.words.map(word => word.name_human).join(', ')
    return `<tr>
      <td>${moduleIndex + 1}.${subIndex + 1}</td>
      <td><b>${escapeHtml(sub.name_human)}</b><br><span class="note">${escapeHtml([sub.role_verb, sub.topology_clause].filter(Boolean).join('; '))}</span></td>
      <td>${escapeHtml(sub.english_sentence ?? '')}</td>
      <td>${escapeHtml(componentList)}</td>
    </tr>`
  }).join('')
  return `<table class="submodule-table"><thead><tr><th>#</th><th>Sub-module</th><th>Engineering sentence</th><th>Component words</th></tr></thead><tbody>${rows}</tbody></table>`
}

function bomSection(state: ChainV2State): string {
  const records = componentRecords(state)
  return [
    moduleCostRollup(records),
    topCostDrivers(records, 25),
    fullComponentLedger(records),
  ].join('')
}

function moduleCostRollup(records: ComponentRecord[]): string {
  const grouped = new Map<string, { moduleLabel: string; total: number; words: number; priced: number }>()
  for (const record of records) {
    const row = grouped.get(record.moduleId) ?? { moduleLabel: record.moduleLabel, total: 0, words: 0, priced: 0 }
    row.words += 1
    if (record.unitCost !== null) row.priced += 1
    row.total += record.totalCost ?? 0
    grouped.set(record.moduleId, row)
  }
  const rows = Array.from(grouped.values())
    .sort((a, b) => b.total - a.total)
    .map(row => `<tr><td>${escapeHtml(row.moduleLabel)}</td><td>${row.words}</td><td>${row.priced}</td><td>${formatGbp(row.total)}</td></tr>`)
    .join('')
  return `<h3>Module Cost Roll-Up</h3><table><thead><tr><th>Module</th><th>Component Words</th><th>Priced Words</th><th>Extracted Total</th></tr></thead><tbody>${rows}</tbody></table>`
}

function topCostDrivers(records: ComponentRecord[], limit: number): string {
  const rows = records
    .filter(record => record.totalCost !== null)
    .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
    .slice(0, limit)
    .map(record => `<tr><td>${escapeHtml(record.moduleLabel)}</td><td>${escapeHtml(record.component)}</td><td>${escapeHtml(record.quantityText)}</td><td>${escapeHtml(record.manufacturer)}</td><td>${escapeHtml(record.partNumber)}</td><td>${record.unitCost ?? ''}</td><td>${record.totalCost === null ? '' : formatGbp(record.totalCost)}</td></tr>`)
    .join('')
  return `<h3>Top Cost Drivers</h3><table><thead><tr><th>Module</th><th>Component</th><th>Qty</th><th>Manufacturer</th><th>Part</th><th>Unit GBP</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`
}

function fullComponentLedger(records: ComponentRecord[]): string {
  const rows = records.map(record => `<tr>
    <td>${escapeHtml(record.moduleLabel)}</td>
    <td>${escapeHtml(record.subModuleLabel)}</td>
    <td>${escapeHtml(record.component)}</td>
    <td>${escapeHtml(record.quantityText)}</td>
    <td>${escapeHtml([record.manufacturer, record.partNumber].filter(Boolean).join(' / '))}</td>
    <td>${escapeHtml([record.material, record.rating, record.regulatory].filter(Boolean).join(' | '))}</td>
    <td>${escapeHtml(record.leadTime)}</td>
    <td>${record.unitCost === null ? '' : record.unitCost}</td>
    <td>${record.totalCost === null ? '' : formatGbp(record.totalCost)}</td>
  </tr>`).join('')
  return `<h3>Full Component Ledger</h3><table class="ledger-table"><thead><tr><th>Module</th><th>Sub-module</th><th>Component</th><th>Qty</th><th>Supplier / Part</th><th>Material / Rating / Standard</th><th>Lead Time</th><th>Unit GBP</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>`
}

function componentRecords(state: ChainV2State): ComponentRecord[] {
  return state.moduleDecomposition.modules.flatMap(module => moduleComponentRecords(module))
}

function moduleComponentRecords(module: ChainModule): ComponentRecord[] {
  return module.sub_modules.flatMap(sub => sub.words.map(word => componentRecord(module, sub.name_human, word)))
}

function componentRecord(module: ChainModule, subModuleLabel: string, word: ChainWord): ComponentRecord {
  const mods = modifiersByKind(word.modifier_characters)
  const radicals = [word.content_character?.function_radical_primary, word.content_character?.material_radical_primary].filter(Boolean).join(' / ')
  const quantity = parseQuantity(mods.quantity)
  const unitCost = parseMoney(mods.unit_cost_estimate_gbp)
  return {
    moduleId: module.module,
    moduleLabel: module.display_name ?? module.module,
    subModuleLabel,
    component: word.name_human,
    quantityText: mods.quantity ?? '',
    quantity,
    manufacturer: mods.manufacturer ?? '',
    partNumber: mods.part_number ?? '',
    material: mods.material ?? radicals,
    rating: mods.rating_primary ?? '',
    regulatory: mods.regulatory ?? '',
    leadTime: mods.lead_time ?? '',
    unitCost,
    totalCost: quantity !== null && unitCost !== null ? quantity * unitCost : null,
  }
}

function styleBlock(): string {
  return `<style>
    :root { --ink:#18222a; --muted:#586672; --line:#d7e0e7; --band:#f4f7f9; --ok:#17613a; --warn:#8a5200; --bad:#a02626; }
    * { box-sizing: border-box; }
    body { margin:0; color:var(--ink); font:12.5px/1.38 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#fff; }
    main { width:min(1180px, calc(100% - 42px)); margin:0 auto; padding:28px 0 48px; }
    header { border-bottom:2px solid var(--ink); padding-bottom:18px; margin-bottom:22px; }
    h1 { font-size:30px; line-height:1.15; margin:0 0 10px; letter-spacing:0; }
    h2 { font-size:19px; margin:24px 0 8px; padding-bottom:6px; border-bottom:1px solid var(--line); letter-spacing:0; }
    h3 { font-size:16px; margin:20px 0 7px; letter-spacing:0; }
    h4 { font-size:13px; margin:12px 0 5px; letter-spacing:0; }
    p { margin:0 0 8px; }
    table { width:100%; border-collapse:collapse; margin:8px 0 16px; table-layout:fixed; }
    th,td { border-bottom:1px solid var(--line); padding:5px 6px; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:var(--band); font-weight:700; }
    details { margin:10px 0; }
    summary { cursor:pointer; font-weight:700; }
    .eyebrow { color:var(--muted); text-transform:uppercase; letter-spacing:.04em; font-size:11px; font-weight:700; }
    .cards { display:grid; grid-template-columns:repeat(6, 1fr); gap:8px; margin-top:16px; }
    .card { border:1px solid var(--line); background:var(--band); padding:9px; min-height:68px; }
    .card span { display:block; color:var(--muted); font-size:11px; }
    .card b { display:block; font-size:18px; margin-top:5px; }
    .module { break-inside:auto; border-top:1px solid var(--line); padding-top:10px; }
    .module-stats { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 8px; }
    .module-stats span { border:1px solid var(--line); background:var(--band); padding:2px 6px; font-size:11px; }
    .submodule-table td:nth-child(1) { width:42px; }
    .submodule-table td:nth-child(4), .submodule-table th:nth-child(4) { font-size:11px; color:var(--muted); }
    .ledger-table { font-size:10.5px; }
    .note { color:var(--muted); }
    .ok { color:var(--ok); font-weight:700; }
    .warn { color:var(--warn); font-weight:700; }
    .bad { color:var(--bad); font-weight:700; }
    @media print {
      body { font-size:9.4px; line-height:1.28; }
      main { width:auto; padding:14px 16px; }
      h1 { font-size:23px; }
      h2 { font-size:15px; margin-top:16px; }
      h3 { font-size:12.5px; margin-top:12px; }
      table { margin:5px 0 10px; }
      th,td { padding:3px 4px; }
      .cards { gap:5px; }
      .card { min-height:50px; padding:6px; }
      .card b { font-size:13px; }
      .ledger-table { font-size:7.6px; }
      h2,h3,h4 { break-after:avoid; }
      table { break-inside:auto; }
      .module { break-inside:avoid; }
    }
  </style>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
