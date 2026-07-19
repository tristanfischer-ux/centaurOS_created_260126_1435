# Cursor Yuri PCB unresolved-component punchlist

**Date:** 2026-07-18
**Authority:** Cursor-owned offline PCB tooling/docs; no chain output was changed
**Machine source:** `src/lib/pdf-engine-v2/lib/pcb/pcb-unresolved-component-punchlist.json`
**Identity baseline:** `/tmp/pcb-yuri-identity-final/verification-report.json`, produced by `d43f46aaf`

## Evidence boundary

The frozen seven-product/eight-board offline report started with 85 fitted components: 35 identity-verified and 50 unresolved. Twelve identities were subsequently resolved and 22 roles were proven to be non-components. The active residual is therefore **16 unresolved fitted components**: **16 missing MPN** and **0 missing symbol/pinout**. The full 29-role input to this sourcing pass, including explicit electrical and package requirements for every miss, is preserved in `pcb-residual-procurement-requirements.json`.

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
| Pioreactor | `wet_lab_hat`, `od_optics`, `wet_actuation` | 0 |
| Rodeostat | `analog_afe` | 0 |
| OpenDrop | `hv_controller_main` | 7 |
| **Total** | **2 boards with residual fitted-component gaps** | **16** |

The architecture still requires eight board deliverables across five products. `wet_actuation` and `electrode_cartridge` remain required boards even though their current gaps are function contracts and passive copper geometry rather than package identities.

## Evidence-backed reassignment matrix

These **22 evidence-backed non-components** are removed from fitted BOM scope without removing their system obligations.

| Baseline identity | Placement | Whole-system owner retained |
|---|---|---|
| `colorimeter-optical_source-detector_mount_plate_word` | `mechanical_only` | Optical-source registration geometry |
| `colorimeter-optical_source-led_driver_word` | `passive_topology` | Wavelength-specific LED ballast resistor |
| `colorimeter-optical_source-dc_dc_regulator_word` | `passive_topology` | Host-supplied 3.3 V source-board rail |
| `ninjapcr-thermal_controller-usb_interface_tool_grounded_word` | `interconnect_only` | Wi-Fi host path plus debug/programming header |
| `pioreactor-wet_lab_hat-usb_interface_word` | `off_board_module` | Raspberry Pi host USB |
| `pioreactor-wet_lab_hat-firmware_storage_word` | `off_board_module` | Raspberry Pi host persistence |
| `pioreactor-od_optics-power_indicator_led_word` | `off_board_module` | HAT GPIO23 PCB indication |
| `pioreactor-wet_lab_hat-host_protocol_bridge_word` | `interconnect_only` | Direct Raspberry Pi HAT bus |
| `pioreactor-od_optics-usb_power_entry_word` | `interconnect_only` | HAT-to-OD-board JST power/data |
| `pioreactor-od_optics-ferrite_emc_bead_word` | `passive_topology` | Released Eye-Spy decoupling; bead only after measured need |
| `pioreactor-wet_actuation-required_heater_channel_word` | `functional_requirement` | One real heater channel topology |
| `pioreactor-wet_actuation-required_stir_channel_word` | `functional_requirement` | One real stir channel topology |
| `pioreactor-wet_actuation-required_pump_channel_word` | `functional_requirement` | One real dosing-pump channel topology |
| `rodeostat-analog_afe-usb_power_entry_word` | `off_board_module` | ItsyBitsy M4 host power entry |
| `rodeostat-analog_afe-usb_interface_word` | `off_board_module` | ItsyBitsy M4 host USB data |
| `rodeostat-analog_afe-host_protocol_bridge_word` | `interconnect_only` | Direct shield-to-host bus |
| `rodeostat-analog_afe-ferrite_emc_bead_word` | `passive_topology` | Released shield decoupling; no fitted bead |
| `rodeostat-analog_afe-power_indicator_led_word` | `off_board_module` | ItsyBitsy M4 host indication |
| `rodeostat-analog_afe-adc_input_stage_word` | `off_board_module` | ItsyBitsy M4 ATSAMD51 ADCs |
| `rodeostat-analog_afe-status_indicator_word` | `off_board_module` | ItsyBitsy M4 firmware-controlled LEDs |
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
- **Pioreactor · `od_optics` · `power_indicator_led_word`** — **Rejected as not fitted:** frozen Eye-Spy has no indicator LED, while Pioreactor assigns system PCB indication to the HAT on GPIO23. TE `4-2489541-7` remains rejected as a 110 V panel indicator with no PCB pad geometry.

