/**
 * @file instrument-device-flag.ts
 * @description Pure resolution of `isInstrumentDevice` for MPN fill / industrial scrub.
 *
 * INTENT (cold-v12 BoM disease): the chain stamped the flag from
 * `engineeringContract.quantities.enclosure_volume_m3` alone. Consumer-electronics /
 * generic builders leave that slot empty while `orchestratorContract` already carries
 * `derived_device_scale` volume (~0.09 m³). Flag stayed false → FN3359-class 400 A
 * 3φ EMI filters pinned onto a 5 A IEC-C14 benchtop → £2k ceiling bust.
 *
 * FLOW: serial-design-chain-v2 computes the flag BEFORE fillBlankWordMpns →
 * setInstrumentDeviceContext → dbHitAcceptableForWord ampacity refuse.
 */

export type QuantityBag = Record<string, unknown> | null | undefined

export interface InstrumentDeviceFlagInput {
  engineeringContract?: { quantities?: QuantityBag } | null
  orchestratorContract?: { quantities?: QuantityBag; envelope?: { scale_tier?: string } } | null
  productClass?: string | null
  parsedBrief?: {
    constraints?: {
      max_dimensions_mm?: Record<string, unknown>
    }
    product_class?: string
  } | null
  designIdentity?: { scale_tier?: string } | null
}

/**
 * @description Read a contract quantity that may be a bare number or `{ value }`.
 */
export function readContractQuantityValue(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
    return Number((raw as { value: unknown }).value)
  }
  return Number.NaN
}

/**
 * @description Resolve enclosure volume (m³) from eng → orch → brief max dims.
 * Prefer the first finite positive value. Brief dims convert mm³ → m³.
 */
export function resolveEnclosureVolumeM3(input: InstrumentDeviceFlagInput): number {
  const candidates: unknown[] = [
    input.engineeringContract?.quantities?.enclosure_volume_m3,
    input.orchestratorContract?.quantities?.enclosure_volume_m3,
  ]
  for (const raw of candidates) {
    const n = readContractQuantityValue(raw)
    if (Number.isFinite(n) && n > 0) return n
  }

  const dims = input.parsedBrief?.constraints?.max_dimensions_mm
  if (dims && typeof dims === 'object') {
    const vals = [dims.width, dims.depth, dims.height, dims.w, dims.d, dims.h, dims.l, dims.length]
      .map((x) => (typeof x === 'number' ? x : Number.NaN))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (vals.length >= 3) {
      const volM3 = (vals[0]! * vals[1]! * vals[2]!) / 1e9
      if (Number.isFinite(volM3) && volM3 > 0) return volM3
    }
  }
  return Number.NaN
}

function isInstrumentFormClass(productClass: string): boolean {
  return /syringe[_ -]?pump|thermo[_ -]?cycler|thermal[_ -]?cycler|\bpcr\b|colorimeter|colourimeter|spectrophotometer|optical[_ -]?instrument|optical[_ -]?handheld|lab[_ -]?microscope|openflexure|flexure[_ -]?stage|benchtop[_ -]?bioreactor|pioreactor|turbidostat|chemostat|potentiostat|rodeostat|digital[_ -]?microfluidics|opendrop/.test(
    productClass,
  )
}

function isPlantishClass(productClass: string): boolean {
  if (isInstrumentFormClass(productClass)) return false
  return /battery|storage|bess|powerwall|energy|inverter|pcs|transformer|switchgear|plant|\breactor\b|boiler|hvac|chiller|circulation[_ -]?pump|centrifugal[_ -]?pump|process[_ -]?pump/.test(
    productClass,
  )
}

/**
 * @description Compute the instrument-device flag used for fill/scrub (universal).
 * True when enclosure < 1 m³ (or benchtop/handheld tier) and not a plantish class
 * without an instrument-form override.
 */
export function computeIsInstrumentDevice(input: InstrumentDeviceFlagInput): {
  isInstrumentDevice: boolean
  enclosureVolumeM3: number
  basis: string
} {
  const productClass = String(
    input.productClass
      ?? input.parsedBrief?.product_class
      ?? '',
  ).toLowerCase()

  const tier = String(
    input.designIdentity?.scale_tier
      ?? input.orchestratorContract?.envelope?.scale_tier
      ?? '',
  ).toLowerCase()
  const tierDevice = tier === 'benchtop' || tier === 'handheld' || tier === 'cabinet' || tier === 'portable'

  const enclosureVolumeM3 = resolveEnclosureVolumeM3(input)
  const volumeDevice =
    Number.isFinite(enclosureVolumeM3)
    && enclosureVolumeM3 > 0
    && enclosureVolumeM3 < 1

  const plantish = isPlantishClass(productClass)
  const instrumentForm = isInstrumentFormClass(productClass)

  const isInstrumentDevice =
    (volumeDevice || tierDevice)
    && (!plantish || instrumentForm)

  let basis = 'not_device_scale'
  if (isInstrumentDevice) {
    if (volumeDevice) basis = 'enclosure_volume_m3<1'
    else if (tierDevice) basis = `scale_tier=${tier}`
  }

  return { isInstrumentDevice, enclosureVolumeM3, basis }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[instrument-device-flag] ${msg}`)
}

/** Adversarial proveCatch — cold-v12 empty engContract + orch 0.09 m³. */
export function selftestInstrumentDeviceFlag(): void {
  // proveCatch: eng silent, orch derived_device_scale → instrument true
  const coldV12 = computeIsInstrumentDevice({
    engineeringContract: { quantities: {} },
    orchestratorContract: {
      quantities: {
        enclosure_volume_m3: {
          value: 0.091125,
          source: 'derived_device_scale',
        },
      },
    },
    productClass: 'consumer_electronics',
  })
  assert(coldV12.isInstrumentDevice === true, 'cold-v12 orch volume must set instrument flag')
  assert(Math.abs(coldV12.enclosureVolumeM3 - 0.091125) < 1e-9, 'volume must come from orch')

  // eng-only still works
  const engOnly = computeIsInstrumentDevice({
    engineeringContract: {
      quantities: { enclosure_volume_m3: { value: 0.05 } },
    },
    productClass: 'pcb_assembly',
  })
  assert(engOnly.isInstrumentDevice === true, 'engContract volume must still set flag')

  // plant BESS large → false
  const bess = computeIsInstrumentDevice({
    engineeringContract: {
      quantities: { enclosure_volume_m3: { value: 86 } },
    },
    productClass: 'bess',
  })
  assert(bess.isInstrumentDevice === false, 'plant BESS must not be instrument')

  // sealed small BESS stays plantish-false (ampacity scrub is for instruments;
  // BESS keeps plant vocabulary even under 1 m³ unless instrument-form)
  const sealedBess = computeIsInstrumentDevice({
    orchestratorContract: {
      quantities: { enclosure_volume_m3: { value: 0.5 } },
    },
    productClass: 'bess',
  })
  assert(sealedBess.isInstrumentDevice === false, 'bess token stays plantish under 1 m³')

  // brief dims fallback when both contracts silent
  const briefDims = computeIsInstrumentDevice({
    engineeringContract: { quantities: {} },
    orchestratorContract: { quantities: {} },
    productClass: 'consumer_electronics',
    parsedBrief: {
      constraints: { max_dimensions_mm: { width: 450, depth: 450, height: 450 } },
    },
  })
  assert(briefDims.isInstrumentDevice === true, 'brief max dims must yield device volume')

  console.log('[instrument-device-flag] selftest OK')
}

if (require.main === module) {
  selftestInstrumentDeviceFlag()
}
