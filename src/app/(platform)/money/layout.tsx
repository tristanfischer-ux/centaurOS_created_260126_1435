/**
 * Money V2 layout — front-door for all /money/* routes.
 *
 * 2026-06-23 monetisation collapse: the V2 investor cockpit (/money/raise) is
 * now the primary front door, so the `new_money_experience` flag gate has been
 * removed and /money/** is reachable by default for every user. Legacy
 * /investors and /cash-burn routes remain mounted in parallel and continue to
 * serve; they just aren't the primary nav any more.
 *
 * The FLAG_NEW_MONEY_EXPERIENCE flag itself is left intact in the registry for
 * other surfaces (nav highlighting, "New" badge) — only the hard 404 gate on
 * this layout is dropped.
 */

// Data is strictly per-user / per-foundry.
export const dynamic = 'force-dynamic'

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
