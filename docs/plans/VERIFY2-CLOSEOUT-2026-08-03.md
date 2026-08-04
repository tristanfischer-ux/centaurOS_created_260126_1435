# Verify-2 closeout — what I fixed, what I found, what stays open

**2026-08-03 · Claude Code, taking over from Grok Build's verification-2.**
**Twin:** `out/formula-e-front-mgu-20260729-1432` · branch `oxccu-efuel`
**`ship_ok` still false.** No Bar B hold closed. Nothing invented.

---

## 1. First, on Grok Build's work

It found real defects and its write-up is honest about its own limits — the
"what was not checked" list is nineteen items long and includes things that
would have flattered the result had they been quietly omitted. Two corrections
after independent re-derivation:

- **S1 is real but mis-described.** The hero render is *not* "open/disassembled
  with copper windings exposed". Opening the image: the body is closed. What is
  actually wrong is a **thin bar floating in clear air** above the unit and a
  **dark slab protruding from under the plinth** — plus a general blankness
  (featureless faces, placeholder-brown blocks, no scale reference) that keeps
  it from being a flagship shot. The defect stands; the reason matters because
  it changes the fix.
- **Grok's changes did not weaken any detector.** I checked the one narrowing
  it made — `physics_plausibility` no longer fires `duty_basis_contradiction`
  when `continuous_power_kw.basis` is explicitly `intermittent_peak` — and the
  original positive proveCatch at line 331 still fires. Guards were added, not
  removed.

---

## 2. Five findings closed at source, each with a guard

Every guard has a `--selftest` with proveCatch in both directions and is
registered in `.husky/pre-commit` and `scripts/verify-engine-guards.sh`.
Four of the five proveCatch fixtures are the **real defective input**, not a
synthetic stand-in.

| # | Finding | Source fix | Guard |
|---|---|---|---|
| S12 | duty-torque denominator | `gear_oil_fia_front_kit_case.py` now imports the one canonical identity instead of re-deriving | `check_duty_torque_identity.py` |
| S5 | PCB FAB-READY banner | `_pcb_readiness_verdict` takes release state; the banner is now derived, not worded | proveCatch in the verdict fn |
| S9 | two pcb-stage stores | stale nested store retired with `superseded_by` | `check_store_divergence.py` |
| S11 | escalation stubs never retract | two stubs archived with evidence | `check_escalation_stub_freshness.py` |
| S1/S8 | vision gate cannot go red | `render_vision_critic` three-state | `check_detached_geometry.py` |

### S12 — and the thing it exposed

The trap: `119.7286 N·m` is the **delivered** shaft torque at 244.49 kW;
`125.2193 N·m` is the **duty bar**. Both correct, different quantities. One
solver published the first into a field named `required_shaft_torque_nm` while
nineteen siblings published the second, and the workbook labelled the delivered
row *"REQUIREMENT implied by the duty"*.

I did **not** change the value of `mgu_shaft_torque_nm` — Grok45's start-council
point, and it was right: overwriting 119.7 with 125.2 would recompute the ratio
as if the machine had got stronger. The rule was fixed, not the number.

The guard contains **no literal duty bar**. Sol's objection at the start council
was that hard-coding 125.2193 would make the check specific to one twin's
regen convention and could certify a wrong requirement elsewhere; every expected
value is now recomputed from each artefact's own declared power, efficiency and
speed, and a motoring fixture proves the check follows the other convention too.

**⚠ It immediately found something nobody had noticed.** The twin now publishes
**four different duty bars**:

| bar | where | speed it implies |
|---|---|---|
| **125.2149 / 125.2193** | 7 EM artefacts | 19,500 rpm |
| **101.7407** | gear-oil screen (after this fix) | 24,000 rpm |
| 119.7012 | one stale red-team digest | historical |

**DEC-009 says in its own text that it "supersedes the 19,500 rpm baseline"** —
but the duty bar was never re-derived at the adopted speed. At 24,000 rpm the
requirement for the same power *falls* to 101.74 N·m. DEC-009's headline
`torque ratio 1.069` is computed against the superseded 19,500 rpm bar.

