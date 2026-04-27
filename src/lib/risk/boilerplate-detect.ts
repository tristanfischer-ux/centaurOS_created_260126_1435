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
function isCauseBoilerplate(cause: string | null | undefined): boolean {
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
