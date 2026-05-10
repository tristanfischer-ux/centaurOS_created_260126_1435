# Quadrant Composition Rules — ForgeOS Radical Glyph System

**Version:** v0 (2026-05-10)  
**Council mandate:** System B (function-top, material-bottom) with explicit slot grounding and fall-through rules.

---

## Character Square Anatomy

A character square is a fixed-aspect-ratio bounding box containing up to 4 radical glyphs,  
arranged in a 2×2 grid. The 4:3 aspect ratio minimum (width:height) ensures each quadrant  
is at least 12×12 px at standard UI rendering sizes.

```
┌──────────────┬──────────────┐
│  TL          │  TR          │
│  Primary     │  Secondary   │
│  Function    │  Function /  │
│              │  State       │
├──────────────┼──────────────┤
│  BL          │  BR          │
│  Primary     │  Secondary   │
│  Material /  │  Material /  │
│  Substrate   │  Coating /   │
│              │  Containment │
└──────────────┴──────────────┘
```

---

## Default System B — Slot Semantics

| Slot | Label | Semantic |
|---|---|---|
| Top-left (TL) | Primary function | The dominant action or conversion the component performs |
| Top-right (TR) | Secondary function OR state | A secondary action, or the state of matter if no second function |
| Bottom-left (BL) | Primary material / substrate | The dominant structural or chemical material |
| Bottom-right (BR) | Secondary material / coating / containment | Dopant, surface treatment, encapsulant, or containment medium |

---

## Edge Cases and Fall-Throughs

### Two-function character (e.g. photon_emission + optical_sensing)

Both function radicals go top row: primary to TL, secondary to TR.  
Bottom row holds material radical(s) as normal.  
If no material radical exists, bottom row shows the empty-row placeholder (faint dash).

### Two-material character (e.g. steel + composite_fibre_material)

Both material radicals go bottom row: primary to BL, secondary to BR.  
Top row holds function radical(s) as normal.

### Pure energy / pure function character (no material radical)

Top row: function radicals as normal.  
Bottom row: **empty-row placeholder** — a faint horizontal dash centred in each bottom quadrant.  
This confirms "substrate agnostic" rather than rendering blank dead space.

### Pure material character (no function radical, e.g. a stock material swatch)

Bottom row: material radicals.  
Top row: empty-row placeholder.

### Single radical (1-quadrant character)

Radical occupies TL only. All other quadrants are empty-row placeholder.

### Two-radical character

Populate TL + BL by preference (one function, one material).  
If two functions: TL + TR. If two materials: BL + BR.

---

## Compression Rule for >4 Radicals

When a character requires 5 or 6 radicals (rare; typically complex systems):

- **5 radicals:** Force into a 2×3 grid (2 columns, 3 rows). The additional row sits below the standard bottom row. Each cell is 12×12 px minimum.
- **6 radicals:** Force into a 3×2 grid (3 columns, 2 rows) or 2×3 — choose whichever keeps function radicals separated from material radicals in the same spatial layer.
- **More than 6 radicals:** This is a composition error. Split the character into two characters at the archetype level.

---

## Empty-Row Placeholder Convention

When a row has no radicals to fill, render a faint centred dash (—) in each empty quadrant.  
The dash is drawn at 20% opacity relative to the character square border.  
Purpose: confirms intentional vacancy vs rendering error.

---

## Quadrant Corner Role Mark (DeepSeek extension, optional in v0)

Each quadrant corner may carry a tiny shape (3×3 px) indicating the radical's ontological category,  
independent of position. This provides an escape valve for non-conformant compositions.

| Corner mark | Category |
|---|---|
| Filled square ■ | Material |
| Filled circle ● | Function |
| Open triangle △ | State of matter |
| Open diamond ◇ | Containment / enclosure |

In v0, corner marks are optional and rendered only when a composition deviates from the standard  
System B slot contract (i.e. a function radical appears in a bottom slot by necessity).

---

## Grammar Conflict Rendering

Conflicts are rendered **between** character squares, not on them.

| Severity | Visual | Badge |
|---|---|---|
| BLOCK | Bold jagged fracture line between squares, red (#C0392B) | Filled red triangle (!) at midpoint |
| WARN | Amber dashed connector between squares (#E67E22) | Open triangle (!) at midpoint |

- On hover: tooltip showing grammar rule name, radical pair causing conflict, engineering standard.
- Coloured borders on the conflicting squares are a **secondary signal only** — not the primary indicator.  
  This ensures the system is legible for users with deuteranomaly (red-green colour blindness).

---

*These rules govern every character square rendered in ForgeOS PDF Engine v2.*  
*Deviations require a council note in the commit that introduces them.*
