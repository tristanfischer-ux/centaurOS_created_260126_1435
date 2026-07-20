# Cursor → Terminal — PCB honesty SOURCE fixes (2026-07-20)

**Fixture:** `out/organoid-bioreactor-20260719-2150/`  
**Doctrine:** universal (function-role / architecture signals), proveCatch on 2150 shape, no `if organoid`.  
**Ownership:** Terminal executes (Tristan); Cursor advises — this doc is the copy-paste pack.

**2150 facts (SIGHT):**
| Part / board | What shipped | Why FAB-READY lied |
|---|---|---|
| 10× MCU/TMP/ESR/fuse/BSS84/caps | real `mpn_symbol_footprint` | Legitimate progress |
| 5× firmware/debug/usb/esd/ferrite | `package_family`, no MPN | Counted as “verified-tier” |
| `power_indicator_led` | TE `4-2489541-7` @ `LED_0603`, `mpn_package_only` | Pinout rejects it; generator never consulted reject on DB-MPN path |
| `usb_power_entry` | `PinHeader_1x04` | Function-class default for `usb_connector` |
| `od_optics` | channels required, `requiredWordIds=[]` | Structural gap not counted |
| 3 boards needing KiCad | one merged 60×60 project | Multi-board smash |
| Gate 38 | `clean_board` | Only `pipeline.ok` + coverage≥80% |

---

## Issue map → files

| # | Issue | Primary files |
|---|---|---|
| 1 | `package_family` ∈ FAB verified set | `scripts/build-excel-export.py` |
| 2 | TE LED lands despite pinout reject | `atopile-generator.ts` + `pcb-manufacturer-pinouts.ts` |
| 3 | USB → PinHeader default | `atopile-generator.ts` |
| 4 | Empty OD board not a gap | `pcb-design-fitness.ts` (wire) + Excel readiness + optionally architecture |
| 5 | Multi-board → one project FAB-READY | `serial-design-chain-v2.tsx` + readiness |
| 6 | Gate 38 hygiene-only | `pcb-gate.ts` |
| 7 | Fitness weight 0.9 on package_family | same as #1 |
| 8 | PnP `Val=?` (cosmetic) | optional; Excel already fills from BoM — do not block FAB on this alone |

---

## Fix 1 — Split fitness weight vs FAB-READY tiers (Excel)

**File:** `scripts/build-excel-export.py` ~16474–16569 and selftest ~31500–31533.

### Replace tier constants

```python
# Fitness weights — package_family may contribute to a DRAFT score, never alone to FAB.
_PCB_TIER_WEIGHT = {
    "mpn_symbol_footprint": 1.0,
    "mpn_package": 1.0,
    "mpn_package_only": 0.95,
    "package_family": 0.5,   # was 0.9 — Goodhart for FAB
    "function_class": 0.2,
}

# Display / fitness "verified_n" may still count package_family as "has a package".
_PCB_VERIFIED_TIERS = (
    "mpn_symbol_footprint", "mpn_package", "mpn_package_only", "package_family",
)

# FAB-READY identity bar — catalogue MPN tiers ONLY.
_PCB_FAB_VERIFIED_TIERS = (
    "mpn_symbol_footprint", "mpn_package", "mpn_package_only",
)
```

### Extend `_pcb_readiness_verdict`

Add optional args (or compute inside `_pcb_two_axis_assessment` and pass in):

```python
def _pcb_readiness_verdict(
    ...,
    n_package_family: int = 0,
    n_non_fab_tier: int = 0,          # package_family + function_class + unresolved on-board
    n_architecture_gaps: int = 0,    # empty OD channels, multi-board smash, etc.
    all_on_board_fab_tier: bool = True,
) -> Tuple[str, str]:
    ...
    if fitness_score < 7.5 or n_electronic_gap > 0 or n_architecture_gaps > 0:
        return "ENGINEERING DRAFT", ...
    if not all_on_board_fab_tier or n_non_fab_tier > 0:
        return (
            "ENGINEERING DRAFT",
            f"hygiene clean but {n_non_fab_tier} on-board part(s) lack catalogue MPN "
            f"(package_family/function_class only) — FAB-READY requires "
            f"mpn_symbol_footprint / mpn_package / mpn_package_only for every on-board part",
        )
    return "FAB-READY", "..."
```

In `_pcb_two_axis_assessment`, when walking generator components, compute effective tiers via `_pcb_effective_tier` and set `all_on_board_fab_tier = all(t in _PCB_FAB_VERIFIED_TIERS for t in effective_tiers)`.

### Invert selftests (critical)

