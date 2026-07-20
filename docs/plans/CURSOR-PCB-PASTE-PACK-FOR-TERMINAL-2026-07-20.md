# Cursor → Terminal — PCB paste pack (tip-synced)

**Date:** 2026-07-20 ~18:20  
**Tip verified against:** `e4d8438c7` (`oxccu-efuel`)  
**Purpose:** Exact code Terminal can land without re-deriving the generator/gate bugs. Universal only — no `if organoid`.  
**Fixture for proveCatch:** `out/organoid-bioreactor-20260719-2150/` (known-bad shape).  
**Supersedes for PCB execution:** skim `CURSOR-HEAVY-LIFTING-…` P3/P4/P9b sections — **this doc is the PCB-only source of truth at tip.**

---

## Status at tip (do not re-do)

| Item | Status | SHA / note |
|---|---|---|
| P1 / Fix 1 — `package_family` weight + FAB tiers | ✅ | `5acaf3416` |
| P2 / Fix 4 — OD arch gap → DRAFT | ✅ | `5acaf3416` |
| P9a — FAB-READY banner honesty + KeyError | ✅ | `1da05fa4d` |
| Excel reads `state.pcb.firmwareProof` | ✅ | present; always empty until P9b |
| Curated reject of TE `4-2489541-7` in pinouts | ⚠ dead | `pcb-manufacturer-pinouts.ts:400` — never consulted on DB-MPN path |
| P3 TE LED denylist on MPN path | ⬜ | **do now** |
| P4 USB ≠ PinHeader | ⬜ | **do now** |
| Fix 4 wire — `evaluatePcbDesignFitness` in chain | ⬜ | function exists; **not called** in `serial-design-chain-v2.tsx` |
| P5 multi-board → one KiCad | ⬜ | chain ~9977–9987 |
| P6 Gate 38 beyond coverage | ⬜ | `pcb-gate.ts` |
| P7 interface-critical roles | ⬜ | after P3/P4 |
| P9b firmware Tier-0 wire | ⬜ | after fitness wire |

---

## Recommended commit order (minimal thrash)

```
1. P3  — denylist + resolveComponent early-out          (~30 min)
2. P4  — usb/debug split + PinHeader ban                 (~45 min)
3. P4b — wire evaluatePcbDesignFitness → state.pcb       (~20 min)
4. P5  — multiBoardMerged flag + Excel DRAFT             (~30 min)
5. P6  — Gate 38 consumes fitness + multiBoardMerged     (~30 min)
6. P9b — fat contract + runner + chain write             (~90 min)
7. P7  — interface-critical (optional tightening)        (~30 min)
```

Do **not** start a fresh “ships 9” bake until P3+P4+P5 proveCatch green on 2150 shape.

---

## P3 — TE `4-2489541-7` must never become `mpn_package_only`

### Root cause (tip)

```
BoM word: TE + 4-2489541-7
  → resolveComponent Tier (a)  atopile-generator.ts:984–994
  → resolveViaMpn() = lookupCached → verified:true + description text
  → footprint from package text / LED_0603 → tier mpn_package
  → a.5 skipped because mpnVerified
  → line 1072–1074 promotes to mpn_package_only
  → curated reject at pcb-manufacturer-pinouts.ts:400 NEVER RUNS
```

### File 1 — `src/lib/pdf-engine-v2/lib/pcb/pcb-manufacturer-pinouts.ts`

Add after the `normalized()` helper (near top). Keep the existing special-case inside `resolveCuratedManufacturerIdentity` (belt).

