/**
 * @file BrainstormingCouncilView.tsx
 *
 * @description Authenticated brainstorming council UI per BRAINSTORM-COUNCIL-MOCKUP-V1.html.
 *
 * Renders the full Council experience for signed-in founders:
 * - Page header ("Brainstorming Council")
 * - Tier picker: Quick / Full / Deep / Strategy
 * - Question bar with "Convene the council" submit
 * - Section 1: Fiona host card (opening framing — empty state before session)
 * - Section 2: Council parallel-fire grid (4 specialist cards — empty state before session)
 * - Section 3: Fiona closing synthesis (held until council returns)
 *
 * The component is client-side (interactive tier picker + question input).
 * It reads specialist data from SPECIALISTS directly — no prop threading
 * needed beyond what this file already imports.
 *
 * Form submission: routes to the existing `saveMeetingThread` server action
 * from `src/actions/meeting-threads.ts`. Tier maps to councilTier string.
 *
 * @mockup /BRAINSTORM-COUNCIL-MOCKUP-V1.html — approved V1 spec. Port is
 *         top-to-bottom, class names and copy verbatim.
 *
 * @security Client component — no direct data access. Auth context is
 *           inherited from the server wrapper in page.tsx.
 */

"use client"

import { useState, useRef, useTransition, useCallback } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SPECIALISTS } from "@/lib/agents/specialists-config"
import type { Specialist } from "@/lib/agents/specialists-config"
import { conveneCouncil } from "@/actions/brainstorming-council"
import type { CouncilResult, SpecialistResponse } from "@/actions/brainstorming-council-types"
import { createMeetingThread } from "@/actions/meeting-threads"
import { MeetingHistory } from "@/app/(platform)/agents/meeting-history"

// ─── Model tier → human-readable badge label ────────────────────────────────

const MODEL_TIER_LABELS: Record<string, string> = {
    claude:          "Claude Opus 4.7",
    sonnet:          "Claude Sonnet 4.6",
    haiku:           "Claude Haiku 4.5",
    deepseek:        "DeepSeek V4",
    "deepseek-v4-pro": "DeepSeek V4-Pro",
    google:          "Gemini 3.1 Pro",
    openai:          "gpt-5.4",
    "gpt-mini":      "gpt-4.1-mini",
    "qwen-235b":     "Qwen 3 235B",
    qwen:            "Qwen 3.5-Plus",
    "qwen-local":    "Qwen (local)",
    minimax:         "MiniMax M2.7",
}

// ─── Model tier → lineage CSS class (drives swatch colour) ──────────────────

const MODEL_TIER_LINEAGE: Record<string, string> = {
    claude:          "claude",
    sonnet:          "claude",
    haiku:           "claude",
    deepseek:        "deepseek",
    "deepseek-v4-pro": "deepseek",
    google:          "gpt",      // no "google" class in mockup — closest is gpt (green)
    openai:          "gpt",
    "gpt-mini":      "gpt",
    "qwen-235b":     "qwen",
    qwen:            "qwen",
    "qwen-local":    "qwen",
    minimax:         "mistral",  // fallback
}

// ─── Council tier definitions (Quick / Full / Deep / Strategy) ───────────────

type CouncilTier = "quick" | "full" | "deep" | "strategy"

interface TierMeta {
    id: CouncilTier
    label: string
    subtitle: string
    hint: string
    specialists: number
}

const COUNCIL_TIERS: TierMeta[] = [
    {
        id: "quick",
        label: "Quick take",
        subtitle: "2 specialists · ~8s",
        hint: "Fast gut-check from two perspectives — useful when you need a directional read, not a full analysis.",
        specialists: 2,
    },
    {
        id: "full",
        label: "On reflection",
        subtitle: "3 specialists · ~12s",
        hint: "Three voices with different angles. Fiona opens, three specialists respond in parallel, Fiona closes.",
        specialists: 3,
    },
    {
        id: "deep",
        label: "Thinking further",
        subtitle: "4 specialists · ~14s",
        hint: "Four specialists in the 2×2 grid. Fiona synthesises where they agree and disagree, plus a concrete next action.",
        specialists: 4,
    },
    {
        id: "strategy",
        label: "Council split",
        subtitle: "5 specialists · ~18s",
        hint: "The full council — five voices, maximum lineage diversity. Best for high-stakes strategic questions.",
        specialists: 5,
    },
]

// ─── Suggestion prompts — common dilemmas hardware founders bring to the council ──
//
// Each suggestion pre-fills the question and switches to the tier that suits
// its depth. Categories cover fundraising, hiring, product, manufacturing,
// strategy, and operations — the dilemmas Tristan has heard most often from
// founders during Fractional Forge sessions.
//
// Voice rules: specific numbers over adjectives (£50K not "some MRR"),
// British spelling, no acronyms, no failure-mode framing, no "if you've been
// stuck" / "we know it's hard" framing — the prompts speak to what to DO,
// not why the founder has not done it yet.

interface SuggestionPrompt {
    text: string
    tier: CouncilTier
    category: string
}

const SUGGESTION_PROMPTS: SuggestionPrompt[] = [
    {
        text: "Should I lock in the Tier 1 contract manufacturer now or run a second prototype with the design house?",
        tier: "quick",
        category: "Manufacturing",
    },
    {
        text: "Is £50K monthly recurring revenue enough to start a serious Seed raise on a hardware product?",
        tier: "quick",
        category: "Fundraising",
    },
    {
        text: "How do I price a hardware product to leave 35% gross margin after first-year freight and warranty?",
        tier: "full",
        category: "Pricing",
    },
    {
        text: "What design changes can get my Bill of Materials cost down 30% before the second production run?",
        tier: "full",
        category: "Bill of Materials",
    },
    {
        text: "How do we shorten manufacturing lead time from 14 weeks to 6 weeks without a second supplier?",
        tier: "deep",
        category: "Lead time",
    },
    {
        text: "What is our defensible moat once a Shenzhen clone of our product arrives at half our price in 12 months?",
        tier: "deep",
        category: "Defensibility",
    },
    {
        text: "Should we raise £5M now or wait six months until our medical device certification is signed off?",
        tier: "strategy",
        category: "Fundraising",
    },
    {
        text: "Is now the right time to take our hardware product from the United Kingdom into the United States?",
        tier: "strategy",
        category: "Geographic expansion",
    },
]

