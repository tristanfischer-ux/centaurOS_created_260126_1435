'use client'

/**
 * @file export-menu.tsx
 *
 * Shared Export dropdown used in the /money/raise headers. Adapted from the
 * legacy src/app/(platform)/investors/components/InvestorExportMenu.tsx to
 * call the new money-raise server actions (CSV only for this cut; PDF is
 * marked "Coming soon" and is a deliberate follow-up — the legacy export is
 * PPTX, not PDF, so we don't auto-port it here).
 *
 * Tier gating — enforced on the SERVER via getInvestorTierAccess() inside
 * exportInvestorsCsv / exportMatchedCsv. This client component does a soft
 * check for the Free tier to swap the menu for a cleaner upgrade CTA; the
 * server remains the source of truth if that check is ever bypassed.
 */

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  exportInvestorsCsv,
  exportMatchedCsv,
  exportPipelineCsv,
} from '@/actions/money-raise'
import type { RichInvestorFilters } from '@/lib/money/match-types'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, FileSpreadsheet, FileText, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'

export type ExportMenuKind = 'browse' | 'matched' | 'pipeline'

export type ExportMenuContext = {
  query?: string
  filters?: RichInvestorFilters
  includeMatchScore?: boolean
}

interface ExportMenuProps {
  kind: ExportMenuKind
  currentTier: SubscriptionTier
  context?: ExportMenuContext
}

// Tiers that unlock investor-facing exports (browse + matched). The pipeline
// export is yours, always exportable — gating on that happens in neither the
// server action nor this component.
const STARTER_PLUS_TIERS: ReadonlySet<SubscriptionTier> = new Set([
  'starter',
  'professional',
  'enterprise',
])

function triggerBrowserDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function describeKind(kind: ExportMenuKind): { label: string; description: string } {
  switch (kind) {
    case 'browse':
      return {
        label: 'investor list',
        description: 'Up to 500 firms matching your current filters and search.',
      }
    case 'matched':
      return {
        label: 'matched investors',
        description: 'Your top thesis-matched investors with match scores.',
      }
    case 'pipeline':
      return {
        label: 'pipeline',
        description: 'Every investor in your pipeline across all stages.',
      }
  }
}

export function ExportMenu({ kind, currentTier, context }: ExportMenuProps) {
  const [isPending, startTransition] = useTransition()
  const [upsellOpen, setUpsellOpen] = useState(false)
  const needsStarter = kind !== 'pipeline' && !STARTER_PLUS_TIERS.has(currentTier)
  const meta = describeKind(kind)

  const handleCsv = () => {
    startTransition(async () => {
      let res: { error: string } | { success: true; filename: string; csv: string }
      if (kind === 'browse') {
        res = await exportInvestorsCsv({
          query: context?.query,
          filters: context?.filters,
          limit: 500,
          includeMatchScore: context?.includeMatchScore ?? false,
        })
      } else if (kind === 'matched') {
        res = await exportMatchedCsv({ limit: 100 })
      } else {
        res = await exportPipelineCsv()
      }

      if ('error' in res) {
        if (res.error === 'tier_upgrade_required') {
          setUpsellOpen(true)
          return
        }
        if (res.error === 'no_active_thesis') {
          toast.error('Build a thesis first to export matched investors.')
          return
        }
        toast.error(`Export failed: ${res.error}`)
        return
      }
      triggerBrowserDownload(res.csv, res.filename)
      toast.success(`Downloaded ${res.filename}`)
    })
  }

  // Free-tier investor exports: show the trigger but open the upsell dialog
  // instead of running the action. Server still rejects if somehow bypassed.
  if (needsStarter) {
    return (
      <>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setUpsellOpen(true)}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export
        </Button>
        <UpsellDialog
          open={upsellOpen}
          onOpenChange={setUpsellOpen}
          kindLabel={meta.label}
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Export {meta.label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              handleCsv()
            }}
            className="gap-2 text-sm"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="gap-2 text-sm text-muted-foreground"
            title="PDF export coming soon"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            PDF
            <span className="ml-auto text-[10px] uppercase tracking-wider">
              Soon
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UpsellDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        kindLabel={meta.label}
      />
    </>
  )
}

function UpsellDialog({
  open,
  onOpenChange,
  kindLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kindLabel: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
            <Lock className="h-5 w-5 text-international-orange" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">
            Upgrade to Startup Team to export {kindLabel}
          </DialogTitle>
          <DialogDescription className="text-center">
            Exports unlock on Startup Team (£49/mo). Hand a clean investor list to
            co-founders, advisors, or your data room without re-typing a row.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button
            asChild
            className="bg-international-orange hover:bg-international-orange/90"
          >
            <Link href="/pricing?plan=starter">View Startup Team — £49/mo</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
