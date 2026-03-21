"use client"

/**
 * @file BackgroundOpsIndicator.tsx
 *
 * @description Floating indicator that shows active and recently completed
 * background operations. Positioned fixed in the bottom-right, above the
 * OfflineIndicator. Collapsed view shows a pill with spinner + count;
 * expanded view shows a card listing each operation with progress.
 *
 * @related
 * - BackgroundOps context: src/contexts/background-ops-context.tsx
 * - useBackgroundOp hook: src/hooks/useBackgroundOp.ts
 * - Platform layout: src/app/(platform)/layout.tsx
 */

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useBackgroundOps } from "@/contexts/background-ops-context"
import type { BackgroundOp } from "@/contexts/background-ops-context"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: BackgroundOp["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
    case "complete":
      return <CheckCircle2 className="h-4 w-4 text-success" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />
  }
}

function formatElapsed(startedAt: number, finishedAt?: number): string {
  const elapsed = (finishedAt ?? Date.now()) - startedAt
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BackgroundOpsIndicator(): React.ReactElement | null {
  const { ops, activeCount, dismissOp } = useBackgroundOps()
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  if (ops.length === 0) return null

  return (
    <div className="fixed bottom-20 right-6 z-40 flex flex-col items-end gap-2 animate-in slide-in-from-bottom">
      {/* Expanded card */}
      {isExpanded && (
        <div className="w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Background Operations
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-0.5 rounded hover:bg-muted transition-colors"
              aria-label="Collapse operations panel"
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {ops.map((op) => (
              <OpRow key={op.id} op={op} onDismiss={dismissOp} pathname={pathname} />
            ))}
          </div>
        </div>
      )}

      {/* Collapsed pill */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-md",
          "hover:bg-muted transition-colors cursor-pointer",
        )}
        aria-label={isExpanded ? "Collapse operations" : "Expand operations"}
      >
        {activeCount > 0 ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-international-orange" />
            <span className="text-xs font-medium text-foreground">
              {activeCount} running
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-medium text-foreground">
              {ops.length} completed
            </span>
          </>
        )}
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}

// ─── Row ────────────────────────────────────────────────────────────────────

function OpRow({ op, onDismiss, pathname }: { op: BackgroundOp; onDismiss: (id: string) => void; pathname: string }) {
  return (
    <div className="px-3 py-2.5 border-b border-border last:border-b-0 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={op.status} />
          <span className="text-sm font-medium text-foreground truncate">
            {op.label}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">
            {formatElapsed(op.startedAt, op.finishedAt)}
          </span>
          {op.status !== "running" && (
            <button
              onClick={() => onDismiss(op.id)}
              className="p-0.5 rounded hover:bg-muted transition-colors"
              aria-label={`Dismiss ${op.label}`}
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Step label */}
      {op.stepLabel && op.status === "running" && (
        <p className="text-xs text-muted-foreground truncate pl-6">
          {op.stepLabel}
        </p>
      )}

      {/* Error message */}
      {op.error && op.status === "error" && (
        <p className="text-xs text-destructive truncate pl-6">
          {op.error}
        </p>
      )}

      {/* Progress bar */}
      {op.status === "running" && op.progress != null && (
        <div className="pl-6">
          <Progress value={op.progress} className="h-1.5" />
        </div>
      )}

      {/* Go to source route — hidden when already on the source page */}
      {op.sourceRoute && !pathname.startsWith(op.sourceRoute) && (
        <Link
          href={op.sourceRoute}
          className="flex items-center gap-1 text-xs text-international-orange hover:underline pl-6"
        >
          Go to source
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
