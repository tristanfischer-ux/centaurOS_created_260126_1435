/**
 * @file sentry.server.config.ts
 * 
 * @description Sentry server-side configuration for Node.js runtime error tracking.
 * This file configures Sentry to capture server-side errors and performance metrics.
 * 
 * @security
 * - DSN should be in environment variables
 * - Sensitive data is stripped before sending
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring - disable tracing in dev to avoid log flood
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

  // Never verbose logging — kills dev server memory during LLM-heavy stages
  debug: false,

  // Environment tag
  environment: process.env.NODE_ENV,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",

  // Filter out known non-actionable errors
  ignoreErrors: [
    // Next.js internal errors
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    // Expected network errors
    "ECONNREFUSED",
    "ETIMEDOUT",
  ],

  // Before sending, sanitize data
  beforeSend(event) {
    // Strip sensitive headers
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-supabase-auth"];
    }
    return event;
  },
});
