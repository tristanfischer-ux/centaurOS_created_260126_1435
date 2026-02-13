"use client"

/**
 * @file use-speech-recognition.ts
 *
 * @description Hook wrapping the browser's Web Speech API (SpeechRecognition)
 * for free, instant speech-to-text. Emits interim results for real-time
 * display and auto-stops after a configurable silence duration.
 *
 * @returns isListening, transcript, interimTranscript, start, stop, isSupported
 */

import { useState, useCallback, useRef, useEffect } from "react"

// Browser SpeechRecognition types (not in lib.dom.d.ts by default)
interface SpeechRecognitionEvent {
    resultIndex: number
    results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
    readonly length: number
    item(index: number): SpeechRecognitionResult
    [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
    readonly length: number
    readonly isFinal: boolean
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
    readonly transcript: string
    readonly confidence: number
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    onerror: ((event: { error: string }) => void) | null
    onstart: (() => void) | null
}

interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInstance
}

/** Get the SpeechRecognition constructor, handling vendor prefixes */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
    if (typeof window === "undefined") return null
    const w = window as unknown as Record<string, unknown>
    return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null
}

interface UseSpeechRecognitionOptions {
    /** Language for recognition (default: "en-US") */
    lang?: string
    /** Auto-stop after this many ms of silence (default: 3000) */
    silenceTimeout?: number
    /** Called when final transcript is produced */
    onResult?: (transcript: string) => void
}

interface UseSpeechRecognitionReturn {
    /** Whether the browser supports speech recognition */
    isSupported: boolean
    /** Whether currently listening */
    isListening: boolean
    /** The accumulated final transcript */
    transcript: string
    /** Current interim (in-progress) transcript */
    interimTranscript: string
    /** Start listening */
    start: () => void
    /** Stop listening */
    stop: () => void
    /** Reset transcript */
    reset: () => void
}

/**
 * Hook for browser-native speech-to-text via the Web Speech API.
 *
 * @example
 * const { isListening, transcript, start, stop, isSupported } = useSpeechRecognition({
 *   onResult: (text) => setBriefText(text),
 * })
 */
export function useSpeechRecognition(
    options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
    const { lang = "en-US", silenceTimeout = 3000, onResult } = options

    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [interimTranscript, setInterimTranscript] = useState("")

    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onResultRef = useRef(onResult)
    onResultRef.current = onResult

    const isSupported = typeof window !== "undefined" && getSpeechRecognition() !== null

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort() } catch { /* ignore */ }
            }
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
        }
    }, [])

    const start = useCallback(() => {
        const SpeechRecognitionClass = getSpeechRecognition()
        if (!SpeechRecognitionClass) return

        // Stop any existing instance
        if (recognitionRef.current) {
            try { recognitionRef.current.abort() } catch { /* ignore */ }
        }

        const recognition = new SpeechRecognitionClass()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = lang

        let finalTranscript = ""

        recognition.onstart = () => {
            setIsListening(true)
            setTranscript("")
            setInterimTranscript("")
            finalTranscript = ""
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = ""

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i]
                if (result.isFinal) {
                    finalTranscript += result[0].transcript
                } else {
                    interim += result[0].transcript
                }
            }

            setTranscript(finalTranscript)
            setInterimTranscript(interim)

            // Reset silence timer on any speech
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
            silenceTimerRef.current = setTimeout(() => {
                recognition.stop()
            }, silenceTimeout)
        }

        recognition.onend = () => {
            setIsListening(false)
            setInterimTranscript("")
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
            // Deliver the final transcript
            if (finalTranscript.trim()) {
                onResultRef.current?.(finalTranscript.trim())
            }
            recognitionRef.current = null
        }

        recognition.onerror = (event: { error: string }) => {
            // "no-speech" and "aborted" are expected, not real errors
            if (event.error !== "no-speech" && event.error !== "aborted") {
                console.warn("[SpeechRecognition] Error:", event.error)
            }
            setIsListening(false)
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
            recognitionRef.current = null
        }

        recognitionRef.current = recognition
        recognition.start()
    }, [lang, silenceTimeout])

    const stop = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch { /* ignore */ }
        }
    }, [])

    const reset = useCallback(() => {
        setTranscript("")
        setInterimTranscript("")
    }, [])

    return {
        isSupported,
        isListening,
        transcript,
        interimTranscript,
        start,
        stop,
        reset,
    }
}
