/**
 * @file boilerplate-detect.ts — risk-register boilerplate detection +
 * discipline-aware owner inference.
 *
 * Loop 12 critique found two boilerplate patterns across 3 of 6 demos:
 *   - Sentinel: 25 risk-matrix entries, every cause field reading
 *     "See module-level analysis" — circular pointer, not a cause.
 *   - HAPS: all 41 failure modes across 10 modules listing "Mechanical
 *     lead" as the owner regardless of domain (avionics overheating,
 *     software watchdog failure, hydrogen leak, regulatory-certification
 *     deadline — all "Mechanical lead").
 *
 * The Fang specialist clearly fell back to a default-owner template
 * when its per-row generation didn't fire reliably. Rather than wait for
 * a Fang regen, this helper post-processes the risk matrix at PDF render
 * time:
 *   1. Detect boilerplate (>= 70 percent of owners identical, OR cause
 *      field matches a known placeholder phrase).
 *   2. When detected, infer a discipline-appropriate owner from the
 *      hazard / cause / mitigation text and the parent module name.
 *   3. Surface a banner on the risks register page so the founder knows
 *      ownership requires review.
 *
 * The data in the cad_lab_projects.modules JSONB is left unchanged. Only
 * the rendered owner string is replaced. A subsequent Fang regen will
 * produce the canonical version; until then the founder sees a sensible
 * discipline rather than a copy-paste default.
 */

export type DisciplinePartLike = {
    hazard?: string | null
    cause?: string | null
    mitigation?: string | null
    owner?: string | null
}

export type DisciplineMatrixLike = DisciplinePartLike[]

export type ModuleWithMatrix = {
    name: string
    riskMatrix: DisciplineMatrixLike
}

/**
 * Keyword → discipline. The discipline string is the rendered owner
 * label. Case-insensitive substring match against hazard + cause +
 * mitigation + module name. First match wins, so the table is ordered
 * with most-specific patterns first.
 */
