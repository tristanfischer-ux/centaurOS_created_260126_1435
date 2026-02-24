"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import { Input, type InputProps } from "@/components/ui/input"
import { SpeechButton } from "@/components/ui/speech-button"
import { cn } from "@/lib/utils"

interface InputWithSpeechProps extends InputProps {
  /** Show a speech-to-text mic button inside the input */
  enableSpeech?: boolean
  /** Called when speech transcript is produced — append to your state */
  onSpeechTranscript?: (text: string) => void
}

/**
 * Input with optional speech-to-text mic button.
 *
 * @description Drop-in replacement for Input. When enableSpeech is true,
 * wraps in a relative container and adds a mic button on the right.
 * When enableSpeech is false/omitted, renders a plain Input.
 *
 * @example
 * <InputWithSpeech
 *   enableSpeech
 *   value={name}
 *   onChange={(e) => setName(e.target.value)}
 *   onSpeechTranscript={(text) => setName(prev => prev ? prev + " " + text : text)}
 * />
 */
const InputWithSpeech = React.forwardRef<HTMLInputElement, InputWithSpeechProps>(
  ({ enableSpeech = false, onSpeechTranscript, className, ...props }, ref) => {
    const [isListening, setIsListening] = useState(false)

    const handleTranscript = useCallback(
      (text: string) => {
        onSpeechTranscript?.(text)
      },
      [onSpeechTranscript]
    )

    if (!enableSpeech) {
      return <Input ref={ref} className={className} {...props} />
    }

    return (
      <div className="relative w-full">
        <Input
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
          className="absolute right-1 top-1/2 -translate-y-1/2"
        />
      </div>
    )
  }
)
InputWithSpeech.displayName = "InputWithSpeech"

export { InputWithSpeech }
export type { InputWithSpeechProps }
