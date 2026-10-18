"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect, useState } from "react";

/** Vercel Analytics 404s on localhost (and .env.local often sets VERCEL=1). */
export function MaybeAnalytics() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") setOn(true);
  }, []);
  return on ? <Analytics /> : null;
}
