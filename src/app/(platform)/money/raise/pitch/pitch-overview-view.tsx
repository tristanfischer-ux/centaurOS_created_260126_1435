'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText } from 'lucide-react'
import type { PitchOverview } from '@/actions/money-pitch'
import type { PitchSectionKey, PitchSectionStatus } from '@/lib/money/pitch-keys'

const SECTION_LABELS: Record<PitchSectionKey, string> = {
  company: 'Company',
  market: 'Market',
  problem: 'Problem',
  traction: 'Traction',
  team: 'Team',
  ask: 'Ask',
  financial_model: 'Financial model',
  cap_table: 'Cap table',
}

function statusBadge(status: PitchSectionStatus) {
  if (status === 'done') return <Badge variant="success" size="sm">Done</Badge>
  if (status === 'in_progress') return <Badge variant="warning" size="sm">In progress</Badge>
  return <Badge variant="secondary" size="sm">Not started</Badge>
}

export function PitchOverviewView({ overview }: { overview: PitchOverview }) {
  if (!overview.roundId) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Pitch prep</h1>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No active round"
              description="Create a round before drafting pitch material."
              action={
                <Link href="/money/raise/new-round">
                  <Button>Create round</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pitch prep</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="success">{overview.completionPct}% complete</Badge>
            <span className="text-xs text-muted-foreground">
              {overview.sections.filter((s) => s.status === 'done').length} of {overview.sections.length} sections done
            </span>
          </div>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Back to pipeline</Button>
        </Link>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {overview.sections.map((s) => (
          <Link
            key={s.section_key}
            href={`/money/raise/pitch/${s.section_key}`}
            className="block"
          >
            <Card className="hover:bg-muted/30 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{SECTION_LABELS[s.section_key]}</span>
                  {statusBadge(s.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {s.last_edited_at
                  ? `Last edited ${new Date(s.last_edited_at).toLocaleDateString('en-GB')}`
                  : 'Not started yet'}
                {Object.keys(s.narrative_fields).length > 0 && (
                  <span className="ml-2">
                    · {Object.keys(s.narrative_fields).length} field{Object.keys(s.narrative_fields).length === 1 ? '' : 's'}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
