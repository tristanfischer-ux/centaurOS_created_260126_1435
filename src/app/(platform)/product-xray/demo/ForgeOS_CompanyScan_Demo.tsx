// ForgeOS Demo — X‑Ray Workbench with guided diagnostics (vNext)
// Key update: Reaction module now opens an ALL-AT-ONCE guided diagnostic (Option B)
// that writes back into the module spec and unlocks downstream suggestions.
// Also includes parallel-then-merge DAG schematic.
//
// INTEGRATION NOTE: This file is the reference demo implementation.
// Do NOT modify internal logic. Only the 5 optional props at the bottom
// were added for persistence/wrapper integration.

"use client"

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

const moneyGBP = (n: number): string => `£${Math.round(n).toLocaleString()}`;

// ---------------- Types (exported for wrapper/services) ----------------
export type Discipline = "Process" | "Mechanical" | "Controls" | "Operations" | "Regulatory" | "Commercial";
export type ExpertQuestion = { discipline: Discipline; q: string };

export type InterviewState = {
  answers: Record<string, string>;
  risks: string[];
  notes: string;
  completedAt?: string;
};

export type ReactionDiagnostic = {
  // All-at-once answers. Keys are stable field names.
  whereProductExists?:
    | "Dissolved in a liquid"
    | "Suspended particles in liquid"
    | "Mixed solids"
    | "Gas"
    | "Created by combining ingredients"
    | "Grown/produced by organisms";
  triggerMechanism?:
    | "Add chemical"
    | "Change temperature"
    | "Change pressure"
    | "Electricity"
    | "Biological activity"
    | "Mechanical action";
  timescale?: "Seconds" | "Minutes" | "Hours" | "Days";
  controlSensitivity?:
    | "Naturally stable"
    | "Temperature sensitive"
    | "Concentration sensitive"
    | "Mixing sensitive"
    | "All of the above";
  postReactionForm?:
    | "Crystals in liquid"
    | "Powder"
    | "Sticky mass"
    | "New liquid"
    | "Gas bubbles"
    | "Living biomass";
  freeform?: string;
  derivedProcessClass?: string; // computed
  derivedRisks?: string[]; // computed
};

export type ModuleSpec = {
  id: string;
  name: string;
  purpose: string;
  io: { in: string[]; out: string[] };
  keyParts: string[];
  tests: string[];
  requirements: { leadWeeks: number; notes: string };
  detail: {
    whatItIs: string;
    whyItMatters: string;
    commonFailureModes: string[];
    unknownsToResolve: string[];
    expertQuestions: ExpertQuestion[];
  };
  interview?: InterviewState;
  reactionDiag?: ReactionDiagnostic;
  supplier?: string;
  estCost?: number;
};

export type XRaySpec = {
  idea: string;
  function: string;
  assumptions: string[];
  materials: string[];
  processes: string[];
  validation: string[];
  modules: ModuleSpec[];
  lastScannedAt?: string;
};

export function newEmptySpec(idea: string): XRaySpec {
  return { idea, function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] };
}

// ---------------- Mock Scan ----------------
function baseDetail(overrides: Partial<ModuleSpec["detail"]> = {}): ModuleSpec["detail"] {
  return {
    whatItIs: "Sub‑assembly with clear IO and tests.",
    whyItMatters: "Controls yield/safety/uptime/cost.",
    commonFailureModes: [
      "Ambiguous spec causes bid mismatch",
      "Wrong materials lead to corrosion/leaks",
      "No test plan → latent failures",
    ],
    unknownsToResolve: ["Operating envelope (T, pH, TDS)", "Compatibility with upstream/downstream"],
    expertQuestions: [
      { discipline: "Process", q: "What operating ranges must we tolerate (flow, TDS, temperature, pH)?" },
      { discipline: "Mechanical", q: "What wetted materials are acceptable (316L, duplex, plastics)?" },
    ],
    ...overrides,
  };
}