This does not make the design look worse — it looks **better** at the adopted
speed (ratio would be ~1.32 rather than 1.069). But shipping two bars is the
defect, and **which speed the duty is specified at is a decision, not a
calculation.** I have not resolved it. See §4.

### S5 — the banner was derived from the wrong question

Every hygiene input was honest: DRC clean, routed, Gerbers present. The banner
still lied, because hygiene answers *"is this board internally consistent?"* and
the reader hears *"can I send this to a fab house?"*. The pipeline's own record
said `NOT_FABRICATION_READY=true`, `supplierGerbers=false`.

Release state now outranks hygiene. Verified three ways: fires on the live
defect (→ ENGINEERING DRAFT), silent on a genuinely released board (→ still
FAB-READY), silent when no release record exists. The flags are read-only —
this never writes `NOT_FABRICATION_READY` or `ship_ok`.

### S9 — the sixth instance of one family

`pcb-stage.json` said bespoke / 22 parts / 2 routed boards. `pcb/pcb-stage.json`
said cots-modules / 4 parts / no pipeline. Reading the nested one alone gives a
false COTS story.

The guard is written for the **family**, not this file: a registry of store
families, and any two live copies that disagree on a meaning-bearing field is a
finding. It does not delete or mirror anything — declaring a canonical file
without migrating its readers is how a stale copy keeps being read. Two design
decisions inside it are worth knowing:

- **Silence is not a claim.** A field present in one copy and absent in another
  is not a divergence, or every older schema in the repo would fire.
- **Frozen design packs are excluded.** A versioned pack is *supposed* to differ
  from today's twin — that is what a release is.

The stale store is retired with a `superseded_by` pointer and a reason, not
deleted, so the history stays readable.

### S11 — retraction had to be evidence-gated

"The gate is green now" is not sufficient evidence. The council named four ways
it can be false, and one of them bites here: **four drawings are skipped as out
of scope**, so gates scoped only to those never ran. The check therefore reports
three states — LIVE, RETRACTABLE, UNVERIFIABLE — and prints the skipped-drawing
caveat on every retraction it recommends. It reports; it never deletes.

Result on the live twin: 55 stubs → 0 live, 2 retractable, 53 unverifiable
(other product classes, no gate artefact for this twin). The two were archived
under `tasks/harness-stubs/retracted/` with their evidence.

### S1/S8 — a green tick that structurally could not go red

`vision_route_fix` **is not installed in this checkout**. The import threw
`ModuleNotFoundError` on every critique, the exception was swallowed into a
field nobody reads, and the function returned `ok=true` with an empty defect
partition — indistinguishable downstream from "the router looked and found
nothing wrong".

Fixed as three states, not two, because Sol was right that blanket-failing would
break archetypes that deliberately run without a vision backend:
`VISION_ROUTE_REQUIRED=1` + missing → `ok=False`; optional + missing → ok
survives but the partition is marked `not_run` so nothing can read absence as a
clean bill.

**Then the deterministic replacement**, because the standing rule is that checks
must not depend on a model: `check_detached_geometry.py` builds an axis-aligned
box per part from `pos_mm`/`dims_mm`, inflates by a 5 mm contact tolerance, and
takes connected components. A floating part is arithmetic, not an opinion. It
excludes the ground plane by `entity_type`, treats clearance fits as contact,
and **abstains loudly** when positions are missing rather than reporting a
connected assembly.

**⚠ And it found the real S1 root cause.** On the live twin it reports **one
connected component — clean**. But the render clearly shows a floating bar. So:

> **`parts-manifest.json` holds 57 parts. `form-meshes.json` holds 194 meshes.
> The floating bar is in the scene and not in the manifest.** The manifest is
> not a faithful description of what gets rendered — which is why every
> manifest-based gate can pass while the image is wrong.

That is the "two stores" family again, in the render pipeline, and it is the
reason S1 exists.

---

## 3. Verification

```
scripts/lib/check_duty_torque_identity.py       --selftest   OK
scripts/lib/check_store_divergence.py           --selftest   OK
scripts/lib/check_escalation_stub_freshness.py  --selftest   OK
scripts/lib/check_detached_geometry.py          --selftest   OK
scripts/motor-stack/gear_oil_fia_front_kit_case.py --selftest PASS
bash scripts/verify-engine-guards.sh                         PASS
```

