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
  title: "Red Team",
  description: "Stress-test any decision with multi-perspective debate",
}

export default function RedTeamPage(): React.ReactNode {
  return <RedTeamView />
}
