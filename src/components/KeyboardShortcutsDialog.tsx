'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const shortcutCategories = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'T'], description: 'Go to Tasks' },
      { keys: ['G', 'S'], description: 'Go to Strategy' },
      { keys: ['G', 'O'], description: 'Go to Objectives' },
      { keys: ['G', 'M'], description: 'Go to Messages' },
      { keys: ['G', 'F'], description: 'Go to Finance' },
      { keys: ['G', 'P'], description: 'Go to People' },
      { keys: ['G', 'K'], description: 'Go to Knowledge' },
      { keys: ['G', 'W'], description: 'Go to Workshop' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['N'], description: 'Create new task' },
      { keys: ['⌘', 'N'], description: 'New task (from anywhere)' },
      { keys: ['⌘', '⇧', 'F'], description: 'Toggle Focus Mode' },
      { keys: ['⌘', '⇧', 'E'], description: 'Advisor Panel fullscreen' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Command Palette' },
      { keys: ['?'], description: 'Keyboard shortcuts' },
      { keys: ['⌘', '/'], description: 'Keyboard shortcuts (alt)' },
      { keys: ['Esc'], description: 'Close dialog / deselect' },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs font-mono text-foreground">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Cmd+/ to open — modifier combos are not handled by the hook
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }

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
      <DialogContent size="lg" className="bg-background">
        <DialogHeader>
          <DialogTitle className="text-foreground">Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick actions to boost your productivity
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
          {shortcutCategories.map((category) => (
            <div key={category.title}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {category.title}
              </h3>
              <div className="space-y-2.5">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && key.length === 1 && shortcut.keys[0] === 'G' && (
                            <span className="text-xs text-muted-foreground">then</span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
          Press <Kbd>Esc</Kbd> to close
          <span className="mx-2">·</span>
          Shortcuts are disabled while typing in inputs
        </div>
      </DialogContent>
    </Dialog>
  )
}
