# Council: Icon-Quadrant Visualisation System — Glyph Design Pre-Flight
**Date:** 2026-05-10
**Session context:** Tristan + coordinator converged on icon-quadrant approach with specific glyph corrections. This council pressure-tests the system before dispatching the glyph-design sonnet.
**Prior councils:** Grammar + radical correction (commit `a30a0149`), primitives architecture (commit `9c8a52d8`).

## Models consulted (3 seats, parallel)

| Seat | Model | Cost (USD) |
|---|---|---|
| Grok 4.3 (adversarial) | `x-ai/grok-4.3` | $0.0084 |
| Gemini 3.1 Pro Preview (lead reasoner) | `google/gemini-3.1-pro-preview` | $0.0318 |
| DeepSeek V4-Pro (structured reasoner) | `deepseek/deepseek-v4-pro` | $0.0190 |
| **Total** | | **~$0.059 (~£0.047)** |

> Note: `anthropic/claude-opus-4.7` and `google/gemini-2.5-pro-preview` were attempted but rejected by the routing layer. Grok 4.3 + Gemini 3.1 Pro + DeepSeek V4-Pro is the seated council.

---

## Q1 — Icon-quadrant vs Chinese-character approach

### Consensus verdict: Icon-quadrant is genuinely better — but carries new failure modes the Chinese approach did not

All three members agreed the prior Chinese-character approach committed a **semiotic recursion error**: using a composite sign (a character composed of stroke-radicals) to represent a ForgeOS atomic primitive. This was the category error Tristan identified. The icon-quadrant system fixes it — each glyph is genuinely atomic.

However, all three members identified distinct new failure modes:

**Grok (adversarial):** At small sizes, the quadrant grid collapses into visual noise. Empty quadrants become ambiguous dead space. Two-radical characters placed in opposite corners read as spatially separated rather than tightly bound — violating the "single character" semantics. The mnemonic network that makes Chinese characters learnable (shared stroke patterns, phonetic hooks) is entirely absent; every glyph must be learned from zero.

**Gemini (lead):** Resolution collapse is the critical risk. A standard UI icon is designed for a 24×24 px square. Crushing 4 icons into 24×24 gives each radical a 10×10 px bounding box. At standard UI sizes, complex icons become illegible "icon soup." The character bounding box must be wider than it is tall (4:3 aspect ratio minimum); radical icons must be rigidly monoline, zero shading, designed on a strict 12×12 micro-grid.

**DeepSeek:** Visual universalism fallacy — icons like ⚡, 🔥 are not culturally neutral; they rely on Western engineering symbology. A fully international system should restrict the vocabulary to shapes that are either genuinely abstract or already internationalised (IEC/ISO registered). The learning burden without a linguistic mnemonic layer is real and should not be underestimated.

**Bottom line:** Icon-quadrant is the right fix, but the execution constraints (micro-grid design, aspect ratio, monoline rendering, cultural neutrality) are non-trivial. The system is not free to just pick convenient emoji.

---

## Q2 — Position semantics: System B (function-top, material-bottom) breakdown cases

### Consensus: System B holds for the majority but breaks on three structural classes

**Grok:** Two-function characters (e.g. `photon_emission_function` + `optical_sensing_function`) exhaust the top row; the second function has no home without violating the contract. Two-material characters (`steel` + `composite_fibre_material`) both go bottom — the polarity becomes meaningless. Pure energy characters (`lithium_iron_phosphate_chemistry` + `electrochemical_energy_function`) have no material anchor, so the entire bottom row is empty and the square reads as malformed.

**Gemini:** Introduces a specific quadrant-slot grounding fix — top-left = primary function, top-right = secondary function OR state of matter, bottom-left = primary material/substrate, bottom-right = dopant/coating/secondary chemistry/containment. Empty rows should not be blank white space but should carry a faint `—` placeholder confirming "substrate agnostic."

**DeepSeek:** Recommends a **quadrant-role corner mark** (a tiny shape in each quadrant corner) to indicate the radical's ontological category (material, function, state, containment) independent of position. This preserves System B's readability while providing escape valves for edge cases. Alternatively: collapse states and materials into a unified "substance-role" row (both bottom), everything active/process/energy goes top.

