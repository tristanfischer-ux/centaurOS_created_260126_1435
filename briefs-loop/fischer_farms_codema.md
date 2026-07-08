# Water, Fertigation and Irrigation Plant — Fischer Farms Polytunnel Cultivation Facility (Codema SO21101551)

We are designing and specifying a complete **water-handling, purification, fertigation and pressurised irrigation plant** that supplies a large multi-zone polytunnel cultivation facility (Fischer Farms). The deliverable is the WATER SYSTEM ONLY — the purification train (reverse osmosis), the bulk water storage reservoirs, the per-zone nutrient-dosing (fertigation) pump units, the pressurised irrigation distribution to the multi-tier roller-bench grow racking, the drain-water recovery and recirculation network, a hand-watering ring main, and the irrigation/fertigation process-control computer. This is a process and fluid-handling plant: pumps, pipes, reservoirs, reverse osmosis, filtration, oxygen dosing, valves and nutrient dosing. The grow-lighting, the climate/heating-ventilation/cooling hardware, the roller-bench rack framework and the polytunnel buildings are supplied by others and are explicitly out of scope. This is modelled on the real Codema Systems Group turnkey offer SO21101551 ("Fischer Farms"), totalling approximately €1,100,000.

Target market: indoor, vertical and polytunnel farming operators and controlled-environment-agriculture growers across the United Kingdom and Europe who need a turnkey water-treatment, fertigation and recirculating-irrigation plant for a multi-zone growing facility.

System description (the delivered subsystems):

A. WATER PURIFICATION (make-up only) — treats incoming city mains water to feed quality; sized to make up the loop LOSSES, not the full circulation (the bulk of the irrigation water is recovered and recirculated).
- City-water supply: approximately 11 cubic metres per hour, DN63/75 polyvinyl-chloride line to the reverse-osmosis unit.
- Reverse-osmosis unit: stainless-steel frame with inlet section, pre-filter set, frequency-controlled high-pressure pump, permeate flushing line, first-water flush and a programmable-logic-controller panel; 8.5 kilowatts, 3 by 400 volt plus neutral 50 hertz; recovery about 75 percent; permeate to the cleanwater reservoir.
- Particle filter and granular-activated-carbon filter in the inlet line; water softener duplex (two glass-fibre-reinforced-plastic tanks, food-quality strong-acid cation resin, automatic brine regeneration) for the make-up stream.

B. WATER STORAGE (shared central buffer that decouples RO make-up from peak pumping) — galvanised Class-A reservoirs with anti-algae liner on concrete tiles.
- One cleanwater reservoir, 5.46 metres diameter by 3.88 metres high, approximately 91 cubic metres.
- Two drain-water reservoirs, 5.46 metres diameter by 3.88 metres high, approximately 91 cubic metres each (one per main polytunnel group).
- One nursery drain-water reservoir, 3.64 metres diameter by 3.88 metres high, approximately 40 cubic metres.
- Level monitoring: a level processor with one pressure sensor per reservoir.

C. FERTIGATION PUMP UNITS — THREE independent parallel pump units, each drawing from the shared reservoirs and serving its own cultivation zone, each with its own on-board nutrient dosing and an N+1 standby (backup) pump for resilience:
- Pump Unit 1 — 90 cubic metres per hour at approximately 2.9 bar (2 by 40-200/5.5 pumps, one duty + one standby), serving polytunnel group 4-10.
- Pump Unit 2 — 90 cubic metres per hour at approximately 2.9 bar (2 by 40-200/5.5 pumps, one duty + one standby), serving polytunnel group 11-17.
- Nursery Pump Unit — 45 cubic metres per hour at approximately 2.9 bar (40-200/5.5, duty + standby), serving the nursery (polytunnels 1, 2, 3, 18, 19, 20).
Each pump unit carries its own point-of-use dosing at the branch: an A/B fertiliser dosing set (A and B nutrient venturi injection with flowmeters and membrane control valves), one acid dosing pump with a 100-litre acid barrel, and one hydrogen-peroxide (disinfection) dosing pump with a 100-litre peroxide barrel, plus an electrical-conductivity / pH measuring shunt on the discharge. Nutrient stock: per-unit fertiliser tanks (A/B) — 100-litre tanks on the main pump units and 600-litre tanks on the nursery unit — with mixers and suction sets. Each unit has a pump switch panel (main switch, softstarter, thermal protection, control/alarm relays, frequency controller); softstarters, drain-pit pumps and cloth-filter units sit inside the pump-unit electrical panels.

