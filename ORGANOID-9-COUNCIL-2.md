# Council round 2 — fluid + interconnect fixes (2026-07-25)
5 seats: Gemini-3.1-Pro, Grok-4.3, GLM-5.1, Kimi-K2.6, MiMo-v2.5-Pro.

## FLUID (spurious water edges)
ROOT FIX = the etype classifier (Gemini): structural/electronic parts must never get a PROCESS
etype → never flagged needing fluid → residual closer never plumbs them. Completeness stays
GREEN (0 required − 0 actual). Implemented as a CONSERVATIVE exemption in
AIR_OR_SUBCOMPONENT_KEYWORDS (parts_ledger.py).
KIMI FALSE-EXCLUSION WARNING (load-bearing): do NOT use bare nouns header/housing/plate/fixture
— they hit real wetted parts (media HEADER, filter HOUSING, manifold PLATE, pump-HEAD fixture).
Used specific phrases only: vial holder / base plate / thermal insulation / debug header / etc.
KIMI wetted-path completeness: a real perfusion bioreactor also has: waste/harvest line (liquid),
gas-sparge line (AIR not water), sample port (liquid), optional jacket/water-bath (absent on a
12W air-cooled Peltier unit → TEC/heatsink/pad/fan carry NO water — confirmed).

## INTERCONNECT (missing power story)
ROOT: ledger power edges fan from a BUS (ferrite bead / power-entry) that is NOT a principal, so
principal→bus→principal power paths drop → 0 power edges in the diagram. FIX (Grok/Gemini/MiMo):
UNCONDITIONALLY lift real ledger power edges to principals (direct + via-bus), NOT the conditional
synthetic power-story. Copies REAL edges → synth_ratio stays low; only draws to genuinely-powered
parts (Kimi: no signal-part noise).

## HONEST CEILING (MiMo + prior): floor 9. Interconnect/Assembly/Render cap at 9 by design for an
instrument. Every OTHER non-mirror tab can reach ≥9.

## VERIFICATION (MiMo): edge-parity audit — (1) power edges in diagram == ledger power path,
(2) 0 fluid edges on structural/electronic nouns; then OPEN the interconnect diagram + P&ID +
Blender cutaway and confirm MCU has a power edge and base plate has zero fluid.
