/**
 * @file readiness/page.tsx — /the-forge-v2/projects/:id/readiness (V2 — mockup-faithful rebuild).
 *
 * @description The readiness action flow — a guided page that asks the
 * founder to resolve one blocking item before a downstream artefact can
 * ship (e.g. "mass budget breached", "brief not locked", "cert expired",
 * "name your CTO"). The parent readiness grid identifies the gap; this
 * page answers "so what do I do about it, given my runway and stage?".
 *
 * Structure:
 *   1. Server-side load the project via loadCadLabProject(id) under the
 *      usual withAuth foundry scope.
 *   2. Derive the list of *unresolved* readiness items from real project
 *      state — no mock data, no assumed values. An item fires only if its
 *      predicate returns true against the loaded project row.
 *   3. Pick the active item from ?item=<key>, falling back to the first
 *      unresolved item. If nothing is unresolved we render the celebratory
 *      empty-state via the view.
 *   4. Hand a typed props bundle to ReadinessActionView for rendering.
 *
 * Data contract (real fields read):
 *   - project.modules[].estimatedMassKg, budgetMassKg, failureModes,
 *     unknowns  → mass-budget-breach, failure-modes-open, unknowns-open
 *   - project.aiCostEstimates[moduleId].totalPerUnit + designBrief
 *     constraints.unitCostCeilingGbp                → cost-over-ceiling
 *   - project.briefLockedAt                         → brief-not-locked
 *   - project.research.designBrief.regulatory[]     → regulatory-not-declared
 *   - (team-related readiness pulls from specialists in a later round;
 *     until then name-your-cto is only selectable via ?item=name-your-cto)
 *
 * Content templates — every path / expert row / paragraph that appears on
 * the rendered page comes from the `ITEM_TEMPLATES` lookup below. This is
 * the static content layer the mockup specified; nothing is synthesised
 * free-form at runtime.
 *
 * @related
 *   - View:   ./readiness-action-view.tsx
 *   - Styles: ./readiness-action-v2.css (scoped .ra2 — do NOT modify)
 */

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadCadLabProject } from "@/actions/cad-lab-projects"

import {
    ReadinessActionView,
    type ReadinessActionViewProps,
    type ReadinessItemKey,
    type ReadinessItemTemplate,
} from "./readiness-action-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Readiness action · The Forge",
    description: "Resolve a blocking readiness item — three action paths, pre-vetted candidates, a recommendation calibrated to your runway and stage.",
}

export default async function ForgeV2ReadinessActionPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ item?: string }>
}): Promise<React.ReactNode> {
    const [{ id }, { item: itemParamRaw }] = await Promise.all([params, searchParams])

    const loadResult = await loadCadLabProject(id)
    if ("error" in loadResult || !loadResult.project) {
        notFound()
    }
    const project = loadResult.project

    // ── Derive unresolved readiness items from real state ──────────────
    const unresolved: ReadinessItemKey[] = []

    // Brief lock
    if (project.briefLockedAt === null) {
        unresolved.push("brief-not-locked")
    }

    // Mass / cost / modules gates — only applicable once modules exist
    const modules = project.modules ?? []

    // Mass budget breach — any module whose estimatedMassKg exceeds its
    // declared budgetMassKg (if both are present).
    const massBreachCount = modules.reduce((acc, m) => {
        if (typeof m.estimatedMassKg === "number" && typeof m.budgetMassKg === "number" && m.estimatedMassKg > m.budgetMassKg) {
            return acc + 1
        }
        return acc
    }, 0)
    if (massBreachCount > 0) {
        unresolved.push("mass-budget-breach")
    }

    // Unknowns open — sum unknowns across modules
    const unknownsCount = modules.reduce((acc, m) => acc + (Array.isArray(m.unknowns) ? m.unknowns.length : 0), 0)
    if (unknownsCount > 0) {
        unresolved.push("unknowns-open")
    }

    // Failure modes open — sum failureModes across modules
    const failureModesCount = modules.reduce((acc, m) => acc + (Array.isArray(m.failureModes) ? m.failureModes.length : 0), 0)
    if (failureModesCount > 0) {
        unresolved.push("failure-modes-open")
    }

    // Cost over ceiling — sum ai cost estimates exceeds designBrief ceiling
    const designBrief = project.research?.designBrief ?? null
    const costCeiling = typeof designBrief?.constraints?.unitCostCeilingGbp === "number"
        ? designBrief.constraints.unitCostCeilingGbp
        : null
    const totalCost = Object.values(project.aiCostEstimates ?? {}).reduce((acc, row) => {
        return acc + (typeof row?.totalPerUnit === "number" ? row.totalPerUnit : 0)
    }, 0)
    if (costCeiling !== null && totalCost > costCeiling) {
        unresolved.push("cost-over-ceiling")
    }

    // Regulatory posture not declared
    const regulatoryDeclared = Array.isArray(designBrief?.regulatory) && (designBrief?.regulatory?.length ?? 0) > 0
    if (!regulatoryDeclared) {
        unresolved.push("regulatory-not-declared")
    }

    // ── Resolve active item key ────────────────────────────────────────
    const itemParam = isReadinessItemKey(itemParamRaw) ? itemParamRaw : null
    const activeKey = itemParam ?? unresolved[0] ?? null
    const template = activeKey !== null ? ITEM_TEMPLATES[activeKey] : null

    // ── Context stats (recommendation card) ────────────────────────────
    // Runway / stage / close target are not yet wired to a live finance
    // table; we render honest placeholders ("Not yet declared") so the
    // page never invents numbers. The mockup's "14.2 mo / Pre-Seed / Sep
    // 2026" stats will appear once a foundry_finance row ships.
    const runwayLabel = "Not yet declared"
    const stageLabel = "Not yet declared"
    const nextCloseLabel = "Not yet declared"

    const viewProps: ReadinessActionViewProps = {
        project: {
            id: project.id,
            name: project.name,
        },
        runwayLabel,
        stageLabel,
        nextCloseLabel,
        item: template,
        unresolvedCount: unresolved.length,
    }

    return <ReadinessActionView {...viewProps} />
}