```typescript
/** INTENT: Distributor-cache hits are not placement authority. Some verified MPNs
 *  are panel/industrial parts that must never land on a PCBA role footprint. */
const PCB_MPN_DENYLIST = new Map<string, string>([
  [
    normalized('4-2489541-7'),
    '4-2489541-7 is a 110 V DC panel indicator — not an SMD PCB LED; deny placement even if distributor cache verifies the MPN',
  ],
])

/**
 * @description Returns a human reason if this MPN must not be placed on a PCB, else null.
 * @param partNumber Catalogue / BoM part number
 * @returns Deny reason string, or null when placement is allowed to proceed
 */
export function isDeniedPcbMpn(partNumber: string | null | undefined): string | null {
  if (!partNumber) return null
  return PCB_MPN_DENYLIST.get(normalized(partNumber)) ?? null
}
```

### File 2 — `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts`

Import `isDeniedPcbMpn` from `./pcb-manufacturer-pinouts`.

**Replace Tier (a) block at ~983–994** with:

```typescript
  // Tier (a): MPN-driven — DENYLIST first (P3)
  // INTENT: lookupCached verifies catalogue identity, not "safe to place as this role".
  // TE 4-2489541-7 is a 110 V panel indicator that previously became mpn_package_only
  // on LED_0603 because curated pinout reject never ran on this path.
  if (partNumber) {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      // Do NOT set footprint from the denylisted MPN's package text.
      // Fall through to curated identity (a.5) then package/function-class.
    } else {
      const mpnResult = resolveViaMpn(manufacturer, partNumber)
      mpnVerified = mpnResult.verified
      if (mpnResult.packageText) {
        const resolved = resolveFootprintByPackageText(mpnResult.packageText, functionClass, footprintsRoot)
        if (resolved) {
          footprint = resolved.ref
          tier = 'mpn_package'
        }
      }
    }
  }
```

**Replace the promote-to-`mpn_package_only` block at ~1072–1074** with:

```typescript
  // INTENT: Catalogue-verified string without symbol/pinout is mpn_package_only —
  // unless the MPN is denylisted for PCB placement (P3 belt-and-braces).
  if (partNumber && mpnVerified && !identityVerified && tier !== 'unresolved') {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      resolvedPartNumber = null
      if (tier === 'mpn_package' || tier === 'mpn_package_only') {
        const fb = functionClass ? FUNCTION_CLASS_DEFAULTS[functionClass] : null
        if (fb) {
          const resolved = resolveFootprintByGlob(footprintsRoot, fb.library, fb.filenameTest)
          footprint = resolved
          tier = fb.resolutionTier
        } else {
          return {
            unresolved: {
              wordId: word.wordId,
              nameHuman: word.nameHuman,
              characterId: word.characterId,
              reason: denyReason,
            },
          }
        }
      }
    } else {
      tier = 'mpn_package_only'
    }
  }
```

### proveCatch

**`pcb-manufacturer-pinouts.test.ts`** (add):

```typescript
import { isDeniedPcbMpn } from './pcb-manufacturer-pinouts'

it('denies TE panel indicator MPN for PCB placement (P3)', () => {
  expect(isDeniedPcbMpn('4-2489541-7')).toMatch(/panel indicator/i)
  expect(isDeniedPcbMpn('ATSAMD21G18A-AU')).toBeNull()
})
```

**`atopile-generator.test.ts`** (add — use whatever export you already use to resolve a single word; if only `generateAtopileProject` is exported, wrap a one-word design):

```typescript
it('P3: TE 4-2489541-7 never lands as mpn_package_only on an LED role', () => {
  // word: characterId power_indicator_led / status_indicator,
  // modifiers manufacturer TE Connectivity, part_number 4-2489541-7, form LED_0603
  // Assert:
  //   component.resolutionTier !== 'mpn_package_only'
  //   component.partNumber !== '4-2489541-7'   // cleared or replaced by curated LED
  // Prefer: curated Kingbright KPT-1608CGCK if a.5 finds it (already in pinouts)
})
```

**Commit message sketch:**
```
fix(pcb/P3): denylist TE 4-2489541-7 on MPN resolve path

Root: curated pinout reject never ran after lookupCached verified the MPN.
Guard: isDeniedPcbMpn before resolveViaMpn + belt before mpn_package_only.
proveCatch: pinouts unit + generator LED role fixture.
```

