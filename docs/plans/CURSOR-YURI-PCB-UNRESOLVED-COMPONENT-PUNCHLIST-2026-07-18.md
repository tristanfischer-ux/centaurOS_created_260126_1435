# Cursor Yuri PCB unresolved-component punchlist

**Date:** 2026-07-18
**Authority:** Cursor-owned offline PCB tooling/docs; no chain output was changed
**Machine source:** `src/lib/pdf-engine-v2/lib/pcb/pcb-unresolved-component-punchlist.json`
**Identity baseline:** `/tmp/pcb-yuri-identity-final/verification-report.json`, produced by `d43f46aaf`

## Evidence boundary

The frozen seven-product/eight-board offline report started with 85 fitted components: 35 identity-verified and 50 unresolved. Eight identities were subsequently resolved and 20 roles were proven to be non-components. The active residual is therefore **22 unresolved fitted components**: **22 missing MPN** and **0 missing symbol/pinout**. The full 29-role input to this sourcing pass, including explicit electrical and package requirements for every miss, is preserved in `pcb-residual-procurement-requirements.json`.

The detailed sections preserve all 50 baseline entries for traceability. Items listed in the reassignment matrix are closed only as fitted-component identities; their mechanical, interconnect, host-side, passive-geometry, or functional obligations remain in whole-system architecture. Every other named part remains a candidate. A gold schematic value, repository footprint name, or forge-truth cache row is not resolution by itself. Resolution still requires:

1. derived target-board ratings;
2. manufacturer/orderable identity evidence;
3. role compatibility;
4. complete symbol and manufacturer pinout;
5. exact footprint and pin/pad parity.

`Unknown` is intentional where neither the offline report nor frozen source proves a rating. Placeholder footprints and synthetic pins are not rating evidence.

The latest identities were promoted only after the off-chain ingest wrote manufacturer-backed forge-truth rows and the DB-only resolver passed exact MPN, local symbol, full pinout, footprint, and electrical-pad parity. The former Colorimeter regulator closure remains withdrawn. Direct source inspection replaced the incorrect JST BM04 assumption with source-identified BOOMELE `1.0T-4P`; the wavelength role is closed by Yongyu `SZYY0603B`.

## Counts

| Product | Board(s) | Residual unresolved fitted components |
|---|---|---:|
| Colorimeter | `optical_source` | 0 |
| NinjaPCR | `thermal_controller` | 9 |
| Pioreactor | `wet_lab_hat`, `od_optics` | 3 |
| Rodeostat | `analog_afe` | 0 |
| OpenDrop | `hv_controller_main` | 10 |
| **Total** | **4 boards with residual fitted-component gaps** | **22** |

The architecture still requires eight board deliverables across five products. `wet_actuation` and `electrode_cartridge` remain required boards even though their current gaps are function contracts and passive copper geometry rather than package identities.

## Evidence-backed reassignment matrix

These **20 evidence-backed non-components** are removed from fitted BOM scope without removing their system obligations.

