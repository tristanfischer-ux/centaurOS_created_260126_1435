/**
 * PipelineRunChip — presentational primitive for specialist pipeline status.
 *
 * Rendered on every V2 artefact page (brief, modules, BOM, cost, risks, ...)
 * to surface the state of the most recent pipeline run for that stage.
 *
 * This component is purely presentational:
 *   - It does NOT fetch data.
 *   - It does NOT trigger retries or actions.
 *   - The parent owns the data and any retry / cancel / re-run behaviour.
 *
 * Copy voice: first-person, British, no "AI" / "smart" / "intelligent"
 * (see CLAUDE.md §Writing for Tristan — in-product rule).
 *
 * Scoped via CSS modules so it slots into pages with their own scoped
 * CSS layers (.bm2-, .c2-, .op2-, ...) without collisions.
 */

import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
} from "lucide-react";

import styles from "./pipeline-run-chip.module.css";

export type PipelineRunStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "not-started";

export interface PipelineRunChipProps {
  status: PipelineRunStatus;
  /** Specialist display name — e.g. "Max". Shown in running/done states. */
  specialistName?: string;
  /** ISO timestamp — used for the "2m ago" relative time in done state. */
  startedAt?: string | null;
  /** Short error code, shown in the tooltip for the failed state. */
  errorCode?: string | null;
  /** Longer error message, shown as the primary tooltip in the failed state. */
  errorMessage?: string | null;
  /** Compact mode → smaller type, mini dot + label only. Defaults to false. */
  compact?: boolean;
}

/**
 * Tiny relative-time helper so we don't pull in date-fns just for this.
 * Accepts an ISO string and returns a short relative label from "now".
 * Returns "just now" for dates < 5 seconds away or in the (near) future.
 */
export function formatRelativeFromNow(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

export function PipelineRunChip({
  status,
  specialistName,
  startedAt,
  errorCode,
  errorMessage,
  compact = false,
}: PipelineRunChipProps) {
  const rootClass = [
    styles.chip,
    compact ? styles.chipCompact : "",
    stateClassFor(status, styles),
  ]
    .filter(Boolean)
    .join(" ");

  const iconClass = [styles.icon, compact ? styles.iconCompact : ""]
    .filter(Boolean)
    .join(" ");

  // Live states (queued/running) are announced politely; terminal states
  // are plain status chips.
  const isLive = status === "queued" || status === "running";
  const commonA11y = isLive
    ? ({ role: "status", "aria-live": "polite" as const })
    : ({ role: "status" as const });

  if (status === "not-started") {
    return (
      <span className={rootClass} {...commonA11y}>
        <CircleDashed className={iconClass} aria-hidden="true" />
        <span className={styles.label}>Not started</span>
      </span>
    );
  }

  if (status === "queued") {
    return (
      <span className={rootClass} {...commonA11y} title="Queued — waiting to start">
        <Clock className={iconClass} aria-hidden="true" />
        <span className={styles.label}>Queued</span>
      </span>
    );
  }

  if (status === "running") {
    const who = specialistName ? `${specialistName} is working…` : "Working…";
    const tooltip = specialistName
      ? `${specialistName} is working on this step`
      : "Working on this step";
    return (
      <span className={rootClass} {...commonA11y} title={tooltip}>
        <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" />
        <span className={styles.label}>{who}</span>
        <span className={styles.shimmer} aria-hidden="true" />
      </span>
    );
  }

  if (status === "done") {
    const rel = startedAt ? formatRelativeFromNow(startedAt) : "";
    const doneLabel = rel ? `Done ${rel}` : "Done";
    const tooltip = specialistName
      ? `${specialistName} completed this step`
      : "Step completed";
    return (
      <span className={rootClass} role="status" title={tooltip}>
        <CheckCircle2 className={iconClass} aria-hidden="true" />
        <span className={styles.label}>{doneLabel}</span>
      </span>
    );
  }

  if (status === "failed") {
    const tooltip =
      errorMessage ||
      (errorCode ? `Error: ${errorCode}` : "Step failed — review and retry");
    return (
      <span className={rootClass} role="status" title={tooltip}>
        <AlertCircle className={iconClass} aria-hidden="true" />
        <span className={styles.label}>Failed</span>
        <span className={styles.retryHint} aria-hidden="true">
          — Retry →
        </span>
        {/* Screen-reader-only longer description */}
        <span className="sr-only">
          {errorMessage
            ? `Failed: ${errorMessage}.`
            : errorCode
              ? `Failed with code ${errorCode}.`
              : "Failed. Retry from the parent control."}
        </span>
      </span>
    );
  }

  // cancelled
  return (
    <span className={rootClass} role="status" title="Cancelled">
      <CircleDashed className={iconClass} aria-hidden="true" />
      <span className={styles.label}>Cancelled</span>
    </span>
  );
}

function stateClassFor(
  status: PipelineRunStatus,
  s: Record<string, string>,
): string {
  switch (status) {
    case "not-started":
      return s.stateNotStarted ?? "";
    case "queued":
      return s.stateQueued ?? "";
    case "running":
      return s.stateRunning ?? "";
    case "done":
      return s.stateDone ?? "";
    case "failed":
      return s.stateFailed ?? "";
    case "cancelled":
      return s.stateCancelled ?? "";
    default: {
      // exhaustiveness guard
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default PipelineRunChip;
