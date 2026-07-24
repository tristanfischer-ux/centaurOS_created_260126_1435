# PHANTM Actuator — Increment Tracker

> Workstream: model Tony Hooley's PHANTM beam-steering actuator (brief v2, 2026-07-23,
> CONFIDENTIAL — see BRIEF-v2.md). Scope: actuator ONLY — never RF/aperture/beam.
> Worktree: ~/Developer/CentaurOS-phantm (branch phantm-work → pushes to oxccu-efuel).
> Plan: ~/.claude/plans/dynamic-marinating-valiant.md · Commitments drawer:
> forgeos/decisions drawer_forgeos_decisions_d27db4a89e0c6c7d.

## Anchors (must survive every revision)
1. Actuator only — if modelling RF/aperture/beam, STOP.
2. Tony's §2 geometry is the untouched baseline; optimisation explores around it.
3. Five numbers first (Mt, Wm, Pm, Ic, Lc/Rc/tr), each with method + assumptions.
4. Pm + Ic (force items) ship only FE-validated (FEMM under Wine; xfemm hedge; NGSolve fallback).
5. Honest scoring — §5 scorecard pass/fail with numbers; E-band fit + §6 force-at-scale crux quantified, not softened.
6. Confidential — private repo only, nothing published externally.

## Increments
| # | Increment | Status | SHA |
|---|---|---|---|
| A | Scaffold + geometry/materials + selftest | ✅ done | (commit blocked — see Blockers) |
| B | Nonlinear reluctance network → analytic five numbers v1 (selftest 27/27) | ✅ done | (commit blocked) |
| C | FE loop: **xfemm femmcli native** (not Wine) → C-core gate PASS → FE-truth Pm/Ic | ✅ done | |
| D | Step dynamics: transit 2.5–4 ms; capture-window + hold-and-release analysis | ✅ done | |
| E | §5 scorecard (7 items, baseline vs fixed) + §6 crux quantified | ✅ done | |
| F | Manufacture + cost to USD 0.10 + tolerance stack | ✅ done (cost.json) | |
| G | Report + verdict + 4 figures (SIGHTed on main thread) + Tony Qs | ✅ done — out/PHANTM-ACTUATOR-REPORT.md | |
| H | Engine tools registered: magnetics:vr-detent-force / coil-rl-risetime / vr-stepper-drive (TS+py+manifest; selftests green; registry-invoke verified) | ✅ done — guard wiring into verify-engine-guards.sh deferred pending other terminal's ACK (their ACTIVE file) | |

## FINAL ANSWERS (2026-07-24 — FE-truth, ship to Tony)
Mt 0.1577 g · Wm 77.5 µm · **Pm: unreachable on baseline (net detent caps ≈0.47 mN =
0.3 g, ×16 short — for ANY magnet); fixed design (gap 20 µm + bridge/PM ×1.5, all else
stock) Pm* = 243 µm → 7.72 mN ✓ with 3 detents preserved** · **Ic: baseline unreachable;
fixed Ic* = 3.35 A for the literal 2·Fd peak (needs ≈1.9 V; 1 V caps MMF at 36 At —
practical stepping from ≈1.4 A within 1 V)** · Rc 0.552 Ω, Lc(FE) 0.4–0.6 µH, tr63 ≈ 4 µs.
0.35p-teeth variant REJECTED (detent basins 3→2 — basin count is an acceptance check).
Full story: out/PHANTM-ACTUATOR-REPORT.md (+ scorecard/cost/dynamics/variants JSONs).

## Findings so far (Increment A)
- Mt = 0.1577 g (26 slots/face, 7.4 g/cm³) — matches Tony's ≈0.16 g hand-check.
- Wm = 77.5 µm exactly from §2 geometry — confirms §3.
- Bridge radial span reconciles: 2×0.465 + 2×0.0775 + 1.549 = 2.634 ✓ (geometry self-consistent).
- Coil fits: 20t of 58 µm-OD wire = 2 layers, 0.116 mm build vs 0.263 mm window; wire ≈ 63 mm.
- Usable stroke 8.27 mm (stator axial extent 4.228 mm) — ample vs 3.0 mm requirement.
- **Stator envelope ⊥ beam = 1.708 × 2.634 mm** — the 2.634 mm radial extent exceeds the
  ~1.9 mm E-band cell pitch by 1.39×. Expected-marginal per brief; quantify options in E.
- **Pole-phasing discrepancy (OPEN QUESTION → Tony):** 0.374 mm inter-pole spacing gives
  per-step tooth-phase offset 0.142 mm, not the stated 0.155 mm (pitch/3); the error
  accumulates to 25.3 µm on pole 2 (~16 % of a step). Spacing of 0.3867 mm (pitch 0.464)
  or 0.390 mm (pitch 0.465) would be exact. Also translator width 1.549 vs 1.55 (§2.1 vs §2.2).

