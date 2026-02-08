import { FinancialToolsClient } from './financial-tools-client'

/**
 * Financial Tools page -- combines Cost of Delay calculator and
 * Money Map visualiser into a single tabbed view.
 *
 * @description Reduces sidebar clutter by merging two financial tools
 * into one page. Each tool lives in its own tab and maintains
 * independent state.
 */
export default function FinancialToolsPage(): React.ReactElement {
  return <FinancialToolsClient />
}
