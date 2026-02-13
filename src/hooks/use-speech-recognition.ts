"use client"

/**
 * @file use-speech-recognition.ts
 *
 * @description Hook for speech-to-text via OpenAI Whisper. Records audio using
 * the MediaRecorder API, detects silence via AudioContext/AnalyserNode, then
 * sends the recording to /api/agents/stt for transcription.
 *
 * Works in ALL modern browsers (Chrome, Firefox, Safari, Edge) — no vendor
 * prefix hacks needed. Falls back gracefully if microphone is denied.
 *
 * @returns isListening, isProcessing, transcript, interimTranscript, start, stop, isSupported
 *
 * @related
 * - src/app/api/agents/stt/route.ts - Server-side Whisper proxy
 * - src/app/(platform)/agents/brief-specialist-dialog.tsx - Primary consumer
 */

import { useState, useCallback, useRef, useEffect } from "react"

// ─── Configuration ──────────────────────────────────────────────────────────

/** RMS threshold below which audio is considered silence (0-1 scale) */
const SILENCE_THRESHOLD = 0.01

/** Maximum recording duration in ms (safety valve) */
const MAX_RECORDING_MS = 120_000 // 2 minutes

/** Preferred MIME types in order of preference */
const PREFERRED_MIME_TYPES = [
    "audio/webm;codecs=opus",  // Chrome, Edge, Firefox
    "audio/webm",              // Chrome, Edge fallback
    "audio/ogg;codecs=opus",   // Firefox fallback
    "audio/mp4",               // Safari
    "audio/mpeg",              // Fallback
] as const

// ─── Types ──────────────────────────────────────────────────────────────────

interface UseSpeechRecognitionOptions {
    /** Language hint for recognition (default: "en") — passed to Whisper */
    lang?: string
    /** Auto-stop after this many ms of silence (default: 3000) */
    silenceTimeout?: number
    /** Called when final transcript is produced */
    onResult?: (transcript: string) => void
    /** Called when an error occurs */
    onError?: (error: string) => void
}

interface UseSpeechRecognitionReturn {
    /** Whether the browser supports audio recording */
    isSupported: boolean
    /** Whether currently recording */
    isListening: boolean
    /** Whether audio is being transcribed by Whisper */
    isProcessing: boolean
    /** The accumulated final transcript */
    transcript: string
    /** Current interim status text (empty during recording, "Transcribing..." during processing) */
    interimTranscript: string
    /** Start listening */
    start: () => void
    /** Stop listening */
    stop: () => void
    /** Reset transcript */
    reset: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Pick the best supported MIME type for MediaRecorder */
function getSupportedMimeType(): string {
    if (typeof MediaRecorder === "undefined") return ""
    for (const mime of PREFERRED_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mime)) return mime
    }
    return "" // Let MediaRecorder pick its default
}

