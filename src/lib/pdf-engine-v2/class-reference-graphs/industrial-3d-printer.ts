/**
 * @file class-reference-graphs/industrial-3d-printer.ts — K10 typed graph for
 * industrial 3D printers (DMLS / SLM / SLA / FFF at B2B capital-equipment scale).
 *
 * @description Models an industrial additive-manufacturing system at the
 * ~£50k-£1M capital-equipment scale, covering three modality families:
 *   - Powder-bed fusion (DMLS / SLM / SLS): EOS M-series, Renishaw RenAM,
 *     SLM Solutions NXG, HP MJF, 3D Systems DMP — laser sintering of metal
 *     or polymer powder layer-by-layer.
 *   - Stereolithography / Vat photopolymerisation (SLA / DLP / LCD): 3D Systems
 *     ProJet / Figure 4, Formlabs Form 4L, EnvisionTEC P4K, Carbon M2 —
 *     selective UV cure of liquid resin via DLP projector or scanning laser.
 *   - Material extrusion (FFF / FDM industrial): Stratasys F900 / Fortus, Markforged
 *     X7, Roboze ARGO, BigRep PRO — heated extruder depositing thermoplastic
 *     filament along a toolpath.
 *
 * Common module set: motion gantry / build platform (actuation), energy source
 * (laser / UV projector / heated extruder), feedstock supply (powder hopper /
 * resin tank / filament spool), build chamber environment (inert gas / heated
 * bed / extraction), control electronics, sensing, safety interlocks.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='industrial_3d_printer'`
 * in ~/.forge-truth/forge-truth.db (13 datasheets, well-covered).
 *
 * @corpus-coverage-2026-05-18
 *   - Build envelope: 192×108×370 mm to 914×609×914 mm — corpus direct.
 *   - Layer thickness: 25-330 µm (resin), 40-200 µm (SLS) — corpus direct.
 *   - Power input: 100-240 VAC single phase OR 400 VAC 3-phase 50/60 Hz
 *     (16 A circuit) — corpus direct.
 *   - Power consumption: 150 W (small SLA) to 3.25 kW (industrial SLA), heavier
 *     for SLM/DMLS metal — corpus direct.
 *   - System weight: 15-2869 kg (range covers desktop SLA to large DMLS) — corpus.
 *   - Compressed air: 90-120 psi at 20 CFM (extraction / pneumatics) — corpus.
 *   - Operating temperature: 15-30 °C ambient — corpus direct.
 *   - Operating humidity: 30-70% RH — corpus direct.
 *   - Network: 100 Mbit/s Ethernet + 2.4 GHz Wi-Fi (802.11 b/g/n) — corpus.
 *   - Post-cure (resin): 60 °C, 1.25 mW/cm², 405 nm, 60 min — corpus direct.
 *   - Noise: 35 dB idle / 46 dB build — corpus direct.
 *   - Standards: CE, EAC, FCC, UL94 HB, ASTM D638/D790/D256/D648, DIN EN
 *     ISO 10993-5 (cytotoxicity), 802.11/802.1x EAP — corpus direct.
 *
 * @scope-2026-05-18
 *   - Three modality families above. SLA/DLP/LCD = vat photopolymer;
 *     DMLS/SLM/SLS = powder bed fusion; FFF/FDM = filament extrusion.
 *   - Edge schema is mechanism-tagged so the validator can match the same
 *     graph to any modality — e.g. mass_fluid_transport_process covers
 *     powder feed OR resin pump OR filament feed; energy_conversion_transduction
 *     covers laser OR UV projector OR heated bed/extruder.
 *   - Post-processing stations (wash, post-cure, depowder, HIP) are OUT of
 *     scope — they live in separate graphs when seeded.
 *   - Material jetting (PolyJet, MultiJet) is a 4th modality not seeded here.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const INDUSTRIAL_3D_PRINTER: ProductClassGraph = {
  product_class: 'industrial_3d_printer',
  display_name: 'Industrial 3D Printer (DMLS / SLM / SLA / FFF, B2B capital equipment)',
  scope_notes:
    'Industrial additive-manufacturing system at the £50k-£1M scale spanning powder-bed fusion ' +
    '(DMLS/SLM/SLS), vat photopolymerisation (SLA/DLP/LCD), and material extrusion (FFF/FDM). ' +
    'Common module set: motion gantry + energy source (laser / UV projector / heated extruder) + ' +
    'feedstock supply (powder / resin / filament) + build chamber + control + safety. Post-processing ' +
    'stations (wash, post-cure, depowder, HIP) and material jetting (PolyJet) are OUT of scope.',

  nodes: [
    {
      class: 'actuation_kinematics',
      role: 'principal',
      required: true,
      display: 'XYZ motion gantry — galvo scanner head (PBF/SLA) OR cartesian/CoreXY (FFF) + Z build platform stepper',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'Laser source (1064/355 nm fibre/UV) OR DLP/LCD UV projector (385/405 nm) OR heated extruder + heated bed',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: true,
      display: 'Feedstock supply — powder recoater + hopper (PBF) OR resin pump + vat (SLA) OR filament feed + drive gear (FFF)',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Build chamber — inert N2/Ar (PBF) OR heated/UV-shielded (SLA) OR heated enclosure (FFF) + fume extraction',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Motion controller (RTOS) + slicer / job server + Ethernet 100 Mbit/s + 802.11 Wi-Fi',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Build-plate Z-encoder + chamber T/RH + O2 / inert-gas monitor + melt-pool camera (PBF) + filament-out detect',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Door interlock + UV/laser shutter + O2 alarm + over-temp trip + dust-explosion mitigation (PBF)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'AC input (100-240 V single OR 400 V 3-phase 16 A) + LV 24 V control supply + earthing bar',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Sheet-metal frame + machined optical baseplate + sealed build chamber',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Front-panel touchscreen + job-queue dashboard + observation window (UV-shielded)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Build-plate access door + powder-sieve port + filter replacement + laser-window cleaning kit',
    },
  ],

  edges: [
    // ── Power input ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_range_v: [100, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 16,
        power_max_w: 3250,
      },
      mechanical: { connector: 'IEC C20 / industrial 16 A 3P+N+PE', cable_type: 'mains cable' },
      required: true,
      direction: 'directional',
      notes:
        'AC mains powers the laser driver / UV projector lamp ballast / extruder heaters and heated bed. Corpus ' +
        'spans 100-132 V or 200-240 V single-phase (small SLA / FFF, 150 W to 3.25 kW) up to 400 VAC 3-phase ' +
        '50/60 Hz 16 A (industrial PBF). DMLS/SLM systems can draw 10-30 kW at peak laser duty.',
      source_references: [
        'corpus:Power Requirements@industrial_3d_printer (400VAC, 3P+N+PE, 50/60 Hz, 16A)',
        'corpus:Input Voltage@industrial_3d_printer (100–240 VAC)',
        'corpus:Power Consumption@industrial_3d_printer (3.25 kW)',
        'corpus:Power Consumption@industrial_3d_printer (150 W)',
        'corpus:Frequency@industrial_3d_printer (50/60 Hz)',
        'corpus:Current@industrial_3d_printer (40 A)',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: { voltage_nominal_v: 48, ac_or_dc: 'DC', current_max_a: 10 },
      mechanical: { connector: 'Phoenix MSTB', cable_type: 'multicore shielded' },
      required: true,
      direction: 'directional',
      notes:
        '24-48 V DC supply for stepper / servo drivers on the XYZ gantry, galvo scanner motors, recoater motor, ' +
        'and Z build platform actuator. Logic supply separated from heater supply to keep PWM noise off the ' +
        'motion control loop.',
      source_references: [
        'industry:Trinamic / Leadshine industrial stepper driver supply convention',
        'corpus:Peak Current@industrial_3d_printer (2 A)',
      ],
    },

    // ── Feedstock path ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      mechanical: { mount: 'in-line', connector: 'recoater blade / resin tray / Bowden tube' },
      required: true,
      direction: 'directional',
      notes:
        'Feedstock crosses into the build zone every layer: PBF recoater blade sweeps powder from hopper across ' +
        'the build plate; SLA resin gravity-feeds or pump-feeds the vat to maintain level; FFF extruder pulls ' +
        'filament from a spool via Bowden or direct-drive at 0.5-10 mm/s. Resin Storage Temperature 15-30 °C ' +
        '(corpus); FFF filament typically at 20-30 °C ambient.',
      source_references: [
        'corpus:Resin Storage Temperature@industrial_3d_printer (15 to 30 °C)',
        'corpus:Layer Thickness@industrial_3d_printer (0.330 / 0.254 / 0.178 / 0.127 mm)',
        'corpus:Resin Tray Capacity@industrial_3d_printer (2 L)',
        'corpus:Virgin Particle Size D50@industrial_3d_printer (56 μm)',
        'corpus:Volume rate@industrial_3d_printer (16.8 mm³/s)',
        'industry:EOS M-series powder handling SOP',
      ],
    },

    // ── Energy → workpiece ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'optical baseplate or extruder mount' },
      required: true,
      direction: 'mutual',
      notes:
        'Energy delivery head couples to the motion gantry: galvo scanner mirror + F-theta lens (PBF/SLA laser), ' +
        'DLP projector (SLA bottom-up), heated extruder hot-end (FFF). PBF projector wavelength 385/405 nm at ' +
        '~5 mW/cm² (corpus); minimum feature size 50 µm (corpus). FFF extruder reaches 300-450 °C (PEEK / ULTEM ' +
        'capable on industrial machines).',
      source_references: [
        'corpus:Irradiation@industrial_3d_printer (5 mW/cm²)',
        'corpus:Process Energy Wavelength@industrial_3d_printer (385 nm)',
        'corpus:Projector wavelength@industrial_3d_printer (385 nm)',
        'corpus:Light engine resolution@industrial_3d_printer (4K)',
        'corpus:Minimum Feature Size@industrial_3d_printer (50 μm)',
        'corpus:Pixel size@industrial_3d_printer (38.5 µm)',
      ],
    },

    // ── Build chamber environment ──
    {
      from_class: 'environmental_interface',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'air_duct',
      fluid: { medium: 'gas', temperature_max_c: 200, pressure_max_bar: 1 },
      required: true,
      direction: 'mutual',
      notes:
        'Build chamber environment surrounds the build platform: PBF requires inert gas purge (N2 / Ar, O2 ' +
        '<0.5%); SLA requires UV-shielded chamber at 15-30 °C; FFF industrial requires heated enclosure ' +
        '(70-120 °C ambient for PEEK / ULTEM). Compressed-air-driven extraction at 90-120 psi / 20 CFM ' +
        '(corpus) sweeps powder / fume across an extraction filter at 300 m³/h (corpus).',
      source_references: [
        'corpus:Operating Temperature@industrial_3d_printer (15 - 30 °C)',
        'corpus:Operating temperature@industrial_3d_printer (1200 °C)',
        'corpus:Compressed Air Pressure@industrial_3d_printer (90-120 psi)',
        'corpus:Compressed Air Flow@industrial_3d_printer (20 CFM)',
        'corpus:Extraction Rate@industrial_3d_printer (300 m³/h)',
        'corpus:Operating Humidity@industrial_3d_printer (30 to 70 % RH)',
      ],
    },
    {
      from_class: 'environmental_interface',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'water-glycol', temperature_max_c: 35, flow_max_lpm: 20 },
      mechanical: { mount: 'in-line', connector: 'chiller quick-connect' },
      required: false,
      direction: 'mutual',
      notes:
        'High-power laser sources (>500 W fibre laser on industrial DMLS / SLM) and heated extruder cold-ends ' +
        '(FFF water-cooled) are liquid-cooled by an integrated chiller. SLA UV projectors and lower-power ' +
        'laser systems use forced-air only. OPTIONAL — depends on modality scale.',
      source_references: [
        'industry:IPG fibre laser chiller spec',
        'industry:E3D water-cooled hot-end (FFF industrial)',
      ],
    },

    // ── Control path ──
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'EtherCAT',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e shielded' },
      required: true,
      direction: 'mutual',
      notes:
        'Motion controller drives the XYZ gantry / galvo scanner over EtherCAT or proprietary high-speed step+dir ' +
        '(at 100+ kHz for laser scanners). Slicer pre-computes G-code or laser-vector job and streams it to the ' +
        'motion controller. Stage 1.7 emissions may report `modbus_tcp` for any industrial Ethernet — accept ' +
        'EtherCAT, PROFINET, EtherNet/IP synonyms.',
      source_references: [
        'industry:Beckhoff TwinCAT EtherCAT industrial 3D printer reference',
        'industry:Aerotech A3200 scanner controller for SLM',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'Laser-on / UV-projector-on / extruder-heater PWM commands. Laser modulated synchronously with the galvo ' +
        'scan to deposit energy along the layer toolpath. Heated bed and extruder hot-end PID loops at 5-20 Hz.',
      source_references: ['industry:nLight Corona laser modulation app note'],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      required: true,
      direction: 'mutual',
      notes:
        'Reads chamber T/RH, O2 concentration (PBF inerting), build-plate Z-encoder, melt-pool camera (PBF in-situ ' +
        'monitoring), filament-out / runout detect, resin level (capacitive or laser ToF). Operating humidity ' +
        '30-70% RH (corpus); operating temperature 15-30 °C (corpus). RF operating band 2.4 GHz for Wi-Fi (corpus).',
      source_references: [
        'corpus:Operating Humidity@industrial_3d_printer',
        'corpus:Network Speed@industrial_3d_printer (100 Mbps)',
        'corpus:RF Operating Band@industrial_3d_printer (2.4 GHz)',
        'corpus:Layer Height Default@industrial_3d_printer (100 μm)',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'physical',
      mechanism: 'hmi_data',
      mechanical: { connector: 'HDMI / LVDS to touchscreen' },
      required: false,
      direction: 'mutual',
      notes:
        'Front-panel touchscreen displays job progress, slicer queue, error states. Network UI accessible over ' +
        'Ethernet 100 Mbit/s + 802.11 b/g/n Wi-Fi (corpus). 802.1x EAP authentication available (corpus).',
      source_references: [
        'corpus:802.11 b/g/n@industrial_3d_printer (Wi-Fi connectivity)',
        'corpus:802.1x EAP@industrial_3d_printer (Network Authentication)',
      ],
    },

    // ── Safety ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'Door interlock + laser/UV shutter is hard-wired into the laser/UV-source enable line. Per EN 60825-1 ' +
        '(laser product safety) the user-accessible build chamber must be a Class 1 enclosure; opening the door ' +
        'must close the laser shutter within milliseconds. Same chain trips on over-temp from heated bed/extruder.',
      source_references: [
        'standard:EN 60825-1 (laser safety)',
        'standard:EN ISO 12100:2010 (machinery safety)',
        'industry:EOS M290 safety architecture',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Digital-24V',
      mechanism: 'alarm_interlock',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes:
        'O2 monitor (PBF inert atmosphere — alarm above 0.5% O2 by volume), chamber smoke detector, dust-explosion ' +
        'rated rotary valve (powder), and emergency-stop chain feed the safety logic. ATEX zone classification ' +
        'applies for reactive metal powders (Al, Ti, Mg) per IEC 60079.',
      source_references: [
        'standard:EN ISO 12100:2010',
        'standard:IEC 60079-10-1 (hazardous areas)',
        'industry:Renishaw RenAM inert-atmosphere safety',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'environmental_interface',
      protocol: 'Digital-24V',
      mechanism: 'door_interlock',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes:
        'Door interlock blocks build start until chamber is sealed; opens the dust-extraction damper before door ' +
        'release on PBF (purge cycle). Resin chamber UV-shielded interlock prevents skin exposure to scattered ' +
        '385/405 nm. FFF heated chamber interlock prevents burn risk above 60 °C.',
      source_references: [
        'standard:EN ISO 12100:2010 (safety of machinery)',
        'standard:DIRECTIVE 2014/30/EU (EMC)',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'precision-ground optical baseplate' },
      required: true,
      direction: 'mutual',
      notes:
        'Motion gantry, galvo scanner / projector head, and build platform are bolted to a precision-ground ' +
        'optical baseplate / cast-iron base inside the printer frame. Print bed flatness 80-160 μm (corpus); ' +
        'XY/Z tolerance ±50 μm (validated) / ±100 μm (general) corpus. System weight 84-2869 kg (corpus).',
      source_references: [
        'corpus:Print Bed Flatness@industrial_3d_printer (80 / 160 μm)',
        'corpus:XY and Z tolerance (validated)@industrial_3d_printer (+/-50 μm)',
        'corpus:XY and Z tolerance (general)@industrial_3d_printer (+/-100 μm)',
        'corpus:System Weight@industrial_3d_printer (227 / 825 / 2869 kg)',
        'corpus:System Size@industrial_3d_printer (1626 x 864 x 711 mm)',
      ],
    },
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'powder hopper / resin vat / filament spool mount' },
      required: true,
      direction: 'mutual',
      notes:
        'Feedstock containers (powder hopper + dispense + overflow tank for PBF, resin vat for SLA, filament spool ' +
        'holder for FFF) bolt to the printer chassis. Powder hopper requires grounding for ESD.',
      source_references: ['industry:EOS / SLM Solutions powder-bed hopper design SOP'],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'service access door + filter housing' },
      required: false,
      direction: 'mutual',
      notes:
        'Filter replacement (HEPA / activated carbon for PBF + FFF), laser window cleaning, recoater blade swap, ' +
        'and depowder operations all happen via dedicated service doors. Resin tray swap on SLA. ' +
        'Acoustic noise 35 dB idle / 46 dB build (corpus).',
      source_references: [
        'corpus:Noise Level (Build)@industrial_3d_printer (46 dB)',
        'corpus:Noise Level (Idle)@industrial_3d_printer (35 dB)',
      ],
    },
  ],

  sources_cited: [
    'corpus:industrial_3d_printer (13 datasheets, 2026-05-18; EOS, Formlabs, Stratasys, Markforged, 3D Systems)',
    'standard:EN 60825-1 (laser product safety)',
    'standard:EN ISO 12100:2010 (machinery safety)',
    'standard:IEC 60079-10-1 (hazardous areas — reactive metal powders)',
    'standard:ASTM D638 (tensile properties)',
    'standard:ASTM D790 (flexural properties)',
    'standard:ASTM D256 (impact properties)',
    'standard:ASTM D648 (heat-deflection temperature)',
    'standard:DIN EN ISO 10993-5 (cytotoxicity for medical resins)',
    'standard:Directive 2014/30/EU (EMC)',
    'standard:CE',
    'standard:FCC Part B',
    'standard:UL94 HB',
    'standard:IEEE 802.11 b/g/n',
    'standard:802.1x EAP',
    'industry:EOS M290 / M400 DMLS datasheet',
    'industry:Renishaw RenAM 500 datasheet',
    'industry:SLM Solutions NXG XII 600 datasheet',
    'industry:Formlabs Form 4L / Fuse 1 datasheet',
    'industry:Stratasys F900 / Fortus datasheet',
    'industry:Markforged X7 datasheet',
    'industry:Carbon M2 / L1 datasheet',
  ],
}

registerClassReferenceGraph(INDUSTRIAL_3D_PRINTER)

export { INDUSTRIAL_3D_PRINTER }