---

## P4 — `usb_power_entry` must not resolve to `PinHeader_*`

### Root cause (tip)

`FUNCTION_CLASS_RULES` line ~139 bundles USB **and** debug → one class `usb_connector`.  
`FUNCTION_CLASS_DEFAULTS.usb_connector` (~365–374) is literally `PinHeader_1x04`.  
Package-text path already knows USB-C (`~503–506`) but Tier (c) default wins when no package text.

KiCad on this host **has** receptacles under  
`/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints/Connector_USB.pretty/`  
(e.g. `USB_C_Receptacle_Amphenol_12401610E4-2A.kicad_mod` — also the OpenDrop gold MPN family).

### File — `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts`

**1. Extend `FunctionClass` union (~110):**

```typescript
  | 'usb_connector'
  | 'debug_connector'   // NEW — SWD/UART headers may use PinHeader; USB must not
  | 'battery_connector'
```

**2. Split the classifier rule (~139):**

```typescript
  // BEFORE (one rule — USB power entry silently becomes PinHeader):
  // { id: 'usb_connector', test: /usb...|debug...|uart.../i },

  { id: 'usb_connector', test: /usb[_-]?(?:interface|power|connector|receptacle|port|entry)|type[_-]?c/i },
  { id: 'debug_connector', test: /debug[_-]?(?:interface|header|uart)|swd[_-]?header|uart[_-]?header|jtag[_-]?header/i },
```

**3. Replace `FUNCTION_CLASS_DEFAULTS.usb_connector` and add `debug_connector` (~365):**

```typescript
  usb_connector: {
    library: 'Connector_USB',
    // Prefer real receptacle; glob miss → unresolved (honest), never PinHeader.
    filenameTest: /^USB_C_Receptacle_.*\.kicad_mod$/i,
    designatorPrefix: 'J',
    pins: ['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2'],
    powerPin: 'VBUS',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  debug_connector: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\.54mm_Vertical\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['SWDIO', 'SWCLK', 'GND', 'VCC'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
```

**4. AREA map (~433) — add:**

```typescript
  usb_connector: 32, debug_connector: 20, battery_connector: 32, display_module: 600,
```

**5. Fail-closed PinHeader ban — insert just before the success `return { component: {…} }` (~1086):**

```typescript
  // P4: USB power/interface roles must never ship as debug pin headers.
  const fpName = footprint.footprint ?? ''
  if (
    /usb[_-]?(?:power|interface|connector|entry|receptacle|port)/i.test(word.characterId)
    && /PinHeader/i.test(fpName)
  ) {
    return {
      unresolved: {
        wordId: word.wordId,
        nameHuman: word.nameHuman,
        characterId: word.characterId,
        reason:
          'usb_power_entry cannot use PinHeader_* — need a USB receptacle footprint/MPN or leave unresolved',
      },
    }
  }
```

**6. Export `classifyFunction` for unit tests** (optional but clean):

```typescript
export function classifyFunction(characterId: string): FunctionClass | null {
```

### proveCatch

```typescript
expect(classifyFunction('usb_power_entry')).toBe('usb_connector')
expect(classifyFunction('usb_power_interface')).toBe('usb_connector')
expect(classifyFunction('debug_header')).toBe('debug_connector')
expect(classifyFunction('debug_uart_header')).toBe('debug_connector')

// resolve usb_power_entry with no MPN:
//   footprint.library === 'Connector_USB' OR unresolved
//   never /PinHeader/
```

**GOTCHA:** Existing tests that expect `usb_power_interface_word` off-board via instrument COTS heuristics (`atopile-generator.test.ts` ~582–598) must keep passing — P4 only changes **on-board** resolution when the word is in `requiredWordIds`. Do not force USB on-board for host-module products.

