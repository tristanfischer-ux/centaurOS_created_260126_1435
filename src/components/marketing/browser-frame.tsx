'use client'

/**
 * @file browser-frame.tsx
 *
 * @description Realistic browser chrome wrapper for marketing screenshots.
 * Renders a macOS-style title bar with traffic lights and a URL bar,
 * wrapping screenshot content in a polished frame.
 */

import { cn } from '@/lib/utils'

interface BrowserFrameProps {
  url?: string
  children: React.ReactNode
  className?: string
}

/**
 * BrowserFrame — macOS-style browser chrome wrapper.
 *
 * @param url - The URL to show in the address bar
 * @param children - The screenshot content (usually a Next.js Image)
 */
export function BrowserFrame({ url = 'app.fractionalforge.com', children, className }: BrowserFrameProps) {
  return (
    <div className={cn('rounded-xl overflow-hidden border bg-card shadow-2xl', className)}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>

        {/* URL bar */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-1 rounded-md bg-background border text-xs text-muted-foreground max-w-sm w-full">
            <svg className="w-3 h-3 shrink-0 text-success" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.22 5.72-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 0 1 1.06-1.06L6.5 9.44l3.22-3.22a.75.75 0 0 1 1.06 0 .75.75 0 0 1 0 1.06l-.06-.06Z" />
            </svg>
            <span className="truncate">{url}</span>
          </div>
        </div>

        {/* Spacer matching traffic lights width */}
        <div className="w-[52px]" />
      </div>

      {/* Content */}
      <div className="bg-background">
        {children}
      </div>
    </div>
  )
}