The `cfc19f96d` proveCatch at ~31520–31533 currently **requires** 10+5+1 → FAB-READY. That is the Goodhart. Change to:

```python
_gen_tiers = {"mpn_symbol_footprint": 10, "package_family": 5, "mpn_package_only": 1}
_gen_score, _, _ = _pcb_fitness_axis(_gen_tiers)
# Fitness may be mid/high depending on weight 0.5 — do NOT require >=9.
_gen_readiness, _ = _pcb_readiness_verdict(
    pipeline_ok=True, drc_ok=True, routed_ok=True, gerbers_ok=True,
    bespoke_missing=False, fitness_score=_gen_score, n_electronic_gap=0,
    n_on_board=16, n_electronic_design=15, n_electronic_full=15,
    n_non_fab_tier=5, all_on_board_fab_tier=False,
)
if _gen_readiness != "ENGINEERING DRAFT":
    print("FAIL: 2150-shaped 10+5+1 must be ENGINEERING DRAFT, not FAB-READY"); bad += 1

# proveNoFalsePositive: all mpn_symbol_footprint → FAB-READY
_all_mpn = {"mpn_symbol_footprint": 16}
_all_score, _, _ = _pcb_fitness_axis(_all_mpn)
_all_r, _ = _pcb_readiness_verdict(
    ..., fitness_score=_all_score, n_electronic_gap=0,
    n_on_board=16, n_electronic_design=16, n_electronic_full=16,
    n_non_fab_tier=0, all_on_board_fab_tier=True,
)
if _all_r != "FAB-READY":
    print("FAIL: all-MPN board must still FAB-READY"); bad += 1
```

Also update `_package_floor_tiers = {"package_family": 10}` expectation: score with weight 0.5 → **5.0**, not ≥9. Or drop that selftest and replace with “package_family-only → DRAFT”.

---

## Fix 2 — TE `4-2489541-7` must not become `mpn_package_only`

### Root cause (call chain)

```
BoM word TE + 4-2489541-7
  → resolveComponent (atopile-generator.ts ~984)
    → resolveViaMpn → mpnVerified=true (DB cache hit)
    → SKIP resolveVerifiedComponentIdentity (only runs when !mpnVerified)  # L998
    → resolveCuratedManufacturerIdentity NEVER called
    → footprint from package text OR FUNCTION_CLASS_DEFAULTS.led → LED_0603
    → L1072: partNumber && mpnVerified && !identityVerified → tier = mpn_package_only
```

Pinout reject at `pcb-manufacturer-pinouts.ts:400` is **dead** on the upstream-MPN path. Also `hasCuratedManufacturerPinout` is false for this PN (not in `CURATED_MANUFACTURER_SYMBOLS`), so even the curated path often never hits the special-case.

### 2a. Denylist helper (pinouts)

**File:** `src/lib/pdf-engine-v2/lib/pcb/pcb-manufacturer-pinouts.ts`

```typescript
/** MPNs that must never land on a PCB even if distributor cache verifies them. */
const PCB_MPN_DENYLIST = new Set([
  normalized('4-2489541-7'), // 110 V DC panel indicator — not an SMD LED
])

export function isDeniedPcbMpn(partNumber: string): string | null {
  const key = normalized(partNumber)
  if (PCB_MPN_DENYLIST.has(key)) {
    return `${partNumber} is denylisted for PCB placement (panel/industrial indicator, not PCBA LED)`
  }
  return null
}
```

Keep existing `resolveCuratedManufacturerIdentity` reject; call `isDeniedPcbMpn` from generator **before** trusting `mpnVerified`.

### 2b. Generator — consult denylist + role guard after `resolveViaMpn`

**File:** `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts` inside `resolveComponent`, after ~986:

```typescript
import { isDeniedPcbMpn, resolveCuratedManufacturerIdentity } from './pcb-manufacturer-pinouts'
// ...
if (partNumber) {
  const mpnResult = resolveViaMpn(manufacturer, partNumber)
  const denyReason = isDeniedPcbMpn(partNumber)
  if (denyReason) {
    mpnVerified = false
    identityBlocker = denyReason
    // Clear so we fall through to curated LED candidate (KPT-1608CGCK) or package_family/unresolved
    resolvedPartNumber = null as unknown as string // or '' 
    // Better: leave partNumber on word for punchlist but do not claim mpnVerified
  } else {
    mpnVerified = mpnResult.verified
    ...
  }
}
```

Cleaner pattern:

