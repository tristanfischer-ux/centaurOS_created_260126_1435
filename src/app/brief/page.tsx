import type { Metadata } from "next"
import { BriefIntake } from "./brief-intake"

export const metadata: Metadata = {
  title: "Get your Design Dossier — Fractional Forge",
  description:
    "Describe your hardware idea in a short brief and get a buildable Design Dossier from Anvil in a few days — a live Excel workbook with a costed bill of materials, true cost and financial model, engineering drawings, worked calculations, and a risk and regulatory register. Every number is a traceable formula. Your own engineers should check it.",
}

export default function BriefPage() {
  return <BriefIntake />
}
