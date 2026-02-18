"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"

interface DocumentEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export function DocumentEditor({
  value,
  onChange,
  className,
  placeholder = "Write or paste markdown here. Your specialist can populate this from the conversation.",
}: DocumentEditorProps): React.ReactElement {
  const [showPreview, setShowPreview] = useState(true)

  return (
    <div className={cn("flex flex-1 min-h-0", className)}>
      <div className={cn("flex-1 min-w-0 flex flex-col border-r", showPreview && "w-1/2")}>
        <ScrollArea className="flex-1">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-h-[400px] resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </ScrollArea>
      </div>
      {showPreview && (
        <div className="flex-1 min-w-0 overflow-auto bg-muted/30 p-4">
          <div className="prose prose-sm max-w-none">
            {value ? (
              <Markdown content={value} className="text-sm" />
            ) : (
              <p className="text-muted-foreground text-sm">Preview will appear here.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
