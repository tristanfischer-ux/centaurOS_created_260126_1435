"use client"

/**
 * @file use-tts.ts
 *
 * @description Hook for text-to-speech playback via the /api/agents/tts endpoint.
 * Uses AudioContext for reliable playback that survives browser autoplay policies.
 * The AudioContext is "unlocked" once during a user gesture (via warmUp()), then
 * all subsequent playback works regardless of timing.
 *
 * DECISION: The streaming TTS drain queue pre-fetches the next sentence while the
 * current one plays (look-ahead). Previously each sentence was fetched sequentially
 * (fetch -> play -> fetch -> play), meaning the user heard silence between every
 * sentence while waiting for the API. With look-ahead, the next sentence's audio
 * is already downloaded by the time the current one finishes, eliminating gaps.
 *
 * @returns play, stop, warmUp, isPlaying, isLoading, voiceEnabled, setVoiceEnabled
 */

import { useState, useCallback, useRef, useEffect } from "react"

const VOICE_ENABLED_KEY = "specialist-voice-enabled"

function getStoredVoiceEnabled(): boolean {
    if (typeof window === "undefined") return true
    const stored = localStorage.getItem(VOICE_ENABLED_KEY)
    return stored === null ? true : stored === "true"
}

/** Strip markdown for TTS — headers, bullets, bold, code, etc. */
function stripMarkdownForTTS(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[-*]\s+/gm, "")
        .replace(/^\d+\.\s+/gm, "")
        .replace(/^>\s+/gm, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\s+/g, " ")
        .trim()
}

// ─── Chunking Configuration ─────────────────────────────────────────────────

/** Minimum words before the first chunk can be spoken (eagerness for fast start) */
const FIRST_CHUNK_MIN_WORDS = 5
/** Minimum words before a clause boundary triggers a split */
const CLAUSE_SPLIT_MIN_WORDS = 8
/** Force-split at this many words even without punctuation */
const FORCE_SPLIT_WORDS = 14

/**
 * DECISION: Aggressive chunking instead of sentence-only splitting.
 * The previous `splitIntoSentences` waited for `.!?` which meant 30+ words
 * could accumulate before TTS started. This splitter also breaks on clause
 * boundaries (`,;:—`) after enough words, and force-breaks long runs,
 * cutting time-to-first-audio by 2-5 seconds.
 */
function splitIntoSpeakableChunks(text: string): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []

    const result: string[] = []
    let buffer = ""
    let wordCount = 0

    const tokens = trimmed.split(/(\s+)/)

    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            buffer += token
            continue
        }

        buffer += token
        wordCount++

        if (/[.!?]$/.test(token) && wordCount >= 3) {
            result.push(buffer.trim())
            buffer = ""
            wordCount = 0
            continue
        }

        if (/[,;:\u2014\u2013]$/.test(token) && wordCount >= CLAUSE_SPLIT_MIN_WORDS) {
            result.push(buffer.trim())
            buffer = ""
            wordCount = 0
            continue
        }

        if (wordCount >= FORCE_SPLIT_WORDS) {
            result.push(buffer.trim())
            buffer = ""
            wordCount = 0
            continue
        }
    }

    if (buffer.trim()) {
        result.push(buffer.trim())
    }

    return result
}

/** Legacy sentence splitter used only by playChunked (non-streaming, full text available). */
function splitIntoSentences(text: string): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const parts = trimmed.split(/(?<=[.!?])\s+/)
    return parts.filter((p) => p.trim().length > 0)
}

// ─── Browser SpeechSynthesis Bridge ─────────────────────────────────────────

function hasBrowserSpeechSynthesis(): boolean {
    if (typeof window === "undefined") return false
    return typeof window.speechSynthesis !== "undefined"
}

function speakBrowserTTS(text: string): SpeechSynthesisUtterance | null {
    if (!hasBrowserSpeechSynthesis()) return null
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    utterance.pitch = 1.0
    synth.speak(utterance)
    return utterance
}

function cancelBrowserTTS(): void {
    if (hasBrowserSpeechSynthesis()) {
        window.speechSynthesis.cancel()
    }
}

export interface UseTtsReturn {
    voiceEnabled: boolean
    setVoiceEnabled: (enabled: boolean) => void
    isLoading: boolean
    isPlaying: boolean
    play: (text: string, voice: string) => Promise<void>
    playChunked: (text: string, voice: string) => Promise<void>
    startStreaming: (voice: string) => void
    feedStreamingText: (fullText: string) => void
    /** Accept pre-generated audio from server SSE (Layer 3 parallel TTS) */
    feedServerAudio: (audioData: ArrayBuffer) => void
    finishStreaming: (displayText: string) => void
    stop: () => void
    warmUp: () => void
}

