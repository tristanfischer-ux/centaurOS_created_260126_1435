/**
 * @file money/raise/pitch/edit/[slideId]/page.tsx — /money/raise/pitch/edit/:slideId
 *
 * @description Money V2 · Raise · Pitch prep · Slide editor. Mockup-faithful
 * port of MONEY-MOCKUP-SLIDE-EDITOR.html. Three-column editor:
 *   LEFT  — Layout picker · Title + subtitle · Body bullets
 *   MIDDLE — Slide canvas preview (renders as you edit)
 *   RIGHT — Data bindings (honest empty state) · Speaker notes · Slide meta
 *           · Inspiration (honest empty state)
 *
 * Routing contract:
 *   - `slideId === "new"` → open an empty editor and mint a new id on first
 *     save.
 *   - Any other id → load the matching slide from the `ptc2:pitch:slides`
 *     localStorage list. If none matches, we still render the editor with
 *     an empty starting draft (so the URL can be shared without crashing).
 *
 * Data contract:
 *   - Target tables `pitch_prep_section` + `pitch_prep_slide` are defined in
 *     MONEY-SCHEMA §2 but the migration has NOT landed yet. Slides persist
 *     to `localStorage` under `ptc2:pitch:slides` (same list the pitch view
 *     reads from). An honest banner calls this out.
 *   - Data-bindings sidecar shows what WILL wire when plan_line_items hooks
 *     up — we do not render fabricated chart numbers.
 *
 * Empty-state policy:
 *   - "new" slide boots with blank title / subtitle / body / notes. Placeholder
 *     text guides without fabricating specifics.
 *
 * Scope clause (parallel sub-agent safety):
 *   - Writes ONLY to files under /money/raise/pitch/edit/*.
 *   - Does NOT touch database.types.ts, migrations, sidebar, /cash-burn/*,
 *     or other /money/<x>/* routes.
 *
 * @related
 *   - View:   ./slide-editor-view.tsx
 *   - Styles: ./slide-editor-v2.css (scoped `.slde2`)
 *   - Mockup: MONEY-MOCKUP-SLIDE-EDITOR.html
 *   - Schema: MONEY-SCHEMA.md §pitch_prep_slide
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { SlideEditorView } from "./slide-editor-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Slide editor · Pitch prep · Money",
    description:
        "Edit one pitch slide at a time — layout, copy, bullets, notes. Numbers stay wired to your plan.",
}

export default async function MoneyRaisePitchSlideEditorPage({
    params,
}: {
    params: Promise<{ slideId: string }>
}): Promise<React.ReactNode> {
    // AUTH: behind login — platform layout already gates this, belt-and-braces.
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { slideId } = await params

    return <SlideEditorView slideId={slideId} />
}