```typescript
if (partNumber) {
  const denyReason = isDeniedPcbMpn(partNumber)
  if (denyReason) {
    identityBlocker = denyReason
    // Force curated / function-class path — never mpn_package_only for denylisted MPNs
  } else {
    const mpnResult = resolveViaMpn(manufacturer, partNumber)
    mpnVerified = mpnResult.verified
    // existing packageText footprint resolution...
  }
}
```

And **before** assigning `tier = 'mpn_package_only'` (~1072):

```typescript
if (partNumber && mpnVerified && !identityVerified && tier !== 'unresolved') {
  if (isDeniedPcbMpn(partNumber)) {
    // should be unreachable if 2b early-out works; belt-and-braces:
    tier = 'package_family' // or treat as unresolved electronic if no fallback
  } else if (functionClass === 'led' && !identityVerified) {
    // Optional stricter: LEDs without curated pinout cannot be mpn_package_only
    // Prefer try curated KPT-1608CGCK via resolveVerifiedComponentIdentity once
    tier = 'package_family'
  } else {
    tier = 'mpn_package_only'
  }
}
```

### 2c. proveCatch (jest)

**File:** new cases in `pcb-manufacturer-pinouts.test.ts` + generator test (or `atopile-generator` selftest if exists):

```typescript
expect(isDeniedPcbMpn('4-2489541-7')).toBeTruthy()
// resolveComponent fixture: characterId power_indicator_led, mfr TE, pn 4-2489541-7
// → component.resolutionTier !== 'mpn_package_only'
// → component.partNumber is not 4-2489541-7 OR unresolved with deny reason
```

Yuri punchlist already documents this MPN — generator must honour the same reject.

---

## Fix 3 — USB must not default to PinHeader

**File:** `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts`

### 3a. Split `usb_connector` vs `debug_connector` in `FUNCTION_CLASS_RULES` (~139)

```typescript
// BEFORE (bundled — debug_header and usb_power_entry share PinHeader default):
{ id: 'usb_connector', test: /usb[_-]?(?:interface|power|connector|receptacle|port)|type[_-]?c|debug[_-]?(?:interface|header|uart)|uart[_-]?header/i },

// AFTER:
{ id: 'usb_connector', test: /usb[_-]?(?:interface|power|connector|receptacle|port|entry)|type[_-]?c/i },
{ id: 'debug_connector', test: /debug[_-]?(?:interface|header|uart)|swd[_-]?header|uart[_-]?header|jtag[_-]?header/i },
```

Add `debug_connector` to `FunctionClass` union + `FUNCTION_CLASS_DEFAULTS`:

```typescript
debug_connector: {
  library: 'Connector_PinHeader_2.54mm',
  filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,  // OK for SWD
  designatorPrefix: 'J',
  pins: ['SWDIO', 'SWCLK', 'GND', 'VCC'], // or keep generic
  ...
  resolutionTier: 'package_family',
},
```

### 3b. USB default — receptacle or fail closed

```typescript
usb_connector: {
  library: 'Connector_USB',
  // Prefer USB-C if present in local KiCad; tighten glob to real receptacle files only.
  filenameTest: /^USB_C_Receptacle_.*\.kicad_mod$/i,  // or USB_A / Micro-B as fallbacks
  designatorPrefix: 'J',
  pins: ['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2'], // match chosen footprint
  powerPin: 'VBUS',
  groundPin: 'GND',
  decouple: false,
  resolutionTier: 'package_family',
},
```

If the glob misses (no USB footprint in library) → `resolveComponent` returns **unresolved** (electronic gap), **not** PinHeader. That is correct honesty.

### 3c. Role allowlist guard (belt-and-braces)

After footprint resolved, before return:

```typescript
const fpName = footprint?.footprint ?? ''
if (
  /usb[_-]?(?:power|interface|connector|entry)/i.test(word.characterId)
  && /PinHeader/i.test(fpName)
) {
  return {
    unresolved: {
      wordId: word.wordId,
      nameHuman: word.nameHuman,
      characterId: word.characterId,
      reason: 'usb_power_entry cannot use PinHeader_* — need USB receptacle MPN/footprint or leave unresolved',
    },
  }
}
```

### 3d. proveCatch

```typescript
// classifyFunction('usb_power_entry') === 'usb_connector'
// classifyFunction('debug_header') === 'debug_connector'
// resolveComponent(usb_power_entry, no MPN) → unresolved OR Connector_USB_*, never PinHeader
```

---

## Fix 4 — Empty OD board = architecture gap (wire existing fitness)

**Already exists, unwired:** `evaluatePcbDesignFitness` in `pcb-design-fitness.ts` already emits `channel_under_implementation` when `implementedChannels[role] < count` — 2150 OD board would fire **if wired**.

