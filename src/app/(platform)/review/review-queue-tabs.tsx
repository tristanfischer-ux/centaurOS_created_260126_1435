'use client'

/**
 * @file ReviewQueueTabs — Client-side interactive tabs for the review queue.
 *
 * @description Handles publish, revision, approve, and dismiss actions inline.
 * Each tab has a count badge. Content items link to the preview page for
 * full inspection before publishing.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    FileText,
    ListTodo,
    Zap,
    Eye,
    Send,
    RotateCcw,
    CheckCircle2,
    XCircle,
    ClipboardList,
    Loader2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Textarea } from '@/components/ui/textarea'
import { publishContent, requestRevision } from '@/actions/content-publishing'
import type { ContentItem, DraftTask, PendingAction } from './page'

// ─── Props ──────────────────────────────────────────────────────────

interface ReviewQueueTabsProps {
    contentItems: ContentItem[]
    draftTasks: DraftTask[]
    pendingActions: PendingAction[]
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Unknown date'
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trimEnd() + '...'
}

function contentTypeBadgeVariant(type: string): 'brand' | 'info' | 'outline' {
    switch (type) {
        case 'blog': return 'brand'
        case 'page': return 'info'
        default: return 'outline'
    }
}

function publishStatusLabel(status: string | null): { label: string; statusVariant: 'warning' | 'pending' } {
    switch (status) {
        case 'revision_requested':
            return { label: 'Revision Requested', statusVariant: 'warning' }
        case 'review':
        default:
            return { label: 'Pending Review', statusVariant: 'pending' }
    }
}

// ─── Content Card ───────────────────────────────────────────────────

function ContentCard({ item, onPublished }: { item: ContentItem; onPublished: () => void }) {
    const [showReviseInput, setShowReviseInput] = useState(false)
    const [revisionNotes, setRevisionNotes] = useState('')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const { label, statusVariant } = publishStatusLabel(item.publish_status)

    function handlePublish() {
        setError(null)
        startTransition(async () => {
            const result = await publishContent(item.id)
            if (result.error) {
                setError(result.error)
            } else {
                onPublished()
            }
        })
    }

    function handleRequestRevision() {
        if (!revisionNotes.trim()) return
        setError(null)
        startTransition(async () => {
            const result = await requestRevision(item.id, revisionNotes.trim())
            if (result.error) {
                setError(result.error)
            } else {
                setShowReviseInput(false)
                setRevisionNotes('')
                onPublished()
            }
        })
    }

    // INTENT: Strip markdown formatting for preview text
    const plainPreview = truncate(
        item.content.replace(/[#*_`~>\[\]()!|-]/g, '').replace(/\n+/g, ' '),
        150
    )

    return (
        <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate">
                            {item.title}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={contentTypeBadgeVariant(item.content_type)} size="sm">
                                {item.content_type}
                            </Badge>
                            <StatusBadge status={statusVariant} size="sm" dot>
                                {label}
                            </StatusBadge>
                            <span className="text-xs text-muted-foreground">
                                {formatDate(item.created_at)}
                            </span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pb-2">
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {plainPreview}
                </p>
                {error && (
                    <p className="text-sm text-destructive mt-2" role="alert">
                        {error}
                    </p>
                )}
            </CardContent>

            <CardFooter className="flex-col items-stretch gap-3">
                {showReviseInput ? (
                    <div className="space-y-2 w-full">
                        <Textarea
                            placeholder="What needs to change?"
                            value={revisionNotes}
                            onChange={(e) => setRevisionNotes(e.target.value)}
                            className="min-h-[80px]"
                            aria-label="Revision notes"
                        />
                        <div className="flex items-center gap-2 justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setShowReviseInput(false)
                                    setRevisionNotes('')
                                }}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRequestRevision}
                                disabled={isPending || !revisionNotes.trim()}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                )}
                                Send Revision
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 w-full">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={`/review/preview/${item.id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                Preview
                            </Link>
                        </Button>
                        <div className="flex-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowReviseInput(true)}
                            disabled={isPending}
                        >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Revise
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handlePublish}
                            disabled={isPending}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Send className="h-4 w-4 mr-1" />
                            )}
                            Publish
                        </Button>
                    </div>
                )}
            </CardFooter>
        </Card>
    )
}

// ─── Draft Task Card ────────────────────────────────────────────────

function DraftTaskCard({ task, onActioned }: { task: DraftTask; onActioned: () => void }) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    // INTENT: Strip "[Draft] " prefix for display
    const displayTitle = task.title.replace(/^\[Draft\]\s*/i, '')

    async function handleAction(action: 'approve' | 'dismiss') {
        setError(null)
        startTransition(async () => {
            try {
                const res = await fetch('/api/tasks/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        taskId: task.id,
                        action,
                    }),
                })
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}))
                    setError(body.error || 'Failed to process action')
                    return
                }
                onActioned()
            } catch {
                setError('Network error. Please try again.')
            }
        })
    }

    return (
        <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate">
                            {displayTitle}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" size="sm">Draft Task</Badge>
                            {task.owner_agent_id && (
                                <span className="text-xs text-muted-foreground">
                                    Proposed by specialist
                                </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                                {formatDate(task.created_at)}
                            </span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            {task.description && (
                <CardContent className="pb-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {truncate(task.description, 150)}
                    </p>
                </CardContent>
            )}

            {error && (
                <CardContent className="pt-0 pb-2">
                    <p className="text-sm text-destructive" role="alert">{error}</p>
                </CardContent>
            )}

            <CardFooter>
                <div className="flex items-center gap-2 w-full justify-end">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction('dismiss')}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                            <XCircle className="h-4 w-4 mr-1" />
                        )}
                        Dismiss
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleAction('approve')}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Approve
                    </Button>
                </div>
            </CardFooter>
        </Card>
    )
}