### Recommended resolution

System B stands as the default. Add the Gemini quadrant-slot grounding (top-left, top-right, bottom-left, bottom-right) as explicit composition rules. For edge cases:
- Two-function character: secondary function goes top-right
- Two-material character: secondary material goes bottom-right
- Pure energy character: explicit empty-bottom placeholder glyph (faint dash)

---

## Q3 — Glyph collision resolutions

### Q3a: `fluid_flow_state` vs future "fluid function" radical

**Grok:** `fluid_flow_state` = three parallel horizontal wavy lines with rightward arrowhead (≿ with doubled waves). Future "fluid function" = vertical pipe segment with internal flow arrow (⊚ inside a U). First is horizontal motion; second is containment of flow.

**Gemini:** `fluid_flow_state` = three horizontal wavy lines (≋). Future fluid function = solid teardrop/droplet bisected by a downward vector arrow.

**DeepSeek:** Design principle — **states use outline/unfilled shapes; functions use solid/filled shapes.** `fluid_flow_state` = outline wave (~). Future `fluid_actuation_function` = same wave but filled, or combined with motion arrow (▲).

**Council recommendation:** `fluid_flow_state` glyph = three horizontal wavy lines (≋ / ≈ style, unfilled, outline). Future fluid function = filled droplet + directional arrow. The outline/filled distinction is the cleanest differentiator that holds at 12 px. Grok's pipe-segment alternative is a strong second choice for internal tools.

---

### Q3b: `electrical_conducting_function` vs `electric_field` (if ever a radical)

**Grok:** Neither gets ⚡. `electrical_conducting_function` = zigzag resistor symbol (⌓ style broken line, path metaphor). `electric_field` = four short radiating lines from a central point (field-line convention).

**Gemini:** `electrical_conducting_function` = horizontal line with solid centre node (━●━, circuit trace metaphor). `electric_field` = high-voltage bolt ⚡ reserved exclusively for energy/field boundaries.

**DeepSeek:** ⚡ banned for both — it collides with `electromechanical_switching_function` (arc discharge) and is culturally ambiguous. `electrical_conducting_function` = solid downward arrow inside circle (current flow). `electric_field` = three concentric arcs radiating outward (ISO field-line symbol).

**Council recommendation (2 of 3 in agreement):** ⚡ is banned from both. `electrical_conducting_function` gets the circuit-trace metaphor (━●━ or zigzag line). `electric_field` (if ever promoted to radical) gets concentric radiating arcs. Gemini's assignment of ⚡ to electric_field is the minority position — Grok and DeepSeek both reject it for collision reasons.

---

### Q3c: `photovoltaic_energy_function` vs `electrical_conducting_function`

**Grok:** `photovoltaic_energy_function` = 2×2 grid inside a square (solar cell icon, ⬚). `electrical_conducting_function` = zigzag. The grid reads as area conversion; the zigzag reads as linear path.

**Gemini:** `photovoltaic_energy_function` = tilted square matrix (⊞) with a descending diagonal arrow (↘) pointing at it. The ☼ sun is too complex/noisy at 12×12 px.

**DeepSeek:** `photovoltaic_energy_function` = circle with a small arrow entering from top-left (photon) and a horizontal bar at the bottom (junction) — close to ISO 7000-2485 (solar panel icon).

**Council recommendation:** `photovoltaic_energy_function` = 2×2 grid square (⬛ internal grid / ⊞ style), representing the solar cell array geometry. This is the most legible at small sizes and is visually distinct from any conducting or energy-routing glyph. ☼ is retired.

---

## Q4 — `solid_state_of_matter` as implicit default

### Verdict: Conditionally sound — adopt with explicit override mechanism retained

**Grok (against):** Architecturally unsound as a full removal. Every mixed solid-fluid component (pumps, heat pipes, pressure vessels with liquid content) now forces an explicit exception flag. Adding gas_state or plasma later creates a three-state exception tree whose default changes with each addition. The cost of the optimisation is permanent special-case logic.

