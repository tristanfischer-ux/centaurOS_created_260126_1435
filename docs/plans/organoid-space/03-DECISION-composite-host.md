# Named Decision — Composite-Host Composer Capability

*For Tristan. Written during the autonomous session (2026-07-19). This is the one remaining composer capability the organoid work exposed, and it's a real architectural choice — I'm escalating it rather than building a guess overnight.*

## The problem

The composer resolves each device to ONE dominant `working_medium` and forms that. But two machines in the organoid set are genuinely **composite** — one enclosure integrating several functions:
- **M1 RPM-appliance** = rotation (RPM gimbal) **+** incubation (`chamber_volume_l`) **+** perfusion **+** imaging **+** a docked cassette.
- **M6 perfusion bioreactor** = culture vessel **+** pump/valves **+** gas membrane **+** optical sensing **+** camera.

Today M1 resolves to `rotation` and renders a centrifuge; the incubation/imaging/dock are described in the design pack as "docked subsystems" but the composer doesn't place them. So the form is *correct-but-partial*: it's the razor's rotary core, not the whole appliance.

This is the difference between "designs a centrifuge" and "designs the appliance that spins **and** incubates **and** images **and** docks a cassette."

## Why I didn't just build it

There are ≥3 defensible architectures (below), and the choice affects the composer's core `derive`/`compose` contract. Picking wrong unattended risks either a bad abstraction you'd reject or a regression to the 40/40 single-medium forms. It only affects the `COMPOSER=1` render path (no chain/makers-kit impact), so it's *safe to build* — but not *safe to decide alone*.

## The options

**Option A — Primary + attached subsystem modules (recommended).**
Keep single-medium detection for the PRIMARY (dominant) medium. Add a second pass that detects *secondary* signals present and attaches labelled subsystem volumes (`incubation_module`, `imaging_module`, `cassette_dock`, `pump_module`) to the chassis as fastened boxes on free faces. Minimal change to the core; the primary form is unchanged (no regression risk); composites gain their subsystems.
- *Pro:* smallest, safest, preserves 40/40; reads as "core + bolt-ons" which is honestly what an appliance is.
- *Con:* subsystems are generic boxes, not physics-composed forms.

**Option B — Multi-medium co-composition.**
Generalise `working_medium` to a *set*; compose each medium's roles and pack them into the shared envelope with one connectedness graph over all.
- *Pro:* the true convergent-evolution answer; each function gets its real form.
- *Con:* large change to derive/compose/cull; real regression risk; packing/collision logic needed; several days of careful work.

**Option C — Host-shell + cassette-dock only.**
Narrow scope: just add a first-class `cassette_dock` to instrument hosts (the razor↔blade join), ignore the rest. The appliance shows it accepts the cassette; incubation/imaging stay implicit.
- *Pro:* tiny; directly serves the razor-and-blade story.
- *Con:* leaves incubation/imaging unformed.

## My recommendation

**Option A**, then Option C's dock as part of it. It closes the visible gap (M1/M6 gain their subsystems + a visible cassette dock) with near-zero regression risk to the 40/40 single-medium forms, and it's honest about what an appliance is (a core function + integrated subsystems). Option B is the eventual destination but should be a deliberate, reviewed project, not an overnight build.

**Decision needed:** A (recommended), B, or C? On approval I'll build it with proveCatch + re-render M1/M6 to confirm.

*Related: `02-MACHINE-SET-VISUAL-DECK.md` (composite-host listed as the remaining fidelity gap), `00-SYNTHESIS-AND-DESIGN.md` §7.*