### 4a. Wire into chain after generator

**File:** `scripts/serial-design-chain-v2.tsx` (PCB_STAGE block after `generateAtopileProject` ~9972)

```typescript
import { evaluatePcbDesignFitness } from '.../pcb-design-fitness'

const fitness = evaluatePcbDesignFitness(architecture, {
  resolvedWordIds: genResult.components.map(c => c.wordId).filter(Boolean),
  unresolvedWordIds: genResult.unresolved.map(u => u.wordId),
  implementedChannels: deriveImplementedChannels(genResult, architecture), // see below
})
stPcb.pcb.designFitness = fitness  // persist on state.pcb
```

`deriveImplementedChannels`: for each `channelRequirements[].role`, count generator parts / words whose characterId or function role matches (OD: photodiode, led_source, tia, od_adc, …). Empty → 0 → finding.

### 4b. Also treat empty `requiredWordIds` + channels as HIGH

Extend `evaluatePcbDesignFitness`:

```typescript
for (const board of architecture.boards) {
  if (
    board.requiresKiCadDeliverable
    && board.channelRequirements.length > 0
    && board.requiredWordIds.length === 0
  ) {
    findings.push({
      severity: 'high',
      code: 'channel_under_implementation',
      message: `${board.boardId} requires channels [${board.channelRequirements.map(c => c.role)}] but requiredWordIds is empty — no electronics assigned`,
      fixStage: 'pcb-architecture',
    })
  }
  // existing missing/channel loops...
}
```

### 4c. Excel readiness consumes `state.pcb.designFitness`

In `_pcb_two_axis_assessment`:

```python
arch_gaps = 0
df = (pcb.get("designFitness") or {})
if df.get("ok") is False:
    arch_gaps = len([f for f in (df.get("findings") or []) if f.get("severity") == "high"])
# pass n_architecture_gaps=arch_gaps into _pcb_readiness_verdict
```

### 4d. Upstream (Pillar 4, later)

Either emit OD words (source LED, PD, TIA) into `od_optics.requiredWordIds`, or do not set `requiresKiCadDeliverable` / do not create OD board without electronic evidence. Prefer emit — empty board with channels is a planner lie.

proveCatch already sketched in `pcb-design-fitness.test.ts` (~30–37) — extend for empty `requiredWordIds`.

---

## Fix 5 — Multi-board smash → PARTIAL, not FAB-READY

**File:** `scripts/serial-design-chain-v2.tsx` ~9957–9972 currently:

```typescript
const onBoardWordIds = [...new Set(architecture.boards.flatMap(b => b.requiredWordIds))]
const primaryBoard = architecture.boards.find(...) ?? ...
generateAtopileProject(stPcb, pcbProjectDir, {
  requiredWordIds: onBoardWordIds,
  boardShape: primaryBoard?.shape,  // wet_lab_hat only
  requiredFunctionRoles: architecture.boards.flatMap(...),
})
```

### Short-term (honesty — do this in the same PR as Fix 1)

Do **not** claim FAB-READY when:

```python
n_kicad_boards = len([b for b in arch["boards"]
                      if b.get("requiresKiCadDeliverable")])
single_project = bool(pipeline.get("kicadPcbPath"))
if n_kicad_boards > 1 and single_project:
    n_architecture_gaps += 1  # or dedicated flag multi_board_merged=True
    # readiness → ENGINEERING DRAFT
    # why += "multi-board architecture collapsed into one KiCad project"
```

Persist on `state.pcb`:

```typescript
stPcb.pcb.multiBoardMerged = architecture.boards.filter(b => b.requiresKiCadDeliverable).length > 1
```

### Medium-term (real fix)

Loop `for (const board of architecture.boards.filter(b => b.requiresKiCadDeliverable && b.requiredWordIds.length))` → `pcb/<boardId>/` project each. Empty-word boards (OD) stay gaps until words exist — do not generate an empty KiCad project to fake coverage.

---

## Fix 6 — Gate 38 beyond `pipeline.ok`

**File:** `src/lib/pdf-engine-v2/lib/pcb/pcb-gate.ts` after coverage check (~104):

