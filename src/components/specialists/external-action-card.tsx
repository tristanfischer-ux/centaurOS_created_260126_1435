"use client"

/**
 * @file external-action-card.tsx -- Approval card for specialist-proposed external actions.
 *
 * @description Renders a compact approval card when a specialist proposes an external
 * service action (Google Sheet, Calendar Event, or Email). The user can review the
 * proposed action details and either approve (execute) or dismiss it.
 *
 * @security Actions are NEVER auto-executed. This card is the approval gate between
 * the specialist's proposal and the actual external service call.
 *
 * @related
 * - src/lib/agents/tools/permission-guard.ts - Types and validation
 * - src/actions/external-integrations.ts - Server actions called on approval
 * - src/app/(platform)/agents/brief-specialist-dialog.tsx - Parent that renders this
 */

import { useState, useCallback } from "react"
import { Table2, Calendar, Mail, Loader2, Check, X, ExternalLink, Bug, MessageSquare, Receipt, Presentation } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type {
    ProposedExternalAction,
    SheetPayload,
    CalendarPayload,
    EmailPayload,
    LinearIssuePayload,
    SlackMessagePayload,
    InvoiceDraftPayload,
    PitchDeckPayload,
} from "@/lib/agents/tools/permission-guard"
import {
    createGoogleSheet,
    createCalendarEventFromProposal,
    sendDraftEmail,
    createLinearIssueFromProposal,
    sendSlackMessageFromProposal,
    createInvoiceDraftFromProposal,
    generatePitchDeckFromProposal,
} from "@/actions/external-integrations"

interface ExternalActionCardProps {
    action: ProposedExternalAction
    onDismiss: () => void
}

/** Maps action types to their icon and color scheme. */
const ACTION_CONFIG = {
    create_google_sheet: {
        icon: Table2,
        label: "Google Sheet",
        approveLabel: "Create Sheet",
        colorClass: "text-status-success",
        bgClass: "bg-status-success/10",
        borderClass: "border-status-success/20",
    },
    create_calendar_event: {
        icon: Calendar,
        label: "Calendar Event",
        approveLabel: "Create Event",
        colorClass: "text-info",
        bgClass: "bg-info/10",
        borderClass: "border-info/20",
    },
    draft_email: {
        icon: Mail,
        label: "Email",
        approveLabel: "Send Email",
        colorClass: "text-international-orange",
        bgClass: "bg-international-orange/10",
        borderClass: "border-international-orange/20",
    },
    create_linear_issue: {
        icon: Bug,
        label: "Linear Issue",
        approveLabel: "Create Issue",
        colorClass: "text-violet-600",
        bgClass: "bg-violet-50",
        borderClass: "border-violet-200",
    },
    send_slack_message: {
        icon: MessageSquare,
        label: "Slack Message",
        approveLabel: "Send Message",
        colorClass: "text-info",
        bgClass: "bg-info/10",
        borderClass: "border-info/20",
    },
    draft_invoice: {
        icon: Receipt,
        label: "Invoice Draft",
        approveLabel: "Create Invoice",
        colorClass: "text-amber-600",
        bgClass: "bg-amber-50",
        borderClass: "border-amber-200",
    },
    generate_pitch_deck: {
        icon: Presentation,
        label: "Pitch Deck",
        approveLabel: "Generate Deck",
        colorClass: "text-fuchsia-600",
        bgClass: "bg-fuchsia-50",
        borderClass: "border-fuchsia-200",
    },
} as const

/**
 * ExternalActionCard -- Renders an approval card for a proposed external action.
 *
 * @description Shows the action type, title, description, and a preview of the payload.
 * On approval, calls the appropriate server action and shows success/error feedback.
 */
