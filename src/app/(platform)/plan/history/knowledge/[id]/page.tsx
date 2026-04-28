/**
 * @file page.tsx — Read-only passthrough for legacy knowledge_notes inside
 * the new /plan/history surface.
 *
 * @description Per PLAN-SCHEMA §A.2 data-preservation we UNION legacy
 * knowledge_notes with history_entries at read time. Clicking a legacy
 * knowledge row from the unified timeline lands here — a simple read-only
 * markdown view, with a back link to History. Writes are NOT supported;
 * edits should be made from the existing /knowledge surface (still live
 * with the flag off).
 *
 * Flag-gated: OFF → redirect to legacy /knowledge/{id}.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"

export const metadata: Metadata = {
    title: "Knowledge note · History",
    description: "A preserved note from your knowledge vault.",
}

type PageProps = { params: Promise<{ id: string }> }

const UUID_REGEX = /^[0-9a-f-]{36}$/i

export default async function KnowledgeNotePage({
    params,
}: PageProps): Promise<React.ReactNode> {
    const { id } = await params
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect(UUID_REGEX.test(id) ? `/knowledge/${id}` : "/knowledge")

    if (!UUID_REGEX.test(id)) return <NotFound />

    const foundryId = await getFoundryIdCached().catch(() => null)
    if (!foundryId) return <NotFound />

    const supabase = await createClient()

    const [noteRes, linksRes] = await Promise.all([
        supabase
            .from("knowledge_notes")
            .select(
                "id, title, content, description, created_at, updated_at, source_specialist, domain_id, tags, is_pinned, is_verified",
            )
            .eq("id", id)
            .eq("foundry_id", foundryId)
            .maybeSingle(),
        supabase
            .from("knowledge_links")
            .select("id, source_note_id, target_note_id")
            .or(`source_note_id.eq.${id},target_note_id.eq.${id}`)
            .eq("foundry_id", foundryId),
    ])

    const note = noteRes.data as KnowledgeNoteDetail | null
    if (!note) return <NotFound />

    // Resolve domain name if present.
    let domainName: string | null = null
    if (note.domain_id) {
        const { data: domain } = await supabase
            .from("knowledge_domains")
            .select("name")
            .eq("id", note.domain_id)
            .maybeSingle()
        domainName = (domain as { name?: string } | null)?.name ?? null
    }

    const linkedIds = Array.from(
        new Set(
            ((linksRes.data as Array<{
                source_note_id: string
                target_note_id: string
            }> | null) ?? [])
                .flatMap((l) => [l.source_note_id, l.target_note_id])
                .filter((v) => v !== id),
        ),
    )
    let linkedNotes: Array<{ id: string; title: string }> = []
    if (linkedIds.length > 0) {
        const { data } = await supabase
            .from("knowledge_notes")
            .select("id, title")
            .in("id", linkedIds)
        linkedNotes = ((data as Array<{ id: string; title: string }> | null) ?? [])
    }

    return (
        <div className="mx-auto max-w-3xl p-6 sm:p-8">
            <div className="mb-4">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/plan/history">
                        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to History
                    </Link>
                </Button>
            </div>

            <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                        Knowledge note
                    </span>
                    {domainName ? (
                        <span className="text-xs text-muted-foreground">Domain: {domainName}</span>
                    ) : null}
                    {note.is_pinned ? (
                        <span className="text-xs text-international-orange">Pinned</span>
                    ) : null}
                    {note.is_verified ? (
                        <span className="text-xs text-emerald-700">Verified</span>
                    ) : null}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {note.title}
                </h1>
                <p className="text-xs text-muted-foreground">
                    <time dateTime={note.created_at}>
                        {new Date(note.created_at).toLocaleString(undefined, {
                            dateStyle: "full",
                            timeStyle: "short",
                        })}
                    </time>
                    {note.source_specialist ? ` · ${note.source_specialist}` : null}
                </p>
                {note.description ? (
                    <p className="text-sm text-muted-foreground">{note.description}</p>
                ) : null}
            </header>

            <section className="mt-6">
                <Card>
                    <CardContent className="p-4">
                        {note.content ? (
                            <Markdown content={note.content} className="text-sm" />
                        ) : (
                            <p className="text-sm italic text-muted-foreground">
                                No content captured.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </section>

            {note.tags && note.tags.length > 0 ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Tags
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {note.tags.map((t) => (
                            <span
                                key={t}
                                className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </section>
            ) : null}

            {linkedNotes.length > 0 ? (
                <section className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Linked notes
                    </h2>
                    <Card className="mt-2">
                        <CardContent className="divide-y divide-border p-0">
                            {linkedNotes.map((n) => (
                                <Link
                                    key={n.id}
                                    href={`/plan/history/knowledge/${n.id}`}
                                    className="block px-4 py-2 text-sm hover:bg-muted/40"
                                >
                                    {n.title}
                                </Link>
                            ))}
                        </CardContent>
                    </Card>
                </section>
            ) : null}
        </div>
    )
}

interface KnowledgeNoteDetail {
    id: string
    title: string
    content: string | null
    description: string | null
    created_at: string
    updated_at: string
    source_specialist: string | null
    domain_id: string | null
    tags: string[] | null
    is_pinned: boolean
    is_verified: boolean
}

function NotFound() {
    return (
        <div className="mx-auto max-w-2xl p-8">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <h1 className="text-2xl font-semibold tracking-tight">Note not found</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This knowledge note was removed, or you don&rsquo;t have access to it.
                </p>
                <div className="mt-4">
                    <Button asChild variant="outline">
                        <Link href="/plan/history">
                            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to History
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
