"use client"

/**
 * @file supplier-outreach-log.tsx — Lightweight supplier outreach status tracker.
 *
 * @description Per-supplier outreach status: not contacted / sent / replied /
 * awarded / declined, plus last-contact date, response-time (days), and a
 * free-text note. Backed by localStorage (per-project). Not a full
 * conversation log — a disciplined tracking layer founders can use in
 * parallel with their email client.
 *
 * @related
 * - Consumer: Source page, Shortlist tab
 */

import React, { useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Mail, CheckCircle2, Clock, XCircle, Circle, AlertCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"

export type OutreachStatus = "not_contacted" | "sent" | "replied" | "awarded" | "declined"

export interface OutreachEntry {
  status: OutreachStatus
  lastContactedAt?: string
  firstResponseAt?: string
  notes?: string
}

export type OutreachLogState = Record<string /* supplierId */, OutreachEntry>

interface SupplierOutreachLogProps {
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  state: OutreachLogState
  onChange: (next: OutreachLogState) => void
  /** SLA in days for an expected supplier reply — used to flag stale threads */
  replySlaDays?: number
  onReplySlaChange?: (days: number) => void
  /** Supplier matches by module, used to look up contact email/website */
  supplierMatches?: Map<string, CadLabSupplierMatch[]>
}

const STATUS_CONFIG: Record<OutreachStatus, { label: string; icon: React.ComponentType<{ className?: string }>; chip: "secondary" | "info" | "warning" | "success" | "destructive" }> = {
  not_contacted: { label: "Not contacted", icon: Circle, chip: "secondary" },
  sent: { label: "RFQ sent", icon: Mail, chip: "info" },
  replied: { label: "Replied", icon: CheckCircle2, chip: "success" },
  awarded: { label: "Awarded", icon: CheckCircle2, chip: "success" },
  declined: { label: "Declined", icon: XCircle, chip: "destructive" },
}

function daysBetween(iso: string | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

export function SupplierOutreachLog({
  shortlistedSuppliers,
  state,
  onChange,
  replySlaDays = 5,
  onReplySlaChange,
  supplierMatches,
}: SupplierOutreachLogProps) {
  const suppliers = useMemo(
    () => [...shortlistedSuppliers.values()].sort((a, b) => b.bestMatchScore - a.bestMatchScore),
    [shortlistedSuppliers],
  )

  // INTENT: Build contact index once. Supplier email/website come from the
  // supplier-match results (populated from marketplace_listings). Coverage is
  // patchy — email ~39%, website ~65% — so show whatever we have and don't
  // surface a placeholder when the field is empty.
  const contactBySupplier = useMemo(() => {
    const map = new Map<string, { email?: string | null; website?: string | null; contactName?: string | null; country?: string | null }>()
    if (!supplierMatches) return map
    for (const matches of supplierMatches.values()) {
      for (const m of matches) {
        if (!map.has(m.id)) {
          map.set(m.id, {
            email: m.contactEmail ?? null,
            website: m.websiteUrl ?? null,
            contactName: m.contactName ?? null,
            country: m.country ?? null,
          })
        }
      }
    }
    return map
  }, [supplierMatches])

  const updateEntry = useCallback((supplierId: string, patch: Partial<OutreachEntry>) => {
    const current = state[supplierId] ?? { status: "not_contacted" as OutreachStatus }
    onChange({ ...state, [supplierId]: { ...current, ...patch } })
  }, [state, onChange])

  const handleStatusChange = useCallback((supplierId: string, status: OutreachStatus) => {
    const current = state[supplierId] ?? { status: "not_contacted" as OutreachStatus }
    const updates: OutreachEntry = { ...current, status }
    if (status === "sent" && !current.lastContactedAt) {
      updates.lastContactedAt = new Date().toISOString()
    }
    if ((status === "replied" || status === "awarded") && !current.firstResponseAt) {
      updates.firstResponseAt = new Date().toISOString()
    }
    onChange({ ...state, [supplierId]: updates })
  }, [state, onChange])

  const stats = useMemo(() => {
    const bucket: Record<OutreachStatus, number> = {
      not_contacted: 0, sent: 0, replied: 0, awarded: 0, declined: 0,
    }
    for (const s of suppliers) {
      const entry = state[s.id]
      const status: OutreachStatus = entry?.status ?? "not_contacted"
      bucket[status]++
    }
    return bucket
  }, [suppliers, state])

  const staleSuppliers = useMemo(() => {
    const now = new Date()
    return suppliers.filter((s) => {
      const entry = state[s.id]
      if (!entry || entry.status !== "sent") return false
      const days = daysBetween(entry.lastContactedAt, now)
      return days !== null && days > replySlaDays
    })
  }, [suppliers, state, replySlaDays])

  if (suppliers.length === 0) return null

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-international-orange" />
              Supplier outreach log
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track who you&apos;ve contacted, who&apos;s replied, and what&apos;s stale.
            </p>
          </div>
          {onReplySlaChange && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              Expected reply SLA
              <input
                type="number"
                min={1}
                max={30}
                value={replySlaDays}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isNaN(n) && n >= 1 && n <= 30) onReplySlaChange(n)
                }}
                className="w-12 text-xs border border-input rounded px-1.5 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
              />
              days
            </label>
          )}
        </div>

        {/* ── Pipeline row ── */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(Object.entries(STATUS_CONFIG) as [OutreachStatus, typeof STATUS_CONFIG[OutreachStatus]][]).map(([k, cfg]) => {
            const count = stats[k]
            const Icon = cfg.icon
            return (
              <div key={k} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/40 border border-border">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground font-mono">{count}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{cfg.label}</span>
              </div>
            )
          })}
        </div>

        {/* ── Stale thread alert ── */}
        {staleSuppliers.length > 0 && (
          <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-warning/5 border border-warning/30">
            <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <span className="font-medium">{staleSuppliers.length} supplier{staleSuppliers.length === 1 ? "" : "s"}</span> sent a {replySlaDays === 1 ? "day" : `${replySlaDays}-day`} SLA ago with no reply logged. Follow up: {staleSuppliers.slice(0, 3).map((s) => s.name).join(", ")}
              {staleSuppliers.length > 3 ? ` + ${staleSuppliers.length - 3} more` : ""}.
            </p>
          </div>
        )}

        {/* ── Per-supplier rows ── */}
        <div className="space-y-1.5">
          {suppliers.map((s) => {
            const entry = state[s.id] ?? { status: "not_contacted" as OutreachStatus }
            const cfg = STATUS_CONFIG[entry.status]
            const Icon = cfg.icon
            const daysSinceContact = daysBetween(entry.lastContactedAt)
            const responseDays = entry.lastContactedAt && entry.firstResponseAt
              ? daysBetween(entry.lastContactedAt, new Date(entry.firstResponseAt))
              : null
            const isStale = entry.status === "sent" && daysSinceContact !== null && daysSinceContact > replySlaDays
            const contact = contactBySupplier.get(s.id)
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg border transition-colors",
                  isStale ? "border-warning/30 bg-warning/5" : "border-border bg-card",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <Badge variant={cfg.chip} className="h-4 px-1.5 text-[10px]">
                      <Icon className="h-2.5 w-2.5 mr-0.5" />
                      {cfg.label}
                    </Badge>
                    {isStale && (
                      <Badge variant="warning" className="h-4 px-1.5 text-[10px]">Stale</Badge>
                    )}
                  </div>
                  {/* Supplier contact details — shown only when the DB has them populated */}
                  {(contact?.email || contact?.website || contact?.contactName) && (
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {contact?.contactName && (
                        <span className="text-[10px] text-muted-foreground">{contact.contactName}</span>
                      )}
                      {contact?.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-[10px] text-info hover:underline flex items-center gap-0.5"
                        >
                          <Mail className="h-2.5 w-2.5" />
                          {contact.email}
                        </a>
                      )}
                      {contact?.website && (
                        <a
                          href={contact.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-info hover:underline flex items-center gap-0.5"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Website
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {entry.lastContactedAt && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Mail className="h-2.5 w-2.5" />
                        Sent {daysSinceContact}d ago
                      </span>
                    )}
                    {responseDays !== null && responseDays >= 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        Replied in {responseDays}d
                      </span>
                    )}
                  </div>
                  <textarea
                    placeholder="Notes — what they said, what you're waiting on, what you need to follow up on."
                    value={entry.notes ?? ""}
                    onChange={(e) => updateEntry(s.id, { notes: e.target.value })}
                    rows={1}
                    className="w-full mt-1.5 text-xs border border-input rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
                  />
                </div>
                <select
                  value={entry.status}
                  onChange={(e) => handleStatusChange(s.id, e.target.value as OutreachStatus)}
                  className="text-[11px] border border-input rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange flex-shrink-0"
                  aria-label={`Outreach status for ${s.name}`}
                >
                  {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
