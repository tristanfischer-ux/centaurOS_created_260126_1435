/**
 * @file /for-executives Landing Page
 *
 * @description Dedicated landing page targeting fractional executives.
 * Speaks to experienced leaders (CTOs, CFOs, COOs, product/engineering
 * heads) who want to earn income by helping hardware startups on a
 * fractional basis through ForgeOS.
 *
 * INTENT: Convert experienced professionals into executive listings
 * by communicating: qualified clients, fair compensation, simple process.
 *
 * @component
 */

import type { Metadata } from "next"
import { ExecutivesContent } from "./executives-content"

export const metadata: Metadata = {
  title: "For Executives — Turn Your Expertise Into Revenue | ForgeOS",
  description:
    "Join 200+ fractional executives helping hardware startups build, scale, and ship. Set your own rate, get matched with funded companies, and get paid on delivery.",
  openGraph: {
    title: "For Executives — Turn Your Expertise Into Revenue",
    description:
      "Join 200+ fractional executives helping hardware startups build, scale, and ship. Set your own rate, get matched with funded companies.",
    type: "website",
    url: "https://fractionalforge.app/for-executives",
    siteName: "ForgeOS by Fractional Forge",
  },
  twitter: {
    card: "summary_large_image",
    title: "For Executives — Turn Your Expertise Into Revenue",
    description:
      "Join 200+ fractional executives on ForgeOS. Set your rate, get matched with funded startups, get paid on delivery.",
  },
  alternates: {
    canonical: "https://fractionalforge.app/for-executives",
  },
}

export default function ForExecutivesPage() {
  return <ExecutivesContent />
}
