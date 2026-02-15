/**
 * @file emotional-context.ts
 *
 * @description Lightweight emotional signal detection that analyzes the
 * founder's message to infer their likely emotional state. This is NOT
 * sentiment analysis for analytics — it's a behavioral hint that helps
 * specialists adapt their tone and approach.
 *
 * A real colleague would notice when you're stressed, excited, frustrated,
 * or uncertain — and adjust their communication accordingly. This module
 * gives specialists that same awareness.
 *
 * Detection is intentionally conservative: when uncertain, it returns
 * 'neutral' which causes no behavioral change. Wrong detection of
 * stress → being a bit more concise (low harm). Wrong detection of
 * excitement → being a bit more energetic (low harm).
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts
 * - Personality compilation: src/lib/agents/personality.ts
 * - Temporal context: src/lib/agents/temporal-context.ts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Detected emotional signals in the founder's message.
 * These are hints, not certainties — used as soft bias, not hard rules.
 */
export type EmotionalSignal =
    | "stress"        // Short messages, urgency words, multiple exclamation marks
    | "excitement"    // Positive language, wins shared, enthusiastic tone
    | "frustration"   // Negative language, repeating questions, corrections
    | "uncertainty"   // Hedging, many questions, "I don't know" language
    | "deflation"     // Low energy, resignation, "whatever you think"
    | "neutral"       // No strong signal detected

export interface EmotionalContext {
    /** The primary detected emotional signal */
    signal: EmotionalSignal
    /** Confidence level (0-1). Below 0.4 = neutral fallback. */
    confidence: number
    /** Behavioral guidance for the specialist */
    guidance: string
}

// ─── Signal Detection Patterns ──────────────────────────────────────────────

/** Stress indicators: urgency, pressure, overwhelm */
const STRESS_PATTERNS = [
    /\basap\b/i,
    /\burgent\b/i,
    /\bhelp\b/i,
    /\bcrisis\b/i,
    /\bblocked\b/i,
    /\bstuck\b/i,
    /\bpanic\b/i,
    /\boverwhel/i,
    /\bfalling apart\b/i,
    /\bcan't keep up\b/i,
    /\brunning out of\b/i,
    /\bdesperately\b/i,
    /!{2,}/, // Multiple exclamation marks
]

/** Excitement indicators: wins, positive energy, celebration */
const EXCITEMENT_PATTERNS = [
    /\bjust (closed|signed|landed|won|shipped|launched)\b/i,
    /\bgreat news\b/i,
    /\bexcit/i,
    /\bamazing\b/i,
    /\bincredible\b/i,
    /\bwe (did it|made it|got it|nailed)\b/i,
    /\bbreakthrough\b/i,
    /\bhuge\b/i,
    /\bcelebrat/i,
    /\b🎉|🚀|💪|🔥/,
]

/** Frustration indicators: negativity, repetition, corrections */
const FRUSTRATION_PATTERNS = [
    /\balready (said|told|mentioned|asked)\b/i,
    /\bthat'?s not what i\b/i,
    /\bnot helpful\b/i,
    /\bwrong\b/i,
    /\bno,\s/i,
    /\bfrustrat/i,
    /\bannoy/i,
    /\bwaste of time\b/i,
    /\bstill (not|isn't|doesn't|won't)\b/i,
    /\bi (said|asked|meant)\b/i,
    /\bwhat part of\b/i,
]

/** Uncertainty indicators: hedging, many questions, doubt */
const UNCERTAINTY_PATTERNS = [
    /\bi'?m not sure\b/i,
    /\bi don'?t know\b/i,
    /\bmaybe\b/i,
    /\bperhaps\b/i,
    /\bwhat do you think\b/i,
    /\bshould (i|we)\b/i,
    /\bis it (worth|possible|a good idea)\b/i,
    /\bi'?m (confused|lost|torn)\b/i,
    /\bwhat would you (do|suggest|recommend)\b/i,
    /\?\s*\?/, // Multiple question marks
]

/** Deflation indicators: low energy, resignation, disengagement */
const DEFLATION_PATTERNS = [
    /\bwhatever you think\b/i,
    /\bi guess\b/i,
    /\bdoesn't matter\b/i,
    /\bgive up\b/i,
    /\bpointless\b/i,
    /\bwhy bother\b/i,
    /\btired of\b/i,
    /\bdon't care\b/i,
    /\bjust do whatever\b/i,
    /\bnot sure it'?s worth\b/i,
]

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * Counts pattern matches in the message text.
 *
 * @param text - The user's message
 * @param patterns - Array of regex patterns to match against
 * @returns Number of unique pattern matches
 */
function countMatches(text: string, patterns: RegExp[]): number {
    let count = 0
    for (const pattern of patterns) {
        if (pattern.test(text)) count++
    }
    return count
}

/**
 * Additional heuristic signals based on message structure.
 *
 * @param text - The user's message
 * @returns Adjustments to apply to signal scores
 */
function getStructuralSignals(text: string): Record<EmotionalSignal, number> {
    const adjustments: Record<EmotionalSignal, number> = {
        stress: 0,
        excitement: 0,
        frustration: 0,
        uncertainty: 0,
        deflation: 0,
        neutral: 0,
    }

    // Very short messages (< 20 chars) suggest stress or frustration
    if (text.length < 20 && text.length > 0) {
        adjustments.stress += 0.5
        adjustments.frustration += 0.3
    }

    // Very short with question mark → uncertainty
    if (text.length < 30 && text.includes("?")) {
        adjustments.uncertainty += 0.5
    }

    // ALL CAPS sections → stress or frustration
    const words = text.split(/\s+/)
    const capsWords = words.filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w))
    if (capsWords.length >= 2) {
        adjustments.stress += 0.5
        adjustments.frustration += 0.3
    }

    // Multiple question marks → uncertainty
    const questionMarks = (text.match(/\?/g) || []).length
    if (questionMarks >= 3) {
        adjustments.uncertainty += 0.5
    }

    return adjustments
}

