"use client";

/**
 * @file global-error.tsx
 * 
 * @description Global error boundary for the App Router.
 * This catches errors in the root layout and reports them to Sentry.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="mb-6 text-muted-foreground">
              We've been notified of this error and are working to fix it.
            </p>
            <button
              onClick={() => reset()}
              className="rounded-md bg-international-orange px-4 py-2 text-sm font-medium text-white hover:bg-international-orange-hover transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
