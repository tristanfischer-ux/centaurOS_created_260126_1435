/**
 * @file conversation-engine.ts
 *
 * @description Abstraction layer for specialist conversation modes. Defines a
 * ConversationEngine interface that decouples **how** a conversation happens
 * from the specialist UI.
 *
 * Follows the same registry pattern as `src/lib/ai-providers/` — each engine
 * type is a swappable implementation behind a shared interface.
 *
 * Currently only "text" mode is supported (SSE streaming + optional TTS/STT).
 *
 * @related
 * - src/lib/agents/engines/text-chat-engine.ts — Text chat implementation
 * - src/lib/ai-providers/types.ts — Sibling pattern for AI providers
 * - src/lib/billing/plans.ts — Tier limits per subscription
 */

// ─── Conversation Modes ──────────────────────────────────────────────────────

export const CONVERSATION_MODES = ["text"] as const
export type ConversationMode = (typeof CONVERSATION_MODES)[number]

// ─── Event System ────────────────────────────────────────────────────────────

/**
 * Events emitted by a ConversationEngine to the UI layer.
 *
 * The UI reacts to these events to update the display — rendering text chunks,
 * playing audio, showing video, or updating specialist state indicators.
 */
export type ConversationEventType =
    | "text_chunk"       // Partial text streamed from the LLM
    | "text_done"        // Full response complete (includes final text)
    | "fast_chunk"       // Speculative: partial text from fast model
    | "fast_done"        // Speculative: fast model complete (includes complexity)
    | "deep_chunk"       // Speculative: partial text from deep model
    | "deep_done"        // Speculative: deep model complete
    | "audio_chunk"      // Audio data to play (for voice/avatar modes)
    | "audio_done"       // Audio stream complete
    | "video_stream"     // WebRTC MediaStream connected (avatar mode)
    | "state_change"     // Specialist visual state changed
    | "transcript"       // Real-time transcript update (for voice/avatar modes)
    | "error"            // Something went wrong
    | "suggestion"       // AI-recommended next specialist parsed from response

export interface ConversationEvent {
    type: ConversationEventType

    /** Partial or full text content (for text_chunk, text_done, transcript) */
    text?: string

    /** Audio data for playback (for audio_chunk) */
    audio?: ArrayBuffer

    /** WebRTC video stream from avatar provider (for video_stream) */
    videoStream?: MediaStream

    /** Current specialist visual state (for state_change) */
    state?: SpecialistState

    /** Error message (for error events) */
    error?: string

    /** Dynamic specialist suggestion parsed from response (for suggestion) */
    suggestion?: { specialistId: string; reason: string }

    /** Speculative complexity classification from fast model (for fast_done) */
    complexity?: "simple" | "complex"
}

// ─── Specialist Visual States ────────────────────────────────────────────────

/**
 * Visual states that a specialist can be in during a conversation.
 * The SpecialistPresentation component renders differently for each state.
 */
export type SpecialistState =
    | "idle"        // Waiting for user input
    | "listening"   // User is speaking (mic active)
    | "thinking"    // Processing user input (waiting for LLM)
    | "speaking"    // Specialist is responding (TTS playing or streaming)
    | "connecting"  // Setting up the session
    | "error"       // Something went wrong

// ─── Engine Configuration ────────────────────────────────────────────────────

/**
 * Configuration passed to ConversationEngine.connect() to initialize a session.
 *
 * The engine uses this to set up the LLM context with the specialist's
 * personality, company context, and conversation memory.
 */
export interface ConversationEngineConfig {
    /** Which specialist this session is for */
    specialistId: string

    /** Memory thread ID for conversation persistence */
    threadId: string | null

    /** Foundry ID for multi-tenant isolation */
    foundryId: string | null

    /** AI provider ID (e.g., "minimax", "anthropic") */
    providerId: string

    /** Model ID (e.g., "MiniMax-M2.5", "claude-opus-4-6") */
    modelId: string

    /** Pre-built system prompt suffix (screen context, handoff, cross-specialist) */
    systemPromptSuffix: string

    /** OpenAI voice ID from specialist definition (e.g., "alloy", "nova") */
    voice: string

    /** Whether to use deep thinking mode (extended reasoning) */
    deepThinkEnabled: boolean

    /** Model tier for provider failover (e.g., "claude", "qwen", "minimax"). When set, the API
     *  route uses the corresponding fallback chain if the primary provider is unavailable. */
    modelTier?: string

