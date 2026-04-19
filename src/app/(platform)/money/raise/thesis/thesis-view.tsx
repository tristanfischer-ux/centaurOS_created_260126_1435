'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveThesisVersion, type ThesisRow } from '@/actions/money-thesis'
import { toast } from 'sonner'

const STAGE_OPTIONS = ['pre_seed', 'seed', 'series_a', 'series_b']
const SECTOR_OPTIONS = ['hardware', 'software', 'agri_tech', 'climate', 'health', 'fintech', 'industrial']
const INSTRUMENT_OPTIONS = ['safe', 'priced_equity', 'convertible', 'asa']
const LEAD_OPTIONS = [
  { v: 'either', label: 'Either lead or follower' },
  { v: 'lead_only', label: 'Lead only' },
  { v: 'follower_only', label: 'Follower only' },
]

function ChipGroup({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v))
    else onChange([...selected, v])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o)
        return (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => toggle(o)}
          >
            {o.replace('_', ' ')}
          </Button>
        )
      })}
    </div>
  )
}

export function ThesisView({
  thesis,
  versions,
}: {
  thesis: ThesisRow | null
  versions: Array<{ id: string; version: number; created_at: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [stageTags, setStageTags] = useState<string[]>(thesis?.stage_tags ?? [])
  const [sectorTags, setSectorTags] = useState<string[]>(thesis?.sector_tags ?? [])
  const [geography, setGeography] = useState<string>(thesis?.geography.join(', ') ?? 'GB')
  const [chequeMin, setChequeMin] = useState<string>(
    thesis?.cheque_min_cents ? String(thesis.cheque_min_cents / 100) : '',
  )
  const [chequeMax, setChequeMax] = useState<string>(
    thesis?.cheque_max_cents ? String(thesis.cheque_max_cents / 100) : '',
  )
  const [instruments, setInstruments] = useState<string[]>(thesis?.preferred_instrument ?? [])
  const [decisionWeeks, setDecisionWeeks] = useState<string>(
    thesis?.decision_speed_max_weeks ? String(thesis.decision_speed_max_weeks) : '',
  )
  const [leadPref, setLeadPref] = useState<string>(thesis?.lead_follower_pref ?? 'either')

  const onSave = () => {
    if (stageTags.length === 0) {
      toast.error('Pick at least one stage')
      return
    }
    if (sectorTags.length === 0) {
      toast.error('Pick at least one sector')
      return
    }
    const geoArray = geography.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    const minCents = chequeMin ? Math.round(Number(chequeMin) * 100) : null
    const maxCents = chequeMax ? Math.round(Number(chequeMax) * 100) : null

    startTransition(async () => {
      const result = await saveThesisVersion({
        stage_tags: stageTags,
        sector_tags: sectorTags,
        geography: geoArray,
        cheque_min_cents: minCents,
        cheque_max_cents: maxCents,
        preferred_instrument: instruments,
        decision_speed_max_weeks: decisionWeeks ? Number(decisionWeeks) : null,
        lead_follower_pref: leadPref,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Thesis saved as version ${result.version}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investor thesis</h1>
          <div className="flex items-center gap-2 mt-2">
            {thesis ? (
              <Badge variant="success">Active version {thesis.version}</Badge>
            ) : (
              <Badge variant="secondary">No thesis yet</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {versions.length} version{versions.length === 1 ? '' : 's'} on file
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Your thesis drives investor match scores. Saving creates a new version; the active pointer moves to the latest save.
          </p>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Back to pipeline</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Edit thesis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Stage</Label>
            <ChipGroup options={STAGE_OPTIONS} selected={stageTags} onChange={setStageTags} disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label>Sector</Label>
            <ChipGroup options={SECTOR_OPTIONS} selected={sectorTags} onChange={setSectorTags} disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="geography">Geography (ISO codes, comma-separated)</Label>
            <Input
              id="geography"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              disabled={pending}
              placeholder="GB, US, DE"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="chequeMin">Cheque min (£)</Label>
              <Input
                id="chequeMin"
                type="number"
                inputMode="decimal"
                value={chequeMin}
                onChange={(e) => setChequeMin(e.target.value)}
                disabled={pending}
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chequeMax">Cheque max (£)</Label>
              <Input
                id="chequeMax"
                type="number"
                inputMode="decimal"
                value={chequeMax}
                onChange={(e) => setChequeMax(e.target.value)}
                disabled={pending}
                placeholder="500000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preferred instrument</Label>
            <ChipGroup
              options={INSTRUMENT_OPTIONS}
              selected={instruments}
              onChange={setInstruments}
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="decisionWeeks">Max decision speed (weeks)</Label>
              <Input
                id="decisionWeeks"
                type="number"
                value={decisionWeeks}
                onChange={(e) => setDecisionWeeks(e.target.value)}
                disabled={pending}
                placeholder="6"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leadPref">Lead preference</Label>
              <select
                id="leadPref"
                value={leadPref}
                onChange={(e) => setLeadPref(e.target.value)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {LEAD_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSave} disabled={pending}>
              {pending ? 'Saving...' : 'Save new version'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Version history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {versions.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between">
                  <span>Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
