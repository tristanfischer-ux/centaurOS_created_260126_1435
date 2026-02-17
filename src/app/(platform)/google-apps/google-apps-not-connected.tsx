/**
 * GoogleAppsNotConnected -- Empty state shown when Google is not connected.
 *
 * @description Handles two cases:
 * 1. Not connected anywhere -- welcoming CTA to connect
 * 2. Connected in another foundry -- specific message with context
 *
 * @component
 */

'use client'

import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'
import {
    HardDrive,
    FileText,
    Calendar,
    Mail,
    Link2,
} from 'lucide-react'

interface GoogleAppsNotConnectedProps {
    /** Name of another foundry where Google IS connected, or null */
    connectedInOtherFoundry: string | null
}

const FEATURES = [
    {
        icon: HardDrive,
        name: 'Google Drive',
        description: 'Browse and search your files. Attach them to tasks.',
    },
    {
        icon: FileText,
        name: 'Docs, Sheets & Slides',
        description: 'Quick access to your documents. Create new ones instantly.',
    },
    {
        icon: Calendar,
        name: 'Google Calendar',
        description: 'See upcoming events, join meetings, and create new events.',
    },
    {
        icon: Mail,
        name: 'Gmail',
        description: 'Triage your inbox without leaving ForgeOS. Coming soon.',
    },
]

export function GoogleAppsNotConnected({ connectedInOtherFoundry }: GoogleAppsNotConnectedProps) {
    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div>
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Google Apps</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Access your Google Workspace from within ForgeOS
                </p>
            </div>

            {/* Empty State */}
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-6">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                </div>

                <h2 className="text-xl font-semibold text-foreground mb-2 text-center">
                    {connectedInOtherFoundry
                        ? `Google is connected in ${connectedInOtherFoundry}`
                        : 'Connect your Google account'
                    }
                </h2>

                <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
                    {connectedInOtherFoundry
                        ? `Your Google account is connected in ${connectedInOtherFoundry}, but not in this workspace. Connect it here to access your files, docs, and calendar.`
                        : 'Link your Google account to access Drive, Docs, Calendar, and more — all from within ForgeOS.'
                    }
                </p>

                {/* Feature Preview Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mb-8">
                    {FEATURES.map((feature) => {
                        const Icon = feature.icon
                        return (
                            <div
                                key={feature.name}
                                className="flex items-start gap-3 rounded-xl border p-4 opacity-70"
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {feature.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Connect Button */}
                <Button asChild size="lg">
                    <a href="/api/google/connect?features=calendar,drive&redirect=/google-apps">
                        <Link2 className="h-4 w-4 mr-2" />
                        Connect Google Account
                    </a>
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                    You&apos;ll be redirected to Google to grant access. You can disconnect at any time in Settings.
                </p>
            </div>
        </div>
    )
}
