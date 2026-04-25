/**
 * /auth/setup-error
 *
 * Shown when setupNewUser returns ok: false. Gives the founder a clear
 * explanation of what happened, an error_id they can include in a support
 * email, and two CTAs: reload the page (retry) or email Tristan directly.
 *
 * Query params:
 *   reason    — the SetupResult.reason discriminant (for display context)
 *   error_id  — short ID to include in support emails
 *   message   — optional URL-encoded userMessage override
 *
 * SECURITY: No sensitive data in query params. The only user-visible data
 * is the error_id (opaque short code) and a canned friendly message.
 * Raw error details are in signup_setup_errors (service-role only).
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import SetupErrorContent from "./setup-error-content";

export const metadata: Metadata = {
  title: "Account Setup Issue — ForgeOS",
  robots: { index: false, follow: false },
};

export default function SetupErrorPage() {
  return (
    <Suspense fallback={<SetupErrorFallback />}>
      <SetupErrorContent />
    </Suspense>
  );
}

function SetupErrorFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-4">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