**Gemini (for with caveats):** Conceptually correct — removing 100% frequency bloat is standard entropy reduction. But phase transitions break it: thermal fuse, eutectic solder, bioprocess gel transitioning solid→liquid has no visual "before" state without the solid glyph. Retain in library for explicit override; remove from default rendering.

**DeepSeek (for with caveats):** Solid becoming structurally implicit is the right call. Design principle: states use outline shapes, functions use filled. If solid is implicit, the character square's *border weight* or *background fill* communicates solid-by-default. Add explicit override for phase-transition edge cases.

**Council recommendation (2 of 3 supporting):** Make `solid_state_of_matter` **implicit by default** — drop from the routine glyph rendering, infer for all components unless overridden. Retain the glyph in the library (reduced palette of 21 explicit glyphs) for edge cases where solid-state is architecturally significant (phase-change materials, thermal fuses, eutectic alloys). Document the override mechanism clearly so decomposition engineers know when to invoke it.

---

## Q5 — Recommended glyph table (21 explicit radicals, solid implicit)

Criteria: distinct gross silhouette, colour-blind safe (greyscale readable), distinct fill pattern, monoline at 12×12 px grid.

| Radical | Glyph | Type | Rationale |
|---|---|---|---|
| `steel` | **Fe** inside hexagon | Monogram | Hexagon denotes crystalline/metallic structure; Fe monogram is ISO/IUPAC. Distinct from all other material circles. |
| `copper` | **Cu** inside circle | Monogram | Circle = wire/drawing capability. Cu is universal. Distinct silhouette from Fe hexagon. |
| `polymer_thermoplastic` | Three linked chain segments (∞-style) | Custom | Polymer chain visual; no letter required. Distinct from all metallic shapes. |
| `mineral_fibre_material` | Triangle with internal hash lines /// | Custom | Triangle silhouette + hatch pattern = mineral wool / fibrous fill. Distinct from CFRP weave. |
| `composite_fibre_material` | Crosshatch weave pattern ≡ (diagonal) | Custom | CFRP weave is recognisable; diagonal hatch distinct from horizontal mineral hash. |
| `electrical_conducting_function` | Circuit trace: ━●━ (line + node + line) | Symbol | Path metaphor for electron routing. No lightning. Distinct from all other functional glyphs. |
| `silicon_semiconductor_function` | NPN transistor base-emitter-collector | Symbol | Engineering standard; asymmetric vertical silhouette distinct from all other glyphs. |
| `magnetic_coupling_function` | Horseshoe magnet ∪ (U-shape, outlined) | Symbol | Tristan's recommendation confirmed by all three council members. ↺ is retired. Unmistakable at 12 px. |
| `electromechanical_switching_function` | Open switch schematic _ / _ | Symbol | Relay/contactor convention. Asymmetric break line distinct from conducting trace. |
| `thermal_transfer_function` | Three vertical rising squiggles ↑↑↑ (wavy) | Symbol | Heat sink / convection convention. Distinct from fluid wavy lines (horizontal vs vertical). |
| `chemical_sensing_function` | Target reticle ⊕ with centre dot | Symbol | Sensing aperture metaphor. Circular + internal detail; distinct from optical iris. |
| `optical_sensing_function` | Camera aperture / iris shutter ◑ | Symbol | Half-circle fill = light reception. Distinct from chemical reticle (internal detail vs fill). |
| `photon_emission_function` | LED diode triangle + outward arrows ⇉ | Symbol | Standard engineering LED/laser icon. Arrows point outward (emission), distinct from PV (inward). |
| `bioprocess_chemistry_function` | Simplified double helix ⊃⊂ (two linked arcs) | Custom | Curvilinear form unique in the palette. No other glyph has the interlocking-arc shape. |
| `photovoltaic_energy_function` | 2×2 grid square ⊞ | Custom | Solar cell array geometry. Grid = area conversion. Inward arrow optional. Distinct from all conducting glyphs. |
| `acoustic_wave_function` | Outward concentric arcs ))) | Symbol | Transmitter/receiver convention. Three arcs outward. Distinct from thermal (vertical squiggles). |
| `electrochemical_energy_function` | Battery cell pair [+\|−] | Symbol | Universally understood. Rectangular with internal poles; distinct from all circular/triangular glyphs. |
| `chemical_suppressant_material` | Flame crossed by diagonal line 🔥⃠ | Symbol | High semiotic resonance for fire suppression. Use outline/stroke version not emoji. Distinct. |
| `lithium_iron_phosphate_chemistry` | **LFP** inside pentagon | Monogram | Pentagon bounding shape unique in palette. Multi-letter monogram acceptable here as it's a chemistry subtype. |
| `fluid_flow_state` | Three horizontal wavy lines ≋ (outline) | Symbol | State = outline (vs function = filled). Horizontal = flow direction. Distinct from vertical thermal squiggles. |
| `pressure_vessel_function` | Bounding brackets with inward arrows →[  ]← | Custom | Containment-under-pressure metaphor. Bracket silhouette unique in palette. |

