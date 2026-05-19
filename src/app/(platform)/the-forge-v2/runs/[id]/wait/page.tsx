/**
 * @file runs/[id]/wait/page.tsx — A1-minimal interstitial.
 *
 * Polls /api/pdf-engine-v2/status/[id] every 5 seconds. When status flips
 * to 'ready' the client redirects to /the-forge-v2/runs/[id]/download.
 * When status flips to 'failed' the page shows the error and a "Try again"
 * link back to /the-forge-v2/new-v2.
 */

import type { Metadata } from "next"

import { WaitView } from "./wait-view"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const metadata: Metadata = {
    title: "Generating your engineering report · The Forge",
    description:
        "The engine is reading your brief, decomposing the product, sizing modules, costing the bill of materials, and writing the report. This typically takes 40 to 60 minutes.",
}

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function WaitPage({
    params,
}: PageProps): Promise<React.ReactElement> {
    const { id } = await params
    return <WaitView jobId={id} />
}
