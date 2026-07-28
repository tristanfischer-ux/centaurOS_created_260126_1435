/**
 * scripts/lib/orchestrator/generic/bootstrap-tool-plan.test.ts
 *
 * ON-THE-FLY TOOL-PLAN BOOTSTRAP — standalone test harness. Run with:
 *   npx tsx scripts/lib/orchestrator/generic/bootstrap-tool-plan.test.ts
 *
 * Lives OUTSIDE scripts/regression-harness.tsx (same idiom as the sibling
 * bootstrap-class-graph.test.ts / class-fit-check.test.ts).
 *
 * THREE blocks:
 *   PURE   — validation (V1/V2/V3) + the FAIL-CLOSED materialiser, NO network,
 *            NO writes to the real forge-truth.db (store tests use a temp DB).
 *   SMOKE  — ONE real google/gemini-3.5-flash call (OpenRouter) on the RAS brief
 *            reconstructed from out/ras-r5-20260613/state.json: prints the
 *            selected tool_ids + wiring; asserts the tools are SENSIBLE for a
 *            recirculating-aquaculture fish farm AND that NONE of the domain-
 *            blind auto-planner's nonsense (airfoil / AUV-hydro / gear-ratio /
 *            electrolyser) was selected. Skipped (vacuous pass) without an
 *            OPENROUTER_API_KEY or the RAS state file.
 *
 * The candidate store writes to a TEMP DB only — the real forge-truth.db is
 * never touched by this test.
 */

import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../register-all' // populate the tool registry (listTools/getTool)
import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import {
  validateToolPlanSpec,
  applyStepOutputs,
  storeCandidate,
  latestCandidate,
  assertCandidateSlug,
  buildToolCatalogue,
  orderSpec,
  materialisePlan,
  bootstrapToolPlan,
  economicsRevenueBasisMissing,
  buildStepInput,
  bootstrapScaleContext,
  injectCableAmpacityInputs,
  deviceScaleInletCurrentA,
  isWattScaleFeederDuty,
  type ToolPlanSpec,
  type ToolPlanStepSpec,
} from './bootstrap-tool-plan'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..')

// ── .env.local self-load (council-scorer idiom) ─────────────────────────────
const envLocal = join(REPO, '.env.local')
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

// ── tiny assert runner ──────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── A REAL, registry-grounded fixture spec (uses real tools + real fields) ──
// process:pump-sizing has real output field `motor_power_kw`; mass-aggregator:
// envelope-check has `total_system_mass_kg`; regulatory-cert-cost:lookup has
// `total_cost_gbp`. These are the exact raw invoke fields (tool-io-raw.json).
function goodSpec(): ToolPlanSpec {
  return {
    display_name: 'Test Plant (fixture)',
    steps: [
      {
        tool_id: 'process:pump-sizing',
        purpose: 'recirculation pump',
        inputs: [
          { param: 'flow_m3_h', from_contract_key: 'recirculation_flow_m3_h', fallback: 100 },
          { param: 'static_head_m', constant: 12 },
        ],
        outputs: [
          { contract_key: 'recirc_pump_motor_kw', tool_output_field: 'motor_power_kw', unit: 'kW', family: 'power' },
        ],
      },
      {
        tool_id: 'regulatory-cert-cost:lookup',
        purpose: 'certification cost',
        inputs: [{ param: 'product_class', constant: 'aquaculture_ras' }],
        outputs: [
          { contract_key: 'regulatory_cert_cost_gbp', tool_output_field: 'total_cost_gbp', unit: 'GBP', family: 'currency' },
        ],
      },
      {
        tool_id: 'mass-aggregator:envelope-check',
        purpose: 'whole-system mass + envelope',
        inputs: [
          { param: 'total_cell_mass_kg', constant: 5000 },
          { param: 'max_mass_kg_envelope', constant: 40000 },
        ],
        outputs: [
          { contract_key: 'total_system_mass_kg', tool_output_field: 'total_system_mass_kg', unit: 'kg', family: 'mass' },
        ],
      },
    ],
  }
}