On the live twin, after the fixes: store-divergence **0 findings**,
stub-freshness **0 retractable**, detached-geometry **1 component**,
duty-torque-identity **1 finding** — the speed-basis split, deliberately left
firing because it is a decision, not a defect I should close.

---

## 3b. What the finish council found in *my* work

Three real defects, all fixed in the same block:

**The winding temperature is a copy of the magnet temperature.** `mgu_winding_temp_c`
and `mgu_magnet_temp_c` both read exactly **99.4 °C** while 2,180 W of copper
loss is dissipated in the winding, across a non-zero magnet-to-winding
resistance (0.05 K/W is in the screen's own inputs). That is physically
impossible — the winding must sit above the magnet. The DEC-008/DEC-009 restamps
assign the magnet value to both under a comment calling it a *"same path proxy"*.
A reader checking insulation-class margin (class H, 180 °C) is handed a number
describing a different part of the machine.

Sol's follow-up was the sharper point: **a detector is not containment.**
`physics_plausibility` flags it, but the Excel builder, the thermal consumers
and the release surface never run it — they read the quantity. So the fix went
to source, in both restamps and in **two write paths** (blanking it in DEC-008
alone was not enough; DEC-009's quantity loop re-set it, which only re-running
revealed):

`mgu_winding_temp_c` is now **deliberately absent** — `value: None`, basis
`unresolved_after_dec_008` — with the magnet figure kept under its own honest
name `magnet_path_proxy_c` and the pre-restamp value preserved. An absent number
forces a consumer to handle the gap; a wrong number does not.

The HIGH check stays, with its proveCatch on the old equal values, so this
cannot come back silently. **The winding temperature at the DEC-008 duty is now
openly underived** — it needs the two-source LPTN re-run at that duty, or a
measured value from the dyno map. That is honest, and it is a Bar B input.

**My guard's scope did not match its docstring.** `collect()` globbed only the
twin root and `_motor_stack` while the prose claimed "every artefact in the
twin". Widened to the whole tree: **27 → 32 published bars**, so the original
scope was genuinely missing five.

**My guard's motoring claim was prose, not code.** It never consumes a declared
direction; the motoring fixture only proves a *different duty point* is accepted.
Corrected to a stated known gap rather than quietly left as an overclaim.

---

## 4. What stays open — and what needs you

**DEC-DUTY-SPEED (new, needs a decision).** DEC-009 adopted 24,000 rpm and says
it supersedes 19,500, but every duty bar is still stamped at 19,500. Either the
duty is specified at base speed and the EM artefacts are right, or it moves with
the adopted operating point and the bar is 101.74 N·m. **My recommendation: keep
125.2193 and say so explicitly**, on the grounds that a torque requirement
quoted at the *lower* speed is the conservative reading and the machine clears
it either way — but it must be stated as a choice in the Decision Register, not
left as two numbers in one pack. This is your call, not mine.

**S1 hero render.** Needs a re-render, which was outside this block's scope
(`--not-doing` included re-rendering Blender). The manifest/scene divergence
above is the thing to fix first — re-rendering without it just moves the bar.

**S4 350 kW class label vs ~244 kW shaft.** `physics_plausibility` already
reports this as HIGH; it exits 0 unless `--enforce`, and the guard suite runs
only `--selftest`. Whether the class label is wrong or the shaft figure is
mislabelled is again a decision about what "350 kW class" means.

**S6 iron loss across surfaces.** 6035 W design value vs 135.56 W from the
`motor:loss-point` tool, both under one quantity name. The supersession is
disclosed in Checks, but a reader still meets two numbers.

---

## 5. Method note

Every finding above was re-derived independently before being acted on, and the
two that turned out to be more interesting than reported — the duty-speed split
and the manifest/scene divergence — were found by the guards, not by reading the
report. That is the point of writing the check rather than trusting the finding.

Three defects in this session were found by the tooling catching *me*: the
start council blocked my first approach on five counts (all adopted), the
negative control in `check_duty_torque_identity` caught a version that would
have condemned all nineteen correct artefacts alongside the one wrong one, and
`check_detached_geometry` passing on a twin whose render visibly has a floater
is what exposed the manifest gap.