**Commit message sketch:**
```
fix(pcb/P4): split usb_connector vs debug_connector; ban PinHeader for USB

Root: usb_power_entry shared PinHeader_1x04 default with SWD headers.
Default USB → Connector_USB / USB_C_Receptacle_*; fail closed if PinHeader.
proveCatch: classifyFunction + resolve never PinHeader for usb_* roles.
```

---

## P4b — Wire `evaluatePcbDesignFitness` (unblocks P6 + P9b)

**Fact at tip:** `evaluatePcbDesignFitness` exists in `pcb-design-fitness.ts` and has unit tests, but **`serial-design-chain-v2.tsx` never calls it.** P9b’s fat contract correctly requires `design_fitness_ok: true` — without this wire, firmware proof always fail-closes (honest but silent).

### File — `scripts/serial-design-chain-v2.tsx` inside bespoke/`canAuthor` block, **after** `genResult` (~9987) and **before** `runPcbPipeline`:

```typescript
import { evaluatePcbDesignFitness } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-design-fitness'

const designFitness = evaluatePcbDesignFitness(architecture, {
  generatedComponents: genResult.components,
  unresolved: genResult.unresolved,
  offBoard: genResult.offBoard,
})
stPcb.pcb.designFitness = designFitness
pcb.designFitness = designFitness
console.error(
  `[chain] PCB designFitness: ok=${designFitness.ok} findings=${designFitness.findings?.length ?? 0}`,
)
```

*(Adjust the second-arg shape to match `evaluatePcbDesignFitness`’s real signature in `pcb-design-fitness.ts` — do not invent fields; read the export.)*

Extend `PcbStageResult` (or the loose `state.pcb` type) with optional `designFitness`.

---

## P5 — Multi-board smash → honesty flag (short-term)

### Root (tip `serial-design-chain-v2.tsx` ~9974–9987)

```typescript
const onBoardWordIds = [...new Set(architecture.boards.flatMap(...))]  // ALL boards
const primaryBoard = … wet_lab_hat …                                 // ONE shape
generateAtopileProject(..., { requiredWordIds: onBoardWordIds, boardShape: primaryBoard?.shape })
```

Architecture can require 3 KiCad deliverables; chain emits one 60×60 project.

### Short-term (land with P4b — honesty, not full multi-project)

```typescript
const kicadBoards = architecture.boards.filter((b) => b.requiresKiCadDeliverable)
const multiBoardMerged = kicadBoards.length > 1
stPcb.pcb.multiBoardMerged = multiBoardMerged
pcb.multiBoardMerged = multiBoardMerged
if (multiBoardMerged) {
  console.error(
    `[chain] PCB honesty: multiBoardMerged=true (${kicadBoards.length} KiCad boards → one project)`,
  )
}
```

### Excel (`scripts/build-excel-export.py` readiness path)

Where architecture gaps already floor to ENGINEERING DRAFT, also:

```python
if pcb.get("multiBoardMerged") is True:
    n_architecture_gaps += 1
    # why += "multi-board architecture collapsed into one KiCad project"
```

### Medium-term (separate PR — real fix)

```typescript
for (const board of kicadBoards.filter((b) => b.requiredWordIds.length > 0)) {
  const boardDir = resolve(outDir, 'pcb-project', board.boardId)
  generateAtopileProject(stPcb, boardDir, {
    requiredWordIds: board.requiredWordIds,
    boardShape: board.shape,
    requiredFunctionRoles: board.channelRequirements.map((r) => r.role),
  })
  // run pipeline per board; record state.pcb.pipelinesByBoard[board.boardId]
}
// Empty-word boards (OD) stay architecture gaps — do NOT generate empty KiCad to fake coverage.
```

Do **not** block P3/P4 on the medium-term loop.

---

## P6 — Gate 38 beyond `pipeline.ok` + coverage

**File:** `src/lib/pdf-engine-v2/lib/pcb/pcb-gate.ts`  
Coverage check already exists (~80–104). After it passes, **before** `return clean_board`:

