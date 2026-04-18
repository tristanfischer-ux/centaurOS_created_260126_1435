"use client"

/**
 * @file supplier-enrichment-panel.tsx — Enrichment actions bound to a supplier.
 *
 * @description Single consolidated surface for all the new enrichment features:
 * AI brief (auto-loaded), rating submission, interview-reply ingestion,
 * data-quality correction. Designed to be embedded inside SupplierDetailDialog
 * or a similar supplier card.
 *
 * @related
 * - Actions: src/actions/supplier-enrichment.ts
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, Sparkles, Star, Flag, MessageSquareText, ShieldCheck, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getSupplierBrief,
  submitSupplierRating,
  submitSupplierCorrection,
  ingestInterviewReply,
  getSupplierRatingAggregate,
  getSupplierCertifications,
} from "@/actions/supplier-enrichment"

interface SupplierEnrichmentPanelProps {
  listingId: string
  supplierName: string
  projectId?: string | null
}

export function SupplierEnrichmentPanel({ listingId, supplierName, projectId }: SupplierEnrichmentPanelProps) {
  const [ratingOpen, setRatingOpen] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)

  return (
    <div className="space-y-3">
      <AIBriefCard listingId={listingId} />
      <CertificationsCard listingId={listingId} />
      <RatingAggregateCard listingId={listingId} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRatingOpen(true)}>
          <Star className="h-3.5 w-3.5 mr-1.5" /> Rate this supplier
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setInterviewOpen(true)}>
          <MessageSquareText className="h-3.5 w-3.5 mr-1.5" /> Log their reply
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCorrectionOpen(true)}>
          <Flag className="h-3.5 w-3.5 mr-1.5" /> Report data issue
        </Button>
      </div>
      <RatingDialog open={ratingOpen} onOpenChange={setRatingOpen} listingId={listingId} supplierName={supplierName} projectId={projectId} />
      <CorrectionDialog open={correctionOpen} onOpenChange={setCorrectionOpen} listingId={listingId} supplierName={supplierName} />
      <InterviewDialog open={interviewOpen} onOpenChange={setInterviewOpen} listingId={listingId} supplierName={supplierName} projectId={projectId} />
    </div>
  )
}

// ─── AI Brief card ──────────────────────────────────────────────────

function AIBriefCard({ listingId }: { listingId: string }) {
  const [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState<{ whoLine: string; greatAtLine: string; watchForLine: string; fromCache: boolean } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSupplierBrief(listingId).then((res) => {
      if (cancelled) return
      if ("error" in res) setErr(res.error)
      else setBrief(res)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [listingId])

  if (err) return null
  return (
    <Card className="border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-international-orange" />
          <p className="text-xs font-semibold text-foreground">Supplier brief</p>
          {brief?.fromCache && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">cached</Badge>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Generating…</div>
        ) : brief ? (
          <div className="space-y-1.5 text-xs">
            <p><span className="font-semibold text-foreground">Who:</span> <span className="text-muted-foreground">{brief.whoLine}</span></p>
            <p><span className="font-semibold text-foreground">Great at:</span> <span className="text-muted-foreground">{brief.greatAtLine}</span></p>
            <p><span className="font-semibold text-foreground">Watch for:</span> <span className="text-muted-foreground">{brief.watchForLine}</span></p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Certifications card ────────────────────────────────────────────

function CertificationsCard({ listingId }: { listingId: string }) {
  const [certs, setCerts] = useState<Array<{ cert_code: string; cert_label: string; issuer: string | null; issued_at: string | null; expires_at: string | null; verified: boolean }> | null>(null)
  useEffect(() => {
    let cancelled = false
    getSupplierCertifications(listingId).then((res) => {
      if (cancelled) return
      if ("error" in res) setCerts([])
      else setCerts(res.certifications)
    })
    return () => { cancelled = true }
  }, [listingId])

  if (!certs || certs.length === 0) return null
  const now = Date.now()
  return (
    <Card className="border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <p className="text-xs font-semibold text-foreground">Certifications ({certs.length})</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {certs.slice(0, 12).map((c) => {
            const expired = c.expires_at && new Date(c.expires_at).getTime() < now
            return (
              <span
                key={c.cert_code}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5",
                  expired
                    ? "border-destructive/30 bg-destructive/5 text-destructive line-through"
                    : c.verified
                      ? "border-success/30 bg-success/5 text-success"
                      : "border-border bg-muted/30 text-muted-foreground",
                )}
                title={c.issuer ? `Issued by ${c.issuer}` : undefined}
              >
                {c.cert_label}
                {c.expires_at && (
                  <span className="opacity-70">· exp {new Date(c.expires_at).toLocaleDateString()}</span>
                )}
              </span>
            )
          })}
          {certs.length > 12 && (
            <span className="text-[10px] text-muted-foreground">+{certs.length - 12} more</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Rating aggregate card ──────────────────────────────────────────

function RatingAggregateCard({ listingId }: { listingId: string }) {
  const [data, setData] = useState<{ count: number; aggregate: { onTime: number | null; quality: number | null; responsiveness: number | null; commercialFairness: number | null } | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    getSupplierRatingAggregate(listingId).then((res) => {
      if (cancelled) return
      if ("error" in res) return
      setData(res)
    })
    return () => { cancelled = true }
  }, [listingId])

  if (!data || data.count === 0 || !data.aggregate) return null
  const items: Array<{ label: string; v: number | null }> = [
    { label: "On time", v: data.aggregate.onTime },
    { label: "Quality", v: data.aggregate.quality },
    { label: "Responsive", v: data.aggregate.responsiveness },
    { label: "Commercial", v: data.aggregate.commercialFairness },
  ]
  return (
    <Card className="border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-3.5 w-3.5 text-warning" />
          <p className="text-xs font-semibold text-foreground">Founder ratings ({data.count})</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {items.map((it) => (
            <div key={it.label} className="text-center">
              <p className="text-sm font-bold font-mono text-foreground">{it.v ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">{it.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Rating dialog ──────────────────────────────────────────────────

function RatingDialog({ open, onOpenChange, listingId, supplierName, projectId }: { open: boolean; onOpenChange: (v: boolean) => void; listingId: string; supplierName: string; projectId?: string | null }) {
  const [onTime, setOnTime] = useState(0)
  const [quality, setQuality] = useState(0)
  const [responsiveness, setResponsiveness] = useState(0)
  const [commercialFairness, setCommercialFairness] = useState(0)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const canSubmit = onTime > 0 && quality > 0 && responsiveness > 0 && commercialFairness > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    const res = await submitSupplierRating({ listingId, projectId, onTime, quality, responsiveness, commercialFairness, notes })
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success(`Rated ${supplierName}`)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Rate {supplierName}</DialogTitle>
          <DialogDescription>Your ratings are public by default and contribute to the marketplace average. Other founders see the aggregate, not individual entries.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <StarRow label="On time" value={onTime} onChange={setOnTime} />
          <StarRow label="Quality" value={quality} onChange={setQuality} />
          <StarRow label="Responsiveness" value={responsiveness} onChange={setResponsiveness} />
          <StarRow label="Commercial fairness" value={commercialFairness} onChange={setCommercialFairness} />
          <div>
            <label className="text-xs font-medium text-foreground">Notes (optional, visible to your foundry only)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
              placeholder="Context, examples, anything you wish you'd known earlier"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Submit rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label}: ${n} out of 5`}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn("h-5 w-5", n <= value ? "fill-warning text-warning" : "text-muted-foreground/40")} />
          </button>
        ))}
        {value > 0 && <span className="ml-2 text-xs text-muted-foreground font-mono">{value}/5</span>}
      </div>
    </div>
  )
}

// ─── Correction dialog ──────────────────────────────────────────────

const CORRECTION_FIELDS: Array<{ value: string; label: string }> = [
  { value: "contact_email", label: "Contact email" },
  { value: "contact_name", label: "Contact name" },
  { value: "website_url", label: "Website URL" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "title", label: "Company name" },
  { value: "lead_time", label: "Lead time" },
  { value: "minimum_order", label: "Minimum order quantity (MOQ)" },
  { value: "other", label: "Something else" },
]

function CorrectionDialog({ open, onOpenChange, listingId, supplierName }: { open: boolean; onOpenChange: (v: boolean) => void; listingId: string; supplierName: string }) {
  const [fieldName, setFieldName] = useState(CORRECTION_FIELDS[0].value)
  const [currentValue, setCurrentValue] = useState("")
  const [proposedValue, setProposedValue] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!proposedValue.trim()) return
    setSaving(true)
    const res = await submitSupplierCorrection({ listingId, fieldName, currentValue, proposedValue, reason })
    setSaving(false)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Correction submitted — thank you")
      setCurrentValue(""); setProposedValue(""); setReason("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Report a data issue</DialogTitle>
          <DialogDescription>Flag outdated or incorrect data on {supplierName}. Corrections are reviewed before being applied marketplace-wide.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Field</label>
            <select
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              className="w-full mt-1 text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
            >
              {CORRECTION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Current value (if known)</label>
            <Input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} className="mt-1" placeholder="What's there now" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Correct value</label>
            <Input value={proposedValue} onChange={(e) => setProposedValue(e.target.value)} className="mt-1" placeholder="What it should be" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">How do you know (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full mt-1 text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y"
              placeholder="e.g., phoned them last week, new website, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!proposedValue.trim() || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Submit correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Interview ingestion dialog ─────────────────────────────────────

function InterviewDialog({ open, onOpenChange, listingId, supplierName, projectId }: { open: boolean; onOpenChange: (v: boolean) => void; listingId: string; supplierName: string; projectId?: string | null }) {
  const [rawReply, setRawReply] = useState("")
  const [share, setShare] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ extracted: Record<string, unknown>; parseError: string | null } | null>(null)

  const handleSubmit = async () => {
    if (rawReply.trim().length < 50) {
      toast.error("Reply is too short (min 50 chars)")
      return
    }
    setSaving(true)
    const res = await ingestInterviewReply({
      listingId, projectId, rawReply,
      sharePubliclyContributeToBenchmarks: share,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Saved")
    setResult({ extracted: res.parsed.raw, parseError: res.parsed.parse_error })
  }

  const extractedEntries = useMemo(
    () => (result ? Object.entries(result.extracted).filter(([, v]) => v !== null && v !== undefined && v !== "") : []),
    [result],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Log {supplierName}&apos;s reply</DialogTitle>
          <DialogDescription>Paste their full reply to your Capability Interview Pack. We&apos;ll extract MOQ / lead time / tooling / per-unit pricing into structured fields.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            value={rawReply}
            onChange={(e) => setRawReply(e.target.value)}
            rows={10}
            className="w-full text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange resize-y font-mono"
            placeholder="Paste the supplier's email reply here..."
          />
          <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-international-orange" />
            <span>
              Contribute to marketplace-wide benchmarks (anonymised). Helps every other founder get better quotes.
            </span>
          </label>
          {result && (
            <Card className="border-border">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs font-semibold text-foreground mb-2">Extracted</p>
                {extractedEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-warning" />
                    {result.parseError ?? "Nothing structured picked up — raw reply saved."}
                  </p>
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {extractedEntries.map(([k, v]) => (
                      <li key={k}>
                        <span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span>{" "}
                        <span className="font-medium text-foreground">{String(v)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSubmit} disabled={rawReply.trim().length < 50 || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save &amp; extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
