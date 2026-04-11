"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";

const COOKIE_NAME = "cookie_consent";
const COOKIE_VALUE = "accepted";
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

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getCookie(COOKIE_NAME) !== COOKIE_VALUE) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    setCookie(COOKIE_NAME, COOKIE_VALUE, ONE_YEAR_SECONDS);
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4"
        >
          <Card className="max-w-4xl w-full p-4 sm:p-6 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <p className="text-sm text-muted-foreground flex-1">
                We use cookies to improve your experience. By continuing to use
                this site, you agree to our use of cookies.{" "}
                <Link
                  href="/privacy"
                  className="text-international-orange underline underline-offset-2 hover:opacity-80 transition-opacity"
                >
                  Privacy Policy
                </Link>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/privacy"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Manage
                </Link>
                <button
                  onClick={handleAccept}
                  className="inline-flex items-center justify-center rounded-md bg-international-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Accept
                </button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
