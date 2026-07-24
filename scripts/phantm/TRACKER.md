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
| C | FEMM FE loop: install → C-core gate → (x,i) sweeps → FE-truth Pm/Ic | ❌ | |
| D | Step dynamics + energy/step + coil ΔT | ❌ | |
| E | §5 scorecard (7 items) + §6 force-budget-at-scale crux | ❌ | |
| F | Manufacture + cost to USD 0.10 + tolerance stack | ❌ | |
| G | Report + verdict + curves (SIGHT on main thread) + Tony Qs | ❌ | |
| H | Engine tools: magnetics:reluctance-detent-force / coil-rl-risetime / vr-stepper-drive | ❌ | |

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