export function mockScanIdea(idea: string): XRaySpec {
  const s = newEmptySpec(idea);
  s.function = "A modular processing machine performing staged transformations to produce a saleable output.";
  s.assumptions = ["Skid-based system", "Corrosion resistant wetted path", "Designed for maintainability"].filter(Boolean);
  s.materials = ["316L stainless steel", "HDPE/PP for select plumbing", "Instrumentation", "Electronics/PLC"].filter(Boolean);
  s.processes = ["Skid fabrication", "Pipework & valves", "Controls & automation", "Commissioning"].filter(Boolean);
  s.validation = ["Leak test", "Instrument calibration", "72-hour endurance run", "Sampling protocol"].filter(Boolean);

  // 5 modules for a parallel-then-merge visual.
  s.modules = [
    {
      id: "intake",
      name: "Intake & Pumping",
      purpose: "Stabilise flow/pressure into process modules",
      io: { in: ["Brine feed"], out: ["Pressurised feed"] },
      keyParts: ["Pump", "Flowmeter", "Valves", "Pressure sensor"],
      tests: ["Flow calibration", "Cavitation check", "Leak check"],
      requirements: { leadWeeks: 3, notes: "Chemistry-resistant pump selection" },
      detail: baseDetail({
        whatItIs: "Front-end that receives brine and delivers stable flow/pressure.",
        whyItMatters: "Everything downstream depends on stable feed; poor intake kills uptime.",
        expertQuestions: [
          { discipline: "Process", q: "How variable is the feed (TDS range, solids, oil, biofouling)?" },
          { discipline: "Mechanical", q: "Which pump type is appropriate (centrifugal, PD) for chemistry + duty?" },
          { discipline: "Operations", q: "Top 3 maintenance pain points in similar plants?" },
        ],
      }),
    },
    {
      id: "pretreat",
      name: "Pre‑treatment",
      purpose: "Remove foulants / protect core process",
      io: { in: ["Pressurised feed"], out: ["Conditioned brine"] },
      keyParts: ["Strainer", "Filter housing", "Backwash/CIP"],
      tests: ["Pressure drop test", "Fouling stress test"],
      requirements: { leadWeeks: 6, notes: "Fouling resilience" },
      detail: baseDetail({
        whatItIs: "Screens/filters/CIP to protect the extraction steps.",
        whyItMatters: "Prevents performance collapse; sets maintenance cadence.",
        expertQuestions: [
          { discipline: "Process", q: "What foulants dominate (bio, organics, silica, oil)?" },
          { discipline: "Operations", q: "What cleaning regime is realistic on-site?" },
        ],
      }),
    },
    {
      id: "react",
      name: "Reaction / Transformation",
      purpose: "Change chemistry/physics to enable extraction",
      io: { in: ["Conditioned brine"], out: ["Converted stream / precipitate / enriched phase"] },
      keyParts: ["Reactor/vessel", "Dosing", "Agitation", "Temperature control"],
      tests: ["Kinetics sanity", "Yield verification", "Stability run"],
      requirements: { leadWeeks: 8, notes: "Kinetics + dosing control" },
      detail: baseDetail({
        whatItIs: "The heart of the system where the transformation occurs (yield/selectivity).",
        whyItMatters: "This drives economics; ambiguity here makes all supplier quotes meaningless.",
        unknownsToResolve: [
          "Which transformation mechanism (precipitation, electrochemical, adsorption, membrane...)?",
          "Timescale and required residence time",
          "Heat and mixing sensitivity",
        ],
        expertQuestions: [
          { discipline: "Process", q: "What mechanism is most plausible for your target salts/metals?" },
          { discipline: "Process", q: "What residence time / kinetics do you expect?" },
          { discipline: "Mechanical", q: "Is this batch or continuous and what mixing regime is required?" },
          { discipline: "Regulatory", q: "Any hazardous reagents/byproducts implied by the mechanism?" },
        ],
      }),
      reactionDiag: {
        // sensible defaults for brine mining (editable)
        whereProductExists: "Dissolved in a liquid",
        triggerMechanism: "Add chemical",
        timescale: "Minutes",
        controlSensitivity: "All of the above",
        postReactionForm: "Crystals in liquid",
        freeform: "Assuming precipitation/crystallisation approach as a starting hypothesis.",
      },
    },
    {
      id: "solids",
      name: "Separation / Solids Handling",
      purpose: "Separate phases, dewater, package",
      io: { in: ["Slurry / mixed stream"], out: ["Solid product + filtrate"] },
      keyParts: ["Filter press", "Centrifuge", "Dryer (optional)"],
      tests: ["Moisture spec test", "Throughput test"],
      requirements: { leadWeeks: 10, notes: "Downstream product spec" },
      detail: baseDetail({
        whatItIs: "Downstream unit ops to convert intermediate into a shippable product.",
        whyItMatters: "Determines product quality + handling cost.",
        expertQuestions: [
          { discipline: "Process", q: "What product spec matters (purity, moisture, particle size)?" },
          { discipline: "Operations", q: "How will product be stored and shipped?" },
        ],
      }),
    },
    {
      id: "controls",
      name: "Controls & Instrumentation",
      purpose: "Stability, observability, alarms, data capture",
      io: { in: ["Sensor signals"], out: ["Actuation + logs"] },
      keyParts: ["PLC", "HMI", "I/O", "Network", "Data logging"],
      tests: ["Interlock test", "Alarm simulation", "Data integrity check"],
      requirements: { leadWeeks: 6, notes: "Logging & traceability" },
      detail: baseDetail({
        whatItIs: "Automation layer: PLC logic, safety interlocks, HMI screens, and logging.",
        whyItMatters: "Without good controls you can't hold stable operating points or debug failures.",
        expertQuestions: [
          { discipline: "Controls", q: "Minimum viable sensor set to control safely?" },
          { discipline: "Controls", q: "Which alarms/interlocks are non-negotiable?" },
          { discipline: "Commercial", q: "What evidence/logs will buyers demand to trust claims?" },
        ],
      }),
    },
  ];

  s.lastScannedAt = new Date().toISOString();
  return s;
}

