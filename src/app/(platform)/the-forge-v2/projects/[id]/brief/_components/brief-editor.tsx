"use client"

/**
 * @file brief-editor.tsx — Client authoring surface for the project brief.
 *
 * @description Editable productOverview + lock/unlock lifecycle for a v2 project
 * brief. The narrative (productOverview) is user-editable via a textarea that
 * persists through `saveCadLabProductOverview`. The derived design-brief fields
 * are rendered read-only because they're produced upstream by research +
 * decomposition.
 *
 * Lock state is held in local component state while the `brief_locked_at`
 * column is not yet live in Supabase (see TODO below). Locking switches the
 * editor into read-only mode and surfaces an "Unlock" action for reversal.
 *
 * Mockups: FORGE-MOCKUP-BRIEF.html (locked state), FORGE-MOCKUP-BRIEF-LOCK.html
 * (the lock handoff banner).
 *
 * @related
 * - Action: saveCadLabProductOverview in @/actions/cad-lab-projects
 * - Shell: ../../../../_components/workspace-shell (rendered by parent page)
 *
 * TODO (deferred migration): add a `brief_locked_at timestamptz` column on
 * `cad_lab_projects` (+ btree index on (foundry_id, brief_locked_at)) and a
 * matching `lockCadLabBrief(projectId)` / `unlockCadLabBrief(projectId)`
 * server action that persists the timestamp. Session couldn't push the
 * migration because unrelated pending migrations were also queued locally
 * and applying them was out of scope for this task. Until then, lock state
 * lives in memory on this client — it resets on hard refresh.
 */

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { ArrowRight, FileText, Lock, Sparkles, Unlock } from "lucide-react"
import { toast } from "sonner"

import { saveCadLabProductOverview } from "@/actions/cad-lab-projects"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { CadLabDesignBrief } from "@/lib/cad-lab-types"

/** Maximum length enforced both client-side (for the counter) and server-side. */
const OVERVIEW_MAX = 10_000

interface BriefEditorProps {
    projectId: string
    projectHref: string
    initialOverview: string | null
    designBrief: CadLabDesignBrief | null
    /** Initial brief_locked_at — null until migration lands. */
    initialLockedAt: string | null
}

/** Design-brief labelled-list row. Narrowed to the six string-valued legacy
 *  fields so the inline editor only renders simple text rows. The V2-only
 *  fields (mission/targetCustomers/whyNow/constraints/regulatory) live on
 *  the Brief page itself, not in this legacy editor. */
type LegacyStringKey =
    | "useCase"
    | "targetProcess"
    | "targetMaterial"
    | "toleranceTarget"
    | "quantityTarget"
    | "complianceNotes"

interface DesignBriefRow {
    key: LegacyStringKey
    label: string
    hint: string
}

const DESIGN_BRIEF_ROWS: DesignBriefRow[] = [
    { key: "useCase", label: "Use case", hint: "What this product is built for" },
    { key: "targetProcess", label: "Target process", hint: "Preferred manufacturing process" },
    { key: "targetMaterial", label: "Target material", hint: "Preferred material family" },
    { key: "toleranceTarget", label: "Tolerance target", hint: "Critical tolerance requirement" },
    { key: "quantityTarget", label: "Quantity target", hint: "Expected production scale" },
    { key: "complianceNotes", label: "Compliance notes", hint: "Regulatory envelope + certifications" },
]

function formatLockDate(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    } catch {
        return iso
    }
}

