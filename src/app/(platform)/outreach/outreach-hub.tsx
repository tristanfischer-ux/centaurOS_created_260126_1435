'use client'

/**
 * @file outreach-hub.tsx — Campaign list view (command center).
 *
 * @description Card grid of outreach campaigns with quick stats, create dialog,
 * and empty state. Entry point to the outreach workflow.
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Plus, Users, Mail, Megaphone, Database, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { getCampaigns, deleteCampaign } from '@/actions/outreach'
import { CampaignCard } from './campaign-card'
import { CreateCampaignDialog } from './create-campaign-dialog'
import { OutreachDashboard } from './outreach-dashboard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateOutreachInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import type { Campaign } from '@/types/outreach'

// INTENT: Static coaching insight when no campaigns yet — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
    id: 'sal-outreach-empty',
    foundry_id: '',
    specialist_id: 'sales-lead',
    insight_type: 'recommendation',
    urgency: 'informational',
    title: 'Start your outreach',
    body: "Set up your first outreach campaign to start connecting with potential customers. I'll help you craft sequences that convert.",
    domain_data: {},
    suggested_actions: [],
    is_read: false,
    is_dismissed: false,
    acted_on: false,
    acted_on_at: null,
    created_at: new Date().toISOString(),
    expires_at: null,
}

interface OutreachHubProps {
    foundryId: string
    userId: string
}

export function OutreachHub({ foundryId, userId }: OutreachHubProps) {
    const router = useRouter()
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns'>('dashboard')
    const [isPending, startTransition] = useTransition()

    const loadCampaigns = useCallback(async () => {
        startTransition(async () => {
            const result = await getCampaigns()
            if (result.data) {
                setCampaigns(result.data)
            }
            setIsLoading(false)
        })
    }, [])

    useEffect(() => {
        loadCampaigns()
    }, [loadCampaigns])

    // Keyboard shortcut: Cmd+N to create
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault()
                setIsCreateOpen(true)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const handleDelete = async (campaignId: string) => {
        const result = await deleteCampaign(campaignId)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Campaign deleted')
            loadCampaigns()
        }
    }

    const handleCreated = (campaignId: string) => {
        setIsCreateOpen(false)
        router.push(`/outreach/${campaignId}`)
    }

    // Quick stats
    const totalContacts = campaigns.reduce((sum, c) => sum + (c.contact_count || 0), 0)
    const totalSequenced = campaigns.reduce((sum, c) => sum + (c.sequenced_count || 0), 0)

    // Sal's proactive insights
    const { openPanel } = useAdvisorPanel()
    const handleDiscuss = useCallback((specialistId: string, context: string) => {
        openPanel(specialistId, { handoffContext: context, contextLabel: 'Outreach' })
    }, [openPanel])
    const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'draft').length
    const { insights, dismissInsight } = usePageInsights(
        () => generateOutreachInsights({
            campaignCount: campaigns.length,
            activeCampaigns,
            totalContacts,
        }),
        campaigns.length > 0,
        { cacheKey: 'sal-outreach', emptyInsight: EMPTY_STATE_INSIGHT },
    )

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">Outreach</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create campaigns, import prospects, generate email sequences
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push('/outreach/enrichment')}>
                        <Database className="h-4 w-4 mr-2" />
                        Enrichment
                    </Button>
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Campaign
                    </Button>
                </div>
            </div>

            {/* Tab toggle */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        activeTab === 'dashboard'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('campaigns')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        activeTab === 'campaigns'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <Megaphone className="h-4 w-4" />
                    Campaigns
                </button>
            </div>

            {/* Sal's proactive insights */}
            {insights.length > 0 && (
                <div className="space-y-3">
                    {insights.map((insight) => (
                        <SpecialistInsightCard
                            key={insight.id}
                            insight={insight}
                            onDismiss={() => dismissInsight(insight.id)}
                            onDiscuss={handleDiscuss}
                            compact
                        />
                    ))}
                </div>
            )}

            {/* Dashboard tab */}
            {activeTab === 'dashboard' && (
                <OutreachDashboard />
            )}

            {/* Campaigns tab */}
            {activeTab === 'campaigns' && (
                <>
                    {/* Quick stats */}
                    {campaigns.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card>
                                <CardContent className="flex items-center gap-3 p-4">
                                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-international-orange/10">
                                        <Megaphone className="h-5 w-5 text-international-orange" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{campaigns.length}</p>
                                        <p className="text-xs text-muted-foreground">Campaigns</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="flex items-center gap-3 p-4">
                                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-info/10">
                                        <Users className="h-5 w-5 text-info" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{totalContacts}</p>
                                        <p className="text-xs text-muted-foreground">Total Contacts</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="flex items-center gap-3 p-4">
                                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-success/10">
                                        <Mail className="h-5 w-5 text-success" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-foreground">{totalSequenced}</p>
                                        <p className="text-xs text-muted-foreground">Sequenced</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Campaign grid or empty state */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    ) : campaigns.length === 0 ? (
                        <EmptyState
                            icon={<Send className="h-12 w-12" />}
                            title="Create your first outreach campaign"
                            description="Import prospects, let Sal generate personalized email sequences, then copy and send."
                            action={
                                <Button onClick={() => setIsCreateOpen(true)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    New Campaign
                                </Button>
                            }
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {campaigns.map(campaign => (
                                <CampaignCard
                                    key={campaign.id}
                                    campaign={campaign}
                                    onDelete={() => handleDelete(campaign.id)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Create campaign dialog */}
            <CreateCampaignDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onCreated={handleCreated}
            />
        </div>
    )
}