D. PRESSURISED IRRIGATION + DRAIN-RECOVERY NETWORK (recirculating, per zone) — the distribution and recovery loop for the multi-tier roller-bench grow racking.
- Grow interface: multi-tier roller-bench racking, 7 growing tiers per bench (approximately 5,100-millimetre frame, 750-millimetre tier pitch), containers/trays at approximately 1,290-millimetre centres. Each tier is fed by a PRESSURE pipe (irrigation supply) and drained by a DRAIN pipe (gravity return), both connecting to the main lines in the tunnel corridor. Approximately 6,000 growing trays across the three zones.
- Supply mains: a pressurised DN polyvinyl-chloride main line from each pump unit to its zone, branching to per-tunnel risers and the per-tier pressure pipes.
- Drain lines: per-tier gravity drain pipes collect to per-tunnel drain risers, to a floor drain line, to a DN160 main drain per zone running BELOW GRADE to that zone's drain pit.
- Drain-water pit (recovery): one 5,000-litre concrete drain pit PER zone (three total — polytunnel 4-10, polytunnel 11-17, nursery), installed UNDERGROUND, each with a submersible pump discharging to that zone's recovery filter.
- Recovery filtration + reconditioning: a paperbelt/cloth filter per zone on a high-density-polyethylene tank, plus oxygen dosing, returning the filtered, re-oxygenated drain water to the drain-water reservoir for reuse — so the RO only makes up losses.

E. HAND-WATERING INSTALLATION — a frequency-controlled hand-watering pump unit, 25 cubic metres per hour at approximately 3.3 bar (40/160-40, 4.0 kilowatts), feeding a DN polyvinyl-chloride hand-watering ring main with hand valves and quick connectors: 4 connections in the irrigation room, approximately 25 connections in the tunnel corridors, plus fertiliser-tank fill points.

F. PROCESS-CONTROL COMPUTER — a horticultural irrigation/fertigation process computer managing per-zone irrigation scheduling, closed-loop electrical-conductivity and pH correction on each of the three pump units, reservoir level and flow monitoring, oxygen-dosing control, and safety/fault alarms. Hardware: the process computer in a cabinet, monitors, an uninterruptible power supply, distributed datapoint input/output casings, per-unit pulse/litre counters, inductive electrical-conductivity sensors and transmitters, pH sensors and transmitters. Control-bus and multi-core signal cable runs throughout.

