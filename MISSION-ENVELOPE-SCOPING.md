# Mission Envelope — Scoping Document

**Owner:** ForgeOS / Brief page (V2)
**Date:** 2026-04-20
**Status:** Scoping — no code yet
**Target:** `src/app/(platform)/the-forge-v2/projects/[id]/brief/brief-view.tsx` → `MissionEnvelopeSvg`

---

## 1. What exists today

The Brief page ships a right-hand hero pane labelled **"Mission envelope · altitude vs endurance"**, rendered by `MissionEnvelopeSvg()` inside `brief-view.tsx` (lines 579–609).

Current state:

- **100% hard-coded SVG.** No props. No project data threaded through.
- Axes are static black arrows labelled `Performance (indicative)` (Y) and `Duration (indicative)` (X).
- A single dashed teal curve (`M80 190 Q 180 160, 300 130 Q 380 110, 440 100`) represents a generic "feasible envelope".
- Title block reads `MISSION ENVELOPE · generic reference curve`.
- Pane caption underneath already admits it: *"Generic envelope — project-specific targets arrive with the Brief editor"* (line 172).
- Header label is pre-committed to `altitude vs endurance` (line 167) — wrong for every non-UAV project.
- No competitor markers, no feasibility frontier, no target marker, no log-scale support, no units, no min/max bounds.
- `CadLabDesignBrief` (src/lib/cad-lab-types.ts) has no `missionEnvelope` field today — V2 extensions stopped at `mission / targetCustomers / whyNow / constraints / regulatory`.

**Bottom line:** the envelope chart is a decorative placeholder. Nothing about it reacts to the project. A pump project shows "altitude vs endurance" in teal just like the HAPS project.

---

## 2. Taxonomy — envelope archetypes

Proposed archetypes (10). Each slot in the Brief can pick one; the renderer keys off `archetype` to choose default axis labels, sensible units, and the shape of the feasibility frontier.

| ID | Domain | X-axis | Y-axis | Typical frontier shape | Typical competitors |
|---|---|---|---|---|---|
| `altitude-endurance` | Aircraft / UAV / HAPS | Endurance (hours / days) | Altitude (ft / km) | Concave, upper-right frontier (long dwell + high altitude is hard) | Zephyr S, PHASA-36, K1000ULE, Aquila |
| `range-payload` | Vehicles / delivery drones | Payload (kg) | Range (km) | Monotonic trade-off — more payload ⇒ less range | Tesla Semi, Einride Pod, Wing, Zipline |
| `delta-v-mass` | Spacecraft / propulsion | Dry mass (kg) | ΔV (m/s) | Exponential / Tsiolkovsky curve | Starship, Electron, Rocket Lab Photon |
| `pressure-flow` | Pumps / compressors / hydraulics | Flow rate (L/min or m³/h) | Pressure / head (bar or m) | Concave — each pump has a "duty point" | Grundfos CR series, Xylem e-HM |
| `torque-speed` | Motors / actuators / gearboxes | Speed (RPM) | Torque (Nm) | Constant-power hyperbola past base speed | Maxon EC, Kollmorgen AKM |
| `battery-life-bandwidth` | Implantable / wearable medical | Signal bandwidth or telemetry rate (kbps) | Battery life (years or days) | Log-linear trade-off | Medtronic Micra, Abbott Aveir, Biotronik |
| `resolution-fov` | Optics / cameras / sensors | Field of view (deg) | Angular resolution (arcsec or px/deg) | Optical invariant — wider FOV ⇒ coarser resolution | Canon, Sony IMX, RED |
| `energy-density-weight` | Batteries / energy storage | Weight (kg or kWh total) | Specific energy (Wh/kg) | Pareto frontier across chemistries | Tesla 4680, CATL Qilin, StoreDot |
| `reach-payload` | Robots / manipulators | Reach (m) | Payload at full extension (kg) | Inverse-power trade-off | UR10, Kuka KR, ABB IRB |
| `cost-performance` | Consumer electronics / commodity hardware | Unit cost (USD) | Composite performance score (normalised 0–100) | Pareto frontier | iPhone 16, Pixel 10, Galaxy S26 |

Each archetype carries:
- **Default axis labels** (over-writable by the user)
- **Default units**
- **Default log/linear hint** per axis (e.g. battery life on a log scale)
- **Seeded competitor list** (editable, 2–5 entries) so empty envelopes are never blank
- **Frontier hint** — which corner is "good" (top-left, top-right, etc.) so the renderer can shade the "infeasible" region consistently

---

## 3. Inference — how do we pick the archetype

Three options:

- **A — Dropdown in Brief editor.** User picks from a list of 10 archetypes. Simple, deterministic, zero LLM cost, zero latency, zero classification error.
- **B — LLM classifier.** Feed `designBrief.useCase + designBrief.mission` into a commodity LLM (DeepSeek V4 or Gemini Flash), return `archetype ∈ known set`. Zero UI friction but introduces an inference cost, a latency hit, a silent-failure mode, and a migration headache when we add an 11th archetype.
- **C — Hybrid.** LLM suggests archetype + seed values when the user opens the Brief editor; user confirms or overrides in one click.

**Recommendation: ship A for MVP, migrate to C once the archetype list is stable.**

Rationale:
1. Archetype count is small (~10). A dropdown is not friction.
2. Founders know their own product category. The LLM would be guessing at something they'll happily answer in 2 seconds.
3. Adding an archetype to the dropdown is a 1-line enum change. Adding one to a classifier prompt risks drift.
4. Once A is stable we can layer C on top without changing the data shape — the LLM just pre-fills the dropdown.

---

## 4. Data shape — JSONB extension

Extend `CadLabDesignBrief` with an optional `missionEnvelope` field. Everything is optional so existing projects keep rendering their current empty state:

```ts
export interface CadLabDesignBriefMissionEnvelope {
  /** One of the archetype IDs in §2. Drives defaults + renderer branching. */
  archetype:
    | 'altitude-endurance'
    | 'range-payload'
    | 'delta-v-mass'
    | 'pressure-flow'
    | 'torque-speed'
    | 'battery-life-bandwidth'
    | 'resolution-fov'
    | 'energy-density-weight'
    | 'reach-payload'
    | 'cost-performance'
    | 'custom'
  xAxis: { label: string; unit: string; min: number; max: number; scale?: 'linear' | 'log' }
  yAxis: { label: string; unit: string; min: number; max: number; scale?: 'linear' | 'log' }
  /** Polyline describing the feasibility frontier. Points must be in-bounds. */
  feasibilityFrontier?: Array<[number, number]>
  /** Competitor / benchmark markers — labelled dots inside the frontier. */
  competitors?: Array<{ label: string; x: number; y: number; note?: string }>
  /** The project's own target — rendered as a star marker. */
  target?: { x: number; y: number; label?: string }
  /** Free-form caption below the chart (overrides default caveat line). */
  notes?: string
}
```

Storage: goes into `cad_lab_projects.research.designBrief.missionEnvelope` — no new column, no new migration. `designBrief` is already JSONB.

Why optional everywhere: supports `archetype: 'altitude-endurance'` with **no** competitor / frontier data (fresh project, archetype picked, nothing filled) → renderer shows axes + placeholder for missing layers.

---

## 5. Rendering — renderer behaviour + states

Replace `MissionEnvelopeSvg()` with `<MissionEnvelopeSvg envelope={...} />`. The component becomes a pure function of the envelope JSON.

State machine:

- **Empty state** (`missionEnvelope` is `undefined`): keep the current generic curve **but** change the pane label to "Mission envelope · pending" and show a single-line CTA linking to the Brief fork editor: *"Declare your mission envelope →"*. No fake data.
- **Archetype-only state** (`archetype` set, nothing else): render axes + labelled axes + placeholder grid + a soft inline hint: *"Add competitors and a target to complete the envelope."* No frontier or dots.
- **Target-only state** (`archetype + target`, no competitors/frontier): render axes + a single target marker (orange star, bold). This is the typical state 5 minutes into filling the brief.
- **Competitors-only state** (`archetype + competitors`, no target): render axes + competitor dots with leader-line labels. Useful for "where does the market sit today?" without committing to a target yet.
- **Full state** (all fields): axes + shaded infeasible region behind the frontier + frontier curve + competitor dots + orange target star + optional caption.

Rendering rules:
- Axis labels come from `xAxis.label (xAxis.unit)` — e.g. `Endurance (days)`.
- Log-scale axes when `scale === 'log'` — tick positions spaced log-uniformly with powers-of-ten labels. HAPS envelope is not log; battery-life-vs-bandwidth is.
- Feasibility frontier: stroke International Orange at 1.6px, dashed when `archetype === 'custom'` (signalling uncertainty), solid otherwise.
- Competitor dots: neutral ink, 4px radius, text label offset up-right.
- Target marker: filled orange star, 10px, with label pinned above.
- Everything in semantic tokens — `stroke="var(--b-ink-primary)"`, etc. No hard-coded hex except on the cream background to match the existing pane.

Accessibility: the SVG gets `role="img"` and `aria-label="Mission envelope — {archetype}"`. A `<title>` / `<desc>` pair describes the target in plain English (e.g. *"Target: 65 000 ft at 30 days dwell"*).

