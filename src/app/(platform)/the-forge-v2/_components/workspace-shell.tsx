/**
 * @file workspace-shell.tsx — Shared chrome for /the-forge-v2/** pages.
 *
 * @description Header strip with "The Forge" title, workspace breadcrumb,
 * project-picker (when inside a project), and the primary CTA slot. Used by
 * every v2 page so the chrome stays consistent across workspace / project /
 * module / part / drill-in routes.
 */

import Link from "next/link"
import { ChevronRight, Hammer, Plus } from "lucide-react"

import { typography } from "@/lib/design-system"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface Crumb {
    label: string
    href?: string
}

interface WorkspaceShellProps {
    crumbs?: Crumb[]
    subtitle?: string
    primaryCta?: {
        label: string
        href: string
        icon?: React.ReactNode
    }
    secondary?: React.ReactNode
    children: React.ReactNode
    maxWidth?: 'wide' | 'narrow'
}

export function WorkspaceShell({
    crumbs,
    subtitle,
    primaryCta,
    secondary,
    children,
    maxWidth = 'wide',
}: WorkspaceShellProps): React.ReactElement {
    const title = crumbs && crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "The Forge"
    const isRoot = !crumbs || crumbs.length <= 1
    return (
        <div className={cn("space-y-6", maxWidth === 'wide' ? "max-w-7xl" : "max-w-5xl")}>
            {/* Tristan 2026-04-27: removed Home › The Forge › <subroute>
                breadcrumb so the page-header pattern matches My Profile
                (red bar + title only). Subroute context still surfaces
                in the title via crumbs[last].label. */}

            {/* Header strip */}
            <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-border">
                <div className="min-w-0">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>{title}</h1>
                    </div>
                    {subtitle && (
                        <p className={cn(typography.pageSubtitle, "mt-1")}>{subtitle}</p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {secondary}
                    {primaryCta && (
                        <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                            <Link href={primaryCta.href}>
                                {primaryCta.icon ?? <Plus className="h-3.5 w-3.5" />}
                                {primaryCta.label}
                            </Link>
                        </Button>
                    )}
                </div>
            </header>

            {children}
        </div>
    )
}
