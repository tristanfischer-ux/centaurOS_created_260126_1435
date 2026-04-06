'use client'

/**
 * @file project-context-banner.tsx
 *
 * @description Contextual banner on the marketplace page that connects the user's
 * active CAD Lab project to supplier discovery. Shows "Your project [X] uses
 * Sheet Metal — 47 suppliers match" with a one-click filter button.
 *
 * Dismissible per project (localStorage). Returns null if no project context.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Factory, X, ArrowRight } from 'lucide-react'
import type { ProjectContext } from '@/actions/marketplace-project-context'

interface ProjectContextBannerProps {
    context: ProjectContext
}

export function ProjectContextBanner({ context }: ProjectContextBannerProps) {
    const router = useRouter()
    const storageKey = `marketplace-project-banner-dismissed-${context.projectId}`
    const [dismissed, setDismissed] = useState(true) // Start hidden to avoid flash

    useEffect(() => {
        setDismissed(localStorage.getItem(storageKey) === 'true')
    }, [storageKey])

    function handleDismiss() {
        setDismissed(true)
        localStorage.setItem(storageKey, 'true')
    }

    function handleShowMatching() {
        const params = new URLSearchParams()
        params.set('subcategory', context.matchingSubcategories.join(','))
        router.push(`/marketplace?${params.toString()}`)
    }

    if (dismissed || context.supplierCount === 0) return null

    return (
        <Card className="border-international-orange/20 bg-gradient-to-r from-international-orange/5 to-background">
            <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-international-orange/10 shrink-0">
                            <Factory className="h-5 w-5 text-international-orange" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm text-foreground">
                                Working on <span className="font-semibold">{context.projectName}</span>?
                                {' '}
                                <span className="text-muted-foreground">
                                    {context.processes.join(' + ')} — <span className="font-semibold text-international-orange">{context.supplierCount.toLocaleString()}</span> suppliers match
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant="default"
                            className="h-8 text-xs"
                            onClick={handleShowMatching}
                        >
                            Show matching
                            <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                        <button
                            onClick={handleDismiss}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
