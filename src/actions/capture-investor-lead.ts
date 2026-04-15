"use server"

import { headers } from "next/headers"
import { Resend } from "resend"
import { rateLimit, getClientIP } from "@/lib/security/rate-limit"

export interface InvestorLeadData {
  email: string
  score: number
  tier: string
  answers: Record<string, string>
}

export async function captureInvestorLead(data: InvestorLeadData): Promise<{ success: boolean; error?: string }> {
  if (!data.email || !data.email.includes("@")) {
    return { success: false, error: "Invalid email address" }
  }

  // SECURITY: Rate limit investor lead captures by IP — 3 per hour
  const headersList = await headers()
  const ip = getClientIP(headersList)
  const { success: rateLimitOk } = await rateLimit("investorLead", ip, { limit: 3, window: 3600000 })
  if (!rateLimitOk) {
    return { success: false, error: "Rate limit exceeded. Please try again later." }
  }

  // SECURITY: Ensure email service is configured
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "Email service not configured" }
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const answerSummary = Object.entries(data.answers)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join("\n")

  try {
    // Notify Tristan
    await resend.emails.send({
      from: process.env.EMAIL_FROM_ADDRESS ?? "ForgeOS <noreply@fractionalforge.app>",
      to: "tristan.fischer@gmail.com",
      subject: `New Lead: Investor Readiness Score — ${data.score}/100 (${data.tier})`,
      text: `New investor readiness lead\n\nEmail: ${data.email}\nScore: ${data.score}/100\nTier: ${data.tier}\n\nAnswers:\n${answerSummary}`,
    })

    // Send results to the lead
    await resend.emails.send({
      from: process.env.EMAIL_FROM_ADDRESS ?? "ForgeOS <noreply@fractionalforge.app>",
      to: data.email,
      subject: `Your Investor Readiness Score: ${data.score}/100`,
      text: `Hi,\n\nYour investor readiness score is ${data.score}/100 — ${data.tier}.\n\n${answerSummary}\n\nForgeOS helps hardware founders get investor-ready faster. Sign up for a free trial at fractionalforge.app.\n\nTristan & the Fractional Forge team`,
    })

    return { success: true }
  } catch (err) {
    console.error("[captureInvestorLead]", err)
    return { success: false, error: "Failed to send email. Please try again." }
  }
}