| Baseline identity | Placement | Whole-system owner retained |
|---|---|---|
| `colorimeter-optical_source-detector_mount_plate_word` | `mechanical_only` | Optical-source registration geometry |
| `colorimeter-optical_source-led_driver_word` | `passive_topology` | Wavelength-specific LED ballast resistor |
| `colorimeter-optical_source-dc_dc_regulator_word` | `passive_topology` | Host-supplied 3.3 V source-board rail |
| `ninjapcr-thermal_controller-usb_interface_tool_grounded_word` | `interconnect_only` | Wi-Fi host path plus debug/programming header |
| `pioreactor-wet_lab_hat-usb_interface_word` | `off_board_module` | Raspberry Pi host USB |
| `pioreactor-wet_lab_hat-firmware_storage_word` | `off_board_module` | Raspberry Pi host persistence |
| `pioreactor-wet_lab_hat-host_protocol_bridge_word` | `interconnect_only` | Direct Raspberry Pi HAT bus |
| `pioreactor-od_optics-usb_power_entry_word` | `interconnect_only` | HAT-to-OD-board JST power/data |
| `pioreactor-wet_actuation-required_heater_channel_word` | `functional_requirement` | One real heater channel topology |
| `pioreactor-wet_actuation-required_stir_channel_word` | `functional_requirement` | One real stir channel topology |
| `pioreactor-wet_actuation-required_pump_channel_word` | `functional_requirement` | One real dosing-pump channel topology |
| `rodeostat-analog_afe-usb_power_entry_word` | `off_board_module` | ItsyBitsy M4 host power entry |
| `rodeostat-analog_afe-usb_interface_word` | `off_board_module` | ItsyBitsy M4 host USB data |
| `rodeostat-analog_afe-host_protocol_bridge_word` | `interconnect_only` | Direct shield-to-host bus |
| `rodeostat-analog_afe-ferrite_emc_bead_word` | `passive_topology` | Released shield decoupling; no bead without a measured filter requirement |
| `rodeostat-analog_afe-power_indicator_led_word` | `off_board_module` | Adafruit ItsyBitsy M4 Express product 3800 indicators |
| `rodeostat-analog_afe-adc_input_stage_word` | `off_board_module` | Adafruit ItsyBitsy M4 Express product 3800 dual ADCs |
| `rodeostat-analog_afe-status_indicator_word` | `off_board_module` | Adafruit ItsyBitsy M4 Express product 3800 indicators |
| `opendrop-hv_controller_main-usb_interface_word` | `interconnect_only` | Retained source-backed USB-C entry circuit |
| `opendrop-electrode_cartridge-required_electrode_channel_word` | `passive_geometry` | All 64 cartridge electrodes, routes, creepage, and mating interface |

## mechanical_or_off_board_scope

<a id="colorimeter-optical_source-detector_mount_plate_word"></a>
- **Colorimeter · `optical_source` · `detector_mount_plate_word`** — Ratings: unknown electrical function/interface. Gap: **MPN**. Candidate: none; role is mechanically named. Action: reclassify in `pcb-architecture.ts`; only fit a component if the actual detector/interface and ratings replace this role.

## optical_source_and_visual_indication

<a id="colorimeter-optical_source-led_source_word"></a>
- **Colorimeter · `optical_source` · `led_source_word`** — **Resolved:** Yongyu `SZYY0603B`, 469 nm peak / 460–475 nm dominant wavelength, 3.1 V, 30 mA-rated 0603 LED. The frozen board's 15 mA operating point, manufacturer polarity, exact local symbol and 0603 footprint are mapped.

<a id="colorimeter-optical_source-led_driver_word"></a>
- **Colorimeter · `optical_source` · `led_driver_word`** — **Reclassified:** every frozen source board uses one wavelength-specific LED and one calculated ballast resistor. No driver IC is fitted; the current-limiting function remains mandatory as passive topology.

<a id="ninjapcr-thermal_controller-status_led_word"></a>
- **NinjaPCR · `thermal_controller` · `status_led_word`** — Ratings: colour, forward voltage/current, intensity and resistor unknown. Gap: **MPN**. Action: define indication/current, ingest an orderable LED, calculate resistor, map polarity/footprint.

<a id="pioreactor-od_optics-power_indicator_led_word"></a>
- **Pioreactor · `od_optics` · `power_indicator_led_word`** — Ratings: need, colour/current and resistor unknown. Gap: **MPN**. `4-2489541-7` is rejected: forge-truth identifies a 110 V DC panel indicator, no authoritative PCB package/terminal geometry was found, and frozen Eye-Spy has no indicator LED. Action: remove unless required; otherwise source a real board LED and resistor.

<a id="rodeostat-analog_afe-power_indicator_led_word"></a>
- **Rodeostat · `analog_afe` · `power_indicator_led_word`** — **Reclassified off-board:** frozen U2 is Adafruit ItsyBitsy M4 Express product `3800`; its manufacturer page specifies the built-in red D13 and RGB DotStar indicators. No shield LED or resistor is fitted.

<a id="rodeostat-analog_afe-status_indicator_word"></a>
- **Rodeostat · `analog_afe` · `status_indicator_word`** — **Reclassified off-board:** firmware status is supplied by the red D13 and RGB DotStar indicators on Adafruit ItsyBitsy M4 Express product `3800`; the frozen shield fits no separate status LED.

<a id="opendrop-hv_controller_main-power_indicator_led_word"></a>
- **OpenDrop · `hv_controller_main` · `power_indicator_led_word`** — Ratings: LV/HV rail, colour/current and resistor unknown. Gap: **MPN**. The unsupported 110 V panel indicator `4-2489541-7` is rejected. Action: derive the rail indication and source the released or a datasheet-backed board LED.

