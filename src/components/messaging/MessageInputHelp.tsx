'use client'

import { useState } from 'react'
import { 
  ChevronDown, 
  ChevronUp, 
  AtSign, 
  Slash, 
  Paperclip,
  Target,
  CheckSquare,
  Keyboard
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function MessageInputHelp({ className }: { className?: string }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={cn("border-t border-border", className)}>
      {/* Toggle button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-8"
      >
        <span className="flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5" />
          Quick Reference
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </Button>

      {/* Help content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-3 text-xs bg-muted/30">
          {/* Mentions */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <AtSign className="w-3.5 h-3.5 text-electric-blue" />
              <span>Mention People</span>
            </div>
            <div className="ml-5 text-muted-foreground space-y-1">
              <p>
                Type <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">@</kbd> 
                <span className="mx-1">to mention someone</span>
                <span className="text-status-success font-medium">→ They'll get a notification</span>
              </p>
              <p className="text-[11px] italic">Example: @"John Doe" can you review this?</p>
            </div>
          </div>

          {/* Context Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <div className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-international-orange" />
                <CheckSquare className="w-3.5 h-3.5 text-international-orange" />
              </div>
              <span>Link Messages to Tasks & Objectives</span>
            </div>
            <div className="ml-5 text-muted-foreground space-y-1">
              <p>
                <span className="font-semibold text-international-orange">In Inbox conversations:</span>
                <span className="mx-1">Click the dropdown button above the message input</span>
              </p>
              <p className="text-[11px]">
                It shows "General conversation" by default
                <span className="mx-1 text-status-info font-medium">→ Click to select a task or objective</span>
              </p>
              <p className="text-[11px] mt-1">
                <span className="font-semibold">In Tasks:</span>
                <span className="mx-1">Messages automatically link to that task</span>
              </p>
              <p className="text-[11px] italic mt-1">
                Linked messages appear in task notes for better organization
              </p>
            </div>
          </div>

          {/* Slash Commands */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Slash className="w-3.5 h-3.5 text-purple-500" />
              <span>Slash Commands</span>
            </div>
            <div className="ml-5 text-muted-foreground space-y-1">
              <p>
                Type <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">/</kbd>
                <span className="mx-1">for quick actions</span>
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mt-1.5">
                <div><code className="text-purple-400">/task</code> - Create new task</div>
                <div><code className="text-purple-400">/search</code> - Search messages</div>
                <div><code className="text-purple-400">/help</code> - Show all commands</div>
                <div><code className="text-purple-400">/remind</code> - Set reminder</div>
              </div>
            </div>
          </div>

          {/* File Attachments */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Paperclip className="w-3.5 h-3.5 text-emerald-500" />
              <span>File Attachments</span>
            </div>
            <div className="ml-5 text-muted-foreground space-y-1">
              <p>
                Click <Paperclip className="w-3 h-3 inline mx-1" /> to attach files
                <span className="mx-1 text-status-info">(10MB limit)</span>
              </p>
              <p className="text-[11px]">
                Supports: Images, PDFs, Docs, Spreadsheets, ZIP files
              </p>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Keyboard className="w-3.5 h-3.5 text-slate-500" />
              <span>Keyboard Shortcuts</span>
            </div>
            <div className="ml-5 text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div>
                <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">Cmd+Enter</kbd>
                <span className="ml-1">Send message</span>
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">↑</kbd>
                <span className="ml-1">Previous message</span>
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">Tab</kbd>
                <span className="ml-1">Accept suggestion</span>
              </div>
              <div>
                <kbd className="px-1.5 py-0.5 bg-background rounded font-mono text-[10px]">Esc</kbd>
                <span className="ml-1">Close menu</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
