/**
 * @file page.tsx — Financial Reports page
 *
 * @description Report selection and viewing page. Users pick a report type
 * and date range, then view the generated report with export options.
 */

import type { Metadata } from 'next'
import { ReportsView } from './reports-view'

export const metadata: Metadata = {
  title: 'Reports | Finance',
  description: 'Generate P&L, VAT, and Cash Flow Statement reports',
}

export default function ReportsPage(): React.ReactNode {
  return <ReportsView />
}