// ── PURE block ──────────────────────────────────────────────────────────────
function pureTests(): void {
  console.log('\nPURE — validation (V1/V2/V3) + fail-closed materialiser (no network)')

  // catalogue is non-empty (register-all imported)
  const cat = buildToolCatalogue()
  check('tool catalogue is populated', cat.length > 50, `catalogue size=${cat.length}`)
  check('catalogue entries carry real output fields', cat.every(c => c.output_fields.length > 0))

  // valid spec passes
  let v = validateToolPlanSpec(goodSpec())
  check('valid spec passes V1/V2/V3', v.ok, v.errors.join('; '))

  // V1 — hallucinated tool id rejected
  let bad = goodSpec(); bad.steps[0].tool_id = 'totally:made-up-tool'
  v = validateToolPlanSpec(bad)
  check('V1 hallucinated tool_id rejected', !v.ok && v.errors.some(e => /V1/.test(e)), v.errors.join('; '))

  // V2 — hallucinated tool_output_field rejected (THE key safeguard)
  bad = goodSpec(); bad.steps[0].outputs[0].tool_output_field = 'made_up_output_field_xyz'
  v = validateToolPlanSpec(bad)
  check('V2 hallucinated tool_output_field rejected', !v.ok && v.errors.some(e => /V2/.test(e) && /hallucinated field/.test(e)), v.errors.join('; '))

  // V2 — hallucinated input param rejected
  bad = goodSpec(); bad.steps[0].inputs[0].param = 'not_a_real_input_param'
  v = validateToolPlanSpec(bad)
  check('V2 hallucinated input param rejected', !v.ok && v.errors.some(e => /inputs.*is not a real input field.*V2/.test(e)), v.errors.join('; '))

  // V3 — missing universal mass producer rejected
  bad = goodSpec(); bad.steps = bad.steps.filter(s => s.tool_id !== 'mass-aggregator:envelope-check')
  v = validateToolPlanSpec(bad)
  check('V3 missing mass producer rejected', !v.ok && v.errors.some(e => /mass-aggregator:envelope-check/.test(e)), v.errors.join('; '))

  // V3 — missing cost key rejected
  bad = goodSpec(); bad.steps = bad.steps.filter(s => s.tool_id !== 'regulatory-cert-cost:lookup')
  v = validateToolPlanSpec(bad)
  check('V3 missing cost key rejected', !v.ok && v.errors.some(e => /cost\/capex/.test(e)), v.errors.join('; '))

  // V3 — brief metric coverage: an unproduced + unsupplied metric key is rejected,
  // but the same key is accepted when supplied by the contract.
  v = validateToolPlanSpec(goodSpec(), ['production_capacity_tpy'], [])
  check('V3 unproduced+unsupplied brief metric rejected', !v.ok && v.errors.some(e => /production_capacity_tpy/.test(e)))
  v = validateToolPlanSpec(goodSpec(), ['production_capacity_tpy'], ['production_capacity_tpy'])
  check('V3 brief metric supplied by contract passes', v.ok, v.errors.join('; '))

  const compactDeviceContext = bootstrapScaleContext(
    {
      product_class: 'generic_electronic_device',
      product_description: 'Compact multi-channel benchtop measurement instrument',
      max_dimensions_mm: { w: 450, d: 450, h: 450 },
    },
    {
      class: 'generic_electronic_device',
      scale_tier: 'unclassified',
      voltage_tier: 'low',
      form_factor: 'sealed_bench_enclosure',
      application: 'laboratory_measurement',
    },
    [],
  )
  check(
    'brief dimensions prove device scale before isInstrumentDevice is stamped',
    compactDeviceContext.deviceScale && compactDeviceContext.scaleTier === 'unknown',
    JSON.stringify(compactDeviceContext),
  )

  // Device-scale composition proveCatch: even a globally registered industrial
  // HX tool must be inadmissible when the pinned design identity is a device.
  const deviceHxSpec = goodSpec()
  deviceHxSpec.steps.splice(1, 0, {
    tool_id: 'ht:ntu-heat-exchanger',
    purpose: 'size benchtop bay heat rejection',
    inputs: [],
    outputs: [],
  })
  v = validateToolPlanSpec(deviceHxSpec, [], [], { deviceScale: true })
  check(
    'device-scale plan validation rejects a registered industrial HX tool',
    !v.ok && v.errors.some(e => /DEVICE-SCALE TOOL VETO/.test(e) && /ht:ntu-heat-exchanger/.test(e)),
    v.errors.join('; '),
  )
  v = validateToolPlanSpec(deviceHxSpec, [], [], { deviceScale: false })
  check('the same HX step remains admissible for a plant-scale plan', v.ok, v.errors.join('; '))

  // ── FAIL-CLOSED materialiser: a MISSING computed output field must NOT
  //    fabricate a number — it emits nothing for that key + records it skipped.
  const baseContract: ContractInProgress = {
    product_class: 'test', brief_summary: '', envelope: {} as BriefEnvelope,
    quantities: {}, topology: [], closures: [], macro_assembly_prices: [], _tools_run: [],
  }
  const step: ToolPlanStepSpec = {
    tool_id: 'process:pump-sizing',
    inputs: [],
    outputs: [{ contract_key: 'recirc_pump_motor_kw', tool_output_field: 'motor_power_kw', unit: 'kW', family: 'power' }],
  }
  // (i) field PRESENT → written
  let r = applyStepOutputs(step, baseContract, { motor_power_kw: 37.5 })
  check('materialiser writes present computed field', r.contract.quantities['recirc_pump_motor_kw']?.value === 37.5 && r.skipped.length === 0)
  // (ii) field MISSING (undefined) → NOT written, recorded skipped (fail-closed)
  r = applyStepOutputs(step, baseContract, { some_other_field: 1 })
  check('materialiser does NOT fabricate a number for a MISSING computed field (fail-closed)',
    r.contract.quantities['recirc_pump_motor_kw'] === undefined && r.skipped.length === 1,
    `quantities-written=${Object.keys(r.contract.quantities).length}, skipped=${JSON.stringify(r.skipped)}`)
  // (iii) field present but NaN → treated as missing (no NaN quantity written)
  r = applyStepOutputs(step, baseContract, { motor_power_kw: NaN })
  check('materialiser treats NaN computed field as missing (no NaN written)',
    r.contract.quantities['recirc_pump_motor_kw'] === undefined && r.skipped.length === 1)
  // (iv) Codema 1735: calculator-seeded storage aggregate must NOT be clobbered by a
  // bootstrapped consumptive buffer tool (682 m³ phantom over the brief sum).
  const seeded: ContractInProgress = {
    ...baseContract,
    quantities: {
      total_water_storage_volume_m3: {
        value: 313, unit: 'm3', family: 'volume', source: 'calculator',
      } as any,
    },
  }
  const bufStep: ToolPlanStepSpec = {
    tool_id: 'water-storage:buffer-sizing',
    inputs: [],
    outputs: [{
      contract_key: 'total_water_storage_volume_m3',
      tool_output_field: 'total_water_storage_volume_m3',
      unit: 'm3', family: 'volume',
    }],
  }
  r = applyStepOutputs(bufStep, seeded, { total_water_storage_volume_m3: 682.8 })
  check('SEED-PROTECTED calculator storage aggregate (Codema 1735 class)',
    r.contract.quantities['total_water_storage_volume_m3']?.value === 313
    && (r.protected_keys?.length ?? 0) === 1,
    `got ${r.contract.quantities['total_water_storage_volume_m3']?.value}; protected=${JSON.stringify(r.protected_keys)}`)

  // ── WATT-SCALE CABLE AMPACITY INLET (2026-07-28, cold-v17 35 mm² / 40 A) ───
  // ADVERSARIAL: plan wires absent aggregate_channel_current_capacity_a → fallback 40 A
  // @ cell 5 V. Inject must overwrite with inlet current from connected_electrical_load_kw
  // @ 230 V 1φ; applyStepOutputs must refuse a ≥16 mm² CSA mint on watt-scale.
  const wattCableContract: ContractInProgress = {
    ...baseContract,
    quantities: {
      connected_electrical_load_kw: { value: 0.12, unit: 'kW', family: 'power' } as any,
      channel_count: { value: 8, unit: '', family: 'count' } as any,
      current_range_a: { value: 5, unit: 'A', family: 'current' } as any,
      voltage_range_v: { value: 5, unit: 'V', family: 'voltage' } as any,
    },
  }
  check('watt-scale feeder duty detected from connected_electrical_load_kw=0.12',
    isWattScaleFeederDuty(wattCableContract))
  const inletA = deviceScaleInletCurrentA(wattCableContract)!
  check('device-scale inlet current ≈ P/(230·0.9)·1.25 (~0.72 A), NOT 40 A channel duty',
    inletA > 0.5 && inletA < 1.5, `inletA=${inletA}`)
  const cableStep: ToolPlanStepSpec = {
    tool_id: 'cable:ampacity',
    inputs: [
      { param: 'continuous_current_a', from_contract_key: 'aggregate_channel_current_capacity_a', fallback: 40 } as any,
      { param: 'voltage_class_v', constant: 5 } as any,
      { param: 'length_m', constant: 10 } as any,
    ],
    outputs: [
      { contract_key: 'cable_csa_mm2', tool_output_field: 'csa_mm2', unit: 'mm2', family: 'area' },
      { contract_key: 'cable_mass_kg', tool_output_field: 'total_mass_kg', unit: 'kg', family: 'mass' },
    ],
  }
  const cablePayload = buildStepInput(cableStep, wattCableContract)
  check('cable:ampacity payload overwrites 40 A fallback with watt-scale inlet current',
    typeof cablePayload.continuous_current_a === 'number'
    && (cablePayload.continuous_current_a as number) < 2
    && (cablePayload.continuous_current_a as number) > 0.5,
    JSON.stringify(cablePayload))
  check('cable:ampacity payload uses 230 V mains, not cell 5 V',
    cablePayload.voltage_class_v === 230, JSON.stringify(cablePayload))
  check('cable:ampacity payload shortens plant-default length on watt-scale',
    Number(cablePayload.length_m) <= 2, JSON.stringify(cablePayload))
  // inject seam alone (proveCatch without full buildStepInput wiring)
  const injected = injectCableAmpacityInputs(cableStep, wattCableContract, {
    continuous_current_a: 40, voltage_class_v: 5, length_m: 10,
  })
  check('injectCableAmpacityInputs proveCatch: 40 A → inlet A @ 230 V',
    Number(injected.continuous_current_a) < 2 && injected.voltage_class_v === 230)
  const plantCsaRefuse = applyStepOutputs(cableStep, wattCableContract, {
    csa_mm2: 35, total_mass_kg: 0.392,
  })
  check('applyStepOutputs refuses ≥16 mm² CSA mint on watt-scale (backstop)',
    plantCsaRefuse.contract.quantities['cable_csa_mm2'] === undefined
    && (plantCsaRefuse.protected_keys?.some((k) => /refuse plant CSA/.test(k)) ?? false),
    JSON.stringify(plantCsaRefuse.protected_keys))
  const okCsaWrite = applyStepOutputs(cableStep, wattCableContract, {
    csa_mm2: 1.5, total_mass_kg: 0.04,
  })
  check('applyStepOutputs allows appliance-cord CSA (1.5 mm²) on watt-scale',
    (okCsaWrite.contract.quantities['cable_csa_mm2'] as any)?.value === 1.5,
    JSON.stringify(okCsaWrite.contract.quantities['cable_csa_mm2']))
  // Plant-scale BESS: inject must NOT clobber a real feeder current.
  const plantCableContract: ContractInProgress = {
    ...baseContract,
    quantities: {
      connected_electrical_load_kw: { value: 1200, unit: 'kW', family: 'power' } as any,
    },
  }
  check('plant load is NOT watt-scale feeder duty',
    !isWattScaleFeederDuty(plantCableContract))
  const plantPayload = injectCableAmpacityInputs(cableStep, plantCableContract, {
    continuous_current_a: 1800, voltage_class_v: 400, length_m: 50,
  })
  check('plant cable:ampacity payload untouched by watt-scale inject',
    plantPayload.continuous_current_a === 1800 && plantPayload.voltage_class_v === 400,
    JSON.stringify(plantPayload))

  // ── DERIVED THERMAL-STABILITY WIRING (council H9, 2026-07-21) ───────────────
  // ADVERSARIAL INPUT: a control-systems PID step whose LLM-authored plan declares
  // ONLY kp/ki as outputs (never temperature_stability_k). The mapper must (a) inject
  // the contract's thermal keys into the payload so the tool CAN compute the ±K, and
  // (b) carry the tool's own derived temperature_stability_k to the contract under the
  // exact key the Verification spine reads — else the brief's HARD stability row stays
  // UNVERIFIED (the whole gap H9 closes).
  const thermalContract: ContractInProgress = {
    ...baseContract,
    quantities: {
      culture_temperature_c: { value: 37, unit: 'C', family: 'temperature' } as any,
      enclosure_internal_temp_c: { value: 28.45, unit: 'degC', family: 'temperature' } as any,
      vessel_heat_loss_w: { value: 0.954, unit: 'W', family: 'power' } as any,
      heating_duty_w: { value: 5, unit: 'W', family: 'power' } as any,
    },
  }
  const pidStep: ToolPlanStepSpec = {
    tool_id: 'control-systems:pid-tuning',
    inputs: [{ param: 'tuning_method', constant: 'imc' } as any],
    outputs: [
      { contract_key: 'temp_pid_kp', tool_output_field: 'kp', unit: '', family: 'dimensionless' },
      { contract_key: 'temp_pid_ki', tool_output_field: 'ki', unit: '', family: 'dimensionless' },
    ],
  }
  // (a) the payload picks up the thermal contract keys the tool reads.
  const pidPayload = buildStepInput(pidStep, thermalContract)
  check('control-systems payload gets injected thermal inputs (setpoint + ambient + heat-loss + duty)',
    pidPayload.culture_temperature_c === 37 && pidPayload.ambient_temperature_c === 28.45
    && pidPayload.vessel_heat_loss_w === 0.954 && pidPayload.heating_duty_w === 5,
    JSON.stringify(pidPayload))
  // (b) the tool's derived stability field is carried to the contract though undeclared.
  const pidOut = {
    kp: 1.08, ki: 0.66,
    temperature_stability_k: 0.1327, temperature_stability_k_measured: false,
    temperature_stability_k_basis: 'DERIVED DESIGN ESTIMATE — a first-principles closed-loop control prediction, NOT a HIL-measured value.',
  }
  const rts = applyStepOutputs(pidStep, thermalContract, pidOut)
  const tq = rts.contract.quantities['temperature_stability_k'] as any
  check('DERIVED temperature_stability_k carried to contract from an undeclared control-systems output',
    tq?.value === 0.1327 && tq?.unit === 'K' && tq?.family === 'temperature',
    JSON.stringify(tq))
  check('carried temperature_stability_k is labelled a DESIGN PREDICTION (measured=false, basis note)',
    tq?.measured === false && /DERIVED DESIGN ESTIMATE/.test(String(tq?.prediction_basis ?? '')),
    JSON.stringify({ measured: tq?.measured, basis: tq?.prediction_basis }))
  check('carried temperature_stability_k provenance names the control-systems tool',
    /control-systems/.test(String(tq?.provenance?.tool_id ?? '')))
  // (c) a NON-control tool with the same output field must NOT get the deterministic write.
  const nonCtrl: ToolPlanStepSpec = {
    tool_id: 'process:pump-sizing', inputs: [],
    outputs: [{ contract_key: 'recirc_pump_motor_kw', tool_output_field: 'motor_power_kw', unit: 'kW', family: 'power' }],
  }
  const rnc = applyStepOutputs(nonCtrl, thermalContract, { motor_power_kw: 5, temperature_stability_k: 0.9 })
  check('non-control tool does NOT get the temperature_stability_k deterministic write',
    rnc.contract.quantities['temperature_stability_k'] === undefined)
  // (d) an existing (calculator-seed) stability value WINS — the tool must not clobber it.
  const seededStab: ContractInProgress = {
    ...thermalContract,
    quantities: {
      ...thermalContract.quantities,
      temperature_stability_k: { value: 0.2, unit: 'K', family: 'temperature', source: 'calculator' } as any,
    },
  }
  const rss = applyStepOutputs(pidStep, seededStab, pidOut)
  check('existing temperature_stability_k seed is NOT clobbered by the tool write',
    (rss.contract.quantities['temperature_stability_k'] as any)?.value === 0.2)

  // (d′) a BRIEF-ECHO (the brief's TARGET seeded as the value, no calculator source,
  // not measured) IS overwritten by the tool's derived prediction — else the HARD
  // stability claim stays UNVERIFIED (the organoid 0.5 K, 2026-07-21).
  const echoStab: ContractInProgress = {
    ...thermalContract,
    quantities: {
      ...thermalContract.quantities,
      temperature_stability_k: {
        value: 0.5, unit: 'K', family: 'temperature', provenance: 'derived',
        basis: 'Standard acceptable thermal fluctuation for mammalian cell/organoid culture.',
      } as any,
    },
  }
  const rse = applyStepOutputs(pidStep, echoStab, pidOut)
  check('brief-echo temperature_stability_k IS overwritten by the derived prediction',
    Math.abs((rse.contract.quantities['temperature_stability_k'] as any)?.value - 0.1327) < 1e-6)
  check('overwritten stability is labelled a prediction (measured=false)',
    (rse.contract.quantities['temperature_stability_k'] as any)?.measured === false)

  // ── candidate-store boundary (security item 18) ─────────────────────────
  let threw = false
  try { assertCandidateSlug(`x'; DROP TABLE class_tool_plan_candidates;--`) } catch { threw = true }
  check('hostile slug rejected with a throw', threw)
  threw = false
  try { assertCandidateSlug('aquaculture-ras') } catch { threw = true }
  check('hyphenated slug rejected (caller must normalise)', threw)

  // ── candidate store on a THROWAWAY temp DB (real DB untouched) ───────────
  const tmp = mkdtempSync(join(tmpdir(), 'bootstrap-tool-plan-test-'))
  const tmpDb = join(tmp, 'test.db')
  try {
    const spec = goodSpec()
    const r1 = storeCandidate('aquaculture_ras', spec, { selected_tool_ids: ['x'], attempts: 1 }, tmpDb)
    check('first insert → version 1, status candidate', r1.version === 1 && r1.status === 'candidate', JSON.stringify(r1))
    const r2 = storeCandidate('aquaculture_ras', spec, null, tmpDb)
    check('second insert → version 2 (COALESCE MAX+1)', r2.version === 2, JSON.stringify(r2))
    const latest = latestCandidate('aquaculture_ras', tmpDb)
    check('latestCandidate returns newest version + plan_json round-trips validation',
      latest?.version === 2 && validateToolPlanSpec(JSON.parse(latest!.plan_json)).ok)
    check('missing slug → null', latestCandidate('never_stored', tmpDb) === null)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  // ── ORDER (composeToolGraph reuse) + MATERIALISE produce a runnable plan ──
  const order = orderSpec(goodSpec())
  check('orderSpec returns all selected tool_ids', new Set(order).size === 3, order.join(','))
  const plan = materialisePlan('aquaculture_ras', goodSpec(), order)
  check('materialisePlan → runnable ClassToolPlan, all steps required:false',
    plan.tools.length === 3 && plan.tools.every(t => t.required === false))

  // ── ECONOMICS REVENUE-BASIS VETO (proveCatch, 2026-07-02): the v55 £580M phantom
  //    NPV was minted from FABRICATED inputs (annual_yield_kg=100,000 @ £1,000/kg on
  //    a water plant with NO product mass and NO sale price). A revenue-economics
  //    step whose yield+price inputs are not GROUNDED contract keys must refuse to
  //    build its input (throw), so the tool never invokes and nothing is minted.
  const npvStepFabricated: ToolPlanStepSpec = {
    tool_id: 'yield-economics:npv',
    inputs: [
      { param: 'annual_yield_kg', constant: 100000 },                   // fabricated literal
      { param: 'market_price_gbp_kg', from_contract_key: 'product_sale_price_gbp_kg', fallback: 1000 }, // absent key → fallback fabrication
      { param: 'capex_gbp', from_contract_key: 'bom_total_gbp', fallback: 1000000 },
    ],
    outputs: [{ contract_key: 'plant_npv_gbp', tool_output_field: 'npv_gbp', unit: 'GBP', family: 'currency' }],
  }
  const missing = economicsRevenueBasisMissing(npvStepFabricated, baseContract)
  check('VETO fires: fabricated yield+price inputs on an ungrounded contract',
    typeof missing === 'string' && /ECONOMICS BASIS VETO/.test(missing ?? '') &&
    /annual_yield_kg/.test(missing ?? '') && /market_price_gbp_kg/.test(missing ?? ''),
    String(missing).slice(0, 160))
  const vetoPlan = materialisePlan('water_treatment', { display_name: 'x', steps: [npvStepFabricated] }, ['yield-economics:npv'])
  let vetoThrew = false
  try { vetoPlan.tools[0].input_from_contract(baseContract, {} as ParsedConstraints) } catch { vetoThrew = true }
  check('materialised step REFUSES to build input (throw → runStep fails honestly, nothing minted)', vetoThrew)
  // grounded case: both revenue inputs wired to REAL contract keys → no veto
  const groundedContract: ContractInProgress = {
    ...baseContract,
    quantities: {
      annual_product_yield_kg: { value: 250000, unit: 'kg/yr', family: 'yield' } as any,
      product_sale_price_gbp_kg: { value: 6.2, unit: 'GBP/kg', family: 'currency' } as any,
    },
  }
  const npvStepGrounded: ToolPlanStepSpec = {
    ...npvStepFabricated,
    inputs: [
      { param: 'annual_yield_kg', from_contract_key: 'annual_product_yield_kg' },
      { param: 'market_price_gbp_kg', from_contract_key: 'product_sale_price_gbp_kg' },
    ],
  }
  check('VETO stays silent when yield+price are grounded contract keys',
    economicsRevenueBasisMissing(npvStepGrounded, groundedContract) === null)
  // non-economics steps are untouched (a pump-sizing step never trips the veto)
  check('VETO never fires on a non-economics step',
    economicsRevenueBasisMissing(goodSpec().steps[0], baseContract) === null)

  // ── UNIT-COERCION LAYER (proveCatch, 2026-07-03): the v56d metres-into-mm vessel.
  //    pressure-vessel:design received diameter_mm = 1.3587 (the METRES value of
  //    gac_vessel_diameter_m wired straight through) → an absurd 2.011 kg "vessel
  //    mass" in total_system_mass_kg. The input mapping must CONVERT from the
  //    quantity's declared unit to the param's suffix unit, and REFUSE (throw,
  //    fail-soft + recorded) an absurd magnitude it cannot resolve.
  const vesselContract: ContractInProgress = {
    ...baseContract,
    quantities: {
      gac_vessel_diameter_m: { value: 1.358748446131949, unit: 'm', family: 'length' } as any,
      recirc_flow_m3_h: { value: 90, unit: 'm3/h', family: 'volflow' } as any,
      unlabelled_diameter: { value: 1.36, unit: '', family: 'length' } as any, // no unit, no key suffix
    },
  }
  const vesselStep: ToolPlanStepSpec = {
    tool_id: 'pressure-vessel:design',
    inputs: [
      { param: 'diameter_mm', from_contract_key: 'gac_vessel_diameter_m', fallback: 1200 },
      { param: 'length_mm', constant: 2000 },
      { param: 'wall_thickness_mm', constant: 6 },
    ],
    outputs: [{ contract_key: 'gac_vessel_mass_kg', tool_output_field: 'mass_kg', unit: 'kg', family: 'mass' }],
  }
  const coerced = buildStepInput(vesselStep, vesselContract)
  check('unit-coercion: metres-declared contract value converts into a _mm param (×1000)',
    Math.abs((coerced.diameter_mm as number) - 1358.748446131949) < 1e-9, `diameter_mm=${coerced.diameter_mm}`)
  check('unit-coercion: plan-authored constants pass through in param units (never coerced)',
    coerced.length_mm === 2000 && coerced.wall_thickness_mm === 6)
  // identity wiring (same unit) returns the untouched original number
  const identStep: ToolPlanStepSpec = {
    tool_id: 'process:pump-sizing',
    inputs: [{ param: 'flow_m3_h', from_contract_key: 'recirc_flow_m3_h', fallback: 10 }],
    outputs: [{ contract_key: 'pump_kw', tool_output_field: 'motor_power_kw', unit: 'kW', family: 'power' }],
  }
  check('unit-coercion: identity wiring (m3/h → m3/h) is byte-identical',
    buildStepInput(identStep, vesselContract).flow_m3_h === 90)
  // MAGNITUDE REFUSAL proveCatch: a metres-scale magnitude with NO resolvable unit
  // (blank declared unit + suffix-less key) into a vessel diameter_mm must THROW loudly.
  const absurdStep: ToolPlanStepSpec = {
    ...vesselStep,
    inputs: [{ param: 'diameter_mm', from_contract_key: 'unlabelled_diameter', fallback: 1200 }],
  }
  let refusalMsg = ''
  try { buildStepInput(absurdStep, vesselContract) } catch (e) { refusalMsg = (e as Error).message }
  check('unit-coercion proveCatch: unresolvable metres-into-mm magnitude is REFUSED loudly (throw names the suspected mismatch)',
    /UNIT-MISMATCH REFUSAL/.test(refusalMsg) && /METRES/.test(refusalMsg), refusalMsg.slice(0, 120))
  // …and the correct-mm direction passes (no false catch)
  const okContract: ContractInProgress = {
    ...baseContract,
    quantities: { vessel_diameter_mm: { value: 1358.7, unit: 'mm', family: 'length' } as any },
  }
  const okStep: ToolPlanStepSpec = {
    ...vesselStep,
    inputs: [{ param: 'diameter_mm', from_contract_key: 'vessel_diameter_mm', fallback: 1200 }],
  }
  check('unit-coercion proveCatch (other direction): a correct mm value passes untouched',
    buildStepInput(okStep, okContract).diameter_mm === 1358.7)
}

// ── SMOKE block — ONE real Gemini call on the RAS brief ─────────────────────
async function smokeTest(): Promise<void> {
  console.log('\nSMOKE — bootstrapToolPlan on the RAS brief (one real google/gemini-3.5-flash call)')

  if (process.env.SKIP_TOOL_PLAN_NETWORK_SMOKE === '1') {
    check('RAS smoke (skipped: SKIP_TOOL_PLAN_NETWORK_SMOKE=1)', true)
    return
  }
  const statePath = join(REPO, 'out', 'ras-r5-20260613', 'state.json')
  if (!existsSync(statePath)) {
    check('RAS smoke (skipped: state.json not found — vacuous pass)', true)
    return
  }
  if (!process.env.OPENROUTER_API_KEY) {
    check('RAS smoke (skipped: OPENROUTER_API_KEY not set — vacuous pass)', true)
    return
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const pb = state.parsedBrief ?? {}
  const oc = state.orchestratorContract ?? {}

  // Reconstruct the parsed constraints the orchestrator would see (flatten
  // constraints up + inject product_class from the contract/envelope).
  const constraints = pb.constraints ?? {}
  const brief: ParsedConstraints = {
    ...pb,
    ...constraints,
    product_class: 'aquaculture_ras',
    product_description: String(pb.product_description ?? ''),
  } as any

  // The envelope the contract recorded for this novel class.
  const envelope: BriefEnvelope = (oc.envelope ?? {
    class: 'aquaculture_ras', scale_tier: 'medium', voltage_tier: 'low',
    form_factor: 'field_erected', application: 'land_based_marine_aquaculture',
  }) as BriefEnvelope

  // The contract DUTIES (the real engineering quantities, minus the auto-planner
  // breadcrumb flags from the prior run so we feed the LLM clean duties).
  const qd = (oc.quantities ?? {}) as Record<string, any>
  const duties = Object.entries(qd)
    .filter(([k]) => !k.startsWith('auto_planned_tool_ran__'))
    .map(([key, v]) => ({ key, value: v?.value, unit: v?.unit ?? '', condition: v?.condition ?? null }))
    .filter(d => typeof d.value === 'number' && Number.isFinite(d.value))

  console.log(`  (RAS duties fed to the model: ${duties.length} quantities, e.g. ${duties.slice(0, 6).map(d => d.key).join(', ')})`)

  const result = await bootstrapToolPlan('aquaculture_ras', brief, envelope, duties)

  if (!result.ok) {
    check(`RAS bootstrap succeeded`, false, `stage=${result.stage} error=${result.error} validation=${result.validation_errors.slice(0, 6).join('; ')}`)
    return
  }

  // PRINT the selected tools + their wiring.
  console.log(`\n  ── SELECTED TOOL PLAN for aquaculture_ras (candidate v${result.candidate.version}, reused=${result.candidate.reused}) ──`)
  console.log(`  display_name: ${result.spec.display_name}`)
  console.log(`  run order (${result.selected_tool_ids.length}): ${result.selected_tool_ids.join(' → ')}`)
  for (const step of result.spec.steps) {
    const ins = step.inputs.map(i => i.from_contract_key ? `${i.param}<-${i.from_contract_key}` : `${i.param}=${JSON.stringify(i.constant)}`).join(', ')
    const outs = step.outputs.map(o => `${o.contract_key}<-${o.tool_output_field}`).join(', ')
    console.log(`    • ${step.tool_id}${step.purpose ? ` (${step.purpose})` : ''}`)
    console.log(`        in:  ${ins || '(none)'}`)
    console.log(`        out: ${outs}`)
  }
  console.log('')

  const selected = new Set(result.selected_tool_ids)
  const selectedStr = result.selected_tool_ids.join(' ')

  check('RAS bootstrap returned a valid plan', result.ok && result.plan.tools.length > 0)
  check('plan stored as CANDIDATE (not auto-promoted)', result.candidate.status === 'candidate')

  // (i) tools are SENSIBLE for a recirculating-aquaculture fish farm: it should
  // reach for water/pump/treatment/aeration/heat-loss/controls + mass-aggregator.
  // Accept ANY reasonable subset — assert at least the universal mass producer
  // plus ≥2 fish-farm-plausible domains appear.
  const RAS_PLAUSIBLE = [
    'pump', 'water', 'oxygen', 'dissolved-oxygen', 'aeration', 'agitation', 'ph-',
    'heat-loss', 'building-envelope', 'hvac', 'refrigeration', 'heat-pump', 'noise',
    'transport', 'regulatory', 'lifecycle', 'reliability', 'clean-in-place', 'biosteam',
  ]
  const plausibleHits = result.selected_tool_ids.filter(id => RAS_PLAUSIBLE.some(p => id.includes(p)))
  check('plan includes the universal mass producer', selected.has('mass-aggregator:envelope-check'))
  check('plan selected ≥2 fish-farm-plausible tools (pumps/water/aeration/heat-loss/controls/…)',
    plausibleHits.length >= 2, `plausible hits: ${plausibleHits.join(', ') || 'NONE'}`)

  // (ii) NO airfoil / AUV-hydro / gear-ratio / electrolyser (the domain-blind
  // auto-planner's nonsense on the prior RAS run). These are the explicit
  // contamination signatures from out/ras-r5-20260613/state.json.
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['airfoil/aerosandbox', /airfoil|aerosandbox|aero:|aeroelastic|xfoil|avl\b/i],
    ['AUV/submarine hydrostatics', /auv|hydro|submarine|submersible|pressure-vessel:.*depth|sonar/i],
    ['gear-ratio (bicycle)', /gear-ratio|gear_ratio|bicycle|rolling-resistance/i],
    ['electrolyser', /electrolyser|electrolyzer|pem-membrane|pemfc|fuel-cell/i],
    ['spacecraft/orbit', /orbit|tsiolkovsky|delta-v|reaction-wheel|magnetorquer|propellant-tank/i],
  ]
  for (const [label, re] of FORBIDDEN) {
    check(`NO ${label} selected`, !re.test(selectedStr), re.test(selectedStr) ? `matched in: ${selectedStr}` : undefined)
  }

  // (iii) every wired output field of the FINAL plan is a real output field of
  // its tool — re-validate the stored spec (defence-in-depth: proves V2 held).
  const reval = validateToolPlanSpec(result.spec, [], duties.map(d => d.key))
  check('final plan re-validates clean (all wired fields real)', reval.ok, reval.errors.slice(0, 6).join('; '))

  if (result.llm_cost_usd != null) console.log(`  (LLM cost: $${result.llm_cost_usd.toFixed(4)})`)
}

async function main(): Promise<void> {
  pureTests()
  await smokeTest()

  console.log(`\n${'='.repeat(60)}`)
  console.log(`PASSED ${passed} / ${passed + failed}`)
  if (failed > 0) {
    console.log(`FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