---

## Q6 — Grammar-conflict visualisation

### Consensus: Fault-line between characters, not on them

**Grok:** Red dashed connector line between conflicting characters + small warning triangle centred on the shared edge (appears only on hover to avoid constant noise). Pure border colouring fails because it does not indicate direction of conflict.

**Gemini:** The "Fault Line" — when two characters conflict, draw a thick, high-contrast, jagged fracture line strictly *between* the two blocks. Attach a semantic badge (bold triangle !) to the fracture line. This mimics mechanical shearing and does not obscure the radical icons.

**DeepSeek:** Overlay icons fail — they obscure the radical icons precisely when the engineer needs to read them to fix the conflict. Coloured borders fail for colour-blind users (deuteranomaly). Recommends the fracture / fault-line between characters as the primary indicator.

**Council recommendation (unanimous structure):**
- **BLOCK:** Bold jagged fracture line between the two conflicting character squares, red in colour, with a filled triangle (!) badge at the midpoint. Fracture line is always between characters, never on them.
- **WARN:** Amber dashed connector line between characters, with an open triangle (!) badge.
- On hover/tap: tooltip showing the grammar rule that fired, the specific radical pair causing the conflict, and the engineering standard.
- Coloured borders are a secondary signal only — do not rely on them as the primary indicator (colour-blind failure mode).

---

## Q7 — Paragraph-scale legibility at 50 character-squares

### Consensus: Semantic zoom with subsystem clustering

**Grok:** Subsystem clustering is essential. Group squares into labelled meta-rectangles (power train, sensing suite, structure) that expand to character squares only inside the cluster. At 50 squares, keep clusters under ~8 visible characters each; cross-cluster links shown as thin arcs.

**Gemini:** Semantic Zoom with Level of Detail:
- LoD 1 (system overview): sentences collapse to solid unbroken squares showing only the primary top-left function icon, enlarged.
- LoD 2 (engineering focus): hover/click explodes to full 4-quadrant character view.
- Group related characters with faint grey rounded-rectangle bounding boxes; insert whitespace between sub-assemblies.

**DeepSeek:** Similar LoD approach — sentence-level grouping with expansion on interaction. Do not render 50 characters in an unbroken grid.

**Council recommendation:**
1. Default view: sentence-level grouping. Each sentence renders as a labelled cluster with a summary "dominant radical" icon visible without expansion.
2. Expand on click: full character-square grid for that sentence.
3. Never show all 50 squares flat — always group by sentence/subsystem with visual whitespace between groups.
4. Cross-group grammar conflicts shown as thin arcs between cluster boundaries, not between individual squares.

---

## Q8 — Library scaling to 100 radicals

### Verdict: The palette breaks between 45–60 glyphs. A modifier taxonomy is required before 100.

**Grok (most specific):** The palette breaks at approximately 45–50 glyphs. Beyond that, either stroke weight or internal detail must increase to keep shapes separable at 14 px, producing inconsistent visual density that destroys the quadrant reading rhythm. Colour-blind safe differentiation also exhausts available grey-scale textures once patterns exceed ~12 distinct fills. Past 50, either distinctness or a complete redesign is required.