/** Check if the browser supports MediaRecorder + getUserMedia */
function checkSupport(): boolean {
    if (typeof window === "undefined") return false
    return (
        typeof MediaRecorder !== "undefined" &&
        typeof navigator?.mediaDevices?.getUserMedia === "function"
    )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook for speech-to-text via OpenAI Whisper.
 *
 * Records audio with MediaRecorder, auto-stops on silence, and sends
 * the recording to the /api/agents/stt endpoint for transcription.
 *
 * @example
 * const speech = useSpeechRecognition({
 *   onResult: (text) => setBriefText(prev => prev + " " + text),
 * })
 * // In a button: onClick={() => speech.isListening ? speech.stop() : speech.start()}
 */
export function useSpeechRecognition(
    options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
    const { silenceTimeout = 3000, onResult, onError } = options

    const [isListening, setIsListening] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [interimTranscript, setInterimTranscript] = useState("")

    // Stable refs for callbacks and resources
    const onResultRef = useRef(onResult)
    onResultRef.current = onResult
    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const silenceStartRef = useRef<number | null>(null)
    const animFrameRef = useRef<number | null>(null)
    const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isListeningRef = useRef(false)
    const mimeTypeRef = useRef("")

    const isSupported = checkSupport()

    // ─── Cleanup ────────────────────────────────────────────────────────

    const cleanup = useCallback(() => {
        // Stop animation frame loop
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current)
            animFrameRef.current = null
        }
        // Clear max duration timer
        if (maxDurationTimerRef.current) {
            clearTimeout(maxDurationTimerRef.current)
            maxDurationTimerRef.current = null
        }
        // Stop MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
        }
        mediaRecorderRef.current = null
        // Stop all media tracks (releases microphone)
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
            streamRef.current = null
        }
        // Close AudioContext
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            audioContextRef.current.close().catch(() => { /* ignore */ })
            audioContextRef.current = null
        }
        analyserRef.current = null
        silenceStartRef.current = null
        isListeningRef.current = false
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup()
    }, [cleanup])

    // ─── Transcribe ─────────────────────────────────────────────────────

    /**
     * Send recorded audio to the Whisper API and deliver the transcript.
     */
    const transcribe = useCallback(async (audioBlob: Blob) => {
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

    // ─── Silence Detection ──────────────────────────────────────────────

    /**
     * Monitor audio levels via AnalyserNode. Auto-stops recording after
     * `silenceTimeout` ms of continuous silence.
     */
    const monitorSilence = useCallback(() => {
        const analyser = analyserRef.current
        if (!analyser || !isListeningRef.current) return

        const dataArray = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(dataArray)

        // Calculate RMS (root mean square) of the audio signal
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms < SILENCE_THRESHOLD) {
            // Audio is silent
            if (silenceStartRef.current === null) {
                silenceStartRef.current = Date.now()
            } else if (Date.now() - silenceStartRef.current > silenceTimeout) {
                // Silence exceeded threshold — auto-stop
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop()
                }
                return
            }
        } else {
            // Audio detected — reset silence timer
            silenceStartRef.current = null
        }

        // Continue monitoring
        if (isListeningRef.current) {
            animFrameRef.current = requestAnimationFrame(monitorSilence)
        }
    }, [silenceTimeout])

    // ─── Start Recording ────────────────────────────────────────────────

    const start = useCallback(async () => {
        if (!isSupported) return
        if (isListeningRef.current) return

        // Clean up any previous session
        cleanup()
        audioChunksRef.current = []

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })
            streamRef.current = stream

            // Set up AudioContext + AnalyserNode for silence detection
            const audioContext = new AudioContext()
            audioContextRef.current = audioContext
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser
            const source = audioContext.createMediaStreamSource(stream)
            source.connect(analyser)

            // Pick best MIME type
            const mimeType = getSupportedMimeType()
            mimeTypeRef.current = mimeType

            // Create MediaRecorder
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            mediaRecorderRef.current = recorder

            // Collect chunks
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            // When recording stops, assemble the blob and transcribe
            recorder.onstop = () => {
                setIsListening(false)
                isListeningRef.current = false

                // Stop silence monitoring
                if (animFrameRef.current !== null) {
                    cancelAnimationFrame(animFrameRef.current)
                    animFrameRef.current = null
                }
                if (maxDurationTimerRef.current) {
                    clearTimeout(maxDurationTimerRef.current)
                    maxDurationTimerRef.current = null
                }

                // Release microphone
                stream.getTracks().forEach((track) => track.stop())
                streamRef.current = null

                // Close AudioContext
                if (audioContextRef.current && audioContextRef.current.state !== "closed") {
                    audioContextRef.current.close().catch(() => { /* ignore */ })
                }

                // Build audio blob and send to Whisper
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                })
                audioChunksRef.current = []

                if (audioBlob.size > 0) {
                    transcribe(audioBlob)
                }
            }

            recorder.onerror = () => {
                console.warn("[SpeechRecognition] MediaRecorder error")
                cleanup()
                setIsListening(false)
                onErrorRef.current?.("Recording failed")
            }

            // Start recording (collect data every 250ms for fine-grained chunks)
            recorder.start(250)
            isListeningRef.current = true
            setIsListening(true)
            setTranscript("")
            setInterimTranscript("")
            silenceStartRef.current = null

            // Start silence monitoring
            animFrameRef.current = requestAnimationFrame(monitorSilence)

            // Safety valve: auto-stop after max duration
            maxDurationTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop()
                }
            }, MAX_RECORDING_MS)

        } catch (err) {
            const message = err instanceof Error ? err.message : "Microphone access denied"
            console.warn("[SpeechRecognition] Start failed:", message)
            cleanup()
            setIsListening(false)

            // Provide a user-friendly error for common permission issues
            if (message.includes("Permission") || message.includes("NotAllowed")) {
                onErrorRef.current?.("Microphone access denied. Please allow microphone access in your browser settings.")
            } else {
                onErrorRef.current?.(message)
            }
        }
    }, [isSupported, cleanup, transcribe, monitorSilence])

    // ─── Stop Recording ─────────────────────────────────────────────────

    const stop = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop()
        }
    }, [])

    // ─── Reset ──────────────────────────────────────────────────────────

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
