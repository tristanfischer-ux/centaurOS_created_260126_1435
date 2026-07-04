import type { Metadata } from "next"
import { BriefIntake } from "./brief-intake"

export const metadata: Metadata = {
  title: "Get your Design Dossier — Fractional Forge",
  description:
    "Describe your hardware idea in a short brief and get an auditable Design Dossier from Anvil — an Excel workbook with the architecture, a costed bill of materials, a financial model, the engineering drawings, the licences and risks, and a built-in self-audit, reviewed by a senior engineer. Your first one is free.",
}

export default function BriefPage() {
  return <BriefIntake />
}