```typescript
  // P6: toolchain hygiene ≠ architecture fitness
  const fitness = (pcb as { designFitness?: { ok?: boolean; findings?: Array<{ severity?: string; message?: string }> } }).designFitness
  if (fitness && fitness.ok === false) {
    const highs = (fitness.findings ?? []).filter((f) => f.severity === 'high')
    if (highs.length > 0) {
      return {
        applicable: true,
        fires: true,
        reason: 'clean_toolchain_but_architecture_unfit',
        details: highs.slice(0, 5).map((f) => f.message ?? 'architecture unfit'),
      }
    }
  }

  if ((pcb as { multiBoardMerged?: boolean }).multiBoardMerged === true) {
    return {
      applicable: true,
      fires: true,
      reason: 'clean_toolchain_but_multi_board_merged',
      details: [
        'architecture requires multiple KiCad deliverables but only one project was generated',
      ],
    }
  }
```

Extend `PcbStageResult` with optional `designFitness?: …` and `multiBoardMerged?: boolean`.

### proveCatch (add to `pcb-gate.ts` `__main__` / `pcb-gate.test.ts`)

```typescript
// clean pipeline + designFitness.ok=false + HIGH finding → fires
// clean pipeline + multiBoardMerged=true → fires
// clean single-board + fitness.ok=true + coverage OK → does not fire
```

Shadow default stays; Excel DRAFT from P1/P5 already matches the fire.

---

## P7 — Interface-critical roles without catalogue MPN (after P3/P4)

Generator-side (preferred — creates electronic gaps Fix 1 already floors):

In `resolveComponent`, after Tier (c) succeeds with `package_family` / `function_class` and **no** `mpnVerified`:

```typescript
const INTERFACE_CRITICAL =
  /usb[_-]?(?:power|interface|connector|entry)|power[_-]?indicator[_-]?led|status[_-]?indicator|esd[_-]?protection|(?:^|[_-])mcu(?:$|[_-])|firmware[_-]?storage|poly[_-]?fuse|current[_-]?limit/i

if (
  !mpnVerified
  && INTERFACE_CRITICAL.test(word.characterId)
  && (tier === 'package_family' || tier === 'function_class')
) {
  return {
    unresolved: {
      wordId: word.wordId,
      nameHuman: word.nameHuman,
      characterId: word.characterId,
      reason:
        `interface-critical role '${word.characterId}' requires a catalogue MPN — package_family default is not enough`,
    },
  }
}
```

**Do after P4** so USB gets a real receptacle **or** unresolved — not PinHeader then unresolved.

---

## P9b — Tier-0 firmware proof wire (MVP)

**Doctrine:** Max honest claim without HIL = `FAB-READY — UNPROVEN IN HARDWARE`. Never emit `FUNCTIONALLY VERIFIED` from Tier-0 alone. Excel already reads `firmwareProof` (~17521).

**Prerequisite:** P4b (`designFitness` on state).

### New — `src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-runner.ts`

```typescript
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * INTENT: Invoke prototypes/pcb-firmware-proof/firmware_proof.py prove
 * without live distributor imports. Fail closed on spawn/validate errors.
 *
 * CLI (verified): python3 firmware_proof.py prove <spec.json> --out <dir>
 */
export function runTier0FirmwareProof(
  fatSpec: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
): { ok: boolean; skipped?: boolean; reason?: string; resultPath?: string } {
  fs.mkdirSync(outDir, { recursive: true })
  const specPath = path.join(outDir, 'proof-spec.json')
  fs.writeFileSync(specPath, JSON.stringify(fatSpec, null, 2))
  const py = path.join(repoRoot, 'prototypes/pcb-firmware-proof/firmware_proof.py')
  if (!fs.existsSync(py)) {
    return { ok: false, skipped: true, reason: 'firmware_proof.py missing' }
  }
  const r = spawnSync('python3', [py, 'prove', specPath, '--out', outDir], {
    encoding: 'utf8',
    timeout: 120_000,
  })
  const resultPath = path.join(outDir, 'proof-result.json')
  if (r.status !== 0) {
    return {
      ok: false,
      reason: `firmware_proof exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 400)}`,
      resultPath: fs.existsSync(resultPath) ? resultPath : undefined,
    }
  }
  try {
    const j = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as { ok?: boolean }
    return { ok: j.ok === true, resultPath }
  } catch {
    return { ok: false, reason: 'proof-result.json missing/unparseable', resultPath }
  }
}
```