<a id="opendrop-hv_controller_main-status_indicator_word"></a>
- **OpenDrop · `hv_controller_main` · `status_indicator_word`** — Ratings: state, colour/current and resistor unknown. Gap: **MPN**. Gold candidate: V4 `LED1`–`LED3` prove positions only, not identity. Action: map state to firmware/electrical behavior, then ingest an exact LED/resistor.

## power_entry_conversion_and_protection

<a id="colorimeter-optical_source-dc_dc_regulator_word"></a>
- **Colorimeter · `optical_source` · `dc_dc_regulator_word`** — **Reclassified:** frozen 3V3 boards contain only two connectors, one LED and one resistor. The host owns regulation; no board-local regulator is fitted.

<a id="ninjapcr-thermal_controller-terminal_block_word"></a>
- **NinjaPCR · `thermal_controller` · `terminal_block_word`** — Ratings: 12 V/high-current thermal path known; current, wire gauge and temperature rise unknown. Gap: **MPN**. Gold candidate: `SCREW-TERMINAL-GREEN(2P-3.5)` family. Action: derive load/current and extract or source an exact rated connector.

<a id="ninjapcr-thermal_controller-bulk_capacitor_word"></a>
- **NinjaPCR · `thermal_controller` · `bulk_capacitor_word`** — Ratings: source proves 1000 µF, 25 V; ripple, ESR and life unknown. Gap: **MPN**. Gold candidate: `CAP_SMDAL_1000UF_25V` value/package. Action: extract released BOM code or source an equivalent with ripple/ESR/life evidence, ingest and map polarity/case.

<a id="ninjapcr-thermal_controller-h_bridge_tec_driver_word"></a>
- **NinjaPCR · `thermal_controller` · `h_bridge_tec_driver_word`** — Ratings: bidirectional 12 V TEC role known; current, RDS(on), gate drive and thermal limits unknown. Gap: **MPN**. Gold candidate: released relay/MOSFET Peltier stage (role only). Action: derive TEC power stage, then ingest every exact switch/driver/protection part.

<a id="ninjapcr-thermal_controller-dc_dc_regulator_word"></a>
- **NinjaPCR · `thermal_controller` · `dc_dc_regulator_word`** — Ratings: candidate implies 3.3 V; load and thermal margin unknown. Gap: **MPN**. Microchip DS20001826F closes `MCP1700T-3302E/TT` as 3-pin SOT-23 (1 GND, 2 VOUT, 3 VIN), but its 6 V maximum rejects direct use on NinjaPCR's 12 V rail. Action: derive the actual node and source a compliant regulator.

<a id="ninjapcr-thermal_controller-current_sense_shunt_word"></a>
- **NinjaPCR · `thermal_controller` · `current_sense_shunt_word`** — Ratings: current, resistance, power, tolerance/TCR and Kelvin need unknown. Gap: **MPN**. Action: calculate from full-scale current and permitted loss, then ingest an exact shunt.

<a id="ninjapcr-thermal_controller-thermal_fuse_safety_word"></a>
- **NinjaPCR · `thermal_controller` · `thermal_fuse_safety_word`** — Ratings: opening temperature, current/voltage and thermal coupling unknown. Gap: **MPN**. Action: derive safe trip threshold and source a manufacturer thermal cutoff.

<a id="ninjapcr-thermal_controller-estop_or_power_kill_word"></a>
- **NinjaPCR · `thermal_controller` · `estop_or_power_kill_word`** — Ratings: interrupted load, contact topology/current, fail-safe state and cycle life unknown. Gap: **MPN**. Action: define interruption level, then source a safety-rated switch/relay; generic tactile switch is unacceptable.

<a id="pioreactor-od_optics-usb_power_entry_word"></a>
- **Pioreactor · `od_optics` · `usb_power_entry_word`** — Ratings: board ownership, current, connector and shield treatment unknown. Gap: **MPN**. Gold candidate: two `BM04B-SRSS-TB` JST host connectors, not USB. Action: reconcile to gold interconnect; remove local USB if host-powered.

