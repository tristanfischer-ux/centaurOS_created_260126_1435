"use client"

/**
 * @file use-tts.ts
 *
 * @description Hook for text-to-speech playback via the /api/agents/tts endpoint.
 * Uses AudioContext for reliable playback that survives browser autoplay policies.
 * The AudioContext is "unlocked" once during a user gesture (via warmUp()), then
 * all subsequent playback works regardless of timing.
 *
 * @returns play, stop, warmUp, isPlaying, isLoading, voiceEnabled, setVoiceEnabled
 */

import { useState, useCallback, useRef, useEffect } from "react"

const VOICE_ENABLED_KEY = "specialist-voice-enabled"

/** Read the voice-enabled preference from localStorage */
function getStoredVoiceEnabled(): boolean {
    if (typeof window === "undefined") return true
    const stored = localStorage.getItem(VOICE_ENABLED_KEY)
    // Default to true for first-time users (delightful first impression)
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
    /** Whether voice output is enabled */
    voiceEnabled: boolean
    /** Toggle voice output on/off (persisted to localStorage) */
    setVoiceEnabled: (enabled: boolean) => void
    /** Whether audio is currently loading from the API */
    isLoading: boolean
    /** Whether audio is currently playing */
    isPlaying: boolean
    /** Play the given text with the given voice */
    play: (text: string, voice: string) => Promise<void>
    /**
     * Play text in sentence-sized chunks for faster time-to-first-audio.
     * First sentence plays immediately after synthesis; subsequent chunks play in sequence.
     */
    playChunked: (text: string, voice: string) => Promise<void>
    /** Stop any currently playing audio */
    stop: () => void
    /**
     * Unlock audio playback by resuming the AudioContext.
     * MUST be called from a user gesture (click, keypress) to satisfy
     * browser autoplay policies. Call this when the user clicks "Go" or
     * any interaction that should enable subsequent audio.
     */
    warmUp: () => void
}

/**
 * Hook for specialist text-to-speech via OpenAI gpt-4o-mini-tts.
 *
 * Uses Web Audio API (AudioContext) instead of HTMLAudioElement for reliable
 * playback. The AudioContext is created and resumed on the first user gesture
 * (via warmUp), then subsequent play() calls work even after long async gaps.
 *
 * @example
 * const tts = useTts()
 * // On user click:
 * tts.warmUp()
 * // Later, after async work:
 * if (tts.voiceEnabled) await tts.play(responseText, specialist.voice)
 */