### New — `src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract.ts`

Tune against `prototypes/pcb-firmware-proof/fixtures/` until `prove` accepts a synthetic good board. Skeleton:

```typescript
import type { PcbFirmwareProofSpec } from './pcb-firmware-proof-spec'

/**
 * INTENT: Thin architecture sketch → fat contract firmware_proof.py validates.
 * Incomplete pin evidence → pin_contract_complete:false (fail closed).
 */
export function buildFirmwareProofContract(args: {
  thin: PcbFirmwareProofSpec
  designFitnessOk: boolean
  mcu?: { mpn: string; manufacturer?: string }
  components: Array<{ wordId: string; refdes?: string; mpn?: string | null; characterId?: string }>
}): Record<string, unknown> {
  const { thin, designFitnessOk, mcu, components } = args
  const channels = thin.channels.map((ch, i) => ({
    channel_id: `${ch.role}_${i}`,
    role: ch.role,
    required_count: ch.requiredCount,
    instances: Array.from({ length: Math.max(0, ch.requiredCount) }, (_, k) => ({
      instance_id: `${ch.role}_${k}`,
      enable_net: `${ch.role.toUpperCase()}_EN_${k}`,
      output_net: `${ch.role.toUpperCase()}_OUT_${k}`,
    })),
  }))
  const pinComplete = Boolean(mcu?.mpn) && designFitnessOk
  return {
    schema: 'pcb-firmware-proof-spec/v1',
    proof_target_id: thin.proofTargetId,
    kind: thin.kind === 'cots_host_integration' ? 'cots_host_integration' : 'custom_board',
    design_fitness_ok: designFitnessOk,
    mcu: mcu
      ? { mpn: mcu.mpn, toolchain: 'native-draft', pin_contract_complete: pinComplete }
      : { mpn: 'UNKNOWN', toolchain: 'native-draft', pin_contract_complete: false },
    buses: [{
      bus_id: 'uart0',
      protocol: 'uart',
      pins: ['TX', 'RX', 'GND'],
      expected_devices: [],
    }],
    components: components
      .filter((c) => Boolean(c.mpn))
      .map((c) => ({
        word_id: c.wordId,
        refdes: c.refdes ?? 'U?',
        mpn: c.mpn,
        driver_key: 'generic',
        identity_check: 'mpn_match',
      })),
    channels,
    actuators: [],
    communications: [{
      kind: 'uart_banner',
      expected_banner_prefix: `PROOF|${thin.proofTargetId}|`,
    }],
  }
}
```

**GOTCHA:** Read `validate_spec` in `firmware_proof.py` and match required keys exactly (dangerous domains, actuator two-step, etc.). Prefer starting from a fixture copy and deleting fields until the builder matches.

### Wire — `scripts/serial-design-chain-v2.tsx` after pipeline record (~10020), still inside bespoke block:

