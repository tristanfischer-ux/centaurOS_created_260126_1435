"use client"

import { useState, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Mail, TrendingUp, AlertTriangle, Zap, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { captureInvestorLead } from "@/actions/capture-investor-lead"

// ─── Quiz Data ───────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: "stage",
    question: "Where are you in your hardware journey?",
    options: [
      { label: "Idea / concept stage", score: 0 },
      { label: "Working prototype", score: 10 },
      { label: "MVP with early users", score: 20 },
      { label: "Generating revenue", score: 30 },
    ],
  },
  {
    id: "team",
    question: "Does your team have hardware engineering depth?",
    options: [
      { label: "No technical co-founder yet", score: 0 },
      { label: "Actively hiring a CTO/engineer", score: 5 },
      { label: "Technical co-founder on board", score: 10 },
      { label: "Serial hardware team (built before)", score: 15 },
    ],
  },
  {
    id: "ip",
    question: "What's your IP and moat situation?",
    options: [
      { label: "Nothing filed or protected", score: 0 },
      { label: "Trade secrets / head start only", score: 5 },
      { label: "Patent(s) filed (provisional/full)", score: 12 },
      { label: "Granted patents or design wins", score: 20 },
    ],
  },
  {
    id: "manufacturing",
    question: "How far along is your manufacturing strategy?",
    options: [
      { label: "Haven't looked into it yet", score: 0 },
      { label: "Done some online research", score: 5 },
      { label: "Visited / spoken to manufacturers", score: 10 },
      { label: "NDA, LOI, or purchase order in place", score: 20 },
    ],
  },
  {
    id: "target",
    question: "What's your fundraising target?",
    options: [
      { label: "Not sure yet", score: 0 },
      { label: "Under £500k", score: 5 },
      { label: "£500k – £2M", score: 10 },
      { label: "£2M – £5M", score: 15 },
      { label: "£5M+", score: 10 },
    ],
  },
  {
    id: "traction",
    question: "What's your strongest proof point right now?",
    options: [
      { label: "Market research / TAM analysis", score: 0 },
      { label: "Letters of intent from potential customers", score: 8 },
      { label: "Paying pilot customers", score: 15 },
      { label: "Growing MRR / repeat orders", score: 20 },
    ],
  },
]

// ─── Scoring ─────────────────────────────────────────────────────────────────

const MAX_RAW_SCORE = QUESTIONS.reduce((sum, q) => {
  return sum + Math.max(...q.options.map((o) => o.score))
}, 0)

