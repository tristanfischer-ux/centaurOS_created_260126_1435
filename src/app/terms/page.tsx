/**
 * @file Terms of Service Page
 *
 * @description Placeholder Terms of Service for Fractional Forge.
 * This needs real legal review before launch.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Fractional Forge',
  description: 'Terms of Service for the Fractional Forge platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-muted bg-background py-3 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
          <span className="text-muted-foreground/30">|</span>
          <Link href="/" className="text-lg font-display font-semibold text-foreground">
            ForgeOS
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: February 2026
        </p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using the Fractional Forge platform (&quot;ForgeOS&quot;), you agree to be
              bound by these Terms of Service. If you do not agree to these terms, please do not
              use the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fractional Forge provides a platform connecting hardware founders with fractional
              executives, engineers, and manufacturing resources. The platform includes project
              management tools, a marketplace for manufacturing services, and collaboration features.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activities that occur under your account. You must notify us immediately
              of any unauthorised use of your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All intellectual property created by you through the platform remains your property.
              Fractional Forge does not claim ownership of any designs, prototypes, or products
              you create. You retain full IP ownership at all times.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Platform Fees</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fractional Forge charges subscription fees and a platform fee on marketplace
              transactions as described on our pricing page. Fees are subject to change with
              reasonable notice. Founding member pricing is locked in for the duration of your
              membership.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              Fractional Forge provides the platform on an &quot;as is&quot; basis. We are not liable for
              any indirect, incidental, or consequential damages arising from your use of the
              platform. Our total liability shall not exceed the fees you have paid in the
              preceding twelve months.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms are governed by the laws of England and Wales. Any disputes shall be
              resolved in the courts of England and Wales.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these terms, please contact us at{' '}
              <a href="mailto:legal@fractionalforge.com" className="text-electric-blue hover:underline">
                legal@fractionalforge.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-muted flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Fractional Forge Ltd. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-foreground font-medium">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
