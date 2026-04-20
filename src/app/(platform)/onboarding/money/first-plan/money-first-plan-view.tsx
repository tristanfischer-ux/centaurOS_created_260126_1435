/**
 * MoneyFirstPlanView — /onboarding/money/first-plan (Money onboarding 3/5)
 *
 * @description Client component for Money onboarding step 3. Mockup-faithful
 * port of MONEY-MOCKUP-ONBOARDING-FIRST-PLAN.html. Four templates (UK
 * pre-seed hardware / US pre-seed hardware / UK pre-seed SaaS / bootstrapped),
 * plus CSV import and start-blank escape hatches. The selected template's
 * preview updates live underneath the grid.
 *
 * Voice: first-person, British spelling, no "AI" / "smart" / "intelligent".
 *
 * @related
 *   - Page:   ./page.tsx
 *   - Styles: ./money-first-plan.css (scoped .mob2-first-plan)
 *   - Action: src/actions/welcome.ts → markMoneyOnboardingStepComplete
 *   - Mockup: MONEY-MOCKUP-ONBOARDING-FIRST-PLAN.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { markMoneyOnboardingStepComplete } from "@/actions/welcome"

import "./money-first-plan.css"

type TemplateId = "uk_pre_seed_hardware" | "us_pre_seed_hardware" | "uk_pre_seed_saas" | "bootstrapped"

interface PreviewLine {
    icon: string
    name: string
    meta: string
    freq: string
    amount: string
}

interface Template {
    id: TemplateId
    title: string
    description: string
    bullets: ReadonlyArray<{ label: string; detail: string }>
    summary: string
    burn: string
    preview: ReadonlyArray<PreviewLine>
    previewExtra: string
}

const TEMPLATES: ReadonlyArray<Template> = [
    {
        id: "uk_pre_seed_hardware",
        title: "UK pre-seed · hardware",
        description: "Pre-seed UK startup, 3–6 people, physical product. Your profile matches this.",
        bullets: [
            { label: "5 FTEs", detail: "£34k/mo payroll" },
            { label: "Workshop rent", detail: "£2.4k/quarter" },
            { label: "Components + shipping", detail: "£11k/mo variable" },
            { label: "SaaS + insurance", detail: "£1.8k/mo" },
            { label: "Grant + first pilot", detail: "revenue lines" },
        ],
        summary: "9 cost lines · 3 income lines",
        burn: "£48k/mo default burn",
        preview: [
            { icon: "●", name: "Payroll — 5 FTEs",      meta: "People · founder + 4 engineers",    freq: "Monthly",   amount: "£34,220" },
            { icon: "●", name: "Makerspace rent",        meta: "Premises · quarterly",              freq: "Quarterly", amount: "£2,400" },
            { icon: "●", name: "Prototype components",   meta: "Materials · variable",              freq: "Variable",  amount: "£8,200" },
            { icon: "●", name: "Shipping + customs",     meta: "Materials · DHL / HMRC",            freq: "Variable",  amount: "£3,200" },
            { icon: "●", name: "SaaS stack",             meta: "Tools · Github + Notion + Figma + Linear", freq: "Monthly", amount: "£1,340" },
        ],
        previewExtra: "... 4 more lines preloaded",
    },
    {
        id: "us_pre_seed_hardware",
        title: "US pre-seed · hardware",
        description: "US-based, similar team size, USD-first with US tax conventions.",
        bullets: [
            { label: "5 FTEs", detail: "$48k/mo payroll" },
            { label: "Shared workshop", detail: "$3.5k/mo" },
            { label: "Components + shipping", detail: "$14k/mo" },
            { label: "SaaS + insurance", detail: "$2.5k/mo" },
            { label: "US pilot + SBIR grant", detail: "revenue" },
        ],
        summary: "9 cost lines · 3 income lines",
        burn: "$62k/mo default burn",
        preview: [
            { icon: "●", name: "Payroll — 5 FTEs",     meta: "People · founder + 4 engineers",    freq: "Monthly",  amount: "$48,000" },
            { icon: "●", name: "Shared workshop",      meta: "Premises · monthly",                freq: "Monthly",  amount: "$3,500" },
            { icon: "●", name: "Prototype components", meta: "Materials · variable",              freq: "Variable", amount: "$10,200" },
            { icon: "●", name: "Shipping + customs",   meta: "Materials · UPS / DDP",             freq: "Variable", amount: "$3,800" },
            { icon: "●", name: "SaaS stack",           meta: "Tools · Github + Notion + Figma + Linear", freq: "Monthly", amount: "$1,700" },
        ],
        previewExtra: "... 4 more lines preloaded",
    },
    {
        id: "uk_pre_seed_saas",
        title: "UK pre-seed · software / SaaS",
        description: "Software-first team, no hardware. Smaller materials line, higher growth spend.",
        bullets: [
            { label: "4 FTEs", detail: "£26k/mo payroll" },
            { label: "WeWork desks", detail: "£600/mo" },
            { label: "SaaS + AWS", detail: "£3k/mo" },
            { label: "Growth budget", detail: "£4k/mo" },
            { label: "MRR + annual contracts", detail: "revenue" },
        ],
        summary: "7 cost lines · 2 income lines",
        burn: "£32k/mo default burn",
        preview: [
            { icon: "●", name: "Payroll — 4 FTEs", meta: "People · founder + 3 engineers", freq: "Monthly", amount: "£26,000" },
            { icon: "●", name: "WeWork desks",     meta: "Premises · monthly",             freq: "Monthly", amount: "£600" },
            { icon: "●", name: "SaaS + AWS",       meta: "Tools · cloud hosting + stack",  freq: "Monthly", amount: "£3,000" },
            { icon: "●", name: "Growth budget",    meta: "Growth · ads + content",         freq: "Monthly", amount: "£4,000" },
            { icon: "●", name: "Insurance + legal", meta: "Other · annualised monthly",    freq: "Monthly", amount: "£600" },
        ],
        previewExtra: "... 2 more lines preloaded",
    },
    {
        id: "bootstrapped",
        title: "Bootstrapped / solo founder",
        description: "Just you or a co-founder pair. Low burn, service revenue + product.",
        bullets: [
            { label: "1–2 founders", detail: "modest salary" },
            { label: "Home office", detail: "£0" },
            { label: "SaaS + subs", detail: "£400/mo" },
            { label: "Services + product", detail: "revenue" },
        ],
        summary: "5 cost lines · 2 income lines",
        burn: "£6k/mo default burn",
        preview: [
            { icon: "●", name: "Founder salary", meta: "People · modest draw",   freq: "Monthly",  amount: "£4,500" },
            { icon: "●", name: "Home office",    meta: "Premises · no rent",     freq: "Monthly",  amount: "£0" },
            { icon: "●", name: "SaaS + subs",    meta: "Tools · minimal stack",  freq: "Monthly",  amount: "£400" },
            { icon: "●", name: "Marketing",      meta: "Growth · light touch",   freq: "Variable", amount: "£300" },
            { icon: "●", name: "Accounting",     meta: "Other · bookkeeper fees", freq: "Monthly", amount: "£120" },
        ],
        previewExtra: "",
    },
]

export function MoneyFirstPlanView(): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [selectedId, setSelectedId] = useState<TemplateId>("uk_pre_seed_hardware")

    const selected = TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0]

    const advance = (): void => {
        startTransition(async () => {
            await markMoneyOnboardingStepComplete("first_plan")
            router.push("/onboarding/money/thesis")
        })
    }

    return (
        <div className="mob2-first-plan">
            {/* Top bar */}
            <div className="mob2-first-plan-topbar">
                <div className="mob2-first-plan-brand">
                    <span className="mob2-first-plan-title-dot" aria-hidden="true" />
                    <span>ForgeOS</span>
                </div>
                <div className="mob2-first-plan-progress">
                    <span>Step 3 of 5</span>
                    <div className="mob2-first-plan-pbar" aria-hidden="true">
                        <div className="mob2-first-plan-pf" style={{ width: "60%" }} />
                    </div>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-first-plan-skiplink"
                    >
                        Skip for now
                    </button>
                </div>
            </div>

            <div className="mob2-first-plan-shell">
                {/* Title */}
                <div className="mob2-first-plan-title-wrap">
                    <h1 className="mob2-first-plan-h1">
                        <span className="mob2-first-plan-title-bigdot" aria-hidden="true" />
                        Start from a template
                    </h1>
                    <p className="mob2-first-plan-lead">
                        Pick what&apos;s closest to your stage. I&apos;ll pre-fill typical cost and
                        revenue lines — you edit amounts to match reality.
                    </p>
                </div>

                {/* Template grid */}
                <div className="mob2-first-plan-tpl-grid" role="radiogroup" aria-label="Plan template">
                    {TEMPLATES.map((t) => {
                        const isActive = t.id === selectedId
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                className={`mob2-first-plan-tpl-card${isActive ? " active" : ""}`}
                                onClick={() => setSelectedId(t.id)}
                            >
                                <h3>{t.title}</h3>
                                <div className="mob2-first-plan-tc-desc">{t.description}</div>
                                <ul className="mob2-first-plan-tc-items">
                                    {t.bullets.map((b, idx) => (
                                        <li key={idx}>
                                            <strong>{b.label}</strong> · {b.detail}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mob2-first-plan-tc-lines">
                                    <span>{t.summary}</span>
                                    <span>
                                        <strong>{t.burn}</strong>
                                    </span>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Or divider */}
                <div className="mob2-first-plan-or">or</div>

                {/* Alt options */}
                <div className="mob2-first-plan-alt-grid">
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-first-plan-alt-card"
                    >
                        <div className="mob2-first-plan-alt-ic" aria-hidden="true">⬆</div>
                        <div>
                            <h4>Import from CSV</h4>
                            <p>Migrating from a spreadsheet? Upload and I&apos;ll map columns for you.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-first-plan-alt-card"
                    >
                        <div className="mob2-first-plan-alt-ic" aria-hidden="true">◌</div>
                        <div>
                            <h4>Start blank</h4>
                            <p>No template, no import. You&apos;ll add lines one-by-one in Plan.</p>
                        </div>
                    </button>
                </div>

                {/* Preview band */}
                <div className="mob2-first-plan-preview">
                    <h4>Preview · {selected.title} (selected)</h4>
                    {selected.preview.map((line, idx) => (
                        <div key={idx} className="mob2-first-plan-pb-row">
                            <div className="mob2-first-plan-pb-ic">{line.icon}</div>
                            <div className="mob2-first-plan-pb-name">
                                {line.name}
                                <small>{line.meta}</small>
                            </div>
                            <div className="mob2-first-plan-pb-freq">{line.freq}</div>
                            <div className="mob2-first-plan-pb-amt out">{line.amount}</div>
                        </div>
                    ))}
                    {selected.previewExtra ? (
                        <div className="mob2-first-plan-pb-row">
                            <div className="mob2-first-plan-pb-ic">○</div>
                            <div className="mob2-first-plan-pb-name">{selected.previewExtra}</div>
                            <div className="mob2-first-plan-pb-freq" />
                            <div className="mob2-first-plan-pb-amt" />
                        </div>
                    ) : null}
                    <div className="mob2-first-plan-preview-note">
                        Edit any of these on the Plan grid after setup. Numbers are industry defaults —
                        refine them to match your reality.
                    </div>
                </div>

                {/* Nav row */}
                <div className="mob2-first-plan-nav">
                    <Link href="/onboarding/money/connect" className="mob2-first-plan-back">
                        ← Back
                    </Link>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={isPending}
                        className="mob2-first-plan-cta-primary"
                    >
                        {isPending ? "Saving…" : "Use this template →"}
                    </button>
                </div>
            </div>
        </div>
    )
}