```typescript
if (pipeline.ok === true) {
  // existing coverage check...

  const fitness = pcb.designFitness
  if (fitness && fitness.ok === false) {
    const highs = (fitness.findings || []).filter(f => f.severity === 'high')
    if (highs.length) {
      return {
        applicable: true,
        fires: true,
        reason: 'clean_toolchain_but_architecture_unfit',
        details: highs.slice(0, 5).map(f => f.message),
      }
    }
  }

  if (pcb.multiBoardMerged === true) {
    return {
      applicable: true,
      fires: true,
      reason: 'clean_toolchain_but_multi_board_merged',
      details: [
        'architecture requires multiple KiCad deliverables but only one project was generated',
      ],
    }
  }

  // Optional: if Excel-side readiness was recorded as ENGINEERING DRAFT on state
  if (pcb.readiness === 'ENGINEERING DRAFT' || pcb.readiness?.startsWith?.('ENGINEERING')) {
    return {
      applicable: true,
      fires: true,
      reason: 'clean_toolchain_but_not_fab_ready',
      details: [pcb.readinessWhy || 'readiness ENGINEERING DRAFT'],
    }
  }

  return { applicable: true, fires: false, reason: 'clean_board', details: [] }
}
```

Extend `PcbStageResult` type with optional `designFitness`, `multiBoardMerged`, `readiness`.

proveCatch in `pcb-gate.ts` `__main__` / `pcb-gate.test.ts`:
- clean pipeline + designFitness highs → fires  
- clean pipeline + multiBoardMerged → fires  
- clean all-MPN single board → does not fire  

Shadow default OK; Excel must already say DRAFT when gate would fire (Fix 1+4+5).

---

## Fix 7 — Interface-critical roles without MPN = gap (optional tightening)

Even after Fix 1, you may want **named** roles that cannot stay `package_family`:

```python
_PCB_INTERFACE_CRITICAL_RX = re.compile(
    r"usb_power|usb_connector|power_indicator_led|esd_protection|microcontroller_mcu"
    r"|firmware_storage|current_limit_polyfuse",
    re.I,
)
# In assessment: if characterId matches and effective tier == package_family:
#   n_electronic_gap += 1  (or n_architecture_gaps)
```

Or generator-side: those roles without MPN → `unresolved[]` instead of silent PinHeader/SOIC default (stricter; may floor more dossiers — do after Fix 1–3).

---

## Fix 8 — PnP `Val=?` (low priority)

Excel `_pcb_pnp_value_from_bom` already fills display. Do **not** block FAB-READY on raw KiCad `Val=?`. Optional later: push `partNumber` into KiCad property at emit time so gerbers/PnP carry values — hygiene polish only.

---

## Fix 9 — Wire Tier-0 PCB firmware proof into the chain (Tristan ask)

**Status before this pack:** Cursor only said “banner UNPROVEN IN HARDWARE later.” That is **not** enough. Council H6/H8: `deriveFirmwareProofSpecs` + `prototypes/pcb-firmware-proof/firmware_proof.py` are **dead** (tests only). Doctrine: [`docs/plans/YURI-PCB-FIRMWARE-PROOF-PLAN-2026-07-18.md`](./YURI-PCB-FIRMWARE-PROOF-PLAN-2026-07-18.md). Worked exemplar of calling the Python harness: [`prototypes/opendrop-pcb-software-benchmark/benchmark.py`](../../prototypes/opendrop-pcb-software-benchmark/benchmark.py) (`prove_spec`).

### 9.0 Doctrine (banner strings — non-negotiable)

| Max claim | Requires |
|---|---|
| `FAIL` | hygiene/design/firmware HARD fail |
| `ENGINEERING DRAFT` | hygiene OK but design fitness fail **or** Tier-0 not runnable / fail |
| `FAB-READY — UNPROVEN IN HARDWARE` | hygiene + design fitness + **Tier-0 native proof PASS**; no HIL |
| `FUNCTIONALLY VERIFIED` | + real-MCU compile + sim (as required) + **HIL on current populated PCB** + proof hashes match current design |

**Never** print bare `FAB-READY` without the UNPROVEN suffix when HIL is absent.  
**Never** mint `FUNCTIONALLY VERIFIED` from Tier-0 alone.  
**Hard gate:** `design_fitness_ok !== true` ⇒ firmware proof **must not** PASS (`validate_spec` already rejects this — keep that invariant).

### 9.1 Schema gap you must bridge (do not pipe thin TS → Python blindly)

`deriveFirmwareProofSpecs` (`pcb-firmware-proof-spec.ts`) emits a **thin** architecture sketch:

```ts
{ schema, proofTargetId, kind, boardRole, workPerformed, channels: [{role, requiredCount}], domains, safeByDefault }
```

`firmware_proof.py` `validate_spec` requires a **fat** contract (see `fixtures/good-motion-board.json`):

