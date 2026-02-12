# CAD Lab Pipeline V2 — Handover for Claude Code

**Date:** February 12, 2026  
**Commit:** `63095ca` on `main`  
**Deployed:** Vercel (production, verified ready)  
**Task:** Make the component-decomposed CadQuery pipeline produce quality models  

---

## Project Root

```
/Users/tristanfischer/Developer/CentaurOS created 260126 1435/
```

This is a Next.js 16 + Supabase + Tailwind project ("ForgeOS"). The CAD Lab is one feature inside it.

---

## File Map — Every File You Need

```
/Users/tristanfischer/Developer/CentaurOS created 260126 1435/
│
├── src/
│   ├── actions/
│   │   └── cad-lab.ts                    ← MAIN FILE: Pipeline orchestrator (1061 lines)
│   │                                       Pass 0-N+2 pipeline, Gemini calls, local validation,
│   │                                       Modal execution, post-execution checks
│   │
│   ├── lib/
│   │   └── cad-lab-types.ts              ← Shared types + GEMINI_MODELS constant (48 lines)
│   │                                       Separated from cad-lab.ts because "use server" files
│   │                                       turn exports into server action proxies on the client
│   │
│   └── app/
│       ├── (platform)/the-forge/cad-lab/
│       │   └── page.tsx                  ← Primary UI page (481 lines) — behind auth
│       │                                   Route: /the-forge/cad-lab
│       │
│       └── cad-lab/
│           └── page.tsx                  ← Legacy UI page (481 lines) — no auth, same code
│                                           Route: /cad-lab
│
├── modal_cad_worker.py                   ← Modal serverless worker (595 lines)
│                                           Executes CadQuery code, exports STEP/STL/SVG
│                                           Deployed separately on Modal.com
│
├── .env.local                            ← Environment variables (DO NOT commit)
│                                           GOOGLE_AI_API_KEY, MODAL_CAD_ENDPOINT_URL
│
├── experiments/                          ← Previous experiment output (gitignored)
│   └── output_v4/drone/
│       ├── drone.py                      ← V4 AI-generated (no fillets)
│       └── drone_with_fillets.py         ← V4 + manual fillets (best pre-V2 result)
│
├── drone_output/                         ← Reference drone code (gitignored)
│   └── drone_v2.py                       ← Human-authored "gold standard" (~750 lines)
│
└── AGENT_HANDOVER.md                     ← THIS FILE
```

### Files NOT to touch (production pipeline — separate from CAD Lab)

```
src/app/(platform)/the-forge/services/cad-generator.ts   ← Production CAD (old pipeline, separate)
src/app/(platform)/the-forge/services/cad-parameters.ts  ← Production params
```

---

## What Was Built (Current State)

The pipeline follows your corrected architecture exactly:

```
Pass 0: REFERENCE DIMENSIONS (hardcoded in DRONE_REFERENCE constant)
  → Motor Ø28×13mm, prop 127mm dia, motor diagonal ~302mm, etc.
  
Pass 1: INTERFACE DEFINITION (Gemini 2.5 Pro, text only)
  → Space budget, component placement table, derived constraints,
    validation arithmetic, structured JSON block
  → Gate: motor diagonal within 5mm of 302mm, BBox in range, no overlaps
  → Up to 2 retries with error feedback

Pass 2-N: COMPONENT FUNCTIONS (parallelized via Promise.allSettled)
  → One Gemini call per component (uses Flash for cost)
  → Full interface definition as context (not just the component's row)
  → Template-based: must start with cq.Workplane("XY"), return Workplane
  → Local AST/regex validation (no Modal call per component)
  → Safety-net strips .rotate()/.translate() and LOGS when it fires
  → 2 retries per component; failures skip gracefully

Pass N+1: ASSEMBLY SCRIPT (Gemini 2.5 Pro, single call)
  → Gets ALL validated function code (complete, not just signatures)
  → Output is union-only — no new geometry creation
  → Safety-net strips banned ops from assembly too

Pass N+2: MODAL EXECUTION (single call)
  → Sends complete Python script to Modal
  → Returns STEP, STL, SVG views, mass properties, BBox
  → Post-execution validation: BBox in range, fill <15%, STEP >500KB
  → Warnings logged but model still returned
```

### What was dropped from V1

| V1 Approach | Status | Reason |
|-------------|--------|--------|
| Two-pass base+refine | **Dropped** | Refinement adds complexity to fragile code |
| 13 "NEVER" rules | **Dropped** | Replaced with positive template + short "avoid" list |
| Per-component Modal validation | **Dropped** | Too slow. Local AST/regex check sufficient |
| Fillet ban | **Reversed** | Fillets allowed on components before union, ≤3mm |
| Helper function ban | **Reversed** | Functions are now the core architecture |
| Regex code cleaning | **Kept** | But logs when it fires. Frequent = prompt is broken |

---

## How to Test

```bash
# Start dev server
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
npm run dev

# Open CAD Lab (no auth needed on legacy route)
open http://localhost:3000/cad-lab

# Or the platform route (requires login)
open http://localhost:3000/the-forge/cad-lab

# Click "Generate CAD Model" — takes ~35-40s
# Check: Pipeline Summary shows all stages green
# Check: SVG views show recognizable quadcopter
# Check: BBox should be ~400-500mm X, ~300-400mm Y, ~80-150mm Z
# Check: Fill ratio should be 1-8% (not 99%)
```

### Environment Variables (in .env.local)