// ─── Pending Action Card ────────────────────────────────────────────

function PendingActionCard({ action }: { action: PendingAction }) {
    return (
        <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200">
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate">
                            {action.action_description || action.action_type}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="info" size="sm">{action.action_type}</Badge>
                            <Badge variant="outline" size="sm">Tier: {action.tier}</Badge>
                            {action.agent_name && (
                                <span className="text-xs text-muted-foreground">
                                    by {action.agent_name}
                                </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                                {formatDate(action.created_at)}
                            </span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            {action.details && Object.keys(action.details).length > 0 && (
                <CardContent className="pb-2">
                    <pre className="text-xs text-muted-foreground bg-muted rounded-md p-2 overflow-x-auto">
                        {JSON.stringify(action.details, null, 2).slice(0, 300)}
                    </pre>
                </CardContent>
            )}

            <CardFooter>
                <StatusBadge status="pending" size="sm" dot>
                    Awaiting Approval
                </StatusBadge>
            </CardFooter>
        </Card>
    )
}

// ─── Main Tabs Component ────────────────────────────────────────────

export function ReviewQueueTabs({
    contentItems,
    draftTasks,
    pendingActions,
}: ReviewQueueTabsProps) {
    const router = useRouter()
    const totalCount = contentItems.length + draftTasks.length + pendingActions.length

    function handleRefresh() {
        router.refresh()
    }

    if (totalCount === 0) {
        return (
            <EmptyState
                icon={<ClipboardList className="h-12 w-12" />}
                title="Nothing to review"
                description="All caught up. New items will appear here when specialists propose content, create draft tasks, or request approval for actions."
            />
        )
    }

    return (
        <Tabs defaultValue="content">
            <TabsList>
                <TabsTrigger value="content" className="gap-1.5">
                    <FileText className="h-4 w-4" />
                    Content
                    {contentItems.length > 0 && (
                        <Badge variant="brand" size="sm">{contentItems.length}</Badge>
                    )}
                </TabsTrigger>
                <TabsTrigger value="tasks" className="gap-1.5">
                    <ListTodo className="h-4 w-4" />
                    Tasks
                    {draftTasks.length > 0 && (
                        <Badge variant="brand" size="sm">{draftTasks.length}</Badge>
                    )}
                </TabsTrigger>
                <TabsTrigger value="actions" className="gap-1.5">
                    <Zap className="h-4 w-4" />
                    Actions
                    {pendingActions.length > 0 && (
                        <Badge variant="brand" size="sm">{pendingActions.length}</Badge>
                    )}
                </TabsTrigger>
            </TabsList>

            {/* ── Content Tab ──────────────────────────────────── */}
            <TabsContent value="content" className="space-y-4 mt-4">
                {contentItems.length === 0 ? (
                    <EmptyState
                        icon={<FileText className="h-10 w-10" />}
                        title="No content pending review"
                        description="When specialists propose blog posts or pages, they will appear here for your approval."
                    />
                ) : (
                    contentItems.map((item) => (
                        <ContentCard
                            key={item.id}
                            item={item}
                            onPublished={handleRefresh}
                        />
                    ))
                )}
            </TabsContent>

            {/* ── Tasks Tab ────────────────────────────────────── */}
            <TabsContent value="tasks" className="space-y-4 mt-4">
                {draftTasks.length === 0 ? (
                    <EmptyState
                        icon={<ListTodo className="h-10 w-10" />}
                        title="No draft tasks pending"
                        description="When specialists propose new tasks, they will appear here for your approval."
                    />
                ) : (
                    draftTasks.map((task) => (
                        <DraftTaskCard
                            key={task.id}
                            task={task}
                            onActioned={handleRefresh}
                        />
                    ))
                )}
            </TabsContent>

            {/* ── Actions Tab ──────────────────────────────────── */}
            <TabsContent value="actions" className="space-y-4 mt-4">
                {pendingActions.length === 0 ? (
                    <EmptyState
                        icon={<Zap className="h-10 w-10" />}
                        title="No pending actions"
                        description="When specialists request approval for external actions, they will appear here."
                    />
                ) : (
                    pendingActions.map((action) => (
                        <PendingActionCard
                            key={action.id}
                            action={action}
                        />
                    ))
                )}
            </TabsContent>
        </Tabs>
    )
}
