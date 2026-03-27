/**
 * GoogleAppsView -- Main tabbed layout for Google Workspace integration.
 *
 * @description Client component that renders four tabs: Drive, Docs, Calendar,
 * and Email. Uses in-memory caching so tab switching feels instant (stale-while-
 * revalidate pattern). Each tab lazily loads its data on first visit.
 *
 * @component
 */

'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { typography } from '@/lib/design-system'
import { SpecialistCoachingTip } from '@/components/specialists/specialist-coaching-tip'
import { HardDrive, FileText, Calendar, Mail } from 'lucide-react'
import { DriveTab } from './tabs/drive-tab'
import { DocsTab } from './tabs/docs-tab'
import { CalendarTab } from './tabs/calendar-tab'
import { StatusBadge } from '@/components/ui/status-badge'

interface GoogleAppsViewProps {
    /** The connected Google email address */
    googleEmail: string | null
    /** Which Google features are enabled (have scopes) */
    features: {
        calendar: boolean
        drive: boolean
        gmail: boolean
    }
}

type TabId = 'drive' | 'docs' | 'calendar' | 'email'

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; featureKey?: keyof GoogleAppsViewProps['features'] }> = [
    { id: 'drive', label: 'Drive', icon: HardDrive, featureKey: 'drive' },
    { id: 'docs', label: 'Docs', icon: FileText, featureKey: 'drive' },
    { id: 'calendar', label: 'Calendar', icon: Calendar, featureKey: 'calendar' },
    { id: 'email', label: 'Email', icon: Mail, featureKey: 'gmail' },
]

export function GoogleAppsView({ googleEmail, features }: GoogleAppsViewProps) {
    const [activeTab, setActiveTab] = useState<TabId>('drive')

    // Track which tabs have been visited (for lazy loading)
    const visitedTabs = useRef<Set<TabId>>(new Set(['drive']))

    const handleTabChange = useCallback((value: string) => {
        const tabId = value as TabId
        setActiveTab(tabId)
        visitedTabs.current.add(tabId)
    }, [])

    return (
        <div className="space-y-6">
            <SpecialistCoachingTip
                specialistId="chief-of-staff"
                specialistName="Cal"
                specialistTitle="Chief of Staff"
                tip="Connect Google Workspace to sync your calendar, documents, and email. This helps me coordinate your schedule and surface relevant files."
            />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className={typography.pageHeader}>
                        <div className={typography.pageHeaderAccent} />
                        <h1 className={typography.h1}>Google Apps</h1>
                    </div>
                    <p className={typography.pageSubtitle}>
                        {googleEmail
                            ? `Connected as ${googleEmail}`
                            : 'Your Google Workspace hub'
                        }
                    </p>
                </div>
            </div>

            {/* Tabbed Layout */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="w-full sm:w-auto">
                    {TABS.map((tab) => {
                        const Icon = tab.icon
                        const isEnabled = !tab.featureKey || features[tab.featureKey]
                        const isComingSoon = tab.id === 'email'

                        return (
                            <TabsTrigger
                                key={tab.id}
                                value={tab.id}
                                disabled={isComingSoon}
                                className="gap-2"
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                                {isComingSoon && (
                                    <StatusBadge status="info" size="sm">Soon</StatusBadge>
                                )}
                                {!isEnabled && !isComingSoon && (
                                    <StatusBadge status="warning" size="sm">Setup</StatusBadge>
                                )}
                            </TabsTrigger>
                        )
                    })}
                </TabsList>

                {/* Drive Tab */}
                <TabsContent value="drive" className="mt-6">
                    {visitedTabs.current.has('drive') && (
                        <DriveTab isEnabled={features.drive} />
                    )}
                </TabsContent>

                {/* Docs Tab */}
                <TabsContent value="docs" className="mt-6">
                    {visitedTabs.current.has('docs') && (
                        <DocsTab isEnabled={features.drive} />
                    )}
                </TabsContent>

                {/* Calendar Tab */}
                <TabsContent value="calendar" className="mt-6">
                    {visitedTabs.current.has('calendar') && (
                        <CalendarTab isEnabled={features.calendar} />
                    )}
                </TabsContent>

                {/* Email Tab -- Coming Soon */}
                <TabsContent value="email" className="mt-6">
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <h3 className="text-base font-semibold text-foreground mb-1">
                            Gmail integration coming soon
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Triage your inbox, read messages, and reply — all without leaving ForgeOS.
                        </p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
