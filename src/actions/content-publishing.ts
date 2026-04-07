'use server'

/**
 * @file content-publishing.ts -- Server actions for specialist content publishing.
 *
 * @description Provides the draft → review → publish workflow for specialist-created
 * content (blog posts, pages, case studies). Specialists propose content via
 * PROPOSED_EXTERNAL_ACTION blocks, founders review and publish via the approval UI.
 *
 * @security All publish actions require authenticated founder role in the foundry.
 * Public content is served via SECURITY DEFINER RPCs that only return published items.
 *
 * @related
 * - src/lib/agents/tools/permission-guard.ts - PublishContentPayload type
 * - src/components/specialists/publish-content-card.tsx - Approval UI
 * - src/app/(content)/blog/[slug]/page.tsx - Public blog route
 * - supabase/migrations/20260410100000_specialist_content_publishing.sql - Schema
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { revalidatePath } from 'next/cache'
import type { PublishContentPayload } from '@/lib/agents/tools/permission-guard'

// ─── Types ──────────────────────────────────────────────────────────

export interface PublishMetadata {
    slug: string
    meta_title?: string
    meta_description: string
    og_image_url?: string
    tags: string[]
    content_category?: string
}

interface PublishResult {
    url: string | null
    error: string | null
}

// ─── Slug Generation ────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a title.
 * Alphanumeric + hyphens only, max 120 chars.
 */
function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120)
}

// ─── Publish Content (from specialist proposal) ─────────────────────

/**
 * Create a publishable artifact from a specialist's PROPOSED_EXTERNAL_ACTION.
 *
 * @description Called when a specialist outputs a publish_content proposal.
 * Creates an artifact with publish_status='review' so it appears in the
 * founder's review queue. Does NOT publish directly — founder must approve.
 *
 * @param payload - Content payload from the specialist's proposal
 * @returns The artifact ID or an error
 */
export async function createPublishableContent(
    payload: PublishContentPayload
): Promise<{ artifactId: string | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { artifactId: null, error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { artifactId: null, error: 'No active foundry' }

        const slug = slugify(payload.slug || payload.title)

        const { data, error } = await supabase
            .from('agent_artifacts')
            .insert({
                foundry_id: foundryId,
                created_by: user.id,
                title: payload.title,
                content: payload.content,
                content_type: payload.content_type,
                publish_status: 'review',
                publish_metadata: {
                    slug,
                    meta_title: payload.title,
                    meta_description: payload.meta_description,
                    og_image_url: payload.og_image_url || null,
                    tags: payload.tags || [],
                    view_count: 0,
                },
                metadata: {},
            })
            .select('id')
            .single()

        if (error) return { artifactId: null, error: sanitizeErrorMessage(error.message) }

        return { artifactId: data.id, error: null }
    } catch (err) {
        return { artifactId: null, error: sanitizeErrorMessage(String(err)) }
    }
}

// ─── Approve & Publish ──────────────────────────────────────────────

/**
 * Publish an artifact that's in review.
 *
 * @description Transitions an artifact from 'review' to 'published'.
 * Only founders can call this. Triggers ISR revalidation for the public route.
 *
 * @param artifactId - The artifact to publish
 * @param metadata - Optional metadata overrides (slug, SEO fields)
 * @returns The live public URL or an error
 *
 * @security Validates caller is a Founder in the artifact's foundry.
 */
export async function publishContent(
    artifactId: string,
    metadata?: Partial<PublishMetadata>
): Promise<PublishResult> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { url: null, error: 'Not authenticated' }

        // AUTH: Verify caller is founder
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, foundry_id')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'Founder') {
            return { url: null, error: 'Only founders can publish content' }
        }

        // Fetch current artifact
        const { data: artifact, error: fetchError } = await supabase
            .from('agent_artifacts')
            .select('id, publish_status, publish_metadata, content_type, foundry_id')
            .eq('id', artifactId)
            .single()

        if (fetchError || !artifact) {
            return { url: null, error: 'Artifact not found' }
        }

        // SECURITY: Verify artifact belongs to founder's foundry
        if (artifact.foundry_id !== profile.foundry_id) {
            return { url: null, error: 'Access denied' }
        }

        if (artifact.publish_status !== 'review' && artifact.publish_status !== 'revision_requested') {
            return { url: null, error: `Cannot publish artifact in '${artifact.publish_status}' status` }
        }

        const currentMeta = (artifact.publish_metadata || {}) as Record<string, unknown>
        const slug = metadata?.slug || (currentMeta.slug as string)

        if (!slug) {
            return { url: null, error: 'Slug is required for publishing' }
        }

        const now = new Date().toISOString()
        const updatedMeta = {
            ...currentMeta,
            ...(metadata || {}),
            slug,
            published_at: now,
            published_by: user.id,
        }

        const { error: updateError } = await supabase
            .from('agent_artifacts')
            .update({
                publish_status: 'published',
                publish_metadata: updatedMeta,
                updated_at: now,
            })
            .eq('id', artifactId)

        if (updateError) {
            return { url: null, error: sanitizeErrorMessage(updateError.message) }
        }

        // Determine URL based on content type
        const contentType = artifact.content_type as string
        const urlPrefix = contentType === 'blog' ? '/blog' : '/pages'
        const liveUrl = `${urlPrefix}/${slug}`

        // Trigger ISR revalidation so the page is immediately available
        revalidatePath(liveUrl)
        revalidatePath('/blog') // Revalidate blog index too
        revalidatePath('/sitemap.xml')

        return { url: liveUrl, error: null }
    } catch (err) {
        return { url: null, error: sanitizeErrorMessage(String(err)) }
    }
}

