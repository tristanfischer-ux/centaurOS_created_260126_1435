/**
 * @file sentry.client.config.ts
 * 
 * @description Sentry client-side configuration for browser error tracking.
 * This file configures Sentry to capture errors, performance metrics, and
 * session replays in the browser.
 * 
 * @security
 * - DSN is public (safe to expose in client bundle)
 * - User PII is not captured by default
 * - Session replay masks all text/inputs by default
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay - capture 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Enable debug in development
  debug: process.env.NODE_ENV === "development",

  // Environment tag
  environment: process.env.NODE_ENV,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Mask all text for privacy
      maskAllText: true,
      // Block all media
      blockAllMedia: true,
    }),
  ],

  // Filter out known non-actionable errors
  ignoreErrors: [
    // Browser extensions
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    // Network errors that are expected
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    // User-initiated navigation
    "AbortError",
    // ResizeObserver loop errors (benign)
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],

  // Before sending, sanitize data
  beforeSend(event) {
    // Don't send events without a message or exception
    if (!event.exception && !event.message) {
      return null;
    }
    return event;
  },
});
