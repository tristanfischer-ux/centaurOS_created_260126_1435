/**
 * @file Privacy Policy Page
 *
 * @description Placeholder Privacy Policy for Fractional Forge.
 * This needs real legal review before launch.
 */

import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/marketing-nav'
import { MarketingFooter } from '@/components/marketing/marketing-footer'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Fractional Forge.',
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav />

      <main className="flex-1">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: March 2026
        </p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect information you provide directly, such as your name, email address,
              company details, and payment information when you create an account or use our
              services. We also collect usage data to improve the platform experience.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use your information to provide and improve our services, process transactions,
              communicate with you about your account, and match you with relevant fractional
              team members and manufacturing partners.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal data. We may share information with service providers
              who help us operate the platform (e.g., payment processors, hosting providers).
              Project-related information is shared with team members you collaborate with on
              the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your data, including
              encryption in transit and at rest, access controls, and regular security audits.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4A. Design Data Protection</h2>
            <p className="text-muted-foreground leading-relaxed">
              Design files you upload or create on the platform receive additional protection
              beyond standard personal data. Specifically:
            </p>
            <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1.5 ml-1">
              <li>Design data is encrypted at rest and in transit</li>
              <li>Access is role-based: only authorised team members and factory partners can view relevant files</li>
              <li>Data is stored in isolated per-foundry containers</li>
              <li>Design data is never used to train AI models or shared with third parties</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4B. Data Access Tiers</h2>
            <p className="text-muted-foreground leading-relaxed">
              We enforce tiered access to your project data:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted-foreground border-collapse">
                <thead>
                  <tr className="border-b border-muted">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Tier</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Who</th>
                    <th className="text-left py-2 font-semibold text-foreground">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  <tr>
                    <td className="py-2 pr-4">1</td>
                    <td className="py-2 pr-4">You</td>
                    <td className="py-2">Full access to all project data</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">2</td>
                    <td className="py-2 pr-4">Your team</td>
                    <td className="py-2">Shared project data per your settings</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">3</td>
                    <td className="py-2 pr-4">Factory partners</td>
                    <td className="py-2">Manufacturing specifications only</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">4</td>
                    <td className="py-2 pr-4">Platform ops</td>
                    <td className="py-2">Aggregated, anonymised analytics only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under applicable data protection laws (including GDPR), you have the right to
              access, correct, delete, or export your personal data. You may also object to
              processing or request restriction of processing. To exercise these rights, contact
              us at the address below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies to operate the platform and analytics cookies to understand
              how the platform is used. You can manage cookie preferences through your browser
              settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide
              services. You may request deletion of your account and associated data at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For privacy-related enquiries, please contact our Data Protection Officer at{' '}
              <a href="mailto:privacy@fractionalforge.app" className="text-electric-blue hover:underline">
                privacy@fractionalforge.app
              </a>
            </p>
          </section>
        </div>

      </div>
      </main>

      <MarketingFooter />
    </div>
  )
}
