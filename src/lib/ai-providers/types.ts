// ─── Output Modalities ───────────────────────────────────────────────
export const OUTPUT_MODALITIES = ["text", "image", "audio", "video", "slides"] as const
export type OutputModality = (typeof OUTPUT_MODALITIES)[number]

// ─── Provider IDs ────────────────────────────────────────────────────
export const AI_PROVIDERS = [
    "openai",
    "anthropic",
    "google",
    "qwen",
    "qwen-local",
    "stability",
    "elevenlabs",
    "replicate",
    "minimax",
    "together",
    "deepseek",
] as const
export type AIProviderId = (typeof AI_PROVIDERS)[number]

// ─── Provider Metadata ──────────────────────────────────────────────
export interface AIProviderMeta {
    id: AIProviderId
    name: string
    description: string
    icon: string // lucide icon name
    website: string
    capabilities: OutputModality[]
    models: AIModel[]
    requiresKey: boolean
    // Visual
    color: string
    bgColor: string
}

export interface AIModel {
    id: string
    name: string
    modality: OutputModality
    description: string
    maxTokens?: number
    default?: boolean
}

// ─── Provider Registry (static metadata) ─────────────────────────────
export const PROVIDER_REGISTRY: Record<AIProviderId, AIProviderMeta> = {
    openai: {
        id: "openai",
        name: "OpenAI",
        description: "GPT-4o, GPT Image 1, o3, Whisper, TTS",
        icon: "Sparkles",
        website: "https://platform.openai.com",
        capabilities: ["text", "image", "audio"],
        requiresKey: true,
        color: "#10a37f",
        bgColor: "bg-emerald-50",
        models: [
            { id: "gpt-5.4", name: "GPT-5.4", modality: "text", description: "Latest — 26% fewer hallucinations, 400K context", maxTokens: 400000, default: true },
            { id: "gpt-4.1", name: "GPT-4.1", modality: "text", description: "Improved coding and instruction following", maxTokens: 128000 },
            { id: "o3", name: "o3", modality: "text", description: "Advanced reasoning model", maxTokens: 200000 },
            { id: "gpt-image-1", name: "GPT Image 1", modality: "image", description: "Image generation with text rendering", default: true },
            { id: "gpt-4o-mini-tts", name: "GPT TTS", modality: "audio", description: "Text to speech — 13 voices, low error rate", default: true },
        ],
    },
    anthropic: {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude Opus 4.6, Claude Sonnet 4.5, Claude Haiku 4.5",
        icon: "Brain",
        website: "https://console.anthropic.com",
        capabilities: ["text"],
        requiresKey: true,
        color: "#d4a574",
        bgColor: "bg-amber-50",
        models: [
            { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", modality: "text", description: "Recommended — best balance of cost and quality", maxTokens: 1000000, default: true },
            { id: "claude-opus-4-6", name: "Claude Opus 4.6", modality: "text", description: "Most intelligent — best for strategy, analysis, and complex reasoning", maxTokens: 1000000 },
            { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", modality: "text", description: "Fastest with near-frontier intelligence", maxTokens: 200000 },
        ],
    },
    google: {
        id: "google",
        name: "Google",
        description: "Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3 Pro Image",
        icon: "Globe",
        website: "https://aistudio.google.com",
        capabilities: ["text", "image"],
        requiresKey: true,
        color: "#4285f4",
        bgColor: "bg-blue-50",
        models: [
            { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", modality: "text", description: "Most intelligent — advanced reasoning and agentic workflows", maxTokens: 1048576 },
            { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", modality: "text", description: "Fastest, most cost-efficient Gemini 3 model", maxTokens: 1048576, default: true },
            { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", modality: "image", description: "Advanced image generation with text rendering", default: true },
        ],
    },
    qwen: {
        id: "qwen",
        name: "Qwen (Alibaba)",
        description: "Qwen3.5-plus — open-source frontier MoE, 201 languages",
        icon: "Flame",
        website: "https://www.alibabacloud.com/en/solutions/generative-ai/qwen",
        capabilities: ["text"],
        requiresKey: true,
        color: "#ff6a00",
        bgColor: "bg-orange-50",
        models: [
            {
                id: "qwen3.5-plus",
                name: "Qwen3.5-plus",
                modality: "text",
                description: "Frontier MoE — 397B params, 17B active. Frontier-class performance. Up to 8× faster inference via Multi-Token Prediction.",
                maxTokens: 131072,
                default: true,
            },
            {
                id: "qwen3-235b-a22b",
                name: "Qwen3 235B-A22B",
                modality: "text",
                description: "Hybrid thinking MoE — 235B params, 22B active. Strong reasoning with thinking mode.",
                maxTokens: 131072,
            },
            {
                id: "qwen3-32b",
                name: "Qwen3 32B",
                modality: "text",
                description: "Dense 32B model — excellent reasoning, fully open-weight under Apache 2.0.",
                maxTokens: 131072,
            },
            {
                id: "qwen-turbo-latest",
                name: "Qwen Turbo",
                modality: "text",
                description: "Fastest Qwen model — optimised for speed and cost at scale.",
                maxTokens: 131072,
            },
        ],
    },
    "qwen-local": {
        id: "qwen-local",
        name: "Qwen Local (Ollama)",
        description: "Self-hosted Qwen3 via Ollama — zero cost, full privacy",
        icon: "HardDrive",
        website: "https://ollama.com/library/qwen3",
        capabilities: ["text"],
        requiresKey: false,
        color: "#22c55e",
        bgColor: "bg-green-50",
        models: [
            {
                id: "qwen3:30b-a3b",
                name: "Qwen3 30B-A3B",
                modality: "text",
                description: "MoE, only 3B active — blazing fast on Mac Studio. Best value for specialist agents.",
                maxTokens: 131072,
                default: true,
            },
            {
                id: "qwen3:32b",
                name: "Qwen3 32B",
                modality: "text",
                description: "Dense model — strongest local reasoning. Needs 20GB+ VRAM.",
                maxTokens: 131072,
            },
            {
                id: "qwen3:8b",
                name: "Qwen3 8B",
                modality: "text",
                description: "Lightweight and fast — good for quick tasks and code generation.",
                maxTokens: 131072,
            },
            {
                id: "qwen3:235b-a22b",
                name: "Qwen3 235B-A22B",
                modality: "text",
                description: "Full open-weight MoE — frontier quality, requires 192GB+ unified memory.",
                maxTokens: 131072,
            },
        ],
    },
    stability: {
        id: "stability",
        name: "Stability AI",
        description: "Stable Diffusion, SDXL",
        icon: "Image",
        website: "https://platform.stability.ai",
        capabilities: ["image"],
        requiresKey: true,
        color: "#a855f7",
        bgColor: "bg-purple-50",
        models: [
            { id: "stable-image-ultra", name: "Stable Image Ultra", modality: "image", description: "Flagship image generation (SD 3.5)", default: true },
        ],
    },
    elevenlabs: {
        id: "elevenlabs",
        name: "ElevenLabs",
        description: "Voice synthesis and cloning",
        icon: "Mic",
        website: "https://elevenlabs.io",
        capabilities: ["audio"],
        requiresKey: true,
        color: "#000000",
        bgColor: "bg-slate-50",
        models: [
            { id: "eleven_v3", name: "Eleven v3", modality: "audio", description: "70+ languages, audio tags, multi-speaker", default: true },
        ],
    },
    replicate: {
        id: "replicate",
        name: "Replicate",
        description: "Open-source models (Flux, video, audio)",
        icon: "Cpu",
        website: "https://replicate.com",
        capabilities: ["image", "video", "audio"],
        requiresKey: true,
        color: "#0081F1",
        bgColor: "bg-sky-50",
        models: [
            { id: "black-forest-labs/flux-2-pro", name: "Flux 2 Pro", modality: "image", description: "High quality image generation with typography", default: true },
            { id: "minimax/video-01", name: "MiniMax Video-01", modality: "video", description: "Text-to-video generation", default: true },
        ],
    },
    minimax: {
        id: "minimax",
        name: "MiniMax",
        description: "M2.7 text, Hailuo video, speech, image — high value multi-modal",
        icon: "Zap",
        website: "https://platform.minimax.io",
        capabilities: ["text", "image", "audio", "video"],
        requiresKey: true,
        color: "#7c3aed",
        bgColor: "bg-violet-50",
        models: [
            // Text models — OpenAI-compatible API at api.minimax.io/v1
            { id: "MiniMax-M2.7", name: "MiniMax M2.7", modality: "text", description: "SWE-Pro 56.2%, GDPval-AA ELO 1495 — newest flagship", maxTokens: 204800, default: true },
            { id: "MiniMax-M2.5", name: "MiniMax M2.5", modality: "text", description: "Previous flagship, strong all-round performance", maxTokens: 204800 },
            { id: "MiniMax-M2.1", name: "MiniMax M2.1", modality: "text", description: "Strong coding and reasoning at ~60 tps", maxTokens: 204800 },
            { id: "MiniMax-M2.1-lightning", name: "MiniMax M2.1 Lightning", modality: "text", description: "Faster variant at ~100 tps", maxTokens: 204800 },
            // Video models — Hailuo via native async API
            { id: "MiniMax-Hailuo-2.3", name: "Hailuo 2.3", modality: "video", description: "Text-to-video, 1080p, camera control", default: true },
            { id: "MiniMax-Hailuo-2.3-Fast", name: "Hailuo 2.3 Fast", modality: "video", description: "Faster video generation, great value" },
            // Audio models — T2A speech synthesis, 40 languages
            { id: "speech-2.8-hd", name: "Speech 2.8 HD", modality: "audio", description: "Highest quality TTS with interjections (laughs, sighs)", default: true },
            { id: "speech-2.8-turbo", name: "Speech 2.8 Turbo", modality: "audio", description: "Fast TTS with interjections support" },
            { id: "speech-2.6-hd", name: "Speech 2.6 HD", modality: "audio", description: "Voice agent optimized — sub-250ms latency, smart format handling, Fluent LoRA cloning" },
            { id: "speech-2.6-turbo", name: "Speech 2.6 Turbo", modality: "audio", description: "Fastest voice agent TTS — sub-250ms, powers ChatGPT voice mode" },
            // Image model
            { id: "image-01", name: "Image-01", modality: "image", description: "Text-to-image, multiple aspect ratios ($0.0035/image)", default: true },
        ],
    },
    together: {
        id: "together",
        name: "Together AI",
        description: "Open-source models hosted on Together infrastructure (Qwen 3.5, Llama)",
        icon: "Layers",
        website: "https://together.ai",
        capabilities: ["text"],
        requiresKey: true,
        color: "#0ea5e9",
        bgColor: "bg-sky-50",
        models: [
            { id: "Qwen/Qwen3.5-397B-A17B", name: "Qwen 3.5 (397B MoE)", modality: "text", description: "Frontier MoE — 397B total, 17B active per token", maxTokens: 8192, default: true },
        ],
    },
    deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek V3.2 and R1 reasoning",
        icon: "Sparkles",
        website: "https://platform.deepseek.com",
        capabilities: ["text"],
        requiresKey: true,
        color: "#1E90FF",
        bgColor: "bg-blue-50",
        models: [
            { id: "deepseek-chat", name: "DeepSeek V3.2", modality: "text", description: "Frontier model, 81% SWE-bench", maxTokens: 131072, default: true },
            { id: "deepseek-reasoner", name: "DeepSeek R1", modality: "text", description: "Advanced reasoning with chain-of-thought", maxTokens: 131072 },
        ],
    },
}

// ─── Helper functions ────────────────────────────────────────────────

/** Get all providers that support a given modality */
export function getProvidersForModality(modality: OutputModality): AIProviderMeta[] {
    return Object.values(PROVIDER_REGISTRY).filter((p) =>
        p.capabilities.includes(modality)
    )
}

/** Get the default model for a provider + modality */
export function getDefaultModel(providerId: AIProviderId, modality: OutputModality): AIModel | undefined {
    const provider = PROVIDER_REGISTRY[providerId]
    if (!provider) return undefined
    return (
        provider.models.find((m) => m.modality === modality && m.default) ??
        provider.models.find((m) => m.modality === modality)
    )
}

/** Get models for a provider + modality */
export function getModelsForModality(providerId: AIProviderId, modality: OutputModality): AIModel[] {
    const provider = PROVIDER_REGISTRY[providerId]
    if (!provider) return []
    return provider.models.filter((m) => m.modality === modality)
}

// ─── Execution request / response types ──────────────────────────────

// ─── Slide deck types ────────────────────────────────────────────────

export interface SlideContent {
    title: string
    subtitle?: string
    bullets?: string[]
    notes?: string
    layout?: "title" | "content" | "two-column" | "image" | "closing"
    /** AI image generation prompt describing the visual for this slide */
    imagePrompt?: string
    /** Generated image URL (populated after image generation completes) */
    imageUrl?: string
}

export interface SlideDeckContent {
    title: string
    slides: SlideContent[]
    theme?: {
        primaryColor?: string
        secondaryColor?: string
        fontFamily?: string
    }
}

// ─── Execution request / response types ──────────────────────────────

export interface ExecutionRequest {
    prompt: string
    input: string
    providerId: AIProviderId
    modelId: string
    modality: OutputModality
}

export interface ExecutionResult {
    modality: OutputModality
    text?: string // for text modality
    imageUrl?: string // for image modality (base64 data URI or URL)
    audioUrl?: string // for audio modality (base64 data URI or URL)
    videoUrl?: string // for video modality
    error?: string
}

// ─── Tool / function calling (agent orchestration) ────────────────────

/** JSON Schema for a tool's input parameters (OpenAI/Anthropic format). */
export interface ToolDefinition {
    name: string
    description: string
    parameters: Record<string, unknown>
}

/** A tool invocation requested by the model during a turn. */
export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, unknown>
}

/** Result of executing a tool, sent back to the model. */
export interface ToolResult {
    tool_call_id: string
    content: string
}

// ─── Stored provider key (DB shape) ──────────────────────────────────

export interface StoredProviderKey {
    id: string
    user_id: string
    provider_id: AIProviderId
    encrypted_key: string
    key_hint: string // last 4 chars for display
    created_at: string
    updated_at: string
}
