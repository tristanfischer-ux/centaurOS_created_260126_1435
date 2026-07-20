# Cursor → Terminal — heavy-lifting pack (paste-ready code)

**Date:** 2026-07-20 ~17:25  
**Purpose:** Specific diffs Terminal can land with minimal design time. Universal only.  
**Fixture:** `out/organoid-bioreactor-20260719-2150/`  
**Order:** P3 → P4 → P9b (minimal) → F1f Layer-0+hard-veto → S12 → V1 proveCatch → D1 → S6

Related packs (background): `CURSOR-PCB-HONESTY-FIXES-…` (Fixes 2–9), `CURSOR-DESIGN-IDENTITY-SCALE-LOCK-…`, afternoon audit.

---

## P3 — TE `4-2489541-7` must never become `mpn_package_only`

**Root:** `resolveComponent` trusts `resolveViaMpn` then skips curated identity (`atopile-generator.ts` ~984–1027). Pinout reject at `pcb-manufacturer-pinouts.ts:400` never runs on that path.

### File 1: `src/lib/pdf-engine-v2/lib/pcb/pcb-manufacturer-pinouts.ts`

Add near top (after `normalized` helper) and **export**:

```typescript
/** INTENT: Distributor-cache hits are not placement authority. Some verified MPNs
 *  are panel/industrial parts that must never land on a PCBA LED/role footprint. */
const PCB_MPN_DENYLIST = new Map<string, string>([
  [
    normalized('4-2489541-7'),
    '4-2489541-7 is a 110 V DC panel indicator — not an SMD PCB LED; deny placement even if distributor cache verifies the MPN',
  ],
])

/**
 * @description Returns a human reason if this MPN must not be placed on a PCB, else null.
 * @param partNumber Catalogue / BoM part number
 */
export function isDeniedPcbMpn(partNumber: string | null | undefined): string | null {
  if (!partNumber) return null
  return PCB_MPN_DENYLIST.get(normalized(partNumber)) ?? null
}
```

Keep the existing `resolveCuratedManufacturerIdentity` special-case; denylist is the early gate.

### File 2: `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts`

Import `isDeniedPcbMpn`. Replace the Tier (a) block (~983–994):

