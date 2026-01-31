"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Mic, Square, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface VoiceRecorderProps {
    onTaskParsed?: (data: { title: string; description: string; assignee_type: string; due_date?: string }) => void
    className?: string
}

export function VoiceRecorder({ onTaskParsed, className }: VoiceRecorderProps) {
    const router = useRouter()
    const [isRecording, setIsRecording] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [recordingDuration, setRecordingDuration] = useState(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [])

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            mediaRecorderRef.current = new MediaRecorder(stream)
            chunksRef.current = []
            setRecordingDuration(0)

            // Start recording duration timer
            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1)
            }, 1000)

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            mediaRecorderRef.current.onstop = async () => {
                // Clear timer
                if (timerRef.current) {
                    clearInterval(timerRef.current)
                    timerRef.current = null
                }

                const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
                await processAudio(audioBlob)
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorderRef.current.start()
            setIsRecording(true)
            toast.info("Recording... Speak your task command")
        } catch (error) {
            console.error("Error accessing microphone:", error)
            toast.error("Could not access microphone. Please check permissions.")
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    const processAudio = async (audioBlob: Blob) => {
        setIsProcessing(true)
        toast.info(onTaskParsed ? "Analyzing voice command..." : "Processing your voice command...")

        const formData = new FormData()
        formData.append("file", audioBlob, "recording.webm")

        // If we have a callback, use 'parse' mode to get JSON back without creating DB record
        if (onTaskParsed) {
            formData.append("mode", "parse")
        }

        try {
            const response = await fetch("/api/voice-to-task", {
                method: "POST",
                body: formData,
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to process voice command")
            }

            if (onTaskParsed && data.task) {
                // parsing mode
                onTaskParsed(data.task)
                toast.success("Voice command analyzed!")
            } else {
                // direct creation mode
                toast.success(`Task created: "${data.task?.title || 'New Task'}"`, {
                    description: data.transcript ? `"${data.transcript.slice(0, 80)}..."` : undefined,
                    duration: 5000,
                })
                router.refresh()
            }

        } catch (error) {
            console.error("Voice processing error:", error)
            toast.error("Failed to process voice. Please try again.")
        } finally {
            setIsProcessing(false)
            setRecordingDuration(0)
        }
    }

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Default Fixed Style (Legacy / Floating)
    if (!className && !onTaskParsed) {
        return (
            <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-2">
                {/* Recording indicator */}
                {isRecording && (
                    <div className="bg-destructive text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse shadow-lg">
                        🎙️ {formatDuration(recordingDuration)}
                    </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                    <div className="bg-status-warning text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
                        🧠 Analyzing...
                    </div>
                )}

                <Button
                    size="icon"
                    className={`h-14 w-14 rounded-full shadow-lg transition-all duration-300 ${isRecording
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

    // Flexible Component Style (Embedded)
    return (
        <div className={className || "flex items-center gap-2"}>
            {isRecording && (
                <span className="text-destructive text-xs font-mono animate-pulse mr-2">
                    {formatDuration(recordingDuration)}
                </span>
            )}
            {isProcessing && (
                <span className="text-status-warning text-xs font-mono animate-pulse mr-2">
                    Analyzing...
                </span>
            )}
            <Button
                type="button" // Important so it doesn't submit parent forms
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
