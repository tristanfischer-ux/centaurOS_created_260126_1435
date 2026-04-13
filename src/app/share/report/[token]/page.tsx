/**
 * @file Public shared report page.
 *
 * @description Renders a report snapshot for unauthenticated viewers who have
 * a share link token. No sidebar, no nav — just the report in a clean layout.
 *
 * FLOW: Recipient opens /share/report/{token}
 * -> This server component calls getSharedReport(token)
 * -> Admin client bypasses RLS and returns the report data
 * -> ReportDocument renders the full report
 *
 * @related
 * - src/actions/report-share.ts — getSharedReport server action
 * - src/components/reports/ReportDocument.tsx — Report renderer
 */

import { Metadata } from 'next'
import { format } from 'date-fns'

import { getSharedReport } from '@/actions/report-share'
import { ReportDocument } from '@/components/reports/ReportDocument'

import type { ReportDocument as ReportDocumentType } from '@/lib/reports/report-document-types'

interface PageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const result = await getSharedReport(token)

  if (!result.success || !result.document) {
    return {
      title: 'Shared Report',
      description: 'This shared report is no longer available.',
    }
  }

  return {
    title: `${result.document.title} — ${result.companyName}`,
    description: `Shared report from ${result.companyName}: ${result.document.title}`,
  }
}

export default async function SharedReportPage({ params }: PageProps) {
  const { token } = await params
  const result = await getSharedReport(token)

  if (!result.success || !result.document) {
    return <ExpiredOrNotFound message={result.error} />
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <SharedReportHeader companyName={result.companyName ?? 'Unknown'} />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-background rounded-xl border shadow-sm p-6 sm:p-10">
          <ReportDocument document={result.document} />
        </div>
      </main>

      <SharedReportFooter expiresAt={result.expiresAt} />
    </div>
  )
}

function SharedReportHeader({ companyName }: { companyName: string }) {
  return (
    <header className="border-b bg-background">
      <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-international-orange flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-white"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Shared report from <span className="font-semibold">{companyName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Powered by ForgeOS
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}

function SharedReportFooter({ expiresAt }: { expiresAt?: string }) {
  const expiryText = expiresAt
    ? `Expires ${format(new Date(expiresAt), 'd MMMM yyyy')}`
    : 'No expiry set'

  return (
    <footer className="border-t bg-background mt-8">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8 text-center">
        <p className="text-xs text-muted-foreground">
          This report was shared via{' '}
          <a
            href="https://fractionalforge.app"
            className="text-international-orange hover:underline font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            ForgeOS
          </a>
          {' · '}
          {expiryText}
        </p>
      </div>
    </footer>
  )
}

function ExpiredOrNotFound({ message }: { message?: string }) {
  const isExpired = message?.toLowerCase().includes('expired')

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8 text-muted-foreground"
          >
            {isExpired ? (
              <>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </>
            ) : (
              <>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </>
            )}
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {isExpired ? 'This shared report has expired' : 'Report not found'}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isExpired
              ? 'The link you followed is no longer active. Ask the sender to generate a new share link.'
              : 'This link may be invalid or the report may have been removed.'}
          </p>
        </div>

        <div className="pt-4">
          <a
            href="https://fractionalforge.app"
            className="inline-flex items-center gap-2 text-sm font-medium text-international-orange hover:underline"
          >
            Learn more about ForgeOS
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
