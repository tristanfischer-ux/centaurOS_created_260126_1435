/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');

const path = '/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/pdf-engine-v2/stages/7-pdf.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add imports
code = code.replace(
  "import { sanitiseLlmOutput } from '../sanitiser'",
  "import { sanitiseLlmOutput } from '../sanitiser'\nimport { gradeClaim, averageSourceGrade } from '../source-grading'"
);

// 2. Add helpers right after safe, gbp, num, getLlmAttribution
const helpersCode = `
function computeOverallGrade(sources: Array<{ type: string; detail: string }>): string {
  const claims = sources.map(s => {
    let st = s.type.toLowerCase()
    if (st === 'llm') st = 'llm_estimate'
    else if (st === 'user') st = 'datasheet'
    else if (st === 'deterministic') st = 'database'
    else if (st === 'search') st = 'web_source'
    else if (st === 'standard') st = 'standard'
    else st = 'llm_estimate'
    return gradeClaim(s.detail, s.detail, st)
  })
  const { worst } = averageSourceGrade(claims)
  return worst
}

const getCoverValue = (val: string, sourceType: string, isSmall = false) => {
  const grade = gradeClaim(val, 'Cover', sourceType).grade
  if (grade === 'D' || grade === 'E' || grade === 'F') {
    return (
      <Text style={isSmall ? s.statValueSmall : s.statValue}>
        <Text style={{ fontSize: isSmall ? 8 : 10, color: MUTED, fontWeight: 'normal' }}>[LLM hypothesis] </Text>
        {val}
      </Text>
    )
  }
  return <Text style={isSmall ? s.statValueSmall : s.statValue}>{val}</Text>
}

const SectionH1 = ({ children, grade }: { children: React.ReactNode, grade?: string }) => (
  <Text style={s.h1}>
    {children}
    {grade && <Text style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>  [Grade {grade}{['D', 'E', 'F'].includes(grade) ? ' — LLM hypothesis' : ''}]</Text>}
  </Text>
)

const SectionH2 = ({ children, grade }: { children: React.ReactNode, grade?: string }) => (
  <Text style={s.h2}>
    {children}
    {grade && <Text style={{ fontSize: 10, color: MUTED, fontWeight: 400 }}>  [Grade {grade}{['D', 'E', 'F'].includes(grade) ? ' — LLM hypothesis' : ''}]</Text>}
  </Text>
)
`;

code = code.replace(
  /const getLlmAttribution[\s\S]*?return match \|\| null;\n\}/,
  (match) => match + '\n\n' + helpersCode.trim()
);

// 3. Update SourceFooter
code = code.replace(
  /const SourceFooter = \(\{ sources \}: \{ sources: Array<\{ type: string; detail: string \}> \}\) => \([\s\S]*?<\/View>\n\)/,
  `const SourceFooter = ({ sources, grade }: { sources: Array<{ type: string; detail: string }>; grade?: string }) => {
  const displayGrade = grade || computeOverallGrade(sources);
  return (
    <View style={s.attrFooter} fixed>
      <Text style={s.sourceFooterTitle}>Data Sources:</Text>
      {sources.map((src, i) => (
        <Text key={i} style={s.sourceFooterItem}>[{safe(src.type)}] {safe(src.detail)}</Text>
      ))}
      {displayGrade && (
        <Text style={{ ...s.sourceFooterItem, marginTop: 4, fontWeight: 'bold' }}>
          Overall Source Grade: {displayGrade}
        </Text>
      )}
    </View>
  )
}`
);

// 4. Update StatTile, StatRow, KV
code = code.replace(
  /const StatTile = \(\{ label, value, isSmall = false \}: \{ label: string; value: string, isSmall\?: boolean \}\) => \(\n  <View style=\{s.stat\}>\n    <Text style=\{s.statLabel\}>\{label\}<\/Text>\n    <Text style=\{isSmall \? s.statValueSmall : s.statValue\}>\{value\}<\/Text>\n  <\/View>\n\)/,
  `const StatTile = ({ label, value, isSmall = false }: { label: string; value: string | React.ReactNode, isSmall?: boolean }) => (
  <View style={s.stat}>
    <Text style={s.statLabel}>{label}</Text>
    {typeof value === 'string' ? <Text style={isSmall ? s.statValueSmall : s.statValue}>{value}</Text> : value}
  </View>
)`
);