// ─── Behavioral Guidance ────────────────────────────────────────────────────

const SIGNAL_GUIDANCE: Record<EmotionalSignal, string> = {
    stress: [
        "The founder appears to be under pressure.",
        "Be exceptionally concise — lead with the answer, not the analysis.",
        "Reduce cognitive load: give ONE clear recommendation, not three options.",
        "Acknowledge the urgency without adding to it: 'Let's focus on the one thing that unblocks you.'",
        "Save the detailed reasoning for a follow-up. Right now they need direction, not a whiteboard session.",
    ].join("\n"),

    excitement: [
        "The founder is sharing good news or feeling energized.",
        "Match their energy — celebrate the win genuinely and in character.",
        "Build on the momentum: 'This changes the picture. Here's what we can do with this...'",
        "Channel the excitement into the next ambitious move. Don't deflate with caution.",
        "This is a moment to dream bigger, then make it actionable.",
    ].join("\n"),

    frustration: [
        "The founder may be frustrated — possibly with previous advice, a situation, or this conversation.",
        "Acknowledge the friction without being defensive: 'I hear you. Let me take a different approach.'",
        "Be extra direct. Skip preamble entirely. Get to the substance immediately.",
        "If you made an error or misunderstood, own it simply: 'I misread that. Here's what I actually think.'",
        "Don't over-apologize. Just fix it and move forward.",
    ].join("\n"),

    uncertainty: [
        "The founder is unsure and looking for guidance.",
        "Be reassuring but honest. Provide a framework for the decision, not just an answer.",
        "Reduce the options: 'Here are the 2 real choices. Here's how to pick between them.'",
        "Acknowledge what's unknown: 'We don't have data on X, but based on Y, I'd recommend...'",
        "Give them the decision framework so they build the muscle for next time.",
    ].join("\n"),

    deflation: [
        "The founder's energy is low. They may be discouraged or burned out.",
        "Be warmly supportive without being patronizing. Show genuine empathy.",
        "Reconnect to purpose: remind them why this matters and what they've already accomplished.",
        "Suggest a small, achievable win: 'Here's one thing we can do today that would move the needle.'",
        "Don't pile on challenges or hard truths right now. Build energy back up first.",
    ].join("\n"),

    neutral: "",
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Detects emotional signals in the founder's message.
 *
 * @description Runs a lightweight pattern-matching analysis to infer the
 * founder's likely emotional state. Returns the strongest signal with
 * confidence level and behavioral guidance.
 *
 * Conservative by design: when signals are mixed or weak, returns 'neutral'
 * which causes no behavioral change. The cost of wrong detection is low
 * (slightly adjusted tone), while the benefit of correct detection is high
 * (specialist feels emotionally intelligent).
 *
 * @param message - The founder's message text
 * @returns Emotional context with signal, confidence, and guidance
 */
export function detectEmotionalSignal(message: string): EmotionalContext {
    if (!message || message.trim().length === 0) {
        return { signal: "neutral", confidence: 0, guidance: "" }
    }

    const text = message.trim()

    // Score each signal
    const scores: Record<Exclude<EmotionalSignal, "neutral">, number> = {
        stress: countMatches(text, STRESS_PATTERNS),
        excitement: countMatches(text, EXCITEMENT_PATTERNS),
        frustration: countMatches(text, FRUSTRATION_PATTERNS),
        uncertainty: countMatches(text, UNCERTAINTY_PATTERNS),
        deflation: countMatches(text, DEFLATION_PATTERNS),
    }

    // Apply structural adjustments
    const adjustments = getStructuralSignals(text)
    for (const key of Object.keys(scores) as Array<keyof typeof scores>) {
        scores[key] += adjustments[key]
    }

    // Find the strongest signal
    let bestSignal: EmotionalSignal = "neutral"
    let bestScore = 0

    for (const [signal, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score
            bestSignal = signal as EmotionalSignal
        }
    }

    // Calculate confidence (0-1 scale)
    // 1 match = 0.3, 2 matches = 0.5, 3+ matches = 0.7+
    const confidence = Math.min(bestScore * 0.25, 1)

    // Below threshold → neutral
    if (confidence < 0.3) {
        return { signal: "neutral", confidence: 0, guidance: "" }
    }

    return {
        signal: bestSignal,
        confidence,
        guidance: SIGNAL_GUIDANCE[bestSignal],
    }
}

/**
 * Compiles emotional context into a prompt block for injection.
 * Returns empty string if signal is neutral (no guidance needed).
 *
 * @param message - The founder's message to analyze
 * @returns Formatted prompt block, or empty string if neutral
 */
export function compileEmotionalPrompt(message: string): string {
    const ctx = detectEmotionalSignal(message)
    if (ctx.signal === "neutral" || !ctx.guidance) return ""
    return `## Emotional Awareness\n${ctx.guidance}`
}
