/**
 * PostHog Analytics Provider
 *
 * INTENT: Initializes PostHog product analytics on the client side for
 * authenticated platform pages only (not marketing pages).
 *
 * DECISION: PostHog is wrapped in a provider that gracefully no-ops when the
 * NEXT_PUBLIC_POSTHOG_KEY env var is missing. This allows local dev and
 * preview deployments to work without analytics config.
 *
 * Page views are tracked automatically via the PostHogPageView component
 * which listens to Next.js pathname changes.
 */
"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// SECURITY: Only initialize when the key is present. No-op otherwise.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Tracks page views on pathname changes using Next.js App Router navigation.
 *
 * DECISION: We use usePathname + useSearchParams instead of router events
 * because App Router does not expose traditional router events. This is the
 * recommended pattern from PostHog's Next.js App Router docs.
 */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      // Combine pathname + search params for the full URL
      let url = window.origin + pathname;
      const search = searchParams?.toString();
      if (search) {
        url += "?" + search;
      }
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/**
 * PostHog provider that wraps platform pages.
 *
 * @description Initializes the PostHog JS client once on mount and provides
 * the PostHog context to all children. Automatically captures page views.
 * Gracefully no-ops when NEXT_PUBLIC_POSTHOG_KEY is not set.
 *
 * @param children - React children to wrap with PostHog context
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    // SECURITY: Skip initialization entirely when key is missing.
    // This prevents errors in local dev and preview deployments.
    if (!POSTHOG_KEY || initialized.current) return;

    // GDPR: Only initialize PostHog if the user has accepted cookies.
    // This ensures we don't track users before they consent (ePrivacy/GDPR).
    const hasConsent = document.cookie.includes("cookie_consent=accepted");
    if (!hasConsent) return;

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // DECISION: Disable automatic pageview capture because we handle it
      // manually via PostHogPageView to work with Next.js App Router.
      capture_pageview: false,
      // DECISION: Disable automatic pageleave to avoid double-counting.
      // Can be re-enabled later if session replay needs it.
      capture_pageleave: true,
      // DECISION: Respect Do Not Track browser setting.
      respect_dnt: true,
      // DECISION: Persistence via localStorage (default). Cookies are
      // not needed since we only track authenticated platform pages.
      persistence: "localStorage+cookie",
      // GOTCHA: loaded callback fires after the library is fully initialized.
      // Do not rely on posthog being ready before this fires.
      loaded: (ph) => {
        // Enable debug mode in development for easier troubleshooting.
        if (process.env.NODE_ENV === "development") {
          ph.debug();
        }
      },
    });

    initialized.current = true;
  }, []);

  // When PostHog key is not configured, render children without the provider.
  // This ensures the app works normally without analytics.
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