```typescript
  // Tier (a): MPN-driven — DENYLIST first (Fix 2 / P3)
  if (partNumber) {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      // Do NOT set footprint from package text of the denylisted MPN.
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

Belt-and-braces before `tier = 'mpn_package_only'` (~1072):

```typescript
  if (partNumber && mpnVerified && !identityVerified && tier !== 'unresolved') {
    const denyReason = isDeniedPcbMpn(partNumber)
    if (denyReason) {
      mpnVerified = false
      identityBlocker = denyReason
      // Keep footprint only if it came from curated/function-class, not the denied MPN path
      if (tier === 'mpn_package' || tier === 'mpn_package_only') {
        // Force re-resolve via function-class default for LEDs
        const fb = functionClass ? FUNCTION_CLASS_DEFAULTS[functionClass] : null
        if (fb) {
          const resolved = resolveFootprintByGlob(footprintsRoot, fb.library, fb.filenameTest)
          footprint = resolved
          tier = fb.resolutionTier
          resolvedPartNumber = null
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

### proveCatch — `pcb-manufacturer-pinouts.test.ts`

```typescript
import { isDeniedPcbMpn } from './pcb-manufacturer-pinouts'

it('denies TE panel indicator MPN for PCB placement', () => {
  expect(isDeniedPcbMpn('4-2489541-7')).toMatch(/panel indicator/i)
  expect(isDeniedPcbMpn('ATSAMD21G18A-AU')).toBeNull()
})
```

Plus a generator unit test (or script selftest) that builds a word:

```typescript
{
  wordId: 'power_indicator_led_word',
  characterId: 'power_indicator_led',
  nameHuman: 'Power indicator LED',
  modifiers: { manufacturer: 'TE Connectivity', part_number: '4-2489541-7', form: 'LED_0603' },
}
```

Assert: `resolutionTier !== 'mpn_package_only'` AND `partNumber !== '4-2489541-7'` (or unresolved with deny reason). Prefer curated `KPT-1608CGCK` if identity path finds it.

---

## P4 — `usb_power_entry` must not resolve to `PinHeader_*`

### File: `src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts`

**1. Split the classifier rule** (~139):

```typescript
// BEFORE (one rule bundles USB + debug → PinHeader):
// { id: 'usb_connector', test: /usb...|debug...|uart.../i },

{ id: 'usb_connector', test: /usb[_-]?(?:interface|power|connector|receptacle|port|entry)|type[_-]?c/i },
{ id: 'debug_connector', test: /debug[_-]?(?:interface|header|uart)|swd[_-]?header|uart[_-]?header|jtag[_-]?header/i },
```

Add `'debug_connector'` to the `FunctionClass` union (~110).

**2. Replace `FUNCTION_CLASS_DEFAULTS.usb_connector` (~365–374):**

```typescript
  usb_connector: {
    library: 'Connector_USB',
    // Prefer real receptacle footprints; if none match → unresolved (honest), never PinHeader.
    filenameTest: /^USB_(?:C_Receptacle|A_Connector|Micro-B).*\\.kicad_mod$/i,
    designatorPrefix: 'J',
    pins: ['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2'],
    powerPin: 'VBUS',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
  debug_connector: {
    library: 'Connector_PinHeader_2.54mm',
    filenameTest: /^PinHeader_1x04_P2\\.54mm_Vertical\\.kicad_mod$/,
    designatorPrefix: 'J',
    pins: ['SWDIO', 'SWCLK', 'GND', 'VCC'],
    powerPin: 'VCC',
    groundPin: 'GND',
    decouple: false,
    resolutionTier: 'package_family',
  },
```

**3. After footprint resolved, before success return (~1086):**

```typescript
  const fpName = footprint.footprint ?? ''
  if (
    /usb[_-]?(?:power|interface|connector|entry)/i.test(word.characterId)
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

### proveCatch

```typescript
expect(classifyFunction('usb_power_entry')).toBe('usb_connector')
expect(classifyFunction('debug_header')).toBe('debug_connector')
// resolveComponent(usb_power_entry, no MPN) → unresolved OR footprint matching /USB_/
// never /PinHeader/
```

If local KiCad lacks USB footprints, **unresolved is correct** — that creates an electronic gap → ENGINEERING DRAFT (already wired by Fix 1).

---

## P9b — Minimal firmware Tier-0 wire (copy-paste skeleton)

Excel already reads `state.pcb.firmwareProof` and maxes at `FAB-READY — UNPROVEN IN HARDWARE`. Wire the runner so `firmwareProof` is not always absent.

### New file: `src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-runner.ts`

```typescript
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * INTENT: Invoke prototypes/pcb-firmware-proof/firmware_proof.py prove_spec
 * without importing live distributor code. Fail closed on spawn/validate errors.
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

### New file: `src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract.ts` (MVP)

```typescript
import type { PcbFirmwareProofSpec } from './pcb-firmware-proof-spec'

/** INTENT: Thin architecture sketch → fat contract firmware_proof.py validates.
 *  Incomplete pin evidence → pin_contract_complete:false (fail closed). */
export function buildFirmwareProofContract(args: {
  thin: PcbFirmwareProofSpec
  designFitnessOk: boolean
  mcu?: { mpn: string; manufacturer?: string }
  components: Array<{ wordId: string; refdes?: string; mpn?: string; characterId?: string }>
}): Record<string, unknown> {
  const { thin, designFitnessOk, mcu, components } = args
  const channels = thin.channels.map((ch, i) => ({
    channel_id: `${ch.role}_${i}`,
    role: ch.role,
    required_count: ch.requiredCount,
    instances: Array.from({ length: ch.requiredCount }, (_, k) => ({
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
      ? {
          mpn: mcu.mpn,
          toolchain: 'native-draft',
          pin_contract_complete: pinComplete,
        }
      : { mpn: 'UNKNOWN', toolchain: 'native-draft', pin_contract_complete: false },
    buses: [
      {
        bus_id: 'uart0',
        protocol: 'uart',
        pins: ['TX', 'RX', 'GND'],
        expected_devices: [],
      },
    ],
    components: components
      .filter((c) => c.mpn)
      .map((c) => ({
        word_id: c.wordId,
        refdes: c.refdes ?? 'U?',
        mpn: c.mpn,
        driver_key: 'generic',
        identity_check: 'mpn_match',
      })),
    channels,
    actuators: thin.domains.includes('thermal') || thin.channels.some((c) => /heater|thermal/i.test(c.role))
      ? [{
          actuator_id: 'thermal_0',
          domain: 'thermal',
          instance_ids: channels.flatMap((c) => c.instances.map((i) => i.instance_id)).slice(0, 1),
          safe_default: 'off',
          requires_two_step_arm: true,
        }]
      : [],
    communications: [{
      kind: 'uart_banner',
      expected_banner_prefix: `PROOF|${thin.proofTargetId}|`,
    }],
  }
}
```

Tune against `prototypes/pcb-firmware-proof/fixtures/good-motion-board.json` until `prove` accepts a synthetic good board; then fail-closed on 2150 (expected: DRAFT until fitness+MCU pinouts complete).

### Wire in `scripts/serial-design-chain-v2.tsx` PCB_STAGE (after architecture + generate + fitness):

```typescript
import { deriveFirmwareProofSpecs } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-spec'
import { buildFirmwareProofContract } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-contract'
import { runTier0FirmwareProof } from '../src/lib/pdf-engine-v2/lib/pcb/pcb-firmware-proof-runner'

// after genResult + designFitness available:
const thinSpecs = deriveFirmwareProofSpecs(architecture)
const proofResults = []
for (const thin of thinSpecs) {
  const mcuComp = genResult.components.find((c: any) =>
    /mcu|microcontroller/i.test(String(c.characterId ?? c.functionClass ?? '')))
  const fat = buildFirmwareProofContract({
    thin,
    designFitnessOk: designFitness?.ok === true,
    mcu: mcuComp?.partNumber
      ? { mpn: mcuComp.partNumber, manufacturer: mcuComp.manufacturer }
      : undefined,
    components: genResult.components.map((c: any) => ({
      wordId: c.wordId,
      refdes: c.designator,
      mpn: c.partNumber,
      characterId: c.characterId,
    })),
  })
  const outDir = path.join(pcbProjectDir, 'firmware-proof', thin.proofTargetId)
  const result = designFitness?.ok === true
    ? runTier0FirmwareProof(fat, outDir, process.cwd())
    : { ok: false, skipped: true, reason: 'design_fitness_ok_false' }
  proofResults.push({ target: thin.proofTargetId, result })
}
stPcb.pcb.firmwareProof = {
  schema: 'pcb-firmware-proof-stage/v1',
  tier: 0,
  results: proofResults,
  allOk: proofResults.every((r) => r.result.ok === true),
}
```

**Excel (already mostly done):** if `firmwareProof.allOk !== true` after fab-tiers OK → keep ENGINEERING DRAFT or disclose UNPROVEN only when `allOk`. Confirm `_pcb_two_axis_assessment` passes `firmware_proof_ok=st.pcb.firmwareProof?.allOk`.

---

## F1f — Design identity lock (Layer 0 + hard tool veto)

### New file: `scripts/lib/orchestrator/design-identity.ts`

```typescript
import type { BriefEnvelope, ParsedConstraints } from './types'

export type DesignScaleTier = 'handheld' | 'benchtop' | 'cabinet' | 'plant' | 'field'

export interface DesignIdentity {
  product_class: string
  scale_tier: DesignScaleTier
  form_factor: string
  enclosure_volume_m3?: number
  max_edge_mm?: number
  peak_electrical_power_w?: number
  working_volume_ml?: number
  identity_locked: true
  basis: string
}

function num(x: unknown): number | undefined {
  const n = typeof x === 'object' && x != null && 'value' in (x as object)
    ? Number((x as { value: unknown }).value)
    : Number(x)
  return Number.isFinite(n) ? n : undefined
}

/** INTENT: Pin scale from brief physics — never from BoM nouns like "heater". */
export function deriveDesignIdentity(
  constraints: ParsedConstraints,
  envelope: BriefEnvelope,
): DesignIdentity {
  const dims = constraints.max_dimensions_mm
  const maxEdge = dims
    ? Math.max(Number(dims.w || 0), Number(dims.d || 0), Number(dims.h || 0))
    : undefined
  const vol =
    maxEdge && dims?.w && dims?.d && dims?.h
      ? (Number(dims.w) * Number(dims.d) * Number(dims.h)) / 1e9
      : undefined
  const peakW = num((constraints.extra as any)?.peak_electrical_power_w)
    ?? num((constraints as any).peak_electrical_power_w)
  const workingMl = num((constraints.extra as any)?.working_volume_ml)
  const nameplate = envelope.nameplate_kwh

  let scale_tier: DesignScaleTier = 'cabinet'
  const basis: string[] = []
  if (vol != null && vol < 1 && ((peakW != null && peakW <= 120) || (workingMl != null && workingMl <= 500))) {
    scale_tier = maxEdge != null && maxEdge <= 155 ? 'handheld' : 'benchtop'
    basis.push(`encl=${vol}m3`, peakW != null ? `P=${peakW}W` : `Vml=${workingMl}`)
  } else if (vol != null && vol >= 1 || (nameplate != null && nameplate >= 10)) {
    scale_tier = 'plant'
    basis.push(vol != null ? `encl=${vol}m3` : `nameplate_kwh=${nameplate}`)
  } else if (envelope.form_factor?.includes('container') || /farm|field/i.test(envelope.application || '')) {
    scale_tier = 'field'
    basis.push(`form=${envelope.form_factor}`)
  }

  return {
    product_class: constraints.product_class || envelope.class,
    scale_tier,
    form_factor: envelope.form_factor,
    enclosure_volume_m3: vol,
    max_edge_mm: maxEdge,
    peak_electrical_power_w: peakW,
    working_volume_ml: workingMl,
    identity_locked: true,
    basis: basis.join(';') || 'envelope_default',
  }
}

export function isLabScale(id: DesignIdentity): boolean {
  return id.scale_tier === 'handheld' || id.scale_tier === 'benchtop'
}
```

### Wire early in `serial-design-chain-v2.tsx` (after envelope / parsedBrief):

```typescript
import { deriveDesignIdentity } from './lib/orchestrator/design-identity'
// ...
state.designIdentity = deriveDesignIdentity(parsedConstraints, envelope)
```

### Hard veto in `scripts/lib/orchestrator/generic/relevance-sweep.ts`

Tag tools that are plant-only (start with a small set in tool defs OR a central map):

```typescript
// In sweepToolRelevance, BEFORE LLM batch:
const PLANT_ONLY_TOOL_RX = /aquaculture|ras-|irrigation:|pressure-vessel:|nutrient-solution:|hvac:load/i
const identity = (opts as any).designIdentity // pass from bootstrap
if (identity && isLabScale(identity)) {
  for (const toolId of catalogueToolIds) {
    if (PLANT_ONLY_TOOL_RX.test(toolId)) {
      verdicts.set(toolId, {
        tool_id: toolId,
        relevant: false,
        reason: 'hard_veto:scale_tier_mismatch',
        source: 'design_identity',
      })
    }
  }
}
```

Pass `designIdentity` from `bootstrap-tool-plan.ts` into `sweepToolRelevance`.

### proveCatch (`design-identity.test.ts`)

```typescript
const id = deriveDesignIdentity(
  { product_class: 'benchtop_bioreactor', product_description: '20 mL heater kit',
    max_dimensions_mm: { w: 120, d: 80, h: 60 },
    extra: { peak_electrical_power_w: 35, working_volume_ml: 20 } } as any,
  { class: 'bioreactor', scale_tier: 'lab', form_factor: 'benchtop', voltage_tier: 'low', application: 'lab' },
)
expect(id.scale_tier).toBe('benchtop')
// relevance: aquaculture tool id → hard_veto on this identity
```

### Gate 34 PLANT_SCALE markers (add to `tool-archetype-coherence-audit.ts`)

```typescript
export const PLANT_SCALE_MARKERS: DomainMarker[] = [
  { id: 'DN process pipe', re: /\bDN\s*(?:25|32|40|50|80|100)\b/i },
  { id: '400V 3ph', re: /\b400\s*V\b.*\b3\b|\b3[\s-]?phase\b.*\b400\b/i },
  { id: 'backwash/underdrain', re: /\bbackwash\b|\bunderdrain\b|\bair\s+scour\b/i },
  { id: 'skid frame', re: /\bskid\s+frame\b/i },
  { id: 'working volume m3', re: /\bworking\s+volume\b[^\n]{0,40}\b\d+(?:\.\d+)?\s*m(?:³|3)\b/i },
]
// Fire when designIdentity.scale_tier ∈ {handheld,benchtop} OR is_device_scale
// Suppress when scale_tier ∈ {plant,field}
```

---

## S12 — Vision critic before Excel

### In `scripts/serial-design-chain-v2.tsx` before Excel export stage:

```typescript
const critiquePath = path.join(outDir, 'render-vision-critique.json')
const isInstrument = Boolean(state.isInstrumentDevice || state.designIdentity && isLabScale(state.designIdentity))
if (isInstrument && !fs.existsSync(critiquePath)) {
  // Prefer: await runRenderVisionCritic(outDir)  // existing scripts/lib/render_vision_critic.py wrapper
  // Fallback if critic cannot run:
  console.error('[chain] S12: instrument run missing render-vision-critique.json — capping Renders')
  state._rendersScoreCapUntilVision = 6
}
```

### In `build-excel-export.py` Renders scorer:

```python
if state.get("_rendersScoreCapUntilVision") and not _render_vision_verdict(run_dir):
    score_cap = min(score_cap or 6.0, 6.0)
```

(S7 already binds instrument+no-critique → ships false; S12 makes the file exist or caps the tab.)

---

## V1 — Adversarial vision proveCatch (instrument Lego)

### File: `scripts/lib/render_vision_critic.py` (or sibling selftest)

Add instrument checks that fire on frozen 2150 PNGs without needing a flaky LLM:

```python
def instrument_geometry_adversarial(png_path: str) -> list[str]:
    """Deterministic SIGHT proxies for Lego-blockout heroes.
    INTENT: catastrophe-only broken=false must not green-wash cuboid kits."""
    defects = []
    im = Image.open(png_path).convert("RGB")
    # Example proxies (tune thresholds on gold colorimeter vs 2150):
    # - edge density too low → smooth cuboid
    # - colour variance too low → clay slab
    # - aspect: near-square blob with no optical-cube step
    ...
    return defects

def proveCatch_instrument_lego():
    bad = "out/organoid-bioreactor-20260719-2150/04-*.png"  # resolve glob
    good = "out/colorimeter-*/04-*.png"  # known better
    assert instrument_geometry_adversarial(bad), "2150 exterior must flag defects"
    # good may still warn; must not be empty-defect broken=false elevator to 10
```

Wire: if deterministic defects non-empty → write/merge into `render-vision-critique.json` as `broken: true` **or** force Renders `score_cap≤4` even when LLM said broken:false with empty checklist.

---

## D1 — Interconnect edge-label domain

### File: `scripts/blender-universal/connection_sizing.py` (or schedule writer)

```python
_ROLE_DOMAIN = {
    "led": "optical",
    "photodiode": "optical",
    "peltier": "thermal",
    "heater": "thermal",
    "pump": "fluid",
}

def edge_label_domain_ok(from_role: str, to_role: str, label: str) -> bool:
    """J-LED:VLED must not terminate on a Peltier net."""
    lf, lt = _ROLE_DOMAIN.get(from_role, ""), _ROLE_DOMAIN.get(to_role, "")
    if lf and lt and lf != lt:
        return False
    if re.search(r"VLED|LED_", label, re.I) and "peltier" in (to_role + from_role).lower():
        return False
    return True
```

On fail: mark `within_spec=False`, note `"domain mismatch: optical label on thermal endpoint"`, and have drawing/interconnect gate count it as FAIL (not skipped).

proveCatch: synthetic edge LED→Peltier label `J-LED:VLED` → fail.

---

## S6 — Gate 32 unit-family band (device)

### File: `src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit.ts`

When `denom.family === 'unit'` (or dimensionless per-unit) **and** device-scale:

```typescript
// After band lookup (~619):
if (denom.family === 'unit' || denom.family === 'each') {
  const ceiling = /* from brief unit_cost_ceiling */
  const oem = /* from costStack */
  if (ceiling && oem && oem > ceiling * 1.02) {
    // HIGH — same signal as S4; Gate 32 must not claim PASS on £5M/unit band
    findings.push({
      severity: 'HIGH',
      reason: `device unit cost £${oem} > brief ceiling £${ceiling} — ignore INDUSTRY £100–£5M/unit band`,
    })
  }
}
```

Narrow or replace `INDUSTRY_COST_BANDS.unit` upper bound for instrument/device runs — do **not** use £5M/unit as a soft PASS when brief ceiling exists.

---

## Housekeeping (30 seconds)

1. Punchlist **F1e** row: flip 🔴 → ✅ SHA `50b9c8938` (rework landed).  
2. Commit this file if you use it as source of truth.  
3. After P3/P4: re-run generator on frozen 2150 `state.json` PCB slice (or full PCB_STAGE) and SIGHT: LED ≠ TE panel MPN; USB ≠ PinHeader.

---

## Suggested commit sequence

```
1. fix(pcb): P3 denylist TE 4-2489541-7 on MPN path + proveCatch
2. fix(pcb): P4 split usb_connector vs debug_connector; ban PinHeader on usb_*
3. feat(pcb): P9b Tier-0 firmware runner + state.pcb.firmwareProof wire
4. feat(identity): F1f designIdentity + relevance hard veto + PLANT_SCALE markers
5. fix(chain): S12 vision-before-Excel / Renders cap
6. test(vision): V1 deterministic Lego proveCatch on 2150 PNGs
7. fix(interconnect): D1 edge-label domain
8. fix(gate32): S6 device unit-cost vs ceiling, not £5M band
```

Each commit: `regression-harness:` line + selftest green.

---

## What Cursor already did vs what you paste

| Item | Status |
|---|---|
| P1/P2/P9a/S7/S4/F1e reworks | You landed |
| P3/P4/P9b/F1f/S12/V1/D1/S6 | **This pack = paste-ready** |
| Form B1/B5 | Still needs geometry work — see `CURSOR-DB-AND-FORM-AUDITS-…` Part B; not duplicated here |

HOLD on `cursor-pcb` unless you ask Cursor to land P3/P4 on that branch.
