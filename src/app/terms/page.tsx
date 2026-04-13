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
  title: 'Terms of Service',
  description: 'Terms of Service for the ForgeOS platform by Fractional Forge.',
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
          Last updated: March 2026
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

          <section id="ip" className="space-y-3 scroll-mt-24">
            <h2 className="text-xl font-semibold text-foreground">4. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All intellectual property you create through the platform — including designs,
              prototypes, specifications, and finished products — remains your sole property.
              Fractional Forge does not claim any ownership, assignment, or equity stake in
              your work. This is a contractual guarantee, not a courtesy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You grant Fractional Forge a limited, revocable licence to display your designs
              and project data solely to authorised members of your team within the platform.
              This licence terminates automatically when you remove a team member or close
              your account.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Factory partners engaged through the platform receive access only to the
              manufacturing specifications required to quote and produce your parts. They do
              not receive access to your full design files, business strategy, or other
              project data.
            </p>
          </section>

          <section id="confidentiality" className="space-y-3 scroll-mt-24">
            <h2 className="text-xl font-semibold text-foreground">4A. Confidentiality</h2>
            <p className="text-muted-foreground leading-relaxed">
              All parties using the platform — including you, your team members, and factory
              partners — are bound by confidentiality obligations. Your design files are
              treated as confidential information by default.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Factory partners receive only the manufacturing-relevant specifications needed
              to quote and produce your parts. They do not gain access to your broader design
              intent, business plans, or other project data.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Technical measures supporting confidentiality include: role-based access controls,
              encryption at rest and in transit, per-foundry data isolation, and audit logging
              of access events.
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

          <section id="risk" className="space-y-4 scroll-mt-24">
            <h2 className="text-xl font-semibold text-foreground">6. Liability &amp; Risk Allocation</h2>

            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">6.1 Platform Role</h3>
              <p className="text-muted-foreground leading-relaxed">
                Fractional Forge operates as a facilitator — connecting you with expert teams and
                manufacturing capacity. We are not a manufacturer, and do not take physical
                custody of your products.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">6.2 Manufacturing Responsibility</h3>
              <p className="text-muted-foreground leading-relaxed">
                Factory partners engaged through the platform are responsible for manufacturing
                defects, specification conformance, and quality control of the parts they produce.
                Written terms govern every manufacturing engagement.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">6.3 Design Responsibility</h3>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for the fitness and suitability of your designs. Platform tools
                (including AI-assisted analysis) are provided to support — but not replace — your
                engineering judgement. Final design sign-off remains yours.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">6.4 Liability Cap</h3>
              <p className="text-muted-foreground leading-relaxed">
                Fractional Forge provides the platform on an &quot;as is&quot; basis. We are not liable for
                any indirect, incidental, or consequential damages. Our total aggregate liability
                shall not exceed the greater of (a) the fees you have paid in the preceding twelve
                months, or (b) GBP 100.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-medium text-foreground">6.5 Statutory Exclusions</h3>
              <p className="text-muted-foreground leading-relaxed">
                Nothing in these terms excludes or limits liability for death or personal injury
                caused by negligence, fraud or fraudulent misrepresentation, or any other liability
                that cannot be excluded or limited under applicable law.
              </p>
            </div>
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
              <a href="mailto:legal@fractionalforge.app" className="text-electric-blue hover:underline">
                legal@fractionalforge.app
              </a>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8A. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify and hold harmless Fractional Forge from any claims, losses,
              or damages arising from the designs you create or the products manufactured to
              your specifications.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Factory partners engaged through the platform agree to indemnify you against claims
              arising from manufacturing defects or failure to conform to agreed specifications.
              These obligations are set out in the manufacturing engagement terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8B. Dispute Resolution</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a dispute between you and a factory partner or team member, the
              parties shall first attempt to resolve the matter through the platform&apos;s dispute
              process. If unresolved within 30 days, the parties shall submit the dispute to
              mediation under the rules of the Centre for Effective Dispute Resolution (CEDR).
              If mediation fails, either party may commence proceedings in the courts of England
              and Wales.
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