code = code.replace(
  /const StatRow = \(\{ tiles \}: \{ tiles: Array<\{ label: string; value: string, isSmall\?: boolean \}> \}\) => \(\n  <View style=\{s.statRow\}>\n    \{tiles.map\(\(t, i\) => <StatTile key=\{i\} \{\.\.\.t\} \/>\)\}\n  <\/View>\n\)/,
  `const StatRow = ({ tiles }: { tiles: Array<{ label: string; value: string | React.ReactNode, isSmall?: boolean }> }) => (
  <View style={s.statRow}>
    {tiles.map((t, i) => <StatTile key={i} {...t} />)}
  </View>
)`
);

code = code.replace(
  /const KV = \(\{ label, value \}: \{ label: string; value: string \}\) => \(\n  <View style=\{s.kv\} wrap=\{false\}>\n    <Text style=\{s.kvL\}>\{label\}<\/Text>\n    <Text style=\{s.kvV\}>\{safe\(value\)\}<\/Text>\n  <\/View>\n\)/,
  `const KV = ({ label, value, isLlm = false }: { label: string; value: string; isLlm?: boolean }) => (
  <View style={s.kv} wrap={false}>
    <Text style={s.kvL}>{label}</Text>
    <Text style={s.kvV}>
      {isLlm && <Text style={{ color: MUTED, fontWeight: 'normal' }}>[LLM hypothesis] </Text>}
      {safe(value)}
    </Text>
  </View>
)`
);

// 5. Update Cover component
// 5.1 Update KV usages
code = code.replace(
  '<KV label="Industry Domain" value={state.research?.industryDomain || \'Unspecified\'} />',
  '<KV label="Industry Domain" value={state.research?.industryDomain || \'Unspecified\'} isLlm={true} />'
);

code = code.replace(
  '<KV label="Target Quantity" value={state.research?.designBrief?.quantityTarget || \'Not specified\'} />',
  '<KV label="Target Quantity" value={state.research?.designBrief?.quantityTarget || \'Not specified\'} isLlm={false} />'
);

// 5.2 Update StatRow usages
code = code.replace(
  `          <StatRow tiles={[
            { label: 'Modules', value: num(mods) }, 
            { label: 'Bill of Materials Rows', value: num(bom) }, 
            { label: 'Identified Risks', value: num(state.modules?.reduce((acc, m) => acc + (m.riskMatrix?.length || 0), 0)) }
          ]} />`,
  `          <StatRow tiles={[
            { label: 'Modules', value: getCoverValue(num(mods), 'llm_estimate') }, 
            { label: 'Bill of Materials Rows', value: getCoverValue(num(bom), 'llm_estimate') }, 
            { label: 'Identified Risks', value: getCoverValue(num(riskCount), 'llm_estimate') }
          ]} />`
);

code = code.replace(
  `          <StatRow tiles={[
            { label: 'Estimated Unit Cost', value: gbp(unit) }, 
            { label: 'Target Ceiling', value: ceil > 0 ? gbp(ceil) : 'Not specified' }, 
            { label: 'Headroom', value: ceil > 0 ? (head >= 0 ? gbp(head) : \`\${gbp(Math.abs(head))} OVER\`) : 'Not specified' }
          ]} />`,
  `          <StatRow tiles={[
            { label: 'Estimated Unit Cost', value: getCoverValue(gbp(unit), 'llm_estimate') }, 
            { label: 'Target Ceiling', value: getCoverValue(ceil > 0 ? gbp(ceil) : 'Not specified', 'datasheet') }, 
            { label: 'Headroom', value: getCoverValue(ceil > 0 ? (head >= 0 ? gbp(head) : \`\${gbp(Math.abs(head))} OVER\`) : 'Not specified', 'llm_estimate') }
          ]} />`
);

code = code.replace(
  `          <StatRow tiles={[
            { label: 'Total non-recurring engineering', value: gbp(nre) },
            { label: 'Unit cost plus amortised non-recurring engineering', value: gbp(unit + (nre / (state.research?.designBrief?.quantityTarget ? parseInt(state.research.designBrief.quantityTarget, 10) : 1))) }
          ]} />`,
  `          <StatRow tiles={[
            { label: 'Total non-recurring engineering', value: getCoverValue(gbp(nre), 'llm_estimate') },
            { label: 'Unit cost plus amortised non-recurring engineering', value: getCoverValue(gbp(unit + (nre / (state.research?.designBrief?.quantityTarget ? parseInt(state.research.designBrief.quantityTarget, 10) : 1))), 'llm_estimate') }
          ]} />`
);

// 6. Components with grades
// 6.1 BriefOverview
code = code.replace(
  `const BriefOverview = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  if (!b) return (`,
  `const BriefOverview = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  const sources = [{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]
  const grade = computeOverallGrade(sources)
  if (!b) return (`
);

