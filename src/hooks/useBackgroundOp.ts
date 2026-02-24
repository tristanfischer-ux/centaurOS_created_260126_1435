"use client"

/**
 * @file useBackgroundOp.ts
 *
 * @description Convenience wrapper around the BackgroundOps context.
 * Provides a `runInBackground` function that wraps any async function
 * with automatic startOp / completeOp / failOp lifecycle management.
 *
 * Features needing manual control can use the raw context methods
 * (startOp, updateOp, completeOp) directly via useBackgroundOps().
 *
 * @related
 * - BackgroundOps context: src/contexts/background-ops-context.tsx
 */

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { useBackgroundOps, type BackgroundOpUpdate } from "@/contexts/background-ops-context"

interface RunInBackgroundCallbacks {
  /** Update progress or step label on the running operation */
  update: (patch: BackgroundOpUpdate) => void
}

interface RunInBackgroundOptions {
  /** Message shown in toast on success (defaults to "{label} complete") */
  successMessage?: string
  /** Override the source route (defaults to current pathname) */
  sourceRoute?: string
}

interface UseBackgroundOpReturn {
  /** Wrap an async function with automatic background op lifecycle */
  runInBackground: (
    label: string,
    fn: (callbacks: RunInBackgroundCallbacks) => Promise<void>,
    options?: RunInBackgroundOptions,
  ) => Promise<void>
}

/**
 * Convenience hook for running async work as a tracked background operation.
 *
 * @description Automatically captures the current pathname as sourceRoute,
 * registers the operation with the global context, and handles
 * completion/failure lifecycle including toasts.
 *
 * @example
 * ```ts
 * const { runInBackground } = useBackgroundOp()
 *
 * await runInBackground("Generating blueprints", async ({ update }) => {
 *   update({ stepLabel: "System blueprint", progress: 25 })
 *   await generateImagesAction(scanId)
 *   update({ progress: 100 })
 * }, { successMessage: "Blueprints ready" })
 * ```
 */
export function useBackgroundOp(): UseBackgroundOpReturn {
  const pathname = usePathname()
  const { startOp, updateOp, completeOp, failOp } = useBackgroundOps()

  const runInBackground = useCallback(
    async (
      label: string,
      fn: (callbacks: RunInBackgroundCallbacks) => Promise<void>,
      options?: RunInBackgroundOptions,
    ): Promise<void> => {
      const route = options?.sourceRoute ?? pathname
      const id = startOp(label, route)

      const update = (patch: BackgroundOpUpdate): void => {
        updateOp(id, patch)
      }

      try {
        await fn({ update })
        completeOp(id, options?.successMessage)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        failOp(id, `${label} failed: ${message}`)
      }
    },
    [pathname, startOp, updateOp, completeOp, failOp],
  )

  return { runInBackground }
}
