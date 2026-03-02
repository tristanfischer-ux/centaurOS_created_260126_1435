"use client"

/**
 * @file use-speech-recognition.ts
 *
 * @description Hook for speech-to-text using the browser's native Web Speech API
 * as the primary engine (real-time, ~100-300ms latency, zero API cost), with
 * OpenAI Whisper as a fallback for unsupported browsers (Firefox).
 *
 * DECISION: Browser Web Speech API instead of Whisper-only. The previous
 * implementation sent recorded audio blobs to /api/agents/stt -> OpenAI Whisper,
 * which added 4-6 seconds of latency per utterance. The Web Speech API provides
 * real-time interim results as the user speaks, making voice input feel instant.
 * Whisper is kept as a fallback for Firefox (which lacks SpeechRecognition).
 *
 * @returns isListening, isProcessing, transcript, interimTranscript, start, stop, isSupported
 *
 * @related
 * - src/app/api/agents/stt/route.ts - Whisper fallback route
 * - src/app/(platform)/agents/brief-specialist-dialog.tsx - Primary consumer
 */

import { useState, useCallback, useRef, useEffect } from "react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface SpeechRecognitionEvent {
    resultIndex: number
    results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
    error: string
    message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
}

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognitionInstance
        webkitSpeechRecognition: new () => SpeechRecognitionInstance
    }
}

interface UseSpeechRecognitionOptions {
    /** Language hint for recognition (default: "en-US") */
    lang?: string
    /** Auto-stop after this many ms of silence (default: 3000) — Whisper fallback only */
    silenceTimeout?: number
    /** Called when final transcript is produced */
    onResult?: (transcript: string) => void
    /** Called with interim (partial) transcript as user speaks — Web Speech API only */
    onInterim?: (interim: string) => void
    /** Called when an error occurs */
    onError?: (error: string) => void
}

interface UseSpeechRecognitionReturn {
    /** Whether the browser supports any form of speech recognition */
    isSupported: boolean
    /** Whether currently recording/listening */
    isListening: boolean
    /** Whether audio is being transcribed (Whisper fallback only; always false for native) */
    isProcessing: boolean
    /** The accumulated final transcript */
    transcript: string
    /** Current interim text (real-time partial result from Web Speech API) */
    interimTranscript: string
    /** Start listening */
    start: () => void
    /** Stop listening */
    stop: () => void
    /** Reset transcript */
    reset: () => void
}

// ─── Detection ──────────────────────────────────────────────────────────────

/** Check if the browser supports the native Web Speech API */
function hasNativeSpeechRecognition(): boolean {
    if (typeof window === "undefined") return false
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/** Check if the browser supports MediaRecorder (for Whisper fallback) */
function hasMediaRecorder(): boolean {
    if (typeof window === "undefined") return false
    return (
        typeof MediaRecorder !== "undefined" &&
        typeof navigator?.mediaDevices?.getUserMedia === "function"
    )
}

// ─── Whisper Fallback Helpers ───────────────────────────────────────────────

const SILENCE_THRESHOLD = 0.01
const MAX_RECORDING_MS = 120_000

const PREFERRED_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
] as const

function getSupportedMimeType(): string {
    if (typeof MediaRecorder === "undefined") return ""
    for (const mime of PREFERRED_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mime)) return mime
    }
    return ""
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook for speech-to-text with real-time browser-native recognition.
 *
 * Uses the Web Speech API (Chrome, Edge, Safari) for instant results as the
 * user speaks. Falls back to OpenAI Whisper via /api/agents/stt for browsers
 * without native support (Firefox).
 *
 * @example
 * const speech = useSpeechRecognition({
 *   onResult: (text) => setBriefText(prev => prev + " " + text),
 *   onInterim: (partial) => setInterimText(partial),
 * })
 */