code = code.replace(
  `<Text style={s.h1}>1. Brief & Requirements</Text>`,
  `<SectionH1 grade={grade}>1. Brief & Requirements</SectionH1>`
);
code = code.replace(
  `<Text style={s.h1}>1. Brief & Requirements</Text>`,
  `<SectionH1 grade={grade}>1. Brief & Requirements</SectionH1>`
);
code = code.replace(
  `<Text style={s.h2}>1.1 Overview & Context</Text>`,
  `<SectionH2 grade={grade}>1.1 Overview & Context</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.2 BriefMarketAndCompetitors
code = code.replace(
  `const BriefMarketAndCompetitors = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  if (!b || (!b.marketSizing && !b.competitors?.length)) return null

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>1.2 Market & Competitors</Text>`,
  `const BriefMarketAndCompetitors = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  if (!b || (!b.marketSizing && !b.competitors?.length)) return null
  const sources = [{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]
  const grade = computeOverallGrade(sources)

  return (
    <Page size="A4" style={s.page}>
      <SectionH2 grade={grade}>1.2 Market & Competitors</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.3 BriefConstraintsPage
code = code.replace(
  `const BriefConstraintsPage = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  if (!b) return null

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>1.3 Engineering Constraints</Text>`,
  `const BriefConstraintsPage = ({ state }: { state: PipelineState }) => {
  const b = state.research?.designBrief
  if (!b) return null
  const sources = [{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]
  const grade = computeOverallGrade(sources)

  return (
    <Page size="A4" style={s.page}>
      <SectionH2 grade={grade}>1.3 Engineering Constraints</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'User', detail: 'Founder brief text' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — research synthesis' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.4 RegulatoryItemPage
code = code.replace(
  `const RegulatoryItemPage = ({ item, index, state }: { item: RegulatoryItem, index: number, state: PipelineState }) => (
  <Page size="A4" style={s.page}>
    <Text style={s.h5}>2. Regulatory & Compliance Posture</Text>
    <Text style={s.h1}>2.{index + 1} {safe(item.code)}</Text>`,
  `const RegulatoryItemPage = ({ item, index, state }: { item: RegulatoryItem, index: number, state: PipelineState }) => {
  const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — standards extraction' }]
  const grade = computeOverallGrade(sources)
  return (
  <Page size="A4" style={s.page}>
    <Text style={s.h5}>2. Regulatory & Compliance Posture</Text>
    <SectionH1 grade={grade}>2.{index + 1} {safe(item.code)}</SectionH1>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — standards extraction' }]} />\n    <Footer section={\`2.\${index + 1} \${item.code}\`} />\n  </Page>\n)`,
  `<SourceFooter sources={sources} grade={grade} />\n    <Footer section={\`2.\${index + 1} \${item.code}\`} />\n  </Page>\n)}`
);

// 6.5 SizingOverview
code = code.replace(
  `const SizingOverview = ({ state }: { state: PipelineState }) => {
  const ds = state.dimensionSheet
  if (!ds) return (`,
  `const SizingOverview = ({ state }: { state: PipelineState }) => {
  const ds = state.dimensionSheet
  const sources = [{ type: 'Deterministic', detail: 'Sizing solver and envelope constraints' }]
  const grade = computeOverallGrade(sources)

  if (!ds) return (`
);
code = code.replace(
  `<Text style={s.h1}>3. Sizing & Spatial Optimisation</Text>`,
  `<SectionH1 grade={grade}>3. Sizing & Spatial Optimisation</SectionH1>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'Deterministic', detail: 'Sizing solver and envelope constraints' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.6 ModuleOverview
code = code.replace(
  `const ModuleOverview = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => (
  <Page size="A4" style={s.page}>
    <Text style={s.h5}>4. System Modules & Architecture</Text>
    <Text style={s.h1}>4.{index + 1} {safe(module.name)}</Text>`,
  `const ModuleOverview = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — module decomposition' }]
  const grade = computeOverallGrade(sources)
  return (
  <Page size="A4" style={s.page}>
    <Text style={s.h5}>4. System Modules & Architecture</Text>
    <SectionH1 grade={grade}>4.{index + 1} {safe(module.name)}</SectionH1>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — module decomposition' }]} />\n    <Footer section={\`4.\${index + 1} \${module.name} - Overview\`} />\n  </Page>\n)`,
  `<SourceFooter sources={sources} grade={grade} />\n    <Footer section={\`4.\${index + 1} \${module.name} - Overview\`} />\n  </Page>\n)}`
);

// 6.7 ModuleSpecsAndIssues
code = code.replace(
  `const ModuleSpecsAndIssues = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => (
  <Page size="A4" style={s.page}>
    <Text style={s.h2}>4.{index + 1}.2 Specifications & Risk Profile</Text>`,
  `const ModuleSpecsAndIssues = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — module decomposition' }]
  const grade = computeOverallGrade(sources)
  return (
  <Page size="A4" style={s.page}>
    <SectionH2 grade={grade}>4.{index + 1}.2 Specifications & Risk Profile</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — module decomposition' }]} />\n    <Footer section={\`4.\${index + 1} \${module.name} - Specs\`} />\n  </Page>\n)`,
  `<SourceFooter sources={sources} grade={grade} />\n    <Footer section={\`4.\${index + 1} \${module.name} - Specs\`} />\n  </Page>\n)}`
);

// 6.8 ModuleCostBreakdown
code = code.replace(
  `const ModuleCostBreakdown = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const parts = state.parts?.filter(p => p.sourceModuleId === module.id) || []
  const total = parts.reduce((sum, p) => sum + (p.estimatedUnitCostGbp || 0), 0)

  return (
    <Page size="A4" style={s.page} wrap>
      <Text style={s.h2}>4.{index + 1}.3 Cost Breakdown</Text>`,
  `const ModuleCostBreakdown = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const parts = state.parts?.filter(p => p.sourceModuleId === module.id) || []
  const total = parts.reduce((sum, p) => sum + (p.estimatedUnitCostGbp || 0), 0)
  const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — part generation' }, { type: 'Deterministic', detail: 'Cost model calculation' }]
  const grade = computeOverallGrade(sources)

  return (
    <Page size="A4" style={s.page} wrap>
      <SectionH2 grade={grade}>4.{index + 1}.3 Cost Breakdown</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — part generation' }, { type: 'Deterministic', detail: 'Cost model calculation' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.9 ModuleEngineeringReview
code = code.replace(
  `const ModuleEngineeringReview = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const review = state.reviews?.find(r => r.specialistId === module.id)
  if (!review) return null

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>4.{index + 1}.4 Engineering Review</Text>`,
  `const ModuleEngineeringReview = ({ module, index, state }: { module: Module, index: number, state: PipelineState }) => {
  const review = state.reviews?.find(r => r.specialistId === module.id)
  if (!review) return null
  const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — Fang engineering review' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — cross-module consistency check' }]
  const grade = computeOverallGrade(sources)

  return (
    <Page size="A4" style={s.page}>
      <SectionH2 grade={grade}>4.{index + 1}.4 Engineering Review</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — Fang engineering review' }, { type: 'LLM', detail: 'Gemini 3.1 Pro — cross-module consistency check' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.10 BomMaster
code = code.replace(
  `const BomMaster = ({ state }: { state: PipelineState }) => {
  const parts = state.parts || []
  const modules = state.modules || []
  const unassigned = parts.filter(p => !p.sourceModuleId)

  if (parts.length === 0) {`,
  `const BomMaster = ({ state }: { state: PipelineState }) => {
  const parts = state.parts || []
  const modules = state.modules || []
  const unassigned = parts.filter(p => !p.sourceModuleId)
  const grade = computeOverallGrade([{ type: 'LLM', detail: 'Gemini 3.1 Pro — part generation' }])

  if (parts.length === 0) {`
);
code = code.replace(
  `<Text style={s.h2}>5.{i + 1} BOM — {safe(m.name)}</Text>`,
  `<SectionH2 grade={grade}>5.{i + 1} BOM — {safe(m.name)}</SectionH2>`
);
code = code.replace(
  `<Text style={s.h2}>5.{modules.length + 1} BOM — Unassigned Parts</Text>`,
  `<SectionH2 grade={grade}>5.{modules.length + 1} BOM — Unassigned Parts</SectionH2>`
);

// 6.11 CostWaterfall
code = code.replace(
  `const CostWaterfall = ({ state }: { state: PipelineState }) => {
  const c = state.costBreakdown
  const parts = state.parts || []

  if (!c || parts.length === 0) {`,
  `const CostWaterfall = ({ state }: { state: PipelineState }) => {
  const c = state.costBreakdown
  const parts = state.parts || []
  const sources = [{ type: 'Deterministic', detail: 'Domain overhead multiplier model' }]
  const grade = computeOverallGrade(sources)

  if (!c || parts.length === 0) {`
);
code = code.replace(
  `<Text style={s.h1}>6. Cost Waterfall & Economics</Text>`,
  `<SectionH1 grade={grade}>6. Cost Waterfall & Economics</SectionH1>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'Deterministic', detail: 'Domain overhead multiplier model' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.12 RisksRegister
code = code.replace(
  `  let globalRiskIndex = 0

  return (
    <>
      {mods.map((m, mi) => {`,
  `  let globalRiskIndex = 0

  return (
    <>
      {mods.map((m, mi) => {
        const sources = [{ type: 'LLM', detail: 'Gemini 3.1 Pro — FMEA analysis' }]
        const grade = computeOverallGrade(sources)`
);
code = code.replace(
  `<Text style={s.h2}>7.{mi + 1} {safe(m.name)} Risks</Text>`,
  `<SectionH2 grade={grade}>7.{mi + 1} {safe(m.name)} Risks</SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'LLM', detail: 'Gemini 3.1 Pro — FMEA analysis' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 6.13 SuppliersList
code = code.replace(
  `const SuppliersList = ({ state }: { state: PipelineState }) => {
  const matches = state.suppliers || []
  
  if (matches.length === 0) {`,
  `const SuppliersList = ({ state }: { state: PipelineState }) => {
  const matches = state.suppliers || []
  const sources = [{ type: 'Search', detail: 'Brave API — commercial supplier matching' }]
  const grade = computeOverallGrade(sources)
  
  if (matches.length === 0) {`
);
code = code.replace(
  `<Text style={s.h2}>8.{i + 1} {safe(m.partName)} <Text style={{ color: MUTED }}>({safe(m.partId)})</Text></Text>`,
  `<SectionH2 grade={grade}>8.{i + 1} {safe(m.partName)} <Text style={{ color: MUTED }}>({safe(m.partId)})</Text></SectionH2>`
);
code = code.replace(
  `<SourceFooter sources={[{ type: 'Search', detail: 'Brave API — commercial supplier matching' }]} />`,
  `<SourceFooter sources={sources} grade={grade} />`
);

// 7. QualityImprovement
code = code.replace(
  `      {scores.map((sc, i) => (
        <View key={i} style={{ marginBottom: 16, padding: 12, backgroundColor: BG_SOFT, borderRadius: 4, borderWidth: 1, borderColor: BORDER }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK }}>{sc.section}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: (sc.score || 0) >= 70 ? GREEN : (sc.score || 0) >= 50 ? AMBER : RED, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, color: '#fff', fontFamily: 'Helvetica-Bold' }}>{sc.score || 0}/100</Text>
            </View>
          </View>`,
  `      {scores.map((sc, i) => {
        const attr = state.sourceAttributions?.find(a => a.section === sc.section)
        let sectionGrade = 'N/A'
        if (attr) {
          let st = attr.source.toLowerCase()
          if (st === 'llm') st = 'llm_estimate'
          else if (st === 'user') st = 'datasheet'
          else if (st === 'deterministic') st = 'database'
          else if (st === 'search') st = 'web_source'
          else st = 'llm_estimate'
          sectionGrade = gradeClaim('section', attr.source, st).grade
        }

        return (
        <View key={i} style={{ marginBottom: 16, padding: 12, backgroundColor: BG_SOFT, borderRadius: 4, borderWidth: 1, borderColor: BORDER }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK }}>{sc.section}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sectionGrade !== 'N/A' && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BG_HEADER, borderRadius: 4, borderWidth: 1, borderColor: BORDER_DARK }}>
                  <Text style={{ fontSize: 10, color: INK_DARK, fontFamily: 'Helvetica-Bold' }}>Source: {sectionGrade}</Text>
                </View>
              )}
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: (sc.score || 0) >= 70 ? GREEN : (sc.score || 0) >= 50 ? AMBER : RED, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: '#fff', fontFamily: 'Helvetica-Bold' }}>{sc.score || 0}/100</Text>
              </View>
            </View>
          </View>`
);
code = code.replace(
  `          {sc.suggestions && sc.suggestions.length > 0 && (
            <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: BORDER }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND, marginBottom: 4 }}>Recommended Code Changes:</Text>
              {sc.suggestions.slice(0, 3).map((rec, ri) => (
                <Text key={ri} style={{ fontSize: 8, marginBottom: 3, color: INK, fontFamily: 'Courier' }}>→ {safe(rec)}</Text>
              ))}
            </View>
          )}
        </View>
      ))}`,
  `          {sc.suggestions && sc.suggestions.length > 0 && (
            <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: BORDER }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND, marginBottom: 4 }}>Recommended Code Changes:</Text>
              {sc.suggestions.slice(0, 3).map((rec, ri) => (
                <Text key={ri} style={{ fontSize: 8, marginBottom: 3, color: INK, fontFamily: 'Courier' }}>→ {safe(rec)}</Text>
              ))}
            </View>
          )}
        </View>
        )
      })}`
);


fs.writeFileSync(path, code);
console.log('PDF engine updated successfully!');