function getTier(score: number): { label: string; color: string; icon: React.ReactNode; description: string } {
  if (score >= 75) return {
    label: "Investor Ready",
    color: "text-emerald-600",
    icon: <Zap className="size-5" />,
    description: "Your fundamentals are strong. Focus on tightening your deck and identifying the right investors for your stage.",
  }
  if (score >= 55) return {
    label: "Getting There",
    color: "text-blue-600",
    icon: <TrendingUp className="size-5" />,
    description: "You have solid foundations but a few gaps to address before institutional investors will move fast.",
  }
  if (score >= 35) return {
    label: "Early Stage",
    color: "text-amber-600",
    icon: <Target className="size-5" />,
    description: "You're building in the right direction. Focus on de-risking manufacturing and landing your first paying customer.",
  }
  return {
    label: "Not Yet",
    color: "text-red-500",
    icon: <AlertTriangle className="size-5" />,
    description: "Most investors will pass at this stage. That's normal. Focus on proof of concept before approaching VCs.",
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InvestorReadinessQuiz() {
  const [step, setStep] = useState(0) // 0 = start, 1–6 = questions, 7 = email gate, 8 = results
  const [selected, setSelected] = useState<Record<string, { label: string; score: number }>>({})
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)

  const currentQuestion = QUESTIONS[step - 1]
  const totalSteps = QUESTIONS.length

  function handleSelect(option: { label: string; score: number }) {
    setSelected((prev) => ({ ...prev, [currentQuestion.id]: option }))
  }

  function handleNext() {
    if (step === 0) { setStep(1); return }
    if (step <= totalSteps) {
      if (!selected[currentQuestion.id]) return
      setStep((s) => s + 1)
    }
  }

  function handleSubmitEmail() {
    if (!email.includes("@")) {
      setEmailError("Please enter a valid email address")
      return
    }
    setEmailError("")

    const rawScore = Object.values(selected).reduce((sum, o) => sum + o.score, 0)
    const score = Math.round((rawScore / MAX_RAW_SCORE) * 100)
    const tier = getTier(score).label
    const answers: Record<string, string> = {}
    QUESTIONS.forEach((q) => { answers[q.question] = selected[q.id]?.label ?? "" })

    startTransition(async () => {
      await captureInvestorLead({ email, score, tier, answers })
      setSubmitted(true)
      setStep(8)
    })
  }

  const rawScore = Object.values(selected).reduce((sum, o) => sum + o.score, 0)
  const finalScore = Math.round((rawScore / MAX_RAW_SCORE) * 100)
  const tier = getTier(finalScore)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <AnimatePresence mode="wait">

        {/* ── Start screen ── */}
        {step === 0 && (
          <motion.div key="start" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="text-center">
            <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-orange-50">
              <TrendingUp className="size-8 text-[#ff4500]" />
            </div>
            <h2 className="mb-3 text-2xl font-bold text-foreground">6 questions. 2 minutes.</h2>
            <p className="mb-8 text-muted-foreground">Find out how investor-ready your hardware startup really is — benchmarked against 7,800 funded hardware companies.</p>
            <Button size="lg" onClick={handleNext} className="gap-2 bg-[#ff4500] text-white hover:bg-[#e03d00]">
              Start the assessment <ArrowRight className="size-4" />
            </Button>
          </motion.div>
        )}

        {/* ── Questions ── */}
        {step >= 1 && step <= totalSteps && (
          <motion.div key={`q-${step}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            {/* Progress */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>Question {step} of {totalSteps}</span>
                <span>{Math.round((step / totalSteps) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#ff4500] transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
              </div>
            </div>

            <h2 className="mb-6 text-xl font-semibold text-foreground">{currentQuestion.question}</h2>

            <div className="space-y-3">
              {currentQuestion.options.map((option) => {
                const isSelected = selected[currentQuestion.id]?.label === option.label
                return (
                  <button
                    key={option.label}
                    onClick={() => handleSelect(option)}
                    className={`w-full rounded-xl border-2 px-5 py-4 text-left text-sm font-medium transition-all duration-150 ${
                      isSelected
                        ? "border-[#ff4500] bg-orange-50 text-[#ff4500]"
                        : "border-border bg-background text-foreground hover:border-[#ff4500]/40 hover:bg-orange-50/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{option.label}</span>
                      {isSelected && <CheckCircle2 className="size-4 shrink-0 text-[#ff4500]" />}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleNext}
                disabled={!selected[currentQuestion.id]}
                className="gap-2 bg-[#ff4500] text-white hover:bg-[#e03d00] disabled:opacity-40"
              >
                {step === totalSteps ? "See my score" : "Next"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Email gate ── */}
        {step === totalSteps + 1 && (
          <motion.div key="email" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="text-center">
            <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-blue-50">
              <Mail className="size-8 text-blue-600" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Your score is ready</h2>
            <p className="mb-8 text-muted-foreground">Enter your email to see your results and get a breakdown of what to fix first.</p>
            <div className="mx-auto max-w-sm space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitEmail()}
                placeholder="you@startup.com"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#ff4500] focus:outline-none focus:ring-2 focus:ring-[#ff4500]/20"
              />
              {emailError && <p className="text-sm text-red-500">{emailError}</p>}
              <Button
                onClick={handleSubmitEmail}
                disabled={isPending}
                className="w-full gap-2 bg-[#ff4500] text-white hover:bg-[#e03d00]"
              >
                {isPending ? "Loading..." : "Show my score"} <ArrowRight className="size-4" />
              </Button>
              <p className="text-xs text-muted-foreground">No spam. We&apos;ll send your results once and only follow up if you ask.</p>
            </div>
          </motion.div>
        )}

        {/* ── Results ── */}
        {step === totalSteps + 2 && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
            {/* Score circle */}
            <div className="mb-8 text-center">
              <div className="relative mx-auto mb-4 flex size-32 items-center justify-center rounded-full border-4 border-[#ff4500]/20 bg-orange-50">
                <span className="text-4xl font-bold text-[#ff4500]">{finalScore}</span>
                <span className="absolute bottom-8 text-sm text-muted-foreground">/100</span>
              </div>
              <div className={`mb-2 flex items-center justify-center gap-2 text-lg font-semibold ${tier.color}`}>
                {tier.icon}
                {tier.label}
              </div>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">{tier.description}</p>
            </div>

            {/* Breakdown */}
            <div className="mb-8 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <p className="text-sm font-semibold text-foreground">Your answers</p>
              </div>
              <div className="divide-y divide-border">
                {QUESTIONS.map((q) => {
                  const answer = selected[q.id]
                  if (!answer) return null
                  const maxScore = Math.max(...q.options.map((o) => o.score))
                  const pct = maxScore > 0 ? Math.round((answer.score / maxScore) * 100) : 0
                  return (
                    <div key={q.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex-1 pr-4">
                        <p className="text-xs text-muted-foreground">{q.question}</p>
                        <p className="text-sm font-medium text-foreground">{answer.label}</p>
                      </div>
                      <Badge variant={pct >= 75 ? "default" : pct >= 40 ? "secondary" : "outline"} className="shrink-0 text-xs">
                        {answer.score}/{maxScore}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-background p-6 text-center">
              <p className="mb-1 font-semibold text-foreground">ForgeOS helps you close these gaps fast</p>
              <p className="mb-4 text-sm text-muted-foreground">CAD Lab, AI specialists, and 18,000+ UK manufacturers — everything you need to get investor-ready.</p>
              <Button asChild size="lg" className="gap-2 bg-[#ff4500] text-white hover:bg-[#e03d00]">
                <Link href="/signup">Start free trial <ArrowRight className="size-4" /></Link>
              </Button>
              {submitted && (
                <p className="mt-3 text-xs text-muted-foreground">Results sent to {email}</p>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
