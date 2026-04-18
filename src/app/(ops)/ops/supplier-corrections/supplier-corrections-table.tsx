"use client"

import React, { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Check, X, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  approveSupplierCorrection,
  rejectSupplierCorrection,
  type AdminSupplierCorrectionRow,
} from "@/actions/admin-supplier-corrections"

type FilterStatus = "pending" | "approved" | "rejected" | "all"

interface Props {
  initialRows: AdminSupplierCorrectionRow[]
}

export function SupplierCorrectionsTable({ initialRows }: Props) {
  const [rows, setRows] = useState<AdminSupplierCorrectionRow[]>(initialRows)
  const [filter, setFilter] = useState<FilterStatus>("pending")
  const [search, setSearch] = useState("")
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false
      if (!needle) return true
      const hay = [
        r.listingTitle ?? "",
        r.fieldName,
        r.currentValue ?? "",
        r.proposedValue,
        r.reason ?? "",
        r.submittedByEmail ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, filter, search])

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const res = await approveSupplierCorrection(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Correction applied")
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: "approved", appliedAt: new Date().toISOString() }
            : r,
        ),
      )
    })
  }

  const handleReject = (id: string) => {
    startTransition(async () => {
      const res = await rejectSupplierCorrection(id, rejectNote.trim() || undefined)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Correction rejected")
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)))
      setRejectingId(null)
      setRejectNote("")
    })
  }

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: rows.length }
    for (const r of rows) {
      if (r.status === "pending") c.pending++
      else if (r.status === "approved") c.approved++
      else if (r.status === "rejected") c.rejected++
    }
    return c
  }, [rows])

  return (
    <div className="space-y-4">
      {/* Filter + search controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {(["pending", "approved", "rejected", "all"] as FilterStatus[]).map((k) => (
            <Button
              key={k}
              variant={filter === k ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter(k)}
              className="capitalize"
            >
              {k} <span className="ml-1.5 text-xs text-muted-foreground">({counts[k]})</span>
            </Button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listing, field, value…"
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No corrections match the current filter.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">
                      {r.listingTitle ?? "(unknown listing)"}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {r.fieldName}
                    </Badge>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Submitted {new Date(r.createdAt).toLocaleDateString()} by{" "}
                    {r.submittedByEmail ?? r.submittedBy ?? "unknown"}
                  </p>
                </div>
                <a
                  href={`/marketplace/${r.listingId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-international-orange hover:underline inline-flex items-center gap-1 flex-shrink-0"
                >
                  Listing <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-3 bg-muted/30">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Current
                  </p>
                  <p className="text-xs text-foreground break-words">
                    {r.currentValue ?? <span className="text-muted-foreground italic">empty</span>}
                  </p>
                </div>
                <div className="border border-success/40 rounded-lg p-3 bg-success/5">
                  <p className="text-[10px] uppercase tracking-wide text-success mb-1">
                    Proposed
                  </p>
                  <p className="text-xs text-foreground break-words">{r.proposedValue}</p>
                </div>
              </div>

              {r.reason && (
                <div className="text-[11px] text-muted-foreground bg-muted/20 rounded px-3 py-2">
                  <strong className="text-foreground">Reason:</strong>{" "}
                  <span className="whitespace-pre-wrap">{r.reason}</span>
                </div>
              )}

              {r.status === "pending" && (
                <div className="flex items-center justify-end gap-2">
                  {rejectingId === r.id ? (
                    <>
                      <Input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Reviewer note (optional)"
                        className="h-8 text-xs w-64"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setRejectingId(null); setRejectNote("") }}
                        disabled={pending}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(r.id)}
                        disabled={pending}
                      >
                        Confirm reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRejectingId(r.id)}
                        disabled={pending}
                        className="gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(r.id)}
                        disabled={pending}
                        className="gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve &amp; apply
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="success" className="text-[10px]">Approved</Badge>
  if (status === "rejected") return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>
  return <Badge variant="warning" className="text-[10px]">Pending</Badge>
}