```
GOOGLE_AI_API_KEY=...     ← Google AI API key (working)
MODAL_CAD_ENDPOINT_URL=...← Modal CadQuery endpoint (working)
```

Verify they exist:
```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log('Google:', !!process.env.GOOGLE_AI_API_KEY, 'Modal:', !!process.env.MODAL_CAD_ENDPOINT_URL)"
```

---

## Modal Worker Behavior (CRITICAL)

The Modal worker (`modal_cad_worker.py`) has specific behavior you must know:

1. **Variable discovery:** It searches `locals()` for the LAST `cq.Workplane` object. The generated code must end with `result = make_...()` so that `result` is the final Workplane in scope.

2. **Partial results:** If code crashes partway, Modal still returns whatever Workplane it finds. A "success" can be a partial model. Always check BBox and fill ratio.

3. **Blocked patterns:** Modal blocks `import os`, `import subprocess`, `open()`, `exec()`, etc. Our generated code must not include these.

4. **Export template:** Modal injects its own export wrapper after the user code runs. It handles STEP, STL, SVG export and mass property analysis. The generated code should NOT include `cq.exporters` calls.

---

## What "Good" Looks Like

| Metric | Target | Current Best (V1) | V2 Expected |
|--------|--------|-------------------|-------------|
| BBox X | ~467mm | 337mm | ~400-500mm |
| BBox Y | ~370mm | 376mm | ~350-400mm |
| BBox Z | ~111mm | 75mm | ~80-150mm |
| Fill ratio | 1-5% | 3.1% | 1-8% |
| STEP size | 500KB-4MB | 1MB | 500KB-2MB |
| Code lines | 500-1000 | 546 | 400-800 |
| Crashes | 0% | ~50% | <10% |

A **solid block** (99% fill) = geometry failed (cuts/hollowing didn't work).
A **tiny model** (<200mm BBox) = arm positions wrong or components missing.
A **crash** ("No Workplane found") = generated code has syntax/runtime error.

---

## Key Functions in cad-lab.ts

| Function | Lines | Purpose |
|----------|-------|---------|
| `callGemini()` | ~40 | Low-level Gemini API call, returns raw text |
| `extractCode()` | ~10 | Strips markdown fences from response |
| `executeOnModal()` | ~25 | Sends code to Modal, returns exports + analysis |
| `generateInterfaceDefinition()` | ~30 | Pass 1: text-only engineering plan |
| `parseInterfaceDefinition()` | ~35 | Extracts JSON block from interface text |
| `validateInterfaceDefinition()` | ~40 | Checks motor diagonal, BBox range, dimensions |
| `generateSingleComponent()` | ~60 | Pass 2-N: one component with retries |
| `validateComponentLocally()` | ~50 | AST/regex check, safety-net stripping |
| `generateAssemblyScript()` | ~50 | Pass N+1: union-only assembly |
| `postExecutionValidation()` | ~25 | BBox/fill/STEP size checks |
| `generateCadLabModel()` | ~180 | Main orchestrator (exported server action) |

---

## CadQuery Patterns That Work (Reference)

```python
# Positioning (SAFE)
cq.Workplane("XY").workplane(offset=z).transformed(offset=(x, y, 0)).box(w, d, h)

# Orientation (SAFE — instead of .rotate())
cq.Workplane("XY").transformed(rotate=(0, 0, 45)).box(w, d, h)

# Hollow containers (SAFE)
outer = wp.box(100, 50, 30)
inner = wp.workplane(offset=wall).box(100-wall*2, 50-wall*2, 30)
result = outer.cut(inner)

# Pipes (SAFE)
wp.circle(od/2).circle(od/2 - wall).extrude(length)

# Fillets (SAFE — on simple shape BEFORE union, ≤3mm)
part = wp.box(50, 30, 20).edges(">Z").fillet(2)
assembly = assembly.union(part)
```

### NEVER use these (they crash Modal)

```python
body.rotate(...)        # use .transformed(rotate=...) instead
body.translate(...)     # use .transformed(offset=...) instead
body.mirror(...)        # build mirrored version explicitly
cq.Workplane("YZ")     # use .transformed(rotate=(0,90,0)) instead
cq.Compound.makeCompound(...)
cq.Solid.makeLoft(...)
wp.loft(...)
wp.sweep(...)
```

---

## Build & Deploy

```bash
# Type check (pre-existing errors in other files — ignore those, ours are clean)
npx tsc --noEmit 2>&1 | grep cad-lab  # should be empty

# Build
npm run build  # ~4-5 minutes for full project

# Deploy (push to main triggers Vercel auto-deploy)
git add .
git commit -m "fix(cad): description"
git push origin main

# Check deployment
vercel ls  # should show ● Ready within 2-3 minutes
```

---

## What to Work On Next

1. **Run the pipeline and evaluate output quality.** Generate a drone, look at the SVGs, check BBox/fill. The V2 pipeline has never been tested end-to-end with real Gemini calls yet — we deployed the architecture but haven't verified output quality.

2. **Tune the prompts based on actual results.** If BBox is too small, the interface definition prompt needs stronger motor diagonal constraints. If components crash, check which ones and why — the safety-net log will show what got stripped.

3. **Tune the reference library.** `DRONE_REFERENCE` in `cad-lab.ts` has the specs. If dimensions are wrong, update them based on real product data.

4. **Consider making the reference library dynamic.** Currently hardcoded for drones. For other products, either add more entries to the library or use a web search Pass 0.
