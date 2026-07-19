# Cursor Review — Functional-Form Solver Implementation

**Date:** 2026-07-18 ~15:15 BST  
**Authority:** Claude terminal owns implementation; Cursor reviews/advises  
**Reviewed commits:** `7d2ed61fd`, `27931d6be`

## Verdict

Strong first scaffold:

- pure/deterministic;
- refuses silent generic form when no medium is known;
- EWOD/generic-box/missing-grid/wrong-transport proveCatch passes;
- geometry-plan bridge exists;
- no Blender/Excel coupling yet;
- selftest is green.

It is **not yet convergent evolution**. It is currently:

```text
7 working-medium signals
  → 7 hardcoded medium/form rows
  → 2 candidate orderings
  → 2 implemented cull checks
  → always prefer axis-order
  → hardcoded percentage geometry
```

Treat it as Phase 0 contract/layout scaffolding, not a completed solver.

---

## Urgent process issue

Multiple `serial-design-chain-v2.tsx` process trees are concurrently writing:

```text
out/openflexure-20260718-1236
```

Observed several parent/child npm/node chains plus Blender. This repeats the
previous same-output state corruption hazard.

Recommendation:

1. keep one owning chain PID tree;
2. stop duplicate descendants/siblings;
3. verify output timestamps/state ownership;
4. enforce one lock per `out/` directory.

Do this before more cold-run interpretation.

---

## Required solver improvements before Blender integration

### 1. Rename current proof

Current `compose_form()` emits intent/plan data, not delivered proof.

Rename conceptually:

```text
form-plan/v1
```

Reserve:

```text
form-proof/v1
```

for measurements from actual Blender objects and rendered visibility.

Why: otherwise state intent can again masquerade as delivered evidence.

### 2. Add relations and physical fields

`FunctionalFormContract` currently has roles but no relation graph.

Add:

```py
relations: list[FormRelation]
fields: list[PhysicalField]
hard_constraints: list[FormConstraint]
manufacturing: ManufacturingGrammar
```

Required examples:

- source/sample/detector collinearity;
- stir motor below vial;
- OD source and detector on opposite sides;
- objective below stage, condenser above;
- HV domain separated from controls;
- sample visible/access direction.

### 3. Expand repeated roles structurally

Current `repeated_count` is not consistently applied.

Known gaps:

- electrochemical form needs WE/RE/CE leads, not one `electrode_leads` role;
- vial form needs separate OD source + detector, not one `od_sensors` role;
- microscope needs three actuator placements when `stage_axis_count=3`;
- EWOD needs electrode count/matrix dimensions represented;
- syringe repetition is the only substantially expanded family.

Add:

```py
expand_repeated_roles(contract) -> list[RoleVolume]
```

before candidate generation.

### 4. Generate real candidate diversity

Two candidates are insufficient for evolutionary search.

Add deterministic, topology-preserving operators:

```text
mirror
axis rotate
adjacent role swap where legal
cluster tighten
hazard separation
HMI visibility move
connector service-face move
open sample access
shell-wrap subset
```

Seed RNG from canonical state hash, then generate 20–64 candidates.

Same input must remain byte-identical.

### 5. Implement all documented hard feasibility rules

`cull_infeasible()` documents F2 access but does not implement it.

Add measured checks:

- required relation closure;
- access direction/order;
- role collision;
- hazard separation;
- field alignment;
- envelope bounds;
- minimum human clearances;
- channel count;
- authentic geometry availability.

Return named failures per candidate instead of silently dropping it.

### 6. Replace fixed selection with Pareto/lexicographic fitness

`select_best()` currently always picks `axis-order`.

Add fitness dimensions:

```text
field alignment margin
access margin
hazard separation
wiring/tubing length
service extraction path
envelope volume
manufacturing part count
operator visibility
```

Hard failures remain binary. Use Pareto/lexicographic selection among survivors.

### 7. Reduce hardcoded geometry percentages

Current planners use many constants such as `W*0.66`, `D*0.62`, `H*0.4`.

Derive dimensions from:

- role component dimensions;
- interface pitches;
- channel counts;
- human access;
- hazard/thermal clearances;
- manufacturing wall thickness.

Envelope should be an output when the brief does not pin it, not always an input
that roles are squeezed into.

### 8. Correct specific field geometry

- optical source currently has a different Y from sample/detector: measure true collinearity;
- OD source/detector must be opposite each other around the vial;
- EWOD cartridge/grid dimensions must come from electrode count/pitch;
- microscope actuators must couple to compliant paths;
- electrochemical leads must be three distinct interfaces.

### 9. Product-class fallback must not mint a full PASS

`_derive_working_medium()` falls back to `product_class`.

Keep it as recovery evidence, but mark:

```text
medium_basis = fallback
confidence = low
readiness ≤ ENGINEERING_DRAFT
```

until a functional quantity/topology signal exists.

### 10. Delivered proof after Blender

Blender should tag each generated object:

```text
functional_role
candidate_id
geometry_source
material_role
```

Then measure:

- actual object transforms/bounds;
- relation errors;
- clearances/collisions;
- field spans;
- projected pixel area and occlusion;
- role visibility in product camera.

Only that output may be `form-proof/v1`.

---

## Recommended next work block

Before wiring `build_universal_scene.py`:

1. add relation/field dataclasses;
2. expand repeated roles;
3. implement named feasibility findings;
4. generate ≥20 deterministic candidates;
5. add Pareto/lexicographic fitness;
6. add fixtures for all seven media;
7. prove same-state byte identity;
8. prove current known-bad mutations fail.

Do not wire Excel until actual Blender `form-proof/v1` exists.

---

## Additional proveCatch cases

```text
EWOD 64 electrodes but grid capacity <64 → fail
potentiostat lead count <3 → fail
bioreactor OD source/detector same side → fail
microscope stage_axis_count=3 but actuator count=1 → fail
optical source/sample/detector angular error > tolerance → fail
sample role buried opposite access direction → fail
high-voltage and HMI roles overlap → fail
required role fully occluded in product camera → fail
fallback product_class with no functional signal → draft, not pass
```

