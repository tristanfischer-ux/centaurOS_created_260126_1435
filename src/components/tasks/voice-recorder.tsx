"use client"

/**
 * @file voice-recorder.tsx
 *
 * @description Voice input component for creating tasks. Uses the browser-native
 * Web Speech API (via useSpeechRecognition) for real-time transcription, then
 * sends the text to /api/voice-to-task for GPT-5.3 task extraction.
 *
 * DECISION: Switched from recording audio blobs and sending them to the server
 * for Whisper transcription to using browser-native STT. This eliminates the
 * 4-6 second Whisper round-trip, giving instant visual feedback as the user speaks.
 */

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Mic, Square, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

interface VoiceRecorderProps {
    onTaskParsed?: (data: { title: string; description: string; assignee_type: string; due_date?: string }) => void
    className?: string
}

export function VoiceRecorder({ onTaskParsed, className }: VoiceRecorderProps) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [recordingDuration, setRecordingDuration] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const speech = useSpeechRecognition({
        onResult: (text: string) => {
            processTranscript(text)
        },
        onError: (error: string) => {
            toast.error(error)
        },
    })

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [])

    const startRecording = useCallback(() => {
        setRecordingDuration(0)
        timerRef.current = setInterval(() => {
            setRecordingDuration((prev) => prev + 1)
        }, 1000)
        speech.start()
    }, [speech])

    const stopRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
        speech.stop()
    }, [speech])

    const processTranscript = useCallback(async (text: string) => {
        if (!text.trim()) return

        setIsProcessing(true)
        toast.info(onTaskParsed ? "Analyzing voice command..." : "Processing your voice command...")

        try {
            const body: Record<string, string> = { text }
            if (onTaskParsed) {
                body.mode = "parse"
            }

            const response = await fetch("/api/voice-to-task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to process voice command")
            }

            if (onTaskParsed && data.task) {
                onTaskParsed(data.task)
                toast.success("Voice command analyzed!")
            } else {
                toast.success(`Task created: "${data.task?.title || "New Task"}"`, {
                    description: data.transcript ? `"${data.transcript.slice(0, 80)}..."` : undefined,
                    duration: 5000,
                })
            }
        } catch (error) {
            console.error("[VoiceRecorder] Processing error:", error)
            toast.error("Failed to process voice. Please try again.")
        } finally {
            setIsProcessing(false)
            setRecordingDuration(0)
            speech.reset()
        }
    }, [onTaskParsed, speech])

    if (!speech.isSupported) return null

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    const isRecording = speech.isListening

    if (!className && !onTaskParsed) {
        return (
            <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-2">
                {isRecording && (
                    <div className="bg-destructive text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse shadow-lg">
                        {speech.interimTranscript || `🎙️ ${formatDuration(recordingDuration)}`}
                    </div>
                )}

                {isProcessing && (
                    <div className="bg-status-warning text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
                        🧠 Analyzing...
                    </div>
                )}

                <Button
                    size="icon"
                    className={`h-14 w-14 rounded-full shadow-lg transition-all duration-300 ${
                        isRecording
                            ? "bg-destructive hover:bg-destructive/90 animate-pulse ring-4 ring-destructive/30"
                            : "bg-status-warning hover:bg-status-warning/90 text-white"
                    }`}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                >
                    {isProcessing ? (
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                    ) : isRecording ? (
                        <Square className="h-6 w-6 text-white fill-current" />
                    ) : (
                        <Mic className="h-7 w-7 text-white" />
                    )}
                </Button>
            </div>
        )
    }

    return (
        <div className={className || "flex items-center gap-2"}>
            {isRecording && (
                <span className="text-destructive text-xs font-mono animate-pulse mr-2">
                    {speech.interimTranscript || formatDuration(recordingDuration)}
                </span>
            )}
            {isProcessing && (
                <span className="text-status-warning text-xs font-mono animate-pulse mr-2">
                    Analyzing...
                </span>
            )}
            <Button
                type="button"
                size="default"
                variant={isRecording ? "destructive" : "secondary"}
                className={`${isRecording ? "animate-pulse" : ""} ${className} relative`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
            >
                {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                    <Square className="h-4 w-4 fill-current" />
                ) : (
                    <Mic className="h-4 w-4" />
                )}
                <span className="ml-2">{isRecording ? "Stop" : "Voice Fill"}</span>
            </Button>
        </div>
    )
}
