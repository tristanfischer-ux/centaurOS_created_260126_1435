"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import { Textarea, type TextareaProps } from "@/components/ui/textarea"
import { SpeechButton } from "@/components/ui/speech-button"
import { cn } from "@/lib/utils"

interface TextareaWithSpeechProps extends TextareaProps {
  /** Show a speech-to-text mic button inside the textarea */
  enableSpeech?: boolean
  /** Called when speech transcript is produced — append to your state */
  onSpeechTranscript?: (text: string) => void
}

/**
 * Textarea with optional speech-to-text mic button.
 *
 * @description Drop-in replacement for Textarea. When enableSpeech is true,
 * wraps in a relative container and adds a mic button at the top-right.
 * When enableSpeech is false/omitted, renders a plain Textarea.
 *
 * @example
 * <TextareaWithSpeech
 *   enableSpeech
 *   value={description}
 *   onChange={(e) => setDescription(e.target.value)}
 *   onSpeechTranscript={(text) => setDescription(prev => prev ? prev + " " + text : text)}
 * />
 */
const TextareaWithSpeech = React.forwardRef<HTMLTextAreaElement, TextareaWithSpeechProps>(
  ({ enableSpeech = false, onSpeechTranscript, className, ...props }, ref) => {
    const [isListening, setIsListening] = useState(false)

    const handleTranscript = useCallback(
      (text: string) => {
        onSpeechTranscript?.(text)
      },
      [onSpeechTranscript]
    )

    if (!enableSpeech) {
      return <Textarea ref={ref} className={className} {...props} />
    }

    return (
      <div className="relative w-full">
        <Textarea
          ref={ref}
          className={cn(
            "pr-10",
            isListening && "border-destructive/50",
            className
          )}
          {...props}
        />
        <SpeechButton
          onTranscript={handleTranscript}
          onListeningChange={setIsListening}
          disabled={props.disabled}
          className="absolute right-1 top-1"
        />
      </div>
    )
  }
)
TextareaWithSpeech.displayName = "TextareaWithSpeech"

export { TextareaWithSpeech }
export type { TextareaWithSpeechProps }