// ---------------- Marketplace data ----------------
export type PersonListing = { id: string; name: string; role: string; tags: string[]; rate: string };
export const PEOPLE: PersonListing[] = [
  { id: "p1", name: "Senior Process Engineer", role: "Mass balance & chemistry", tags: ["process", "chemistry", "scale"], rate: "£750/day" },
  { id: "p2", name: "Mechanical Engineer", role: "Skids & piping", tags: ["mechanical", "skids", "pressure"], rate: "£700/day" },
  { id: "p3", name: "Controls Engineer", role: "PLC/HMI", tags: ["controls", "automation", "data"], rate: "£850/day" },
  { id: "p4", name: "Operations Advisor", role: "Maintenance & procedures", tags: ["operations", "uptime"], rate: "£500/day" },
  { id: "p5", name: "Regulatory Advisor", role: "Permits & waste", tags: ["regulatory", "permits"], rate: "£250/hr" },
  { id: "p6", name: "Commercial Lead", role: "GTM + buyer requirements", tags: ["commercial", "b2b"], rate: "£650/day" },
];

export type CompanyListing = { id: string; name: string; capabilities: string[]; typicalLeadWeeks: number; warrantyMonths: number };
export const COMPANIES: CompanyListing[] = [
  { id: "c1", name: "Precision Fabricators", capabilities: ["skids", "pipework", "stainless"], typicalLeadWeeks: 6, warrantyMonths: 12 },
  { id: "c2", name: "Tank & Vessel Co", capabilities: ["tanks", "FRP", "pressure"], typicalLeadWeeks: 8, warrantyMonths: 12 },
  { id: "c3", name: "Controls & Panels Ltd", capabilities: ["PLC", "HMI", "panel"], typicalLeadWeeks: 6, warrantyMonths: 24 },
  { id: "c4", name: "Filtration Systems", capabilities: ["filters", "clarifier", "pretreat"], typicalLeadWeeks: 10, warrantyMonths: 12 },
  { id: "c5", name: "Membrane Integrator", capabilities: ["membranes", "CIP"], typicalLeadWeeks: 12, warrantyMonths: 12 },
  { id: "c6", name: "Drying & Solids", capabilities: ["dryer", "crystalliser", "solids"], typicalLeadWeeks: 14, warrantyMonths: 12 },
];

// --------- Matching helpers ---------
function deriveRoleNeeds(spec: XRaySpec) {
  const disciplines = new Set<Discipline>();
  spec.modules.forEach((m) => m.detail.expertQuestions.forEach((q) => disciplines.add(q.discipline)));
  const mapping: Record<Discipline, string[]> = {
    Process: ["process", "chemistry"],
    Mechanical: ["mechanical", "skids", "pressure"],
    Controls: ["controls", "automation", "data"],
    Operations: ["operations", "uptime"],
    Regulatory: ["regulatory", "permits"],
    Commercial: ["commercial"],
  };
  return Array.from(disciplines).map((d) => ({ discipline: d, keywords: mapping[d] }));
}

