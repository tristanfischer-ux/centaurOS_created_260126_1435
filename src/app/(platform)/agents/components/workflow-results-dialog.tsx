"use client"

/**
 * WorkflowResultsDialog — consolidated view of all workflow step outputs.
 *
 * @description Opens as a large centered dialog showing every node's
 * output in topological (chain) order. Users can scroll through all
 * results at once, copy individual steps, or export the entire workflow
 * as a Markdown file.
 *
 * @component
 *
 * @example
 * <WorkflowResultsDialog
 *     open={resultsOpen}
 *     onOpenChange={setResultsOpen}
 *     workflowName={workflowName}
 *     nodes={nodes}
 *     edges={edges}
 * />
 */

import React, { useState, useCallback, useMemo } from "react"
import Link from "next/link"
import {
    Copy,
    Check,
    Download,
    FileText,
    FileOutput,
    CheckCircle2,
    AlertCircle,
    Clock,
    Loader2,
    UserCheck,
    ChevronDown,
    ChevronRight,
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/ui/markdown"
import {
    generateWorkflowMarkdown,
    generateNodeMarkdown,
    downloadAsFile,
} from "../lib/export-markdown"
import { CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { ActOnThisButton } from "@/components/smart/act-on-this-button"
import type { Node, Edge } from "@xyflow/react"

// ─── Types ───────────────────────────────────────────────────────────

interface ResultNodeData {
    label?: string
    category?: PromptCategory
    promptId?: string
    userInput?: string
    output?: string
    executionStatus?: string
    isHumanTask?: boolean
    guidance?: string
    checklist?: string[]
    checklistCompleted?: boolean[]
    // Media outputs
    imageUrl?: string
    audioUrl?: string
    videoUrl?: string
    outputModality?: string
}

interface WorkflowResultsDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback to toggle open state */
    onOpenChange: (open: boolean) => void
    /** Display name of the current workflow */
    workflowName: string
    /** All canvas nodes */
    nodes: Node[]
    /** All canvas edges */
    edges: Edge[]
}

// ─── Topological sort (local copy for purity) ────────────────────────

function getOrderedNodeIds(nodes: Node[], edges: Edge[]): string[] {
    const edgeMap = new Map(edges.map((e) => [e.source, e.target]))
    const targets = new Set(edges.map((e) => e.target))

    let currentId = nodes.find((n) => !targets.has(n.id))?.id
    const ordered: string[] = []
    const visited = new Set<string>()

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId)
        if (nodes.find((n) => n.id === currentId)) ordered.push(currentId)
        currentId = edgeMap.get(currentId)
    }

    for (const n of nodes) {
        if (!visited.has(n.id)) ordered.push(n.id)
    }

    return ordered
}

// ─── Status helpers ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; colorClass: string }> = {
    approved: { icon: CheckCircle2, label: "Complete", colorClass: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    review: { icon: Clock, label: "Needs review", colorClass: "text-amber-600 bg-amber-50 border-amber-200" },
    running: { icon: Loader2, label: "Running", colorClass: "text-blue-600 bg-blue-50 border-blue-200" },
    error: { icon: AlertCircle, label: "Error", colorClass: "text-red-600 bg-red-50 border-red-200" },
    idle: { icon: FileText, label: "Not run", colorClass: "text-muted-foreground bg-muted border-muted" },
}

