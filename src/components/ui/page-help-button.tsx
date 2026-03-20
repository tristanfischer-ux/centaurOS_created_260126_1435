"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  AtSign,
  BarChart2,
  Box,
  CheckSquare,
  Compass,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  GitBranch,
  HelpCircle,
  Keyboard,
  Layers,
  Lightbulb,
  MessageSquare,
  Paperclip,
  PlusCircle,
  Search,
  Send,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VideoWalkthrough } from "@/components/ui/video-walkthrough"
import { getHelpContent, type PageKey } from "@/lib/help-content"
import { hasSeenTour } from "@/components/guidance/feature-tour"
import { cn } from "@/lib/utils"

const SECTION_ICONS: Record<string, LucideIcon> = {
  target: Target,
  "check-square": CheckSquare,
  zap: Zap,
  "alert-triangle": AlertTriangle,
  "plus-circle": PlusCircle,
  "trending-up": TrendingUp,
  "git-branch": GitBranch,
  filter: Filter,
  "user-cog": UserCog,
  "user-plus": UserPlus,
  "bar-chart": BarChart2,
  users: Users,
  lightbulb: Lightbulb,
  box: Box,
  "file-text": FileText,
  "file-signature": FileText,
  search: Search,
  store: Store,
  sparkles: Sparkles,
  send: Send,
  layers: Layers,
  activity: Activity,
  compass: Compass,
  "message-square": MessageSquare,
  "at-sign": AtSign,
  folder: Folder,
  paperclip: Paperclip,
}

function getSectionIcon(iconName: string): LucideIcon {
  return SECTION_ICONS[iconName] ?? Target
}

interface PageHelpButtonProps {
  pageKey: PageKey
  className?: string
}

/**
 * Renders a help button that opens contextual help for the current page.
 * Supports click and ? keyboard shortcut (when no input/textarea is focused).
 */
export function PageHelpButton({ pageKey, className }: PageHelpButtonProps) {
  const [open, setOpen] = useState(false)
  const content = getHelpContent(pageKey)

  const handleOpen = useCallback(() => {
    setOpen(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "?") return
      const active = document.activeElement
      const tagName = active?.tagName?.toLowerCase()
      if (tagName === "input" || tagName === "textarea") return
      e.preventDefault()
      setOpen((prev) => !prev)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!content) return null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        aria-label="Show page help"
        className={cn(className)}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{content.title}</DialogTitle>
            <p className="text-sm text-muted-foreground">{content.description}</p>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Video Walkthrough */}
              {content.videoUrl && (
                <VideoWalkthrough
                  videoUrl={content.videoUrl}
                  thumbnailUrl={content.thumbnailUrl}
                  title={content.videoTitle || "Watch Walkthrough"}
                  duration={content.videoDuration}
                  mode="inline"
                />
              )}

              {/* Sections */}
              <div className="space-y-4">
                {content.sections.map((section) => {
                  const Icon = getSectionIcon(section.iconName)
                  return (
                    <div
                      key={section.title}
                      className="rounded-lg border bg-card p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-international-orange/10 text-international-orange">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="font-semibold text-foreground">
                          {section.title}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground pl-10">
                        {section.description}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Pro Tips */}
              {content.tips.length > 0 && (
                <div className="rounded-lg border border-international-orange/30 bg-international-orange/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-international-orange" />
                    <h3 className="font-semibold text-foreground">Pro Tips</h3>
                  </div>
                  <ul className="space-y-1 pl-6">
                    {content.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground list-disc"
                      >
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tour Replay */}
              {content.tourId && (
                <TourReplayButton
                  tourId={content.tourId}
                  onReplay={() => setOpen(false)}
                />
              )}

              {/* Keyboard Shortcuts */}
              {content.shortcuts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Keyboard className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">
                      Keyboard Shortcuts
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {content.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.description}
                        className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                      >
                        <span className="text-sm text-muted-foreground">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key) => (
                            <kbd
                              key={key}
                              className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border bg-background px-1.5 font-mono text-xs font-medium text-foreground"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Help Center Link */}
              <div className="pt-2 border-t">
                <Link
                  href="/help"
                  className="inline-flex items-center gap-2 text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Visit Help Center
                </Link>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Isolated client component for the tour replay button.
 * Reads localStorage in useEffect to avoid SSR/client hydration mismatch.
 */
function TourReplayButton({ tourId, onReplay }: { tourId: string; onReplay: () => void }) {
  const [seen, setSeen] = useState(true)

  useEffect(() => {
    setSeen(hasSeenTour(tourId))
  }, [tourId])

  return (
    <div className="pt-2 border-t">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 text-international-orange border-international-orange/30 hover:bg-international-orange/5"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent('forgeos-start-tour', {
              detail: { tourId },
            })
          )
          onReplay()
        }}
      >
        <Compass className="h-4 w-4" />
        {seen ? 'Replay tour' : 'Take the tour'}
      </Button>
    </div>
  )
}