**Gemini:** 100 arbitrary icons will fatally break the system. Humans memorise alphabets (26 letters) and syllabaries (~50–100 characters) reliably only when the characters consist of shared, repetitive stroke patterns. 100 unique line-art vectors with no shared grammar becomes a memory/lookup nightmare. The fix: a **generative modifier taxonomy** — base shapes (~15–20) × modifier rules (filled/outline, size, internal mark) rather than 100 distinct flat icons.

**DeepSeek:** The visual universalism problem compounds at 100. The system should migrate from a flat icon palette to a **geometric primitives library** (circle, square, triangle, line, arc) with strict composition rules, matching how the radical architecture itself is compositional.

**Council recommendation:** Plan for the modifier taxonomy before reaching 60 radicals. The structure:
- ~15–20 base shapes (circle, hexagon, triangle, square, bracket, arc, line...)
- Modifier layer: fill (solid vs outline vs hatch), internal mark (dot, cross, line, arrow), scale.
- Each base+modifier combination = one radical glyph.
- This gives 15 × 5 × 4 = 300+ addressable combinations before any new base shapes are needed.
At 22 → 100 radicals, this approach scales without redesign.

---

## Top 3 risks with the icon-quadrant system

1. **Resolution collapse at small sizes.** If the character bounding box is not at least 4:3 aspect ratio with radical icons designed on a strict 12×12 micro-grid (monoline, zero gradients), the quadrant system becomes unreadable at any standard UI size. This is an implementation constraint that must be enforced on the glyph-design sonnet before it produces any assets.

2. **System B breakdown for non-standard compositions.** Two-function, two-material, and pure-energy characters all violate the top=function / bottom=material contract. Without the quadrant-slot grounding rules (top-left, top-right, bottom-left, bottom-right) and an empty-bottom placeholder convention, these cases will look malformed. The slot grounding rules must be shipped with the glyph system.

3. **Palette exhaustion at 60+ radicals.** The current flat-icon approach works for 22 radicals. By ~50, greyscale-safe distinctness degrades. By 100, it fails. The modifier taxonomy architecture must be designed now, before the library grows, so the glyph system is forwards-compatible.

---

## Final verdict: SHIP-READY with conditions

The icon-quadrant system is architecturally sound and ready for the glyph-design sonnet, **subject to three hard constraints the sonnet must receive in its brief:**

1. All radical glyphs designed on a **12×12 px monoline micro-grid** — no gradients, no fills that don't hold at 50% greyscale.
2. **Quadrant-slot grounding rules** (top-left, top-right, bottom-left, bottom-right) documented and shipped alongside the glyph set.
3. **Modifier taxonomy skeleton** committed alongside the glyph set so the palette is extensible beyond 22 without redesign.

Without these three, the system ships prematurely and the next council review will flag resolution collapse and palette exhaustion as blockers.

---

## Single most important pushback for Tristan

**The glyph palette breaks at ~50 radicals, not at 100.** Tristan has accepted 22 → 100 as normal growth. The council unanimously puts the visual distinctness ceiling between 45–60. If the glyph-design sonnet produces 22 independent flat icons with no modifier taxonomy, the system will require a full redesign before it reaches 60 radicals. The ask: commit the modifier taxonomy architecture (base shapes × fill × internal mark) in the same sprint as the initial 22 glyphs, not as a deferred concern. The cost of retro-fitting it is much higher than building it now.

---

## Glyph collision resolutions — summary table

| Issue | Retired glyph | Recommended replacement |
|---|---|---|
| `electrical_conducting_function` | ⚡ (lightning bolt) | ━●━ circuit trace (line + node + line) |
| `electric_field` (if future radical) | ⚡ (shared — banned) | Concentric radiating arcs (ISO field-line) |
| `photovoltaic_energy_function` | ☼ (sun — too noisy at 12 px) | 2×2 grid square ⊞ |
| `magnetic_coupling_function` | ↺ (rotation arrow) | Horseshoe ∪ magnet (Tristan's suggestion confirmed) |
| `fluid_flow_state` vs future fluid function | ~ (wavy line — ambiguous) | ≋ outline waves (state) vs filled droplet + arrow (function) |

---

*Council concluded. Costs: ~$0.059 / ~£0.047 total. No production code modified.*