const DISCIPLINE_PATTERNS: Array<{
    pattern: RegExp
    owner: string
}> = [
    // Regulatory / compliance / certification — mention any UK / EU /
    // US regulator or named standard route
    {
        pattern: /\b(MHRA|FDA|EASA|CAA|Civil Aviation|Ofcom|UKCA|CE-mark|CE mark|Notified Body|62304|62443|14971|9540A|G99|G98|NFPA|UL\b|ISO 9001|ISO 13485|EN ?1?[3-9][0-9]{3}|NSF|WRAS|BRC|certifying|certification|notified|regulatory|compliance|conformity|type-test|witness test)\b/i,
        owner: "Regulatory affairs lead",
    },
    // Software / firmware / control logic / cyber
    {
        pattern: /\b(firmware|software|bug|race condition|deadlock|memory leak|stack overflow|state machine|control loop|control logic|telemetry|datalink|comms|cellular|LTE|5G|MQTT|CAN bus|Modbus|ethernet|protocol|cryptograph|cyber|GDPR|encryption|TLS|key management|over-the-air|OTA|patch|programmable logic controller|PLC|microcontroller|MCU|RTOS|ROS|sensor fusion|machine learning|model drift|inference|edge AI|firmware lock-up|watchdog)\b/i,
        owner: "Software engineering lead",
    },
    // Electrical / power conversion / battery / EMC
    {
        pattern: /\b(battery|cell|BMS|charger|MOSFET|IGBT|silicon carbide|silicon-carbide|inverter|power conversion|grid-form|RoCoF|islanding|switchgear|RCD|MCB|earthing|earth fault|leakage current|short circuit|overcurrent|insulation|surge|voltage|current|amperage|kilovolt|kilowatt|kVA|kW|EMC|electromagnetic|harmonic|filter|contactor|relay|busbar|terminal block|fuse|gauge|conductor|wiring|cable|electrolyser|fuel cell|electrolyte|electrochemical|solar panel|photovoltaic|PV cell)\b/i,
        owner: "Electrical engineering lead",
    },
    // Thermal / cooling / HVAC / fire
    {
        pattern: /\b(thermal runaway|overheat|overheating|cooling|coolant|chiller|refrigerant|heat exchanger|fan|HVAC|air handling|condenser|evaporator|temperature rise|hot spot|hotspot|fire detection|deflagration|gas suppression|smoke detection|NOVEC|ABC extinguisher|aerogel|venting)\b/i,
        owner: "Thermal engineering lead",
    },
    // Process / manufacturing / supplier / supply chain
    {
        pattern: /\b(supplier|sub-supplier|sole source|second source|lead time|stock-out|procurement|RFQ|tooling|injection mould|die cast|stamping|machining|first-article|FAI|incoming inspection|tolerance|capability index|Cpk|Ppk|process capability|yield|first-pass|scrap|rework)\b/i,
        owner: "Production engineering lead",
    },
    // Quality / test / validation / V&V
    {
        pattern: /\b(test plan|verification|validation|V&V|HALT|HAST|drop test|vibration test|burst test|pressure test|leak test|cycle test|life test|reliability|MTBF|FRACAS|root cause analysis|NCR|non-conformance|defect|escapes)\b/i,
        owner: "Quality engineering lead",
    },
    // Privacy / data protection (consumer products with cameras / mics)
    {
        pattern: /\b(GDPR|UK Data Protection Act|Article 9|special category|child safeguarding|Children's Code|Age Appropriate Design|biometric|personal data|data minimisation|right to erasure|subject access)\b/i,
        owner: "Data protection officer",
    },
    // Mechanical / structural — explicit only, so this no longer
    // catches everything by default
    {
        pattern: /\b(fatigue|vibration|stress concentration|fracture|crack|weld|bolt|fastener|torque|gasket|seal|O-ring|hinge|bearing|shaft|frame|spar|rib|skin|composite|carbon fibre|aluminium|stainless steel|corrosion|wear|abrasion|impact|crash|drop|cantilever|axial load|buckling|deflection|deformation|distortion|warpage|tolerance stack|mass budget|gravimetric|moment arm|centre of gravity|centre of mass)\b/i,
        owner: "Mechanical engineering lead",
    },
]

/**
 * Returns true if the row's cause field is a placeholder pointer rather
 * than an actual cause statement. Sentinel Loop 12 had 25 entries
 * reading "See module-level analysis" — circular and useless.
 */
export function isCauseBoilerplate(cause: string | null | undefined): boolean {
    if (!cause) return true
    const c = cause.toLowerCase().trim()
    if (c.length < 5) return true
    const placeholderFragments = [
        "see module-level",
        "see module level",
        "see above",
        "see below",
        "as above",
        "to be determined",
        "to be defined",
        "tbd",
        "tba",
        "n/a",
        "not applicable",
        "details in module",
        "refer to module",
    ]
    for (const frag of placeholderFragments) {
        if (c.includes(frag)) return true
    }
    return false
}

/**
 * Loop 15 P2: parallel detector for mitigation fields. The HAPS Loop 14
 * read showed every Fang-default mitigation reading
 * "Detail-design phase: derive specific monitoring, inspection or test
 * step from this hazard" — vacuous filler that surfaces the absence of
 * a real mitigation. Same shape as `isCauseBoilerplate`.
 */
export function isMitigationBoilerplate(
    mitigation: string | null | undefined,
): boolean {
    if (!mitigation) return true
    const m = mitigation.toLowerCase().trim()
    if (m.length < 8) return true
    const placeholderFragments = [
        "detail-design phase",
        "detail design phase",
        "derive specific monitoring",
        "derive specific inspection",
        "derive specific test",
        "review later",
        "to be determined",
        "to be defined",
        "tbd",
        "tba",
        "see module-level",
        "see module level",
        "as above",
        "as below",
        "no specific mitigation",
        "specific mitigation tbd",
        "monitoring tbd",
        "inspection tbd",
    ]
    for (const frag of placeholderFragments) {
        if (m.includes(frag)) return true
    }
    return false
}

/**
 * Loop 15 P2: parallel detector for consequence fields. HAPS Loop 14:
 * 8 of 10 modules had identical "See module-level analysis" in
 * consequence.
 */
export function isConsequenceBoilerplate(
    consequence: string | null | undefined,
): boolean {
    // Same pattern set as cause — both fields show identical placeholder
    // text when Fang fell back to defaults.
    return isCauseBoilerplate(consequence)
}

/**
 * Detects whether a single module's risk matrix is mostly boilerplate.
 * Triggered when (a) >= 70 percent of owners are identical, (b) >= 50
 * percent of cause fields are placeholder phrases, OR (c) >= 50 percent
 * of mitigation fields are identical.
 */
export function isModuleRiskMatrixBoilerplate(rows: DisciplineMatrixLike): {
    isBoilerplate: boolean
    reason: string | null
} {
    if (rows.length < 3) {
        // Too few rows to detect a "pattern". Treat as not-boilerplate
        // to avoid false-positives on small modules.
        return { isBoilerplate: false, reason: null }
    }
    const owners = rows.map((r) => (typeof r.owner === "string" ? r.owner.trim() : ""))
    const causes = rows.map((r) => (typeof r.cause === "string" ? r.cause.trim() : ""))
    const mitigations = rows.map((r) =>
        typeof r.mitigation === "string" ? r.mitigation.trim() : "",
    )

    // Owner uniformity
    const ownerCounts = new Map<string, number>()
    for (const o of owners) {
        if (o) ownerCounts.set(o, (ownerCounts.get(o) ?? 0) + 1)
    }
    const maxOwnerCount = Math.max(...Array.from(ownerCounts.values()), 0)
    if (maxOwnerCount / rows.length >= 0.7) {
        const dominant = Array.from(ownerCounts.entries()).find(
            ([, count]) => count === maxOwnerCount,
        )?.[0]
        return {
            isBoilerplate: true,
            reason: `${maxOwnerCount} of ${rows.length} risk-matrix entries list the same owner ("${dominant}") regardless of failure-mode discipline.`,
        }
    }

    // Cause placeholder rate
    const placeholderCauses = causes.filter(isCauseBoilerplate).length
    if (placeholderCauses / rows.length >= 0.5) {
        return {
            isBoilerplate: true,
            reason: `${placeholderCauses} of ${rows.length} cause fields are placeholders ("see module-level analysis", "TBD", or similar).`,
        }
    }

    // Mitigation uniformity
    const mitigationCounts = new Map<string, number>()
    for (const m of mitigations) {
        if (m) mitigationCounts.set(m, (mitigationCounts.get(m) ?? 0) + 1)
    }
    const maxMitigationCount = Math.max(...Array.from(mitigationCounts.values()), 0)
    if (maxMitigationCount / rows.length >= 0.5) {
        return {
            isBoilerplate: true,
            reason: `${maxMitigationCount} of ${rows.length} mitigation fields are identical.`,
        }
    }

    return { isBoilerplate: false, reason: null }
}

/**
 * Walks all modules; returns true if ANY module fails the boilerplate
 * check. Useful for the page-level banner.
 */
export function anyRiskMatrixIsBoilerplate(modules: ModuleWithMatrix[]): {
    any: boolean
    reasons: Array<{ module: string; reason: string }>
} {
    const reasons: Array<{ module: string; reason: string }> = []
    for (const m of modules) {
        if (!m.riskMatrix || m.riskMatrix.length === 0) continue
        const { isBoilerplate, reason } = isModuleRiskMatrixBoilerplate(m.riskMatrix)
        if (isBoilerplate && reason) reasons.push({ module: m.name, reason })
    }
    return { any: reasons.length > 0, reasons }
}

/**
 * Loop 15 P2: derive substantive cause / consequence / mitigation text
 * for a boilerplated risk row by mining the module's open engineering
 * facts.
 *
 * Inputs:
 *   - The risk row (with hazard, possibly-boilerplated cause / consequence /
 *     mitigation, severity).
 *   - The module's engineering-review issues (Fang findings: severity,
 *     category, message, suggestion).
 *   - The module name and a list of structured facts about the module
 *     (failure modes, declared specs, open questions).
 *
 * Strategy:
 *   1. Match the hazard against engineering-review issue messages by
 *      keyword overlap. The closest issue's `message` becomes the cause
 *      (it is, by construction, an engineering-grounded statement of the
 *      failure mechanism). The issue's `suggestion`, when present,
 *      becomes the mitigation.
 *   2. If no review issue matches but the module has a `failureModes`
 *      string list, use the closest matching failureMode as cause text.
 *   3. If neither, fall back to a hazard-derived cause that quotes the
 *      hazard text and names a generic mechanism (galvanic / fatigue /
 *      thermal / leakage) inferred from the same DISCIPLINE_PATTERNS
 *      table used for owner inference.
 *
 * Critically: when no substantive content can be derived, the function
 * returns null for that field — the caller drops the row rather than
 * rendering boilerplate. The council was unanimous: a missing row is
 * better than a boilerplate row.
 */
export interface RiskRepairContext {
    /** Engineering-review issues found by Fang on this module. */
    issues: Array<{
        severity: string
        category: string
        message: string
        suggestion?: string | null
    }>
    /** Plain failure-mode strings on the module (legacy field). */
    failureModes: string[]
    /** Module name. */
    moduleName: string
}

export interface RiskRepairOutput {
    cause: string | null
    consequence: string | null
    mitigation: string | null
    /** True when at least one field was repaired from context. */
    repaired: boolean
    /** Source of the repair, surfaced on the page so the founder knows
     *  the text came from a downstream pass rather than Fang. */
    repairSource:
        | "engineering-review"
        | "failure-mode"
        | "hazard-derived"
        | null
}

/**
 * Tokenise a phrase to a lowercase set of meaningful words (>= 4 chars,
 * not stopwords).
 */
function meaningfulTokens(text: string): Set<string> {
    const stop = new Set([
        "the", "and", "with", "from", "that", "this", "into", "onto",
        "after", "before", "during", "while", "shall", "would", "could",
        "their", "them", "they", "have", "been", "being", "such",
        "module", "system", "design", "level", "analysis", "review",
        "phase", "specific", "monitoring", "inspection", "step",
        "hazard", "cause", "consequence", "mitigation", "owner",
    ])
    const tokens = new Set<string>()
    const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? []
    for (const w of words) {
        if (!stop.has(w)) tokens.add(w)
    }
    return tokens
}

/**
 * Score the overlap between a hazard and a candidate text by counting
 * shared meaningful tokens. Returns a 0-1 score normalised by the
 * smaller side's token count (so short, focused candidates score
 * higher than long, general ones).
 */
function tokenOverlapScore(hazard: string, candidate: string): number {
    const a = meaningfulTokens(hazard)
    const b = meaningfulTokens(candidate)
    if (a.size === 0 || b.size === 0) return 0
    let hits = 0
    for (const t of a) if (b.has(t)) hits++
    return hits / Math.min(a.size, b.size)
}

/**
 * Hazard-derived fallback: name a generic physical mechanism inferred
 * from the hazard text (galvanic corrosion / fatigue / thermal runaway /
 * leakage) so the cause field reads as a stated mechanism rather than
 * pointing back at the hazard title.
 */
function hazardDerivedCause(hazard: string): string | null {
    const h = hazard.toLowerCase()
    // Mechanism inference by keyword. Order matters; first match wins.
    const mechanisms: Array<{ keyword: RegExp; mechanism: string }> = [
        { keyword: /\b(galvanic|dissimilar metal|cadmium.*carbon|aluminium.*steel|aluminum.*steel)\b/, mechanism: "galvanic corrosion at dissimilar-metal interface accelerated by atmospheric moisture or salt-fog exposure" },
        { keyword: /\b(thermal runaway|cell venting|battery fire)\b/, mechanism: "internal short-circuit propagating to adjacent cells once cell-temperature exceeds the separator melt point" },
        { keyword: /\b(lithium plating|cold soak|sub-zero charging|charging.*below.*0)\b/, mechanism: "lithium-metal plating on the anode when charging below 0 °C, producing dendrites that pierce the separator" },
        { keyword: /\b(fatigue|cycle life|endurance limit|S-N curve)\b/, mechanism: "high-cycle fatigue crack initiation at a stress concentration once the design endurance limit is exceeded" },
        { keyword: /\b(delamination|composite.*ply|interlaminar)\b/, mechanism: "interlaminar shear stress exceeding the matrix-fibre adhesion limit, triggering ply separation" },
        { keyword: /\b(buckling|column instability|euler)\b/, mechanism: "elastic buckling of the column when the compressive load exceeds the Euler critical load for the slenderness ratio" },
        { keyword: /\b(hydrogen embrittlement|high-strength steel|cathodic charging)\b/, mechanism: "atomic hydrogen ingress into the lattice of high-strength steel, reducing fracture toughness below the design threshold" },
        { keyword: /\b(leak|porosity|seal failure|o-ring|gasket)\b/, mechanism: "loss of seal integrity at the interface, driven by elastomer compression-set, thermal cycling or surface-finish defects" },
        { keyword: /\b(EMC|electromagnetic|emissions|interference|RF|radio frequency)\b/, mechanism: "conducted or radiated electromagnetic emissions exceeding the regulatory class limit, disturbing co-located equipment" },
        { keyword: /\b(over-voltage|under-voltage|surge|transient)\b/, mechanism: "transient over-voltage event exceeding the device absolute-maximum rating, breaking down the gate-oxide or junction" },
        { keyword: /\b(thermal|overheat|hot.spot|temperature rise)\b/, mechanism: "heat-flux density exceeding the thermal-management envelope, driving local junction temperature beyond the qualification rating" },
        { keyword: /\b(software|firmware|watchdog|control loop)\b/, mechanism: "control-loop or watchdog-handler fault path reached only under rare timing conditions, producing an unhandled state" },
        { keyword: /\b(supplier|sole source|lead time|stock-out)\b/, mechanism: "single-source dependency with no qualified second source, exposing the build to lead-time shocks and pricing power" },
        { keyword: /\b(certification|notified body|type-test|witness test)\b/, mechanism: "third-party certification work has not been scoped or scheduled, blocking market entry once design freeze is reached" },
        { keyword: /\b(structural|load path|bending|moment)\b/, mechanism: "load-path discontinuity at the joint, concentrating stress above the static-design margin under combined loading" },
    ]
    for (const { keyword, mechanism } of mechanisms) {
        if (keyword.test(h)) {
            return `Mechanism: ${mechanism}.`
        }
    }
    return null
}

/**
 * Hazard-derived mitigation: where the hazard text matches a known
 * mechanism, propose a named test or named control with a measurable
 * acceptance criterion. These are conservative, generic-but-grounded
 * mitigations — better than "Detail-design phase: derive specific
 * monitoring".
 */
function hazardDerivedMitigation(hazard: string): string | null {
    const h = hazard.toLowerCase()
    const mitigations: Array<{ keyword: RegExp; mitigation: string }> = [
        { keyword: /\b(galvanic|dissimilar metal)\b/, mitigation: "Install dielectric isolators at every dissimilar-metal interface; verify with a 480-hour ASTM B117 salt-fog test (acceptance: no red rust at any joint)." },
        { keyword: /\b(thermal runaway|cell venting)\b/, mitigation: "Add cell-level fusing and an inter-cell ceramic barrier with verified UL 9540A propagation-resistance to a single-cell trigger event." },
        { keyword: /\b(lithium plating|sub-zero charging)\b/, mitigation: "Charge controller must lock charging below 0 °C using cell-level NTC feedback; verify by HALT-style cycling at -10 °C (acceptance: zero capacity loss in 50 cycles)." },
        { keyword: /\b(fatigue|cycle life|endurance limit)\b/, mitigation: "Run a constant-amplitude S-N test to 10⁷ cycles at the design stress range; no crack initiation as confirmed by penetrant inspection." },
        { keyword: /\b(delamination|composite.*ply)\b/, mitigation: "Through-thickness ultrasonic C-scan after layup; reject parts with any indication > 6 mm; periodic acoustic-emission monitoring in service." },
        { keyword: /\b(hydrogen embrittlement)\b/, mitigation: "Specify a baked, low-hydrogen plating process (4-hour bake at 200 °C ≤ 4 hours after plating); stress-rupture test 200 hours at 75 % UTS." },
        { keyword: /\b(leak|seal failure|o-ring|gasket)\b/, mitigation: "Helium leak test at 10⁻⁵ mbar·L/s on every assembled unit; replace seals at the elastomer's documented compression-set limit." },
        { keyword: /\b(EMC|electromagnetic)\b/, mitigation: "EN 55032 Class B emission scan in a third-party UKAS-accredited chamber; design-of-experiments on filter caps to bring margin > 6 dB below the limit line." },
        { keyword: /\b(over-voltage|surge|transient)\b/, mitigation: "Install MOV / TVS clamping at every external interface, rated for the IEC 61000-4-5 surge withstand level required by the regulatory class." },
        { keyword: /\b(thermal|overheat|hot.spot)\b/, mitigation: "Thermal imaging at full-load steady-state; junction temperature must remain ≥ 25 °C below qualification limit on all parts; add forced air or heat-sink area until met." },
        { keyword: /\b(software|firmware|watchdog)\b/, mitigation: "Independent watchdog timer with hardware reset; fault-injection testing per ISO 26262 (or DO-178C for aviation) achieves 99 % diagnostic coverage." },
        { keyword: /\b(supplier|sole source)\b/, mitigation: "Qualify a second source within 6 months of design freeze; hold buffer stock equal to the longest single-source lead-time window." },
        { keyword: /\b(certification|notified body)\b/, mitigation: "Engage a notified body in the design-input phase; agree the test plan and witness schedule before any tooling is committed." },
        { keyword: /\b(structural|load path|bending)\b/, mitigation: "Static structural test to 1.5 × limit load with strain-gauge instrumentation at the joint; no permanent deformation; finite-element correlation within 10 %." },
    ]
    for (const { keyword, mitigation } of mitigations) {
        if (keyword.test(h)) return mitigation
    }
    return null
}

/**
 * Hazard-derived consequence: name a quantifiable failure outcome.
 * Where the hazard implies a class of consequence (loss of function /
 * performance derate / safety event / mission abort), state it in
 * concrete terms.
 */
function hazardDerivedConsequence(hazard: string): string | null {
    const h = hazard.toLowerCase()
    const consequences: Array<{ keyword: RegExp; consequence: string }> = [
        { keyword: /\b(thermal runaway|cell venting|fire)\b/, consequence: "Loss of platform; fire propagation to adjacent assemblies; potential injury to personnel during ground handling." },
        { keyword: /\b(lithium plating|cold soak)\b/, consequence: "Permanent capacity loss > 20 %; secondary risk of internal short during subsequent charging." },
        { keyword: /\b(fatigue|cycle life)\b/, consequence: "Crack growth to critical length within service life; primary structural failure under limit load." },
        { keyword: /\b(delamination|composite.*ply)\b/, consequence: "Local stiffness reduction > 30 %; loss of buckling margin under combined-load conditions." },
        { keyword: /\b(hydrogen embrittlement)\b/, consequence: "Sudden brittle fracture at fastener stress, with no warning ductile yield." },
        { keyword: /\b(leak|seal failure|o-ring)\b/, consequence: "Loss of pressurisation or fluid containment; secondary risk to electronics or payload from contamination." },
        { keyword: /\b(EMC|electromagnetic)\b/, consequence: "Co-located equipment malfunction; failure to obtain regulatory approval; market-entry delay." },
        { keyword: /\b(over-voltage|surge|transient)\b/, consequence: "Silicon damage on input devices; field-return rate elevated; warranty cost." },
        { keyword: /\b(thermal|overheat|hot.spot)\b/, consequence: "Performance derate at upper ambient temperature; accelerated wear-out of capacitors and semiconductors." },
        { keyword: /\b(software|firmware|watchdog)\b/, consequence: "Loss of control authority during the fault window; potential mission abort or platform loss." },
        { keyword: /\b(supplier|sole source)\b/, consequence: "Production halt while alternate is qualified; revenue impact proportional to outage duration." },
        { keyword: /\b(certification|notified body)\b/, consequence: "Cannot place product on market until certification closes; cash-runway risk." },
        { keyword: /\b(structural|load path|bending)\b/, consequence: "Joint failure under limit load; loss of structural function; potential platform loss." },
    ]
    for (const { keyword, consequence } of consequences) {
        if (keyword.test(h)) return consequence
    }
    return null
}

/**
 * Repair a single risk-matrix row's cause / consequence / mitigation
 * fields where they are boilerplated. Returns the original strings
 * unchanged for any field that already has substantive content.
 *
 * This is the L15-P2 council-mandated promotion of the boilerplate
 * detector from auditor to repair pass: 8 of 8 council models said the
 * gates must do more than flag. This function does the flag-and-repair
 * for the risks register.
 */
export function repairRiskRowFromContext(
    row: DisciplinePartLike & {
        consequence?: string | null
    },
    context: RiskRepairContext,
): RiskRepairOutput {
    const hazard = row.hazard ?? ""
    const causeIsBp = isCauseBoilerplate(row.cause)
    const consequenceIsBp = isConsequenceBoilerplate(row.consequence)
    const mitigationIsBp = isMitigationBoilerplate(row.mitigation)
    if (!causeIsBp && !consequenceIsBp && !mitigationIsBp) {
        return {
            cause: row.cause ?? null,
            consequence: row.consequence ?? null,
            mitigation: row.mitigation ?? null,
            repaired: false,
            repairSource: null,
        }
    }

    let repairSource: RiskRepairOutput["repairSource"] = null

    // Strategy 1: match an engineering-review issue by token overlap with hazard
    let matchedIssue: RiskRepairContext["issues"][number] | null = null
    let matchedScore = 0
    for (const iss of context.issues) {
        const score = tokenOverlapScore(hazard, iss.message)
        if (score > matchedScore && score >= 0.2) {
            matchedScore = score
            matchedIssue = iss
        }
    }

    let repairedCause = causeIsBp ? null : row.cause ?? null
    let repairedConsequence = consequenceIsBp ? null : row.consequence ?? null
    let repairedMitigation = mitigationIsBp ? null : row.mitigation ?? null

    if (matchedIssue) {
        if (causeIsBp) {
            // Issue messages are like "Tail boom bending margin 3% vs 50% needed"
            repairedCause = `From engineering review (${matchedIssue.severity.toUpperCase()} · ${matchedIssue.category}): ${matchedIssue.message.trim()}`
            repairSource = "engineering-review"
        }
        if (mitigationIsBp && matchedIssue.suggestion && matchedIssue.suggestion.trim().length > 0) {
            repairedMitigation = matchedIssue.suggestion.trim()
            repairSource = "engineering-review"
        }
    }

    // Strategy 2: match a failureMode string by token overlap
    if (!matchedIssue && context.failureModes.length > 0) {
        let bestFm: string | null = null
        let bestFmScore = 0
        for (const fm of context.failureModes) {
            const score = tokenOverlapScore(hazard, fm)
            if (score > bestFmScore && score >= 0.2) {
                bestFmScore = score
                bestFm = fm
            }
        }
        if (bestFm && causeIsBp) {
            repairedCause = `Stated failure mode: ${bestFm.trim()}`
            repairSource = "failure-mode"
        }
    }

    // Strategy 3: hazard-derived cause / mitigation / consequence
    if (causeIsBp && repairedCause === null) {
        const derived = hazardDerivedCause(hazard)
        if (derived) {
            repairedCause = derived
            repairSource = repairSource ?? "hazard-derived"
        }
    }
    if (mitigationIsBp && repairedMitigation === null) {
        const derived = hazardDerivedMitigation(hazard)
        if (derived) {
            repairedMitigation = derived
            repairSource = repairSource ?? "hazard-derived"
        }
    }
    if (consequenceIsBp && repairedConsequence === null) {
        const derived = hazardDerivedConsequence(hazard)
        if (derived) {
            repairedConsequence = derived
            repairSource = repairSource ?? "hazard-derived"
        }
    }

    const repaired =
        (causeIsBp && repairedCause !== null && repairedCause !== row.cause) ||
        (consequenceIsBp && repairedConsequence !== null && repairedConsequence !== row.consequence) ||
        (mitigationIsBp && repairedMitigation !== null && repairedMitigation !== row.mitigation)

    return {
        cause: repairedCause,
        consequence: repairedConsequence,
        mitigation: repairedMitigation,
        repaired,
        repairSource,
    }
}

/**
 * Infers a discipline-appropriate owner from the hazard / cause /
 * mitigation text plus the parent module name. Falls back to the
 * existing owner string when no pattern matches.
 */
export function inferOwnerByDiscipline(
    row: DisciplinePartLike,
    moduleName: string,
): string {
    const corpus = [
        row.hazard ?? "",
        row.cause ?? "",
        row.mitigation ?? "",
        moduleName,
    ]
        .filter((s) => s.length > 0)
        .join(" \n ")
    for (const { pattern, owner } of DISCIPLINE_PATTERNS) {
        if (pattern.test(corpus)) return owner
    }
    // No pattern matched — fall back to the existing owner if present,
    // otherwise a generic engineering lead.
    if (typeof row.owner === "string" && row.owner.trim().length > 0) {
        return row.owner.trim()
    }
    return "Engineering lead"
}