Key constraints (the brief's target metrics):
- Cultivation zones: THREE parallel irrigation zones — polytunnel group 4-10, polytunnel group 11-17, and the nursery — each served by its own fertigation pump unit drawing from the shared reservoirs.
- Fertigation pump units: THREE — two at approximately 90 cubic metres per hour and one at approximately 45 cubic metres per hour (2×90 + 1×45), each at approximately 2.9 bar, each with an N+1 standby pump and its own A/B fertiliser + acid + hydrogen-peroxide dosing.
- Peak circulation demand: approximately 225 cubic metres per hour total across the three pump units (90 + 90 + 45).
- Reverse-osmosis MAKE-UP capacity: sized to loop losses, on the order of 8 to 11 cubic metres per hour of city-water make-up — NOT the full 225 cubic metres per hour of circulation (the water is recovered and recirculated).
- Water-storage capacity: a shared cleanwater reservoir (~91 cubic metres) plus two drain-water reservoirs (~91 cubic metres each) and a nursery drain-water reservoir (~40 cubic metres).
- Drain recovery: one underground 5,000-litre drain pit per zone (three), each with recovery pumping, cloth/paperbelt filtration and oxygen dosing back to the drain-water reservoirs — a recirculating loop.
- Hand watering: approximately 25 cubic metres per hour at approximately 3.3 bar.
- Grow interface: multi-tier roller-bench racking, 7 tiers, with a paired pressure (supply) and drain (return) pipe at every tier.
- Pipework: thermoplastic (polyvinyl-chloride) pressure pipework for supply; gravity drain pipework (routed below grade to the underground drain pits) for return.
- Underground civil works: the three 5,000-litre concrete drain pits and the below-grade main drain runs are underground — a material civils/groundworks scope (excavation, concrete surround, drainage).
- Electrical supply: 400 volt, three-phase, 50 hertz; connected load of the order of low hundreds of kilowatts (pump units with softstarters, RO, dosing, controls — NOT megawatts). State the connected and average electrical load with a proper LV distribution hierarchy (incomer → main board → per-unit MCC/feeders → loads).
- Design life: 20 years.
- Annual production volume: 6 units per year.
- Unit cost ceiling: approximately £950,000 to £1,050,000 installed (approximately €1,100,000).
- Primary objective: balanced — the lowest installed cost that meets the per-zone irrigation throughput, the water-purity, the recirculation-recovery and the layout targets.

Cost and calibration context (the real Codema SO21101551 offer — the ground truth the engine must reproduce), approximately €1,100,000 total (~£1,000,000):
- Water purification (RO make-up train): a modest share — sized to make-up losses, not full flow.
- Water storage (reservoirs): the large galvanised reservoirs.
- Fertigation pump units: three parallel units with duty+standby pumps and per-unit A/B + acid + peroxide dosing.
- Irrigation + drain-recovery network: the dominant cost — the long pressurised supply mains, the per-tier pressure+drain pipework to the roller-bench racking, the per-zone risers and the below-grade drain network to the underground drain pits, plus installation labour and the underground civils.
- Hand watering: the ring main and risers.
- Process-control computer: the horticultural process computer, instrumentation and control cabling.
- The irrigation + drain-recovery network is the largest share, so the bill of materials and cost build-up must capture the long pipe runs (supply and drain), the per-tier pipework, the risers, the below-grade drain network, the three underground drain pits and the associated civils — not just the major equipment.

Safety and regulatory:
- Pressure Systems Safety Regulations for the pressurised sections and the reverse-osmosis high-pressure section.
- Control of Substances Hazardous to Health assessment for the acid and hydrogen-peroxide dosing chemicals (corrosive/oxidiser; segregated bunded storage, eyewash and personal protective equipment).
- Water Supply (Water Fittings) Regulations and backflow prevention on the mains connection (Fluid Category protection).
- Machinery Directive, Low Voltage Directive and Electromagnetic Compatibility Directive for the equipment.
- Legionella / water-hygiene control on the stored and recirculated water; oxygen dosing on the recovered water.
- UKCA marking.

Explicitly EXCLUDED (out of scope — supplied by others):
- the grow-lighting / assimilation lighting and its switchboards;
- the climate / heating, ventilation and cooling hardware and the climate-control computer (there is NO HVAC in this water-plant scope);
- the roller-bench cultivation rack framework itself (but the pressure + drain pipework to it IS in scope);
- the polytunnel buildings.

Sub-modules expected: city-water intake and backflow protection, water softening, granular-activated-carbon filtration, particle filtration, reverse-osmosis make-up purification, shared cleanwater and drain-water reservoir storage with level monitoring, THREE parallel fertigation pump units each with a duty+standby pump and per-unit A/B nutrient dosing + acid + hydrogen-peroxide dosing and electrical-conductivity/pH correction, per-unit nutrient stock-tank storage and mixing, pressurised per-zone irrigation mains/risers and per-tier pressure pipes to the roller-bench racking, per-tier gravity drain collection routed below grade, three underground 5,000-litre drain pits with recovery pumping, per-zone cloth/paperbelt drain filtration with oxygen dosing and return to the reservoirs (recirculating loop), hand-watering ring main, irrigation/fertigation process-control and instrumentation, and the control cabling.
