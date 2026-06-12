/**
 * @file brief-demo/page.tsx — /brief-demo  (PUBLIC, no auth)
 *
 * Standalone demo of the interactive Brief editor for client demos. Renders the
 * real BriefEditor in demoMode (edits/Save/Lock are local-only — no Supabase, no
 * login) seeded with the CO2 capture & mineralisation brief. Added to PUBLIC_ROUTES
 * in src/lib/supabase/middleware.ts so it bypasses the auth gate. Temporary.
 */

import { BriefEditor } from "@/app/(platform)/the-forge-v2/projects/[id]/brief/_components/brief-editor"

export const dynamic = "force-dynamic"

const CO2_BRIEF = `We are designing a modular carbon-capture and mineral-carbonation chemical process plant that captures one tonne of CO2 per day from a point-source flue gas using a 30 wt% aqueous monoethanolamine (MEA) solvent, then mineralises the captured CO2 by reacting it with gypsum (calcium sulfate dihydrate) to precipitate calcium carbonate. The co-product sulfate is recovered as potassium sulfate fertiliser by reaction with potassium hydroxide, and the MEA solvent is regenerated and recycled. The plant is a skid-mounted, continuously-operated chemical plant producing two saleable solids — precipitated calcium carbonate and potassium sulfate — packaged in 25 kg bags.

Target market: industrial CO2 emitters (cement, lime, anaerobic-digestion biogas, energy-from-waste) seeking on-site carbon capture with a revenue-generating mineralisation route, plus agricultural and industrial-mineral off-takers for the potassium sulfate and precipitated calcium carbonate products. UK and EU deployment.`

export default function BriefDemoPage(): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brief — CO₂ Capture &amp; Mineralisation Plant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the narrative, then <strong>Save</strong> and <strong>Lock</strong> the brief. Demo mode — no login; changes stay in this session.
        </p>
      </div>
      <BriefEditor
        projectId="demo-co2"
        projectHref="#"
        initialOverview={CO2_BRIEF}
        designBrief={null}
        initialLockedAt={null}
        demoMode
      />
    </div>
  )
}