<a id="pioreactor-od_optics-esd_protection_network_word"></a>
- **Pioreactor · `od_optics` · `esd_protection_network_word`** — **Resolved:** frozen Eye-Spy BOM D2-D5 specifies Toshiba `DF2S6.8MFS,L3M`, 5 V working/15 V clamp, with two-pin TVS symbol and exact SOD-923 footprint.

<a id="pioreactor-od_optics-ferrite_emc_bead_word"></a>
- **Pioreactor · `od_optics` · `ferrite_emc_bead_word`** — Ratings: need, impedance/frequency, current and DCR unknown. Gap: **MPN**; absent from frozen Eye-Spy BOM. Action: remove unless analysis requires it; otherwise derive and ingest.

<a id="pioreactor-wet_actuation-required_heater_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_heater_channel_word`** — Ratings: one channel known; voltage/current/power, topology, thermal and fault state unknown. Gap: **MPN**. Gold candidate: frozen `heater_20ml` stage (role only). Action: extract released topology/ratings and ingest exact switch/driver/connector identities.

<a id="rodeostat-analog_afe-usb_power_entry_word"></a>
- **Rodeostat · `analog_afe` · `usb_power_entry_word`** — Ratings: board ownership, current, connector and shield treatment unknown. Gap: **MPN**. Gold uses COTS ItsyBitsy M4 host. Action: reclassify USB to host unless the shield genuinely carries it.

<a id="rodeostat-analog_afe-esd_protection_network_word"></a>
- **Rodeostat · `analog_afe` · `esd_protection_network_word`** — **Resolved:** frozen D1/D2 identify Slkor `BAS70-04`, LCSC C609810, in SOT-23. Manufacturer data distributed by LCSC closes pins 1=A1, 2=K2, 3=K1/A2 and 70 V/70 mA, 100 nA at 50 V, 2 pF ratings. This is a low-leakage rail clamp, not a generic IEC-certified TVS.

<a id="rodeostat-analog_afe-ferrite_emc_bead_word"></a>
- **Rodeostat · `analog_afe` · `ferrite_emc_bead_word`** — **Rejected as not fitted:** frozen revision `86e4708fea84f8fc33bcbfc9a706b06f4b770efd` contains no ferrite bead and provides no impedance/current/DCR requirement from which to procure one.

<a id="opendrop-hv_controller_main-usb_power_entry_word"></a>
- **OpenDrop · `hv_controller_main` · `usb_power_entry_word`** — **Resolved:** frozen J1 and Amphenol evidence identify `12401610E4#2A`, a full-featured 24-contact USB-C receptacle; forge-truth confirms the identity and the resolver maps all A/B contacts plus shield to the exact local footprint.

<a id="opendrop-hv_controller_main-esd_protection_network_word"></a>
- **OpenDrop · `hv_controller_main` · `esd_protection_network_word`** — Ratings: protected USB/LV/HV interfaces, clamp, capacitance and channels unknown. Gap: **MPN**. Action: partition domains, derive per-interface protection and ingest exact devices.

<a id="opendrop-hv_controller_main-ferrite_emc_bead_word"></a>
- **OpenDrop · `hv_controller_main` · `ferrite_emc_bead_word`** — Ratings: LV rail, impedance spectrum, current and DCR unknown. Gap: **MPN**. Action: derive from switching-noise analysis; ingest exact bead and prove it does not cross isolation.

## digital_compute_communications_and_storage

<a id="ninjapcr-thermal_controller-wifi_module_word"></a>
- **NinjaPCR · `thermal_controller` · `wifi_module_word`** — **Resolved:** released BOM fits Espressif `ESP-WROOM-02` at ESP2 quantity 1 and marks ESP-12F quantity 0; the manufacturer 18-pad pinout, 3.0–3.6 V supply, 500 mA supply recommendation, exact local footprint, and antenna keepout are mapped.

<a id="ninjapcr-thermal_controller-debug_uart_word"></a>
- **NinjaPCR · `thermal_controller` · `debug_uart_word`** — Ratings: four-position interface known; real signals, logic voltage, orientation/current unknown. Gap: **MPN/pin contract**. Action: extract programmer/UART signals, source exact header and map truthful pins.

<a id="ninjapcr-thermal_controller-usb_interface_tool_grounded_word"></a>
- **NinjaPCR · `thermal_controller` · `usb_interface_tool_grounded_word`** — Ratings: USB need/version/power/data/ESD unknown. Gap: **MPN**. Action: remove if released programming header/Wi-Fi closes the interface; otherwise derive and source full USB circuit.

