/**
 * @file /for-manufacturers Landing Page
 *
 * @description Dedicated landing page targeting UK manufacturers and suppliers.
 * Speaks directly to SME manufacturers running at 60-75% utilisation who
 * want to fill capacity with qualified, funded hardware startup buyers.
 *
 * INTENT: Convert manufacturers/suppliers into marketplace listings by
 * communicating: qualified buyers, fair pricing, simple process.
 *
 * @component
 */

import type { Metadata } from "next"
import { ManufacturersContent } from "./manufacturers-content"

export const metadata: Metadata = {
  title: "For Manufacturers — Fill Your Empty Machines With Funded Buyers",
  description:
    "ForgeOS connects UK manufacturers with hardware startups who need parts made. Qualified buyers, no bidding wars. You set your prices. 13,700+ suppliers already listed.",
  openGraph: {
    title: "For Manufacturers — Fill Your Empty Machines With Funded Buyers",
    description:
      "ForgeOS connects UK manufacturers with hardware startups who need parts made. Qualified buyers, no bidding wars. You set your prices.",
    type: "website",
    url: "https://fractionalforge.app/for-manufacturers",
    siteName: "ForgeOS by Fractional Forge",
  },
  twitter: {
    card: "summary_large_image",
    title: "For Manufacturers — Fill Your Empty Machines",
    description:
      "ForgeOS connects UK manufacturers with hardware startups who need parts made. Qualified buyers, fair pricing, simple process.",
  },
  alternates: {
    canonical: "https://fractionalforge.app/for-manufacturers",
  },
}

export default function ForManufacturersPage() {
  return <ManufacturersContent />
}
