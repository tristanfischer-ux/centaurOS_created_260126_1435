# Benchtop Battery Cell Cycler Brief

We are designing a compact benchtop instrument that charges and discharges individual lithium cells under controlled temperature and records their capacity, impedance and ageing behaviour over hundreds of cycles. Eight independent channels each source and sink current against a single cell, holding voltage or current to laboratory accuracy while a Peltier-controlled cell bay holds the cells at a set temperature. The instrument sits on a bench, runs from a standard mains socket, and logs every channel to a host computer over USB-C or Ethernet.

Target market: battery material and cell developers, university electrochemistry and energy-storage groups, and product teams qualifying cells for a specific duty. It is the small end of the same problem our containerised storage work addresses: before anyone builds a megawatt-hour of storage, somebody has to prove the cell.

System description:
- Eight independent test channels, each able to source and sink current against one cell under constant-current, constant-voltage or constant-power control
- A removable cell bay carrying eight cell holders, temperature-controlled by a Peltier module against a finned heatsink and fan
- A precision analogue front end per channel: four-wire (Kelvin) sense on voltage, shunt-based current measurement, and per-channel temperature via a thermistor at the cell
- A control board carrying the microcontroller, the touch display and the host interfaces, running the schedule state machine and the safety interlocks
- A linear-assisted power stage that dissipates discharge energy as heat through the instrument's own heatsink, with no energy returned to the mains
- An internal mains power supply, fused and earthed, feeding the analogue and digital rails separately
- Safety interlocks that open the channel on over-voltage, under-voltage, over-current, over-temperature or reverse-polarity insertion, independently of the control firmware

Key constraints:
- Channels: 8, independent and simultaneously active
- Voltage range: 0 V to 5 V per channel, four-wire sense
- Current range: plus or minus 5 A per channel, charge and discharge
- Voltage measurement accuracy: within 0.05% of full scale
- Current measurement accuracy: within 0.1% of full scale
- Cell bay temperature control: 15 °C to 45 °C, held within 0.5 °C of setpoint
- Maximum simultaneous dissipation: 200 W across all eight channels
- Data logging: 10 samples per second per channel minimum, to USB-C and Ethernet
- Enclosure: desktop instrument, no dimension greater than 450 mm, bench-stable
- Mains input: 230 V AC, 50 Hz, single phase, IEC C14 inlet with fuse and earth
- Cost: honest prototype bill of materials within £1,400–£2,000 using catalogue laboratory and electronics parts
- Operating environment: indoor laboratory, ambient 15 °C to 30 °C
- Design life: 10 years, at least 20,000 channel-hours
- Annual production volume: 200 units per year
- Primary objective: measurement accuracy first, then thermal stability, then cost

Safety and regulatory:
- UKCA and CE marking
- BS EN 61010-1 for the safety of electrical equipment for measurement, control and laboratory use
- BS EN 61326-1 for electromagnetic compatibility of laboratory equipment
- Low Voltage Directive and Electromagnetic Compatibility Directive
- BS EN 62368-1 for the internal mains power supply
- Lithium cell handling: enclosure must contain a single-cell thermal event within the cell bay and vent it away from the operator
- RoHS and WEEE

Sub-modules expected: the eight-channel analogue power stage and its heatsinking, the precision sense and analogue-to-digital front end, the control and human-machine-interface board with the touch display, the temperature-controlled cell bay with Peltier module and fan, the internal mains power supply and distribution, the safety interlock and protection circuits, the host data interfaces, the wiring loom between boards and bay, and the desktop enclosure with its ventilation and operator-facing panel.
