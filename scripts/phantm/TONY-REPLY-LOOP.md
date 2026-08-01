# Tony reply loop (Anvil-first — 2026-07-30)

**Failure mode we just hit:** Tristan pasted Tony → LLM drafted a peer chat reply → wrong physics (claimed welded HOBE removes ⅓ double walls; claimed faceplate shapes cells during expand). Anvil already knew HOBE natively has ⅓ double walls (`report.py` § cells / `foil_topology.py`). The LLM contradicted the engine.

## Rule

**No Tony reply from chat alone.** Sequence:

1. **Capture** Tony’s note into a tracker bullet (failure mode + claim).
2. **Encode** as a deterministic script under `scripts/phantm/` with `--selftest` / proveCatch.
3. **Run** related RF/mech artefacts (`double_wall_rf_check.py`, `floquet_hex_array.py`, FEMM, …).
4. **Emit** JSON under `out/`.
5. **Generate** the reply from those JSON files (same pattern as `tony_reply_overnight.py`), citing numbers.
6. **Ship** PDF/Excel only when the reply generator reads live artefacts.

If a step has no model yet, the reply says **“not yet computed — here is the open question for Vlad/Tony”** — not an invented strategic hook.

## Modules for this thread

| Claim | Module | Artefact |
|---|---|---|
| HOBE 2/6 double walls; welding ≠ topology | `hobe_geometry.py` | `out/hobe-geometry.json` |
| ⅓ double-wall single-cell RF bounds | `double_wall_rf_check.py` | `out/double-wall-rf-check.json` |
| Periodic / Floquet | `floquet_hex_array.py` | `out/floquet-hex-array.json` |
| Tape Euler / row-strip ⅓ | `foil_topology.py` | `out/foil-topology.json` |

## Withdrawn (must not recur)

- “Laser-weld HOBE removes Vlad’s ⅓-double-wall headache”
- “Faceplate improves hex shape during free expansion”