/**
 * Hook for specialist text-to-speech via OpenAI gpt-4o-mini-tts.
 *
 * Uses Web Audio API (AudioContext) instead of HTMLAudioElement for reliable
 * playback. The AudioContext is created and resumed on the first user gesture
 * (via warmUp), then subsequent play() calls work even after long async gaps.
 */
export function useTts(): UseTtsReturn {
    const [voiceEnabled, setVoiceEnabledState] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)

    const audioContextRef = useRef<AudioContext | null>(null)
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        setVoiceEnabledState(getStoredVoiceEnabled())
    }, [])

    const warmUp = useCallback(() => {
        if (typeof window === "undefined") return
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext()
            }
            if (audioContextRef.current.state === "suspended") {
                audioContextRef.current.resume().catch(() => {})
            }
        } catch (err) {
            console.warn("[TTS] AudioContext warmUp failed:", err)
        }
    }, [])

    const stopPlayback = useCallback(() => {
        cancelBrowserTTS()
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop() } catch { /* already stopped */ }
            sourceNodeRef.current = null
        }
        setIsLoading(false)
        setIsPlaying(false)
    }, [])

    const setVoiceEnabled = useCallback((enabled: boolean) => {
        setVoiceEnabledState(enabled)
        if (typeof window !== "undefined") {
            localStorage.setItem(VOICE_ENABLED_KEY, String(enabled))
        }
        if (!enabled) stopPlayback()
    }, [stopPlayback])

    // ─── Shared: ensure AudioContext is ready ────────────────────────────

    const ensureAudioContext = useCallback(async (): Promise<AudioContext | null> => {
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext()
        }
        const ctx = audioContextRef.current
        if (ctx.state === "suspended") {
            try {
                await ctx.resume()
            } catch {
                console.warn("[TTS] AudioContext resume failed — playback may not work")
                return null
            }
        }
        return ctx
    }, [])

    // ─── Shared: fetch audio from TTS API ───────────────────────────────

    const fetchAudio = useCallback(async (
        text: string,
        voice: string,
        signal: AbortSignal
    ): Promise<ArrayBuffer | null> => {
        const res = await fetch("/api/agents/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice }),
            signal,
        })
        if (!res.ok) return null
        return res.arrayBuffer()
    }, [])

    // ─── Shared: play an AudioBuffer and resolve when done ──────────────

    const playAudioBuffer = useCallback((
        ctx: AudioContext,
        audioBuffer: AudioBuffer,
        signal: AbortSignal
    ): Promise<void> => {
        return new Promise<void>((resolve) => {
            if (signal.aborted) { resolve(); return }
            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)
            sourceNodeRef.current = source
            source.onended = () => {
                sourceNodeRef.current = null
                resolve()
            }
            source.start()
        })
    }, [])

    // ─── Single-shot play ───────────────────────────────────────────────

    const play = useCallback(async (text: string, voice: string): Promise<void> => {
        stopPlayback()
        if (!text.trim()) return

        const ctx = await ensureAudioContext()
        if (!ctx) return

        const controller = new AbortController()
        abortRef.current = controller
        setIsLoading(true)

        try {
            const arrayBuffer = await fetchAudio(text, voice, controller.signal)
            if (controller.signal.aborted || !arrayBuffer) {
                setIsLoading(false)
                return
            }

            const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
            if (controller.signal.aborted) return

            setIsLoading(false)
            setIsPlaying(true)
            await playAudioBuffer(ctx, audioBuffer, controller.signal)
            setIsPlaying(false)
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return
            console.warn("[TTS] Play failed:", err instanceof Error ? err.message : err)
            setIsLoading(false)
            setIsPlaying(false)
        }
    }, [stopPlayback, ensureAudioContext, fetchAudio, playAudioBuffer])

    // ─── Chunked play (greeting) with look-ahead prefetch ───────────────

    /**
     * INTENT: Play text in sentence-sized chunks with look-ahead prefetch.
     * While the current sentence plays, the next sentence is already being
     * fetched from the API. This eliminates the dead-air gap between sentences.
     */
    const playChunked = useCallback(
        async (text: string, voice: string): Promise<void> => {
            stopPlayback()

            const clean = stripMarkdownForTTS(text)
            if (!clean.trim()) return

            const chunks = splitIntoSentences(clean)
            if (chunks.length === 0) return

            const ctx = await ensureAudioContext()
            if (!ctx) return

            const controller = new AbortController()
            abortRef.current = controller

            try {
                setIsLoading(true)
                let nextFetch: Promise<ArrayBuffer | null> | null =
                    fetchAudio(chunks[0].trim(), voice, controller.signal)

                for (let i = 0; i < chunks.length; i++) {
                    if (controller.signal.aborted) return

                    const buffer = await nextFetch
                    nextFetch = null

                    if (controller.signal.aborted) return
                    if (!buffer) {
                        console.warn("[TTS] Chunk fetch failed:", i)
                        if (i + 1 < chunks.length) {
                            nextFetch = fetchAudio(chunks[i + 1].trim(), voice, controller.signal)
                        }
                        continue
                    }

                    const audioBuffer = await ctx.decodeAudioData(buffer)
                    if (controller.signal.aborted) return

                    if (i + 1 < chunks.length) {
                        nextFetch = fetchAudio(chunks[i + 1].trim(), voice, controller.signal)
                    }

                    setIsLoading(false)
                    setIsPlaying(true)
                    await playAudioBuffer(ctx, audioBuffer, controller.signal)
                    setIsPlaying(false)

                    if (controller.signal.aborted) return
                    if (i + 1 < chunks.length) setIsLoading(true)
                }
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return
                console.warn("[TTS] PlayChunked failed:", err instanceof Error ? err.message : err)
            } finally {
                abortRef.current = null
                setIsLoading(false)
                setIsPlaying(false)
            }
        },
        [stopPlayback, ensureAudioContext, fetchAudio, playAudioBuffer],
    )

    // ─── Streaming TTS with aggressive chunking + browser bridge ────────

    const streamVoiceRef = useRef<string | null>(null)
    const streamChunksSentRef = useRef<number>(0)
    const streamQueueRef = useRef<string[]>([])
    const streamPlayingRef = useRef(false)
    const streamControllerRef = useRef<AbortController | null>(null)
    const streamFinishedRef = useRef(false)
    const streamPrefetchRef = useRef<Promise<ArrayBuffer | null> | null>(null)
    const browserBridgeActiveRef = useRef(false)
    const serverAudioQueueRef = useRef<ArrayBuffer[]>([])

    /**
     * INTENT: Drain the streaming chunk queue with look-ahead prefetch.
     * While playing chunk N, we kick off the fetch for chunk N+1.
     * On the very first chunk, cancel the browser SpeechSynthesis bridge
     * so the high-quality OpenAI voice takes over seamlessly.
     *
     * If server-pushed audio is available (Layer 3), play it directly
     * without a client-side TTS fetch.
     */
    const drainStreamQueue = useCallback(async () => {
        if (streamPlayingRef.current) return
        streamPlayingRef.current = true

        const voice = streamVoiceRef.current
        const controller = streamControllerRef.current
        if (!voice || !controller || controller.signal.aborted) {
            streamPlayingRef.current = false
            return
        }

        const ctx = await ensureAudioContext()
        if (!ctx) {
            streamPlayingRef.current = false
            return
        }

        while (streamQueueRef.current.length > 0) {
            if (controller.signal.aborted) break

            const chunk = streamQueueRef.current.shift()!
            if (!chunk.trim()) continue

            // Cancel browser bridge when first OpenAI audio is about to play
            if (browserBridgeActiveRef.current) {
                cancelBrowserTTS()
                browserBridgeActiveRef.current = false
            }

            try {
                setIsLoading(true)

                let arrayBuffer: ArrayBuffer | null = null

                // Prefer server-pushed audio (Layer 3) over client fetch
                if (serverAudioQueueRef.current.length > 0) {
                    arrayBuffer = serverAudioQueueRef.current.shift()!
                } else if (streamPrefetchRef.current) {
                    arrayBuffer = await streamPrefetchRef.current
                    streamPrefetchRef.current = null
                } else {
                    arrayBuffer = await fetchAudio(chunk, voice, controller.signal)
                }

                if (!arrayBuffer || controller.signal.aborted) {
                    setIsLoading(false)
                    continue
                }

                const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
                if (controller.signal.aborted) break

                // Prefetch next chunk while this one plays
                const nextChunk = streamQueueRef.current[0]?.trim()
                if (nextChunk && serverAudioQueueRef.current.length === 0) {
                    streamPrefetchRef.current = fetchAudio(nextChunk, voice, controller.signal)
                }

                const source = ctx.createBufferSource()
                source.buffer = audioBuffer
                source.connect(ctx.destination)
                sourceNodeRef.current = source

                setIsLoading(false)
                setIsPlaying(true)

                await new Promise<void>((resolve) => {
                    source.onended = () => {
                        sourceNodeRef.current = null
                        resolve()
                    }
                    source.start()
                })

                setIsPlaying(false)
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") break
                console.warn("[TTS-Stream] Chunk playback failed:", err instanceof Error ? err.message : err)
                setIsLoading(false)
                setIsPlaying(false)
            }
        }

        streamPlayingRef.current = false
        if (streamQueueRef.current.length === 0) {
            streamPrefetchRef.current = null
            setIsLoading(false)
            setIsPlaying(false)
        }
    }, [ensureAudioContext, fetchAudio])

    const startStreaming = useCallback(
        (voice: string) => {
            stopPlayback()
            streamVoiceRef.current = voice
            streamChunksSentRef.current = 0
            streamQueueRef.current = []
            streamPlayingRef.current = false
            streamFinishedRef.current = false
            streamPrefetchRef.current = null
            browserBridgeActiveRef.current = false
            serverAudioQueueRef.current = []
            const controller = new AbortController()
            streamControllerRef.current = controller
            abortRef.current = controller
        },
        [stopPlayback],
    )

    /**
     * INTENT: Feed accumulated text and extract speakable chunks aggressively.
     *
     * Layer 1 (aggressive chunking): Uses clause boundaries and word-count
     * thresholds instead of waiting for sentence-ending punctuation.
     *
     * Layer 1b (first-chunk eagerness): If nothing has been queued yet and
     * the text has FIRST_CHUNK_MIN_WORDS words, promote it immediately —
     * don't wait for a boundary.
     *
     * Layer 2 (browser bridge): Before the first OpenAI TTS fetch even starts,
     * speak the initial words with the browser's built-in SpeechSynthesis API
     * for near-instant audio (~50ms). The bridge is cancelled when OpenAI
     * audio arrives in drainStreamQueue.
     */
    const feedStreamingText = useCallback(
        (fullText: string) => {
            if (!streamControllerRef.current || streamControllerRef.current.signal.aborted) return

            const clean = stripMarkdownForTTS(fullText)
            const chunks = splitIntoSpeakableChunks(clean)

            // All-but-last are confirmed complete (subsequent text exists)
            let completeChunks = chunks.slice(0, -1)
            const alreadySent = streamChunksSentRef.current

            // First-chunk eagerness: if nothing sent yet and only one chunk
            // exists with enough words, promote it to "complete" immediately
            if (alreadySent === 0 && completeChunks.length === 0 && chunks.length === 1) {
                const words = chunks[0].trim().split(/\s+/)
                if (words.length >= FIRST_CHUNK_MIN_WORDS) {
                    completeChunks = [chunks[0]]
                }
            }

            // Browser bridge: speak first words instantly while OpenAI loads
            if (!browserBridgeActiveRef.current && alreadySent === 0 && chunks.length > 0) {
                const firstText = chunks[0].trim()
                const wordCount = firstText.split(/\s+/).length
                if (wordCount >= 3 && hasBrowserSpeechSynthesis()) {
                    speakBrowserTTS(firstText)
                    browserBridgeActiveRef.current = true
                    setIsPlaying(true)
                }
            }

            if (completeChunks.length > alreadySent) {
                const newChunks = completeChunks.slice(alreadySent)
                streamQueueRef.current.push(...newChunks)
                streamChunksSentRef.current = completeChunks.length
                drainStreamQueue()
            }
        },
        [drainStreamQueue],
    )

    /**
     * Accept pre-generated audio from the server (Layer 3).
     * Called when the SSE stream delivers an audio_chunk event.
     */
    const feedServerAudio = useCallback(
        (audioData: ArrayBuffer) => {
            serverAudioQueueRef.current.push(audioData)
            drainStreamQueue()
        },
        [drainStreamQueue],
    )

    const finishStreamingWithText = useCallback(
        (displayText: string) => {
            if (!streamControllerRef.current || streamControllerRef.current.signal.aborted) return

            const clean = stripMarkdownForTTS(displayText)
            const chunks = splitIntoSpeakableChunks(clean)
            const alreadySent = streamChunksSentRef.current

            if (chunks.length > alreadySent) {
                const remaining = chunks.slice(alreadySent)
                streamQueueRef.current.push(...remaining)
                streamChunksSentRef.current = chunks.length
                drainStreamQueue()
            }

            streamFinishedRef.current = true
        },
        [drainStreamQueue],
    )

    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort()
            if (sourceNodeRef.current) {
                try { sourceNodeRef.current.stop() } catch { /* already stopped */ }
            }
            if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                audioContextRef.current.close().catch(() => {})
            }
        }
    }, [])

    return {
        voiceEnabled,
        setVoiceEnabled,
        isLoading,
        isPlaying,
        play,
        playChunked,
        startStreaming,
        feedStreamingText,
        feedServerAudio,
        finishStreaming: finishStreamingWithText,
        stop: stopPlayback,
        warmUp,
    }
}
