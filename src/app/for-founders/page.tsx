/**
 * @file /for-founders Landing Page
 *
 * @description Dedicated landing page targeting pre-revenue hardware startup
 * founders (pre-seed to Series A). Sells CAD Lab, AI specialists, and UK
 * supplier marketplace as a faster, cheaper alternative to traditional
 * engineering infrastructure.
 */

import { Metadata } from "next"
import { ForFoundersContent } from "./for-founders-content"

export const metadata: Metadata = {
  title: "For Founders — Stop Hiring Engineers. Start Building Products.",
  description:
    "ForgeOS turns your product idea into a complete engineering package — STEP files, BOM, DFM analysis, matched UK suppliers — in hours, not months. Start your free trial.",
  openGraph: {
    title: "ForgeOS for Hardware Founders",
    description:
      "Turn your product idea into a complete engineering package in hours, not months. STEP files, BOM, DFM analysis, and 13,700+ matched UK suppliers.",
    type: "website",
    url: "https://fractionalforge.app/for-founders",
  },
  twitter: {
    card: "summary_large_image",
    title: "ForgeOS for Hardware Founders",
    description:
      "Turn your product idea into a complete engineering package in hours, not months.",
  },
  alternates: {
    canonical: "https://fractionalforge.app/for-founders",
  },
}

export default function ForFoundersPage() {
  return <ForFoundersContent />
}