export function useTts(): UseTtsReturn {
    const [voiceEnabled, setVoiceEnabledState] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)

    const audioContextRef = useRef<AudioContext | null>(null)
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    // Initialize from localStorage on mount
    useEffect(() => {
        setVoiceEnabledState(getStoredVoiceEnabled())
    }, [])

    /**
     * Unlock AudioContext on user gesture. Call this from click/keypress handlers
     * BEFORE any async work, so subsequent play() calls succeed.
     */
    const warmUp = useCallback(() => {
        if (typeof window === "undefined") return
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext()
            }
            if (audioContextRef.current.state === "suspended") {
                audioContextRef.current.resume().catch(() => {
                    // Ignore — resume may fail if called outside gesture context
                })
            }
        } catch (err) {
            console.warn("[TTS] AudioContext warmUp failed:", err)
        }
    }, [])

    /** Stop any in-flight fetch or active playback */
    const stopPlayback = useCallback(() => {
        // Abort any in-flight fetch
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        // Stop current AudioBufferSourceNode
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop()
            } catch {
                // May already be stopped — safe to ignore
            }
            sourceNodeRef.current = null
        }
        setIsLoading(false)
        setIsPlaying(false)
    }, [])

    /** Persist voice preference and stop playback if disabling */
    const setVoiceEnabled = useCallback((enabled: boolean) => {
        setVoiceEnabledState(enabled)
        if (typeof window !== "undefined") {
            localStorage.setItem(VOICE_ENABLED_KEY, String(enabled))
        }
        if (!enabled) {
            stopPlayback()
        }
    }, [stopPlayback])

    /**
     * Play text with a specific voice via the TTS API.
     * Uses AudioContext.decodeAudioData for reliable playback.
     * Resolves when audio finishes playing.
     */
    const play = useCallback(async (text: string, voice: string): Promise<void> => {
        // Stop any existing playback first
        stopPlayback()

        if (!text.trim()) return

        // Ensure AudioContext exists and is running
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext()
        }
        const ctx = audioContextRef.current
        if (ctx.state === "suspended") {
            try {
                await ctx.resume()
            } catch {
                console.warn("[TTS] AudioContext resume failed — playback may not work")
                return
            }
        }

        const controller = new AbortController()
        abortRef.current = controller
        setIsLoading(true)

        try {
            const res = await fetch("/api/agents/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice }),
                signal: controller.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "TTS failed" }))
                console.warn("[TTS] API error:", errData.error)
                setIsLoading(false)
                return
            }

            const arrayBuffer = await res.arrayBuffer()

            // Check if aborted while waiting
            if (controller.signal.aborted) return

            // Decode audio data via AudioContext
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

            if (controller.signal.aborted) return

            // Create and play buffer source
            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)
            sourceNodeRef.current = source

            setIsLoading(false)
            setIsPlaying(true)

            return new Promise<void>((resolve) => {
                source.onended = () => {
                    setIsPlaying(false)
                    sourceNodeRef.current = null
                    resolve()
                }
                source.start()
            })
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                return
            }
            console.warn("[TTS] Play failed:", err instanceof Error ? err.message : err)
            setIsLoading(false)
            setIsPlaying(false)
        }
    }, [stopPlayback])

    /**
     * Play text in sentence-sized chunks. First chunk plays as soon as synthesized;
     * reduces perceived delay vs. synthesizing and playing the full response at once.
     */
    const playChunked = useCallback(
        async (text: string, voice: string): Promise<void> => {
            stopPlayback()

            const clean = stripMarkdownForTTS(text)
            if (!clean.trim()) return

            const chunks = splitIntoSentences(clean)
            if (chunks.length === 0) return

            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext()
            }
            const ctx = audioContextRef.current
            if (ctx.state === "suspended") {
                try {
                    await ctx.resume()
                } catch {
                    console.warn("[TTS] AudioContext resume failed — playback may not work")
                    return
                }
            }

            const controller = new AbortController()
            abortRef.current = controller

            const fetchAudio = async (chunkText: string): Promise<ArrayBuffer | null> => {
                const res = await fetch("/api/agents/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: chunkText, voice }),
                    signal: controller.signal,
                })
                if (!res.ok) return null
                return res.arrayBuffer()
            }

            const playBuffer = (buffer: ArrayBuffer): Promise<void> =>
                new Promise((resolve, reject) => {
                    if (controller.signal.aborted) {
                        resolve()
                        return
                    }
                    ctx.decodeAudioData(buffer)
                        .then((audioBuffer) => {
                            if (controller.signal.aborted) {
                                resolve()
                                return
                            }
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
                        .catch(reject)
                })

            try {
                for (let i = 0; i < chunks.length; i++) {
                    if (controller.signal.aborted) return

                    const chunk = chunks[i].trim()
                    if (!chunk) continue

                    setIsLoading(true)
                    const buffer = await fetchAudio(chunk)
                    if (controller.signal.aborted) return
                    if (!buffer) {
                        console.warn("[TTS] Chunk fetch failed:", i)
                        continue
                    }

                    setIsLoading(false)
                    setIsPlaying(true)
                    await playBuffer(buffer)
                    setIsPlaying(false)

                    if (controller.signal.aborted) return
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
        [stopPlayback],
    )

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort()
            if (sourceNodeRef.current) {
                try {
                    sourceNodeRef.current.stop()
                } catch {
                    // Already stopped
                }
            }
            if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                audioContextRef.current.close().catch(() => {
                    // Ignore close errors on unmount
                })
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
        stop: stopPlayback,
        warmUp,
    }
}
