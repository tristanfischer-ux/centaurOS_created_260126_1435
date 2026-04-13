/**
 * @file page.tsx — Finance section intro page
 *
 * @description Visual overview of the Finance section with hero, value props,
 * and feature cards. Follows the pattern from plan/page.tsx.
 */

import type { Metadata } from 'next'
import { FinanceSectionIntro } from './finance-section-intro'

export const metadata: Metadata = {
  title: 'Finance',
  description: 'Your complete financial command centre — revenue, expenses, cash flow, and more',
}

export default function FinanceIntroPage(): React.ReactNode {
  return <FinanceSectionIntro />
}
