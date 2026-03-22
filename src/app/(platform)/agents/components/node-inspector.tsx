"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { X, Copy, Check, Trash2, Play, RotateCcw, ChevronDown, ChevronRight, CheckCircle, ArrowRight, Sparkles, Brain, Globe, Image as ImageIcon, Mic, Cpu, Zap, Loader2, UserCheck, Square, CheckSquare, Download, Pencil, Eye, ExternalLink, Braces } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getPromptById } from "../lib/prompts"
import { CATEGORY_META, CATEGORY_ACCENT_COLORS, type PromptCategory, type ExecutionStatus, type AttachedFile } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import { Markdown } from "@/components/ui/markdown"
import { FileDropZone } from "./file-drop-zone"
import { PROVIDER_REGISTRY, getProvidersForModality, getModelsForModality, getDefaultModel, type AIProviderId, type OutputModality, OUTPUT_MODALITIES } from "@/lib/ai-providers/types"
import { parseSlideDeckFromText } from "@/lib/ai-providers/slide-parser"
import { generateNodeMarkdown, downloadAsFile } from "../lib/export-markdown"
import { ActOnThisButton } from "@/components/smart/act-on-this-button"
import type { Node } from "@xyflow/react"

const PROVIDER_ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    Sparkles, Brain, Globe, Image: ImageIcon, Mic, Cpu, Zap,
}

const MODALITY_LABELS: Record<OutputModality, string> = {
    text: "Text",
    image: "Image",
    audio: "Audio",
    video: "Video",
    slides: "Slides",
}

// ─── Provider & Model Selector ──────────────────────────────────────

