"use client"

/**
 * @file use-tts.ts
 *
 * @description Hook for text-to-speech playback via the /api/agents/tts endpoint.
 * Manages audio element lifecycle, handles concurrent requests, and respects
 * a voice-enabled toggle persisted in localStorage.
 *
 * @returns play, stop, isPlaying, isLoading, voiceEnabled, setVoiceEnabled
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

interface UseTtsReturn {
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
    /** Stop any currently playing audio */
    stop: () => void
}

/**
 * Hook for specialist text-to-speech via OpenAI gpt-4o-mini-tts.
 *
 * @example
 * const { play, stop, isPlaying, voiceEnabled, setVoiceEnabled } = useTts()
 * // After specialist responds:
 * if (voiceEnabled) await play(responseText, specialist.voice)
 */
export function useTts(): UseTtsReturn {
    const [voiceEnabled, setVoiceEnabledState] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)

    const audioRef = useRef<HTMLAudioElement | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const objectUrlRef = useRef<string | null>(null)

    // Initialize from localStorage on mount
    useEffect(() => {
        setVoiceEnabledState(getStoredVoiceEnabled())
    }, [])

    // Persist voice preference
    const setVoiceEnabled = useCallback((enabled: boolean) => {
        setVoiceEnabledState(enabled)
        if (typeof window !== "undefined") {
            localStorage.setItem(VOICE_ENABLED_KEY, String(enabled))
        }
        // Stop playback if disabling
        if (!enabled) {
            stopPlayback()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Cleanup helper
    const cleanupAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.removeAttribute("src")
            audioRef.current = null
        }
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = null
        }
    }, [])

    // Stop playback
    const stopPlayback = useCallback(() => {
        // Abort any in-flight fetch
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        cleanupAudio()
        setIsLoading(false)
        setIsPlaying(false)
    }, [cleanupAudio])

    // Play text with a specific voice. Resolves when audio finishes playing.
    const play = useCallback(async (text: string, voice: string): Promise<void> => {
        // Stop any existing playback first
        stopPlayback()

        if (!text.trim()) return

        const controller = new AbortController()
        abortRef.current = controller
        setIsLoading(true)

        return new Promise<void>(async (resolve) => {
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
                    resolve()
                    return
                }

                const blob = await res.blob()

                // Check if aborted while waiting
                if (controller.signal.aborted) {
                    resolve()
                    return
                }

                const url = URL.createObjectURL(blob)
                objectUrlRef.current = url

                const audio = new Audio(url)
                audioRef.current = audio

                audio.onplay = () => {
                    setIsLoading(false)
                    setIsPlaying(true)
                }

                audio.onended = () => {
                    setIsPlaying(false)
                    cleanupAudio()
                    resolve()
                }

                audio.onerror = () => {
                    console.warn("[TTS] Audio playback error")
                    setIsPlaying(false)
                    setIsLoading(false)
                    cleanupAudio()
                    resolve()
                }

                await audio.play()
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    resolve()
                    return
                }
                console.warn("[TTS] Play failed:", err instanceof Error ? err.message : err)
                setIsLoading(false)
                setIsPlaying(false)
                resolve()
            }
        })
    }, [stopPlayback, cleanupAudio])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort()
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.removeAttribute("src")
            }
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        }
    }, [])

    return {
        voiceEnabled,
        setVoiceEnabled,
        isLoading,
        isPlaying,
        play,
        stop: stopPlayback,
    }
}