```json
{
  "schema": "pcb-firmware-proof-spec/v1",
  "proof_target_id": "...",
  "kind": "custom_board",
  "design_fitness_ok": true,
  "mcu": { "mpn": "...", "toolchain": "native-draft", "pin_contract_complete": true },
  "buses": [{ "bus_id", "protocol", "pins", "expected_devices": [...] }],
  "components": [{ "word_id", "refdes", "mpn", "driver_key", "identity_check" }],
  "channels": [{ "channel_id", "role", "required_count", "instances": [{ "instance_id", "enable_net", "output_net" }] }],
  "actuators": [{ "actuator_id", "domain", "instance_ids", "safe_default", "requires_two_step_arm", ... }],
  "communications": [{ "kind": "uart_banner", "expected_banner_prefix": "PROOF|..." }]
}
```

**New module (recommended):** `src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract.ts`

```typescript
/**
 * INTENT: Bridge architecture + generator evidence into the fat Tier-0 contract
 * that firmware_proof.py validates. Thin deriveFirmwareProofSpecs alone is not enough.
 * If pin/bus evidence is incomplete → pin_contract_complete: false (proof fails closed).
 */
export function buildFirmwareProofContract(args: {
  thin: PcbFirmwareProofSpec
  designFitnessOk: boolean
  mcu?: { manufacturer?: string; partNumber?: string; characterId?: string }
  components: Array<{ wordId: string; partNumber?: string; manufacturer?: string; characterId?: string }>
  // Optional: nets from generator / pinouts when available
}): Record<string, unknown>
```

**Minimum viable enrichment for wet_lab_hat / actuation (2150-shaped):**

1. `design_fitness_ok` = `evaluatePcbDesignFitness(...).ok` (per board or whole plan — if any HIGH on that board, false).  
2. `mcu` from generator component with functionClass/microcontroller (e.g. ATSAMD21G18A-AU); if missing → omit / incomplete → proof fails.  
3. `pin_contract_complete: true` **only** when curated pinout exists for the MCU **and** every on-board I²C device you list has an address binding; otherwise `false` (honest fail).  
4. `buses`: at least one host path — prefer USB/UART banner bus from `usb_power_entry` / debug; I²C0 for TMP1075×2 with distinct addresses if pinouts say so.  
5. `channels`: expand thin `{role, requiredCount}` into `instances[]` of length `requiredCount`. If generator implemented 0 of N → instances empty or short → `channel_count_mismatch` (proveCatch already in prototype).  
6. `actuators`: heater / wet_interface / thermal → `safe_default: "off"`, `requires_two_step_arm: true`, domain from board.domains.  
7. `communications`: `{ kind: "uart_banner", expected_banner_prefix: `PROOF|${proofTargetId}|` }`.

**Reference:** OpenDrop `build_proof_spec()` manually builds a fat contract — pattern to generalise, not copy per-product.

### 9.2 Call site (chain)

**Where:** `scripts/serial-design-chain-v2.tsx` PCB_STAGE block, **after**:

1. `derivePcbArchitecture`  
2. `generateAtopileProject` (or per-board projects)  
3. `evaluatePcbDesignFitness` (Fix 4)  

**Before:** Excel build / readiness string finalisation.

```typescript
import { deriveFirmwareProofSpecs } from '.../pcb-firmware-proof-spec'
import { buildFirmwareProofContract } from '.../pcb-firmware-proof-contract'
import { runTier0FirmwareProof } from '.../pcb-firmware-proof-runner' // new thin wrapper

const thinSpecs = deriveFirmwareProofSpecs(architecture)
const proofResults = []
for (const thin of thinSpecs) {
  const boardFitnessOk = /* designFitness findings for thin.proofTargetId empty of HIGH */
  const fat = buildFirmwareProofContract({
    thin,
    designFitnessOk: boardFitnessOk && designFitness.ok,
    mcu: pickMcu(genResult, thin),
    components: componentsForBoard(genResult, architecture, thin.proofTargetId),
  })
  const outDir = path.join(pcbProjectDir, 'firmware-proof', thin.proofTargetId)
  // Skip prove when design unfit — still record skipped result
  const result = boardFitnessOk
    ? await runTier0FirmwareProof(fat, outDir)
    : { ok: false, skipped: true, reason: 'design_fitness_ok_false', findings: [...] }
  proofResults.push({ target: thin.proofTargetId, fat, result })
}
st.pcb.firmwareProof = {
  schema: 'pcb-firmware-proof-stage/v1',
  tier: 0,
  results: proofResults,
  allOk: proofResults.every(r => r.result.ok === true),
  anySkippedUnfit: proofResults.some(r => r.result.skipped),
}
// Write: pcb/firmware-proof/<boardId>/proof-result.json (harness already writes these)
```

