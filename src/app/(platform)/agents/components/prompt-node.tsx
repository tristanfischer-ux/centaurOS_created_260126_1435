"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CATEGORY_ACCENT_COLORS, CATEGORY_META, type PromptCategory, type ExecutionStatus } from "../lib/agent-types"
import {
    Rocket, TrendingUp, Megaphone, PoundSterling, Compass, Package,
    Calculator, Users, Heart, Scale, Palette, BarChart3, Sparkles,
    Target, Layers, UserPlus, CheckCircle, Shield, PieChart, Calendar,
    Map, RefreshCcw, Mail, Presentation, Send, FileText, HelpCircle,
    FolderOpen, ListChecks, FileSearch, ClipboardCheck, PartyPopper,
    Share2, Search, GitBranch, Newspaper, ShoppingBag, Layout, Video,
    MessageSquare, Monitor, Filter, Grid3x3, AlertTriangle, ListOrdered,
    Code, UserCircle, Columns, Bug, Wallet, Banknote, Receipt, Settings,
    AlertCircle, ShoppingCart, Briefcase, Star, BookOpen, RotateCcw,
    LogOut, Inbox, Activity, ThumbsUp, Lock, ScrollText, Image, Type,
    Film, Camera, Play, Database, LayoutDashboard, ClipboardList,
    Swords, MessageCircle, Clock, LayoutGrid, ImageIcon,
    Loader2, Check, AlertOctagon, Eye, Paperclip, UserCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/** Map icon names to lucide components */
const ICON_MAP: Record<string, LucideIcon> = {
    Rocket, TrendingUp, Megaphone, PoundSterling, Compass, Package,
    Calculator, Users, Heart, Scale, Palette, BarChart3, Sparkles,
    Target, Layers, UserPlus, CheckCircle, Shield, PieChart, Calendar,
    Map, RefreshCcw, Mail, Presentation, Send, FileText, HelpCircle,
    FolderOpen, ListChecks, FileSearch, ClipboardCheck, PartyPopper,
    Share2, Search, GitBranch, Newspaper, ShoppingBag, Layout, Video,
    MessageSquare, Monitor, Filter, Grid3x3, AlertTriangle, ListOrdered,
    Code, UserCircle, Columns, Bug, Wallet, Banknote, Receipt, Settings,
    AlertCircle, ShoppingCart, Briefcase, Star, BookOpen, RotateCcw,
    LogOut, Inbox, Activity, ThumbsUp, Lock, ScrollText, Image, Type,
    Film, Camera, Play, Database, LayoutDashboard, ClipboardList,
    Swords, MessageCircle, Clock, LayoutGrid, ImageIcon,
}

export function getIcon(name: string): LucideIcon {
    return ICON_MAP[name] ?? Sparkles
}

// ─── Status configuration ────────────────────────────────────────────
const STATUS_CONFIG: Record<ExecutionStatus, {
    border: string
    badge: string
    badgeBg: string
    badgeText: string
    icon: LucideIcon
    animate?: string
}> = {
    idle: { border: "", badge: "", badgeBg: "", badgeText: "", icon: Sparkles },
    running: {
        border: "ring-2 ring-blue-400/60",
        badge: "Running",
        badgeBg: "bg-blue-100",
        badgeText: "text-blue-700",
        icon: Loader2,
        animate: "animate-pulse",
    },
    review: {
        border: "ring-2 ring-amber-400/60",
        badge: "Review",
        badgeBg: "bg-amber-100",
        badgeText: "text-amber-700",
        icon: Eye,
    },
    approved: {
        border: "ring-2 ring-emerald-400/60",
        badge: "Approved",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-700",
        icon: Check,
    },
    error: {
        border: "ring-2 ring-red-400/60",
        badge: "Error",
        badgeBg: "bg-red-100",
        badgeText: "text-red-700",
        icon: AlertOctagon,
    },
}

interface PromptNodeData {
    label?: string
    description?: string
    category?: PromptCategory
    icon?: string
    userInput?: string
    output?: string
    executionStatus?: ExecutionStatus
    attachedFiles?: { name: string }[]
    providerId?: string
    modelId?: string
    outputModality?: string
    imageUrl?: string
    audioUrl?: string
    videoUrl?: string
    [key: string]: unknown
}

const MODALITY_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
    text: { icon: FileText, color: "#3b82f6" },
    image: { icon: Image, color: "#a855f7" },
    audio: { icon: Play, color: "#000000" },
    video: { icon: Video, color: "#ef4444" },
}

