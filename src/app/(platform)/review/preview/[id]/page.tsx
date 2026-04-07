/**
 * @file Content Preview — Full preview of a content artifact before publishing.
 *
 * @description Authenticated preview page for reviewing specialist-created content.
 * Shows rendered markdown, SEO metadata fields, and inline edit capability.
 * Founders can edit, publish, or request revisions directly from this page.
 *
 * @security Artifact access is scoped to the user's foundry via getFoundryIdCached().
 * Publish and edit actions are gated to founders in the server actions.
 *
 * @related
 * - src/actions/content-publishing.ts - Server actions for publish/revise/edit
 * - src/app/(platform)/review/page.tsx - Review queue listing
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { typography } from '@/lib/design-system'
import { PreviewContent } from './preview-content'

export const metadata: Metadata = {
    title: 'Preview Content | ForgeOS',
    description: 'Preview content before publishing',
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

// ─── Page Component ─────────────────────────────────────────────────

export default async function ContentPreviewPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    const foundryId = await getFoundryIdCached()
    if (!foundryId) notFound()

    const supabase = await createClient()

    // SECURITY: Filter by foundry_id to enforce tenant isolation
    const { data: artifact, error } = await supabase
        .from('agent_artifacts')
        .select('id, title, content, content_type, publish_status, publish_metadata, created_at, version_number')
        .eq('id', id)
        .eq('foundry_id', foundryId)
        .single()

    if (error || !artifact) notFound()

    // GUARD: Only show artifacts that are in review or revision_requested
    if (artifact.publish_status !== 'review' && artifact.publish_status !== 'revision_requested') {
        notFound()
    }

    const publishMetadata = (artifact.publish_metadata || {}) as Record<string, unknown>

    return (
        <div className="max-w-5xl space-y-6">
            <div>
                <h1 className={typography.h1}>Preview Content</h1>
                <p className="text-muted-foreground mt-1">
                    Review and edit before publishing
                </p>
            </div>

            <PreviewContent
                artifact={{
                    id: artifact.id,
                    title: artifact.title ?? '',
                    content: artifact.content ?? '',
                    content_type: artifact.content_type ?? 'blog',
                    publish_status: artifact.publish_status,
                    publish_metadata: publishMetadata,
                    created_at: artifact.created_at ?? '',
                    version_number: artifact.version_number ?? 1,
                }}
                appUrl={APP_URL}
            />
        </div>
    )
}
