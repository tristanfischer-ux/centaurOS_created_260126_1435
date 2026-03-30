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
    "manufacturing",
    "chief-of-staff",
    "technology",
    "engineering",
    "supply-chain",
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
        icon: "PoundSterling",
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
    manufacturing: {
        id: "manufacturing",
        label: "Manufacturing & Materials",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-300",
        icon: "Factory",
    },
    "chief-of-staff": {
        id: "chief-of-staff",
        label: "Chief of Staff",
        color: "text-amber-700",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-400",
        icon: "Crown",
    },
    technology: {
        id: "technology",
        label: "Technology & Architecture",
        color: "text-violet-600",
        bgColor: "bg-violet-50",
        borderColor: "border-violet-300",
        icon: "Cpu",
    },
    engineering: {
        id: "engineering",
        label: "Engineering & Velocity",
        color: "text-sky-600",
        bgColor: "bg-sky-50",
        borderColor: "border-sky-300",
        icon: "Code2",
    },
    "supply-chain": {
        id: "supply-chain",
        label: "Supply Chain & Procurement",
        color: "text-teal-600",
        bgColor: "bg-teal-50",
        borderColor: "border-teal-300",
        icon: "Route",
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
    manufacturing: "#ea580c",
    "chief-of-staff": "#b45309",
    technology: "#7c3aed",
    engineering: "#0284c7",
    "supply-chain": "#0d9488",
}

// ─── Execution States (HITL pattern) ─────────────────────────────────
export type ExecutionStatus = "idle" | "running" | "review" | "approved" | "error"

// ─── Attached Files ──────────────────────────────────────────────────
export interface AttachedFile {
    name: string
    content: string // text or base64-encoded content
    type: string // MIME type
    size: number // bytes
    encoding?: "text" | "base64" // defaults to "text" for backwards compatibility
}

// ─── Prompt Template ─────────────────────────────────────────────────
// Template variables:
//   {{input}}            - User-provided input text (required)
//   {{company_context}}  - Auto-populated from user's foundry profile (optional)
//                          Format: [Company Context: Company: X | Industry: Y | Stage: Z | Purpose: ...]
//                          Empty string if no foundry data is available
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
    /** Bullet-point guidance on what information to include in the input */
    inputHint?: string
    /** A concrete example of good input to show users what to write */
    exampleInput?: string
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
    modelId?: string      // e.g. "claude-opus-4-6", "gemini-3-pro-image-preview", "gpt-5.4"
    outputModality?: string // "text" | "image" | "audio" | "video" | "slides"
    imageUrl?: string     // for image outputs
    audioUrl?: string     // for audio outputs
    videoUrl?: string     // for video outputs
    // Video generation configuration (only used when outputModality is "video")
    videoConfig?: {
        duration?: number       // 5 or 6 seconds
        resolution?: string     // "720P" or "1080P"
        promptOptimizer?: boolean
    }
    // Human-task specific fields (only used when node type is "human-task")
    isHumanTask?: boolean
    guidance?: string            // Detailed guidance for the person completing this step
    checklist?: string[]         // Checklist items the person should complete
    checklistCompleted?: boolean[] // Tracks which checklist items are done
}

// ─── Workflow Node Types ────────────────────────────────────────────
export type WorkflowNodeType = "prompt" | "trigger" | "output" | "human-task"

// ─── Workflow Types ──────────────────────────────────────────────────
export interface WorkflowNode {
    id: string
    type: WorkflowNodeType
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
    category: "startup" | "business" | "manufacturing"
    icon: string
    nodeCount: number
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    /** Persuasive copy explaining why this workflow matters — shown in the intro dialog */
    whyItMatters: string
    /** Estimated time to complete the full workflow (e.g. "2-4 hours") */
    estimatedTime?: string
}
