"use client"

import { useCallback } from "react"
import { Mic, MicOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { cn } from "@/lib/utils"

interface SpeechButtonProps {
  /** Called when final transcript is produced */
  onTranscript: (text: string) => void
  /** Called with interim partial text as user speaks */
  onInterim?: (text: string) => void
  /** Called when listening state changes */
  onListeningChange?: (isListening: boolean) => void
  /** Disable the button */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
  /** Icon size class (default: "h-4 w-4") */
  iconSize?: string
}

/**
 * Self-contained speech-to-text mic button.
 *
 * @description Uses the browser's Web Speech API (with Whisper fallback) to
 * capture voice input and return transcribed text. Renders nothing if the
 * browser doesn't support speech recognition.
 *
 * @example
 * <SpeechButton onTranscript={(text) => setValue(prev => prev + " " + text)} />
 */
export function SpeechButton({
  onTranscript,
  onInterim,
  onListeningChange,
  disabled = false,
  className,
  iconSize = "h-4 w-4",
}: SpeechButtonProps) {
  const handleResult = useCallback(
    (text: string) => {
      onTranscript(text)
    },
    [onTranscript]
  )

  const speech = useSpeechRecognition({
    onResult: handleResult,
    onInterim,
  })

  const handleClick = useCallback(() => {
    if (speech.isListening) {
      speech.stop()
      onListeningChange?.(false)
    } else {
      speech.start()
      onListeningChange?.(true)
    }
  }, [speech, onListeningChange])

  // Graceful degradation — render nothing on unsupported browsers
  if (!speech.isSupported) return null

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={disabled || speech.isProcessing}
      className={cn(
        "h-7 w-7 shrink-0",
        speech.isListening
          ? "text-destructive animate-pulse"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label={
        speech.isProcessing
          ? "Transcribing audio"
          : speech.isListening
            ? "Stop listening"
            : "Start voice input"
      }
    >
      {speech.isProcessing ? (
        <Loader2 className={cn(iconSize, "animate-spin")} />
      ) : speech.isListening ? (
        <MicOff className={iconSize} />
      ) : (
        <Mic className={iconSize} />
      )}
    </Button>
  )
}

export type { SpeechButtonProps }