export function BriefEditor({
    projectId,
    projectHref,
    initialOverview,
    designBrief,
    initialLockedAt,
}: BriefEditorProps): React.ReactElement {
    // INTENT: draft is what the user types; savedOverview is what the server last
    // confirmed. "dirty" is the diff between them so the Save button only lights
    // up when there's actually something to send.
    const [savedOverview, setSavedOverview] = useState<string>(initialOverview ?? "")
    const [draft, setDraft] = useState<string>(initialOverview ?? "")
    const [lockedAt, setLockedAt] = useState<string | null>(initialLockedAt)
    const [isSaving, startSave] = useTransition()

    const isLocked = lockedAt !== null
    const isDirty = draft !== savedOverview
    const overLength = draft.length > OVERVIEW_MAX
    const hasBriefData = (initialOverview && initialOverview.trim().length > 0) || designBrief !== null

    const designBriefRows = useMemo(() => {
        if (!designBrief) return []
        return DESIGN_BRIEF_ROWS.map((row) => ({
            ...row,
            value: (designBrief[row.key] ?? "").trim(),
        })).filter((row) => row.value.length > 0)
    }, [designBrief])

    function handleSave(): void {
        if (isLocked) {
            toast.error("Brief is locked — unlock before editing.")
            return
        }
        if (overLength) {
            toast.error(`Brief is ${draft.length - OVERVIEW_MAX} characters over the limit.`)
            return
        }
        if (!isDirty) return

        startSave(async () => {
            const result = await saveCadLabProductOverview(projectId, draft)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            setSavedOverview(draft)
            toast.success("Brief saved.")
        })
    }

    function handleDiscard(): void {
        if (!isDirty) return
        setDraft(savedOverview)
        toast.success("Unsaved changes discarded.")
    }

    // DECISION: lock/unlock is optimistic-only until the migration lands. The
    // server action doesn't exist yet, so there's nothing to await — we simply
    // flip local state and mirror the UX the real action will produce.
    function handleLock(): void {
        if (isDirty) {
            toast.error("Save or discard your changes before locking the brief.")
            return
        }
        setLockedAt(new Date().toISOString())
        toast.success("Brief locked. Downstream artefacts now anchor to this revision.")
    }

    function handleUnlock(): void {
        setLockedAt(null)
        toast.success("Brief unlocked — edits are live again.")
    }

    // ─── Empty state ─────────────────────────────────────────────────────
    if (!hasBriefData) {
        return (
            <Card className="rounded-xl border">
                <CardContent className="py-12 flex flex-col items-center text-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="max-w-sm space-y-2">
                        <p className="text-sm font-semibold text-foreground">No brief captured yet</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            The brief seeds automatically from research and decomposition. Run the pipeline in CAD Lab to populate it, then edit the narrative here.
                        </p>
                    </div>
                    <Link
                        href={`/the-forge/cad-lab?project=${projectId}`}
                        className="text-sm font-semibold text-international-orange hover:underline inline-flex items-center gap-1"
                    >
                        <Sparkles className="h-3.5 w-3.5" /> Open CAD Lab <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </CardContent>
            </Card>
        )
    }

    // ─── Main editor + derived view ──────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Lock banner — visible whenever the brief is locked */}
            {isLocked && (
                <Card className="rounded-xl border bg-status-success/5">
                    <CardContent className="py-4 px-5 flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10">
                            <Lock className="h-4 w-4 text-status-success" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                                Brief locked on {formatLockDate(lockedAt)}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Downstream artefacts (BOM, suppliers, risks, cost) anchor to this revision. Unlocking allows edits again — previous supplier RFQs will reference this lock point.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleUnlock}
                            className="shrink-0"
                        >
                            <Unlock className="h-3.5 w-3.5" />
                            Unlock
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Product overview — editable narrative */}
            <section aria-label="Product overview" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1 h-5 rounded-full bg-international-orange shrink-0" />
                        <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Product overview
                        </h2>
                        {isLocked ? (
                            <Badge variant="success" size="sm" className="ml-1">
                                <Lock className="h-3 w-3" />
                                Locked
                            </Badge>
                        ) : isDirty ? (
                            <Badge variant="warning" size="sm" className="ml-1">
                                Unsaved
                            </Badge>
                        ) : null}
                    </div>
                    <span
                        className={
                            overLength
                                ? "text-[11px] font-mono text-destructive"
                                : "text-[11px] font-mono text-muted-foreground"
                        }
                    >
                        {draft.length.toLocaleString()} / {OVERVIEW_MAX.toLocaleString()}
                    </span>
                </div>

                <Card className="rounded-xl border">
                    <CardContent className="py-4 px-5 space-y-3">
                        {isLocked ? (
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                {draft || (
                                    <span className="text-muted-foreground italic">
                                        No overview written — unlock to add one.
                                    </span>
                                )}
                            </p>
                        ) : (
                            <>
                                <Textarea
                                    aria-label="Product overview"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Describe the product in a few paragraphs — what it is, who it's for, the mission envelope, and the constraints that anchor every downstream decision."
                                    rows={10}
                                    className="min-h-[220px] text-sm leading-relaxed"
                                    aria-invalid={overLength}
                                />
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    This narrative seeds from research + decomposition. Edit freely until you lock the brief — once locked, suppliers and BOM anchor to this revision.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {!isLocked && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDiscard}
                            disabled={!isDirty || isSaving}
                        >
                            Discard changes
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleSave}
                                disabled={!isDirty || isSaving || overLength}
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleLock}
                                disabled={isSaving || isDirty}
                                title={
                                    isDirty
                                        ? "Save or discard changes before locking"
                                        : "Lock this brief as the anchor revision"
                                }
                            >
                                <Lock className="h-3.5 w-3.5" />
                                Lock brief
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            {/* Design brief — derived read-only labelled list */}
            {designBriefRows.length > 0 && (
                <section aria-label="Design brief" className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full bg-electric-blue shrink-0" />
                        <h2 className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground">
                            Design brief
                        </h2>
                        <Badge variant="outline" size="sm" className="ml-1">
                            Derived from research
                        </Badge>
                    </div>
                    <Card className="rounded-xl border">
                        <CardContent className="py-4 px-5">
                            <dl className="divide-y divide-border">
                                {designBriefRows.map((row) => (
                                    <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 py-3 first:pt-0 last:pb-0">
                                        <dt>
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                                {row.label}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                                {row.hint}
                                            </p>
                                        </dt>
                                        <dd className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                            {row.value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </CardContent>
                    </Card>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Read-only — these fields flow from the research pipeline. Re-run decomposition in{" "}
                        <Link href={projectHref} className="text-international-orange hover:underline font-semibold">
                            the project workspace
                        </Link>
                        {" "}to update them.
                    </p>
                </section>
            )}
        </div>
    )
}
