/**
 * @file money/raise/rounds/new/page.tsx — /money/raise/rounds/new
 *
 * @description "Create round" — mockup-faithful port of
 * MONEY-MOCKUP-CREATE-ROUND.html. A funding-round definition form: name /
 * stage / target amount / currency / close date / instrument / cap / discount
 * / cheque bounds / lead structure / close style / syndicate narrative. Per
 * MONEY-SCHEMA §2 the target table is `investor_round`. That migration has not
 * landed yet, so submit shows an honest "Saved locally · persistence wires up
 * when the investor_round migration lands" state rather than pretending to
 * persist.
 *
 * Empty-state policy: the form IS the page — no data load needed. Server
 * component boundary kept thin so the view can own all local state.
 *
 * @related
 *   - View:   ./rounds-new-view.tsx
 *   - Styles: ./rounds-new-v2.css (scoped .rnd2)
 *   - Mockup: MONEY-MOCKUP-CREATE-ROUND.html
 *   - Schema: MONEY-SCHEMA.md §investor_round
 */

import type { Metadata } from "next"

import { RoundsNewView } from "./rounds-new-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Create round · Money",
}

export default function MoneyCreateRoundPage(): React.ReactNode {
    return <RoundsNewView />
}
