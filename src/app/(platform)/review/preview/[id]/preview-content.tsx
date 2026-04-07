'use client'

/**
 * @file PreviewContent — Client component for inline editing and publishing content.
 *
 * @description Provides a two-panel layout: rendered markdown on the left,
 * SEO metadata fields on the right (stacked on mobile). Supports inline
 * editing of title, content, slug, description, and tags. Actions: save edits,
 * publish, request revision, and navigate back.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    ArrowLeft,
    Send,
    RotateCcw,
    Pencil,
    Save,
    Globe,
    Tag,
    FileText,
    Loader2,
    ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/ui/markdown'
import {
    publishContent,
    requestRevision,
    updateContentBeforePublish,
} from '@/actions/content-publishing'

// ─── Types ──────────────────────────────────────────────────────────

interface PreviewArtifact {
    id: string
    title: string
    content: string
    content_type: string
    publish_status: string | null
    publish_metadata: Record<string, unknown>
    created_at: string
    version_number: number
}

interface PreviewContentProps {
    artifact: PreviewArtifact
    appUrl: string
}

// ─── Component ──────────────────────────────────────────────────────

export function PreviewContent({ artifact, appUrl }: PreviewContentProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Editable state
    const [isEditing, setIsEditing] = useState(false)
    const [title, setTitle] = useState(artifact.title)
    const [content, setContent] = useState(artifact.content)
    const [slug, setSlug] = useState((artifact.publish_metadata.slug as string) || '')
    const [metaDescription, setMetaDescription] = useState(
        (artifact.publish_metadata.meta_description as string) || ''
    )
    const [tagsInput, setTagsInput] = useState(
        ((artifact.publish_metadata.tags as string[]) || []).join(', ')
    )

    // Revision state
    const [showReviseInput, setShowReviseInput] = useState(false)
    const [revisionNotes, setRevisionNotes] = useState('')

    // Feedback state
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const urlPrefix = artifact.content_type === 'blog' ? '/blog' : '/pages'
    const previewUrl = `${appUrl}${urlPrefix}/${slug}`
    const reviewNotes = artifact.publish_metadata.review_notes as string | undefined

    // ── Save Edits ──────────────────────────────────────────────────

    function handleSave() {
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const tags = tagsInput
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)

            const result = await updateContentBeforePublish(artifact.id, {
                title,
                content,
                publish_metadata: {
                    slug,
                    meta_description: metaDescription,
                    tags,
                },
            })

            if (result.error) {
                setError(result.error)
            } else {
                setSuccess('Changes saved')
                setIsEditing(false)
                // Clear success after 3s
                setTimeout(() => setSuccess(null), 3000)
            }
        })
    }

    // ── Publish ─────────────────────────────────────────────────────

    function handlePublish() {
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const tags = tagsInput
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)

            const result = await publishContent(artifact.id, {
                slug,
                meta_description: metaDescription,
                tags,
            })

            if (result.error) {
                setError(result.error)
            } else {
                setSuccess(`Published at ${result.url}`)
                // Navigate back to review queue after a brief pause
                setTimeout(() => router.push('/review'), 1500)
            }
        })
    }

    // ── Request Revision ────────────────────────────────────────────

    function handleRequestRevision() {
        if (!revisionNotes.trim()) return
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const result = await requestRevision(artifact.id, revisionNotes.trim())
            if (result.error) {
                setError(result.error)
            } else {
                setSuccess('Revision requested')
                setTimeout(() => router.push('/review'), 1500)
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* ── Top Bar ──────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/review">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back to Review Queue
                    </Link>
                </Button>

                <div className="flex items-center gap-2">
                    {!isEditing ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditing(true)}
                        >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleSave}
                            disabled={isPending}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            Save Changes
                        </Button>
                    )}

                    {!showReviseInput && (
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* ── Feedback ─────────────────────────────────────── */}
            {error && (
                <div className="bg-destructive/10 border border-destructive rounded-lg px-4 py-3">
                    <p className="text-sm text-destructive" role="alert">{error}</p>
                </div>
            )}
            {success && (
                <div className="bg-status-success/10 border border-status-success rounded-lg px-4 py-3">
                    <p className="text-sm text-status-success" role="status">{success}</p>
                </div>
            )}

            {/* ── Revision Notes Input ─────────────────────────── */}
            {showReviseInput && (
                <Card>
                    <CardContent className="pt-4 space-y-3">
                        <Textarea
                            placeholder="What needs to change? Be specific so the specialist can address your feedback."
                            value={revisionNotes}
                            onChange={(e) => setRevisionNotes(e.target.value)}
                            className="min-h-[100px]"
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
                                Send Revision Request
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Previous Review Notes ────────────────────────── */}
            {reviewNotes && (
                <Card className="border-warning">
                    <CardContent className="pt-4">
                        <div className="flex items-start gap-2">
                            <RotateCcw className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-foreground mb-1">Previous Revision Notes</p>
                                <p className="text-sm text-muted-foreground">{reviewNotes}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Content + Metadata Grid ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Main Content ───────────────────────────────── */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-lg">
                                    <FileText className="h-4 w-4 inline mr-2" />
                                    Content
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant={artifact.content_type === 'blog' ? 'brand' : 'info'}
                                        size="sm"
                                    >
                                        {artifact.content_type}
                                    </Badge>
                                    <StatusBadge
                                        status={artifact.publish_status === 'revision_requested' ? 'warning' : 'pending'}
                                        size="sm"
                                        dot
                                    >
                                        {artifact.publish_status === 'revision_requested'
                                            ? 'Revision Requested'
                                            : 'Pending Review'}
                                    </StatusBadge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isEditing ? (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="edit-title" className="text-sm font-medium text-foreground block mb-1">
                                            Title
                                        </label>
                                        <Input
                                            id="edit-title"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            aria-required
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-content" className="text-sm font-medium text-foreground block mb-1">
                                            Content (Markdown)
                                        </label>
                                        <Textarea
                                            id="edit-content"
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            className="min-h-[400px] font-mono text-sm"
                                            aria-required
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h2 className="text-xl font-semibold text-foreground mb-4">
                                        {title}
                                    </h2>
                                    <Markdown content={content} className="text-sm" />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── SEO Metadata Sidebar ──────────────────────── */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                <Globe className="h-4 w-4 inline mr-2" />
                                SEO Metadata
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label htmlFor="seo-slug" className="text-sm font-medium text-foreground block mb-1">
                                    Slug
                                </label>
                                {isEditing ? (
                                    <Input
                                        id="seo-slug"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder="url-friendly-slug"
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground font-mono bg-muted rounded-md px-2 py-1">
                                        {slug || 'No slug set'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="seo-description" className="text-sm font-medium text-foreground block mb-1">
                                    Meta Description
                                </label>
                                {isEditing ? (
                                    <Textarea
                                        id="seo-description"
                                        value={metaDescription}
                                        onChange={(e) => setMetaDescription(e.target.value)}
                                        placeholder="Brief description for search engines"
                                        className="min-h-[80px]"
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {metaDescription || 'No description set'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="seo-tags" className="text-sm font-medium text-foreground block mb-1">
                                    <Tag className="h-3 w-3 inline mr-1" />
                                    Tags
                                </label>
                                {isEditing ? (
                                    <Input
                                        id="seo-tags"
                                        value={tagsInput}
                                        onChange={(e) => setTagsInput(e.target.value)}
                                        placeholder="tag1, tag2, tag3"
                                    />
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tagsInput.split(',').filter(t => t.trim()).length > 0 ? (
                                            tagsInput.split(',').filter(t => t.trim()).map((tag, i) => (
                                                <Badge key={i} variant="secondary" size="sm">
                                                    {tag.trim()}
                                                </Badge>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No tags</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── URL Preview ────────────────────────────── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                <ExternalLink className="h-4 w-4 inline mr-2" />
                                URL Preview
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground font-mono break-all bg-muted rounded-md px-2 py-1.5">
                                {previewUrl}
                            </p>
                        </CardContent>
                    </Card>

                    {/* ── Version Info ───────────────────────────── */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <div className="flex justify-between">
                                    <span>Version</span>
                                    <span className="font-mono">v{artifact.version_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Created</span>
                                    <span>
                                        {new Date(artifact.created_at).toLocaleDateString('en-GB', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