// ─── Council member subset selection ────────────────────────────────────────
// Fiona always hosts; the council picks from a preferred ordering by role breadth.

const COUNCIL_MEMBER_IDS = [
    "strategist",      // Sage — Strategy (Gemini 3.1 Pro)
    "finance-lead",    // Finn — Finance  (DeepSeek V4-Pro)
    "sales-lead",      // Sal  — Sales    (gpt-4.1-mini)
    "cto",             // Max  — CTO      (DeepSeek V4)
    "chief-of-staff",  // Cal  — Chief of Staff (Opus)
] as const

// Fiona is always host/closer
const FIONA = SPECIALISTS.find(s => s.id === "fundraising-advisor")!

function getCouncilMembers(tier: CouncilTier): Specialist[] {
    const count = COUNCIL_TIERS.find(t => t.id === tier)!.specialists
    return COUNCIL_MEMBER_IDS
        .slice(0, count)
        .map(id => SPECIALISTS.find(s => s.id === id)!)
        .filter(Boolean)
}

// ─── Avatar colour mapping ───────────────────────────────────────────────────

function getAvatarClass(specialistId: string): string {
    const map: Record<string, string> = {
        "strategist":     "bc-av-sage",
        "finance-lead":   "bc-av-finn",
        "sales-lead":     "bc-av-sal",
        "cto":            "bc-av-max",
        "chief-of-staff": "bc-av-cal",
        "fundraising-advisor": "bc-av-fiona",
    }
    return map[specialistId] ?? "bc-av-default"
}

// ─── Specialist sig-close label (verbatim from mockup / personality.ts) ─────

function getSigCloseLabel(specialistId: string): string {
    const map: Record<string, string> = {
        "strategist":     "What to do Monday morning",
        "finance-lead":   "The numbers that matter",
        "sales-lead":     "Send this today",
        "cto":            "Ship this week",
        "chief-of-staff": "Next concrete action",
    }
    return map[specialistId] ?? "Next step"
}

// ─── BrainstormingCouncilView ────────────────────────────────────────────────

interface BrainstormingCouncilViewProps {
    /** Authenticated user id — threaded through for future persistence calls */
    userId: string
}

// ─── Council session state ───────────────────────────────────────────────────

type SessionPhase = "idle" | "pending" | "done" | "error"

interface CouncilSession {
    phase: SessionPhase
    fionaOpening: string
    specialistResponses: SpecialistResponse[]
    fionaClosing: string
    errorMessage: string
    /** The question that was submitted — captured at submit time to prevent
     *  stale-closure context leaks when the user edits the input mid-flight. */
    submittedQuestion: string
    /** The tier that was active when the session was submitted. Stored here
     *  so the council grid renders the correct specialist count even if the
     *  user changes the tier while the session is pending / done. */
    submittedTier: CouncilTier
}

const EMPTY_SESSION: CouncilSession = {
    phase: "idle",
    fionaOpening: "",
    specialistResponses: [],
    fionaClosing: "",
    errorMessage: "",
    submittedQuestion: "",
    submittedTier: "deep",
}

