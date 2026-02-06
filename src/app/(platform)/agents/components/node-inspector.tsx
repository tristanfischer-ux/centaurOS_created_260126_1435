"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { X, Copy, Check, Trash2, Play, RotateCcw, ChevronDown, ChevronRight, CheckCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getPromptById } from "../lib/prompt-library"
import { getCustomPromptById } from "../lib/custom-prompts"
import { CATEGORY_META, CATEGORY_ACCENT_COLORS, type PromptCategory, type ExecutionStatus, type AttachedFile } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import { FileDropZone } from "./file-drop-zone"
import type { Node } from "@xyflow/react"

interface NodeInspectorProps {
    node: Node
    onClose: () => void
    onUpdatePrompt: (nodeId: string, newPrompt: string) => void
    onUpdateInput: (nodeId: string, input: string) => void
    onUpdateOutput: (nodeId: string, output: string) => void
    onUpdateFiles: (nodeId: string, files: AttachedFile[]) => void
    onDelete: (nodeId: string) => void
    onRunNode: (nodeId: string) => void
    onApproveNode: (nodeId: string) => void
    onApproveAndContinue: (nodeId: string) => void
}

export function NodeInspector({
    node,
    onClose,
    onUpdatePrompt,
    onUpdateInput,
    onUpdateOutput,
    onUpdateFiles,
    onDelete,
    onRunNode,
    onApproveNode,
    onApproveAndContinue,
}: NodeInspectorProps) {
    const data = node.data as {
        promptId?: string
        label?: string
        description?: string
        category?: PromptCategory
        icon?: string
        customPrompt?: string
        userInput?: string
        output?: string
        executionStatus?: ExecutionStatus
        error?: string
        attachedFiles?: AttachedFile[]
    }

    const prompt = data.promptId
        ? (getPromptById(data.promptId) ?? getCustomPromptById(data.promptId))
        : null
    const category = data.category ?? "startup-strategy"
    const meta = CATEGORY_META[category]
    const color = CATEGORY_ACCENT_COLORS[category]
    const Icon = getIcon(data.icon ?? "Sparkles")

    const status = data.executionStatus ?? "idle"

    // Local state for editing
    const [promptText, setPromptText] = useState(data.customPrompt || prompt?.defaultPrompt || "")
    const [userInput, setUserInput] = useState(data.userInput || "")
    const [outputText, setOutputText] = useState(data.output || "")
    const [copied, setCopied] = useState(false)
    const [copiedOutput, setCopiedOutput] = useState(false)
    const [inputExpanded, setInputExpanded] = useState(true)
    const [outputExpanded, setOutputExpanded] = useState(true)
    const outputRef = useRef<HTMLTextAreaElement>(null)

    // Sync with node data when node changes
    useEffect(() => {
        setPromptText(data.customPrompt || prompt?.defaultPrompt || "")
        setUserInput(data.userInput || "")
        setOutputText(data.output || "")
    }, [node.id, data.customPrompt, data.userInput, data.output, prompt?.defaultPrompt])

    // Auto-scroll output while streaming
    useEffect(() => {
        if (status === "running" && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [data.output, status])

    const handlePromptChange = useCallback(
        (value: string) => {
            setPromptText(value)
            onUpdatePrompt(node.id, value)
        },
        [node.id, onUpdatePrompt]
    )

    const handleInputChange = useCallback(
        (value: string) => {
            setUserInput(value)
            onUpdateInput(node.id, value)
        },
        [node.id, onUpdateInput]
    )

    const handleOutputChange = useCallback(
        (value: string) => {
            setOutputText(value)
            onUpdateOutput(node.id, value)
        },
        [node.id, onUpdateOutput]
    )

    const handleFilesAdded = useCallback(
        (files: AttachedFile[]) => {
            const existing = data.attachedFiles || []
            const combined = [...existing, ...files]
            onUpdateFiles(node.id, combined)

            // Also append file contents to input
            const fileText = files.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n\n")
            const newInput = userInput ? `${userInput}\n\n${fileText}` : fileText
            setUserInput(newInput)
            onUpdateInput(node.id, newInput)
        },
        [node.id, data.attachedFiles, userInput, onUpdateFiles, onUpdateInput]
    )

    const handleRemoveFile = useCallback(
        (name: string) => {
            const filtered = (data.attachedFiles || []).filter((f) => f.name !== name)
            onUpdateFiles(node.id, filtered)
        },
        [node.id, data.attachedFiles, onUpdateFiles]
    )

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(promptText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [promptText])

    const handleCopyOutput = useCallback(() => {
        navigator.clipboard.writeText(outputText)
        setCopiedOutput(true)
        setTimeout(() => setCopiedOutput(false), 2000)
    }, [outputText])

    const handleReset = useCallback(() => {
        const original = prompt?.defaultPrompt || ""
        setPromptText(original)
        onUpdatePrompt(node.id, original)
    }, [node.id, prompt, onUpdatePrompt])

    const canRun = status === "idle" || status === "approved" || status === "error"
    const isReview = status === "review"

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

            {/* Content */}
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

                    {/* ─── Input Data Section ──────────────────────────────── */}
                    <div>
                        <button
                            onClick={() => setInputExpanded(!inputExpanded)}
                            className="flex items-center gap-1.5 mb-2 w-full text-left"
                        >
                            {inputExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            <label className="text-xs font-semibold text-foreground cursor-pointer">
                                Input Data
                            </label>
                            {userInput.trim() && !inputExpanded && (
                                <span className="ml-auto text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                    Has data
                                </span>
                            )}
                        </button>

                        {inputExpanded && (
                            <div className="space-y-2">
                                <Textarea
                                    value={userInput}
                                    onChange={(e) => handleInputChange(e.target.value)}
                                    className="min-h-[100px] text-xs leading-relaxed resize-y"
                                    placeholder="Paste your data here: company info, metrics, documents, context..."
                                />
                                <FileDropZone
                                    compact
                                    onFilesAdded={handleFilesAdded}
                                    attachedFiles={data.attachedFiles || []}
                                    onRemoveFile={handleRemoveFile}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    This data replaces <code className="bg-slate-100 px-1 rounded text-[10px]">{"{{input}}"}</code> in the prompt. For chained nodes, the previous node&apos;s output is used if no manual input is provided.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ─── Prompt Text Section ─────────────────────────────── */}
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
                            className="min-h-[200px] font-mono text-xs leading-relaxed resize-y"
                            placeholder="Enter your prompt..."
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            Use <code className="bg-slate-100 px-1 rounded text-[10px]">{"{{input}}"}</code> to reference the input data or previous step&apos;s output.
                        </p>
                    </div>

                    {/* ─── Output Section ──────────────────────────────────── */}
                    {(data.output || status === "running" || status === "review" || status === "error") && (
                        <div>
                            <button
                                onClick={() => setOutputExpanded(!outputExpanded)}
                                className="flex items-center gap-1.5 mb-2 w-full text-left"
                            >
                                {outputExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                <label className="text-xs font-semibold text-foreground cursor-pointer">
                                    AI Output
                                </label>
                                {status === "running" && (
                                    <span className="ml-auto text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full animate-pulse">
                                        Generating...
                                    </span>
                                )}
                                {status === "review" && (
                                    <span className="ml-auto text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                        Needs review
                                    </span>
                                )}
                            </button>

                            {outputExpanded && (
                                <div className="space-y-2">
                                    {data.error && (
                                        <div className="p-2.5 rounded-lg bg-red-50 border border-red-100">
                                            <p className="text-[11px] text-red-700">{data.error}</p>
                                        </div>
                                    )}

                                    <Textarea
                                        ref={outputRef}
                                        value={data.output || ""}
                                        onChange={(e) => handleOutputChange(e.target.value)}
                                        className={`min-h-[150px] text-xs leading-relaxed resize-y ${
                                            status === "running" ? "opacity-80" : ""
                                        } ${isReview ? "border-amber-200 bg-amber-50/30" : ""}`}
                                        placeholder={status === "running" ? "Generating..." : "Output will appear here..."}
                                        readOnly={status === "running"}
                                    />

                                    {isReview && (
                                        <p className="text-[10px] text-amber-600">
                                            Review the output above. You can edit it before approving. This output will feed into the next connected node.
                                        </p>
                                    )}

                                    {data.output && status !== "running" && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCopyOutput}
                                            className="h-6 px-2 text-[10px] gap-1"
                                        >
                                            {copiedOutput ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copiedOutput ? "Copied" : "Copy output"}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
                {/* HITL Review actions */}
                {isReview && (
                    <div className="space-y-2 mb-2">
                        <Button
                            onClick={() => onApproveAndContinue(node.id)}
                            className="w-full gap-2 text-xs"
                            style={{ backgroundColor: "#059669" }}
                        >
                            <ArrowRight className="w-4 h-4" />
                            Approve & Continue
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => onApproveNode(node.id)}
                                variant="outline"
                                className="flex-1 gap-1.5 text-xs"
                            >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve & Stop
                            </Button>
                            <Button
                                onClick={() => onRunNode(node.id)}
                                variant="outline"
                                className="flex-1 gap-1.5 text-xs"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Re-run
                            </Button>
                        </div>
                    </div>
                )}

                {/* Run / Copy / Delete */}
                {canRun && (
                    <Button
                        onClick={() => onRunNode(node.id)}
                        className="w-full gap-2"
                        style={{ backgroundColor: "#3b82f6" }}
                    >
                        <Play className="w-4 h-4" />
                        Run Prompt
                    </Button>
                )}

                {status === "running" && (
                    <Button disabled className="w-full gap-2 opacity-70">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating...
                    </Button>
                )}

                <Button
                    onClick={handleCopy}
                    variant="outline"
                    className="w-full gap-2"
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4 text-emerald-600" /> Copied!
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
