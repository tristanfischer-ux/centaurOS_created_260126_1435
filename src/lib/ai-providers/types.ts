// ─── Output Modalities ───────────────────────────────────────────────
export const OUTPUT_MODALITIES = ["text", "image", "audio", "video", "slides"] as const
export type OutputModality = (typeof OUTPUT_MODALITIES)[number]

// ─── Provider IDs ────────────────────────────────────────────────────
export const AI_PROVIDERS = [
    "openai",
    "anthropic",
    "google",
    "stability",
    "elevenlabs",
    "replicate",
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
        description: "GPT-4o, DALL-E, Whisper, TTS",
        icon: "Sparkles",
        website: "https://platform.openai.com",
        capabilities: ["text", "image", "audio"],
        requiresKey: true,
        color: "#10a37f",
        bgColor: "bg-emerald-50",
        models: [
            { id: "gpt-4o", name: "GPT-4o", modality: "text", description: "Most capable model", maxTokens: 128000, default: true },
            { id: "gpt-4o-mini", name: "GPT-4o Mini", modality: "text", description: "Faster and cheaper", maxTokens: 128000 },
            { id: "o1", name: "o1", modality: "text", description: "Advanced reasoning", maxTokens: 200000 },
            { id: "dall-e-3", name: "DALL-E 3", modality: "image", description: "Image generation", default: true },
            { id: "tts-1", name: "TTS-1", modality: "audio", description: "Text to speech" },
            { id: "tts-1-hd", name: "TTS-1 HD", modality: "audio", description: "High-quality text to speech", default: true },
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
            { id: "claude-opus-4-6", name: "Claude Opus 4.6", modality: "text", description: "Most intelligent — best for strategy, analysis, and complex reasoning", maxTokens: 200000, default: true },
            { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", modality: "text", description: "Best balance of speed and intelligence", maxTokens: 200000 },
            { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", modality: "text", description: "Fastest with near-frontier intelligence", maxTokens: 200000 },
        ],
    },
    google: {
        id: "google",
        name: "Google",
        description: "Gemini 3 Pro Image, Gemini 2.0 Flash",
        icon: "Globe",
        website: "https://aistudio.google.com",
        capabilities: ["text", "image"],
        requiresKey: true,
        color: "#4285f4",
        bgColor: "bg-blue-50",
        models: [
            { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", modality: "text", description: "Fast multimodal model", maxTokens: 1048576, default: true },
            { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image", modality: "image", description: "Advanced image generation with text rendering", default: true },
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
            { id: "stable-diffusion-xl-1024-v1-0", name: "SDXL 1.0", modality: "image", description: "High-quality image generation", default: true },
            { id: "stable-image-core", name: "Stable Image Core", modality: "image", description: "Fast image generation" },
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
            { id: "eleven_multilingual_v2", name: "Multilingual v2", modality: "audio", description: "Best quality, multilingual", default: true },
            { id: "eleven_turbo_v2_5", name: "Turbo v2.5", modality: "audio", description: "Low latency" },
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
            { id: "black-forest-labs/flux-1.1-pro", name: "Flux 1.1 Pro", modality: "image", description: "High quality image generation", default: true },
            { id: "minimax/video-01", name: "MiniMax Video-01", modality: "video", description: "Text-to-video generation", default: true },
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
