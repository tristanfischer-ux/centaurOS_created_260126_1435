"use client"

import React, { useState, useCallback } from "react"
import { X, Copy, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getPromptById } from "../lib/prompt-library"
import { CATEGORY_META, CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import type { Node } from "@xyflow/react"

interface NodeInspectorProps {
    node: Node
    onClose: () => void
    onUpdatePrompt: (nodeId: string, newPrompt: string) => void
    onDelete: (nodeId: string) => void
}

export function NodeInspector({
    node,
    onClose,
    onUpdatePrompt,
    onDelete,
}: NodeInspectorProps) {
    const data = node.data as {
        promptId?: string
        label?: string
        description?: string
        category?: PromptCategory
        icon?: string
        customPrompt?: string
    }

    const prompt = data.promptId ? getPromptById(data.promptId) : null
    const category = data.category ?? "startup-strategy"
    const meta = CATEGORY_META[category]
    const color = CATEGORY_ACCENT_COLORS[category]
    const Icon = getIcon(data.icon ?? "Sparkles")

    const [promptText, setPromptText] = useState(
        data.customPrompt || prompt?.defaultPrompt || ""
    )
    const [copied, setCopied] = useState(false)

    const handlePromptChange = useCallback(
        (value: string) => {
            setPromptText(value)
            onUpdatePrompt(node.id, value)
        },
        [node.id, onUpdatePrompt]
    )

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(promptText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [promptText])

    const handleReset = useCallback(() => {
        const original = prompt?.defaultPrompt || ""
        setPromptText(original)
        onUpdatePrompt(node.id, original)
    }, [node.id, prompt, onUpdatePrompt])

    return (
        <div className="w-96 border-l border-slate-100 bg-white flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color }}>
                        {meta?.label ?? "Prompt"}
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-muted-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-start gap-3">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}15` }}
                    >
                        <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            {data.label || "Prompt"}
                        </h3>
                        {data.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {data.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Prompt editor */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    {/* Input/Output labels */}
                    {prompt && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">
                                    Input
                                </p>
                                <p className="text-[11px] text-blue-700">
                                    {prompt.inputLabel}
                                </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">
                                    Output
                                </p>
                                <p className="text-[11px] text-emerald-700">
                                    {prompt.outputLabel}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Prompt text */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-foreground">
                                Prompt
                            </label>
                            <div className="flex items-center gap-1">
                                {prompt && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleReset}
                                        className="h-6 px-2 text-[10px]"
                                    >
                                        Reset
                                    </Button>
                                )}
                            </div>
                        </div>
                        <Textarea
                            value={promptText}
                            onChange={(e) => handlePromptChange(e.target.value)}
                            className="min-h-[300px] font-mono text-xs leading-relaxed resize-y"
                            placeholder="Enter your prompt..."
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            Use <code className="bg-slate-100 px-1 rounded text-[10px]">{"{{input}}"}</code> to reference the output from the previous step in the chain.
                        </p>
                    </div>

                    {/* Tags */}
                    {prompt?.tags && prompt.tags.length > 0 && (
                        <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                                Tags
                            </label>
                            <div className="flex flex-wrap gap-1">
                                {prompt.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-muted-foreground"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Suggested next */}
                    {prompt?.suggestedNext && prompt.suggestedNext.length > 0 && (
                        <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                                Chains well with
                            </label>
                            <div className="space-y-1">
                                {prompt.suggestedNext
                                    .map((id) => getPromptById(id))
                                    .filter(Boolean)
                                    .map((p) => (
                                        <div
                                            key={p!.id}
                                            className="flex items-center gap-2 p-2 rounded-md bg-slate-50 text-xs"
                                        >
                                            <span className="text-muted-foreground">→</span>
                                            <span className="font-medium text-foreground">
                                                {p!.title}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer actions */}
            <div className="p-4 border-t border-slate-100 space-y-2">
                <Button
                    onClick={handleCopy}
                    className="w-full gap-2"
                    variant={copied ? "default" : "default"}
                    style={
                        !copied
                            ? { backgroundColor: "#ff4500" }
                            : { backgroundColor: "#059669" }
                    }
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4" /> Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="w-4 h-4" /> Copy Prompt
                        </>
                    )}
                </Button>
                <Button
                    onClick={() => onDelete(node.id)}
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="w-4 h-4" /> Remove from workflow
                </Button>
            </div>
        </div>
    )
}
