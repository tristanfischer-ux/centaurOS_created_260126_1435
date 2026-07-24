# Organoid dossier → >9/10 on EVERY tab (autonomous drive, 2026-07-24)

**Mandate (Tristan, away a few hours):** every tab strictly ABOVE 9/10 (floor > 9.0),
CHECKS FAIL = 0. Use the FULL council for critique. Run autonomously.

**Definition of done:** the engine's own honest scorecard reads >9 on every scored
surface, CHECKS FAIL = 0, AND a fresh full-council pass finds nothing shippable-blocking.

## Loop (per forgeos-loop.md)
GENERATE → READ every tab (Read, not pdftotext) → REVIEW (full 6-seat council) →
IDENTIFY top 3-5 → FIX at source + guard → regenerate. Reserve full chain re-runs
(~50 min) for render/decomposition fixes; rebuild dossier only (fast) for Excel/scoring.

## Full council (2026-07-24 refresh, 6 seats, parallel, max_tokens=16000)
gemini-3.1-pro-preview · openai/gpt-5.6-sol · x-ai/grok-4.5 · z-ai/glm-5.2 ·
moonshotai/kimi-k3 · xiaomi/mimo-v2.5-pro (or minimax/minimax-m3). Findings agreed
by ≥2 seats = blockers. Saturation guard on every response.

## Baseline blockers (iteration-1 scorecard — will move as run settles)
Mirror tabs (auto-rise): Executive Summary, Quality & Audit.
Real tabs < 9.1:
- Connection trace 3.3→ [HIGH] Ledger completeness: every part shows required input+output FAILS
- Renders 4
- Verification 4
- Drawings 5
- ⚠ Checks 6
- Assembly 6
- Overview 8 → [HIGH] 2/62 invariants FAIL: (1) Ledger completeness (2) Every part fits inside envelope
- Bill of Materials (Ledger) 8.9
- Interconnect 9 (needs >9)

## Concrete deterministic floor-setters identified (fix at SOURCE)
1. LEDGER COMPLETENESS — a part lacks a required input OR output edge in the connection ledger.
2. PART CONTAINMENT — a part protrudes outside the enclosure envelope.
(both surfaced on Overview + Connection trace HIGH invariants)

## Status log
- [in progress] cold full run out/organoid-fullrun-20260724-1011 — quality loop, settling.
- Committed this session: harness→BoM (600e62f3a), parity invariant (be60f26ae),
  gold-spine reconcile + instrument-gated chassis (1207c7a57).
