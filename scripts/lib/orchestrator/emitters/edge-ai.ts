/**
 * scripts/lib/orchestrator/emitters/edge-ai.ts
 *
 * EDGE AI INFERENCE-SERVER deterministic emitter — 2026-05-22.
 *
 * Mirrors the BESS emitter pattern: produces a DesignJSON skeleton
 * (modules → sub_modules → words with quantities + provenance) directly
 * from the EngineeringContract. The LLM narrator fills overview_paragraph_en,
 * english_sentence and brief_overview_prose downstream.
 *
 * 8 modules (compute_soc_accelerator, memory_storage, network_interface,
 * power_supply, enclosure_chassis, cooling_passive_active, IO_ports,
 * mounting_din_rail_or_rack).
 *
 * Industry references baked into module briefs / form modifiers:
 *   - Jetson Orin Nano (15-25 W edge accelerator)
 *   - Coral TPU (5 W USB / M.2)
 *   - Intel NUC 12 Pro (28 W)
 *   - Hailo-8 (2.5 W AI accelerator)
 *   - NVIDIA L40S / H100 PCIe / AMD MI300X (server-class accelerators)
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

// ---------------------------------------------------------------------------
// Local mirrors of the deterministic-emitter types (avoids circular import)
// ---------------------------------------------------------------------------

interface ModifierCharacter {
  kind: string
  value: string
  unit?: string
}

interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}

interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(id: string, name: string, fp: string | null, mp: string | null,
            fs: string | null = null, ms: string | null = null): ContentCharacter {
  return { character_id: id, name_human: name,
           function_radical_primary: fp, function_radical_secondary: fs,
           material_radical_primary: mp, material_radical_secondary: ms }
}

function word(id: string, name: string, content: ContentCharacter, mods: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: mods }
}

function synthesizeRadSyntax(words: Word[]): string {
  return words.map(w => {
    const ordered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = ordered.map(m => m.unit ? `${m.value}${m.unit}` : m.value)
    return tokens.length === 0 ? w.content_character.character_id
                               : `${w.content_character.character_id} (${tokens.join(', ')})`
  }).join(' ⊙ ')
}

function makeSub(id: string, name: string, role: string, topology: string, words: Word[]): SubModule {
  return { id, name_human: name, english_sentence: '',
           rad_syntax: synthesizeRadSyntax(words),
           role_verb: role, topology_clause: topology, words }
}

// ---------------------------------------------------------------------------
// Params derived from Contract
// ---------------------------------------------------------------------------

interface EdgeAiParams {
  gpuCount: number
  gpuModel: string
  cpuCores: number
  ramGb: number
  ramDimms: number
  storageTb: number
  nvmeCount: number
  totalPowerKw: number
  gridPowerKw: number
  heatKw: number
  psuKw: number
  psuEffPct: number
  inferenceTps: number
  networkGbe: number
  inletMaxC: number
  totalMassKg: number
}

function deriveParams(c: ContractInProgress): EdgeAiParams {
  return {
    gpuCount: Math.max(1, Math.round(q(c, 'gpu_count', 1))),
    gpuModel: (c.quantities?.gpu_model_power_w?.value ?? 0) >= 700 ? 'AMD MI300X'
            : (c.quantities?.gpu_model_power_w?.value ?? 0) >= 400 ? 'NVIDIA H100 PCIe'
            : (c.quantities?.gpu_model_power_w?.value ?? 0) >= 300 ? 'NVIDIA L40S'
            : 'NVIDIA Jetson Orin / L40S',
    cpuCores: Math.max(1, Math.round(q(c, 'cpu_cores', 32))),
    ramGb: q(c, 'ram_gb_total', 256),
    ramDimms: Math.max(1, Math.round(q(c, 'ram_dimm_count', 8))),
    storageTb: q(c, 'storage_tb_total', 3.84),
    nvmeCount: 2,
    totalPowerKw: q(c, 'total_power_kw', 1.0),
    gridPowerKw: q(c, 'grid_power_kw', 1.1),
    heatKw: q(c, 'heat_dissipation_kw', 1.0),
    psuKw: q(c, 'psu_capacity_kw', 4.0),
    psuEffPct: q(c, 'psu_efficiency_pct', 92),
    inferenceTps: q(c, 'inference_tps', 80),
    networkGbe: q(c, 'network_throughput_gbe', 50),
    inletMaxC: q(c, 'max_inlet_temp_c', 35),
    totalMassKg: q(c, 'total_mass_kg', 14),
  }
}

// ---------------------------------------------------------------------------
// 1. compute_soc_accelerator
// ---------------------------------------------------------------------------

function emitComputeSocAccelerator(p: EdgeAiParams): DesignModule {
  const gpu = makeSub('gpu_inference_card', 'GPU inference accelerator', 'computes',
    `${p.gpuCount}× ${p.gpuModel} on PCIe Gen4 x16`, [
    word('gpu_inference_card_word', 'GPU inference card',
      cc('gpu_inference_card', 'GPU inference card', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.gpuCount)),
       mod('form', p.gpuModel),
       mod('capacity', String(Math.round(p.inferenceTps)), 'tps'),
       mod('regulatory', 'NEBS Level 3')]),
    word('pcie_riser_card_word', 'PCIe Gen4 x16 riser card',
      cc('pcie_gen4_riser', 'PCIe Gen4 x16 riser', 'electrical_conducting_function', 'copper'),
      [mod('quantity', fmtQty(p.gpuCount)),
       mod('capacity', '64', 'GB/s'),
       mod('form', 'Gen4 x16')]),
  ])

  const cpu = makeSub('cpu_epyc_assembly', 'CPU compute assembly', 'orchestrates',
    `${p.cpuCores}-core x86_64 host CPU + heatsink`, [
    word('cpu_epyc_assembly_word', 'CPU EPYC assembly',
      cc('cpu_epyc_assembly', 'CPU EPYC assembly', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'AMD EPYC 9354'),
       mod('dimension', String(p.cpuCores), 'core'),
       mod('capacity', '240', 'W TDP')]),
    word('cpu_heatsink_word', 'CPU heatsink',
      cc('cpu_heatsink', 'CPU heatsink', 'thermal_transfer_function', 'aluminium'),
      [mod('quantity', '×1'),
       mod('form', '1U passive copper-base'),
       mod('capacity', '280', 'W')]),
  ])

  const motherboard = makeSub('motherboard_assembly', 'motherboard assembly', 'connects',
    'host CPU + GPU + RAM + storage + network across PCIe + DDR5 + SATA + USB lanes', [
    word('motherboard_dual_socket_word', 'motherboard dual-socket',
      cc('motherboard_dual_socket', 'motherboard dual-socket', 'electrical_conducting_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'EATX 1U short-depth'),
       mod('regulatory', 'IPMI 2.0 BMC')]),
  ])

  return {
    module: 'compute_soc_accelerator',
    module_brief: `${p.gpuCount}× ${p.gpuModel} accelerator delivering ${Math.round(p.inferenceTps)} tps on Llama-2-13B class workloads, hosted by a ${p.cpuCores}-core EPYC 9354 CPU on a 1U short-depth motherboard.`,
    overview_paragraph_en: '',
    derived_parameters: {
      gpu_count: p.gpuCount,
      cpu_cores: p.cpuCores,
      inference_tps: Math.round(p.inferenceTps),
    },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'thermal_transfer_function', 'polymer_thermoplastic', 'copper', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [gpu, cpu, motherboard],
  }
}

// ---------------------------------------------------------------------------
// 2. memory_storage
// ---------------------------------------------------------------------------

function emitMemoryStorage(p: EdgeAiParams): DesignModule {
  const ram = makeSub('ddr5_ecc_ram', 'DDR5 ECC system memory', 'stores',
    `${p.ramGb} GB across ${p.ramDimms} ECC DDR5-4800 DIMMs`, [
    word('ecc_ddr5_dimm_word', 'ECC DDR5 DIMM',
      cc('ecc_ddr5_dimm', 'ECC DDR5 DIMM', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.ramDimms)),
       mod('capacity', '32', 'GB'),
       mod('form', 'DDR5-4800 RDIMM ECC')]),
  ])

  const nvme = makeSub('nvme_storage', 'NVMe SSD storage', 'persists',
    `${p.nvmeCount}× U.2 NVMe Gen4 drives in RAID 1 for ${p.storageTb.toFixed(2)} TB usable`, [
    word('nvme_storage_word', 'NVMe storage',
      cc('nvme_storage', 'NVMe U.2 storage', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.nvmeCount)),
       mod('capacity', '1.92', 'TB'),
       mod('form', 'U.2 Gen4 RAID 1'),
       mod('regulatory', 'TCG Opal 2.0')]),
  ])

  return {
    module: 'memory_storage',
    module_brief: `${p.ramGb} GB of DDR5-4800 ECC across ${p.ramDimms} DIMMs and ${p.storageTb.toFixed(2)} TB of U.2 NVMe Gen4 RAID 1 storage.`,
    overview_paragraph_en: '',
    derived_parameters: {
      ram_gb_total: p.ramGb,
      storage_tb_total: p.storageTb,
    },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [ram, nvme],
  }
}

// ---------------------------------------------------------------------------
// 3. network_interface
// ---------------------------------------------------------------------------

function emitNetworkInterface(p: EdgeAiParams): DesignModule {
  const nic = makeSub('network_25gbe', '25 GbE network adapter', 'connects',
    `2× 25 GbE SFP28 ports for ${p.networkGbe} Gbe aggregate uplink`, [
    word('network_adapter_25gbe_word', '25 GbE network adapter',
      cc('network_adapter_25gbe', '25 GbE network adapter', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('capacity', String(Math.round(p.networkGbe)), 'Gbe'),
       mod('form', 'SFP28 2-port'),
       mod('regulatory', 'IEEE 802.3by')]),
    word('sfp28_dac_cable_word', 'SFP28 DAC cable',
      cc('sfp28_dac_cable', 'SFP28 DAC cable', 'optical_sensing_function', 'copper'),
      [mod('quantity', '×2'),
       mod('form', '3 m passive DAC'),
       mod('dimension', '25', 'Gbe')]),
  ])

  const bmc = makeSub('ipmi_bmc_port', 'IPMI BMC management port', 'manages',
    'out-of-band 1 GbE management for serial-over-LAN and remote power', [
    word('ipmi_bmc_port_word', 'IPMI BMC port',
      cc('ipmi_bmc_port', 'IPMI BMC port', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', '1 GbE RJ45'),
       mod('regulatory', 'IPMI 2.0 + Redfish')]),
  ])

  return {
    module: 'network_interface',
    module_brief: `2× 25 GbE data plane (${Math.round(p.networkGbe)} Gbe aggregate) on SFP28 + dedicated 1 GbE IPMI management port.`,
    overview_paragraph_en: '',
    derived_parameters: {
      data_plane_gbe: p.networkGbe,
      mgmt_plane_gbe: 1,
    },
    allowed_radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'electrical_conducting_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [nic, bmc],
  }
}

// ---------------------------------------------------------------------------
// 4. power_supply
// ---------------------------------------------------------------------------

function emitPowerSupply(p: EdgeAiParams): DesignModule {
  const psu = makeSub('redundant_psu', 'redundant PSU pair', 'rectifies',
    `2× 2 kW 80+ Titanium hot-swap PSU sized for ${p.gridPowerKw.toFixed(2)} kW grid draw`, [
    word('redundant_psu_pair_word', 'redundant PSU pair',
      cc('redundant_psu_pair', 'redundant PSU pair', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('capacity', String(p.psuKw), 'kW'),
       mod('form', '2× 2 kW 80+ Titanium hot-swap'),
       mod('regulatory', 'CCC + UL 60950')]),
    word('iec_c13_inlet_word', 'IEC C13 inlet',
      cc('iec_c13_inlet', 'IEC C13 inlet', 'electrical_conducting_function', 'copper'),
      [mod('quantity', '×2'),
       mod('form', 'C13'),
       mod('capacity', '10', 'A')]),
  ])

  return {
    module: 'power_supply',
    module_brief: `Redundant 2× 2 kW 80+ Titanium PSU pair (${p.psuKw.toFixed(1)} kW total) at ${p.psuEffPct.toFixed(0)}% efficiency feeding ${p.totalPowerKw.toFixed(2)} kW DC load.`,
    overview_paragraph_en: '',
    derived_parameters: {
      psu_capacity_kw: p.psuKw,
      psu_efficiency_pct: p.psuEffPct,
      grid_power_kw: p.gridPowerKw,
    },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [psu],
  }
}

// ---------------------------------------------------------------------------
// 5. enclosure_chassis
// ---------------------------------------------------------------------------

function emitEnclosureChassis(p: EdgeAiParams): DesignModule {
  const chassis = makeSub('chassis_1u_short_depth', '1U short-depth chassis', 'contains',
    'Supermicro AS-1115S-class 760 mm depth 1U chassis with front-to-back airflow', [
    word('chassis_1u_short_depth_word', '1U short-depth chassis',
      cc('chassis_1u_short_depth', '1U short-depth chassis', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', '1U 760mm depth'),
       mod('dimension', '44', 'mm height'),
       mod('regulatory', 'EIA-310-D 19in')]),
    word('chassis_emc_gasket_word', 'chassis EMC gasket',
      cc('chassis_emc_gasket', 'chassis EMC gasket', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×4'),
       mod('regulatory', 'EN 55032 Class A')]),
  ])

  return {
    module: 'enclosure_chassis',
    module_brief: `1U 19-inch rack-mount short-depth chassis (760 mm) with EMC gaskets and front-to-back airflow, ${p.totalMassKg.toFixed(0)} kg loaded.`,
    overview_paragraph_en: '',
    derived_parameters: {
      chassis_height_u: 1,
      chassis_depth_mm: 760,
      total_mass_kg: p.totalMassKg,
    },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [chassis],
  }
}

// ---------------------------------------------------------------------------
// 6. cooling_passive_active
// ---------------------------------------------------------------------------

function emitCoolingPassiveActive(p: EdgeAiParams): DesignModule {
  const fans = makeSub('chassis_fans', 'chassis fan bank', 'rejects',
    `8× 40 mm dual-rotor fans rejecting ${p.heatKw.toFixed(2)} kW at ${p.inletMaxC.toFixed(0)}°C inlet`, [
    word('chassis_fan_40mm_word', 'chassis 40 mm dual-rotor fan',
      cc('chassis_fan_40mm', 'chassis 40 mm dual-rotor fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
      [mod('quantity', '×8'),
       mod('dimension', '40', 'mm'),
       mod('capacity', '18000', 'rpm'),
       mod('form', 'Delta TUC0412 / Sunon PSD1204PMB1')]),
    word('thermal_interface_word', 'thermal interface material',
      cc('thermal_interface_material', 'thermal interface material', 'thermal_transfer_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'),
       mod('form', 'graphite pad'),
       mod('capacity', '8', 'W/m·K')]),
  ])

  return {
    module: 'cooling_passive_active',
    module_brief: `Front-to-back air cooling: 8× 40 mm dual-rotor fans, copper heatpipe heatsinks, graphite TIM. Rejects ${p.heatKw.toFixed(2)} kW at ${p.inletMaxC.toFixed(0)}°C inlet.`,
    overview_paragraph_en: '',
    derived_parameters: {
      fan_count: 8,
      cooling_capacity_kw: p.heatKw * 1.2,
      max_inlet_c: p.inletMaxC,
    },
    allowed_radicals: ['thermal_transfer_function', 'polymer_thermoplastic', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [fans],
  }
}

// ---------------------------------------------------------------------------
// 7. IO_ports
// ---------------------------------------------------------------------------

function emitIoPorts(_p: EdgeAiParams): DesignModule {
  const front = makeSub('io_front_panel', 'front IO panel', 'connects',
    'front-of-rack USB 3.0 + VGA + reset/power buttons + LED indicators', [
    word('usb3_port_word', 'USB 3.0 port',
      cc('usb3_port', 'USB 3.0 type-A port', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'USB 3.0 type-A'),
       mod('capacity', '5', 'Gbps')]),
    word('vga_port_word', 'VGA port',
      cc('vga_port', 'VGA port', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'DE-15')]),
    word('led_indicator_word', 'LED indicator',
      cc('led_indicator', 'LED indicator', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'),
       mod('form', 'power/storage/network')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Front IO: 2× USB 3.0, 1× VGA, status LEDs, recessed reset. Rear IO: power/network/IPMI per other modules.',
    overview_paragraph_en: '',
    derived_parameters: {
      usb_port_count: 2,
      vga_port_count: 1,
    },
    allowed_radicals: ['silicon_semiconductor_function', 'optical_sensing_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [front],
  }
}

// ---------------------------------------------------------------------------
// 8. mounting_din_rail_or_rack
// ---------------------------------------------------------------------------

function emitMountingDinRailOrRack(_p: EdgeAiParams): DesignModule {
  const rack = makeSub('rack_mount_kit', 'rack mount kit', 'mounts',
    'tool-less inner+outer slide rails for 19-inch racks 600-900 mm depth', [
    word('rack_rail_kit_word', 'rack rail kit',
      cc('rack_rail_kit', 'tool-less rack rail kit', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'tool-less inner+outer slide rails'),
       mod('capacity', '35', 'kg'),
       mod('regulatory', 'EIA-310-D')]),
    word('cable_management_arm_word', 'cable management arm',
      cc('cable_management_arm', 'cable management arm', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'CMA pivot arm')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: 'Tool-less 19-inch slide rail kit + cable management arm. Compatible with 600-900 mm rack depth.',
    overview_paragraph_en: '',
    derived_parameters: {
      rack_compatibility_depth_min_mm: 600,
      rack_compatibility_depth_max_mm: 900,
    },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [rack],
  }
}

// ---------------------------------------------------------------------------
// Cross-module grammar links
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: EdgeAiParams) {
  return [
    { from_module: 'power_supply', to_module: 'compute_soc_accelerator', mechanism: 'electrical_bus',
      type: 'directional' as const, detail: `12 V rail to motherboard + GPU at ${p.totalPowerKw.toFixed(2)} kW` },
    { from_module: 'power_supply', to_module: 'memory_storage', mechanism: 'electrical_bus',
      type: 'directional' as const, detail: '12 V / 3.3 V rails to RAM + NVMe' },
    { from_module: 'compute_soc_accelerator', to_module: 'cooling_passive_active', mechanism: 'thermal',
      type: 'directional' as const, detail: `${p.heatKw.toFixed(2)} kW heat dissipation, air-cooled front-to-back` },
    { from_module: 'compute_soc_accelerator', to_module: 'network_interface', mechanism: 'data',
      type: 'mutual' as const, detail: 'PCIe Gen4 x16 from CPU to NIC' },
    { from_module: 'enclosure_chassis', to_module: 'mounting_din_rail_or_rack', mechanism: 'mechanical',
      type: 'directional' as const, detail: 'chassis bolts to slide-rail kit' },
    { from_module: 'enclosure_chassis', to_module: 'cooling_passive_active', mechanism: 'mechanical',
      type: 'directional' as const, detail: 'chassis fan tray screws into chassis mid-plane' },
    { from_module: 'memory_storage', to_module: 'compute_soc_accelerator', mechanism: 'data',
      type: 'mutual' as const, detail: 'DDR5 channels host-attached to CPU' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitComputeSocAccelerator(p),
    emitMemoryStorage(p),
    emitNetworkInterface(p),
    emitPowerSupply(p),
    emitEnclosureChassis(p),
    emitCoolingPassiveActive(p),
    emitIoPorts(p),
    emitMountingDinRailOrRack(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: ['energy_storage_source'],
    rationale_excluded: 'Edge AI servers do not store energy beyond hold-up capacitors (covered under power_supply). No battery storage at the appliance level.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${Math.round(p.inferenceTps)} tokens/second of inference throughput on a Llama-2-13B class workload from a single 1U short-depth ${p.gpuCount}× ${p.gpuModel} appliance, drawing ${p.gridPowerKw.toFixed(2)} kW from a redundant 80+ Titanium PSU pair.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('edge_ai', emitter)
registerAssembler('edge_ai/rack_1u', emitter)
