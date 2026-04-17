/**
 * @file capability-interview-template.ts — Default supplier capability Q&A pack.
 *
 * @description A first-time hardware founder doesn't know what to ask a supplier
 * to separate the real shops from the brokers. This template captures the
 * questions every founder should send before awarding work.
 *
 * Sections:
 *   1. Company basics — who, where, how long
 *   2. Capability — equipment, process envelope, capacity
 *   3. Commercial — MOQ, tooling, lead time, payment terms, per-unit at volume tiers
 *   4. Quality — certifications, QA method, rework policy, FAI approach
 *   5. Compliance — export controls, conflict minerals, REACH/RoHS
 *   6. Red flags — things to watch for in the supplier's replies
 *
 * The UI renders this as a printable / copyable pack and optionally calls the
 * LLM to personalise it for a specific supplier / module combination.
 *
 * @related
 * - Consumer: src/components/cad/capability-interview-pack-dialog.tsx
 */

export interface InterviewSection {
  id: string
  title: string
  intent: string
  questions: string[]
}

export interface InterviewPack {
  productName: string
  supplierName?: string
  modulesCovered?: string[]
  sections: InterviewSection[]
  redFlags: string[]
}

export const INTERVIEW_SECTIONS: InterviewSection[] = [
  {
    id: "company",
    title: "1. Company basics",
    intent: "Verify the supplier is real, stable and working in your domain.",
    questions: [
      "Company legal name, primary manufacturing address, and year founded.",
      "Number of direct employees at the manufacturing site (not headcount group-wide).",
      "Three reference customers in our sector — with permission to contact.",
      "Ownership structure — independent, PE-backed, listed? Any recent change of control?",
      "Is the site you'd manufacture at owned or leased? If leased, term remaining on the lease.",
    ],
  },
  {
    id: "capability",
    title: "2. Capability & capacity",
    intent: "Prove they can physically make your part at the quality and volume you need.",
    questions: [
      "List the exact equipment that would run our parts (make, model, age, bed/envelope size).",
      "Typical batch size range: smallest economical run, largest you've produced in the last 12 months.",
      "Tolerances routinely held on this class of part — with a real example drawing if possible.",
      "Surface finish standards achievable in-house vs subcontracted.",
      "Inspection equipment (CMM, optical, calipers) — and who holds the calibration records.",
      "What percentage of current capacity is free to take our order in the next 90 days?",
    ],
  },
  {
    id: "commercial",
    title: "3. Commercial terms",
    intent: "Prevent MOQ + tooling surprises late in the launch.",
    questions: [
      "Minimum Order Quantity (MOQ) for our part — ideally broken out as proto / pilot / production.",
      "Tooling / NRE charges — who owns the tooling after payment, and where does it sit physically?",
      "Per-unit price at 10, 100, 1,000, and 10,000 unit volumes — indicative is fine for now.",
      "Lead time from PO to first parts on dock — broken into tooling lead, first-article lead, and production lead.",
      "Payment terms — deposit %, balance, net-days on production orders.",
      "Currency of invoicing and hedging options.",
      "Incoterms on shipment (EXW / FCA / DAP / DDP) and typical freight routes.",
      "Price validity period for the quote you're about to send us.",
    ],
  },
  {
    id: "quality",
    title: "4. Quality & First Article",
    intent: "Verify they have the process maturity to catch problems before you ship to customers.",
    questions: [
      "Quality certifications held (ISO 9001, IATF 16949, AS9100, ISO 13485, etc.) — with expiry dates.",
      "Your First Article Inspection (FAI) procedure — what you measure, who signs off, sample size.",
      "Non-conforming product policy — scrap / rework / concession-request path.",
      "Last 12 months' line-fall-out rate on similar work — PPM.",
      "Do you retain material certs and inspection records, and for how long?",
      "Corrective action turnaround — what's the typical 8D / CAPA response time?",
    ],
  },
  {
    id: "compliance",
    title: "5. Compliance & responsible sourcing",
    intent: "Avoid launch-blockers from regulatory, export, or supply chain issues.",
    questions: [
      "Export controls applying to our part (EAR / ITAR / dual-use) — can you commit to delivery to our markets?",
      "RoHS / REACH declaration — can you provide a signed declaration for the specific materials in our BOM?",
      "Conflict minerals (3TG) compliance — CMRT-format disclosure available?",
      "Can we audit the site (physical or video) during production?",
      "Subcontracting policy — are any of our parts outsourced? Which ones, to whom?",
    ],
  },
  {
    id: "risk",
    title: "6. Risk + continuity",
    intent: "Understand what happens if things go wrong.",
    questions: [
      "Single-source raw material risks in our BOM — any material where you rely on one upstream supplier?",
      "Contingency if your primary site is disrupted (fire, flood, labour action) — do you have a sister site?",
      "Cyber / IP protection — how is our design data stored, and who has access?",
      "Liability insurance level and certificate of insurance available on request.",
      "Dispute-resolution preference (UK / US / Singapore seat of arbitration).",
    ],
  },
]

