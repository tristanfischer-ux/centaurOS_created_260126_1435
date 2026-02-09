import { redirect } from 'next/navigation'

/**
 * Redirect page for legacy /tools/financial route.
 * Financial tools are now integrated into the Strategy page.
 *
 * @description Money Map and Cost of Delay are now tabs within
 * the Strategy page (/canvas) for better workflow integration.
 */
export default function FinancialToolsRedirect() {
  redirect('/canvas?tab=money-map')
}