export function BrainstormingCouncilView({ userId }: BrainstormingCouncilViewProps) {
    const [activeTier, setActiveTier] = useState<CouncilTier>("deep")
    const [question, setQuestion] = useState("")
    const [session, setSession] = useState<CouncilSession>(EMPTY_SESSION)
    const [isPending, startTransition] = useTransition()
    const inputRef = useRef<HTMLInputElement>(null)
    // W7: bump this counter after each successful session save to trigger
    // MeetingHistory to re-fetch its list.
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

    const submitted = session.phase !== "idle"
    // W8: always derive council members from activeTier for the pre-session
    // roster view. After submission, the rendered result grid uses
    // session.submittedTier so changing the picker mid-session doesn't
    // swap the specialist cards under live content.
    const councilMembers = getCouncilMembers(activeTier)
    // The members that correspond to the in-flight or completed session.
    const sessionCouncilMembers = getCouncilMembers(session.submittedTier)

    // W10: extracted to a named, stable callback so both the form onSubmit
    // and the button's onClick can reference it. React synthetic events
    // sometimes fail to bubble through deeply-nested form submit on first
    // interaction — dual-wiring is the belt-and-braces fix.
    const handleConvene = useCallback((e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault()
        const trimmedQ = question.trim()
        if (!trimmedQ) {
            inputRef.current?.focus()
            return
        }
        if (isPending) return // already in flight

        // W2: capture the tier and specialists at the exact moment of
        // submission so they are locked for this session's lifecycle.
        // Previously `activeTier` was read inside the async transition
        // which meant a user changing the tier selector while the LLM
        // calls were in flight could silently alter the specialist list
        // mid-call.
        const tierSnapshot: CouncilTier = activeTier
        const specialistsForTier = getCouncilMembers(tierSnapshot).map(s => ({
            id: s.id,
            name: s.name,
            title: s.title,
            tagline: s.tagline,
        }))

        // W2: clear the question input immediately on submit so the user
        // cannot accidentally re-send the previous question by hitting
        // submit a second time without typing new text. This also prevents
        // the stale-question context leak where the input value from
        // question N would silently ride along into question N+1.
        setQuestion("")

        setSession({
            ...EMPTY_SESSION,
            phase: "pending",
            submittedQuestion: trimmedQ,
            submittedTier: tierSnapshot,
        })

        startTransition(async () => {
            const result = await conveneCouncil({
                question: trimmedQ,
                tier: tierSnapshot,
                specialists: specialistsForTier,
            })

            if (!result.ok) {
                setSession({
                    phase: "error",
                    fionaOpening: "",
                    specialistResponses: [],
                    fionaClosing: "",
                    errorMessage: result.error,
                    submittedQuestion: trimmedQ,
                    submittedTier: tierSnapshot,
                })
                return
            }

            setSession({
                phase: "done",
                fionaOpening: result.fionaOpening,
                specialistResponses: result.specialistResponses,
                fionaClosing: result.fionaClosing,
                errorMessage: "",
                submittedQuestion: trimmedQ,
                submittedTier: tierSnapshot,
            })

            // W1 + W6 + W7: persist the completed session so:
            //   - createMeetingThread triggers after() which fires
            //     generateSessionInfographic (cover image) and
            //     generateSessionAudio in the background.
            //   - The saved thread row appears in SavedSessionsPanel.
            // Build entries: Fiona opening, each specialist, Fiona closing.
            const entries = [
                {
                    specialistId: "fundraising-advisor",
                    specialistName: "Fiona",
                    councilPosition: "opener" as const,
                    roundNumber: 1,
                    content: result.fionaOpening,
                    role: "specialist" as const,
                },
                ...result.specialistResponses.map((resp: SpecialistResponse) => ({
                    specialistId: resp.id,
                    specialistName: resp.name,
                    councilPosition: "reactor" as const,
                    roundNumber: 1,
                    content: resp.response,
                    role: "specialist" as const,
                })),
                {
                    specialistId: "fundraising-advisor",
                    specialistName: "Fiona",
                    councilPosition: "host-close" as const,
                    roundNumber: 1,
                    content: result.fionaClosing,
                    role: "specialist" as const,
                },
            ]

            try {
                await createMeetingThread({
                    topic: trimmedQ,
                    councilTier: tierSnapshot,
                    specialistIds: specialistsForTier.map(s => s.id),
                    entries,
                })
                // Bump the refresh key so MeetingHistory re-fetches.
                setHistoryRefreshKey(k => k + 1)
            } catch (saveErr) {
                // Non-fatal — the session content is still displayed,
                // saving is best-effort and must never crash the UI.
                console.error("[BrainstormingCouncilView] Failed to save session:", saveErr)
            }
        })
    }, [question, isPending, activeTier])

    function handleReset() {
        setSession(EMPTY_SESSION)
        // Return focus to the question input so the next question
        // is immediately ready to type without an extra click.
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    return (
        <div className="bc-page">
            {/* ── CSS custom properties scoped to this component ── */}
            <style>{`
                .bc-page {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 28px 32px 80px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
                    --bc-fg: #292524;
                    --bc-fg-muted: #78716c;
                    --bc-fg-subtle: #a8a29e;
                    --bc-surface: #ffffff;
                    --bc-surface-soft: #fafaf9;
                    --bc-surface-muted: #f5f4f2;
                    --bc-border: #e7e5e4;
                    --bc-border-soft: #f0efed;
                    --bc-border-strong: #d6d3d1;
                    --bc-brand: #ff4500;
                    --bc-brand-soft: #fff0ea;
                    --bc-brand-dim: #ffdcc7;
                    --bc-blue: #3b82f6;
                    --bc-blue-soft: #eff6ff;
                    --bc-blue-dim: #bfdbfe;
                    --bc-success: #16a34a;
                    --bc-opus: #ff4500;
                    --bc-opus-soft: #fff4ee;
                    --bc-opus-dim: #fed7aa;
                    --bc-shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
                    --bc-shadow-sm: 0 2px 6px rgba(0,0,0,0.05);
                    --bc-shadow-md: 0 6px 16px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04);
                    --bc-shadow-lg: 0 14px 32px rgba(0,0,0,0.09), 0 3px 8px rgba(0,0,0,0.05);
                }
                /* ─── Page header ─── */
                .bc-page-head { margin-bottom: 22px; }
                .bc-page-head h1 {
                    margin: 0 0 6px;
                    font-size: 28px;
                    font-weight: 800;
                    letter-spacing: -0.025em;
                    color: var(--bc-fg);
                }
                .bc-page-head p {
                    margin: 0;
                    color: var(--bc-fg-muted);
                    font-size: 14px;
                    max-width: 720px;
                    line-height: 1.6;
                }
                /* ─── Tier picker ─── */
                .bc-tier-picker {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 22px;
                }
                .bc-tier-btn {
                    background: var(--bc-surface);
                    border: 1.5px solid var(--bc-border);
                    border-radius: 12px;
                    padding: 12px 14px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
                    box-shadow: var(--bc-shadow-xs);
                }
                .bc-tier-btn:hover {
                    border-color: var(--bc-brand);
                    box-shadow: var(--bc-shadow-sm);
                }
                .bc-tier-btn.active {
                    border-color: var(--bc-brand);
                    background: var(--bc-brand-soft);
                    box-shadow: 0 0 0 2px var(--bc-brand-dim);
                }
                .bc-tier-btn .bc-tier-label {
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--bc-fg);
                    margin-bottom: 3px;
                }
                .bc-tier-btn.active .bc-tier-label { color: var(--bc-brand); }
                .bc-tier-btn .bc-tier-subtitle {
                    font-size: 11.5px;
                    color: var(--bc-fg-muted);
                    font-weight: 500;
                }
                /* ─── Question bar ─── */
                .bc-qbar {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 14px;
                    padding: 14px 16px;
                    box-shadow: var(--bc-shadow-sm);
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    gap: 14px;
                    align-items: center;
                    margin-bottom: 28px;
                }
                .bc-qbar .bc-qlabel {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 12px;
                    font-weight: 700;
                    color: var(--bc-fg-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    padding-left: 4px;
                }
                .bc-qbar .bc-qlabel .bc-icon {
                    width: 28px; height: 28px; border-radius: 100%;
                    background: var(--bc-brand-soft);
                    color: var(--bc-brand);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px;
                    font-weight: 700;
                }
                .bc-qbar input[type="text"] {
                    border: none;
                    font-size: 16px;
                    font-family: inherit;
                    color: var(--bc-fg);
                    background: transparent;
                    width: 100%;
                    padding: 8px 4px;
                    font-weight: 500;
                }
                .bc-qbar input[type="text"]:focus { outline: none; }
                .bc-qbar .bc-convene {
                    background: var(--bc-brand);
                    color: #fff;
                    border: none;
                    padding: 10px 22px;
                    border-radius: 10px;
                    font-size: 13.5px;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-family: inherit;
                    box-shadow: 0 1px 0 rgba(255,69,0,0.5) inset, 0 6px 14px rgba(255,69,0,0.20);
                }
                .bc-qbar .bc-convene:hover { background: #e63e00; }
                /* ─── Section labels ─── */
                .bc-section-label {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin: 36px 0 14px;
                }
                .bc-section-label .bc-step {
                    width: 24px; height: 24px; border-radius: 100%;
                    background: var(--bc-fg);
                    color: #fff;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 12px; font-weight: 700;
                    flex-shrink: 0;
                }
                .bc-section-label h2 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: var(--bc-fg);
                }
                .bc-section-label .bc-hint {
                    margin-left: auto;
                    font-size: 12px;
                    color: var(--bc-fg-muted);
                    white-space: nowrap;
                }
                .bc-section-label .bc-rule {
                    flex: 1;
                    height: 1px;
                    background: var(--bc-border);
                }
                /* Mobile: drop the rule line + hint so the heading gets the
                   full row instead of being squeezed into a 4-word column. */
                @media (max-width: 640px) {
                    .bc-section-label .bc-rule { display: none; }
                    .bc-section-label .bc-hint { display: none; }
                    .bc-section-label h2 { flex: 1; min-width: 0; }
                }
                /* ─── Fiona host card ─── */
                .bc-fiona-card {
                    background: linear-gradient(180deg, #fff4ee 0%, #ffffff 70%);
                    border: 1px solid var(--bc-opus-dim);
                    border-radius: 16px;
                    padding: 22px 26px;
                    box-shadow: var(--bc-shadow-md);
                    position: relative;
                    overflow: hidden;
                }
                .bc-fiona-card::before {
                    content: "";
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, var(--bc-opus), var(--bc-brand));
                }
                .bc-fiona-head {
                    display: flex; align-items: center; gap: 14px;
                    margin-bottom: 14px;
                }
                .bc-fiona-head .bc-avatar {
                    width: 56px; height: 56px; border-radius: 100%;
                    background: linear-gradient(135deg, #fff4ee 0%, #fed7aa 100%);
                    color: var(--bc-opus);
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 18px;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 2px var(--bc-opus-dim);
                    flex-shrink: 0;
                }
                .bc-fiona-head .bc-who { flex: 1; }
                .bc-fiona-head .bc-who .bc-name {
                    font-size: 17px; font-weight: 800; letter-spacing: -0.01em;
                    display: flex; align-items: center; gap: 10px;
                    color: var(--bc-fg);
                }
                .bc-fiona-head .bc-who .bc-name .bc-role-chip {
                    font-size: 10.5px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    background: var(--bc-opus-soft);
                    color: var(--bc-opus);
                    padding: 3px 8px;
                    border-radius: 4px;
                    border: 1px solid var(--bc-opus-dim);
                }
                .bc-fiona-head .bc-who .bc-role {
                    font-size: 12.5px;
                    color: var(--bc-fg-muted);
                    margin-top: 2px;
                }
                .bc-model-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #fff;
                    border: 1px solid var(--bc-opus-dim);
                    color: var(--bc-opus);
                    font-size: 11.5px;
                    font-weight: 600;
                    padding: 6px 12px;
                    border-radius: 100px;
                    white-space: nowrap;
                }
                .bc-model-badge .bc-dot {
                    width: 7px; height: 7px; border-radius: 100%;
                    background: var(--bc-opus);
                }
                /* ─── Fiona empty state ─── */
                .bc-fiona-empty {
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-opus-dim);
                    border-radius: 14px;
                    padding: 28px 26px;
                    text-align: center;
                }
                .bc-fiona-empty .bc-stub-avatar {
                    width: 48px; height: 48px;
                    border-radius: 100%;
                    background: var(--bc-opus-soft);
                    color: var(--bc-opus);
                    display: inline-flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 16px;
                    margin-bottom: 12px;
                    border: 2px solid #fff;
                    box-shadow: 0 0 0 2px var(--bc-opus-dim);
                }
                .bc-fiona-empty p {
                    margin: 0; font-size: 13.5px; color: var(--bc-fg-muted); line-height: 1.6;
                }
                .bc-fiona-empty p strong { color: var(--bc-fg); }
                /* ─── Council grid ─── */
                .bc-council-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                }
                .bc-council-grid.specialists-3 {
                    grid-template-columns: repeat(3, 1fr);
                }
                /* ─── Specialist card ─── */
                .bc-specialist-card {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 14px;
                    padding: 18px 20px;
                    box-shadow: var(--bc-shadow-xs);
                    display: flex;
                    flex-direction: column;
                    transition: box-shadow 0.15s, transform 0.15s;
                }
                .bc-specialist-card:hover {
                    box-shadow: var(--bc-shadow-md);
                    transform: translateY(-1px);
                }
                .bc-specialist-head {
                    display: flex; align-items: flex-start; gap: 12px;
                    margin-bottom: 12px;
                }
                .bc-specialist-head .bc-sp-avatar {
                    width: 44px; height: 44px;
                    border-radius: 100%;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 800; font-size: 14px;
                    flex-shrink: 0;
                    border: 2px solid #fff;
                }
                .bc-av-sage  { background: #e0f2fe; color: #0c4a6e; box-shadow: 0 0 0 2px #bae6fd; }
                .bc-av-finn  { background: #ecfccb; color: #365314; box-shadow: 0 0 0 2px #d9f99d; }
                .bc-av-sal   { background: #fee2e2; color: #7f1d1d; box-shadow: 0 0 0 2px #fecaca; }
                .bc-av-max   { background: #f5f4f2; color: #44403c; box-shadow: 0 0 0 2px #d6d3d1; }
                .bc-av-cal   { background: #f0fdf4; color: #14532d; box-shadow: 0 0 0 2px #bbf7d0; }
                .bc-av-fiona { background: linear-gradient(135deg, #fff4ee 0%, #fed7aa 100%); color: #ff4500; box-shadow: 0 0 0 2px #fed7aa; }
                .bc-av-default { background: #f5f4f2; color: #44403c; box-shadow: 0 0 0 2px #d6d3d1; }
                .bc-specialist-head .bc-sp-meta { flex: 1; min-width: 0; }
                .bc-specialist-head .bc-name-row {
                    display: flex; align-items: center; gap: 8px;
                    margin-bottom: 2px;
                }
                .bc-specialist-head .bc-sp-name {
                    font-size: 15.5px;
                    font-weight: 800;
                    letter-spacing: -0.01em;
                    color: var(--bc-fg);
                }
                .bc-specialist-head .bc-sp-role {
                    font-size: 12px;
                    color: var(--bc-fg-muted);
                    margin-bottom: 6px;
                }
                .bc-specialist-head .bc-lineage {
                    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                }
                .bc-lineage-chip {
                    display: inline-flex; align-items: center; gap: 5px;
                    font-size: 10.5px;
                    font-weight: 600;
                    padding: 3px 8px;
                    border-radius: 100px;
                    background: var(--bc-surface-muted);
                    color: var(--bc-fg-muted);
                    border: 1px solid var(--bc-border);
                }
                .bc-lineage-chip .bc-swatch {
                    width: 6px; height: 6px; border-radius: 100%;
                }
                .bc-lineage-chip.bc-mistral .bc-swatch  { background: #ff7000; }
                .bc-lineage-chip.bc-deepseek .bc-swatch { background: #4d6bfe; }
                .bc-lineage-chip.bc-qwen .bc-swatch     { background: #615ced; }
                .bc-lineage-chip.bc-gpt .bc-swatch      { background: #10a37f; }
                .bc-lineage-chip.bc-claude .bc-swatch   { background: #d97706; }
                .bc-lineage-chip.bc-opus .bc-swatch     { background: var(--bc-opus); }
                .bc-lineage-chip.bc-mistral  { color: #c2410c; background: #fff7ed; border-color: #fed7aa; }
                .bc-lineage-chip.bc-deepseek { color: #1e3a8a; background: #eff6ff; border-color: #bfdbfe; }
                .bc-lineage-chip.bc-gpt      { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
                .bc-lineage-chip.bc-qwen     { color: #4c1d95; background: #f5f3ff; border-color: #ddd6fe; }
                .bc-lineage-chip.bc-claude   { color: #92400e; background: #fffbeb; border-color: #fde68a; }
                .bc-lineage-chip.bc-opus     { color: var(--bc-opus); background: var(--bc-opus-soft); border-color: var(--bc-opus-dim); }
                /* ─── Specialist card body ─── */
                .bc-sp-body {
                    font-size: 13.5px;
                    line-height: 1.65;
                    color: var(--bc-fg);
                    flex: 1;
                }
                /* ─── Sig close ─── */
                .bc-sig-close {
                    margin-top: 14px;
                    padding-top: 12px;
                    border-top: 1px solid var(--bc-border-soft);
                    font-size: 12.5px;
                }
                .bc-sig-close .bc-sig-label {
                    font-weight: 700;
                    color: var(--bc-fg);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 6px;
                }
                .bc-sig-close.bc-sig-sage .bc-sig-label { color: #075985; }
                .bc-sig-close.bc-sig-finn .bc-sig-label { color: #4d7c0f; }
                .bc-sig-close.bc-sig-sal  .bc-sig-label { color: #b91c1c; }
                .bc-sig-close.bc-sig-max  .bc-sig-label { color: #44403c; }
                .bc-sig-close.bc-sig-cal  .bc-sig-label { color: #14532d; }
                .bc-sig-close .bc-sig-body { color: var(--bc-fg-muted); line-height: 1.6; }
                /* ─── Empty card (slot) ─── */
                .bc-empty-card {
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-border-strong);
                    border-radius: 14px;
                    padding: 40px 28px;
                    text-align: center;
                    color: var(--bc-fg-muted);
                }
                .bc-empty-card .bc-empty-icon {
                    width: 56px; height: 56px;
                    background: var(--bc-surface-muted);
                    border-radius: 100%;
                    display: inline-flex; align-items: center; justify-content: center;
                    margin-bottom: 14px;
                    font-size: 22px;
                    color: var(--bc-fg-subtle);
                }
                .bc-empty-card h3 {
                    margin: 0 0 6px;
                    color: var(--bc-fg);
                    font-size: 16px;
                    font-weight: 700;
                }
                .bc-empty-card p {
                    margin: 0 auto;
                    max-width: 240px;
                    font-size: 13px;
                    line-height: 1.6;
                }
                /* ─── Closing held state ─── */
                .bc-closing-held {
                    margin-top: 28px;
                    text-align: center;
                    padding: 30px 20px;
                    background: var(--bc-surface);
                    border: 1.5px dashed var(--bc-opus-dim);
                    border-radius: 14px;
                }
                .bc-closing-held .bc-label {
                    font-size: 11.5px;
                    font-weight: 700;
                    color: var(--bc-opus);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 8px;
                }
                .bc-closing-held p {
                    color: var(--bc-fg-muted);
                    font-size: 13px;
                    margin: 0;
                }
                /* ─── Fiona closing card ─── */
                .bc-fiona-card.bc-closing {
                    background: linear-gradient(180deg, #fff7ed 0%, #ffffff 60%);
                    border-color: var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing::before {
                    background: linear-gradient(90deg, var(--bc-brand), var(--bc-opus));
                }
                .bc-fiona-card.bc-closing .bc-avatar {
                    background: linear-gradient(135deg, var(--bc-brand-soft) 0%, var(--bc-brand-dim) 100%);
                    color: var(--bc-brand);
                    box-shadow: 0 0 0 2px var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing .bc-role-chip {
                    background: var(--bc-brand-soft);
                    color: var(--bc-brand);
                    border-color: var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing .bc-model-badge {
                    color: var(--bc-brand);
                    border-color: var(--bc-brand-dim);
                }
                .bc-fiona-card.bc-closing .bc-model-badge .bc-dot { background: var(--bc-brand); }
                /* ─── Tier hint tooltip ─── */
                .bc-tier-hint {
                    font-size: 11.5px;
                    color: var(--bc-fg-muted);
                    margin-top: 6px;
                    line-height: 1.5;
                }
                /* ─── Suggestion chips (pre-fill the question) ─── */
                .bc-suggestions {
                    margin: 18px 0 22px;
                }
                .bc-suggestions-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--bc-fg-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 10px;
                }
                .bc-suggestions-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .bc-suggestion-chip {
                    background: var(--bc-surface);
                    border: 1px solid var(--bc-border);
                    border-radius: 10px;
                    padding: 10px 14px;
                    cursor: pointer;
                    text-align: left;
                    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    font-family: inherit;
                }
                .bc-suggestion-chip:hover {
                    border-color: var(--bc-brand);
                    box-shadow: var(--bc-shadow-sm);
                    transform: translateY(-1px);
                }
                .bc-suggestion-chip:active {
                    transform: translateY(0);
                }
                .bc-suggestion-cat {
                    font-size: 9.5px;
                    font-weight: 700;
                    color: var(--bc-brand);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    flex-shrink: 0;
                    padding: 2px 7px;
                    border-radius: 100px;
                    background: var(--bc-brand-soft);
                }
                .bc-suggestion-text {
                    font-size: 13px;
                    color: var(--bc-fg);
                    line-height: 1.4;
                    font-weight: 500;
                }
                /* ─── Responsive ─── */
                @media (max-width: 780px) {
                    .bc-page { padding: 18px 16px 60px; }
                    .bc-tier-picker { grid-template-columns: repeat(2, 1fr); }
                    .bc-qbar { grid-template-columns: 1fr; gap: 10px; }
                    .bc-council-grid { grid-template-columns: 1fr; }
                    .bc-council-grid.specialists-3 { grid-template-columns: 1fr; }
                    .bc-suggestions-grid { grid-template-columns: 1fr; }
                }
            `}</style>

            {/* Tristan 2026-04-27: removed Home › Brainstorming breadcrumb +
                added the red-bar accent to the title so this page matches the
                canonical My Profile page-header pattern. */}
            <div className="bc-page-head" style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                    <div style={{ height: "32px", width: "6px", background: "#ff4500", borderRadius: "9999px", boxShadow: "0 0 10px rgba(255,69,0,0.5)" }} />
                    <h1 style={{ margin: 0 }}>Brainstorming Council</h1>
                </div>
                <p style={{ paddingLeft: "18px" }}>You ask one question. Fiona frames it, {activeTier === "quick" ? "two specialists chime in" : activeTier === "full" ? "three specialists chime in" : activeTier === "deep" ? "four specialists chime in from different perspectives" : "five specialists chime in from different perspectives"} in parallel, and Fiona closes with what they agreed on, where they disagreed, and the one thing to do this week.</p>
            </div>

            {/* ── Tier picker ── */}
            <div className="bc-tier-picker" role="radiogroup" aria-label="Council depth">
                {COUNCIL_TIERS.map((tier) => (
                    <button
                        key={tier.id}
                        role="radio"
                        aria-checked={activeTier === tier.id}
                        className={`bc-tier-btn${activeTier === tier.id ? " active" : ""}`}
                        onClick={() => setActiveTier(tier.id)}
                        type="button"
                    >
                        <div className="bc-tier-label">{tier.label}</div>
                        <div className="bc-tier-subtitle">{tier.subtitle}</div>
                    </button>
                ))}
            </div>
            {/* Active tier hint */}
            <p className="bc-tier-hint">{COUNCIL_TIERS.find(t => t.id === activeTier)?.hint}</p>

            {/* ── Suggestion chips — pre-fill the question + match the tier to the question depth */}
            <div className="bc-suggestions" aria-label="Suggested questions">
                <div className="bc-suggestions-label">Try one of these to start</div>
                <div className="bc-suggestions-grid">
                    {SUGGESTION_PROMPTS.map((s) => (
                        <button
                            key={s.text}
                            type="button"
                            className="bc-suggestion-chip"
                            onClick={() => {
                                setQuestion(s.text)
                                setActiveTier(s.tier)
                                inputRef.current?.focus()
                            }}
                        >
                            <span className="bc-suggestion-cat">{s.category}</span>
                            <span className="bc-suggestion-text">{s.text}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Question bar ── */}
            <form className="bc-qbar" onSubmit={handleConvene} aria-label="Council question">
                <div className="bc-qlabel">
                    <span className="bc-icon">?</span>
                    What&apos;s the question
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Should I raise £2M now or hit 100 paying users first?"
                    aria-label="Your question for the council"
                    autoComplete="off"
                />
                {/* W10: dual-wire onClick + form onSubmit so the button fires
                    even when React's synthetic event bubbling stalls on first
                    interaction (observed in agent-browser walkthrough). */}
                <button
                    className="bc-convene"
                    type="submit"
                    onClick={handleConvene}
                    disabled={isPending}
                    style={isPending ? { opacity: 0.6, cursor: "wait" } : undefined}
                >
                    {isPending ? "Convening…" : "Convene the council  →"}
                </button>
            </form>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 1 — Fiona frames the question
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label">
                <span className="bc-step">1</span>
                <h2>
                    {session.phase === "idle"
                        ? "Fiona frames the question"
                        : session.phase === "pending"
                        ? "Fiona is framing the question…"
                        : "Fiona’s framing"}
                </h2>
                <span className="bc-rule" />
                <span className="bc-hint">Host &middot; runs every brainstorm</span>
            </div>

            {session.phase === "idle" ? (
                /* Pre-submission: show Fiona's role / what she does */
                <div className="bc-fiona-card">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-fiona`}>FI</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                {FIONA?.name ?? "Fiona"}
                                <span className="bc-role-chip">Host &middot; Fundraising lead</span>
                            </div>
                            <div className="bc-role">Fractional Forge &mdash; investor narrative + diligence prep</div>
                        </div>
                        <div className="bc-model-badge">
                            <span className="bc-dot" />
                            DeepSeek V4-Pro
                        </div>
                    </div>
                    <p style={{ fontSize: "14px", lineHeight: "1.7", margin: "0 0 14px", color: "var(--bc-fg)" }}>
                        Fiona opens every brainstorm. She reads your question, names what is actually worth
                        disagreeing about, and calls in the specialists best suited to answer it. She
                        comes back at the end with where they agreed, where they split, and the one concrete
                        thing to do this week.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: "10px" }}>
                        {[
                            "She frames the question before anyone gives you an answer — so you are not handed five answers to a question that was never quite right.",
                            "She calls in three to five specialists from different model lineages, in parallel — no single perspective dominates.",
                            "She closes with a synthesis that names the sharpest disagreement and lands a single next action.",
                        ].map((item, i) => (
                            <li
                                key={i}
                                style={{
                                    background: "rgba(255,255,255,0.7)",
                                    border: "1px solid var(--bc-opus-dim)",
                                    borderLeft: "3px solid var(--bc-opus)",
                                    borderRadius: "8px",
                                    padding: "10px 14px",
                                    fontSize: "13.5px",
                                    lineHeight: "1.55",
                                    display: "grid",
                                    gridTemplateColumns: "auto 1fr",
                                    gap: "10px",
                                    alignItems: "baseline",
                                }}
                            >
                                <span style={{ fontWeight: 800, color: "var(--bc-opus)", fontSize: "12px" }}>
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                    <p style={{ fontStyle: "italic", color: "var(--bc-fg-muted)", fontSize: "13.5px", margin: "14px 0 0", paddingTop: "14px", borderTop: "1px dashed var(--bc-opus-dim)" }}>
                        Type your question above and click &ldquo;Convene the council&rdquo; to start.
                    </p>
                </div>
            ) : session.phase === "pending" ? (
                /* Loading: calls in flight */
                <div className="bc-fiona-empty">
                    <div className="bc-stub-avatar">FI</div>
                    <p>
                        <strong>Fiona is reading your question and framing what is worth disagreeing about.</strong><br />
                        Specialist calls are firing in parallel — this takes 10–20 seconds.
                    </p>
                </div>
            ) : session.phase === "error" ? (
                /* Error state */
                <div className="bc-fiona-empty">
                    <div className="bc-stub-avatar" style={{ background: "#fee2e2", color: "#b91c1c" }}>!</div>
                    <p>
                        <strong>The council could not be convened.</strong><br />
                        {session.errorMessage || "Something went wrong — please try again."}{" "}
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Try again
                        </button>
                    </p>
                </div>
            ) : (
                /* Done: show Fiona's real opening */
                <div className="bc-fiona-card">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-fiona`}>FI</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                {FIONA?.name ?? "Fiona"}
                                <span className="bc-role-chip">Host &middot; Fundraising lead</span>
                            </div>
                            <div className="bc-role">Fractional Forge &mdash; investor narrative + diligence prep</div>
                        </div>
                        <div className="bc-model-badge">
                            <span className="bc-dot" />
                            DeepSeek V4-Pro
                        </div>
                    </div>
                    <p style={{ fontSize: "14.5px", lineHeight: "1.75", margin: 0, color: "var(--bc-fg)", whiteSpace: "pre-wrap" }}>
                        {session.fionaOpening}
                    </p>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 2 — The council chimes in
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label">
                <span className="bc-step">2</span>
                <h2>The council chimes in &mdash; in parallel</h2>
                <span className="bc-rule" />
                <span className="bc-hint">
                    {councilMembers.length} specialist{councilMembers.length !== 1 ? "s" : ""} &middot; ~{COUNCIL_TIERS.find(t => t.id === activeTier)?.subtitle.match(/~\d+s/)?.[0] ?? "12s"} end-to-end
                </span>
            </div>

            {session.phase === "idle" ? (
                /* Pre-submission: show the specialist roster with their personas */
                <div className={`bc-council-grid${councilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {councilMembers.map((specialist) => {
                        const lineage = MODEL_TIER_LINEAGE[specialist.modelTier] ?? "deepseek"
                        const modelLabel = MODEL_TIER_LABELS[specialist.modelTier] ?? "model TBD"
                        const avatarClass = getAvatarClass(specialist.id)
                        const sigLabel = getSigCloseLabel(specialist.id)
                        const initials = specialist.name.slice(0, 2).toUpperCase()
                        const sigColorMap: Record<string, string> = {
                            "strategist":     "bc-sig-sage",
                            "finance-lead":   "bc-sig-finn",
                            "sales-lead":     "bc-sig-sal",
                            "cto":            "bc-sig-max",
                            "chief-of-staff": "bc-sig-cal",
                        }
                        const sigColorClass = sigColorMap[specialist.id] ?? ""

                        return (
                            <div key={specialist.id} className="bc-specialist-card">
                                <div className="bc-specialist-head">
                                    <div className={`bc-sp-avatar ${avatarClass}`}>{initials}</div>
                                    <div className="bc-sp-meta">
                                        <div className="bc-name-row">
                                            <span className="bc-sp-name">{specialist.name}</span>
                                        </div>
                                        <div className="bc-sp-role">{specialist.title}</div>
                                        <div className="bc-lineage">
                                            <span className={`bc-lineage-chip bc-${lineage}`}>
                                                <span className="bc-swatch" />
                                                {modelLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bc-sp-body">
                                    <p style={{ margin: "0 0 10px", color: "var(--bc-fg-muted)", fontStyle: "italic" }}>
                                        {specialist.thinkingIndicator}
                                    </p>
                                    <p style={{ margin: 0, fontSize: "13px", color: "var(--bc-fg-muted)" }}>
                                        {specialist.tagline}
                                    </p>
                                </div>
                                <div className={`bc-sig-close ${sigColorClass}`} style={{ marginTop: "auto" }}>
                                    <div className="bc-sig-label">{sigLabel}</div>
                                    <div className="bc-sig-body">{specialist.workingStyle.slice(0, 120)}&hellip;</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : session.phase === "pending" ? (
                /* Loading: show shimmer placeholders while calls are in flight */
                <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {sessionCouncilMembers.map((specialist, idx) => (
                        <div key={idx} className="bc-empty-card" style={{ borderStyle: "solid", borderColor: "var(--bc-border)" }}>
                            <div className={`bc-sp-avatar ${getAvatarClass(specialist.id)}`} style={{ margin: "0 auto 12px" }}>
                                {specialist.name.slice(0, 2).toUpperCase()}
                            </div>
                            <h3>{specialist.name}</h3>
                            <p style={{ fontStyle: "italic" }}>{specialist.thinkingIndicator}</p>
                        </div>
                    ))}
                </div>
            ) : session.phase === "done" && session.specialistResponses.length > 0 ? (
                /* Done: real responses rendered */
                <div className={`bc-council-grid${session.specialistResponses.length === 3 ? " specialists-3" : ""}`}>
                    {session.specialistResponses.map((resp) => {
                        const specialist = sessionCouncilMembers.find(s => s.id === resp.id)
                        const avatarClass = getAvatarClass(resp.id)
                        const initials = resp.name.slice(0, 2).toUpperCase()
                        const sigLabel = getSigCloseLabel(resp.id)
                        const sigColorMap: Record<string, string> = {
                            "strategist":     "bc-sig-sage",
                            "finance-lead":   "bc-sig-finn",
                            "sales-lead":     "bc-sig-sal",
                            "cto":            "bc-sig-max",
                            "chief-of-staff": "bc-sig-cal",
                        }
                        const sigColorClass = sigColorMap[resp.id] ?? ""
                        // Determine lineage from modelLabel
                        const lineageFromLabel = resp.modelLabel.toLowerCase().includes("gemini") ? "gpt"
                            : resp.modelLabel.toLowerCase().includes("mistral") ? "mistral"
                            : resp.modelLabel.toLowerCase().includes("deepseek") ? "deepseek"
                            : resp.modelLabel.toLowerCase().includes("qwen") ? "qwen"
                            : "deepseek"

                        return (
                            <div key={resp.id} className="bc-specialist-card">
                                <div className="bc-specialist-head">
                                    <div className={`bc-sp-avatar ${avatarClass}`}>{initials}</div>
                                    <div className="bc-sp-meta">
                                        <div className="bc-name-row">
                                            <span className="bc-sp-name">{resp.name}</span>
                                        </div>
                                        <div className="bc-sp-role">{resp.title}</div>
                                        <div className="bc-lineage">
                                            <span className={`bc-lineage-chip bc-${lineageFromLabel}`}>
                                                <span className="bc-swatch" />
                                                {resp.modelLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bc-sp-body" style={{ whiteSpace: "pre-wrap" }}>
                                    {resp.response}
                                </div>
                                {specialist && (
                                    <div className={`bc-sig-close ${sigColorClass}`} style={{ marginTop: "auto" }}>
                                        <div className="bc-sig-label">{sigLabel}</div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                /* Error or empty — show placeholder grid */
                <div className={`bc-council-grid${sessionCouncilMembers.length === 3 ? " specialists-3" : ""}`}>
                    {sessionCouncilMembers.map((_, idx) => (
                        <div key={idx} className="bc-empty-card">
                            <div className="bc-empty-icon">&middot;</div>
                            <h3>No response</h3>
                            <p>The council did not return responses. Please try again.</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                SECTION 3 — Fiona closes
            ══════════════════════════════════════════════════════════════ */}
            <div className="bc-section-label" style={{ marginTop: "36px" }}>
                <span className="bc-step">3</span>
                <h2>Fiona closes &mdash; synthesis + next action</h2>
                <span className="bc-rule" />
                <span className="bc-hint">Host &middot; seals every brainstorm</span>
            </div>

            {session.phase === "idle" ? (
                /* Pre-submission: preview the closing card structure */
                <div className="bc-fiona-card bc-closing">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-fiona`}>FI</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                Fiona
                                <span className="bc-role-chip">Synthesis</span>
                            </div>
                            <div className="bc-role">Closing the loop &middot; Fractional Forge fundraising lead</div>
                        </div>
                        <div className="bc-model-badge">
                            <span className="bc-dot" />
                            DeepSeek V4-Pro
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--bc-brand-dim)", borderRadius: "10px", padding: "14px 16px" }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                                Where they agreed
                            </div>
                            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.55", color: "var(--bc-fg-muted)" }}>
                                Fiona will name what all {councilMembers.length} specialist{councilMembers.length !== 1 ? "s" : ""} agreed on &mdash; the common ground that tells you which assumptions the whole council shares.
                            </p>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--bc-brand-dim)", borderRadius: "10px", padding: "14px 16px" }}>
                            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                                Where they disagreed
                            </div>
                            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.55", color: "var(--bc-fg-muted)" }}>
                                The sharpest split &mdash; the one disagreement that matters most for your decision, named plainly.
                            </p>
                        </div>
                    </div>
                    <div style={{
                        background: "var(--bc-brand-soft)",
                        color: "var(--bc-fg)",
                        borderRadius: "12px",
                        padding: "18px 22px",
                        marginTop: "4px",
                        position: "relative",
                        overflow: "hidden",
                        border: "1px solid var(--bc-brand-dim)",
                    }}>
                        <div style={{
                            position: "absolute", top: 0, right: 0,
                            width: "200px", height: "200px",
                            background: "radial-gradient(circle, rgba(255,69,0,0.08) 0%, transparent 70%)",
                            pointerEvents: "none",
                        }} />
                        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--bc-brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px", position: "relative" }}>
                            &rarr; Next concrete action this week
                        </div>
                        <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--bc-fg)", position: "relative" }}>
                            One action. One deadline. No ambiguity.
                        </h3>
                        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.6", color: "var(--bc-fg)", position: "relative" }}>
                            Fiona closes with the single most important thing to do this week &mdash; not a list, not options. One action with a deadline.
                        </p>
                    </div>
                    <p style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed var(--bc-brand-dim)", fontSize: "12.5px", color: "var(--bc-fg-muted)", fontStyle: "italic" }}>
                        &mdash; Fiona, Fractional Forge fundraising lead. The closing synthesis appears once the council has returned.
                    </p>
                </div>
            ) : session.phase === "pending" ? (
                /* Loading: closing held */
                <div className="bc-closing-held">
                    <div className="bc-label">Closing synthesis &mdash; held</div>
                    <p>Fiona will close once all specialists have returned.</p>
                </div>
            ) : session.phase === "done" && session.fionaClosing ? (
                /* Done: real Fiona closing */
                <div className="bc-fiona-card bc-closing">
                    <div className="bc-fiona-head">
                        <div className={`bc-sp-avatar bc-av-fiona`}>FI</div>
                        <div className="bc-who">
                            <div className="bc-name">
                                Fiona
                                <span className="bc-role-chip">Synthesis</span>
                            </div>
                            <div className="bc-role">Closing the loop &middot; Fractional Forge fundraising lead</div>
                        </div>
                        <div className="bc-model-badge">
                            <span className="bc-dot" />
                            DeepSeek V4-Pro
                        </div>
                    </div>
                    <p style={{ fontSize: "14.5px", lineHeight: "1.75", margin: "0 0 18px", color: "var(--bc-fg)", whiteSpace: "pre-wrap" }}>
                        {session.fionaClosing}
                    </p>
                    <p style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed var(--bc-brand-dim)", fontSize: "12.5px", color: "var(--bc-fg-muted)", fontStyle: "italic", margin: 0 }}>
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Ask a new question
                        </button>
                        {" "}to start another brainstorm.
                    </p>
                </div>
            ) : (
                /* Error or no closing — fallback */
                <div className="bc-closing-held">
                    <div className="bc-label">Synthesis unavailable</div>
                    <p>Fiona&apos;s closing could not be generated.{" "}
                        <button
                            type="button"
                            onClick={handleReset}
                            style={{ color: "var(--bc-brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                        >
                            Try again
                        </button>
                    </p>
                </div>
            )}

            {/* F1 — Saved sessions panel. Lives inline on /agents per
                Tristan's requirement ("see those saves on the same page"). */}
            <div style={{ marginTop: "48px", paddingTop: "32px", borderTop: "1px solid var(--bc-border-soft)" }}>
                {/* W7: historyRefreshKey increments after each successful session
                    save so MeetingHistory re-fetches and shows the new entry. */}
                <MeetingHistory initialLimit={6} refreshKey={historyRefreshKey} />
            </div>
        </div>
    )
}
