'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updatePitchSection, type PitchSectionRow } from '@/actions/money-pitch'
import type { PitchSectionKey, PitchSectionStatus } from '@/lib/money/pitch-keys'
import { toast } from 'sonner'

const SECTION_FIELDS: Record<PitchSectionKey, Array<{ key: string; label: string; type: 'text' | 'long' }>> = {
  company: [
    { key: 'one_liner', label: 'One-liner', type: 'text' },
    { key: 'mission', label: 'Mission', type: 'long' },
    { key: 'origin_story', label: 'Origin story', type: 'long' },
  ],
  market: [
    { key: 'tam_gbp', label: 'TAM (£)', type: 'text' },
    { key: 'sam_gbp', label: 'SAM (£)', type: 'text' },
    { key: 'why_now', label: 'Why now', type: 'long' },
  ],
  problem: [
    { key: 'who_hurts', label: 'Who hurts', type: 'text' },
    { key: 'pain_evidence', label: 'Evidence of pain', type: 'long' },
    { key: 'today_workaround', label: 'How they cope today', type: 'long' },
  ],
  traction: [
    { key: 'headline_metric', label: 'Headline metric', type: 'text' },
    { key: 'growth_chart', label: 'Growth narrative', type: 'long' },
    { key: 'logos', label: 'Notable customers / partners', type: 'long' },
  ],
  team: [
    { key: 'founders_bullets', label: 'Founder bios', type: 'long' },
    { key: 'why_us', label: 'Why us', type: 'long' },
  ],
  ask: [
    { key: 'amount', label: 'Amount asking (£)', type: 'text' },
    { key: 'use_of_funds', label: 'Use of funds', type: 'long' },
    { key: 'milestones', label: 'Milestones to next round', type: 'long' },
  ],
  financial_model: [
    { key: 'revenue_summary', label: 'Revenue model summary', type: 'long' },
    { key: 'unit_economics', label: 'Unit economics', type: 'long' },
    { key: 'projection_link', label: 'Link to model spreadsheet', type: 'text' },
  ],
  cap_table: [
    { key: 'pre_money_cents', label: 'Pre-money valuation (£)', type: 'text' },
    { key: 'shareholders', label: 'Existing shareholders', type: 'long' },
    { key: 'option_pool', label: 'Option pool plan', type: 'long' },
  ],
}

const STATUS_OPTIONS: PitchSectionStatus[] = ['not_started', 'in_progress', 'done']

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

export function PitchSectionView({ section }: { section: PitchSectionRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const fieldsConfig = SECTION_FIELDS[section.section_key]
  const initialValues = useMemo(() => {
    const out: Record<string, string> = {}
    for (const f of fieldsConfig) {
      const v = section.narrative_fields[f.key]
      out[f.key] = typeof v === 'string' ? v : v != null ? String(v) : ''
    }
    return out
  }, [section.narrative_fields, fieldsConfig])

  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [status, setStatus] = useState<PitchSectionStatus>(section.status)

  const onSave = () => {
    const narrative: Record<string, unknown> = {}
    for (const f of fieldsConfig) {
      narrative[f.key] = values[f.key] ?? ''
    }
    startTransition(async () => {
      const result = await updatePitchSection(section.id, {
        narrative_fields: narrative,
        status,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Section saved')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{SECTION_LABELS[section.section_key]}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={status === 'done' ? 'success' : status === 'in_progress' ? 'warning' : 'secondary'}>
              {status.replace('_', ' ')}
            </Badge>
            {section.last_edited_at && (
              <span className="text-xs text-muted-foreground">
                Last edited {new Date(section.last_edited_at).toLocaleString('en-GB')}
              </span>
            )}
          </div>
        </div>
        <Link href="/money/raise/pitch">
          <Button variant="secondary" size="sm">Back to overview</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fieldsConfig.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === 'long' ? (
                <Textarea
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  disabled={pending}
                  rows={4}
                />
              ) : (
                <Input
                  id={f.key}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  disabled={pending}
                />
              )}
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as PitchSectionStatus)}
              disabled={pending}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSave} disabled={pending}>
              {pending ? 'Saving...' : 'Save section'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
