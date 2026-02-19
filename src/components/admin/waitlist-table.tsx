"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveWaitlistEntry, rejectWaitlistEntry } from "@/actions/waitlist";
import type { Database } from "@/types/database.types";
import { Loader2, Check, X } from "lucide-react";
import { format } from "date-fns";

type WaitlistRow = Database["public"]["Tables"]["waitlist"]["Row"];

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export function WaitlistTable({ initialEntries }: { initialEntries: WaitlistRow[] }) {
  const [entries, setEntries] = useState<WaitlistRow[]>(initialEntries);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered =
    filter === "all"
      ? entries
      : entries.filter((e) => e.status === filter);

  const counts = {
    pending: entries.filter((e) => e.status === "pending").length,
    approved: entries.filter((e) => e.status === "approved").length,
    rejected: entries.filter((e) => e.status === "rejected").length,
  };

  function handleApprove(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await approveWaitlistEntry(id);
      setPendingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "approved",
                approved_at: new Date().toISOString(),
              }
            : e
        )
      );
    });
  }

  function handleReject(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await rejectWaitlistEntry(id);
      setPendingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "rejected",
                approved_at: new Date().toISOString(),
              }
            : e
        )
      );
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Status filter + counts */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Filter:</span>
        {(
          [
            ["all", "All", entries.length],
            ["pending", "Pending", counts.pending],
            ["approved", "Approved", counts.approved],
            ["rejected", "Rejected", counts.rejected],
          ] as const
        ).map(([value, label, count]) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
            className="gap-1.5"
          >
            {label}
            <span
              className={
                filter === value
                  ? "bg-white/20 rounded-full px-1.5 text-xs"
                  : "bg-muted rounded-full px-1.5 text-xs text-muted-foreground"
              }
            >
              {count}
            </span>
          </Button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-status-error-light border border-destructive text-sm text-destructive">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No waitlist entries match the current filter.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium text-foreground p-3">Email</th>
                <th className="text-left font-medium text-foreground p-3">Status</th>
                <th className="text-left font-medium text-foreground p-3">Joined</th>
                <th className="text-right font-medium text-foreground p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-3 text-foreground">{row.email}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "pending"
                          ? "bg-status-warning-light text-status-warning-dark"
                          : row.status === "approved"
                            ? "bg-status-success-light text-status-success-dark"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {row.created_at
                      ? format(new Date(row.created_at), "MMM d, yyyy HH:mm")
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {row.status === "pending" && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1"
                          disabled={pendingId !== null}
                          onClick={() => handleApprove(row.id)}
                        >
                          {pendingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={pendingId !== null}
                          onClick={() => handleReject(row.id)}
                        >
                          {pendingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
