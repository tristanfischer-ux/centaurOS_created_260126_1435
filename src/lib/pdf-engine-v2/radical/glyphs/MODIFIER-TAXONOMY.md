# Modifier Taxonomy — ForgeOS Radical Glyph System

**Version:** v0 (2026-05-10)  
**Council mandate:** commit alongside initial 22 glyphs so the palette is extensible to 100+ without redesign.

---

## Rationale

A flat library of 22 unique icons begins to lose greyscale-safe visual distinctness around 45–50 glyphs.  
Beyond 60, the system requires a full redesign unless a generative modifier taxonomy is in place.  
This taxonomy provides **300 addressable combinations** from 15 base shapes × 5 fills × 4 internal marks,  
all designed to be mutually distinct at 12×12 px monoline rendering.

---

## Layer 1 — 15 Base Shapes

Each shape is the primary silhouette of the glyph, readable at 12 px as a gross outline.

| # | Shape ID | Description | Radical class examples |
|---|---|---|---|
| 1 | `hexagon` | Regular 6-sided polygon | Metals (Fe, Cu, Al) |
| 2 | `square` | Regular 4-sided box | Semiconductors, switching functions |
| 3 | `circle` | Round outline | Wire/conducting paths, optical |
| 4 | `triangle-up` | Equilateral, apex up | Diodes, emission, directed energy |
| 5 | `triangle-down` | Equilateral, apex down | Derating, reduction, convergence |
| 6 | `diamond` | 45°-rotated square | Hazard, chemistry, sensing |
| 7 | `pentagon` | 5-sided polygon | Chemistry subtypes (LFP) |
| 8 | `octagon` | 8-sided polygon | Safety/stop functions |
| 9 | `droplet` | Teardrop/droplet silhouette | Fluid, chemical, bioprocess |
| 10 | `wave` | Sinusoidal band | Acoustic, fluid states |
| 11 | `lightning` | Stepped diagonal bolt | High-voltage, arc |
| 12 | `gear` | Toothed wheel | Mechanical actuation |
| 13 | `magnet-U` | Open U / horseshoe | Magnetic coupling |
| 14 | `lens` | Double-convex lens (vesica) | Optical sensing, photon emission |
| 15 | `bracket` | Containment bracket [ ] | Pressure vessels, containment |

---

## Layer 2 — 5 Fills

Fill is the secondary distinguisher — applied uniformly inside the base shape boundary.  
All fills are greyscale-safe and hold at 50% scale.

| # | Fill ID | Description | Semantic meaning |
|---|---|---|---|
| 1 | `outline` | Stroke only, no fill | State of matter, passive |
| 2 | `solid` | Fully filled (black at monochrome) | Active function, primary material |
| 3 | `hatch-diagonal` | 45° diagonal lines `///` at ~3px pitch | Composite, fibrous, reinforced |
| 4 | `grid` | Horizontal + vertical cross-hatch `#` | Array, multi-cell, semiconductor fab |
| 5 | `dotted` | Evenly spaced dots 3×3 pattern | Chemical/molecular, diffuse |

---

## Layer 3 — 4 Internal Marks

The internal mark is the tertiary distinguisher — a small symbol rendered at the centre of the base shape.  
At 12×12 px the mark occupies roughly a 4×4 px zone.

| # | Mark ID | Description | Semantic meaning |
|---|---|---|---|
| 1 | `monogram` | 1–3 letter chemical symbol (Fe, Cu, Si, Al, Cm, P, E) | IUPAC material identity |
| 2 | `icon` | Small geometric primitive (cross, dot, arrow, arc, coil) | Function metaphor |
| 3 | `polarity` | Polarity pair (+/−) or single pole | Electrochemical, charged |
| 4 | `subscript` | Numeric subscript (1, 2, 3...) | Subtype within a class |

---

## Addressable Space

```
15 base shapes  ×  5 fills  ×  4 internal marks  =  300 combinations
```

Current v0 usage: 22 explicit glyphs (7.3% of available space).  
No new base shapes needed until the library exceeds ~60 well-distributed glyphs.

---

## Collision-Avoidance Rule

When adding a new glyph, verify it differs from all existing glyphs on **at least 2 of the 3 layers**.  
A new glyph that differs only on fill from an existing glyph is a collision risk at 12 px and requires  
either a different base shape or a different internal mark as a second distinguisher.

---

## Reserved Combinations (do not use)

| Combination | Reserved for |
|---|---|
| `hexagon` + `solid` + `monogram:Fe` | `steel` |
| `hexagon` + `solid` + `monogram:Cu` | `copper` |
| `hexagon` + `solid` + `monogram:Al` | `aluminium` |
| `square` + `grid` + `icon:none` | `photovoltaic_energy_function` |
| `magnet-U` + `outline` + `icon:none` | `magnetic_coupling_function` |
| `bracket` + `outline` + `icon:arrow-in` | `pressure_vessel_function` |
| `square` + `outline` + `icon:notch` | `silicon_semiconductor_function` |

---

*This taxonomy is the forward-compatibility contract for the glyph system.*  
*Do not add flat icons outside this taxonomy once the library exceeds 30 radicals.*
