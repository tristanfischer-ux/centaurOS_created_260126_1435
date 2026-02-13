"use client"

/**
 * @file cad-lab-progress.tsx — Engineering-grade progress experience.
 *
 * @description Three-tier educational system during AI operations:
 *   Tier 1: Operation-specific explainer (what the AI is doing right now)
 *   Tier 2: Subject-matched engineering facts (keyword-matched, no AI call)
 *   Tier 3: Contextual micro-step annotations alongside progress lines
 *
 * Facts are chosen by scanning the subject input for domain keywords
 * (rocket, satellite, drone, EV, robot) so users learn about their
 * specific technology while waiting.
 *
 * @component
 */

import { useState, useEffect, useMemo } from "react"
import { CheckCircle2, Loader2, Clock, GraduationCap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

// ─────────────────────────────────────────────────────────────────────
// Tier 1: What the AI is doing RIGHT NOW
// ─────────────────────────────────────────────────────────────────────
const OPERATION_EXPLAINERS: Record<string, string[]> = {
  research: [
    "Scanning engineering databases for real-world specifications. Every dimension comes from datasheets, not estimation.",
    "Cross-referencing technical documentation, manufacturer specs, and published reference designs.",
    "Identifying material candidates, manufacturing constraints, and dimensional tolerances from industry data.",
  ],
  breakdown: [
    "Running systems engineering analysis — identifying physical interfaces, thermal boundaries, and manufacturing splits.",
    "Mapping sub-assembly dependencies, lead times, and critical-path components for parallel manufacturing.",
    "Classifying each module by manufacturing process: CNC, injection molding, sheet metal, 3D printing, or COTS.",
  ],
  generate: [
    "Writing parametric CadQuery code. Unlike static STEP files, parametric models rebuild automatically when any dimension changes.",
    "Generating 3D geometry with proper filleting, chamfering, and assembly features for manufacturing readiness.",
    "Executing on cloud infrastructure — producing 7 orthographic projections, DFM analysis, and mass properties with center-of-gravity data.",
  ],
  batch: [
    "Running full pipeline across all modules — each gets parametric code, 3D geometry, 7 views, and DFM analysis.",
    "Parallelising CadQuery execution on Modal cloud. Each module produces STEP + STL exports and manufacturing assessment.",
    "Aggregating system-level metrics: total mass, maximum envelope, manufacturing readiness grade, and cost estimates.",
  ],
}

// ─────────────────────────────────────────────────────────────────────
// Tier 2: Subject-matched deep engineering facts
// ─────────────────────────────────────────────────────────────────────
const SUBJECT_FACT_POOLS: Record<string, string[]> = {
  rocket: [
    "Rocket nozzles operate above 3,000°C. Regenerative cooling channels in the nozzle wall carry cryogenic propellant to prevent material failure.",
    "Inconel 718 maintains 80% of its room-temperature strength at 700°C, making it the standard alloy for thrust chamber structures.",
    "Modern 3D-printed rocket engines (Relativity, Rocket Lab) achieve comparable thrust-to-weight at 1/10th the part count of traditionally manufactured engines.",
    "Chamber pressure directly determines nozzle exit geometry. A 20 bar chamber needs a 15:1 expansion ratio for sea-level optimisation.",
    "Gimbal bearings on a thrust mount must handle both axial thrust loads and lateral forces from thrust vector control — typically ±5° deflection.",
    "Ablative nozzle liners (carbon-phenolic composite) sacrifice material thickness to absorb heat. Typical regression rate: 0.1-0.3 mm/s.",
    "Propellant feed-through ports must maintain seal integrity under vibration loads of 15-25g RMS during launch.",
    "Thrust structure mass fraction (structure mass / total thrust) is a key metric. Best-in-class: <0.5% for LOX/RP-1 engines.",
  ],
  satellite: [
    "In LEO, a CubeSat experiences thermal cycling from -150°C to +150°C every 90-minute orbit. All joints must accommodate differential thermal expansion.",
    "A 1U CubeSat mass budget is 1.33 kg maximum. The structural frame typically consumes 200-300g, leaving ~1 kg for payload and subsystems.",
    "PC-104 is the standard CubeSat avionics bus: 90.17mm × 95.89mm boards with a 104-pin connector stack at 15.24mm pitch.",
    "Deployment switches (kill switches) are mandated by CubeSat Design Specification. They must cut all power while stowed in the P-POD deployer.",
    "Reaction wheels provide attitude control by conservation of angular momentum. A 10 mNm·s wheel can slew a 3U CubeSat at ~1°/s.",
    "Space-grade aluminum 7075-T6 is preferred over 6061 for CubeSat frames — 40% higher yield strength at only 3% more mass.",
    "Solar cell efficiency in LEO: triple-junction GaAs cells achieve 30%+ but cost ~$300/W. Silicon cells at 22% are 10x cheaper per watt.",
    "Outgassing is critical in vacuum. All materials must meet NASA ASTM E595: <1% TML (total mass loss) and <0.1% CVCM.",
  ],
  drone: [
    "Carbon fiber layup orientation determines stiffness direction. 0°/90° cross-ply is standard for drone arms; ±45° adds torsional rigidity for vibration damping.",
    "Motor KV rating × battery voltage = no-load RPM. For a heavy-lift octocopter, 300-400 KV motors on 6S (22.2V) give optimal thrust-to-weight.",
    "Propeller efficiency peaks at specific advance ratios. Matching prop diameter to motor KV is the single largest factor in flight time.",
    "Center of gravity must be within 5mm of the geometric center for stable PID control. Asymmetric payloads require counterweights or software trim.",
    "ESC timing advance (0-30°) affects motor efficiency and heat generation. Higher advance improves high-RPM efficiency but increases low-speed cogging.",
    "Vibration from motors at the frame's natural frequency causes Jello effect in cameras. Soft-mounting motors with O-rings shifts the resonance.",
    "For coaxial motor configurations, the lower propeller operates in disturbed air. Expect 15-20% thrust loss on the lower motor compared to isolated operation.",
    "Retractable landing gear reduces drag by ~8% in forward flight but adds 200-400g. Break-even flight time: approximately 12 minutes.",
  ],
  ev: [
    "Prismatic lithium-ion cells expand 3-5% during charge cycling. Battery module housing must provide controlled preload while allowing this swelling.",
    "Liquid cooling channels target a Reynolds number of 4,000-10,000 for turbulent flow — the sweet spot between heat transfer and pumping power.",
    "Busbar current density limits: copper busbars should not exceed 5 A/mm² for continuous operation to keep temperature rise under 30°C.",
    "UN ECE R100 mandates HV isolation resistance of 500 Ω/V minimum. A 400V pack needs 200 kΩ isolation from chassis ground.",
    "Thermal runaway propagation is the critical safety failure. Vent ports must direct hot gas (>600°C) away from adjacent cells within 5 seconds.",
    "Cell-to-pack ratio (cell volume / pack volume) determines energy density. Tesla 4680 structural pack achieves ~72%, up from ~55% in earlier designs.",
    "BMS current measurement uses hall-effect sensors for high-side sensing. Accuracy of ±0.5% over -40°C to +85°C is required for accurate SOC estimation.",
    "Cooling plate flatness tolerance of ±0.1mm is critical for thermal interface material (TIM) contact with cell faces.",
  ],
  robot: [
    "Harmonic drive gears achieve 100:1 reduction in a single stage with <1 arcmin backlash. Standard in collaborative robot joints.",
    "Cable routing through revolute joints must accommodate ±180° rotation. Helical cable paths prevent fatigue failure over 10M+ cycles.",
    "Force-torque sensors at the wrist use 6-axis strain gauge bridges. Resolution of 0.1N and 0.005 Nm enables delicate assembly tasks.",
    "ISO 10218 defines safety zones: maximum TCP speed of 250 mm/s and 150N maximum contact force for collaborative operation near humans.",
    "Joint servo bandwidth determines maximum Cartesian acceleration. A 50 Hz bandwidth joint limits TCP acceleration to approximately 5 m/s².",
    "Cycloidal drives are gaining adoption over harmonic drives — similar ratios but 3x higher shock load capacity and no flex spline fatigue failure.",
    "Encoder resolution directly limits positioning repeatability. 19-bit absolute encoders give ±0.003° resolution per joint — sufficient for ±0.02mm TCP repeatability on a 1m reach arm.",
    "Gravity compensation using spring mechanisms can reduce joint motor torque requirements by 60-80%, enabling lighter actuators.",
  ],
  default: [
    "Aluminum 6061-T6 has a yield strength of 276 MPa and excellent machinability. 7075-T6 offers 503 MPa but is harder to weld.",
    "Tolerance stack-up analysis: for an assembly of N parts each at ±0.1mm, worst-case stack is ±0.1×N mm, but RSS (statistical) is ±0.1×√N mm.",
    "FDM 3D printing achieves ±0.2mm accuracy. SLS: ±0.1mm. CNC machining: ±0.025mm. Choose process by required tolerance, not preference.",
    "Surface finish Ra 3.2μm is standard for CNC machining. Ra 0.8μm requires finishing passes. Ra 0.1μm requires grinding or lapping.",
    "Parametric CAD models are defined by constraints, not coordinates. Changing one dimension propagates through all dependent features automatically.",
    "DFM rule of thumb: wall thickness should be ≥1.5mm for injection molding, ≥0.8mm for sheet metal, and ≥0.4mm for FDM printing.",
    "STEP (ISO 10303) is the universal CAD exchange format. It preserves solid geometry, assemblies, and metadata across all major CAD packages.",
    "Mass properties matter: center of gravity position affects structural loads, vibration modes, and assembly stability during manufacturing.",
  ],
}

/** Keywords mapped to their fact pool key */
const KEYWORD_MAP: [string[], string][] = [
  [["rocket", "thrust", "nozzle", "propellant", "engine mount", "propulsion", "launch"], "rocket"],
  [["satellite", "cubesat", "orbit", "space", "leo", "deployment", "solar panel rail"], "satellite"],
  [["drone", "uav", "quadcopter", "octocopter", "propeller", "multirotor", "gimbal"], "drone"],
  [["ev", "battery", "motor", "electric vehicle", "bms", "charging", "busbar", "cooling channel"], "ev"],
  [["robot", "arm", "joint", "actuator", "gripper", "servo", "harmonic", "encoder", "wrist"], "robot"],
]

/**
 * Selects the best fact pool based on keyword matching in the subject string.
 */
function selectFactPool(subject: string): string[] {
  const lower = subject.toLowerCase()
  let bestMatch = "default"
  let bestScore = 0

  for (const [keywords, poolKey] of KEYWORD_MAP) {
    const score = keywords.filter(kw => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestMatch = poolKey
    }
  }

  return SUBJECT_FACT_POOLS[bestMatch] ?? SUBJECT_FACT_POOLS.default
}

interface CadLabProgressProps {
  /** Array of progress status lines from the operation */
  lines: string[]
  /** Whether the operation is currently running */
  isActive: boolean
  /** Type of operation for context-specific messaging */
  operationType: "research" | "breakdown" | "generate" | "batch"
  /** The user's subject input, used for keyword-matched educational content */
  subject?: string
}

/**
 * CadLabProgress — Three-tier educational progress experience.
 *
 * @description Tier 1 explains what the AI is doing now. Tier 2 teaches
 * domain-specific engineering facts matched to the user's subject.
 * Tier 3 annotates individual progress lines with context.
 */
export function CadLabProgress({ lines, isActive, operationType, subject = "" }: CadLabProgressProps) {
  const [factIndex, setFactIndex] = useState(0)
  const [explainerIndex, setExplainerIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const factPool = useMemo(() => selectFactPool(subject), [subject])
  const explainers = OPERATION_EXPLAINERS[operationType] ?? OPERATION_EXPLAINERS.generate

  // Rotate engineering facts every 8 seconds
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % factPool.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [isActive, factPool])

  // Rotate operation explainers every 12 seconds
  useEffect(() => {
    if (!isActive) return
    setExplainerIndex(0)
    const interval = setInterval(() => {
      setExplainerIndex((prev) => (prev + 1) % explainers.length)
    }, 12000)
    return () => clearInterval(interval)
  }, [isActive, explainers])

  // Track elapsed time
  useEffect(() => {
    if (!isActive) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isActive])

  if (!isActive && lines.length === 0) return null

  const estimatedSeconds = operationType === "research" ? 60
    : operationType === "breakdown" ? 30
    : operationType === "generate" ? 45
    : 120

  const progress = Math.min((elapsedSeconds / estimatedSeconds) * 100, 95)

  return (
    <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/20 to-background overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Progress bar */}
        {isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                {operationType === "research" ? "Researching your product..." :
                 operationType === "breakdown" ? "Mapping sub-assemblies..." :
                 operationType === "generate" ? "Generating parametric CAD..." :
                 "Running full pipeline..."}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {elapsedSeconds}s
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Tier 1: Operation explainer */}
        {isActive && (
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            {explainers[explainerIndex]}
          </p>
        )}

        {/* Step lines with animated checkmarks */}
        {lines.length > 0 && (
          <div className="space-y-1.5">
            {lines.map((line, i) => {
              const isLast = i === lines.length - 1
              const isComplete = !isLast || !isActive
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-international-orange animate-spin flex-shrink-0 mt-0.5" />
                  )}
                  <span className={isComplete ? "text-muted-foreground" : "text-foreground font-medium"}>
                    {line}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Tier 2: Subject-matched engineering fact */}
        {isActive && (
          <div className="flex items-start gap-2.5 pt-3 border-t border-international-orange/10">
            <GraduationCap className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
            <div className="min-h-[48px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-international-orange mb-1">Engineering Insight</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {factPool[factIndex]}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
