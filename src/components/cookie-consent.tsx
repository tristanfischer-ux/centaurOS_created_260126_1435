"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const COOKIE_NAME = "cookie_consent";
const COOKIE_VALUE_ACCEPTED = "accepted";
const COOKIE_VALUE_REJECTED = "rejected";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp("(^| )" + name + "=([^;]+)")
  );
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

/**
 * CookieConsent — bottom-right toast that does not block page content.
 *
 * @description Renders as a small fixed toast in the bottom-right corner on
 * desktop (bottom-stretched on mobile) so the page underneath stays clickable.
 * The wrapper uses `pointer-events-none` and the toast itself sets
 * `pointer-events-auto` so only the toast intercepts clicks. Buttons are kept
 * compact to honour the "small, doesn't intercept" brief.
 *
 * Layout decisions:
 *  - Desktop: bottom-right, max width ~360px, content can wrap.
 *  - Mobile: bottom-stretched (left + right insets) so the message stays
 *    legible on a narrow screen.
 *  - z-index 40 keeps the toast above page content but below modal overlays
 *    (which sit at z-50 per the design system).
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookie(COOKIE_NAME);
    if (consent !== COOKIE_VALUE_ACCEPTED && consent !== COOKIE_VALUE_REJECTED) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    setCookie(COOKIE_NAME, COOKIE_VALUE_ACCEPTED, ONE_YEAR_SECONDS);
    setVisible(false);
  }

  function handleReject() {
    setCookie(COOKIE_NAME, COOKIE_VALUE_REJECTED, ONE_YEAR_SECONDS);
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        // INTENT: pointer-events-none on the wrapper so the rest of the page
        // stays clickable. The toast itself opts back in with pointer-events-auto.
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end sm:inset-x-auto sm:right-4 sm:left-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            role="region"
            aria-label="Cookie preferences"
            className="pointer-events-auto w-full max-w-[360px] rounded-lg border border-border bg-card p-4 shadow-lg"
          >
            <p className="text-xs text-muted-foreground">
              We use cookies to improve your experience.{" "}
              <Link
                href="/privacy"
                className="text-international-orange underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                Privacy
              </Link>
              .
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={handleReject}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="inline-flex items-center justify-center rounded-md bg-international-orange px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
              >
                Accept
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
