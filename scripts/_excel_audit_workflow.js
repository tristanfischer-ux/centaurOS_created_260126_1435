export const meta = {
  name: 'excel-cell-audit',
  description: 'Cell-by-cell Excel dossier audit (Haiku swarm) with adversarial false-positive verification',
  phases: [
    { title: 'Audit', detail: 'one Haiku agent per data tab — find CONCRETE errors only' },
    { title: 'Verify', detail: 'adversarial refutation of every candidate (kills false positives)' },
  ],
}

// args = { cellsDir, truthFile, tabs: [{file,name,cells}] }  (the data tabs to audit)
let A = args || {}
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
const cellsDir = A.cellsDir
const truthFile = A.truthFile
const tabs = (A.tabs || []).filter((t) => t.cells >= 8)   // skip image/near-empty tabs
if (!tabs.length) throw new Error(`no tabs to audit — args.tabs empty (got args type ${typeof args}); cellsDir=${cellsDir}`)

const IMMUNITIES = `
FALSE-POSITIVE DISCIPLINE — these are DESIGN INTENT, NOT errors. Do NOT flag any of them:
- The quality "Floor (min section)" is the minimum of the DETERMINISTIC sections only. An ADVISORY/LLM section (brief_compliance, design_narrative, semantic self-audit) MAY legitimately score BELOW the floor, and "All sections >=8 (allPass) = PASS" can co-exist with an advisory section showing FAIL. This is the B3 cage. NOT an error.
- "N unverified constraints (honestly disclosed)" / "uncertain" / "indicative" / "confirm by quote" / "RFQ" labels are HONEST DISCLOSURE, not defects.
- A BoM sub-component row (status SUB-COMPONENT, the "down-arrow" child rows) has line_gbp = 0 BY DESIGN (its cost rides in the parent's line + a breakdown column). A £0 sub-component is NOT a missing price.
- A part priced from a "component-class reference"/corpus band is a CATEGORY price, not a specific vendor SKU — that is correct for bespoke/RFQ equipment, NOT an error.
- "TBD (catalogue class)" / "TBD (detailed design)" part numbers on a concept-stage dossier are intended placeholders, not errors.
- A yellow cell is an EDITABLE input; a green cell is a LIVE formula. Editable/assumption values are not "wrong" just because you'd pick a different number.
- Rounding to whole £ or a different displayed precision is not an error. A £1 difference between a rounded unit×qty and the line total, or between a total and its rounded components, is rounding — NOT an error.
- The SCENARIOS / sensitivity tab builds a WORST-case and BEST-case corner ON PURPOSE: the "Low" column = low sale price BUT HIGH energy + HIGH capex (the pessimistic corner), and "High" = high price + LOW energy + LOW capex. So a Low-column EBITDA/payback formula that references the High-column (D) energy/capex inputs — and vice-versa — is INTENTIONAL cross-wiring, NOT a swapped reference. Do NOT flag scenario formulas for referencing the "opposite" column's energy/capex/maintenance inputs.

ONLY report a cell as an ERROR if it is CONCRETELY, PROVABLY wrong — one of:
  (1) a spreadsheet error literal in the cell: #REF!, #NAME?, #DIV/0!, #VALUE!, #N/A, #NULL!, #NUM!
  (2) a formula that references the wrong cell/sheet so its result contradicts the labelled quantity
  (3) a numeric value that CONTRADICTS the source-of-truth file for the SAME quantity (e.g. the cover installed-ASP cell != costStack.installed_asp_gbp), or contradicts ANOTHER cell quoting the same quantity
  (4) an arithmetic impossibility: a total that does not equal the sum of its itemised lines (beyond rounding); a negative price/length/mass; qty 0 on a priced line; unit x qty != line total
  (5) a clear unit error (a value off by a factor of 1000 / wrong unit label vs the source)
If you are not certain it is one of (1)-(5), DO NOT report it. Silence is better than a false positive.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['tab', 'findings'],
  properties: {
    tab: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cell', 'current', 'why', 'error_class', 'confidence'],
        properties: {
          cell: { type: 'string', description: 'cell ref e.g. B12' },
          current: { type: 'string', description: 'the current value/formula' },
          expected: { type: 'string', description: 'what it should be + the source it contradicts' },
          why: { type: 'string' },
          error_class: { type: 'string', enum: ['formula_error', 'wrong_reference', 'contradicts_source', 'arithmetic', 'unit_error'] },
          confidence: { type: 'string', enum: ['high', 'medium'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'true if this is NOT actually an error (false positive)' },
    reason: { type: 'string' },
    universal_fix_hint: { type: 'string', description: 'if real: where the UNIVERSAL fix likely lives (which builder/exporter), not a per-cell patch' },
  },
}

phase('Audit')
const results = await pipeline(
  tabs,
  (t) => agent(
    `You are auditing ONE tab of a ForgeOS engineering-dossier Excel for CONCRETE errors.\n` +
    `1. Read the source-of-truth file: ${truthFile} (the engine's verbatim numbers — a cell is wrong only if it contradicts THIS or another cell).\n` +
    `2. Read the tab cell dump: ${cellsDir}/${t.file} (format: CELLREF<TAB>VALUE<TAB>[=FORMULA], one line per non-empty cell).\n` +
    `3. Examine EVERY cell. Apply this discipline strictly:\n${IMMUNITIES}\n` +
    `Return your findings for tab "${t.name}". An empty findings array is the CORRECT answer for a clean tab — most tabs are clean.`,
    { label: `audit:${t.name}`, phase: 'Audit', schema: FINDINGS_SCHEMA, model: 'haiku', agentType: 'general-purpose' },
  ).then((r) => ({ ...r, _tabfile: t.file })),
  // Verify stage — adversarially refute EACH candidate finding (kills false positives)
  (r) => parallel((r.findings || []).map((f) => () =>
    agent(
      `You are an ADVERSARIAL reviewer. A prior agent flagged a cell in a ForgeOS dossier Excel as an error. ` +
      `Your job is to REFUTE it — assume it is a FALSE POSITIVE until proven otherwise.\n` +
      `Read ${truthFile} and ${cellsDir}/${r._tabfile}, find the cell, and decide.\n` +
      `THE CLAIM: tab "${r.tab}" cell ${f.cell} is wrong (${f.error_class}). Current="${f.current}". Claim: ${f.why}. Expected: ${f.expected || 'n/a'}.\n` +
      `${IMMUNITIES}\n` +
      `Set refuted=true if the claim falls foul of ANY immunity above, OR if the cell actually agrees with the source, OR if the "expected" value is the prior agent's own misunderstanding. Set refuted=false ONLY if you independently confirm a concrete (1)-(5) error. When in doubt, refuted=true.`,
      { label: `verify:${r.tab}:${f.cell}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'haiku', agentType: 'general-purpose' },
    ).then((v) => ({ tab: r.tab, ...f, verdict: v })).catch(() => null),
  )),
)

const confirmed = results.flat().filter(Boolean).filter((f) => f.verdict && f.verdict.refuted === false)
log(`Audit complete: ${confirmed.length} CONFIRMED error(s) survived adversarial verification (across ${tabs.length} tabs)`)
return {
  confirmed,
  by_tab: confirmed.reduce((m, f) => { (m[f.tab] = m[f.tab] || []).push(f); return m }, {}),
  tabs_audited: tabs.length,
}