<a id="rodeostat-analog_afe-power_indicator_led_word"></a>
- **Rodeostat · `analog_afe` · `power_indicator_led_word`** — **Reclassified:** the frozen shield fits Adafruit ItsyBitsy M4 Express product 3800, whose built-in red D13 and RGB DotStar indicators own visual indication. No duplicate shield LED is fitted; TE `4-2489541-7` remains rejected.

<a id="rodeostat-analog_afe-status_indicator_word"></a>
- **Rodeostat · `analog_afe` · `status_indicator_word`** — **Reclassified:** status indication is supplied by the purchased ItsyBitsy M4 red D13 and RGB DotStar LEDs. Firmware state semantics remain required; no shield-fitted LED identity is invented.

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
- **Pioreactor · `od_optics` · `usb_power_entry_word`** — **Reclassified:** the frozen Eye-Spy board is host-powered through two `BM04B-SRSS-TB` JST interconnects, not a local USB connector. Power/data entry remains an interconnect obligation.

<a id="pioreactor-od_optics-esd_protection_network_word"></a>
- **Pioreactor · `od_optics` · `esd_protection_network_word`** — **Resolved:** frozen Eye-Spy BOM D2-D5 specifies Toshiba `DF2S6.8MFS,L3M`, 5 V working/15 V clamp, with two-pin TVS symbol and exact SOD-923 footprint.

<a id="pioreactor-od_optics-ferrite_emc_bead_word"></a>
- **Pioreactor · `od_optics` · `ferrite_emc_bead_word`** — **Rejected as not fitted:** frozen Eye-Spy contains exact local decoupling and no ferrite bead. No impedance/current/DCR requirement exists; a bead is a future measured power-integrity change, not a procurement residual.

<a id="pioreactor-wet_actuation-required_heater_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_heater_channel_word`** — **Reclassified as a functional requirement:** one heater channel remains mandatory, but the requirement itself is not an orderable package. The released `heater_20ml` topology must be decomposed into exact switch, protection, connector, and sensing identities.

<a id="rodeostat-analog_afe-usb_power_entry_word"></a>
- **Rodeostat · `analog_afe` · `usb_power_entry_word`** — **Reclassified:** USB power entry is owned by the purchased ItsyBitsy M4 host module, not the analog shield.

<a id="rodeostat-analog_afe-esd_protection_network_word"></a>
- **Rodeostat · `analog_afe` · `esd_protection_network_word`** — **Resolved:** frozen D1/D2 and LCSC C609810 identify Slkor `BAS70-04`, a dual-series 70 V Schottky clamp with 100 nA maximum leakage at 50 V and 2 pF capacitance. The three-pin SOT-23 symbol and footprint parity are mapped; no IEC TVS claim is made.

<a id="rodeostat-analog_afe-ferrite_emc_bead_word"></a>
- **Rodeostat · `analog_afe` · `ferrite_emc_bead_word`** — **Rejected as not fitted:** the frozen shield has capacitive decoupling and no ferrite bead or impedance/current/DCR requirement. A future bead requires measured rail-noise evidence.

<a id="opendrop-hv_controller_main-usb_power_entry_word"></a>
- **OpenDrop · `hv_controller_main` · `usb_power_entry_word`** — **Resolved:** frozen J1 and Amphenol evidence identify `12401610E4#2A`, a full-featured 24-contact USB-C receptacle; forge-truth confirms the identity and the resolver maps all A/B contacts plus shield to the exact local footprint.

<a id="opendrop-hv_controller_main-esd_protection_network_word"></a>
- **OpenDrop · `hv_controller_main` · `esd_protection_network_word`** — **Resolved:** frozen D4 and Nexperia evidence identify `PESD5V0L5UY`, a five-line 5 V common-anode ESD array in SOT-363. All six pins, 12 V maximum clamp, capacitance, IEC 61000-4-2 rating, and exact footprint parity are mapped.