export const DEFAULT_RED_FLAGS = [
  "Won't share reference customers in your sector — or refuses written reference via email.",
  "Quotes a single flat per-unit price at any volume — implies they haven't modelled tooling amortisation.",
  "Payment terms that exceed 50% deposit on first order — possible cashflow risk on their side.",
  "Refuses to acknowledge MOQ — real shops know their minimums to the unit.",
  "Claims zero PPM defects on similar work — reality is 50-5000 PPM, zero is a lie.",
  "Can't name specific equipment that would run your parts — suggests they're a broker, not a maker.",
  "Will not commit to a quote validity period — implies they plan to re-quote if input costs move.",
  "Doesn't retain material certificates, or can't produce a sample cert — audit blocker.",
  "Subcontracts without disclosure — you may end up with a 3rd-party shop you've never met.",
  "Refuses a video walk of the shop floor — most quality shops are proud to show theirs.",
]

export function buildDefaultInterviewPack(args: {
  productName: string
  supplierName?: string
  moduleNames?: string[]
}): InterviewPack {
  return {
    productName: args.productName,
    supplierName: args.supplierName,
    modulesCovered: args.moduleNames,
    sections: INTERVIEW_SECTIONS,
    redFlags: DEFAULT_RED_FLAGS,
  }
}

/**
 * Render an interview pack as a plain text document the founder can paste
 * into email or a PDF exporter.
 */
export function renderInterviewPackAsText(pack: InterviewPack): string {
  const lines: string[] = []
  lines.push(`SUPPLIER CAPABILITY INTERVIEW — ${pack.productName}`)
  if (pack.supplierName) lines.push(`For: ${pack.supplierName}`)
  if (pack.modulesCovered && pack.modulesCovered.length > 0) {
    lines.push(`Modules in scope: ${pack.modulesCovered.join(", ")}`)
  }
  lines.push(`Sent on: ${new Date().toISOString().slice(0, 10)}`)
  lines.push("")
  lines.push(
    "We're evaluating suppliers for the work described above. Please answer all questions below. Short answers are fine — we'd rather have specifics than polish. Thank you.",
  )
  lines.push("")
  for (const section of pack.sections) {
    lines.push(`═══ ${section.title.toUpperCase()} ═══`)
    lines.push(`(${section.intent})`)
    lines.push("")
    for (const q of section.questions) {
      lines.push(`• ${q}`)
      lines.push("   →")
      lines.push("")
    }
  }
  lines.push("═══ INTERNAL NOTES — REVIEWING THE REPLY ═══")
  lines.push("Red flags to watch for when the supplier replies:")
  for (const flag of pack.redFlags) {
    lines.push(`  ⚠ ${flag}`)
  }
  return lines.join("\n")
}