function StatusBadgeInline({ status }: { status?: string }) {
    const config = STATUS_CONFIG[status ?? "idle"] ?? STATUS_CONFIG.idle
    const Icon = config.icon
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.colorClass}`}>
            <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
            {config.label}
        </span>
    )
}

// ─── Single result step ──────────────────────────────────────────────

function ResultStep({
    stepNum,
    node,
}: {
    stepNum: number
    node: Node
}) {
    const data = node.data as ResultNodeData
    const isHuman = node.type === "human-task" || data.isHumanTask
    const [expanded, setExpanded] = useState(true)
    const [copied, setCopied] = useState(false)
    const hasTextOutput = !!data.output?.trim()
    const hasMediaOutput = !!(data.imageUrl || data.audioUrl || data.videoUrl)
    const hasOutput = hasTextOutput || hasMediaOutput
    const color = data.category ? CATEGORY_ACCENT_COLORS[data.category] : "#94a3b8"

    const handleCopyStep = useCallback(() => {
        const md = isHuman
            ? `## ${data.label}\n\n${data.guidance ?? ""}`
            : generateNodeMarkdown(
                  data.label ?? "Step",
                  data.userInput,
                  data.output
              )
        navigator.clipboard.writeText(md)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [isHuman, data])

    return (
        <div className="border rounded-lg overflow-hidden">
            {/* Step header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
                {/* Step number pill */}
                <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: isHuman ? "#3b82f6" : color }}
                >
                    {stepNum}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                            {data.label || "Untitled"}
                        </span>
                        {isHuman && (
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 flex-shrink-0">
                                People
                            </span>
                        )}
                    </div>
                </div>

                <StatusBadgeInline status={data.executionStatus} />

                {expanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
            </button>

            {/* Step body */}
            {expanded && (
                <div className="px-4 pb-4 pt-1 border-t space-y-3">
                    {isHuman ? (
                        <>
                            {data.guidance && (
                                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">
                                        Guidance
                                    </p>
                                    <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line">
                                        {data.guidance}
                                    </p>
                                </div>
                            )}
                            {data.checklist && data.checklist.length > 0 && (
                                <div className="space-y-1">
                                    {data.checklist.map((item, ci) => {
                                        const done = data.checklistCompleted?.[ci] ?? false
                                        return (
                                            <div
                                                key={ci}
                                                className={`flex items-start gap-2 p-2 rounded text-xs ${
                                                    done
                                                        ? "bg-emerald-50 text-emerald-700 line-through"
                                                        : "bg-muted text-foreground"
                                                }`}
                                            >
                                                {done ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <div className="w-3.5 h-3.5 rounded border border-muted-foreground/40 flex-shrink-0 mt-0.5" />
                                                )}
                                                {item}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Input (collapsed by default if output exists) */}
                            {data.userInput?.trim() && (
                                <details className="group">
                                    <summary className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none">
                                        Input data
                                    </summary>
                                    <pre className="mt-1.5 p-3 rounded-lg bg-muted text-xs leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                        {data.userInput}
                                    </pre>
                                </details>
                            )}

                            {/* Media output (image/audio/video) */}
                            {data.imageUrl && (
                                <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Generated Image
                                    </p>
                                    <div className="rounded-lg overflow-hidden border bg-muted">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={data.imageUrl} alt="Generated image" className="w-full h-auto" />
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-[10px] h-7"
                                            onClick={() => {
                                                const a = document.createElement("a")
                                                a.href = data.imageUrl!
                                                a.download = `generated-${Date.now()}.png`
                                                a.click()
                                            }}
                                        >
                                            <Download className="w-3 h-3 mr-1" />
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {data.audioUrl && (
                                <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Generated Audio
                                    </p>
                                    <audio controls className="w-full" src={data.audioUrl}>
                                        <track kind="captions" />
                                    </audio>
                                </div>
                            )}

                            {data.videoUrl && (
                                <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Generated Video
                                    </p>
                                    <div className="rounded-lg overflow-hidden border bg-black">
                                        <video controls className="w-full" src={data.videoUrl}>
                                            <track kind="captions" />
                                        </video>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-[10px] h-7"
                                            onClick={() => {
                                                const a = document.createElement("a")
                                                a.href = data.videoUrl!
                                                a.download = `generated-${Date.now()}.mp4`
                                                a.click()
                                            }}
                                        >
                                            <Download className="w-3 h-3 mr-1" />
                                            Download Video
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Text output */}
                            {hasTextOutput && !(data.output === "[Image generated]" || data.output === "[Audio generated]" || data.output === "[Video generated]") ? (
                                <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Output
                                    </p>
                                    <div className="p-3 rounded-lg bg-muted/50 border text-xs leading-relaxed max-h-80 overflow-y-auto">
                                        <Markdown content={data.output!} className="text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_td]:border [&_td]:border-slate-200 [&_th]:bg-muted [&_th]:font-semibold" />
                                    </div>
                                </div>
                            ) : !hasOutput ? (
                                <p className="text-xs text-muted-foreground italic">
                                    No output yet — run this step first.
                                </p>
                            ) : null}
                        </>
                    )}

                    {/* Per-step copy + act on this */}
                    {(hasOutput || isHuman) && (
                        <div className="flex items-center justify-between">
                            {hasOutput && !isHuman && (
                                <ActOnThisButton
                                    context={{
                                        source: 'agents',
                                        entityTitle: data.label || 'Specialist Output',
                                        entityDescription: (data.output || '').slice(0, 500),
                                    }}
                                    variant="subtle"
                                    label="Act on this"
                                />
                            )}
                            <div className="flex-1" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopyStep}
                                className="h-7 text-[10px] gap-1"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3 h-3" />
                                        Copy step
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main dialog ─────────────────────────────────────────────────────

export function WorkflowResultsDialog({
    open,
    onOpenChange,
    workflowName,
    nodes,
    edges,
}: WorkflowResultsDialogProps) {
    const [copiedAll, setCopiedAll] = useState(false)

    // Ordered node list
    const orderedNodes = useMemo(() => {
        const ids = getOrderedNodeIds(nodes, edges)
        const nodeMap = new Map(nodes.map((n) => [n.id, n]))
        return ids.map((id) => nodeMap.get(id)).filter(Boolean) as Node[]
    }, [nodes, edges])

    // Stats
    const completedCount = orderedNodes.filter(
        (n) => (n.data as ResultNodeData).executionStatus === "approved"
    ).length
    const hasAnyOutput = orderedNodes.some((n) => {
        const d = n.data as ResultNodeData
        return d.output?.trim() || d.imageUrl || d.audioUrl || d.videoUrl
    })

    const handleCopyAll = useCallback(() => {
        const md = generateWorkflowMarkdown(workflowName, nodes, edges)
        navigator.clipboard.writeText(md)
        setCopiedAll(true)
        setTimeout(() => setCopiedAll(false), 2000)
    }, [workflowName, nodes, edges])

    const handleDownloadMarkdown = useCallback(() => {
        const md = generateWorkflowMarkdown(workflowName, nodes, edges)
        const safeName = (workflowName || "workflow")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
        downloadAsFile(md, `${safeName}-results.md`)
    }, [workflowName, nodes, edges])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="max-h-[90vh] flex flex-col gap-0 p-0">
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-lg font-semibold">
                                {workflowName || "Project"} — Results
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                                {orderedNodes.length} step{orderedNodes.length !== 1 ? "s" : ""} · {completedCount} completed
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyAll}
                                className="gap-1.5 text-xs h-8"
                                disabled={!hasAnyOutput}
                            >
                                {copiedAll ? (
                                    <>
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy All
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadMarkdown}
                                className="gap-1.5 text-xs h-8"
                                disabled={!hasAnyOutput}
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download .md
                            </Button>
                            <Link href="/agents/artifacts">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs h-8"
                                >
                                    <FileOutput className="w-3.5 h-3.5" />
                                    View Deliverables
                                </Button>
                            </Link>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="px-6 py-4 space-y-3">
                        {orderedNodes.length === 0 ? (
                            <div className="py-12 text-center">
                                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    No steps in this project yet.
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    Add templates to the canvas, run the chain, then view results here.
                                </p>
                            </div>
                        ) : !hasAnyOutput ? (
                            <div className="py-12 text-center">
                                <Loader2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    No results yet — run the project first.
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    Hit <strong>Run Chain</strong> in the toolbar, then come back here.
                                </p>
                            </div>
                        ) : (
                            orderedNodes.map((node, i) => (
                                <ResultStep
                                    key={node.id}
                                    stepNum={i + 1}
                                    node={node}
                                />
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