const PROVIDER_LABELS: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Claude",
    google: "Gemini",
    stability: "SDXL",
    elevenlabs: "ElevenLabs",
    replicate: "Replicate",
}

function PromptNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as PromptNodeData
    const category = nodeData.category ?? "startup-strategy"
    const accentColor = CATEGORY_ACCENT_COLORS[category] ?? "#94a3b8"
    const meta = CATEGORY_META[category]
    const Icon = getIcon(nodeData.icon ?? "Sparkles")

    const status = nodeData.executionStatus ?? "idle"
    const statusCfg = STATUS_CONFIG[status]
    const hasInput = !!(nodeData.userInput?.trim())
    const hasFiles = !!(nodeData.attachedFiles && nodeData.attachedFiles.length > 0)
    const hasOutput = !!(nodeData.output?.trim())

    return (
        <div
            className={`
                group relative bg-background rounded-xl border-2 shadow-sm
                transition-all duration-200 w-[260px]
                hover:shadow-md hover:-translate-y-0.5
                ${selected ? "shadow-lg ring-2 ring-blue-400/50 -translate-y-0.5" : "border-border"}
                ${!selected && statusCfg.border ? statusCfg.border : ""}
                ${statusCfg.animate ?? ""}
            `}
            style={{
                borderLeftColor: accentColor,
                borderLeftWidth: "4px",
            }}
        >
            {/* Input handle */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white !-top-1.5"
            />

            <div className="p-3">
                {/* Header */}
                <div className="flex items-start gap-2.5">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${accentColor}15` }}
                    >
                        <Icon
                            className="w-4 h-4"
                            style={{ color: accentColor }}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {nodeData.label || "Prompt"}
                        </p>
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: accentColor }}>
                            {meta?.label ?? category}
                        </p>
                    </div>
                </div>

                {/* Description */}
                {nodeData.description && (
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                        {nodeData.description}
                    </p>
                )}

                {/* Status indicators row */}
                {(status !== "idle" || hasInput || hasFiles || hasOutput) && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {/* Execution status badge */}
                        {status !== "idle" && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
                                {status === "running" ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                    <statusCfg.icon className="w-2.5 h-2.5" />
                                )}
                                {statusCfg.badge}
                            </span>
                        )}

                        {/* Has input indicator */}
                        {hasInput && status === "idle" && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-blue-50 text-blue-600">
                                <FileText className="w-2.5 h-2.5" />
                                Has input
                            </span>
                        )}

                        {/* Has files indicator */}
                        {hasFiles && status === "idle" && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-muted text-muted-foreground">
                                <Paperclip className="w-2.5 h-2.5" />
                                {nodeData.attachedFiles!.length}
                            </span>
                        )}

                        {/* Has output indicator */}
                        {hasOutput && status === "idle" && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-50 text-emerald-600">
                                <Check className="w-2.5 h-2.5" />
                                Output
                            </span>
                        )}
                    </div>
                )}

                {/* Provider / modality badge */}
                {nodeData.providerId && nodeData.providerId !== "openai" && (
                    <div className="flex items-center gap-1 mt-1.5">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground border">
                            {PROVIDER_LABELS[nodeData.providerId] ?? nodeData.providerId}
                        </span>
                        {nodeData.outputModality && nodeData.outputModality !== "text" && (() => {
                            const modalityCfg = MODALITY_ICONS[nodeData.outputModality!]
                            if (!modalityCfg) return null
                            const ModalityIcon = modalityCfg.icon
                            return (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground border">
                                    <ModalityIcon className="w-2.5 h-2.5" style={{ color: modalityCfg.color }} />
                                    {nodeData.outputModality}
                                </span>
                            )
                        })()}
                    </div>
                )}
                {!nodeData.providerId && nodeData.outputModality && nodeData.outputModality !== "text" && (
                    <div className="flex items-center gap-1 mt-1.5">
                        {(() => {
                            const modalityCfg = MODALITY_ICONS[nodeData.outputModality!]
                            if (!modalityCfg) return null
                            const ModalityIcon = modalityCfg.icon
                            return (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground border">
                                    <ModalityIcon className="w-2.5 h-2.5" style={{ color: modalityCfg.color }} />
                                    {nodeData.outputModality}
                                </span>
                            )
                        })()}
                    </div>
                )}
            </div>

            {/* Output handle */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white !-bottom-1.5"
            />
        </div>
    )
}

export const PromptNode = memo(PromptNodeComponent)

// ─── Human-Task Node ─────────────────────────────────────────────────

/** Human-task accent color — Electric Blue */
const HUMAN_TASK_ACCENT = "#3b82f6"

interface HumanTaskNodeData {
    label?: string
    description?: string
    guidance?: string
    checklist?: string[]
    checklistCompleted?: boolean[]
    executionStatus?: ExecutionStatus
    isHumanTask?: boolean
    [key: string]: unknown
}

/**
 * Visual node for human-in-the-loop steps.
 *
 * @description Renders a distinctive people-focused node with a blue accent,
 * person icon, and "Your turn" badge. These represent steps where a person
 * takes action (briefing, reviewing, deciding) rather than automated generation.
 */
function HumanTaskNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as HumanTaskNodeData
    const status = nodeData.executionStatus ?? "idle"

    const completedCount = (nodeData.checklistCompleted ?? []).filter(Boolean).length
    const totalChecklist = (nodeData.checklist ?? []).length
    const isAllDone = totalChecklist > 0 && completedCount === totalChecklist

    const badgeLabel = status === "approved"
        ? "Done"
        : status === "review"
            ? "Your turn"
            : totalChecklist > 0
                ? `${completedCount}/${totalChecklist}`
                : null

    const badgeBg = status === "approved" ? "bg-emerald-100" : "bg-blue-100"
    const badgeText = status === "approved" ? "text-emerald-700" : "text-blue-700"
    const ringClass = status === "approved"
        ? "ring-2 ring-emerald-400/60"
        : status === "review"
            ? "ring-2 ring-blue-400/60"
            : ""

    return (
        <div
            className={`
                group relative bg-background rounded-xl border-2 shadow-sm
                transition-all duration-200 w-[260px]
                hover:shadow-md hover:-translate-y-0.5
                ${selected ? "shadow-lg ring-2 ring-blue-400/50 -translate-y-0.5" : "border-blue-200"}
                ${!selected && ringClass ? ringClass : ""}
            `}
            style={{
                borderLeftColor: HUMAN_TASK_ACCENT,
                borderLeftWidth: "4px",
            }}
        >
            {/* Input handle */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white !-top-1.5"
            />

            <div className="p-3">
                {/* Header */}
                <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50">
                        {status === "approved" ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                            <UserCheck className="w-4 h-4 text-blue-600" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {nodeData.label || "Team Step"}
                        </p>
                        <p className="text-[10px] font-medium mt-0.5 text-blue-600">
                            People
                        </p>
                    </div>
                </div>

                {/* Guidance text */}
                {nodeData.guidance && (
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                        {nodeData.guidance}
                    </p>
                )}

                {/* Status indicators */}
                {badgeLabel && (
                    <div className="flex items-center gap-1.5 mt-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${badgeBg} ${badgeText}`}>
                            {status === "approved" ? (
                                <Check className="w-2.5 h-2.5" />
                            ) : status === "review" ? (
                                <UserCheck className="w-2.5 h-2.5" />
                            ) : (
                                <ListChecks className="w-2.5 h-2.5" />
                            )}
                            {badgeLabel}
                        </span>
                    </div>
                )}
            </div>

            {/* Output handle */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white !-bottom-1.5"
            />
        </div>
    )
}

export const HumanTaskNode = memo(HumanTaskNodeComponent)
