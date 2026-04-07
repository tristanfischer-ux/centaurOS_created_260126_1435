"use client"

/**
 * @file publish-content-card.tsx -- Approval card for specialist-proposed content publishing.
 *
 * @description Renders when a specialist proposes `type: "publish_content"`. Shows a rendered
 * markdown preview of the proposed content with approve/edit/revision controls. The founder
 * can preview, edit inline, publish, or request revisions — all without leaving the chat.
 *
 * @security Content is NEVER auto-published. This card is the approval gate between
 * the specialist's proposal and the actual publish action.
 *
 * @related
 * - src/lib/agents/tools/permission-guard.ts - PublishContentPayload type
 * - src/actions/content-publishing.ts - Server actions called on approval
 * - src/components/specialists/external-action-card.tsx - Sibling card pattern
 */

import { useState, useCallback } from "react"
import { FileText, Loader2, Check, ExternalLink, X, Eye, Pencil, Send, MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/components/ui/markdown"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { PublishContentPayload } from "@/lib/agents/tools/permission-guard"
import {
    createPublishableContent,
    publishContent,
    requestRevision,
} from "@/actions/content-publishing"

// ─── Types ─────────────────────────────────────────────────────────

interface PublishContentCardProps {
    action: {
        type: "publish_content"
        title: string
        description: string
        payload: PublishContentPayload
    }
    onDismiss: () => void
}

type CardState = "default" | "expanded" | "editing" | "publishing" | "published" | "revision"

// ─── Content Type Config ───────────────────────────────────────────

/** Maps content_type to a human-readable label. */
const CONTENT_TYPE_LABELS: Record<PublishContentPayload["content_type"], string> = {
    blog: "Blog Post",
    page: "Page",
    "case-study": "Case Study",
    "landing-page": "Landing Page",
}

/** Truncate markdown to approximately N characters, breaking at a paragraph boundary. */
function truncateMarkdown(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content
    // INTENT: Break at paragraph boundary so we don't cut mid-sentence
    const truncated = content.slice(0, maxChars)
    const lastNewline = truncated.lastIndexOf("\n\n")
    if (lastNewline > maxChars * 0.5) {
        return truncated.slice(0, lastNewline) + "\n\n..."
    }
    const lastSpace = truncated.lastIndexOf(" ")
    return truncated.slice(0, lastSpace > 0 ? lastSpace : maxChars) + "..."
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * PublishContentCard -- Approval card for specialist-proposed content publishing.
 *
 * @description Shows a rendered markdown preview with controls to preview, edit,
 * publish, or request revisions. Follows the same approval-gate pattern as
 * ExternalActionCard but with content-specific UX.
 */
export function PublishContentCard({ action, onDismiss }: PublishContentCardProps) {
    const { payload } = action
    const [cardState, setCardState] = useState<CardState>("default")
    const [editedContent, setEditedContent] = useState(payload.content)
    const [revisionNotes, setRevisionNotes] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
    const [artifactId, setArtifactId] = useState<string | null>(null)

    const contentTypeLabel = CONTENT_TYPE_LABELS[payload.content_type] ?? "Content"

    // FLOW: Create artifact + publish in sequence
    const handlePublish = useCallback(async () => {
        setCardState("publishing")
        setIsLoading(true)

        try {
            // Step 1: Create the artifact (with potentially edited content)
            const publishPayload: PublishContentPayload = {
                ...payload,
                content: editedContent,
            }
            const createRes = await createPublishableContent(publishPayload)

            if (createRes.error || !createRes.artifactId) {
                toast.error("Failed to create content", { description: createRes.error ?? "Unknown error" })
                setCardState("default")
                return
            }

            const newArtifactId = createRes.artifactId
            setArtifactId(newArtifactId)

            // Step 2: Publish
            const publishRes = await publishContent(newArtifactId)

            if (publishRes.error || !publishRes.url) {
                toast.error("Failed to publish", { description: publishRes.error ?? "Unknown error" })
                setCardState("default")
                return
            }

            setPublishedUrl(publishRes.url)
            setCardState("published")
            toast.success(`${contentTypeLabel} published`, {
                description: payload.title,
                action: {
                    label: "View",
                    onClick: () => window.open(publishRes.url!, "_blank"),
                },
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to publish content"
            toast.error(message)
            setCardState("default")
        } finally {
            setIsLoading(false)
        }
    }, [payload, editedContent, contentTypeLabel])

    // FLOW: Create artifact first (if needed), then request revision
    const handleRequestRevision = useCallback(async () => {
        if (!revisionNotes.trim()) {
            toast.error("Please add revision notes")
            return
        }

        setIsLoading(true)

        try {
            // If we don't have an artifact yet, create one first
            let currentArtifactId = artifactId
            if (!currentArtifactId) {
                const createRes = await createPublishableContent(payload)
                if (createRes.error || !createRes.artifactId) {
                    toast.error("Failed to create content", { description: createRes.error ?? "Unknown error" })
                    return
                }
                currentArtifactId = createRes.artifactId
                setArtifactId(currentArtifactId)
            }

            const res = await requestRevision(currentArtifactId, revisionNotes.trim())

            if (res.error) {
                toast.error("Failed to request revision", { description: res.error })
                return
            }

            toast.success("Revision requested", {
                description: "The specialist will revise based on your notes.",
            })
            onDismiss()
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to request revision"
            toast.error(message)
        } finally {
            setIsLoading(false)
        }
    }, [artifactId, payload, revisionNotes, onDismiss])

    const togglePreview = useCallback(() => {
        setCardState((prev) => (prev === "expanded" ? "default" : "expanded"))
    }, [])

    const toggleEdit = useCallback(() => {
        setCardState((prev) => (prev === "editing" ? "default" : "editing"))
    }, [])

    const toggleRevision = useCallback(() => {
        setCardState((prev) => (prev === "revision" ? "default" : "revision"))
    }, [])

    // ─── Published State ───────────────────────────────────────────

    if (cardState === "published") {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/10 px-3 py-2">
                <Check className="h-4 w-4 flex-shrink-0 text-status-success" />
                <span className="text-xs font-medium text-foreground flex-1 truncate">
                    {payload.title}
                </span>
                {publishedUrl && (
                    <a
                        href={publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs flex items-center gap-1 text-status-success hover:underline flex-shrink-0"
                    >
                        View live <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>
        )
    }

    // ─── Default / Interactive States ──────────────────────────────

    const displayContent = cardState === "editing" ? editedContent : payload.content
    const isExpanded = cardState === "expanded" || cardState === "editing"

    return (
        <div className="rounded-lg border border-international-orange/20 bg-international-orange/5 p-3">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded bg-international-orange/10">
                    <FileText className="h-3.5 w-3.5 text-international-orange" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                        {payload.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        {contentTypeLabel}
                    </p>
                </div>
            </div>

            {/* Tags */}
            {payload.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {payload.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" size="sm">
                            {tag}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Description */}
            {action.description && (
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {action.description}
                </p>
            )}

            {/* Content Preview / Edit */}
            {cardState === "editing" ? (
                // DECISION: Side-by-side split for editing — textarea left, rendered preview right
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className={cn(
                            "rounded border border-input bg-card p-2 text-xs text-foreground",
                            "resize-none font-mono focus:outline-none focus:ring-1 focus:ring-international-orange",
                            "min-h-[200px] max-h-[400px]"
                        )}
                        aria-label="Edit content"
                    />
                    <div className="rounded border border-border bg-card p-2 overflow-y-auto min-h-[200px] max-h-[400px]">
                        <Markdown content={editedContent} className="text-xs" />
                    </div>
                </div>
            ) : (
                <div className="rounded border border-border/50 bg-card/50 p-2 mb-2 overflow-y-auto max-h-[300px]">
                    <Markdown
                        content={isExpanded ? displayContent : truncateMarkdown(displayContent, 300)}
                        className="text-xs"
                    />
                </div>
            )}

            {/* Revision Notes Input */}
            {cardState === "revision" && (
                <div className="mb-2">
                    <textarea
                        value={revisionNotes}
                        onChange={(e) => setRevisionNotes(e.target.value)}
                        placeholder="What needs to change? Be specific..."
                        className={cn(
                            "w-full rounded border border-input bg-card p-2 text-xs text-foreground",
                            "resize-none focus:outline-none focus:ring-1 focus:ring-international-orange",
                            "min-h-[80px]"
                        )}
                        aria-label="Revision notes"
                    />
                    <div className="flex justify-end mt-1">
                        <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleRequestRevision}
                            disabled={isLoading || !revisionNotes.trim()}
                        >
                            {isLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                                <Send className="h-3 w-3 mr-1" />
                            )}
                            Send Revision
                        </Button>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={togglePreview}
                        disabled={isLoading}
                    >
                        <Eye className="h-3 w-3 mr-1" />
                        {cardState === "expanded" ? "Collapse" : "Preview"}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={toggleEdit}
                        disabled={isLoading}
                    >
                        <Pencil className="h-3 w-3 mr-1" />
                        {cardState === "editing" ? "Done" : "Edit"}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={toggleRevision}
                        disabled={isLoading}
                    >
                        <MessageSquareText className="h-3 w-3 mr-1" />
                        Revise
                    </Button>
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onDismiss}
                        disabled={isLoading}
                    >
                        <X className="h-3 w-3 mr-1" />
                        Dismiss
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 text-xs bg-international-orange hover:bg-international-orange-hover"
                        onClick={handlePublish}
                        disabled={isLoading}
                    >
                        {isLoading && cardState === "publishing" ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : null}
                        Publish
                    </Button>
                </div>
            </div>
        </div>
    )
}