**Runner wrapper** (`pcb-firmware-proof-runner.ts` or `.py` invoked via `spawn`):

```bash
# Mirror OpenDrop benchmark:
python3 prototypes/pcb-firmware-proof/firmware_proof.py prove <spec.json> --out <outDir>
# Or import prove_spec after moving/copying module under scripts/lib/ — prefer keep prototype path + spawn for quarantine until graduated.
```

OpenDrop pattern:

```python
firmware_proof = _load_firmware_proof()  # importlib from prototypes/pcb-firmware-proof/firmware_proof.py
result = firmware_proof.prove_spec(spec, proof_out)
```

### 9.3 Excel readiness + PCB tab UI

**File:** `scripts/build-excel-export.py` — `_pcb_readiness_verdict` return strings:

```python
# After hygiene + design-fitness / fab-tier gates pass:
fw = (pcb.get("firmwareProof") or {})
fw_ok = fw.get("allOk") is True
hil_ok = (pcb.get("hilProof") or {}).get("ok") is True  # always false until HIL exists

if not fw_ok:
    # Tier-0 missing/fail: do NOT use bare FAB-READY
    if hygiene_and_fab_tiers_ok and design_fitness_ok:
        return (
            "ENGINEERING DRAFT",
            "hygiene/identity OK but Tier-0 firmware proof did not PASS "
            "(native bring-up contract) — see pcb/firmware-proof/*/proof-result.json",
        )
    return "ENGINEERING DRAFT", ...

if fw_ok and not hil_ok:
    return (
        "FAB-READY — UNPROVEN IN HARDWARE",
        "DRC/Gerbers + fab-tier BoM + Tier-0 native firmware proof PASS; "
        "no HIL on populated PCB — not FUNCTIONALLY VERIFIED",
    )

# hil_ok only:
return "FUNCTIONALLY VERIFIED", "..."
```

**PCB tab section** “Executable proof” (new rows):

| Field | Source |
|---|---|
| Tier | `0` / `1` / `2` |
| Targets | list `proof_target_id` |
| Spec hash | from proof-result |
| Native compile | stage compile ok |
| Native sim | stage native_sim ok |
| HIL | UNVERIFIED / PASS |
| Artifact paths | relative `pcb/firmware-proof/...` |

**Verification spine HARD rows** (optional same PR or follow-up):

- `PCB firmware Tier-0` target=1 achieved=`1 if allOk else 0`  
- `PCB HIL` → UNVERIFIED (soft) until hardware exists — do not HARD-fail dossiers solely for missing HIL

### 9.4 Ship card / Gate 38

- Ship card axis: `firmware_tier0_ok` (boolean).  
- Gate 38: if hygiene clean + design fitness ok but `firmwareProof.allOk !== true` → fire `clean_board_but_firmware_proof_missing_or_failed` (shadow OK). Excel must already say DRAFT / not bare FAB-READY.  
- If design fitness fail → firmware skipped → DRAFT (not a separate scandal).

### 9.5 What Tier-0 will do on `2150` (expected — honest)

After wiring, expect **fail or skip**, not a green software proof:

| Target | Likely outcome |
|---|---|
| `wet_lab_hat` | May attempt; pin_contract incomplete / USB pin header / missing bus nets → fail closed |
| `wet_actuation` | Heater channel; safe-off required; may fail on incomplete instances |
| `od_optics` | `design_fitness_ok=false` (empty words/channels) → **proof_skipped_on_unfit_design** |

That is success of the wiring: the engine **refuses** software PASS on an unfit board.

### 9.6 proveCatch

1. **Prototype still green:** `python3 -m unittest discover -s prototypes/pcb-firmware-proof/tests`.  
2. **Bridge:** thin 2150 `od_optics` + `designFitnessOk=false` → fat spec has `design_fitness_ok: false` → `validate_spec` finding `proof_skipped_on_unfit_design`.  
3. **Channel mismatch:** required_count=4, instances=1 → `channel_count_mismatch` (existing bad fixture).  
4. **Excel:** hygiene+fab tiers OK, `firmwareProof.allOk=false` → readiness contains `UNPROVEN` **or** `ENGINEERING DRAFT`, never bare `FAB-READY`.  
5. **Excel:** `allOk=true`, no HIL → exactly `FAB-READY — UNPROVEN IN HARDWARE`.  
6. **Never:** `FUNCTIONALLY VERIFIED` without `hilProof.ok`.

### 9.7 Graduation path (do not do in first PR)

