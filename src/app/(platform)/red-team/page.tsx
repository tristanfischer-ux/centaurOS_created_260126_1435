/**
 * @file page.tsx — Red Team Debate page
 *
 * @description Multi-LLM adversarial debate that stress-tests strategic
 * decisions. Five different AI models play distinct personas (Bull, Bear,
 * Realist, Disruptor, Wildcard), producing a structured analysis document
 * with fact-checking, tensions table, verdict, and suggested actions.
 */

import type { Metadata } from "next"
import { RedTeamView } from "./red-team-view"

export const metadata: Metadata = {
  title: "Red Team | ForgeOS",
  description: "Stress-test decisions with multi-LLM adversarial debate",
}

export default function RedTeamPage(): React.ReactNode {
  return <RedTeamView />
}
