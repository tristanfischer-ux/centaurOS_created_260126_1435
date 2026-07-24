# Full council critique — organoid dossier floor 0 → all-tabs >9 (2026-07-24)

5 seats: Gemini-3.1-Pro, MiMo-v2.5-Pro, GLM-5.1, Grok-4.3, Kimi-K2.6.
(grok-4.5/glm-5.2/kimi-k3/gpt-5.6-sol not routable via second-opinion MCP — prior gen used.)

## ROOT CAUSE — ledger service misclassification (GLM sharpest, 3+ seats converge)
The connection-ledger service/mechanism classifier does **first-keyword-match-wins** token
matching: **"PTC" matches PTC-thermistor → temperature sensor → SIGNAL**, preempting the
later "Fuse" token (which is POWER). So "PTC Resettable Fuse" is misclassified as a signal
device; auto-close then picks the nearest SIGNAL neighbour (Debug Header) and leaves the
input empty (silent auto-close failure, not a hard error). [GLM]
Compatible w/ MiMo+Gemini: service inferred from DESTINATION endpoint + greedy
nearest-neighbour, no topological constraint.

## UNIVERSAL RULE (GLM — most actionable)
1. Protected-keyword set for series power-chain: {barrel, jack, reverse-polarity, diode,
   polyfuse, fuse, ptc, resettable, ferrite, bead, tvs, varistor, mov, regulator, dcdc}.
   Any token present → LOCK service to POWER (no signal override).
2. Compound-phrase dictionary takes precedence over single token: "ptc resettable fuse"→POWER.
3. Chain-position ordinal ranks: barrel_jack=0, reverse_polarity=1, polyfuse=2, ptc_fuse=3,
   ferrite=4, dcdc=5. Close power-IN from rank N−1, power-OUT to rank N+1.
GUARD: walk the power spine from the barrel jack; every protection part visited in rank
order; each has exactly one power-IN + one power-OUT; no service≠power edges; ends at DC-DC.

## OTHER SUSPECTS same bug (GLM + Kimi): Ferrite Bead ("ferrite"→signal EMI), Polyfuse, rev-polarity diode.

## KIMI (electronics) — real DESIGN defects beyond wiring:
- **Polyfuse AND PTC resettable fuse are REDUNDANT** — a polyfuse IS a PTC. Two in series =
  hallucinated duplicate (decomposition invented a dup protection part). Delete one.
- 0.9A PTC is UNDERSIZED for a 1A (12W/12V) load → nuisance trips.
- Debug Header must connect to STM32 SWD/UART (SWDIO/SWCLK/NRST/UART/3V3/GND), never a fuse.
- Missing: DC-DC bulk input cap, TVS overvoltage, primary non-resettable safety fuse
  (UL/IEC 62368 — a PTC alone isn't recognised fire protection), ESD on debug header.

## GROK (adversary) — heed these:
- Single-edge fix leaves rest of power tree unvalidated; Interconnect may stay low on OTHER
  grounds (current capacity, thermal derating, return path).
- REGRESSION RISK: the render ledger-harness draws a conduit per edge — a wrong edge draws a
  phantom wire. (My fix REMOVES the bad edge, so this is handled — but re-verify the render.)
- MOST UNDERESTIMATED: volume of cascading re-derivation across 27 tabs after one topo change.
- ⚠ ACHIEVABILITY: Grok claims >9 on EVERY tab is "structurally impossible for a cold
  deterministic run — verification/drawings/FMEA/thermal capped at 7-8 by construction."
  → MUST verify the scoring rubric is satisfiable to >9; if a tab caps by construction,
  flag to Tristan honestly, do NOT fake it.

## FIX ORDER (consensus)
1. Ledger service-classifier: power-protection nouns LOCK to POWER + wire into power spine
   (compound-phrase rule). Cascades → Interconnect, Connection trace, ⚠Checks, Overview. + guard.
2. Envelope containment invariant (the 2nd failing Overview invariant).
3. Redundant polyfuse/PTC dedup + undersized rating (decomposition).
4. Re-derive PCB / Interconnect / Connection trace.
5. Verification + Drawings content (power budget, thermal, protection coordination, GD&T).
6. VERIFY the >9 rubric is achievable per tab before declaring done.
