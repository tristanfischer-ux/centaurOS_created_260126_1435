"use client"

/**
 * Dismissible release notice shown at the top of /today. Copy is scoped to
 * the Forge v2 rebuild that shipped April 2026. Dismissal is persisted to
 * localStorage under a versioned key so a future release can reset it by
 * changing the version.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import { Flame, X } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "release-notice:forge-v2-2026-04-20"

export function ReleaseNoticeBanner(): React.ReactElement | null {
    const [mounted, setMounted] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        try {
            setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1")
        } catch {
            // localStorage can be blocked (incognito, Safari quirks); treat as not-dismissed.
        }
        setMounted(true)
    }, [])

    function handleDismiss(): void {
        setDismissed(true)
        try {
            window.localStorage.setItem(STORAGE_KEY, "1")
        } catch {
            // ignore — state update already hides it for this session
        }
    }

    if (!mounted || dismissed) return null

    return (
        <Card className="rounded-xl border-2 border-international-orange/20 bg-gradient-to-br from-international-orange/[0.04] to-background shadow-sm">
            <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-international-orange/10 flex items-center justify-center flex-shrink-0">
                        <Flame className="w-[18px] h-[18px] text-international-orange" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                            <h3 className="text-base font-semibold text-foreground">
                                The Forge workspace — fresh build
                            </h3>
                            <button
                                onClick={handleDismiss}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 -mt-1 -mr-1"
                                aria-label="Dismiss release notice"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                            Project cockpit, modules, BOM, suppliers, and investor handoff,
                            all stitched together. I&apos;ll be polishing details through the
                            week. If something looks off, drop me a message and I&apos;ll sort it.
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                            — Tristan, Founder, Fractional Forge
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button asChild size="sm" className="bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href="/the-forge-v2">Open The Forge</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