## Findings — Increment B (analytic five numbers v1, pre-FE)
Design council (Grok 4.3): 3 BLOCKs addressed — leakage branches added; co-energy sign
verified vs ½Φ²·dR/dx (0.05% agreement, selftest-guarded); pole-coupling deferred to FE.
Debug history that must not regress (guarded by spike-free + 3-detent selftests):
kinked triangle permeance → apex force spikes + Pm Goodharting onto noise; fringing-log
slope cancelled the aligning force; o→0 tip constriction → 4 T artifacts. Final model:
harmonic permeance P = P0 + P1·(cosθ + k3·cos3θ)/(1+k3), k3 = 1/9 triangle seed.
- **The five numbers v1**: Mt 0.1577 g · Wm 77.5 µm · **Pm = 29.1 µm** (NdFeB at 0.78 T /
  −397 kA/m, 60% Br) · **Ic = 0.625 A** (12.5 A-turns, brief's peak-2Fd criterion) ·
  Rc 0.552 Ω, Lc 2.2–2.6 µH, tr(63%) 7.6 µs, reaches Ic at 5.3 µs on 1 V.
- **3-phase cancellation physics**: net detent rides on the 3rd harmonic of P(x) — the
  fundamentals of the 3 poles cancel. Pm therefore scales ~1/k3: FE calibration of the
  harmonic content is THE accuracy lever for Pm (headline uncertainty until Increment C).
- **Uneven steps from the 0.374 mm spacing**: detents at −0.174/−0.023/+0.139 mm ⇒ steps
  0.151/0.162/0.151 mm (±5 µm vs uniform 0.155) and equilibria ~23 µm off tooth-alignment.
  Directly from the pole-phasing discrepancy → Tony question #2 upgraded: it has a real
  phase-jitter consequence (~±4° at 80 GHz).
- **Stall vs peak criterion**: at brief-literal Ic (0.625 A) the min net force along the
  step path is −0.8 mN (a dead zone — step may not complete); stall-free (margin ½Fd)
  needs **Ic_step = 1.22 A**. Both within the 1 V / 0.55 Ω supply (I_∞ = 1.81 A). Report both.
- PM manufacturability: 29 µm sintered NdFeB is thin-film/bonded territory — flag in F.

## Findings — Increment C (FE truth; THE headline results)
- **FE backend**: wine-stable cask is deprecated/broken → built **xfemm `femmcli` natively**
  (3 portability patches: sincos→sin/cos, malloc.h→stdlib.h, ptr_fun→lambdas; recipe in
  femm/runner.py; binary at scripts/phantm/bin/femmcli, ~1 s/solve). C-core gate PASS
  (B +2.5%, force mid-band). Mesh-converged (0.4% at half meshsize).
- **2D model**: the bridge wraps the translator TRANSVERSELY (slot-sections are 1.708 long
  across it) — no single plane holds horseshoe + teeth ⇒ UNROLLED-loop model (teeth/gaps
  exact; bridge straightened, area-preserving thickness scaling; translator ends fixed in
  space so the unroll bias is a constant DC that the Fourier fit drops).
- **⭐ MAKE-OR-BREAK (brief §6): the BASELINE CANNOT meet the force specs.** At g/t =
  77.5/232 ≈ 1/3, fringing keeps unaligned permeance high → gap-flux modulation only ~8%
  (2.8% in λ) → per-pole force ~1.5 mN and NET 3-phase detent plateaus ≈0.47 mN for ANY
  Pm (PM self-reluctance ceiling) vs the 7.7 mN spec — **~16× short**; drive similarly.
  86% of bridge flux DOES cross the gaps (no leakage short); W'-vs-WST consistent.
  The network model's floor-permeance assumption was the wrong part — FE is truth.
- **⭐ Recovery levers quantified (femm-variants.json)**: gap is dominant (20 µm: ×8.6 net);
  deep stator slots + 0.35p teeth compound; PM area is the ceiling-lifter. **FIXED design =
  gap 20 µm + stator slots 0.465 + teeth 0.162 (pitch/step unchanged) + bridge/PM ×1.5 →
  net detent 7.8 mN at Pm* = 137 µm (manufacturable sintered NdFeB)** ✓ meets Fd.
- **Coil sign physics**: positive coil current must AID the pole's PM (drive = boost your
  own pole). First solve ran opposed — "more current made it worse" (B_br 0.83→0.24 T at
  +3 A). Sign convention fixed in lua_gen 2026-07-24; both solvers re-run.
- FE Lc ≈ 0.8 µH (vs network 2.2–2.6 µH — unrolled/2D approximation + leakage diffs).

## Findings — D/E/F (pending final FE curves)
- Dynamics (network-v1 curves): ring ~200 Hz at detent; open-loop 3 ms pulse OVERSHOOTS
  into the wrong basin; capture-window analysis added — friction-dependent; ≥1 mN friction
  stalls the baseline. Re-run on FE fixed-design curves once solver lands.
- Cost (cost.json): materials $0.0014/unit (negligible) — the $0.10 target is process +
  volume: baseline meets $0.10 from ~10M/yr (band low end); the FIXED 20 µm gap adds a
  precision-assembly penalty → $0.10 only ≥100M/yr optimistic. Tolerance stack is the
  driver: dF/dg ≈ −8%/µm → ±5 µm scatter = ±40% force ⇒ active gap-setting needed.

## Blockers
- `git commit` denied by the Claude Code auto-mode classifier (3 attempts, incl. after
  fixing the hook's eslint via node_modules symlink + venv relocation). Work is staged in
  the worktree. Tristan: approve a commit or add a permissions rule for `Bash(git commit*)`.

## Open questions to Tony (running list, → report §9)
1. Brief §9 Q1–Q4 (reflector mass, Fd intent, orientation, temp/drive voltage).
2. Pole spacing 0.374 vs exact-phasing 0.3867/0.390 (above).
3. Tooth pitch quoted 0.465 vs slot+land arithmetic 0.464 — which is authoritative?

## How to run
Venv lives OUTSIDE the repo at `~/.venvs/phantm` (a `.venv-phantm/` inside the repo
gets linted by eslint's repo-wide sweep — only `.venv/` is ignored — and breaks the
pre-commit hook). Use `python -m pip` for installs (relocated-venv shebangs).
```
~/.venvs/phantm/bin/python scripts/phantm/selftest.py    # 20/20 green
~/.venvs/phantm/bin/python scripts/phantm/geometry.py    # derived-geometry dump
```
