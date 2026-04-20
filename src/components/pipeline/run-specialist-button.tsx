"use client"

/**
 * RunSpecialistButton
 *
 * Reusable trigger for invoking a specialist server action from any V2
 * surface that has a "run decomposition / seed the brief / generate BOM"
 * empty state.
 *
 * Contract: the passed-in action returns either
 *   { ok: true,  runId: string }
 *   { ok: false, error: string, errorCode?: string }
 *
 * States: idle → running (optimistic from click) → success (brief tick) → idle
 *                                              ↘ error (inline 5s) → idle
 *
 * Voice rules (CLAUDE.md §Writing for Tristan):
 *  - First-person, British
 *  - No "AI" / "smart" / "intelligent"
 *  - Error copy starts "Couldn't start — …"
 *
 * The button is a direct trigger — NOT a <form>. Pages using this will
 * fire router.refresh() themselves via onSuccess if they need revalidation.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react"

import styles from "./run-specialist-button.module.css"

export interface RunSpecialistButtonProps {
  /** The server action to invoke. Must return { ok: true, runId: string } or { ok: false, error: string, errorCode?: string }. */
  action: () => Promise<
    { ok: true; runId: string } | { ok: false; error: string; errorCode?: string }
  >
  /** CTA label — e.g. "Decompose with Max", "Draft with Chase", "Generate BOM". */
  label: string
  /** Short sub-label shown under the primary — e.g. "Max · CTO · ~90s". Optional. */
  subLabel?: string
  /** Disabled-state reason shown as tooltip when disabled=true. */
  disabledReason?: string
  disabled?: boolean
  /** Visual variant. */
  variant?: "primary" | "secondary"
  /** Optional router push after success. */
  onSuccessHref?: string
  /** Optional callback after success — e.g. revalidate, update local state. */
  onSuccess?: (runId: string) => void
  /** Icon from lucide-react (ReactNode). Default: Sparkles. */
  icon?: React.ReactNode
}

type ViewState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success" }
  | { kind: "error"; message: string }

const SUCCESS_FLASH_MS = 1000
const ERROR_DISPLAY_MS = 5000

export function RunSpecialistButton({
  action,
  label,
  subLabel,
  disabledReason,
  disabled = false,
  variant = "primary",
  onSuccessHref,
  onSuccess,
  icon,
}: RunSpecialistButtonProps) {
  const router = useRouter()
  const [view, setView] = React.useState<ViewState>({ kind: "idle" })

  // Track mount status so timers don't set state on unmounted trees.
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isRunning = view.kind === "running"
  const isSuccess = view.kind === "success"
  const isError = view.kind === "error"

  // Button is interactively locked while running OR during the brief success flash
  // (prevents double-clicks before the router push takes effect).
  const interactionDisabled = disabled || isRunning || isSuccess

  const handleClick = React.useCallback(async () => {
    if (interactionDisabled) return

    setView({ kind: "running" })

    let result: Awaited<ReturnType<typeof action>>
    try {
      result = await action()
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error"
      // eslint-disable-next-line no-console
      console.error("[run-specialist-button] action threw:", err)
      if (!mountedRef.current) return
      setView({ kind: "error", message })
      window.setTimeout(() => {
        if (mountedRef.current) setView({ kind: "idle" })
      }, ERROR_DISPLAY_MS)
      return
    }

    if (!mountedRef.current) return

    if (result.ok) {
      setView({ kind: "success" })
      // Fire onSuccess FIRST (lets the page revalidate its data), THEN navigate.
      // Order matters: if the page pushes to a new URL before onSuccess runs,
      // the caller's revalidate might land on a stale unmounted component.
      try {
        onSuccess?.(result.runId)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[run-specialist-button] onSuccess threw:", err)
      }
      window.setTimeout(() => {
        if (!mountedRef.current) return
        setView({ kind: "idle" })
        if (onSuccessHref) {
          router.push(onSuccessHref)
        }
      }, SUCCESS_FLASH_MS)
      return
    }

    // Result is { ok: false }
    // eslint-disable-next-line no-console
    console.error(
      `[run-specialist-button] action failed${
        result.errorCode ? ` (${result.errorCode})` : ""
      }:`,
      result.error,
    )
    setView({ kind: "error", message: result.error })
    window.setTimeout(() => {
      if (mountedRef.current) setView({ kind: "idle" })
    }, ERROR_DISPLAY_MS)
  }, [action, interactionDisabled, onSuccess, onSuccessHref, router])

  const defaultIcon = <Sparkles className={styles.icon} aria-hidden="true" />
  const resolvedIcon = icon ?? defaultIcon

  const buttonClass = [
    styles.button,
    variant === "primary" ? styles.primary : styles.secondary,
    isRunning ? styles.running : "",
    isSuccess ? styles.success : "",
    isError ? styles.hasError : "",
  ]
    .filter(Boolean)
    .join(" ")

  const tooltip = disabled ? disabledReason : undefined

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={buttonClass}
        onClick={handleClick}
        disabled={interactionDisabled}
        aria-busy={isRunning}
        aria-disabled={disabled || undefined}
        title={tooltip}
      >
        <span className={styles.iconSlot}>
          {isRunning ? (
            <Loader2 className={`${styles.icon} ${styles.spin}`} aria-hidden="true" />
          ) : isSuccess ? (
            <CheckCircle2 className={styles.icon} aria-hidden="true" />
          ) : (
            resolvedIcon
          )}
        </span>
        <span className={styles.labels}>
          <span className={styles.label}>
            {isRunning ? "Starting…" : isSuccess ? "Started" : label}
          </span>
          {subLabel && !isRunning && !isSuccess ? (
            <span className={styles.subLabel}>{subLabel}</span>
          ) : null}
        </span>
      </button>
      {isError ? (
        <p className={styles.errorMessage} role="alert">
          <AlertCircle className={styles.errorIcon} aria-hidden="true" />
          <span>Couldn&rsquo;t start — {view.message}</span>
        </p>
      ) : null}
    </div>
  )
}

export default RunSpecialistButton