export function ExternalActionCard({ action, onDismiss }: ExternalActionCardProps) {
    const [isExecuting, setIsExecuting] = useState(false)
    const [result, setResult] = useState<{ success: boolean; url?: string } | null>(null)

    const config = ACTION_CONFIG[action.type]
    const Icon = config.icon

    const handleApprove = useCallback(async () => {
        setIsExecuting(true)

        try {
            switch (action.type) {
                case "create_google_sheet": {
                    const payload = action.payload as unknown as SheetPayload
                    const res = await createGoogleSheet(payload)
                    if (res.error) {
                        toast.error("Failed to create sheet", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Google Sheet created", {
                            description: payload.title,
                            action: res.sheetUrl
                                ? { label: "Open", onClick: () => window.open(res.sheetUrl!, "_blank") }
                                : undefined,
                        })
                        setResult({ success: true, url: res.sheetUrl ?? undefined })
                    }
                    break
                }

                case "create_calendar_event": {
                    const payload = action.payload as unknown as CalendarPayload
                    const res = await createCalendarEventFromProposal(payload)
                    if (res.error) {
                        toast.error("Failed to create event", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Calendar event created", {
                            description: payload.title,
                            action: res.eventUrl
                                ? { label: "Open", onClick: () => window.open(res.eventUrl!, "_blank") }
                                : undefined,
                        })
                        setResult({ success: true, url: res.eventUrl ?? undefined })
                    }
                    break
                }

                case "draft_email": {
                    const payload = action.payload as unknown as EmailPayload
                    const res = await sendDraftEmail(payload)
                    if (res.error) {
                        toast.error("Failed to send email", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Email sent", {
                            description: `To: ${payload.to}`,
                        })
                        setResult({ success: true })
                    }
                    break
                }

                case "create_linear_issue": {
                    const payload = action.payload as unknown as LinearIssuePayload
                    const res = await createLinearIssueFromProposal(payload)
                    if (res.error) {
                        toast.error("Failed to create issue", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Linear issue created", {
                            description: payload.title,
                            action: res.issueUrl
                                ? { label: "Open", onClick: () => window.open(res.issueUrl!, "_blank") }
                                : undefined,
                        })
                        setResult({ success: true, url: res.issueUrl ?? undefined })
                    }
                    break
                }

                case "send_slack_message": {
                    const payload = action.payload as unknown as SlackMessagePayload
                    const res = await sendSlackMessageFromProposal(payload)
                    if (res.error) {
                        toast.error("Failed to send message", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Slack message sent", {
                            description: `Channel: ${payload.channel}`,
                        })
                        setResult({ success: true })
                    }
                    break
                }

                case "draft_invoice": {
                    const payload = action.payload as unknown as InvoiceDraftPayload
                    const res = await createInvoiceDraftFromProposal(payload)
                    if (res.error) {
                        toast.error("Failed to create invoice", { description: res.error })
                        setResult({ success: false })
                    } else {
                        toast.success("Invoice draft created", {
                            description: `${payload.recipientName} — ${payload.items.length} item(s)`,
                        })
                        setResult({ success: true })
                    }
                    break
                }

                case "generate_pitch_deck": {
                    const payload = action.payload as unknown as PitchDeckPayload
                    const res = await generatePitchDeckFromProposal(payload)
                    if (res.error) {
                        toast.error("Failed to generate deck", { description: res.error })
                        setResult({ success: false })
                    } else if (res.downloadUrl) {
                        // Trigger download
                        const a = document.createElement("a")
                        a.href = res.downloadUrl
                        a.download = res.filename ?? "pitch-deck.pptx"
                        a.click()
                        toast.success("Pitch deck generated", {
                            description: payload.title,
                        })
                        setResult({ success: true })
                    }
                    break
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to execute action"
            toast.error(message)
            setResult({ success: false })
        } finally {
            setIsExecuting(false)
        }
    }, [action])

    // After successful execution, show a compact success state
    if (result?.success) {
        return (
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", config.bgClass, config.borderClass)}>
                <Check className={cn("h-4 w-4 flex-shrink-0", config.colorClass)} />
                <span className="text-xs font-medium text-foreground flex-1 truncate">
                    {action.title}
                </span>
                {result.url && (
                    <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("text-xs flex items-center gap-1 hover:underline flex-shrink-0", config.colorClass)}
                    >
                        Open <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>
        )
    }

    return (
        <div className={cn("rounded-lg border p-3", config.bgClass, config.borderClass)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("flex items-center justify-center h-6 w-6 rounded", config.bgClass)}>
                    <Icon className={cn("h-3.5 w-3.5", config.colorClass)} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                        {action.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        {config.label}
                    </p>
                </div>
            </div>

            {/* Description */}
            {action.description && (
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {action.description}
                </p>
            )}

            {/* Payload preview */}
            <PayloadPreview action={action} />

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onDismiss}
                    disabled={isExecuting}
                >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                </Button>
                <Button
                    size="sm"
                    className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                    onClick={handleApprove}
                    disabled={isExecuting}
                >
                    {isExecuting ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    {config.approveLabel}
                </Button>
            </div>
        </div>
    )
}

// ─── Payload Preview ────────────────────────────────────────────────

/**
 * Renders a compact preview of the action payload, customized per action type.
 */
function PayloadPreview({ action }: { action: ProposedExternalAction }) {
    switch (action.type) {
        case "create_google_sheet": {
            const p = action.payload as unknown as SheetPayload
            const rowCount = p.rows?.length ?? 0
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="font-medium">{p.headers?.length ?? 0} columns</span>
                        <span>&middot;</span>
                        <span>{rowCount} row{rowCount !== 1 ? "s" : ""}</span>
                    </div>
                    {p.headers && p.headers.length > 0 && (
                        <p className="text-foreground truncate">
                            {p.headers.join(" | ")}
                        </p>
                    )}
                </div>
            )
        }

        case "create_calendar_event": {
            const p = action.payload as unknown as CalendarPayload
            const start = p.startTime ? formatDateTime(p.startTime) : "TBD"
            const end = p.endTime ? formatDateTime(p.endTime) : "TBD"
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground">
                        {start} &mdash; {end}
                    </p>
                    {p.attendees && p.attendees.length > 0 && (
                        <p className="text-muted-foreground truncate">
                            Attendees: {p.attendees.join(", ")}
                        </p>
                    )}
                    {p.description && (
                        <p className="text-muted-foreground truncate">{p.description}</p>
                    )}
                </div>
            )
        }

        case "draft_email": {
            const p = action.payload as unknown as EmailPayload
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground">
                        <span className="text-muted-foreground">To:</span> {p.to}
                    </p>
                    <p className="text-foreground">
                        <span className="text-muted-foreground">Subject:</span> {p.subject}
                    </p>
                    {p.body && (
                        <p className="text-muted-foreground truncate line-clamp-2">{p.body}</p>
                    )}
                </div>
            )
        }

        case "create_linear_issue": {
            const p = action.payload as unknown as LinearIssuePayload
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground font-medium truncate">{p.title}</p>
                    {p.description && (
                        <p className="text-muted-foreground truncate line-clamp-2">{p.description}</p>
                    )}
                    {p.priority && (
                        <p className="text-muted-foreground">
                            Priority: <span className="capitalize">{p.priority}</span>
                        </p>
                    )}
                </div>
            )
        }

        case "send_slack_message": {
            const p = action.payload as unknown as SlackMessagePayload
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground">
                        <span className="text-muted-foreground">Channel:</span> {p.channel}
                    </p>
                    <p className="text-muted-foreground truncate line-clamp-2">{p.message}</p>
                </div>
            )
        }

        case "draft_invoice": {
            const p = action.payload as unknown as InvoiceDraftPayload
            const total = (p.items ?? []).reduce((s, i) => s + i.quantity * i.unitPrice, 0)
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground">
                        <span className="text-muted-foreground">To:</span> {p.recipientName}
                    </p>
                    <p className="text-muted-foreground">
                        {p.items?.length ?? 0} item(s) &middot; Total: {total.toLocaleString()} {p.currency ?? "USD"}
                    </p>
                </div>
            )
        }

        case "generate_pitch_deck": {
            const p = action.payload as unknown as PitchDeckPayload
            return (
                <div className="rounded bg-card/50 border border-border/50 p-2 text-[10px] space-y-1">
                    <p className="text-foreground font-medium">{p.title}</p>
                    <p className="text-muted-foreground">
                        {p.slides?.length ?? 0} slide(s){p.subtitle ? ` — ${p.subtitle}` : ""}
                    </p>
                </div>
            )
        }

        default:
            return null
    }
}

/**
 * Format an ISO date string to a human-readable date/time.
 */
function formatDateTime(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        })
    } catch {
        return iso
    }
}
