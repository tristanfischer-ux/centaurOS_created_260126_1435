import type { Metadata } from "next"
import { BriefIntake } from "./brief-intake"

export const metadata: Metadata = {
  title: "Get your Design Dossier — Fractional Forge",
  description:
    "Describe your hardware idea in a short brief and get an 80+ page Design Dossier from Anvil — architecture, costs, licences, risks, and investors who've backed similar products. Your first one is free.",
}

export default function BriefPage() {
  return <BriefIntake />
}
