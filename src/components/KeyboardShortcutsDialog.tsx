'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const shortcuts = [
  { category: 'Navigation', items: [
    { keys: '⌘K', description: 'Open Command Palette' },
    { keys: '⌘/', description: 'Show Keyboard Shortcuts' },
    { keys: 'Shift+?', description: 'Show Keyboard Shortcuts (alt)' },
    { keys: 'Esc', description: 'Close Dialog / Deselect' },
  ]},
  { category: 'Actions', items: [
    { keys: '⌘N', description: 'Create New Task' },
    { keys: '⌘⇧F', description: 'Toggle Focus Mode' },
    { keys: '⌘⇧A', description: 'Approve Selected Task (Exec)' },
  ]},
  { category: 'Quick Navigation', items: [
    { keys: 'G then D', description: 'Go to Dashboard' },
    { keys: 'G then T', description: 'Go to Tasks' },
    { keys: 'G then O', description: 'Go to Objectives' },
    { keys: 'G then R', description: 'Go to Team Roster' },
  ]},
]

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Shift+? to open
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
      // Cmd+/ to open
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }

    // Listen for custom event from command palette
    const handleCustomEvent = () => {
      setOpen(true)
    }

    document.addEventListener('keydown', handleKeyPress)
    window.addEventListener('open-keyboard-shortcuts', handleCustomEvent)
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener('open-keyboard-shortcuts', handleCustomEvent)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-foreground">Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick actions to boost your productivity
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {section.category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {section.items.map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-1">
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <kbd className={cn(
                      "px-2.5 py-1 bg-muted rounded-md text-xs font-mono",
                      "border border-slate-200 shadow-sm text-muted-foreground whitespace-nowrap"
                    )}>
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground text-center pt-2 border-t border-slate-100">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono border border-slate-200">Esc</kbd> to close
        </div>
      </DialogContent>
    </Dialog>
  )
}
