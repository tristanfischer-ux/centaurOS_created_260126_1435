import type { LucideIcon } from "lucide-react"

// ─── Prompt Categories ───────────────────────────────────────────────
export const PROMPT_CATEGORIES = [
    "startup-strategy",
    "fundraising",
    "marketing",
    "sales",
    "strategy",
    "product",
    "finance",
    "hr",
    "customer-success",
    "legal",
    "creative",
    "data-analytics",
] as const

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]

export interface CategoryMeta {
    id: PromptCategory
    label: string
    color: string
    bgColor: string
    borderColor: string
    icon: string // lucide icon name
}

export const CATEGORY_META: Record<PromptCategory, CategoryMeta> = {
    "startup-strategy": {
        id: "startup-strategy",
        label: "Startup Strategy",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-300",
        icon: "Rocket",
    },
    fundraising: {
        id: "fundraising",
        label: "Fundraising",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-300",
        icon: "TrendingUp",
    },
    marketing: {
        id: "marketing",
        label: "Marketing & Content",
        color: "text-pink-600",
        bgColor: "bg-pink-50",
        borderColor: "border-pink-300",
        icon: "Megaphone",
    },
    sales: {
        id: "sales",
        label: "Sales & Revenue",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-300",
        icon: "DollarSign",
    },
    strategy: {
        id: "strategy",
        label: "Strategy & Planning",
        color: "text-violet-600",
        bgColor: "bg-violet-50",
        borderColor: "border-violet-300",
        icon: "Compass",
    },
    product: {
        id: "product",
        label: "Product & Development",
        color: "text-cyan-600",
        bgColor: "bg-cyan-50",
        borderColor: "border-cyan-300",
        icon: "Package",
    },
    finance: {
        id: "finance",
        label: "Finance & Operations",
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-300",
        icon: "Calculator",
    },
    hr: {
        id: "hr",
        label: "HR & People",
        color: "text-teal-600",
        bgColor: "bg-teal-50",
        borderColor: "border-teal-300",
        icon: "Users",
    },
    "customer-success": {
        id: "customer-success",
        label: "Customer Success",
        color: "text-lime-600",
        bgColor: "bg-lime-50",
        borderColor: "border-lime-300",
        icon: "Heart",
    },
    legal: {
        id: "legal",
        label: "Legal & Compliance",
        color: "text-slate-600",
        bgColor: "bg-slate-50",
        borderColor: "border-slate-300",
        icon: "Scale",
    },
    creative: {
        id: "creative",
        label: "Creative & Design",
        color: "text-fuchsia-600",
        bgColor: "bg-fuchsia-50",
        borderColor: "border-fuchsia-300",
        icon: "Palette",
    },
    "data-analytics": {
        id: "data-analytics",
        label: "Data & Analytics",
        color: "text-indigo-600",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-300",
        icon: "BarChart3",
    },
}

// Color bars for nodes (left accent)
export const CATEGORY_ACCENT_COLORS: Record<PromptCategory, string> = {
    "startup-strategy": "#ea580c",
    fundraising: "#059669",
    marketing: "#db2777",
    sales: "#2563eb",
    strategy: "#7c3aed",
    product: "#0891b2",
    finance: "#d97706",
    hr: "#0d9488",
    "customer-success": "#65a30d",
    legal: "#475569",
    creative: "#c026d3",
    "data-analytics": "#4f46e5",
}

// ─── Execution States (HITL pattern) ─────────────────────────────────
export type ExecutionStatus = "idle" | "running" | "review" | "approved" | "error"

// ─── Attached Files ──────────────────────────────────────────────────
export interface AttachedFile {
    name: string
    content: string // text content read client-side
    type: string // MIME type
    size: number // bytes
}

// ─── Prompt Template ─────────────────────────────────────────────────
export interface PromptTemplate {
    id: string
    title: string
    description: string
    category: PromptCategory
    icon: string // lucide icon name
    defaultPrompt: string
    inputLabel: string
    outputLabel: string
    tags: string[]
    suggestedNext: string[] // IDs of prompts that chain well after this one
}

// ─── Custom Prompt (user-created) ────────────────────────────────────
export interface CustomPrompt extends PromptTemplate {
    isCustom: true
    createdAt: string
    updatedAt: string
}

// ─── Node Data (extends ReactFlow node data) ─────────────────────────
export interface PromptNodeData {
    promptId?: string
    label: string
    description?: string
    category?: PromptCategory
    icon?: string
    customPrompt?: string
    triggerType?: string
    // Input / output / execution
    userInput?: string
    output?: string
    executionStatus?: ExecutionStatus
    error?: string
    attachedFiles?: AttachedFile[]
    // Multi-provider support
    providerId?: string   // e.g. "openai", "anthropic", "google"
    modelId?: string      // e.g. "gpt-4o", "claude-sonnet-4-20250514"
    outputModality?: string // "text" | "image" | "audio" | "video" | "slides"
    imageUrl?: string     // for image outputs
    audioUrl?: string     // for audio outputs
    videoUrl?: string     // for video outputs
}

// ─── Workflow Types ──────────────────────────────────────────────────
export interface WorkflowNode {
    id: string
    type: "prompt" | "trigger" | "output"
    position: { x: number; y: number }
    data: PromptNodeData
}

export interface WorkflowEdge {
    id: string
    source: string
    target: string
    animated?: boolean
}

export interface Workflow {
    id: string
    name: string
    description: string
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    createdAt: string
    updatedAt: string
}

export interface WorkflowTemplate {
    id: string
    name: string
    description: string
    category: "startup" | "business"
    icon: string
    nodeCount: number
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
}
