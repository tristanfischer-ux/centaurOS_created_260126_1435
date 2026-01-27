'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <kbd className={cn(
                "px-3 py-1.5 bg-slate-100 rounded-md text-xs font-mono",
                "border border-slate-200 shadow-sm"
              )}>
                ⌘K
              </kbd>
              <span className="text-sm text-slate-700">Command Palette</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className={cn(
                "px-3 py-1.5 bg-slate-100 rounded-md text-xs font-mono",
                "border border-slate-200 shadow-sm"
              )}>
                N
              </kbd>
              <span className="text-sm text-slate-700">New Task</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className={cn(
                "px-3 py-1.5 bg-slate-100 rounded-md text-xs font-mono",
                "border border-slate-200 shadow-sm"
              )}>
                Shift+?
              </kbd>
              <span className="text-sm text-slate-700">Show Shortcuts</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className={cn(
                "px-3 py-1.5 bg-slate-100 rounded-md text-xs font-mono",
                "border border-slate-200 shadow-sm"
              )}>
                Esc
              </kbd>
              <span className="text-sm text-slate-700">Close Dialog</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