```typescript
import { deriveFirmwareProofSpecs } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-spec'
import { buildFirmwareProofContract } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract'
import { runTier0FirmwareProof } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-runner'

const thinSpecs = deriveFirmwareProofSpecs(architecture)
const proofResults: Array<{ target: string; result: ReturnType<typeof runTier0FirmwareProof> }> = []
for (const thin of thinSpecs) {
  const mcuComp = genResult.components.find((c) =>
    /mcu|microcontroller/i.test(String(c.characterId ?? c.functionClass ?? '')))
  const fat = buildFirmwareProofContract({
    thin,
    designFitnessOk: designFitness?.ok === true,
    mcu: mcuComp?.partNumber
      ? { mpn: mcuComp.partNumber, manufacturer: mcuComp.manufacturer ?? undefined }
      : undefined,
    components: genResult.components.map((c) => ({
      wordId: c.wordId,
      refdes: c.instanceName,
      mpn: c.partNumber,
      characterId: c.characterId ?? undefined,
    })),
  })
  const proofOut = resolve(pcbProjectDir, 'firmware-proof', thin.proofTargetId)
  const result = designFitness?.ok === true
    ? runTier0FirmwareProof(fat, proofOut, process.cwd())
    : { ok: false as const, skipped: true, reason: 'design_fitness_ok_false' }
  proofResults.push({ target: thin.proofTargetId, result })
}
stPcb.pcb.firmwareProof = {
  schema: 'pcb-firmware-proof-stage/v1',
  tier: 0,
  results: proofResults,
  allOk: proofResults.every((r) => r.result.ok === true),
}
```

### Excel confirm

If hygiene+tiers would say FAB-READY but `firmwareProof.allOk !== true` → keep  
`FAB-READY — UNPROVEN IN HARDWARE` (P9a path). Never upgrade to FUNCTIONALLY VERIFIED without HIL field.

### proveCatch

- Synthetic fat contract from good fixture → `runTier0FirmwareProof` ok  
- 2150-shaped unfit design → `firmwareProof.allOk === false`, readiness ≠ bare `FAB-READY`, ≠ `FUNCTIONALLY VERIFIED`

---

## Verification commands (after each commit)

```bash
# P3
npx vitest run src/lib/pdf-engine-v2/lib/pcb/pcb-manufacturer-pinouts.test.ts
npx vitest run src/lib/pdf-engine-v2/lib/pcb/atopile-generator.test.ts

# P4
npx vitest run src/lib/pdf-engine-v2/lib/pcb/atopile-generator.test.ts

# P6
npx tsx src/lib/pdf-engine-v2/lib/pcb/pcb-gate.ts   # or vitest pcb-gate.test.ts
bash scripts/verify-engine-guards.sh                 # if you add proveCatch there

# P9b smoke
python3 prototypes/pcb-firmware-proof/firmware_proof.py prove \
  prototypes/pcb-firmware-proof/fixtures/<good>.json --out /tmp/fw-proof-smoke
```

Re-score frozen 2150 Excel after P3–P5 (no full chain needed if you patch `state.pcb` generator components for unit proveCatch; for integration, `PCB_STAGE=1` re-run from settled state if you have a resume hook — otherwise full PCB_STAGE chain on a cheap instrument brief).

---

## What Cursor can still do for you

Earlier you asked Cursor to land P3+P4 on `cursor-pcb`. Tristan’s latest ask was this recommendation pack.

**If you want Cursor to execute P3+P4 (and optionally P4b) on `cursor-pcb` and push a branch for you to merge:** reply in the inbox `WAITING_ON_CURSOR` + “land P3+P4 on cursor-pcb”.  
**If you want to paste yourself:** this doc is enough — start at P3.

Cursor will **not** race you on `oxccu-efuel` tip unless you ask.

---

## Punchlist rows to flip when landed

| ID | When ✅ |
|---|---|
| P3 | denylist + generator proveCatch green |
| P4 | USB/debug split + PinHeader ban proveCatch green |
| P4b / Fix4-wire | `state.pcb.designFitness` present on PCB_STAGE runs |
| P5 | `multiBoardMerged` + Excel DRAFT |
| P6 | gate fires on unfit / merged; proveCatch both directions |
| P7 | interface-critical → unresolved without MPN |
| P9b | `state.pcb.firmwareProof` written; banner UNPROVEN; no FUNCTIONALLY VERIFIED |
