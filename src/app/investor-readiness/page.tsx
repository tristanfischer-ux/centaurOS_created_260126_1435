import { Metadata } from "next"
import { MarketingNav } from "@/components/marketing/marketing-nav"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import { InvestorReadinessQuiz } from "./investor-readiness-quiz"

export const metadata: Metadata = {
  title: "Hardware Investor Readiness Score — Fractional Forge",
  description:
    "Find out how investor-ready your hardware startup really is. 6 questions, 2 minutes. Benchmarked against 7,800 funded hardware companies.",
  openGraph: {
    title: "Hardware Investor Readiness Score",
    description:
      "6 questions. 2 minutes. Find out how investor-ready your hardware startup really is.",
    type: "website",
    url: "https://fractionalforge.app/investor-readiness",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hardware Investor Readiness Score",
    description: "6 questions. 2 minutes. Find out how investor-ready your hardware startup really is.",
  },
  alternates: {
    canonical: "https://fractionalforge.app/investor-readiness",
  },
}

export default function InvestorReadinessPage() {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-background">
        {/* Gradient accent */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-96"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--international-orange) / 0.06), transparent)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#ff4500]">
              Free tool
            </p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Are you investor-ready?
            </h1>
            <p className="text-lg text-muted-foreground">
              Most hardware founders pitch too early and wonder why investors pass. Find out where you
              stand — benchmarked against 7,800 funded hardware companies.
            </p>
          </div>

          {/* Quiz */}
          <InvestorReadinessQuiz />
        </div>
      </main>
      <MarketingFooter />
    </>
  )
}
