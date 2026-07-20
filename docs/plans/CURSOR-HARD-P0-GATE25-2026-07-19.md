# HARD P0 — Gate 25 false-positive (Tristan 2026-07-19 ~15:55)

**Status:** `RECOMMENDATIONS_READY` — do **not** burn another full chain until green.  
**Canonical inbox pointer:** `docs/plans/CURSOR-HARNESS-INBOX.md` (top section).

## Why Tristan is angry

Gate 25 killed `out/organoid-bioreactor-20260719-1453/` (exit 25) because brief **£400** matched emitter **AC 400 V** / `√3` — a digit collision, not a stale brief mirror. That is an expensive false positive after real product progress.

## Already true in the working tree

Uncommitted skip in `scripts/lib/brief-value-literal-scanner.ts` (~L360–368) makes:

```text
unit_cost_ceiling_gbp: 400  →  scan live emitter  →  passed, 0 hits
```

Commit it. Add proveCatch. Prefer invert money-family matching + early fixture so this class of FP dies forever.

## Checklist

- [ ] Commit scanner mains-context skip
- [ ] proveCatch: AC/`√3` lines skip under £400; money-key `400` still fires
- [ ] `npx tsx scripts/lib/brief-value-literal-scanner.ts --selftest` PASS
- [ ] Money invert and/or `p.acMainsVoltageV` in emitter
- [ ] Early fixture: ceilings 100/200/400/8500 vs emitter (CI or pre-chain)
- [ ] One new stamped benchtop chain only after the above

## Forbidden

- Brief hack to £399 as the primary fix
- Re-using failed `1453`
- Starting a chain “to check” before selftest is green

---

## Terminal reply (2026-07-20) — CLOSED (doc was stale)

This P0 was already fixed BEFORE this doc was written. The mains-vs-cost skip is committed at **`c9e3aac5b`** (`brief-value-literal-scanner.ts` L360–368: money-family + `sqrt(3)`/`√3`/`3~`/`Hz`/`AC` markers → skip), with a full proveCatch in `selftestContractStrict()`:
- case (10): £100/200/400/8500 ceilings vs a `(400 * Math.sqrt(3))` 3-phase formula + an `AC 400 3~/50 Hz` string → all skip;
- case (11): the REAL `deterministic-emitter.ts` scanned at a £400 ceiling → zero false positives.

`npx tsx scripts/lib/brief-value-literal-scanner.ts --selftest` → PASS. Now also **wired into `verify-engine-guards.sh`** so the digit-collision class stays dead (this commit). Additionally **F1d** (`3be10b5d6`) makes a device-scale product emit single-phase 230 V, not 3-phase 400 V — so the `400 V` string that collided with £400 no longer appears on benchtop instruments at all. No further action; Status → CLOSED.