---

## 6. HAPS example — populated envelope for Stratosphere HAPS-S1

```json
{
  "archetype": "altitude-endurance",
  "xAxis": { "label": "Endurance", "unit": "days", "min": 0, "max": 45, "scale": "linear" },
  "yAxis": { "label": "Altitude", "unit": "ft", "min": 0, "max": 70000, "scale": "linear" },
  "feasibilityFrontier": [
    [0.5, 20000],
    [15, 25000],
    [20, 45000],
    [30, 60000],
    [40, 65000]
  ],
  "competitors": [
    { "label": "Airbus Zephyr S",  "x": 20,    "y": 45000, "note": "Solar HAPS, in service" },
    { "label": "BAE PHASA-36",     "x": 30,    "y": 60000, "note": "Solar HAPS, flight-proven" },
    { "label": "Kraus Hamdani K1000ULE", "x": 0.625, "y": 20000, "note": "Tactical ULE UAS (15 h)" }
  ],
  "target": {
    "x": 30,
    "y": 65000,
    "label": "HAPS-S1 target"
  },
  "notes": "Stratospheric solar UAV — 30-day dwell at 65 kft target. Frontier curve blends Zephyr + PHASA published endurance at altitude."
}
```

Rendered result: three grey dots labelled Zephyr S / PHASA-36 / K1000ULE, a dashed-orange Pareto-style frontier behind them, and a solid International Orange star at (30 days, 65 kft) labelled "HAPS-S1 target". The caveat line underneath comes from `notes`.

The K1000ULE sits in the bottom-left (shorter endurance, lower altitude) and makes it visually obvious why HAPS-S1 is playing in a different class — exactly the "where does this product sit in the market" punch we want the Brief page to carry to an investor.

---

## 7. Effort estimate

Rounds of work (build order; each round is independently ship-able):

**Round 1 — Type extension (0.5 round).** Add `CadLabDesignBriefMissionEnvelope` + nested types to `cad-lab-types.ts`. Add `missionEnvelope?:` to `CadLabDesignBrief`. Regenerate types. Zero migration. Ship.

**Round 2 — SVG renderer (1 round).** Replace `MissionEnvelopeSvg()` with a props-driven version. Cover all five states (empty / archetype-only / target-only / competitors-only / full). Handle log-scale axes. Use semantic tokens. Ship a Storybook-style `/dev/envelope` preview page for the 10 archetypes with canned data so we can eyeball them all without needing 10 real projects.

**Round 3 — HAPS seed (0.25 round).** Update `scripts/seed-haps-test-project.ts` to include the HAPS envelope JSON above. Nothing else in the seed changes.

**Round 4 — Brief editor UI (1.5 rounds).** In the Brief fork editor: archetype dropdown, axis label/unit/min/max fields (with sensible defaults per archetype), target X/Y inputs, add-competitor row (label + X + Y), add-frontier-point row. This is the bulk of the work — it's the data-entry form. Live preview panel on the right showing the envelope as the user types.

**Round 5 — LLM classifier + seed (optional, 1 round).** When the user opens the editor for the first time, call a commodity LLM with `useCase + mission` and pre-fill archetype + 3 competitor suggestions + a default target. User confirms or overrides. Fallback: if the LLM fails, just land on the archetype dropdown with no pre-fill. Defer until Rounds 1–4 are stable.

**Total: ~3.25 rounds for MVP (Rounds 1–4), ~4.25 with LLM assist.**

---

## 8. Open questions for Tristan

1. **Editability:** envelope editable by the founder only, or can AI specialists (Sage, Max, Priya) propose edits? A Max-proposed "move your target down to 50 kft, here's why" is very on-brand but introduces a review/approve workflow we don't have yet.
2. **Log-scale by default for some archetypes?** Battery-life-vs-bandwidth naturally wants log on at least one axis. Do we expose the log toggle to the founder in the editor, or lock it per-archetype and hide the setting?
3. **Competitor data source:** do we seed the competitor list from a curated internal library (so every HAPS project starts with Zephyr / PHASA / K1000ULE already on the chart), or always start empty and let the founder add them?
4. **Export path:** does the envelope need to land in the PDF export (investor share) and the static concept render at the same fidelity? PDF export is vector-safe already, so this is likely free — but confirming would let us skip a rasterisation fallback round.
5. **"Custom" archetype:** do we ship `archetype: 'custom'` in v1 (lets power users define arbitrary axes), or force everyone onto the 10 and wait for the 11th archetype to emerge from support tickets?

---