<a id="opendrop-hv_controller_main-ferrite_emc_bead_word"></a>
- **OpenDrop · `hv_controller_main` · `ferrite_emc_bead_word`** — Ratings: LV rail, impedance spectrum, current and DCR unknown. Gap: **MPN**. Action: derive from switching-noise analysis; ingest exact bead and prove it does not cross isolation.

## digital_compute_communications_and_storage

<a id="ninjapcr-thermal_controller-wifi_module_word"></a>
- **NinjaPCR · `thermal_controller` · `wifi_module_word`** — **Resolved:** released BOM fits Espressif `ESP-WROOM-02` at ESP2 quantity 1 and marks ESP-12F quantity 0; the manufacturer 18-pad pinout, 3.0–3.6 V supply, 500 mA supply recommendation, exact local footprint, and antenna keepout are mapped.

<a id="ninjapcr-thermal_controller-debug_uart_word"></a>
- **NinjaPCR · `thermal_controller` · `debug_uart_word`** — Ratings: four-position interface known; real signals, logic voltage, orientation/current unknown. Gap: **MPN/pin contract**. Action: extract programmer/UART signals, source exact header and map truthful pins.

<a id="ninjapcr-thermal_controller-usb_interface_tool_grounded_word"></a>
- **NinjaPCR · `thermal_controller` · `usb_interface_tool_grounded_word`** — **Reclassified:** normal host communication belongs to the released Wi-Fi module and service access remains on the debug/programming header. No additional USB component is evidenced.

<a id="pioreactor-wet_lab_hat-usb_interface_word"></a>
- **Pioreactor · `wet_lab_hat` · `usb_interface_word`** — **Reclassified:** the Raspberry Pi host owns USB; no independent HAT USB peripheral or connector is evidenced.

<a id="pioreactor-wet_lab_hat-firmware_storage_word"></a>
- **Pioreactor · `wet_lab_hat` · `firmware_storage_word`** — **Reclassified:** firmware persistence is owned by the Raspberry Pi host filesystem; no board-local memory contract exists.

<a id="pioreactor-wet_lab_hat-debug_header_word"></a>
- **Pioreactor · `wet_lab_hat` · `debug_header_word`** — **Resolved through the real host interconnect:** Samtec `SSQ-120-03-T-D`, 2x20 vertical through-hole 2.54 mm socket, 10.00 mm tails, matte tin, 465 VAC/655 VDC, 6.3 A per pin with two pins powered, -55 to +105 C. All 40 contacts are mapped; physical pin 18 is GPIO24/SWDIO and pin 22 is GPIO25/SWCLK. The synthetic separate four-pin header is rejected.

<a id="pioreactor-wet_lab_hat-host_protocol_bridge_word"></a>
- **Pioreactor · `wet_lab_hat` · `host_protocol_bridge_word`** — **Reclassified:** host communication uses direct Raspberry Pi HAT buses. The interconnect obligation remains, but no bridge IC is fitted.

<a id="rodeostat-analog_afe-usb_interface_word"></a>
- **Rodeostat · `analog_afe` · `usb_interface_word`** — **Reclassified:** USB data terminates on the purchased ItsyBitsy M4 host module; no shield-side USB circuit is fitted.

<a id="rodeostat-analog_afe-host_protocol_bridge_word"></a>
- **Rodeostat · `analog_afe` · `host_protocol_bridge_word`** — **Reclassified:** the shield uses its direct host bus, with no source-backed protocol-converter IC.

<a id="opendrop-hv_controller_main-usb_interface_word"></a>
- **OpenDrop · `hv_controller_main` · `usb_interface_word`** — **Reclassified:** this duplicate generic role is owned by the retained Amphenol `12401610E4#2A` USB-C entry circuit; no second fitted interface component is claimed.

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
- **Rodeostat · `analog_afe` · `adc_input_stage_word`** — **Reclassified:** conditioned analog outputs terminate at the purchased ItsyBitsy M4 Express product 3800, whose ATSAMD51 provides dual 1 MSPS 12-bit ADCs. `NAU7802SGI` remains rejected as an unrelated bridge-sensor ADC.