<a id="pioreactor-wet_lab_hat-usb_interface_word"></a>
- **Pioreactor · `wet_lab_hat` · `usb_interface_word`** — Ratings: HAT USB need/mode/connector unknown. Gap: **MPN**. Action: assign USB to Raspberry Pi host unless a real HAT peripheral contract proves otherwise.

<a id="pioreactor-wet_lab_hat-firmware_storage_word"></a>
- **Pioreactor · `wet_lab_hat` · `firmware_storage_word`** — Ratings: purpose, capacity/endurance, bus/voltage and retention unknown. Gap: **MPN**. Action: remove if host provides persistence; otherwise derive and ingest exact memory.

<a id="pioreactor-wet_lab_hat-debug_header_word"></a>
- **Pioreactor · `wet_lab_hat` · `debug_header_word`** — Ratings: protocol, pin contract, voltage and orientation unknown. Gap: **MPN**. Action: derive actual HAT debug signals, source keyed/header part and map all pins.

<a id="pioreactor-wet_lab_hat-host_protocol_bridge_word"></a>
- **Pioreactor · `wet_lab_hat` · `host_protocol_bridge_word`** — Ratings: both protocols, channels, levels, throughput and isolation unknown. Gap: **MPN**. Action: remove if direct Pi buses suffice; otherwise source exact bridge from a named contract.

<a id="rodeostat-analog_afe-usb_interface_word"></a>
- **Rodeostat · `analog_afe` · `usb_interface_word`** — Ratings: shield USB ownership/mode/connector unknown. Gap: **MPN**. Action: assign USB to ItsyBitsy host unless released shield source proves otherwise.

<a id="rodeostat-analog_afe-host_protocol_bridge_word"></a>
- **Rodeostat · `analog_afe` · `host_protocol_bridge_word`** — Ratings: protocols, levels, channels, throughput and isolation unknown. Gap: **MPN**. Action: use direct host buses where possible; otherwise derive and ingest exact bridge.

<a id="opendrop-hv_controller_main-usb_interface_word"></a>
- **OpenDrop · `hv_controller_main` · `usb_interface_word`** — Ratings: USB-C physical interface known; controller/PHY, power/data and ESD unknown. Gap: **MPN** for duplicate generic role. Gold candidate: Amphenol `12401610E4-2A` receptacle. Action: merge entry/interface roles into one source-backed circuit.

<a id="opendrop-hv_controller_main-firmware_storage_word"></a>
- **OpenDrop · `hv_controller_main` · `firmware_storage_word`** — Ratings: purpose, capacity/endurance, bus and retention unknown. Gap: **MPN**. Action: remove if SAMD21 flash suffices; otherwise derive and ingest exact memory.

<a id="opendrop-hv_controller_main-debug_header_word"></a>
- **OpenDrop · `hv_controller_main` · `debug_header_word`** — Ratings: SWD/UART protocol, pin contract, voltage and orientation unknown. Gap: **MPN**. Action: extract released SAMD21 debug interface, source connector and map all pins.

<a id="opendrop-hv_controller_main-host_protocol_bridge_word"></a>
- **OpenDrop · `hv_controller_main` · `host_protocol_bridge_word`** — Ratings: protocols, levels, channels, throughput and isolation unknown. Gap: **MPN**. Action: remove if SAMD21 directly implements host protocol; otherwise derive and source exact bridge.

## precision_analog_measurement_and_control

<a id="rodeostat-analog_afe-dac_output_stage_word"></a>
- **Rodeostat · `analog_afe` · `dac_output_stage_word`** — **Resolved:** frozen U11/U13 nets and BOM LCSC C7433 identify TI `OP07CDR` for bipolar DAC shift/scale; forge-truth confirms the identity and complete OP07 SOIC-8 pinout/footprint parity passes.

<a id="rodeostat-analog_afe-adc_input_stage_word"></a>
- **Rodeostat · `analog_afe` · `adc_input_stage_word`** — **Reclassified off-board:** frozen U2 routes conditioned outputs to A0-A5 on Adafruit ItsyBitsy M4 Express product `3800`; Adafruit specifies dual 1 MSPS 12-bit ADCs and seven analogue inputs. No discrete shield ADC is fitted.