function matchPeopleForNeed(need: { discipline: Discipline; keywords: string[] }) {
  return PEOPLE.map((p) => ({ p, score: p.tags.reduce((s, t) => s + (need.keywords.includes(t) ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
}

function suggestSuppliersForModule(m: ModuleSpec) {
  const hay = (m.name + " " + m.purpose + " " + m.keyParts.join(" ")).toLowerCase();
  return COMPANIES.map((c) => ({ c, score: c.capabilities.reduce((s, cap) => s + (hay.includes(cap.toLowerCase()) ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.c);
}

// Chart token CSS variables for SVG node accent colors (replaces hardcoded hex)
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

function chipColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CHART_COLORS[h % CHART_COLORS.length];
}

function readinessFor(m: ModuleSpec) {
  const a = m.interview?.answers || {};
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length;
  const total = m.detail.expertQuestions.length;
  const risks = m.interview?.risks?.filter(Boolean).length || 0;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  return { answered, total, risks, pct };
}

// ---------------- Guided Diagnostic — Reaction (ALL AT ONCE) ----------------
function deriveReactionClass(diag: ReactionDiagnostic): { cls: string; risks: string[] } {
  const risks: string[] = [];

  const where = diag.whereProductExists;
  const trig = diag.triggerMechanism;
  const t = diag.timescale;
  const sens = diag.controlSensitivity;
  const post = diag.postReactionForm;

  let cls = "Unspecified transformation";

  if (where === "Dissolved in a liquid") {
    if (trig === "Add chemical") cls = "Precipitation / crystallisation reactor";
    else if (trig === "Electricity") cls = "Electrochemical recovery cell";
    else if (trig === "Change temperature") cls = "Thermal crystallisation / evaporation";
    else cls = "Liquid‑phase transformation";
  } else if (where === "Grown/produced by organisms") {
    cls = "Bioprocess / bioreactor";
  } else if (where === "Created by combining ingredients") {
    cls = "Formulation / polymerisation / mixing process";
  }

  if (t === "Hours" || t === "Days") risks.push("Long residence time may drive large equipment and capex.");
  if (sens === "All of the above") risks.push("High control sensitivity: expect higher instrumentation + tuning effort.");
  if (post === "Crystals in liquid") risks.push("You will need solid‑liquid separation; crystal size distribution matters.");
  if (!where || !trig || !t || !sens || !post) risks.push("Diagnostic incomplete: quotes will be unreliable until filled.");

  return { cls, risks };
}

function ReactionDiagnosticPanel({
  module,
  onClose,
  onSave,
}: {
  module: ModuleSpec;
  onClose: () => void;
  onSave: (m: ModuleSpec) => void;
}) {
  const initial = module.reactionDiag || {};
  const [diag, setDiag] = useState<ReactionDiagnostic>({ ...initial });

  const derived = useMemo(() => deriveReactionClass(diag), [diag]);

  const save = () => {
    const updated: ModuleSpec = {
      ...module,
      reactionDiag: {
        ...diag,
        derivedProcessClass: derived.cls,
        derivedRisks: derived.risks,
      },
    };

    // Write back into module text so downstream pages become explicit
    const newUnknowns = Array.from(new Set([...(updated.detail.unknownsToResolve || []), ...(derived.risks || [])]));
    updated.detail.unknownsToResolve = newUnknowns;

    updated.detail.whatItIs =
      "Transformation core. " +
      (derived.cls ? `Derived class: ${derived.cls}.` : "Derived class pending.");

    onSave(updated);
  };

  const SelectRow = ({ label, value, options, onChange }: { label: string; value: string | undefined; options: string[]; onChange: (v: string) => void }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{label}</h4>
      <div className="flex flex-wrap gap-2">
        {options.map((opt: string) => {
          const isActive = value === opt;
          return (
            <Button
              key={opt}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(opt)}
              type="button"
            >
              {opt}
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Guided diagnostic — {module.name}</h3>
            <p className="text-xs text-muted-foreground">Answer 5 decisive questions. ForgeOS derives the likely process class.</p>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <SelectRow
            label="1) Where does the product exist right now?"
            value={diag.whereProductExists}
            options={[
              "Dissolved in a liquid",
              "Suspended particles in liquid",
              "Mixed solids",
              "Gas",
              "Created by combining ingredients",
              "Grown/produced by organisms",
            ]}
            onChange={(v) => setDiag({ ...diag, whereProductExists: v as ReactionDiagnostic["whereProductExists"] })}
          />

          <SelectRow
            label="2) What triggers the transformation?"
            value={diag.triggerMechanism}
            options={["Add chemical", "Change temperature", "Change pressure", "Electricity", "Biological activity", "Mechanical action"]}
            onChange={(v) => setDiag({ ...diag, triggerMechanism: v as ReactionDiagnostic["triggerMechanism"] })}
          />

          <SelectRow
            label="3) Timescale"
            value={diag.timescale}
            options={["Seconds", "Minutes", "Hours", "Days"]}
            onChange={(v) => setDiag({ ...diag, timescale: v as ReactionDiagnostic["timescale"] })}
          />

          <SelectRow
            label="4) Control sensitivity"
            value={diag.controlSensitivity}
            options={["Naturally stable", "Temperature sensitive", "Concentration sensitive", "Mixing sensitive", "All of the above"]}
            onChange={(v) => setDiag({ ...diag, controlSensitivity: v as ReactionDiagnostic["controlSensitivity"] })}
          />

          <SelectRow
            label="5) After reaction, what does it look like?"
            value={diag.postReactionForm}
            options={["Crystals in liquid", "Powder", "Sticky mass", "New liquid", "Gas bubbles", "Living biomass"]}
            onChange={(v) => setDiag({ ...diag, postReactionForm: v as ReactionDiagnostic["postReactionForm"] })}
          />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Notes (optional)</h4>
            <Input value={diag.freeform || ""} onChange={(e) => setDiag({ ...diag, freeform: e.target.value })} placeholder="Any extra context..." />
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-6 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Derived process class</h4>
              <Badge>Auto</Badge>
            </div>
            <p className="text-sm text-foreground">{derived.cls}</p>
            <p className="text-xs text-muted-foreground">This will drive which experts/suppliers are shown next.</p>

            {derived.risks.length > 0 && (
              <div className="mt-4 space-y-1">
                <h4 className="text-sm font-semibold">Derived risks / unknowns</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {derived.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save}>Save diagnostic → update module</Button>
          <Button
            variant="outline"
            onClick={() => {
              // quick fill default brine hypothesis
              const preset: ReactionDiagnostic = {
                whereProductExists: "Dissolved in a liquid",
                triggerMechanism: "Add chemical",
                timescale: "Minutes",
                controlSensitivity: "All of the above",
                postReactionForm: "Crystals in liquid",
                freeform: "Preset: precipitation/crystallisation starting hypothesis.",
              };
              setDiag(preset);
            }}
          >
            Apply brine preset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Interview Mode (generic) ----------------
function InterviewPanel({ module, onClose, onSave }: { module: ModuleSpec; onClose: () => void; onSave: (m: ModuleSpec) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(module.interview?.answers || {});
  const [risks, setRisks] = useState<string[]>(module.interview?.risks || []);
  const [notes, setNotes] = useState<string>(module.interview?.notes || "");

  const addRisk = () => setRisks([...risks, ""]);

  const save = () => {
    const updated: ModuleSpec = {
      ...module,
      interview: { answers, risks, notes, completedAt: new Date().toISOString() },
    };
    updated.detail.unknownsToResolve = Array.from(new Set([...(updated.detail.unknownsToResolve || []), ...risks.filter(Boolean)]));
    onSave(updated);
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Interview — {module.name}</h3>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">Capture answers live. Save writes back into module unknowns.</p>

        {module.detail.expertQuestions.map((q, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{q.discipline}</Badge>
              <span className="text-sm">{q.q}</span>
            </div>
            <Input
              value={answers[q.q] || ""}
              onChange={(e) => setAnswers({ ...answers, [q.q]: e.target.value })}
              placeholder="Type expert's answer..."
            />
          </div>
        ))}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Risks / Unknowns discovered</h4>
          {risks.map((r, i) => (
            <Input
              key={i}
              value={r}
              onChange={(e) => setRisks(risks.map((x, ix) => (ix === i ? e.target.value : x)))}
              placeholder="Risk or uncertainty"
            />
          ))}
          <Button variant="outline" onClick={addRisk}>
            Add risk
          </Button>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">General notes</h4>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Freeform notes" />
        </div>

        <Button onClick={save}>Save interview → update module</Button>
      </CardContent>
    </Card>
  );
}

// ---------------- UI components ----------------
function Pill({ label, items }: { label: string; items: string[] }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <h4 className="text-sm font-semibold">{label}</h4>
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            items.map((x, i) => (
              <Badge key={i} variant="secondary">
                {x}
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleCard({
  m,
  onOpenInterview,
  onOpenReactionDiag,
}: {
  m: ModuleSpec;
  onOpenInterview: (m: ModuleSpec) => void;
  onOpenReactionDiag: (m: ModuleSpec) => void;
}) {
  const [open, setOpen] = useState(false);
  const r = readinessFor(m);
  const isReaction = m.id === "react";

  const diagComplete = isReaction
    ? !!(m.reactionDiag?.whereProductExists && m.reactionDiag?.triggerMechanism && m.reactionDiag?.timescale && m.reactionDiag?.controlSensitivity && m.reactionDiag?.postReactionForm)
    : true;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{m.name}</h3>
            <p className="text-xs text-muted-foreground">{m.purpose}</p>
          </div>
          <div className="flex items-center gap-2">
            {isReaction && (diagComplete ? <Badge>Diagnostic set</Badge> : <Badge variant="secondary">Needs diagnostic</Badge>)}
            <Badge variant="secondary">Answers {r.answered}/{r.total} • Risks {r.risks}</Badge>
            <Button variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Deep dive"}
            </Button>
            {isReaction ? (
              <Button onClick={() => onOpenReactionDiag(m)}>Diagnostic</Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenInterview(m)}>Interview</Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Inputs</h4>
            <p className="text-xs text-muted-foreground">{m.io.in.join(", ")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Outputs</h4>
            <p className="text-xs text-muted-foreground">{m.io.out.join(", ")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-xs font-semibold">Key parts</h4>
            <p className="text-xs text-muted-foreground">
              {m.keyParts.slice(0, 4).join(", ")}
              {m.keyParts.length > 4 ? "…" : ""}
            </p>
          </div>
        </div>

        {isReaction && m.reactionDiag?.derivedProcessClass && (
          <div className="rounded-lg bg-muted p-4">
            <h4 className="text-sm font-semibold">Derived process class</h4>
            <p className="text-sm text-foreground">{m.reactionDiag.derivedProcessClass}</p>
          </div>
        )}

        {open && (
          <div className="rounded-lg bg-muted p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">What it is</h4>
                <p className="text-sm text-foreground">{m.detail.whatItIs}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Why it matters</h4>
                <p className="text-sm text-foreground">{m.detail.whyItMatters}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Common failure modes</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {m.detail.commonFailureModes.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Unknowns to resolve</h4>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {m.detail.unknownsToResolve.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Questions to ask experts</h4>
              <div className="space-y-2">
                {m.detail.expertQuestions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="secondary">{q.discipline}</Badge>
                    <span className="text-sm text-foreground">{q.q}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Parallel-then-merge DAG schematic ----------------
function Schematic({
  spec,
  onOpenReactionDiag,
}: {
  spec: XRaySpec;
  onOpenReactionDiag: (m: ModuleSpec) => void;
}) {
  const modules = spec.modules || [];
  const n = modules.length;
  const lastScannedLabel = spec.lastScannedAt ? new Date(spec.lastScannedAt).toLocaleString() : "Not scanned yet";

  if (n === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Scan to populate the schematic.</p>
        </CardContent>
      </Card>
    );
  }

  // start & end
  const start = modules[0];
  const end = modules[n - 1];
  const mid = modules.slice(1, n - 1);
  const branchA = mid.filter((_, i) => i % 2 === 0);
  const branchB = mid.filter((_, i) => i % 2 === 1);

  const W = 1100,
    H = 360;
  const x0 = 90,
    xMerge = W - 260;
  const yTop = 120,
    yBot = 240;
  const nodeW = 210,
    nodeH = 64;

  const pos: Record<string, { x: number; y: number }> = {};
  pos[start.id] = { x: x0, y: (yTop + yBot) / 2 };
  pos[end.id] = { x: W - 90 - nodeW, y: (yTop + yBot) / 2 };

  const placeBranch = (arr: ModuleSpec[], y: number) => {
    const span = xMerge - (x0 + nodeW + 40);
    const step = arr.length > 0 ? span / (arr.length + 1) : span;
    arr.forEach((m, i) => {
      pos[m.id] = { x: x0 + nodeW + 40 + step * (i + 1), y };
    });
  };
  placeBranch(branchA, yTop);
  placeBranch(branchB, yBot);

  const mergeId = "__merge__";
  pos[mergeId] = { x: xMerge, y: (yTop + yBot) / 2 };

  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x1 = a.x + nodeW,
      y1 = a.y;
    const x2 = b.x,
      y2 = b.y;
    const dx = Math.max(90, (x2 - x1) * 0.55);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const edges: Array<{ from: string; to: string }> = [];
  branchA.forEach((m) => edges.push({ from: start.id, to: m.id }));
  branchB.forEach((m) => edges.push({ from: start.id, to: m.id }));
  if (branchA.length === 0 && branchB.length === 0) edges.push({ from: start.id, to: mergeId });
  branchA.forEach((m) => edges.push({ from: m.id, to: mergeId }));
  branchB.forEach((m) => edges.push({ from: m.id, to: mergeId }));
  edges.push({ from: mergeId, to: end.id });

  const react = modules.find((m) => m.id === "react");
  const reactionComplete = !!(
    react?.reactionDiag?.whereProductExists &&
    react?.reactionDiag?.triggerMechanism &&
    react?.reactionDiag?.timescale &&
    react?.reactionDiag?.controlSensitivity &&
    react?.reactionDiag?.postReactionForm
  );

  const redBlock = !reactionComplete;

  // SVG fill colors are an allowed exception per color-consistency rules
  const renderNode = (m: ModuleSpec) => {
    const p = pos[m.id];
    const c = chipColor(m.id);
    const isReaction = m.id === "react";
    const needsDiag = isReaction && !reactionComplete;

    return (
      <g key={m.id}>
        <rect x={p.x} y={p.y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" />
        <rect x={p.x} y={p.y - nodeH / 2} width={10} height={nodeH} rx={10} fill={c} />
        <text x={p.x + 18} y={p.y - 10} fontSize="13" fill="#0f172a" fontWeight="600">
          {m.name}
        </text>
        <text x={p.x + 18} y={p.y + 10} fontSize="11" fill="#64748b">
          {m.purpose}
        </text>
        {isReaction && (
          <text x={p.x + 18} y={p.y + 28} fontSize="11" fill={needsDiag ? "#B45309" : "#64748b"}>
            {needsDiag ? "Needs diagnostic" : `Class: ${m.reactionDiag?.derivedProcessClass || "set"}`}
          </text>
        )}
      </g>
    );
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">X‑Ray schematic</h3>
            <p className="text-xs text-muted-foreground">Parallel branches run in parallel then merge. Reaction diagnostic is a gating step.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              Modules: <span className="ml-1 font-semibold">{n}</span>
            </Badge>
            <Badge variant="secondary">
              Last scan: <span className="ml-1 font-semibold">{lastScannedLabel}</span>
            </Badge>
          </div>
        </div>

        {redBlock && react && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <div>
                <span className="font-semibold">Stop: Reaction subsystem undefined.</span>{" "}
                <span className="text-muted-foreground">Complete the Reaction diagnostic. Until then, supplier quotes will be unreliable.</span>
              </div>
              <Button onClick={() => onOpenReactionDiag(react)} className="shrink-0">Run diagnostic</Button>
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden bg-muted/30">
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <div style={{ minWidth: W }} className="p-6">
                {/* SVG fill colors are an allowed exception per color-consistency rules */}
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
                  <defs>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.10" />
                    </filter>
                  </defs>

                  <rect x="26" y="70" width={W - 52} height="230" rx="22" fill="#F8FAFC" />
                  <text x="40" y="60" fontSize="12" fill="#64748b">
                    PARALLEL BUILD (DAG)
                  </text>

                  {edges.map((e, idx) => {
                    const a = pos[e.from];
                    const b = pos[e.to];
                    if (!a || !b) return null;
                    return <path key={idx} d={path(a, b)} fill="none" stroke="#CBD5E1" strokeWidth="3" />;
                  })}

                  <g filter="url(#softShadow)">
                    {renderNode(start)}
                    {branchA.map(renderNode)}
                    {branchB.map(renderNode)}

                    <g key={mergeId}>
                      <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={nodeW} height={nodeH} rx={16} fill="#fff" />
                      <rect x={pos[mergeId].x} y={pos[mergeId].y - nodeH / 2} width={10} height={nodeH} rx={10} fill="#94A3B8" />
                      <text x={pos[mergeId].x + 18} y={pos[mergeId].y - 6} fontSize="13" fill="#0f172a" fontWeight="600">
                        Merge / Assembly
                      </text>
                      <text x={pos[mergeId].x + 18} y={pos[mergeId].y + 14} fontSize="11" fill="#64748b">
                        Interfaces, tolerances, integration
                      </text>
                    </g>

                    {renderNode(end)}
                  </g>
                </svg>

                <div className="mt-4 flex flex-wrap gap-2">
                  {modules.map((m) => (
                    <Button
                      key={m.id}
                      variant="outline"
                      onClick={() => document.getElementById(`module-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      View {m.name}
                    </Button>
                  ))}
                  {react && <Button onClick={() => onOpenReactionDiag(react)}>Reaction diagnostic</Button>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">Next: make branches editable, and generate supplier lists conditioned on derived process class.</p>
      </CardContent>
    </Card>
  );
}

// ---------------- Views ----------------
function XRayView({
  spec,
  setSpec,
  onScan,
  onOpenInterview,
  onOpenReactionDiag,
}: {
  spec: XRaySpec;
  setSpec: (s: XRaySpec) => void;
  onScan: (idea: string) => void;
  onOpenInterview: (m: ModuleSpec) => void;
  onOpenReactionDiag: (m: ModuleSpec) => void;
}) {
  const [localIdea, setLocalIdea] = useState(spec.idea);
  React.useEffect(() => setLocalIdea(spec.idea), [spec.idea]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Idea</h3>
              <p className="text-xs text-muted-foreground">Scan to generate machine spec (X‑Ray)</p>
            </div>
            <Button onClick={() => onScan(localIdea)}>Scan</Button>
          </div>

          <Input
            value={localIdea}
            onChange={(e) => {
              const v = e.target.value;
              setLocalIdea(v);
              setSpec({ ...spec, idea: v });
            }}
          />
          {spec.function && <p className="text-sm text-foreground">{spec.function}</p>}
        </CardContent>
      </Card>

      <Schematic spec={spec} onOpenReactionDiag={onOpenReactionDiag} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Pill label="Assumptions" items={spec.assumptions} />
        <Pill label="Materials" items={spec.materials} />
        <Pill label="Manufacturing processes" items={spec.processes} />
        <Pill label="Validation" items={spec.validation} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Modules (sub‑assemblies)</h2>
          <Badge variant="secondary">Reaction has guided diagnostic; others use interviews</Badge>
        </div>

        {spec.modules.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-foreground">
                No modules yet. Tap <span className="font-semibold">Scan</span> to generate the X‑Ray.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {spec.modules.map((m) => (
              <div key={m.id} id={`module-${m.id}`}>
                <ModuleCard m={m} onOpenInterview={onOpenInterview} onOpenReactionDiag={onOpenReactionDiag} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PeopleMarket({ spec }: { spec: XRaySpec }) {
  const needs = useMemo(() => deriveRoleNeeds(spec), [spec]);
  const reaction = spec.modules.find((m) => m.id === "react");
  const cls = reaction?.reactionDiag?.derivedProcessClass;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold">Why these people?</h3>
          <p className="text-sm text-foreground">
            Derived from X‑Ray modules{cls ? `, and Reaction class: ${cls}.` : "."}
          </p>
          {!cls && <p className="text-xs text-muted-foreground mt-1">Tip: run the Reaction diagnostic to sharpen matching.</p>}
        </CardContent>
      </Card>

      {needs.map((n) => {
        const matches = matchPeopleForNeed(n);
        return (
          <Card key={n.discipline}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">{n.discipline} expertise needed</h3>
                  <p className="text-xs text-muted-foreground">Because modules include {n.discipline} questions</p>
                </div>
                <Badge>Top 3</Badge>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {matches.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="pt-6">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                      <p className="text-xs text-muted-foreground">{p.rate}</p>
                      <Button variant="outline" className="mt-4">Shortlist</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SupplierMatch({ spec, setSpec }: { spec: XRaySpec; setSpec: (s: XRaySpec) => void }) {
  const reaction = spec.modules.find((m) => m.id === "react");
  const cls = reaction?.reactionDiag?.derivedProcessClass;

  const assign = (id: string, name: string) =>
    setSpec({ ...spec, modules: spec.modules.map((m) => (m.id === id ? { ...m, supplier: name } : m)) });

  const blocked = !cls;

  return (
    <div className="space-y-6">
      {blocked ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">Supplier matching blocked</span> — complete the Reaction diagnostic first. This preserves transparency: no bespoke negotiation, just clarity-first quoting.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold">Supplier matching</h3>
            <p className="text-sm text-foreground">Conditioned on Reaction class: {cls}.</p>
            <p className="text-xs text-muted-foreground mt-1">This preserves transparency: no bespoke negotiation, just clarity-first quoting.</p>
          </CardContent>
        </Card>
      )}

      {spec.modules.map((m) => {
        const sug = suggestSuppliersForModule(m);
        return (
          <Card key={m.id}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">{m.name}</h3>
                  <p className="text-xs text-muted-foreground">Why these: based on {m.keyParts.slice(0, 3).join(", ")}</p>
                </div>
                {m.supplier ? <Badge>Selected: {m.supplier}</Badge> : <Badge variant="secondary">Pick 1</Badge>}
              </div>

              <div className={"grid md:grid-cols-3 gap-4 " + (blocked ? "opacity-50 pointer-events-none" : "")}>
                {sug.map((c) => (
                  <Card
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => assign(m.id, c.name)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") assign(m.id, c.name); }}
                  >
                    <CardContent className="pt-6">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.capabilities.join(" • ")}</p>
                      <p className="text-xs text-muted-foreground">Lead {c.typicalLeadWeeks}w • Warranty {c.warrantyMonths}m</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RFQView({ spec }: { spec: XRaySpec }) {
  const total = spec.modules.reduce((s, m) => s + (m.estCost ?? 0), 0);
  const reaction = spec.modules.find((m) => m.id === "react");
  const cls = reaction?.reactionDiag?.derivedProcessClass;

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <h3 className="text-base font-semibold">RFQ</h3>
        <p className="text-xs text-muted-foreground">(Demo stub) Next: generate a spec pack from diagnostic + interviews + selected suppliers.</p>
        <p className="text-sm">Reaction class: <span className="font-semibold">{cls || "(unset)"}</span></p>
        <p className="text-sm">Total estimated: {moneyGBP(total)}</p>
      </CardContent>
    </Card>
  );
}

// ---------------- Self-tests ----------------
function runSelfTests(): void {
  const s = mockScanIdea("test");
  if (!s.modules || s.modules.length < 5) throw new Error("SelfTest: expected >=5 modules");
  const react = s.modules.find((m) => m.id === "react");
  if (!react?.reactionDiag) throw new Error("SelfTest: reactionDiag should exist on react module");
  const d = deriveReactionClass(react.reactionDiag);
  if (!d.cls) throw new Error("SelfTest: derived class should be non-empty");
  const sug = suggestSuppliersForModule(s.modules[0]);
  if (sug.length !== 3) throw new Error("SelfTest: expected 3 supplier suggestions");
}

// ---------------- Props for wrapper integration ----------------
export interface CompanyScanDemoProps {
  /** Restored spec from localStorage — seeds initial state */
  initialSpec?: XRaySpec;
  /** Restored active tab from localStorage */
  initialTab?: string;
  /** Called whenever spec changes — wrapper uses this for persistence */
  onSpecChange?: (spec: XRaySpec) => void;
  /** Called whenever active tab changes — wrapper uses this for persistence */
  onTabChange?: (tab: string) => void;
  /** Hide the demo's internal heading (page header replaces it) */
  hideHeader?: boolean;
}

// ---------------- Main ----------------
export default function ForgeOS_CompanyScan_Demo({
  initialSpec,
  initialTab,
  onSpecChange,
  onTabChange,
  hideHeader = false,
}: CompanyScanDemoProps) {
  const [spec, setSpecInternal] = useState<XRaySpec>(() =>
    initialSpec ?? newEmptySpec("A brine machine that extracts salts from desalination brine")
  );
  const [interviewModule, setInterviewModule] = useState<ModuleSpec | null>(null);
  const [reactionModule, setReactionModule] = useState<ModuleSpec | null>(null);

  // Wrap setSpec to also notify parent wrapper
  const setSpec = (next: XRaySpec) => {
    setSpecInternal(next);
    onSpecChange?.(next);
  };

  const onScan = (idea: string) => {
    const next = mockScanIdea((idea || "").trim() || "New machine concept");
    // Ensure reaction derived class is computed on scan (so UI shows something immediately)
    const react = next.modules.find((m) => m.id === "react");
    if (react?.reactionDiag) {
      const derived = deriveReactionClass(react.reactionDiag);
      react.reactionDiag = { ...react.reactionDiag, derivedProcessClass: derived.cls, derivedRisks: derived.risks };
      react.detail.whatItIs = "Transformation core. " + (derived.cls ? `Derived class: ${derived.cls}.` : "Derived class pending.");
      react.detail.unknownsToResolve = Array.from(new Set([...(react.detail.unknownsToResolve || []), ...(derived.risks || [])]));
    }
    setSpec(next);
  };

  React.useEffect(() => {
    try {
      runSelfTests();
    } catch (e) {
      console.error(e);
    }
    // Only auto-scan if no initialSpec was provided and modules are empty
    if (!initialSpec) {
      setSpecInternal((s) => {
        if (s.modules.length) return s;
        const scanned = mockScanIdea(s.idea);
        onSpecChange?.(scanned);
        return scanned;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveInterview = (m: ModuleSpec) => {
    const next = { ...spec, modules: spec.modules.map((x) => (x.id === m.id ? m : x)) };
    setSpec(next);
    setInterviewModule(null);
  };

  const saveReactionDiag = (m: ModuleSpec) => {
    const next = { ...spec, modules: spec.modules.map((x) => (x.id === m.id ? m : x)) };
    setSpec(next);
    setReactionModule(null);
  };

  return (
    <div className="space-y-8">
      {!hideHeader && <h2 className="text-2xl font-semibold">ForgeOS</h2>}

      <Tabs defaultValue={initialTab ?? "A"} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="A">A — X‑Ray</TabsTrigger>
          <TabsTrigger value="B">B — People</TabsTrigger>
          <TabsTrigger value="C">C — Suppliers</TabsTrigger>
          <TabsTrigger value="D">D — RFQ</TabsTrigger>
        </TabsList>

        <TabsContent value="A">
          <XRayView
            spec={spec}
            setSpec={setSpec}
            onScan={onScan}
            onOpenInterview={setInterviewModule}
            onOpenReactionDiag={setReactionModule}
          />
        </TabsContent>

        <TabsContent value="B">
          <PeopleMarket spec={spec} />
        </TabsContent>

        <TabsContent value="C">
          <SupplierMatch spec={spec} setSpec={setSpec} />
        </TabsContent>

        <TabsContent value="D">
          <RFQView spec={spec} />
        </TabsContent>
      </Tabs>

      {reactionModule && (
        <ReactionDiagnosticPanel
          module={reactionModule}
          onClose={() => setReactionModule(null)}
          onSave={saveReactionDiag}
        />
      )}

      {interviewModule && (
        <InterviewPanel module={interviewModule} onClose={() => setInterviewModule(null)} onSave={saveInterview} />
      )}
    </div>
  );
}
