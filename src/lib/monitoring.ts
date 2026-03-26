/**
 * @file monitoring.ts
 * 
 * @description Error monitoring and alerting setup using Sentry.
 * Captures errors, tracks performance, and enables fast incident response.
 * 
 * @setup
 * 1. Install: npm install @sentry/nextjs
 * 2. Set environment variables:
 *    - SENTRY_DSN: Your Sentry DSN
 *    - SENTRY_AUTH_TOKEN: For source maps (optional)
 * 3. Run: npx @sentry/wizard@latest -i nextjs
 * 
 * @usage
 * import { captureError, captureMessage, setUserContext } from '@/lib/monitoring'
 * 
 * // In error handlers
 * captureError(error, { feature: 'comparison-modal' })
 * 
 * // For warnings/info
 * captureMessage('User hit rate limit', 'warning')
 */

// Sentry initialization is typically done in sentry.client.config.ts and sentry.server.config.ts
// This file provides utilities for manual error capture and context setting

type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

interface ErrorContext {
  feature?: string
  userId?: string
  foundryId?: string
  extra?: Record<string, unknown>
}

/**
 * Capture an error with context.
 * Falls back to console.error if Sentry is not configured.
 * 
 * @param error - The error to capture
 * @param context - Additional context for debugging
 * 
 * @example
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   captureError(error, { feature: 'comparison-modal' })
 * }
 */
export function captureError(error: Error | unknown, context?: ErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // Log to console in development
  console.error('[Monitoring] Error captured:', {
    message: errorMessage,
    ...context,
  })

  // In production with Sentry configured, this would be:
  // Sentry.captureException(error, {
  //   tags: {
  //     feature: context?.feature,
  //   },
  //   user: context?.userId ? { id: context.userId } : undefined,
  //   extra: context?.extra,
  // })
  
  // DECISION: Error monitoring via console — Sentry integration deferred
}

/**
 * Capture a message (non-error event).
 * Useful for tracking warnings, user behavior, or business events.
 * 
 * @param message - The message to capture
 * @param level - Severity level
 * @param context - Additional context
 * 
 * @example
 * captureMessage('User hit rate limit', 'warning', { userId: user.id })
 */
export function captureMessage(
  message: string, 
  level: ErrorSeverity = 'info',
  context?: ErrorContext
): void {
  console.log(`[Monitoring] ${level.toUpperCase()}: ${message}`, context)
  
  // DECISION: Error monitoring via console — Sentry integration deferred
}

/**
 * Set user context for all subsequent error reports.
 * Call this after authentication.
 * 
 * @param userId - The user's ID
 * @param email - The user's email (optional)
 * @param foundryId - The user's foundry ID (optional)
 * 
 * @example
 * // After login
 * setUserContext(user.id, user.email, user.foundry_id)
 */
export function setUserContext(
  userId: string,
  email?: string,
  foundryId?: string
): void {
  console.log('[Monitoring] User context set:', { userId, foundryId })
  
  // DECISION: Error monitoring via console — Sentry integration deferred
}

/**
 * Clear user context on logout.
 */
export function clearUserContext(): void {
  console.log('[Monitoring] User context cleared')
  
  // DECISION: Error monitoring via console — Sentry integration deferred
}

/**
 * Start a performance transaction.
 * Use for tracking slow operations.
 * 
 * @param name - Transaction name
 * @param op - Operation type
 * @returns Transaction object with finish() method
 * 
 * @example
 * const transaction = startTransaction('comparison-ai-analysis', 'api.request')
 * try {
 *   await analyzeWithAI(items)
 * } finally {
 *   transaction.finish()
 * }
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  const start = Date.now()
  
  return {
    finish: () => {
      const duration = Date.now() - start
      console.log(`[Monitoring] Transaction "${name}" completed in ${duration}ms`)
      
      // DECISION: Error monitoring via console — Sentry integration deferred
    }
  }
}

/**
 * Configuration for Sentry initialization.
 * Use this in sentry.client.config.ts and sentry.server.config.ts
 */
export const SENTRY_CONFIG = {
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Adjust sample rates based on traffic
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Only capture errors in production by default
  enabled: process.env.NODE_ENV === 'production',
  
  // Environment
  environment: process.env.NODE_ENV,
  
  // Ignore common non-actionable errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    /^Loading chunk \d+ failed/,
  ],
  
  // Tag all errors with app info
  initialScope: {
    tags: {
      app: 'forgeos',
    },
  },
}

/**
 * Alert thresholds for monitoring.
 * Configure these in your Sentry project alerts.
 */
export const ALERT_THRESHOLDS = {
  // Alert if error rate exceeds 1% in 5 minutes
  errorRatePercent: 1,
  errorRateWindowMinutes: 5,
  
  // Alert on any error in critical features
  criticalFeatures: [
    'comparison-modal',
    'checkout',
    'authentication',
    'task-creation',
  ],
  
  // Alert if P95 latency exceeds 3 seconds
  latencyP95Ms: 3000,
}