    /** Enable speculative dual-stream: a fast model responds instantly while the deep model
     *  works in parallel. The fast model triages complexity — answering simple questions fully
     *  or providing a brief acknowledgment for complex ones. */
    speculative?: boolean

    /** AbortSignal for cancellation */
    signal?: AbortSignal
}

// ─── Engine Interface ────────────────────────────────────────────────────────

/**
 * The core abstraction for specialist conversations.
 *
 * Each conversation mode (text, voice, avatar) implements this interface.
 * The UI (brief-specialist-dialog) interacts with the engine through this
 * contract, making the conversation mode completely swappable.
 *
 * @example
 * const engine = getConversationEngine('text')
 * await engine.connect(config)
 * engine.onEvent((event) => {
 *   if (event.type === 'text_chunk') updateStreamingUI(event.text)
 *   if (event.type === 'state_change') updateAvatarState(event.state)
 * })
 * await engine.sendText("What's our go-to-market strategy?")
 * await engine.disconnect()
 */
export interface ConversationEngine {
    /** Which conversation mode this engine implements */
    readonly mode: ConversationMode

    /**
     * Initialize the conversation session.
     * For text: no-op (stateless per request).
     * For voice: establishes WebRTC connection to OpenAI Realtime API.
     * For avatar: establishes both voice and avatar video streams.
     */
    connect(config: ConversationEngineConfig): Promise<void>

    /**
     * Send a text message from the user.
     * For text: POSTs to /api/agents/execute, parses SSE stream.
     * For voice: converts to speech or sends as text input to Realtime API.
     * For avatar: delegates to voice engine.
     */
    sendText(message: string, promptTemplate?: string): Promise<void>

    /**
     * Send audio input from the user's microphone.
     * For text: transcribes via Whisper, then calls sendText().
     * For voice: streams directly to OpenAI Realtime API.
     * For avatar: delegates to voice engine.
     */
    sendAudio(audioData: Blob): Promise<void>

    /**
     * Register an event handler. Multiple handlers can be registered.
     * Returns an unsubscribe function.
     */
    onEvent(handler: (event: ConversationEvent) => void): () => void

    /**
     * Get the full conversation transcript, regardless of conversation mode.
     * Always available — even voice/avatar modes maintain a text transcript.
     */
    getTranscript(): Array<{ role: "user" | "assistant"; content: string }>

    /**
     * Get the current specialist visual state.
     */
    getState(): SpecialistState

    /**
     * Clean up resources (close WebRTC connections, stop audio, etc.)
     */
    disconnect(): Promise<void>
}

// ─── Engine Factory ──────────────────────────────────────────────────────────

/**
 * Factory functions for creating ConversationEngine instances.
 * Lazy-loaded to avoid importing heavy dependencies (WebRTC, avatar SDKs)
 * when they're not needed.
 */
type EngineFactory = () => ConversationEngine

const ENGINE_FACTORIES: Record<ConversationMode, EngineFactory | null> = {
    text: null,   // Set by registerEngine()
}

/**
 * Register a ConversationEngine factory for a given mode.
 * Called by each engine module on import.
 *
 * @param mode - The conversation mode this factory creates
 * @param factory - Factory function that creates a new engine instance
 */
export function registerEngine(mode: ConversationMode, factory: EngineFactory): void {
    ENGINE_FACTORIES[mode] = factory
}

/**
 * Create a ConversationEngine for the given mode.
 *
 * @param mode - Which conversation mode to use
 * @returns A new engine instance, or null if the mode isn't registered
 *
 * @example
 * const engine = createConversationEngine('voice')
 * if (!engine) {
 *   // Fall back to text mode
 *   engine = createConversationEngine('text')!
 * }
 */
export function createConversationEngine(mode: ConversationMode): ConversationEngine | null {
    const factory = ENGINE_FACTORIES[mode]
    if (!factory) return null
    return factory()
}

/**
 * Check whether a conversation mode has a registered engine.
 */
export function isEngineAvailable(mode: ConversationMode): boolean {
    return ENGINE_FACTORIES[mode] !== null
}

/**
 * Get the best available conversation mode. Currently always returns "text".
 *
 * @param preferred - The mode the user's tier allows
 * @returns The best available mode that's actually registered
 */
export function resolveConversationMode(preferred: ConversationMode): ConversationMode {
    return "text"
}