<a id="rodeostat-analog_afe-current_measurement_tia_word"></a>
- **Rodeostat · `analog_afe` · `current_measurement_tia_word`** — **Resolved:** frozen U9 directly joins `WRK_ELECT` to the selectable-gain TIA network; BOM LCSC C6961 identifies ST `TL072CDT`, and forge-truth plus complete TL072 SOIC-8 pinout/footprint parity pass.

<a id="opendrop-hv_controller_main-dac_output_stage_word"></a>
- **OpenDrop · `hv_controller_main` · `dac_output_stage_word`** — Ratings and need unknown. Gap: **MPN**; audit identifies this as foreign potentiostat-template residue. Action: remove unless real MAX1771/HV feedback source proves a DAC stage.

<a id="opendrop-hv_controller_main-adc_input_stage_word"></a>
- **OpenDrop · `hv_controller_main` · `adc_input_stage_word`** — Ratings and measured quantity unknown. Gap: **MPN**. The fully mapped `NAU7802SGI` is rejected because its bridge-sensor function is absent from OpenDrop's HV feedback path. Action: remove the foreign ADC template; trace and source actual HV monitoring.

<a id="opendrop-hv_controller_main-current_measurement_tia_word"></a>
- **OpenDrop · `hv_controller_main` · `current_measurement_tia_word`** — Ratings and need unknown. Gap: **MPN**. TI SBOS213D corrects `OPA334AIDBVR` to six-pin SOT-23 DBV with shutdown; it is rejected because OpenDrop has no source-backed potentiostat TIA role. Action: remove the template and derive actual HV feedback/sense circuitry.

## wet_actuation_drive

<a id="pioreactor-wet_actuation-required_stir_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_stir_channel_word`** — Ratings: one channel known; motor voltage/stall current, PWM, fault state and thermal margin unknown. Gap: **symbol/pinout** for DB-backed `DRV8876PWPR`. Action: derive motor ratings, verify margins, import/map full manufacturer pinout and exposed-pad footprint.

<a id="pioreactor-wet_actuation-required_pump_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_pump_channel_word`** — Ratings: one channel known; pump voltage/stall current, drive mode, fault state and thermal margin unknown. Gap: **symbol/pinout** for DB-backed `DRV8876PWPR`. Action: derive pump ratings, verify margins, import/map full manufacturer pinout and exposed-pad footprint.

## board_to_board_and_cartridge_interconnect

<a id="colorimeter-optical_source-source_board_connector_word"></a>
- **Colorimeter · `optical_source` · `source_board_connector_word`** — **Resolved:** frozen J1/J2 identify LCSC C145956, which manufacturer data maps to BOOMELE `1.0T-4P`: 4 contacts, 1.00 mm pitch, right-angle SMD, 50 V, 1 A. Pins are GND/3V3/SDA/SCL; the frozen BOOMELE land pattern is vendored as `Forge_Manufacturer:BOOMELE_1.0T-4P` and passes electrical-pad parity. The assembly BOM must still freeze the mating cable.

<a id="opendrop-electrode_cartridge-required_electrode_channel_word"></a>
- **OpenDrop · `electrode_cartridge` · `required_electrode_channel_word`** — Ratings: 64 channels and cartridge mating known; connector count/code, voltage, creepage, contact rating and cycles unknown. Gap: **MPN**. Gold candidate: Mini-DIMM/cartridge interconnect family. Action: extract 64-channel pin/domain map, resolve exact connector or custom edge geometry, prove creepage/alignment and complete pads.

## Ordered next actions

1. **Derive ratings from board contracts** — especially NinjaPCR TEC/heater safety, Pioreactor optics, Rodeostat analog performance, and OpenDrop HV/interconnect domains.
2. **Ingest manufacturer-backed gold candidates** — Colorimeter LED identities and released NinjaPCR/Rodeostat BOM identities.
3. **Close the 7 symbol/pinout blockers** — only after role/rating checks; map complete local symbols and exact footprints with pin/pad parity.
4. **Implement the preserved function contracts** — replace Pioreactor channel requirements with complete switching/protection/connector topologies, and prove all 64 OpenDrop electrode routes and mating contacts.
5. **Regenerate the offline report** — done only by the terminal owner after source work. The acceptance target is 29 → 0 unresolved fitted identities; this document does not claim a terminal-owned chain rerun.