// ─── Request Revision ───────────────────────────────────────────────

/**
 * Send an artifact back to the specialist with revision notes.
 *
 * @description Transitions to 'revision_requested'. The specialist's next
 * sweep will pick up artifacts in this state and generate a revised version.
 *
 * @param artifactId - The artifact to send back
 * @param notes - What needs to change
 */
export async function requestRevision(
    artifactId: string,
    notes: string
): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, foundry_id')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'Founder') {
            return { error: 'Only founders can request revisions' }
        }

        const { data: artifact } = await supabase
            .from('agent_artifacts')
            .select('id, foundry_id, publish_metadata')
            .eq('id', artifactId)
            .single()

        if (!artifact || artifact.foundry_id !== profile.foundry_id) {
            return { error: 'Artifact not found' }
        }

        const currentMeta = (artifact.publish_metadata || {}) as Record<string, unknown>

        const { error } = await supabase
            .from('agent_artifacts')
            .update({
                publish_status: 'revision_requested',
                publish_metadata: {
                    ...currentMeta,
                    review_notes: notes,
                    reviewed_by: user.id,
                },
                updated_at: new Date().toISOString(),
            })
            .eq('id', artifactId)

        if (error) return { error: sanitizeErrorMessage(error.message) }

        return { error: null }
    } catch (err) {
        return { error: sanitizeErrorMessage(String(err)) }
    }
}

// ─── Update Content (inline edit before publish) ────────────────────

/**
 * Update artifact content before publishing (founder inline edit).
 *
 * @description Allows the founder to make small edits to specialist content
 * before publishing. Creates a new version in agent_artifact_versions.
 */
export async function updateContentBeforePublish(
    artifactId: string,
    updates: { title?: string; content?: string; publish_metadata?: Partial<PublishMetadata> }
): Promise<{ error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Not authenticated' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, foundry_id')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'Founder') {
            return { error: 'Only founders can edit content' }
        }

        const { data: artifact } = await supabase
            .from('agent_artifacts')
            .select('id, foundry_id, publish_metadata, content, title, version_number')
            .eq('id', artifactId)
            .single()

        if (!artifact || artifact.foundry_id !== profile.foundry_id) {
            return { error: 'Artifact not found' }
        }

        const currentMeta = (artifact.publish_metadata || {}) as Record<string, unknown>
        const newVersion = (artifact.version_number || 1) + 1

        // Save current version to history
        await supabase.from('agent_artifact_versions').insert({
            artifact_id: artifactId,
            foundry_id: artifact.foundry_id,
            version_number: artifact.version_number ?? 1,
            title: artifact.title ?? '',
            content: artifact.content ?? '',
            edited_by: user.id,
            change_summary: 'Pre-publish edit by founder',
        })

        // Apply updates
        const updatePayload: Record<string, unknown> = {
            version_number: newVersion,
            updated_at: new Date().toISOString(),
        }

        if (updates.title) updatePayload.title = updates.title
        if (updates.content) updatePayload.content = updates.content
        if (updates.publish_metadata) {
            updatePayload.publish_metadata = { ...currentMeta, ...updates.publish_metadata }
        }

        const { error } = await supabase
            .from('agent_artifacts')
            .update(updatePayload)
            .eq('id', artifactId)

        if (error) return { error: sanitizeErrorMessage(error.message) }

        return { error: null }
    } catch (err) {
        return { error: sanitizeErrorMessage(String(err)) }
    }
}

// ─── Get Review Queue ───────────────────────────────────────────────

/**
 * Fetch all content pending review for the founder's foundry.
 */
export async function getReviewQueue(): Promise<{
    items: Array<{
        id: string
        title: string
        content: string
        content_type: string
        publish_status: string | null
        publish_metadata: Record<string, unknown>
        created_at: string
    }>
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { items: [], error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { items: [], error: 'No active foundry' }

        const { data, error } = await supabase
            .from('agent_artifacts')
            .select('id, title, content, content_type, publish_status, publish_metadata, created_at')
            .eq('foundry_id', foundryId)
            .in('publish_status', ['review', 'revision_requested'])
            .order('created_at', { ascending: false })

        if (error) return { items: [], error: sanitizeErrorMessage(error.message) }

        return {
            items: (data || []).map(item => ({
                ...item,
                publish_metadata: (item.publish_metadata || {}) as Record<string, unknown>,
            })),
            error: null,
        }
    } catch (err) {
        return { items: [], error: sanitizeErrorMessage(String(err)) }
    }
}
