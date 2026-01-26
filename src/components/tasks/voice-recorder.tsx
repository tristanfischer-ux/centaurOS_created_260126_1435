"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Mic, Square, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { useRouter } from "next/navigation"

export function VoiceRecorder() {
    const router = useRouter()
    const [isRecording, setIsRecording] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            mediaRecorderRef.current = new MediaRecorder(stream)
            chunksRef.current = []

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
                await processAudio(audioBlob)
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorderRef.current.start()
            setIsRecording(true)
        } catch (error) {
            console.error("Error accessing microphone:", error)
            toast.error("Could not access microphone.")
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
        const formData = new FormData()
        formData.append("file", audioBlob, "recording.webm")

        try {
            const response = await fetch("/api/voice-to-task", {
                method: "POST",
                body: formData,
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "Failed to process voice command")
            }

            toast.success("Task created from voice command!")
            toast.success("Task created from voice command!")
            router.refresh()
        } catch (error) {
            console.error("Voice processing error:", error)
            toast.error("Failed to create task from voice.")
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50">
            <Button
                size="icon"
                className={`h-14 w-14 rounded-full shadow-lg transition-all duration-300 ${isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse ring-4 ring-red-200"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
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