function ProviderModelSelector({
    nodeId,
    currentProviderId,
    currentModelId,
    currentModality,
    onUpdateProvider,
}: {
    nodeId: string
    currentProviderId?: string
    currentModelId?: string
    currentModality?: OutputModality
    onUpdateProvider: (nodeId: string, providerId: string, modelId: string, modality: string) => void
}) {
    const modality: OutputModality = currentModality ?? "text"
    const providerId = (currentProviderId ?? "openai") as AIProviderId
    // Slides use text providers
    const lookupModality = modality === "slides" ? "text" : modality
    const availableProviders = getProvidersForModality(lookupModality)
    const availableModels = getModelsForModality(providerId, lookupModality)
    const modelId = currentModelId ?? getDefaultModel(providerId, lookupModality)?.id ?? ""

    const handleModalityChange = (newModality: OutputModality) => {
        // Slides use text providers
        const lookupModality = newModality === "slides" ? "text" : newModality
        const providers = getProvidersForModality(lookupModality)
        const firstProvider = providers[0]
        if (!firstProvider) return
        const defaultModel = getDefaultModel(firstProvider.id, lookupModality)
        onUpdateProvider(nodeId, firstProvider.id, defaultModel?.id ?? "", newModality)
    }

    const handleProviderChange = (newProviderId: string) => {
        const defaultModel = getDefaultModel(newProviderId as AIProviderId, modality)
        onUpdateProvider(nodeId, newProviderId, defaultModel?.id ?? "", modality)
    }

    const handleModelChange = (newModelId: string) => {
        onUpdateProvider(nodeId, providerId, newModelId, modality)
    }

    const providerMeta = PROVIDER_REGISTRY[providerId]
    const ProviderIcon = PROVIDER_ICON_MAP[providerMeta?.icon ?? "Sparkles"] ?? Sparkles

    return (
        <div className="space-y-2.5">
            <label className="text-xs font-semibold text-foreground">Provider</label>

            {/* Modality pills */}
            <div className="flex gap-1 flex-wrap">
                {OUTPUT_MODALITIES.map((m) => {
                    // Slides use text providers, so always show if text providers exist
                    const providers = m === "slides" ? getProvidersForModality("text") : getProvidersForModality(m)
                    if (providers.length === 0) return null
                    return (
                        <button
                            key={m}
                            onClick={() => handleModalityChange(m)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                modality === m
                                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                                    : "bg-muted text-muted-foreground hover:bg-muted border border-transparent"
                            }`}
                        >
                            {MODALITY_LABELS[m]}
                        </button>
                    )
                })}
            </div>

            {/* Provider + Model selectors side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Provider</label>
                    <select
                        value={providerId}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                    >
                        {availableProviders.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Model</label>
                    <select
                        value={modelId}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                    >
                        {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Active provider badge */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted border">
                <ProviderIcon className="h-3.5 w-3.5" style={{ color: providerMeta?.color }} />
                <span className="text-[10px] text-muted-foreground">
                    {providerMeta?.name} · {availableModels.find(m => m.id === modelId)?.name ?? modelId}
                </span>
            </div>
        </div>
    )
}

// ─── Video Configuration Panel ──────────────────────────────────────

/**
 * VideoConfigPanel — shown when a node's output modality is "video".
 * Exposes duration, resolution, and prompt optimizer settings.
 */
function VideoConfigPanel({
    nodeId,
    videoConfig,
    onUpdateVideoConfig,
}: {
    nodeId: string
    videoConfig?: { duration?: number; resolution?: string; promptOptimizer?: boolean }
    onUpdateVideoConfig: (nodeId: string, config: { duration?: number; resolution?: string; promptOptimizer?: boolean }) => void
}) {
    const config = videoConfig ?? { duration: 6, resolution: "1080P", promptOptimizer: true }

    return (
        <div className="space-y-2.5">
            <label className="text-xs font-semibold text-foreground">Video Settings</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Duration</label>
                    <select
                        value={config.duration ?? 6}
                        onChange={(e) => onUpdateVideoConfig(nodeId, { ...config, duration: Number(e.target.value) })}
                        className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                    >
                        <option value={5}>5 seconds</option>
                        <option value={6}>6 seconds</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Resolution</label>
                    <select
                        value={config.resolution ?? "1080P"}
                        onChange={(e) => onUpdateVideoConfig(nodeId, { ...config, resolution: e.target.value })}
                        className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                    >
                        <option value="720P">720p</option>
                        <option value="1080P">1080p</option>
                    </select>
                </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={config.promptOptimizer !== false}
                    onChange={(e) => onUpdateVideoConfig(nodeId, { ...config, promptOptimizer: e.target.checked })}
                    className="rounded border-muted-foreground/40"
                />
                <span className="text-[10px] text-muted-foreground">
                    Prompt optimizer (MiniMax enhances your prompt for better results)
                </span>
            </label>
        </div>
    )
}

// ─── Media Output Display ───────────────────────────────────────────

function MediaOutput({ data }: {
    data: {
        imageUrl?: string
        audioUrl?: string
        videoUrl?: string
        outputModality?: string
        output?: string
    }
}) {
    const [downloading, setDownloading] = useState(false)
    if (data.imageUrl) {
        return (
            <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Generated Image</label>
                <div className="rounded-lg overflow-hidden border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={data.imageUrl}
                        alt="Generated image"
                        className="w-full h-auto"
                    />
                </div>
                <div className="flex gap-2">
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
                        Download
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-7"
                        onClick={() => navigator.clipboard.writeText(data.imageUrl!)}
                    >
                        Copy URL
                    </Button>
                </div>
            </div>
        )
    }

    if (data.audioUrl) {
        return (
            <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Generated Audio</label>
                <audio controls className="w-full" src={data.audioUrl}>
                    <track kind="captions" />
                </audio>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7"
                    onClick={() => {
                        const a = document.createElement("a")
                        a.href = data.audioUrl!
                        a.download = `generated-${Date.now()}.mp3`
                        a.click()
                    }}
                >
                    Download Audio
                </Button>
            </div>
        )
    }

    if (data.videoUrl) {
        return (
            <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Generated Video</label>
                <div className="rounded-lg overflow-hidden border bg-black">
                    <video controls className="w-full" src={data.videoUrl}>
                        <track kind="captions" />
                    </video>
                </div>
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
                    Download Video
                </Button>
            </div>
        )
    }

    // Slide deck output
    if (data.outputModality === "slides" && data.output) {
        const deck = parseSlideDeckFromText(data.output)
        if (deck) {
            return (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Generated Slide Deck</label>
                    <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                        <p className="text-sm font-medium text-foreground">{deck.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{deck.slides.length} slides</p>
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {deck.slides.map((s, i) => (
                                <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded bg-white border border-orange-200 flex items-center justify-center text-[8px] font-medium flex-shrink-0">
                                        {i + 1}
                                    </span>
                                    <span className="truncate">{s.title}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-7 gap-1"
                        disabled={downloading}
                        onClick={async () => {
                            setDownloading(true)
                            try {
                                // Dynamic import to avoid bundling pptxgenjs (node:https/fs) at compile time
                                const { downloadSlideDeck } = await import("@/lib/ai-providers/slide-renderer")
                                await downloadSlideDeck(deck)
                            } catch (err) {
                                console.error("Failed to generate PPTX:", err)
                            }
                            setDownloading(false)
                        }}
                    >
                        {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {downloading ? "Generating..." : "Download PPTX"}
                    </Button>
                </div>
            )
        }
    }

    return null
}

interface NodeInspectorProps {
    node: Node
    onClose: () => void
    onUpdatePrompt: (nodeId: string, newPrompt: string) => void
    onUpdateInput: (nodeId: string, input: string) => void
    onUpdateOutput: (nodeId: string, output: string) => void
    onUpdateFiles: (nodeId: string, files: AttachedFile[]) => void
    onUpdateProvider: (nodeId: string, providerId: string, modelId: string, modality: string) => void
    onUpdateChecklist?: (nodeId: string, completed: boolean[]) => void
    onUpdateVideoConfig?: (nodeId: string, config: { duration?: number; resolution?: string; promptOptimizer?: boolean }) => void
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
    onUpdateProvider,
    onUpdateChecklist,
    onUpdateVideoConfig,
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
        providerId?: string
        modelId?: string
        outputModality?: string
        imageUrl?: string
        audioUrl?: string
        videoUrl?: string
        videoConfig?: { duration?: number; resolution?: string; promptOptimizer?: boolean }
        // Human-task fields
        isHumanTask?: boolean
        guidance?: string
        checklist?: string[]
        checklistCompleted?: boolean[]
    }

    // Human-task nodes get a completely different inspector
    const isHumanTask = node.type === "human-task" || data.isHumanTask

    if (isHumanTask) {
        return (
            <HumanTaskInspector
                node={node}
                data={data}
                onClose={onClose}
                onDelete={onDelete}
                onApproveNode={onApproveNode}
                onApproveAndContinue={onApproveAndContinue}
                onUpdateChecklist={onUpdateChecklist}
            />
        )
    }

    // Resolve prompt template metadata from the built-in library.
    // Custom prompts have their data embedded directly on the node.
    const prompt = data.promptId
        ? getPromptById(data.promptId)
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
    const [isEditingOutput, setIsEditingOutput] = useState(false)
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
        <div className="w-96 border-l bg-background flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color }}>
                        {meta?.label ?? "Brief"}
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground"
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
                            {data.label || "Brief"}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-0.5">
                                    Input
                                </p>
                                <p className="text-[11px] text-blue-700">
                                    {prompt.inputLabel}
                                </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-status-success-light border border-status-success/20">
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
                                    This data replaces <code className="bg-muted px-1 rounded text-[10px]">{"{{input}}"}</code> in the prompt. For chained nodes, the previous node&apos;s output is used if no manual input is provided.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ─── Provider & Model Selector ───────────────────────── */}
                    <ProviderModelSelector
                        nodeId={node.id}
                        currentProviderId={data.providerId}
                        currentModelId={data.modelId}
                        currentModality={data.outputModality as OutputModality | undefined}
                        onUpdateProvider={onUpdateProvider}
                    />

                    {/* ─── Video Config (when video modality is selected) ──── */}
                    {data.outputModality === "video" && onUpdateVideoConfig && (
                        <VideoConfigPanel
                            nodeId={node.id}
                            videoConfig={data.videoConfig}
                            onUpdateVideoConfig={onUpdateVideoConfig}
                        />
                    )}

                    {/* ─── Prompt Text Section ─────────────────────────────── */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-foreground">
                                Brief
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
                            placeholder="Enter your brief..."
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            Use <code className="bg-muted px-1 rounded text-[10px]">{"{{input}}"}</code> to reference the input data or previous step&apos;s output.
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
                                    Output
                                </label>
                                {status === "running" && (
                                    <span className="ml-auto text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full animate-pulse">
                                        Generating...
                                    </span>
                                )}
                                {status === "review" && (
                                    <span className="ml-auto text-[10px] text-status-warning bg-status-warning-light px-1.5 py-0.5 rounded-full">
                                        Needs review
                                    </span>
                                )}
                            </button>

                            {outputExpanded && (
                                <div className="space-y-2">
                                    {data.error && (
                                        <div className="p-2.5 rounded-lg bg-status-error-light border border-destructive/20">
                                            <p className="text-[11px] text-red-700">{data.error}</p>
                                        </div>
                                    )}

                                    {/* Output: rendered markdown by default, editable textarea on toggle */}
                                    {status === "running" || isEditingOutput ? (
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
                                    ) : data.output ? (
                                        <div className={`rounded-lg border p-3 max-h-[400px] overflow-y-auto text-xs leading-relaxed ${
                                            isReview ? "border-amber-200 bg-amber-50/30" : "bg-muted/30"
                                        }`}>
                                            <Markdown content={data.output} className="text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:bg-muted [&_th]:font-semibold" />
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic p-3">
                                            Output will appear here...
                                        </p>
                                    )}

                                    {isReview && (
                                        <p className="text-[10px] text-status-warning">
                                            Review the output above. You can edit it before approving. This output will feed into the next connected node.
                                        </p>
                                    )}

                                    {data.output && status !== "running" && (
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsEditingOutput(!isEditingOutput)}
                                                className="h-6 px-2 text-[10px] gap-1"
                                            >
                                                {isEditingOutput ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                                                {isEditingOutput ? "Preview" : "Edit"}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCopyOutput}
                                                className="h-6 px-2 text-[10px] gap-1"
                                            >
                                                {copiedOutput ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                {copiedOutput ? "Copied" : "Copy output"}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 text-[10px] gap-1"
                                                    >
                                                        <Download className="w-3 h-3" />
                                                        Export
                                                        <ChevronDown className="w-3 h-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            const md = generateNodeMarkdown(
                                                                data.label ?? "Step",
                                                                data.userInput,
                                                                data.output
                                                            )
                                                            const safeName = (data.label || "step")
                                                                .toLowerCase()
                                                                .replace(/[^a-z0-9]+/g, "-")
                                                                .replace(/^-|-$/g, "")
                                                            downloadAsFile(md, `${safeName}-output.md`)
                                                        }}
                                                        className="text-xs gap-2"
                                                    >
                                                        Markdown (.md)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={async () => {
                                                            const { exportAsPDF } = await import("@/lib/export-utils")
                                                            const md = generateNodeMarkdown(
                                                                data.label ?? "Step",
                                                                data.userInput,
                                                                data.output
                                                            )
                                                            const safeName = (data.label || "step")
                                                                .toLowerCase()
                                                                .replace(/[^a-z0-9]+/g, "-")
                                                                .replace(/^-|-$/g, "")
                                                            await exportAsPDF(md, `${safeName}-output.pdf`)
                                                        }}
                                                        className="text-xs gap-2"
                                                    >
                                                        PDF (.pdf)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={async () => {
                                                            const { exportAsDOCX } = await import("@/lib/export-utils")
                                                            const md = generateNodeMarkdown(
                                                                data.label ?? "Step",
                                                                data.userInput,
                                                                data.output
                                                            )
                                                            const safeName = (data.label || "step")
                                                                .toLowerCase()
                                                                .replace(/[^a-z0-9]+/g, "-")
                                                                .replace(/^-|-$/g, "")
                                                            await exportAsDOCX(md, `${safeName}-output.docx`)
                                                        }}
                                                        className="text-xs gap-2"
                                                    >
                                                        Word (.docx)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            const json = JSON.stringify({
                                                                title: data.label ?? "Step",
                                                                promptId: data.promptId,
                                                                input: data.userInput || null,
                                                                output: data.output,
                                                            }, null, 2)
                                                            navigator.clipboard.writeText(json)
                                                        }}
                                                        className="text-xs gap-2"
                                                    >
                                                        <Braces className="w-3 h-3" />
                                                        Copy as JSON
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            // Gamma accepts markdown content via URL
                                                            const content = data.output || ""
                                                            const title = data.label || "ForgeOS Output"
                                                            const gammaUrl = `https://gamma.app/generate?text=${encodeURIComponent(content.slice(0, 8000))}&title=${encodeURIComponent(title)}`
                                                            window.open(gammaUrl, "_blank", "noopener,noreferrer")
                                                        }}
                                                        className="text-xs gap-2"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Open in Gamma
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── Media Output (image/audio/video/slides) ─────── */}
                    {(data.imageUrl || data.audioUrl || data.videoUrl || (data.outputModality === "slides" && data.output)) && (
                        <MediaOutput data={data} />
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
                                        className="px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground"
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
                                            className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs"
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
            <div className="p-4 border-t space-y-2">
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
                        Run Brief
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
                            <Copy className="w-4 h-4" /> Copy Brief
                        </>
                    )}
                </Button>

                {/* Turn output into an objective or task */}
                {data.output && status !== "running" && (
                    <ActOnThisButton
                        context={{
                            source: 'agents',
                            entityTitle: data.label || 'Specialist Output',
                            entityDescription: data.output.slice(0, 500),
                        }}
                        variant="subtle"
                        label="Turn into objective or task"
                        className="w-full"
                    />
                )}

                <Button
                    onClick={() => onDelete(node.id)}
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="w-4 h-4" /> Remove from project
                </Button>
            </div>
        </div>
    )
}

// ─── Human-Task Inspector ────────────────────────────────────────────

/**
 * Inspector panel for human-task nodes.
 *
 * @description Shows task guidance, an interactive checklist, and a
 * "Mark Complete" button. No prompt editor, provider selector, or
 * output area — this is purely a person's checkpoint.
 */
function HumanTaskInspector({
    node,
    data,
    onClose,
    onDelete,
    onApproveNode,
    onApproveAndContinue,
    onUpdateChecklist,
}: {
    node: Node
    data: {
        label?: string
        description?: string
        guidance?: string
        checklist?: string[]
        checklistCompleted?: boolean[]
        executionStatus?: ExecutionStatus
    }
    onClose: () => void
    onDelete: (nodeId: string) => void
    onApproveNode: (nodeId: string) => void
    onApproveAndContinue: (nodeId: string) => void
    onUpdateChecklist?: (nodeId: string, completed: boolean[]) => void
}) {
    const status = data.executionStatus ?? "idle"
    const checklist = data.checklist ?? []
    const [completed, setCompleted] = useState<boolean[]>(
        data.checklistCompleted ?? new Array(checklist.length).fill(false)
    )

    // Sync when node changes
    useEffect(() => {
        setCompleted(data.checklistCompleted ?? new Array(checklist.length).fill(false))
    }, [node.id, data.checklistCompleted, checklist.length])

    const toggleItem = useCallback((index: number) => {
        setCompleted(prev => {
            const next = [...prev]
            next[index] = !next[index]
            onUpdateChecklist?.(node.id, next)
            return next
        })
    }, [node.id, onUpdateChecklist])

    const allDone = checklist.length === 0 || completed.every(Boolean)
    const isReview = status === "review"
    const isDone = status === "approved"

    return (
        <div className="w-96 border-l bg-background flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-blue-600">
                        People
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50">
                        <UserCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            {data.label || "Team Step"}
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
                    {/* Guidance */}
                    {data.guidance && (
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">
                                What to do
                            </p>
                            <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-line">
                                {data.guidance}
                            </p>
                        </div>
                    )}

                    {/* Checklist */}
                    {checklist.length > 0 && (
                        <div>
                            <label className="text-xs font-semibold text-foreground mb-2 block">
                                Checklist
                            </label>
                            <div className="space-y-1.5">
                                {checklist.map((item, i) => (
                                    <button
                                        key={i}
                                        onClick={() => toggleItem(i)}
                                        className={`flex items-start gap-2.5 w-full text-left p-2 rounded-lg transition-colors ${
                                            completed[i]
                                                ? "bg-status-success-light border border-status-success/20"
                                                : "bg-muted border hover:bg-muted"
                                        }`}
                                    >
                                        {completed[i] ? (
                                            <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        ) : (
                                            <Square className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                        )}
                                        <span className={`text-xs leading-relaxed ${
                                            completed[i] ? "text-emerald-700 line-through" : "text-foreground"
                                        }`}>
                                            {item}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                {completed.filter(Boolean).length} of {checklist.length} completed
                            </p>
                        </div>
                    )}

                    {/* Data flow hint — helps users understand what happens next */}
                    {!isDone && (
                        <div className="p-3 rounded-lg bg-status-warning-light/60 border border-status-warning/20">
                            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">
                                What happens next
                            </p>
                            <ul className="space-y-1.5 text-xs text-amber-800 leading-relaxed">
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>Complete the checklist, then <strong>Mark Complete</strong> to continue the workflow</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>The next AI step will run automatically using outputs from previous steps</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>To add your own data or notes, open the next step and paste into its <strong>Input Data</strong> field before running</span>
                                </li>
                            </ul>
                        </div>
                    )}

                    {/* Done state */}
                    {isDone && (
                        <div className="p-3 rounded-lg bg-status-success-light border border-status-success/20 text-center">
                            <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                            <p className="text-xs font-medium text-emerald-700">Step completed</p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer actions */}
            <div className="p-4 border-t space-y-2">
                {isReview && (
                    <div className="space-y-2 mb-2">
                        <Button
                            onClick={() => onApproveAndContinue(node.id)}
                            className="w-full gap-2 text-xs"
                            style={{ backgroundColor: "#059669" }}
                            disabled={!allDone && checklist.length > 0}
                        >
                            <ArrowRight className="w-4 h-4" />
                            {checklist.length > 0 && !allDone
                                ? "Complete checklist first"
                                : "Mark Complete & Continue"}
                        </Button>
                        <Button
                            onClick={() => onApproveNode(node.id)}
                            variant="outline"
                            className="w-full gap-1.5 text-xs"
                            disabled={!allDone && checklist.length > 0}
                        >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Mark Complete & Stop
                        </Button>
                    </div>
                )}

                {!isReview && !isDone && (
                    <Button
                        onClick={() => onApproveAndContinue(node.id)}
                        className="w-full gap-2"
                        style={{ backgroundColor: "#3b82f6" }}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Mark Complete
                    </Button>
                )}

                <Button
                    onClick={() => onDelete(node.id)}
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="w-4 h-4" /> Remove from project
                </Button>
            </div>
        </div>
    )
}
