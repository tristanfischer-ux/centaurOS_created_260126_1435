/**
 * @file export-markdown.ts
 *
 * @description Utilities for exporting workflow results as structured Markdown.
 * Supports clipboard copy and file download. Used by the Results Dialog
 * and toolbar "Export" action.
 *
 * @related
 * - src/app/(platform)/agents/components/workflow-results-dialog.tsx
 * - src/app/(platform)/agents/components/workflow-toolbar.tsx
 */

import type { Node, Edge } from "@xyflow/react"

/** Minimal node shape needed for export — avoids importing full PromptNodeData. */
interface ExportableNodeData {
    label?: string
    category?: string
    promptId?: string
    customPrompt?: string
    userInput?: string
    output?: string
    executionStatus?: string
    isHumanTask?: boolean
    guidance?: string
    checklist?: string[]
    checklistCompleted?: boolean[]
}

// ─── Topological sort (duplicated locally to keep this module pure) ──

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

// ─── Status emoji helper ─────────────────────────────────────────────

function statusIcon(status?: string): string {
    switch (status) {
        case "approved":
            return "✅"
        case "review":
            return "🔶"
        case "running":
            return "⏳"
        case "error":
            return "❌"
        default:
            return "⬜"
    }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generates a structured Markdown report from the current workflow state.
 *
 * @param workflowName - Display name of the workflow
 * @param nodes - All ReactFlow nodes on the canvas
 * @param edges - All ReactFlow edges on the canvas
 * @returns Markdown string ready for clipboard or file download
 */
export function generateWorkflowMarkdown(
    workflowName: string,
    nodes: Node[],
    edges: Edge[]
): string {
    const orderedIds = getOrderedNodeIds(nodes, edges)
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    const completedCount = nodes.filter(
        (n) => (n.data as ExportableNodeData).executionStatus === "approved"
    ).length
    const hasOutputs = nodes.some((n) => (n.data as ExportableNodeData).output)

    const lines: string[] = []

    // Header
    lines.push(`# ${workflowName || "Workflow Results"}`)
    lines.push("")
    lines.push(`**Generated:** ${new Date().toLocaleString()}  `)
    lines.push(`**Steps:** ${nodes.length} | **Completed:** ${completedCount}/${nodes.length}`)
    lines.push("")
    lines.push("---")
    lines.push("")

    // Each step
    orderedIds.forEach((id, i) => {
        const node = nodeMap.get(id)
        if (!node) return

        const data = node.data as ExportableNodeData
        const stepNum = i + 1
        const icon = statusIcon(data.executionStatus)
        const isHuman = node.type === "human-task" || data.isHumanTask

        lines.push(`## ${icon} Step ${stepNum}: ${data.label || "Untitled"}`)
        lines.push("")

        if (isHuman) {
            lines.push(`> **Type:** Human checkpoint`)
            lines.push("")

            if (data.guidance) {
                lines.push("### Guidance")
                lines.push("")
                lines.push(data.guidance)
                lines.push("")
            }

            if (data.checklist && data.checklist.length > 0) {
                lines.push("### Checklist")
                lines.push("")
                data.checklist.forEach((item, ci) => {
                    const done = data.checklistCompleted?.[ci] ?? false
                    lines.push(`- [${done ? "x" : " "}] ${item}`)
                })
                lines.push("")
            }
        } else {
            if (data.userInput?.trim()) {
                lines.push("### Input")
                lines.push("")
                lines.push("```")
                lines.push(data.userInput.trim())
                lines.push("```")
                lines.push("")
            }

            if (data.output?.trim()) {
                lines.push("### Output")
                lines.push("")
                lines.push(data.output.trim())
                lines.push("")
            } else if (!hasOutputs) {
                lines.push("*No output yet — run the workflow first.*")
                lines.push("")
            }
        }

        lines.push("---")
        lines.push("")
    })

    return lines.join("\n")
}

/**
 * Generates a single-node Markdown export.
 *
 * @param label - Node display name
 * @param input - User input data
 * @param output - AI-generated output
 * @returns Markdown string for one step
 */
export function generateNodeMarkdown(
    label: string,
    input?: string,
    output?: string
): string {
    const lines: string[] = []

    lines.push(`# ${label}`)
    lines.push("")
    lines.push(`**Exported:** ${new Date().toLocaleString()}`)
    lines.push("")

    if (input?.trim()) {
        lines.push("## Input")
        lines.push("")
        lines.push("```")
        lines.push(input.trim())
        lines.push("```")
        lines.push("")
    }

    if (output?.trim()) {
        lines.push("## Output")
        lines.push("")
        lines.push(output.trim())
        lines.push("")
    }

    return lines.join("\n")
}

/**
 * Triggers a browser file download with the given content.
 *
 * @param content - File content (text)
 * @param filename - Download filename
 * @param mimeType - MIME type (default: text/markdown)
 */
export function downloadAsFile(
    content: string,
    filename: string,
    mimeType = "text/markdown"
): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