// ─── Helpers ───────────────────────────────────────────────────────────

function isReadinessItemKey(value: unknown): value is ReadinessItemKey {
    return typeof value === "string" && value in ITEM_TEMPLATES
}

// ─── Content templates ─────────────────────────────────────────────────
//
// Every visible string on the rendered page for a given item key lives in
// this lookup. Adding a new readiness dimension is a structured addition:
// add the key to the union in the view file, add a template here, and wire
// a predicate above. The view file has zero free-form copy of its own.

const ITEM_TEMPLATES: Record<ReadinessItemKey, ReadinessItemTemplate> = {
    "name-your-cto": {
        key: "name-your-cto",
        dimensionLabel: "Readiness gap · Team dimension",
        title: "Name your CTO (or a signed advisor)",
        meta: [
            "Missing from the ",
            { strong: "\"Why this team?\"" },
            " investor question · every Seed investor in your target list asks this · ",
            { strong: "blocks pre-Seed close" },
            " per Fiona's audit.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "The hardware risk concentrates in one person." },
                " Without a named technical owner, every investor model lists \"CTO gap · founder dependency\" as the #1 risk. You can't build the pilot on your own — BOM lock needs someone who can challenge quotes from the other side of the table.",
            ],
            [
                { strong: "It moves the Seed needle more than any other single action." },
                " Deck-review scoring shows \"named CTO or signed technical advisor\" swings pre-Seed conviction by ~18% on average — larger than a revenue milestone of £50k.",
            ],
            [
                { strong: "Runway shortens optionality." },
                " The longer you wait, the fewer candidates see a runway ≥9 months — and that's the threshold most good people use before committing.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Seed investors (pre-revenue hardware):" },
                " ask this unprompted in ~90% of first meetings. They want to hear a name, a commitment level, and a prior shipped product — in that order.",
            ],
            [
                { strong: "Design-partner customers:" },
                " \"What happens when you're sick, or when my operators call you at 6am on a Sunday?\" The honest answer (\"right now it's me\") is pre-emptive; they typically give you until first delivery to close the gap.",
            ],
            [
                { strong: "Contract manufacturers:" },
                " CMs typically want a named engineering point-of-contact before they quote seriously. Quote quality improves once they know whom they're talking to.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Hire full-time CTO",
                tagline: "Salary + equity CTO on payroll. The gold-standard answer for investors.",
                metaRows: [
                    { k: "Cost (year 1)", v: "£85–110k" },
                    { k: "Time to close", v: "3–5 mo" },
                    { k: "Equity range", v: "1.5–3%" },
                    { k: "Risk", v: "Runway" },
                ],
                pros: [
                    "Full-time accountability and deep ownership",
                    "Investors tick the \"Team\" box without caveat",
                ],
                cons: [
                    "Cash burn hits hard — runway drops meaningfully",
                    "3–5 month search ties up your time when pilot needs shipping",
                    "Wrong-hire risk is severe pre-revenue",
                ],
                ctaLabel: "Start CTO search brief →",
                recommended: false,
            },
            {
                letter: "B",
                heading: "Signed technical advisor",
                tagline: "Named senior engineer · 1–2 days/mo · paid in equity only.",
                metaRows: [
                    { k: "Cost (year 1)", v: "£0 cash" },
                    { k: "Time to close", v: "2–4 wk" },
                    { k: "Equity range", v: "0.25–0.5%" },
                    { k: "Risk", v: "Depth" },
                ],
                pros: [
                    "Named person, credible name on the deck in 3–4 weeks",
                    "No cash burn; equity-only · protects runway",
                    "Keeps the CTO decision open — advisor can convert later",
                ],
                cons: [
                    "Investors discount versus a full CTO (but accept it for pre-Seed)",
                    "Not enough hours for field emergencies by themselves",
                ],
                ctaLabel: "Shortlist advisors →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "Fractional CTO",
                tagline: "2–3 days/week senior engineer · rate-card · 6-month engagement with reassessment.",
                metaRows: [
                    { k: "Cost (year 1)", v: "£28–42k" },
                    { k: "Time to close", v: "2–3 wk" },
                    { k: "Equity range", v: "0–0.5%" },
                    { k: "Risk", v: "Continuity" },
                ],
                pros: [
                    "Real hours (2–3 days/wk) — can run the pilot and a BOM review",
                    "Named + senior · investors weight it like an advisor +",
                    "Converts cleanly to full-time post-Seed close",
                    "Runway stays healthier than with a full hire",
                ],
                cons: [
                    "Less ownership depth than a full hire · watch for drift at month 4–5",
                ],
                ctaLabel: "See pre-vetted fractionals →",
                recommended: true,
            },
        ],
        experts: [
            {
                initials: "DM",
                tint: "brand",
                name: "Dr. Daniel Mwangi",
                bio: "Ex-VP Engineering at a 48k-unit hardware scale-up · 2 day/wk available",
                tags: [
                    { label: "Sector fit", kind: "fit" },
                    { label: "Available May", kind: "avail" },
                ],
                rateLine: "£650",
                rateUnit: "per day",
            },
            {
                initials: "AP",
                tint: "info",
                name: "Anna Parkhurst",
                bio: "Lead embedded engineer (IoT devices) · 3× shipped hardware · UK-based · remote + trips",
                tags: [
                    { label: "IoT fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "£780",
                rateUnit: "per day",
            },
            {
                initials: "KB",
                tint: "success",
                name: "Kwame Boateng",
                bio: "Ex-industrial engineer · power-electronics + LoRa/SMS comms · 3 day/wk available",
                tags: [
                    { label: "Comms fit", kind: "fit" },
                    { label: "Available Jun", kind: "avail" },
                ],
                rateLine: "£540",
                rateUnit: "per day",
            },
        ],
        recommendationTitle: "Start conversations with the top fractional candidate (Path C)",
        recommendationParagraphs: [
            [
                { strong: "Why fractional, why now." },
                " At typical pre-Seed runway you can afford a fractional engagement but not a £85k+ full hire. A named senior engineer moves the \"Why this team?\" answer from \"one person\" to \"two, and one of them has shipped the closest-adjacent product.\"",
            ],
            [
                { strong: "Commit to a 6-month engagement" },
                ", not 12 — this keeps the full-CTO decision open for post-Seed. Signal in the conversation that you expect to convert to a full hire at Seed close.",
            ],
        ],
        annotation: {
            body: [
                "Once the engagement is signed, add the candidate to the deck's Team slide with a one-line credential — role, prior company, units shipped. That single line is worth roughly 15–20% of the Seed conviction score on most deck rubrics. Don't overclaim — don't list them as \"CTO\" if they're fractional. \"Technical lead · fractional\" is defensible and investors respect the honesty.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "brief-not-locked": {
        key: "brief-not-locked",
        dimensionLabel: "Readiness gap · Brief dimension",
        title: "Lock the brief",
        meta: [
            "Suppliers cite a locked revision on RFQs · downstream artefacts (BOM, Suppliers, Risks) rerun from the locked brief · ",
            { strong: "blocks first RFQ send" },
            ".",
        ],
        whyMattersParagraphs: [
            [
                { strong: "An unlocked brief means every downstream artefact is provisional." },
                " Suppliers cannot cite a draft on an RFQ; specialists cannot sign a review against a moving target. Lock first, iterate via revisions.",
            ],
            [
                { strong: "Revisions are cheap — drafting forever is not." },
                " Locking Revision A doesn't freeze anything permanently. Any later change creates Revision B with a diff view, and downstream artefacts rerun automatically.",
            ],
            [
                { strong: "A locked brief signals readiness to investors." },
                " Deck reviewers can tell the difference between a founder with an anchor spec and one still rewriting their mission statement every week.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Suppliers:" },
                " won't quote seriously against a draft. The first RFQ send needs a locked Revision reference on every line-item.",
            ],
            [
                { strong: "Your specialists:" },
                " sign reviews against a revision number. An unlocked brief means their sign-offs are conditional.",
            ],
            [
                { strong: "Investors:" },
                " read the lock state as a proxy for discipline. A project at design revision 6 with nothing locked reads worse than one at revision 2 with Revision A locked.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Lock now, iterate via Revision B",
                tagline: "Freeze the current draft as Revision A. Downstream artefacts rerun immediately.",
                metaRows: [
                    { k: "Time to close", v: "2 min" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Suppliers can cite Revision A on the first RFQ",
                    "Reversible — edits create Revision B, not overwrite A",
                    "Unblocks every downstream artefact in one action",
                ],
                cons: [
                    "If the brief is still materially wrong, you'll need a fast Revision B",
                ],
                ctaLabel: "Lock Revision A →",
                recommended: false,
            },
            {
                letter: "B",
                heading: "Red-team then lock",
                tagline: "Run a 48-hour specialist red-team against the draft, fix the P1 findings, then lock.",
                metaRows: [
                    { k: "Time to close", v: "2–3 days" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Catches the brief-level errors that cost a Revision B",
                    "Specialists sign their reviews against a sharper draft",
                    "Lock-state banner turns green with fewer caveats",
                ],
                cons: [
                    "Delays first RFQ send by a few days",
                ],
                ctaLabel: "Start red-team →",
                recommended: true,
            },
            {
                letter: "C",
                heading: "Keep drafting",
                tagline: "Stay unlocked until every field feels final. Explicitly accept the downstream delay.",
                metaRows: [
                    { k: "Time to close", v: "Open" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Medium" },
                ],
                pros: [
                    "No premature lock pressure",
                ],
                cons: [
                    "RFQs, supplier matching, specialist sign-offs all blocked",
                    "Investors read the unlocked state as indecision",
                ],
                ctaLabel: "Park for 7 days →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "SA",
                tint: "brand",
                name: "Sage · Strategy specialist",
                bio: "Red-teams the mission / target-customer / why-now narrative for investor-readiness",
                tags: [
                    { label: "Brief fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "PR",
                tint: "info",
                name: "Priya · Product specialist",
                bio: "Pressure-tests the constraint envelope (ship date, batch size, production region)",
                tags: [
                    { label: "Constraints fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "LE",
                tint: "success",
                name: "Leo · Legal specialist",
                bio: "Reviews the regulatory posture tile before lock so certs aren't a surprise later",
                tags: [
                    { label: "Reg fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Run a 48-hour red-team, then lock Revision A (Path B)",
        recommendationParagraphs: [
            [
                { strong: "Why red-team first." },
                " A three-specialist pass on the draft catches the brief-level errors that would otherwise cost a Revision B in week two. Sage on narrative, Priya on constraints, Leo on regulatory.",
            ],
            [
                { strong: "Lock after the first red-team round." },
                " Don't wait for a second pass — Revision B is the right place for the second round of improvements, not more drafting.",
            ],
        ],
        annotation: {
            body: [
                "Locking Revision A is the single cleanest signal you can send to investors that the project has a spine. Use the locked-brief PDF export as the attachment in the next investor update; reviewers rate the discipline visible in the lock state more than the content of any single field.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "mass-budget-breach": {
        key: "mass-budget-breach",
        dimensionLabel: "Readiness gap · Mass dimension",
        title: "Close the mass-budget breach",
        meta: [
            "One or more modules exceed their declared mass budget · ",
            { strong: "blocks modules sign-off" },
            " until the delta resolves.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "Mass is a derived constraint, not a wish." },
                " If total estimated mass exceeds the declared cap, the system cannot meet the mission envelope. Fixing this upstream is cheaper than rediscovering it at first test.",
            ],
            [
                { strong: "Every over-budget module is a redesign candidate." },
                " Common levers: material substitution, wall-thickness review, part-count reduction, and moving non-critical mass to the service floor.",
            ],
            [
                { strong: "The breach compounds downstream." },
                " Each over-budget gram raises power draw, motor sizing, and BOM cost. Closing the mass gap typically unlocks 3-4 other readiness dimensions.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Your manufacturing specialist:" },
                " cannot sign the modules-ready review while mass sits over the declared budget.",
            ],
            [
                { strong: "Suppliers quoting the BOM:" },
                " price to the mass estimate. Fixing mass before RFQ saves a re-quote cycle.",
            ],
            [
                { strong: "Investors reviewing the engineering slide:" },
                " read an unresolved mass breach as \"this team doesn't yet trust its own numbers.\"",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Material substitution sweep",
                tagline: "Swap high-density parts to composites / aluminium where the margin permits.",
                metaRows: [
                    { k: "Time to close", v: "1–2 wk" },
                    { k: "Cost", v: "Low" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Typically closes 40–70% of the gap without geometry change",
                    "No rework of module interfaces",
                    "Often reduces BOM cost in parallel",
                ],
                cons: [
                    "Material certs need refreshing",
                ],
                ctaLabel: "Run material sweep →",
                recommended: true,
            },
            {
                letter: "B",
                heading: "Geometry redesign",
                tagline: "Re-decompose or re-spec the over-budget module to shed mass structurally.",
                metaRows: [
                    { k: "Time to close", v: "2–4 wk" },
                    { k: "Cost", v: "Medium" },
                    { k: "Reversible", v: "Partial" },
                    { k: "Risk", v: "Medium" },
                ],
                pros: [
                    "Deepest possible mass cut",
                    "Can also fix adjacent failure modes",
                ],
                cons: [
                    "Triggers a Revision B on the brief",
                    "Interfaces with other modules may need re-certifying",
                ],
                ctaLabel: "Open redesign brief →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "Raise the cap (explicit)",
                tagline: "Declare a higher mass envelope on the brief, accept the downstream consequences.",
                metaRows: [
                    { k: "Time to close", v: "1 day" },
                    { k: "Cost", v: "£0 up-front" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "High" },
                ],
                pros: [
                    "Fastest way to unblock the readiness flag",
                ],
                cons: [
                    "Power / cost / range all take the hit downstream",
                    "Signals to the team that caps are soft",
                ],
                ctaLabel: "Raise cap in brief →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "FA",
                tint: "brand",
                name: "Fang · Manufacturing specialist",
                bio: "Leads material substitution sweeps · can spot density savings no one else flags",
                tags: [
                    { label: "Mass fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "JI",
                tint: "info",
                name: "Jian · VP Engineering specialist",
                bio: "Owns geometry redesign for over-budget modules; will force tradeoff clarity",
                tags: [
                    { label: "Redesign fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "MA",
                tint: "success",
                name: "Max · CTO specialist",
                bio: "Called on when raising the cap is on the table — decides whether the downstream cost is survivable",
                tags: [
                    { label: "Judgement fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Start with a material substitution sweep (Path A)",
        recommendationParagraphs: [
            [
                { strong: "Why Path A first." },
                " Material sweeps close most mass breaches in 1–2 weeks with no interface changes. Geometry redesign (Path B) is the right move only if the sweep closes less than ~60% of the gap.",
            ],
            [
                { strong: "Save Path C for written-sign-off only." },
                " Raising the mass cap on the brief is a last resort — log the tradeoff explicitly (power + cost impact) and get a specialist sign-off before editing the constraint.",
            ],
        ],
        annotation: {
            body: [
                "Reviewers recognise the pattern: a founder who closes a mass breach with a material sweep before first RFQ reads as disciplined. A founder who raises the cap without annotation reads as someone who caves to numbers. Log the path you took on the brief, whichever you choose.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "cost-over-ceiling": {
        key: "cost-over-ceiling",
        dimensionLabel: "Readiness gap · Cost dimension",
        title: "Close the cost-ceiling breach",
        meta: [
            "Estimated all-in unit cost exceeds the declared ceiling · ",
            { strong: "blocks pricing sign-off" },
            " until the gap resolves.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "Cost ceilings are promises to buyers, not aspirations." },
                " If the estimated all-in cost exceeds the ceiling, either the target price is wrong, the BOM is over-spec'd, or the scale assumptions don't line up.",
            ],
            [
                { strong: "Small cost overages compound at batch-1." },
                " A 12% overage per unit at the first 50-unit batch is often the difference between margin and loss, and sets the tone for every later RFQ.",
            ],
            [
                { strong: "The cheapest fix is usually upstream." },
                " Part-count consolidation and supplier substitution typically cut 15–25% before geometry redesign is on the table.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Finance / your finance specialist:" },
                " cannot sign a unit-cost model that doesn't balance to the ceiling on the brief.",
            ],
            [
                { strong: "Suppliers on the first RFQ:" },
                " price against the BOM as stated. If the BOM is over-spec'd, quotes will come back high and you'll re-quote.",
            ],
            [
                { strong: "Investors reviewing the gross-margin slide:" },
                " will ask directly why the modelled unit cost is above the stated ceiling.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "BOM rationalisation sweep",
                tagline: "Consolidate part count · swap suppliers · cut non-critical spec.",
                metaRows: [
                    { k: "Time to close", v: "1–2 wk" },
                    { k: "Cost", v: "Low" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Typically closes 50–70% of the gap with no geometry change",
                    "Strengthens supplier matching at next RFQ",
                    "Often reduces mass in parallel",
                ],
                cons: [
                    "Requires disciplined part-spec review",
                ],
                ctaLabel: "Start BOM sweep →",
                recommended: true,
            },
            {
                letter: "B",
                heading: "Scale-up assumption check",
                tagline: "Review the volume assumptions in the cost model — is the batch size realistic?",
                metaRows: [
                    { k: "Time to close", v: "1 wk" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Sometimes closes the gap without any BOM change",
                    "Forces an honest conversation about pilot vs scale costs",
                ],
                cons: [
                    "If the model is right, this doesn't move the needle",
                ],
                ctaLabel: "Review assumptions →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "Raise the ceiling (explicit)",
                tagline: "Declare a higher unit-cost ceiling on the brief; accept the margin / price consequences.",
                metaRows: [
                    { k: "Time to close", v: "1 day" },
                    { k: "Cost", v: "£0 up-front" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "High" },
                ],
                pros: [
                    "Fastest way to unblock the readiness flag",
                ],
                cons: [
                    "Cuts gross margin or forces a price rise",
                    "Signals to the team that ceilings are soft",
                ],
                ctaLabel: "Raise ceiling in brief →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "FI",
                tint: "brand",
                name: "Finn · Finance specialist",
                bio: "Reviews the cost model end-to-end · calls out soft assumptions",
                tags: [
                    { label: "Cost fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "CH",
                tint: "info",
                name: "Chase · VP Supply-chain specialist",
                bio: "Runs the supplier-substitution play · has a view on where 20% comes from",
                tags: [
                    { label: "BOM fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "FA",
                tint: "success",
                name: "Fang · Manufacturing specialist",
                bio: "Pairs with Chase on the rationalisation sweep · part-count consolidation",
                tags: [
                    { label: "Mfg fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Start with a BOM rationalisation sweep (Path A)",
        recommendationParagraphs: [
            [
                { strong: "Why Path A first." },
                " BOM sweeps close most cost breaches in 1–2 weeks without geometry changes. Pair Chase (supplier substitution) with Fang (part-count consolidation) — the two-headed pass catches what either alone would miss.",
            ],
            [
                { strong: "Do Path B only if the sweep stalls." },
                " Assumption review helps when the model is volume-sensitive; it doesn't rescue an over-spec'd BOM.",
            ],
        ],
        annotation: {
            body: [
                "Log the exact levers used to close the gap in the brief's cost model. Reviewers who see \"closed 12% via supplier X → Y + 2 part consolidations\" give the project far more credit than ones who just see the revised ceiling.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "unknowns-open": {
        key: "unknowns-open",
        dimensionLabel: "Readiness gap · Risks dimension",
        title: "Resolve the open unknowns",
        meta: [
            "One or more modules carry open unknowns from decomposition · ",
            { strong: "blocks risks sign-off" },
            " until resolved or explicitly parked.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "An unknown is a deferred decision, not an unanswerable question." },
                " Each open unknown carries a cost-of-delay: the longer it stays open, the later you discover its impact on BOM, cost, or the mission envelope.",
            ],
            [
                { strong: "Most unknowns are cheap to close with a 30-minute specialist question." },
                " The cost comes from letting them age, not from the research itself.",
            ],
            [
                { strong: "Investors read open unknowns as a proxy for discipline." },
                " A project with 12 unknowns on the register 6 weeks into development reads worse than one with 3 — even if the 3 are harder.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Your specialists:" },
                " cannot sign their module reviews while unknowns remain open on their module.",
            ],
            [
                { strong: "Suppliers at RFQ:" },
                " need the unknown resolved (or explicitly parked with a fallback spec) to quote.",
            ],
            [
                { strong: "Investors reviewing the risk register:" },
                " look at the unknowns-per-module ratio as a proxy for engineering maturity.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Specialist burndown",
                tagline: "Assign each unknown to a specialist; clear the register in one focused week.",
                metaRows: [
                    { k: "Time to close", v: "1 wk" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Unblocks every downstream artefact at once",
                    "Specialists already have the context",
                    "Cheapest move by a wide margin",
                ],
                cons: [
                    "Requires a focused week — not a background activity",
                ],
                ctaLabel: "Start burndown →",
                recommended: true,
            },
            {
                letter: "B",
                heading: "Park explicitly with fallback",
                tagline: "Mark each unknown as parked, with a fallback spec that lets downstream artefacts proceed.",
                metaRows: [
                    { k: "Time to close", v: "1 day" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Medium" },
                ],
                pros: [
                    "Unblocks the readiness flag immediately",
                    "Fallback spec documents the assumption cleanly",
                ],
                cons: [
                    "The unknown comes back to bite at first prototype if the fallback is wrong",
                ],
                ctaLabel: "Park with fallback →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "External consultant",
                tagline: "Book a 2-hour consultant call on the hardest unknown; resolve in one session.",
                metaRows: [
                    { k: "Time to close", v: "1–2 wk" },
                    { k: "Cost", v: "£400–1200" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Right move when the unknown is specialist-beyond-specialist",
                    "A single call often unblocks multiple dependent items",
                ],
                cons: [
                    "Overkill for 80% of unknowns",
                ],
                ctaLabel: "Find consultant →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "SA",
                tint: "brand",
                name: "Sage · Strategy specialist",
                bio: "Runs the unknowns-burndown week · sequences the questions so blockers clear first",
                tags: [
                    { label: "Burndown fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "JI",
                tint: "info",
                name: "Jian · VP Engineering specialist",
                bio: "Owns the technical unknowns · will force a \"park with fallback\" call when research is the wrong move",
                tags: [
                    { label: "Tech fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "LE",
                tint: "success",
                name: "Leo · Legal specialist",
                bio: "Resolves regulatory / IP-shaped unknowns in one session each",
                tags: [
                    { label: "Reg fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Run a specialist burndown week (Path A)",
        recommendationParagraphs: [
            [
                { strong: "Why burndown first." },
                " Most unknowns close in a 30-minute specialist pass. A focused week clears the register end-to-end and unblocks every downstream artefact at once.",
            ],
            [
                { strong: "Park with fallback only for unknowns that depend on live test data." },
                " Don't park as a shortcut — the fallback spec has to be a real, defensible answer, not a placeholder.",
            ],
        ],
        annotation: {
            body: [
                "The register itself is a diligence artefact. Exporting a clean \"unknowns closed / parked with fallback / still open\" list to investors reads much better than a narrative. Close what's cheap, park what's waiting on live data, log both.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "failure-modes-open": {
        key: "failure-modes-open",
        dimensionLabel: "Readiness gap · Risks dimension",
        title: "Mitigate the open failure modes",
        meta: [
            "One or more modules carry unmitigated failure modes · ",
            { strong: "blocks risks sign-off" },
            " until each has a mitigation or an explicit accepted-risk note.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "Failure modes without mitigations are known-unknowns." },
                " They're worse than unknowns because someone already flagged them — and then stopped.",
            ],
            [
                { strong: "Most failure modes have three cheap mitigations and one expensive one." },
                " A structured review typically finds the cheap option in under an hour.",
            ],
            [
                { strong: "An unreviewed failure-mode register signals the team isn't taking risk seriously." },
                " Investors, insurers, and design partners all read it the same way.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Your manufacturing specialist:" },
                " won't sign the modules-ready review while failure modes sit unmitigated.",
            ],
            [
                { strong: "Design-partner customers:" },
                " ask for the failure-mode register before signing a pilot agreement.",
            ],
            [
                { strong: "Investors on the risk slide:" },
                " expect named failure modes + mitigations, not bullet lists.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Specialist-led FMEA session",
                tagline: "A 2-hour session with Fang + Jian · mitigation per mode + accepted-risk column.",
                metaRows: [
                    { k: "Time to close", v: "1 wk" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Closes most failure modes in one session",
                    "Produces an export-ready FMEA table",
                    "Improves the risk slide meaningfully",
                ],
                cons: [
                    "Needs disciplined facilitation",
                ],
                ctaLabel: "Schedule FMEA →",
                recommended: true,
            },
            {
                letter: "B",
                heading: "Mitigation-per-mode burndown",
                tagline: "Founder-led — work through the list, add a one-line mitigation per mode.",
                metaRows: [
                    { k: "Time to close", v: "2–3 days" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Medium" },
                ],
                pros: [
                    "No calendar coordination",
                    "Forces you to engage directly with each mode",
                ],
                cons: [
                    "Quality of mitigations varies without a specialist lens",
                ],
                ctaLabel: "Start burndown →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "Hire a reliability consultant",
                tagline: "2-day engagement for complex systems · full FMEA + test-plan recommendation.",
                metaRows: [
                    { k: "Time to close", v: "2 wk" },
                    { k: "Cost", v: "£2–4k" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Right move for safety-critical systems",
                    "Produces a certifiable FMEA + test plan",
                ],
                cons: [
                    "Overkill for most early-stage hardware",
                ],
                ctaLabel: "Find consultant →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "FA",
                tint: "brand",
                name: "Fang · Manufacturing specialist",
                bio: "Leads the FMEA session · identifies the process-level failure modes",
                tags: [
                    { label: "FMEA fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "JI",
                tint: "info",
                name: "Jian · VP Engineering specialist",
                bio: "Co-leads the FMEA · pushes back on mitigations that don't address the root cause",
                tags: [
                    { label: "Eng fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "MA",
                tint: "success",
                name: "Max · CTO specialist",
                bio: "Called on when accepted-risk notes are on the table · decides whether the trade is survivable",
                tags: [
                    { label: "Judgement fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Run a specialist-led FMEA session (Path A)",
        recommendationParagraphs: [
            [
                { strong: "Why Path A first." },
                " A two-hour FMEA with Fang + Jian closes most failure modes in a single session — and produces an investor-ready FMEA table as a side-effect.",
            ],
            [
                { strong: "Reserve the consultant path for safety-critical systems." },
                " A £2-4k reliability engagement is the right call when the product touches humans directly; otherwise the specialist session is the better price-performance trade.",
            ],
        ],
        annotation: {
            body: [
                "The FMEA export is one of the highest-signal investor artefacts a hardware project can carry. Named failure modes + specific mitigations + accepted-risk column reads as a team that understands its own risk surface — the opposite of a bullet-list risk slide.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },

    "regulatory-not-declared": {
        key: "regulatory-not-declared",
        dimensionLabel: "Readiness gap · Regulatory dimension",
        title: "Declare the regulatory posture",
        meta: [
            "No regulatory standards are declared on the brief · ",
            { strong: "blocks supplier sign-off" },
            " until posture is recorded.",
        ],
        whyMattersParagraphs: [
            [
                { strong: "Regulatory posture is not a compliance deliverable — it's a declaration." },
                " You're stating which standards the product is designed to meet. The actual certs come later; the declaration has to be in the brief now.",
            ],
            [
                { strong: "The declaration is what suppliers quote against." },
                " A BOM priced against \"we'll figure out the standards later\" will be re-quoted once the standards land.",
            ],
            [
                { strong: "Most early-stage products need 2–4 standards, not a stack of 20." },
                " A targeted posture beats an aspirational one.",
            ],
        ],
        whoAskingParagraphs: [
            [
                { strong: "Suppliers:" },
                " need the posture to quote materials, processes, and cert-adjacent services.",
            ],
            [
                { strong: "Leo (legal specialist):" },
                " cannot sign a regulatory review while the posture is blank.",
            ],
            [
                { strong: "Investors reviewing regulatory risk:" },
                " look at the posture as the first signal on whether the project understands its cert path.",
            ],
        ],
        paths: [
            {
                letter: "A",
                heading: "Specialist-led declaration",
                tagline: "2-hour session with Leo · list the 2–4 standards the product is designed to meet.",
                metaRows: [
                    { k: "Time to close", v: "3 days" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Shortest path to a defensible posture",
                    "Posture is tight — no aspirational list",
                    "Unblocks RFQs immediately",
                ],
                cons: [
                    "Needs 2 hours of Leo's time",
                ],
                ctaLabel: "Book Leo session →",
                recommended: true,
            },
            {
                letter: "B",
                heading: "Desk research + self-declare",
                tagline: "Founder-led — 1 day reviewing analogous products, then list standards on the brief.",
                metaRows: [
                    { k: "Time to close", v: "1 day" },
                    { k: "Cost", v: "£0" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Medium" },
                ],
                pros: [
                    "Fastest option",
                    "Good sense-check against Path A",
                ],
                cons: [
                    "Risk of missing a standard a specialist would have flagged",
                ],
                ctaLabel: "Start research →",
                recommended: false,
            },
            {
                letter: "C",
                heading: "External regulatory consultant",
                tagline: "Multi-week engagement · full compliance strategy + test-house shortlist.",
                metaRows: [
                    { k: "Time to close", v: "3–4 wk" },
                    { k: "Cost", v: "£3–8k" },
                    { k: "Reversible", v: "Yes" },
                    { k: "Risk", v: "Low" },
                ],
                pros: [
                    "Right move for multi-market regulated products",
                    "Produces a certifiable compliance roadmap",
                ],
                cons: [
                    "Overkill before first prototype",
                ],
                ctaLabel: "Find consultant →",
                recommended: false,
            },
        ],
        experts: [
            {
                initials: "LE",
                tint: "brand",
                name: "Leo · Legal specialist",
                bio: "Leads the posture declaration · knows which standards are actually load-bearing for the product class",
                tags: [
                    { label: "Reg fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "FA",
                tint: "info",
                name: "Fang · Manufacturing specialist",
                bio: "Cross-checks the posture against manufacturing feasibility · flags standards that change BOM",
                tags: [
                    { label: "Mfg fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
            {
                initials: "CH",
                tint: "success",
                name: "Chase · VP Supply-chain specialist",
                bio: "Reviews the posture against supplier availability for regulated components",
                tags: [
                    { label: "Supply fit", kind: "fit" },
                    { label: "Available now", kind: "avail" },
                ],
                rateLine: "Included",
                rateUnit: "with plan",
            },
        ],
        recommendationTitle: "Book a specialist-led declaration with Leo (Path A)",
        recommendationParagraphs: [
            [
                { strong: "Why Path A first." },
                " A two-hour session with Leo is the fastest way to a tight, defensible posture. The alternative (founder-led desk research) carries the risk of missing a standard, which costs far more than the specialist time.",
            ],
            [
                { strong: "Reserve the consultant path for multi-market regulated products." },
                " If the posture needs to cover 3+ jurisdictions, the £3–8k engagement pays back. Single-market, single-class products don't need it.",
            ],
        ],
        annotation: {
            body: [
                "Investors read the regulatory tile as the second-highest-signal on the brief (after \"Why this team?\"). A tight posture — 2-4 named standards with status — reads as a team that knows its cert path. A blank tile reads as the opposite.",
            ],
            signoff: "Fiona, Fundraising",
        },
    },
}