1. First PR: spawn prototype in-chain, write artefacts, cap banner (quarantine OK).  
2. Later: move `firmware_proof.py` → `scripts/lib/pcb_firmware_proof.py` once stable; keep proveCatch.  
3. Tier 1 real-MCU compile (PlatformIO/arduino-cli) — separate.  
4. HIL — separate; only then FUNCTIONALLY VERIFIED.

### 9.8 Env / skip

```text
CHAIN_SKIP_FIRMWARE_PROOF=1  → record skipped, readiness cannot claim FAB-READY — UNPROVEN…; stays DRAFT if that was the only missing axis you choose to require
```

Default: **run** Tier-0 when `PCB_STAGE=1` and design fitness attempted. Do not silently omit.

---

## Suggested commit order (Terminal)

1. **Excel FAB tier split + invert 2150 selftest** (Fix 1) — re-score frozen 2150 → PCB not FAB-READY.  
2. **MPN denylist + generator early-out** (Fix 2) — unit test on TE LED.  
3. **USB/debug class split + USB receptacle default / fail closed** (Fix 3).  
4. **Wire `evaluatePcbDesignFitness` + empty-word board finding** (Fix 4) + persist on state.  
5. **multiBoardMerged flag + readiness PARTIAL** (Fix 5 short-term).  
6. **Gate 38 consume fitness + merge flag** (Fix 6).  
7. **Firmware Tier-0 wire** (Fix 9) — **after** Fix 4 (fitness must gate proof); banner cap + Excel section + proveCatch.  
8. Only then: multi-project generator loop + OD word emission (SOURCE design quality).

---

## Acceptance on frozen `2150` (no full re-bake required for 1–6; 9 needs PCB_STAGE re-run or offline prove on state)

| Check | Pass criterion |
|---|---|
| Excel rebuild | PCB readiness **ENGINEERING DRAFT** (not FAB-READY) |
| Fitness / banner | Mentions package_family / non-fab tiers or architecture gaps |
| Generator unit | `4-2489541-7` not `mpn_package_only` |
| Generator unit | `usb_power_entry` ≠ `PinHeader_*` |
| `evaluatePcbDesignFitness(2150 arch, evidence)` | `ok: false`, OD channel finding |
| `evaluatePcbGate(2150 pcb after fields)` | fires OR Excel already DRAFT |
| Selftest | `python3 scripts/build-excel-export.py --selftest` green with **inverted** 10+5+1 case |
| Firmware (after Fix 9) | `state.pcb.firmwareProof` present; OD target skipped/unfit; no bare `FAB-READY`; no `FUNCTIONALLY VERIFIED` |

---

## What not to do

- Do not invent HAT stir/pump MPNs to raise coverage.  
- Do not paste Pioreactor KiCad into the emitter.  
- Do not “fix” FAB-READY by lowering the 80% coverage bar or re-adding `package_family` to `_PCB_FAB_VERIFIED_TIERS`.  
- Do not claim FUNCTIONALLY VERIFIED without HIL.  
- Do not call `prove_spec` when `design_fitness_ok` is false and treat a skipped run as PASS.  
- Do not pipe thin `deriveFirmwareProofSpecs` JSON straight into `firmware_proof.py` — it will fail schema/`mcu` checks; build the fat contract explicitly.

---

## Quick file checklist

- [ ] `scripts/build-excel-export.py` — Fix 1 (+ consume designFitness / multiBoardMerged / firmwareProof banner)  
- [ ] `src/lib/pdf-engine-v2/lib/pcb/pcb-manufacturer-pinouts.ts` — Fix 2a denylist export  
- [ ] `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts` — Fix 2b, 3a–3c  
- [ ] `src/lib/pdf-engine-v2/lib/pcb/pcb-design-fitness.ts` — Fix 4b empty words  
- [ ] `scripts/serial-design-chain-v2.tsx` — Fix 4a wire, Fix 5 flag, **Fix 9 call site**  
- [ ] `src/lib/pdf-engine-v2/lib/pcb/pcb-gate.ts` (+ types) — Fix 6 + firmware fire  
- [ ] `pcb-firmware-proof-contract.ts` (new) — fat contract bridge  
- [ ] `pcb-firmware-proof-runner.ts` (new) — spawn/import `firmware_proof.prove_spec`  
- [ ] Tests: excel `_selftest`, `pcb-gate.test.ts`, pinouts/generator jest, `pcb-design-fitness.test.ts`, firmware bridge + banner proveCatch  
- [ ] Keep `prototypes/pcb-firmware-proof/` unittest green
