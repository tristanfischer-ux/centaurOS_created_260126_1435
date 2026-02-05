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

// ─── Workflow Types ──────────────────────────────────────────────────
export interface WorkflowNode {
    id: string
    type: "prompt" | "trigger" | "output"
    position: { x: number; y: number }
    data: {
        promptId?: string
        label: string
        description?: string
        category?: PromptCategory
        icon?: string
        customPrompt?: string
        triggerType?: string
    }
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
