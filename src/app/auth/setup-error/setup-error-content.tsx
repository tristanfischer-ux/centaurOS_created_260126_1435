"use client";

/**
 * Client component for /auth/setup-error.
 * Reads query params (reason, error_id, message) via useSearchParams.
 * Renders a friendly error state with retry + email-support CTAs.
 */

import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

// Canned friendly messages keyed by reason.
// These are fallbacks if the caller did not pass ?message= in the URL.
const REASON_MESSAGES: Record<string, string> = {
  foundry_creation_failed:
    "We hit a snag setting up your workspace. Your account exists but we could not finish creating your foundry.",
  foundry_slug_collision:
    "We had trouble creating a unique workspace for your company. Please try again.",
  rls_denied:
    "We were not able to create your workspace due to a permissions issue. Please try again.",
  profile_creation_failed:
    "We hit a snag creating your profile. Your account may exist but your workspace was not set up correctly.",
  auth_user_missing:
    "We could not complete your account setup. Please try signing up again.",
  unknown:
    "Something unexpected happened while setting up your account.",
};

const SUPPORT_EMAIL = "tristan.fischer@gmail.com";

export default function SetupErrorContent() {
  const params = useSearchParams();
  const reason = params.get("reason") ?? "unknown";
  const errorId = params.get("error_id") ?? "";
  // Callers may pass a URL-encoded userMessage for extra context
  const customMessage = params.get("message");

  const displayMessage =
    customMessage
      ? decodeURIComponent(customMessage)
      : REASON_MESSAGES[reason] ?? REASON_MESSAGES.unknown;

  const emailSubject = encodeURIComponent("Fractional Forge account setup issue");
  const emailBody = encodeURIComponent(
    `Hi Tristan,\n\nI ran into an issue setting up my account on Fractional Forge.\n\nError code: ${errorId || "unknown"}\n\nPlease let me know how to get this sorted.\n\nThanks`
  );
  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${emailSubject}&body=${emailBody}`;

  function handleRetry() {
    // Reload the page — the signup form or OAuth flow will re-run setupNewUser
    window.location.href = "/signup";
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            We hit a snag setting up your account
          </h1>
        </div>

        {/* Error card */}
        <Card>
          <CardHeader className="pb-2">
            <p className="text-base text-foreground leading-relaxed">{displayMessage}</p>
          </CardHeader>

          <CardContent className="pt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              This is almost always a temporary issue. Reloading and trying again fixes it in
              most cases.
            </p>

            {/* Error ID — only shown when present */}
            {errorId && (
              <div className="rounded-md bg-muted px-4 py-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reference code
                </p>
                <p
                  className="font-mono text-sm font-semibold text-foreground select-all"
                  aria-label="Error reference code"
                >
                  {errorId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Include this code if you email Tristan — it helps him find exactly what went
                  wrong.
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            {/* Primary: retry */}
            <Button
              onClick={handleRetry}
              className="w-full"
              size="lg"
            >
              Try again
            </Button>

            {/* Secondary: email Tristan */}
            <Button
              asChild
              variant="outline"
              className="w-full"
              size="lg"
            >
              <a href={mailtoHref}>
                Email Tristan for help
              </a>
            </Button>
          </CardFooter>
        </Card>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground">
          Your email address has been saved. You will not lose your place in the queue.
        </p>
      </div>
    </div>
  );
}