export function useSpeechRecognition(
    options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
    const { lang = "en-US", silenceTimeout = 3000, onResult, onInterim, onError } = options

    const [isListening, setIsListening] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [interimTranscript, setInterimTranscript] = useState("")

    const onResultRef = useRef(onResult)
    onResultRef.current = onResult
    const onInterimRef = useRef(onInterim)
    onInterimRef.current = onInterim
    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    // INTENT: Defer browser capability detection to after hydration. During SSR
    // both checks return false (no `window`), so isSupported must start as false
    // on both server and client to avoid hydration mismatch in SpeechButton.
    const useNativeRef = useRef(false)
    const [isSupported, setIsSupported] = useState(false)

    useEffect(() => {
        const native = hasNativeSpeechRecognition()
        useNativeRef.current = native
        setIsSupported(native || hasMediaRecorder())
    }, [])

    // ─── Native Web Speech API refs ─────────────────────────────────────
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
    const isListeningRef = useRef(false)

    // ─── Whisper fallback refs ──────────────────────────────────────────
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const silenceStartRef = useRef<number | null>(null)
    const animFrameRef = useRef<number | null>(null)
    const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const mimeTypeRef = useRef("")

    // ─── Cleanup ────────────────────────────────────────────────────────

    const cleanup = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.abort() } catch { /* ignore */ }
            recognitionRef.current = null
        }
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current)
            animFrameRef.current = null
        }
        if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current)
            maxDurationTimerRef.current = null
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
        }
        mediaRecorderRef.current = null
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
            streamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            audioContextRef.current.close().catch(() => { /* ignore */ })
            audioContextRef.current = null
        }
        analyserRef.current = null
        silenceStartRef.current = null
        isListeningRef.current = false
    }, [])

    useEffect(() => {
        return () => cleanup()
    }, [cleanup])

    // ─── Native Web Speech API Start ────────────────────────────────────

    const startNative = useCallback(() => {
        if (isListeningRef.current) return

        const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognitionClass()

        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = lang
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            isListeningRef.current = true
            setIsListening(true)
            setInterimTranscript("")
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalText = ""
            let interimText = ""

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i]
                const text = result[0].transcript

                if (result.isFinal) {
                    finalText += text
                } else {
                    interimText += text
                }
            }

            if (interimText) {
                setInterimTranscript(interimText)
                onInterimRef.current?.(interimText)
            }

            if (finalText) {
                const trimmed = finalText.trim()
                setTranscript(trimmed)
                setInterimTranscript("")
                onResultRef.current?.(trimmed)
            }
        }

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === "no-speech" || event.error === "aborted") return

            console.warn("[SpeechRecognition] Native error:", event.error)

            if (event.error === "not-allowed") {
                onErrorRef.current?.("Microphone access denied. Please allow microphone access in your browser settings.")
            } else {
                onErrorRef.current?.(event.error)
            }
        }

        recognition.onend = () => {
            isListeningRef.current = false
            setIsListening(false)
            setInterimTranscript("")
        }

        recognitionRef.current = recognition

        try {
            recognition.start()
        } catch (err) {
            console.warn("[SpeechRecognition] Native start failed:", err)
            onErrorRef.current?.("Speech recognition failed to start")
            isListeningRef.current = false
            setIsListening(false)
        }
    }, [lang])

    const stopNative = useCallback(() => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop()
            } catch { /* ignore */ }
        }
    }, [])

    // ─── Whisper Fallback Transcribe ────────────────────────────────────

    const transcribeWhisper = useCallback(async (audioBlob: Blob) => {
        if (audioBlob.size === 0) return

        setIsProcessing(true)
        setInterimTranscript("Transcribing...")

        try {
            const formData = new FormData()
            formData.append("audio", audioBlob, `recording.${mimeTypeRef.current.includes("mp4") ? "mp4" : "webm"}`)

            const res = await fetch("/api/agents/stt", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Transcription failed" }))
                const errorMsg = errData.error || `HTTP ${res.status}`
                console.warn("[SpeechRecognition] STT API error:", errorMsg)
                onErrorRef.current?.(errorMsg)
                return
            }

            const data = await res.json() as { transcript: string }
            const text = data.transcript?.trim()

            if (text) {
                setTranscript(text)
                onResultRef.current?.(text)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Transcription failed"
            console.error("[SpeechRecognition] Transcription error:", message)
            onErrorRef.current?.(message)
        } finally {
            setIsProcessing(false)
            setInterimTranscript("")
        }
    }, [])

    // ─── Whisper Fallback Silence Detection ─────────────────────────────

    const monitorSilence = useCallback(() => {
        const analyser = analyserRef.current
        if (!analyser || !isListeningRef.current) return

        const dataArray = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms < SILENCE_THRESHOLD) {
            if (silenceStartRef.current === null) {
                silenceStartRef.current = Date.now()
            } else if (Date.now() - silenceStartRef.current > silenceTimeout) {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop()
                }
                return
            }
        } else {
            silenceStartRef.current = null
        }

        if (isListeningRef.current) {
            animFrameRef.current = requestAnimationFrame(monitorSilence)
        }
    }, [silenceTimeout])

    // ─── Whisper Fallback Start ─────────────────────────────────────────

    const startWhisper = useCallback(async () => {
        if (isListeningRef.current) return

        cleanup()
        audioChunksRef.current = []

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            })
            streamRef.current = stream

            const audioContext = new AudioContext()
            audioContextRef.current = audioContext
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser
            const source = audioContext.createMediaStreamSource(stream)
            source.connect(analyser)

            const mimeType = getSupportedMimeType()
            mimeTypeRef.current = mimeType

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data)
            }

            recorder.onstop = () => {
                setIsListening(false)
                isListeningRef.current = false

                if (animFrameRef.current !== null) {
                    cancelAnimationFrame(animFrameRef.current)
                    animFrameRef.current = null
                }
                if (maxDurationTimerRef.current) {
                    clearTimeout(maxDurationTimerRef.current)
                    maxDurationTimerRef.current = null
                }

                stream.getTracks().forEach((track) => track.stop())
                streamRef.current = null

                if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                    audioContextRef.current.close().catch(() => { /* ignore */ })
                }

                const audioBlob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                })
                audioChunksRef.current = []

                if (audioBlob.size > 0) {
                    transcribeWhisper(audioBlob)
                }
            }

            recorder.onerror = () => {
                console.warn("[SpeechRecognition] MediaRecorder error")
                cleanup()
                setIsListening(false)
                onErrorRef.current?.("Recording failed")
            }

            recorder.start(250)
            isListeningRef.current = true
            setIsListening(true)
            setTranscript("")
            setInterimTranscript("")
            silenceStartRef.current = null

            animFrameRef.current = requestAnimationFrame(monitorSilence)

            maxDurationTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop()
                }
            }, MAX_RECORDING_MS)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone access denied"
            console.warn("[SpeechRecognition] Whisper fallback start failed:", message)
            cleanup()
            setIsListening(false)

            if (message.includes("Permission") || message.includes("NotAllowed")) {
                onErrorRef.current?.("Microphone access denied. Please allow microphone access in your browser settings.")
            } else {
                onErrorRef.current?.(message)
            }
        }
    }, [cleanup, transcribeWhisper, monitorSilence])

    const stopWhisper = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop()
        }
    }, [])

    // ─── Public API (delegates to native or fallback) ───────────────────

    const start = useCallback(() => {
        if (!isSupported) return
        if (useNativeRef.current) {
            startNative()
        } else {
            startWhisper()
        }
    }, [isSupported, startNative, startWhisper])

    const stop = useCallback(() => {
        if (useNativeRef.current) {
            stopNative()
        } else {
            stopWhisper()
        }
    }, [stopNative, stopWhisper])

    const reset = useCallback(() => {
        setTranscript("")
        setInterimTranscript("")
    }, [])

    return {
        isSupported,
        isListening,
        isProcessing,
        transcript,
        interimTranscript,
        start,
        stop,
        reset,
    }
}