<a id="rodeostat-analog_afe-current_measurement_tia_word"></a>
- **Rodeostat · `analog_afe` · `current_measurement_tia_word`** — **Resolved:** frozen U9 directly joins `WRK_ELECT` to the selectable-gain TIA network; BOM LCSC C6961 identifies ST `TL072CDT`, and forge-truth plus complete TL072 SOIC-8 pinout/footprint parity pass.

<a id="opendrop-hv_controller_main-dac_output_stage_word"></a>
- **OpenDrop · `hv_controller_main` · `dac_output_stage_word`** — **Resolved:** frozen U15 on the MAX1771 VSENS path and Microchip DS11195C identify `MCP41050-I/SN`, the 50 kΩ 256-position SPI setpoint potentiometer in SOIC-8. All eight pins and footprint parity are mapped.

<a id="opendrop-hv_controller_main-adc_input_stage_word"></a>
- **OpenDrop · `hv_controller_main` · `adc_input_stage_word`** — Ratings and measured quantity unknown. Gap: **MPN**. The fully mapped `NAU7802SGI` is rejected because its bridge-sensor function is absent from OpenDrop's HV feedback path. Action: remove the foreign ADC template; trace and source actual HV monitoring.

<a id="opendrop-hv_controller_main-current_measurement_tia_word"></a>
- **OpenDrop · `hv_controller_main` · `current_measurement_tia_word`** — **Resolved to the actual function:** frozen U6 is the dual droplet-feedback amplifier, not a potentiostat TIA. Microchip `MCP6002-I/SN` is mapped with the complete SOIC-8 pinout and exact footprint; `OPA334AIDBVR` remains rejected for this role.

## wet_actuation_drive

<a id="pioreactor-wet_actuation-required_stir_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_stir_channel_word`** — **Reclassified as a functional requirement:** one motor channel remains mandatory, but no generic package can stand in for the ratings-closed driver, protection, and connector topology.

<a id="pioreactor-wet_actuation-required_pump_channel_word"></a>
- **Pioreactor · `wet_actuation` · `required_pump_channel_word`** — **Reclassified as a functional requirement:** one dosing-pump channel remains mandatory pending a source-backed switch, protection, connector, and current-path topology.

## board_to_board_and_cartridge_interconnect

<a id="colorimeter-optical_source-source_board_connector_word"></a>
- **Colorimeter · `optical_source` · `source_board_connector_word`** — **Resolved:** frozen J1/J2 identify LCSC C145956, which manufacturer data maps to BOOMELE `1.0T-4P`: 4 contacts, 1.00 mm pitch, right-angle SMD, 50 V, 1 A. Pins are GND/3V3/SDA/SCL; the frozen BOOMELE land pattern is vendored as `Forge_Manufacturer:BOOMELE_1.0T-4P` and passes electrical-pad parity. The assembly BOM must still freeze the mating cable.

<a id="opendrop-electrode_cartridge-required_electrode_channel_word"></a>
- **OpenDrop · `electrode_cartridge` · `required_electrode_channel_word`** — **Reclassified as passive geometry:** all 64 patterned electrode channels, routes, creepage, and mating contacts remain mandatory. The channel count is not one two-pin fitted component; exact connector/frame identities remain separate architecture work.

## Ordered next actions

1. **Derive ratings from board contracts** — especially NinjaPCR TEC/heater safety and OpenDrop HV/interconnect domains.
2. **Ingest manufacturer-backed candidates only after ratings close** — the remaining 16 identities all lack exact MPN evidence, not symbol/pinout evidence.
3. **Implement preserved function contracts** — replace Pioreactor channel requirements with complete switching/protection/connector topologies and prove all 64 OpenDrop electrode routes and mating contacts; these are not fitted-component residuals.
4. **Keep rejected candidates rejected** — do not promote generic LEDs, ferrites, debug headers, memory, or role-incompatible ADC/op-amp parts without exact ordering codes and target-role evidence.
5. **Regenerate the offline report** — done only by the terminal owner after source work. The acceptance target is 16 → 0 unresolved fitted identities; this document does not claim a terminal-owned chain rerun.
