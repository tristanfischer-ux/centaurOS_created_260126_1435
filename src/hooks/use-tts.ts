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

/** Split text into sentence-sized chunks for chunked TTS. */
function splitIntoSentences(text: string): string[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    const parts = trimmed.split(/(?<=[.!?])\s+/)
    return parts.filter((p) => p.trim().length > 0)
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

    // ─── Streaming TTS (during text generation) with look-ahead ─────────

    const streamVoiceRef = useRef<string | null>(null)
    const streamSentencesSentRef = useRef<number>(0)
    const streamQueueRef = useRef<string[]>([])
    const streamPlayingRef = useRef(false)
    const streamControllerRef = useRef<AbortController | null>(null)
    const streamFinishedRef = useRef(false)
    const streamPrefetchRef = useRef<Promise<ArrayBuffer | null> | null>(null)

    /**
     * INTENT: Drain the streaming sentence queue with look-ahead prefetch.
     * While playing sentence N, we kick off the fetch for sentence N+1.
     * This means the next sentence's audio is usually ready by the time
     * the current one finishes, producing seamless speech.
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

            const sentence = streamQueueRef.current.shift()!
            if (!sentence.trim()) continue

            try {
                setIsLoading(true)

                let bufferPromise: Promise<ArrayBuffer | null>
                if (streamPrefetchRef.current) {
                    bufferPromise = streamPrefetchRef.current
                    streamPrefetchRef.current = null
                } else {
                    bufferPromise = fetchAudio(sentence, voice, controller.signal)
                }

                const arrayBuffer = await bufferPromise
                if (!arrayBuffer || controller.signal.aborted) {
                    setIsLoading(false)
                    continue
                }

                const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
                if (controller.signal.aborted) break

                const nextSentence = streamQueueRef.current[0]?.trim()
                if (nextSentence) {
                    streamPrefetchRef.current = fetchAudio(nextSentence, voice, controller.signal)
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
                console.warn("[TTS-Stream] Sentence playback failed:", err instanceof Error ? err.message : err)
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
            streamSentencesSentRef.current = 0
            streamQueueRef.current = []
            streamPlayingRef.current = false
            streamFinishedRef.current = false
            streamPrefetchRef.current = null
            const controller = new AbortController()
            streamControllerRef.current = controller
            abortRef.current = controller
        },
        [stopPlayback],
    )

    const feedStreamingText = useCallback(
        (fullText: string) => {
            if (!streamControllerRef.current || streamControllerRef.current.signal.aborted) return

            const clean = stripMarkdownForTTS(fullText)
            const sentences = splitIntoSentences(clean)

            const completeSentences = sentences.slice(0, -1)
            const alreadySent = streamSentencesSentRef.current

            if (completeSentences.length > alreadySent) {
                const newSentences = completeSentences.slice(alreadySent)
                streamQueueRef.current.push(...newSentences)
                streamSentencesSentRef.current = completeSentences.length
                drainStreamQueue()
            }
        },
        [drainStreamQueue],
    )

    const finishStreamingWithText = useCallback(
        (displayText: string) => {
            if (!streamControllerRef.current || streamControllerRef.current.signal.aborted) return

            const clean = stripMarkdownForTTS(displayText)
            const sentences = splitIntoSentences(clean)
            const alreadySent = streamSentencesSentRef.current

            if (sentences.length > alreadySent) {
                const remaining = sentences.slice(alreadySent)
                streamQueueRef.current.push(...remaining)
                streamSentencesSentRef.current = sentences.length
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
        finishStreaming: finishStreamingWithText,
        stop: stopPlayback,
        warmUp,
    }
}
