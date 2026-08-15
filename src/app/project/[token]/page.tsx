import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { getProjectByToken } from '@/lib/dossier-pipeline/queries'
import { CUSTOMER_STEPS, customerStepIndex, type DossierStatus } from '@/lib/dossier-pipeline/types'

/**
 * @file Customer project-status page (§6.4) — /project/[token]
 *
 * @description Order-tracking transparency for the concierge Dossier: a clean
 * 5-step tracker (Received → Validated → In progress → In engineering review →
 * Ready), timestamps from the event trail, and a Download button once the
 * Dossier is ready. Access is by unguessable token only.
 *
 * @security noindex; the token is the credential. The download link is a
 * short-lived signed URL to the private project-dossiers bucket, minted
 * server-side at render.
 */

export const dynamic = 'force-dynamic'
// Council #13/#17: never let a shared cache hold a token-keyed page or its
// short-lived signed download URL.
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Your Design Dossier — project status',
  robots: { index: false, follow: false },
  // Council (cross-client): the token lives in this URL — never let it leak in
  // a Referer header to any outbound link or asset.
  referrer: 'no-referrer',
}

const SIDE_STATE_COPY: Partial<Record<DossierStatus, { title: string; body: string }>> = {
  needs_info: {
    title: 'We need a little more information',
    body: 'Your brief is in, but we need a detail or two before Anvil can run. Check your email — Tristan will have written to you — or reply to your confirmation email.',
  },
  on_hold: {
    title: 'On hold',
    body: 'This project is paused for now. Reply to your confirmation email if you want to pick it back up.',
  },
  declined: {
    title: 'Not taken forward',
    body: 'We could not take this brief forward. Tristan will have emailed you the reason — usually scope, not quality.',
  },
}

export default async function ProjectStatusPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const view = await getProjectByToken(token)
  if (!view) notFound()

  const { project, events, dossierDownloadUrl } = view
  const side = SIDE_STATE_COPY[project.status]

  // First time each main-line status was reached (for timestamps under steps)
  const reachedAt = new Map<string, string>()
  for (const e of events) {
    if (!reachedAt.has(e.to_status)) reachedAt.set(e.to_status, e.created_at)
  }

  // Council #10: a side state (needs_info / on_hold / declined) must NOT wipe
  // the tracker to -1 — hold the last main-line position reached, with the
  // banner overlaid. 'delivered' completes the tracker.
  let stepIndex = customerStepIndex(project.status)
  if (stepIndex < 0) {
    let furthest = 0
    for (const e of events) {
      const idx = customerStepIndex(e.to_status)
      if (idx > furthest) furthest = idx
    }
    stepIndex = furthest
  }

  // Council #20: surface the latest Tristan-authored side-state note so a
  // needs_info customer can see what's asked without hunting their email.
  const sideNote = side
    ? [...events].reverse().find((e) => SIDE_STATE_COPY[e.to_status])?.note ?? null
    : null

  const fmt = (iso: string | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <MarketingNav />
      <main className="flex-1 px-4 sm:px-6 pb-16">
        <div className="mx-auto max-w-2xl pt-10 sm:pt-14 space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
              Design Dossier
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {project.company ? `${project.company} — ` : ''}project status
            </h1>
            <p className="text-muted-foreground">
              Submitted {fmt(project.created_at)} by {project.customer_name}. This page is private
              to you — please don&rsquo;t share the link.
            </p>
          </div>

          {side ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
              <h2 className="font-semibold text-foreground">{side.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{side.body}</p>
              {sideNote && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-white/60 p-3 text-sm text-foreground">
                  <span className="font-semibold">From Tristan:</span> {sideNote}
                </p>
              )}
              <p className="mt-3 text-sm">
                <a
                  className="font-semibold text-international-orange hover:underline"
                  href="mailto:hello@fractionalforge.app"
                >
                  Reply to us →
                </a>
              </p>
            </div>
          ) : null}

          {/* 5-step tracker */}
          <ol className="space-y-0">
            {CUSTOMER_STEPS.map((step, i) => {
              // 'delivered' completes the whole tracker (council #10)
              const delivered = project.status === 'delivered'
              const done = delivered || (stepIndex >= 0 && i < stepIndex)
              const current = !delivered && stepIndex === i
              const ts =
                step.key === 'ready'
                  ? fmt(reachedAt.get('ready') ?? reachedAt.get('delivered'))
                  : fmt(reachedAt.get(step.key))
              return (
                <li key={step.key} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < CUSTOMER_STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={`absolute left-[13px] top-7 h-full w-0.5 ${
                        done ? 'bg-international-orange' : 'bg-muted'
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      done || current
                        ? 'border-international-orange bg-international-orange text-white'
                        : 'border-muted bg-background text-muted-foreground'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p
                      className={`font-semibold ${
                        done || current ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                      {current && (
                        <span className="ml-2 rounded-full bg-international-orange/10 px-2 py-0.5 text-xs font-bold text-international-orange">
                          Now
                        </span>
                      )}
                    </p>
                    {ts && <p className="text-xs text-muted-foreground">{ts}</p>}
                  </div>
                </li>
              )
            })}
          </ol>

          {(project.status === 'ready' || project.status === 'delivered') && (
            <div className="rounded-xl border border-international-orange/40 bg-international-orange/5 p-6 text-center space-y-3">
              <h2 className="text-xl font-bold">Your Design Dossier is ready.</h2>
              <p className="text-sm text-muted-foreground">
                An auditable Excel workbook — open it and change an assumption to watch every number
                recompute. Reviewed by a senior engineer from our partner network.
              </p>
              {dossierDownloadUrl ? (
                <a
                  href={dossierDownloadUrl}
                  className="inline-flex items-center justify-center rounded-full bg-international-orange px-7 py-3 font-bold text-white hover:bg-international-orange-hover"
                >
                  Download your Dossier ↓
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The download link could not be generated just now — refresh the page, or reply to
                  your confirmation email.
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Questions, or want to talk it through?{' '}
            <a
              className="font-semibold text-international-orange"
              href="https://calendly.com/tristan-fischer-wjlf/30min"
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a 30-minute call with Tristan
            </a>{' '}
            or reply to your confirmation email.
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
