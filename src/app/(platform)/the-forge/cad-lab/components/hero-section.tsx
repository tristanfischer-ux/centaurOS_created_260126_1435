"use client"

/**
 * @file hero-section.tsx — Pre-research hero content for The Forge pipeline.
 *
 * @description Displays hero banner image, credibility stats, capability cards,
 * and quick-start templates. Only shown before research has been initiated.
 */

import Image from "next/image"
import {
  Search,
  Box,
  Download,
  Printer,
  Ruler,
} from "lucide-react"

// ─── Quick-start templates ───────────────────────────────────────────

const QUICK_START_TEMPLATES = [
  { id: "cubesat", label: "CubeSat Bus", subject: "1U CubeSat structural bus frame (100×100×100mm) with PC-104 avionics stack mounting, solar panel rail interfaces, and deployment switch cutout per CDS rev 14", image: "/cad-lab/templates/cubesat.png", complexity: "Aerospace" },
  { id: "rocket", label: "Rocket Thrust Mount", subject: "Bipropellant rocket engine thrust structure with gimbal bearing attachment points, regenerative cooling channel interfaces, and propellant feed-through ports for 5kN class engine", image: "/cad-lab/templates/rocket-mount.png", complexity: "Aerospace" },
  { id: "ev-battery", label: "EV Battery Module", subject: "Prismatic cell battery module enclosure with liquid cooling channels, BMS mounting plate, thermal runaway vent ports, and HV busbar connectors for 400V architecture", image: "/cad-lab/templates/ev-battery.png", complexity: "Automotive" },
  { id: "robotic-arm", label: "Robotic Arm Joint", subject: "6-DOF robotic arm wrist joint with harmonic drive gear housing, precision encoder mount, cable passthrough channels, and force-torque sensor interface", image: "/cad-lab/templates/robotic-arm.png", complexity: "Robotics" },
  { id: "reaction-wheel", label: "Reaction Wheel", subject: "Satellite reaction wheel assembly with precision flywheel housing, BLDC motor mount, optical encoder interface, and vibration-isolated mounting flange", image: "/cad-lab/templates/reaction-wheel.png", complexity: "Aerospace" },
  { id: "heavy-drone", label: "Heavy-Lift Drone", subject: "Octocopter heavy-lift drone frame with coaxial motor mounts, central payload bay with 3-axis gimbal interface, retractable landing gear, and folding arm hinges in carbon fiber", image: "/cad-lab/templates/heavy-drone.png", complexity: "UAV" },
] as const

const CAPABILITY_CARDS = [
  { icon: Search, title: "Spec Research", desc: "Real-world specs from datasheets, reference designs, and engineering databases" },
  { icon: Box, title: "256 Components", desc: "Parametric library spanning CubeSats, EVs, drones, robotics, and more" },
  { icon: Printer, title: "DFM Analysis", desc: "Printability, support volume, material usage, and compatible printers" },
  { icon: Ruler, title: "Mass Properties", desc: "Bounding box, mass, volume, surface area, and center-of-gravity coordinates" },
  { icon: Download, title: "STEP + STL", desc: "Industry-standard exports compatible with SolidWorks, Fusion 360, and any slicer" },
] as const

// ─── Component ───────────────────────────────────────────────────────

interface HeroSectionProps {
  /** Callback to set the subject input when a template is selected */
  onSelectTemplate: (subject: string) => void
}

/**
 * HeroSection — Pre-research landing content with hero image,
 * credibility stats, capability showcase, and quick-start templates.
 */
export function HeroSection({ onSelectTemplate }: HeroSectionProps): React.ReactNode {
  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="relative rounded-xl overflow-hidden border border-muted">
        <Image
          src="/cad-lab/hero.png"
          alt="From idea to manufacturing-ready CAD"
          width={1200}
          height={400}
          className="w-full h-auto object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent flex items-center">
          <div className="p-8 max-w-lg">
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              Parametric CAD from a single sentence
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Describe any physical product. The system researches real-world specifications, generates
              parametric CadQuery models with 7 orthographic projections, runs DFM analysis, and
              delivers STEP + STL exports with center-of-gravity data.
            </p>
          </div>
        </div>
      </div>

      {/* Credibility stats bar */}
      <div className="flex items-center justify-center gap-6 py-3 px-4 rounded-lg bg-muted/50 border border-muted text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">256</span> Parametric Components
        <span className="text-muted">|</span>
        <span className="font-mono font-semibold text-foreground">15</span> Industry Sectors
        <span className="text-muted">|</span>
        <span className="font-mono font-semibold text-foreground">7</span> Projection Views
        <span className="text-muted">|</span>
        <span className="font-mono font-semibold text-foreground">STEP + STL</span> Export
      </div>

      {/* Capability cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CAPABILITY_CARDS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-muted bg-card text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange-light">
              <Icon className="h-5 w-5 text-international-orange" />
            </div>
            <h3 className="text-xs font-semibold text-foreground">{title}</h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Quick-start templates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Quick Start — select an engineering template or describe your own product</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_START_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTemplate(t.subject)}
              className="group flex flex-col items-center gap-2 p-3 rounded-lg border border-muted bg-card hover:border-international-orange/50 hover:bg-international-orange-light/10 transition-all text-center cursor-pointer"
            >
              <Image
                src={t.image}
                alt={t.label}
                width={80}
                height={80}
                className="rounded-md group-hover:scale-105 transition-transform"
              />
              <span className="text-xs font-medium text-foreground">{t.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                {t.complexity}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
