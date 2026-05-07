# Wearable Continuous Glucose Monitor Brief

We are developing a flash continuous glucose monitor (CGM) patch for people with Type 2 diabetes and insulin-resistance management. The sensor is a single-use 14-day disposable patch with a Bluetooth Low Energy bridge that pairs to the user's phone.

Target market: UK and EU Type 2 diabetics (~4.3 million UK cases) moving off finger-prick testing, and metabolic-health self-users seeking continuous glucose data without a prescription. Sold direct-to-consumer on subscription; first launch with private-clinic partners before NHS discussion.

Key constraints:
- Unit cost ceiling: £18 ex-works per 14-day disposable sensor + £55 per reusable Bluetooth bridge (ex-works)
- Sensor skin-contact mass: ≤ 5 g including adhesive
- Sensor envelope: 35 × 30 × 5 mm footprint, patch profile ≤ 7 mm above skin
- Continuous sampling at 1 Hz, 14 days of life on a single primary cell
- Glucose range 2.2–22.2 mmol/L with MARD ≤ 9.0 % vs YSI laboratory reference
- Operating temperature 5 to 45 °C on-skin, storage -20 to +30 °C
- Radio range ≥ 6 m on-body to phone in a trouser pocket
- Annual production volume: 2,000,000 sensors + 150,000 bridges per year

Safety and regulatory:
- Medical Device Regulation (EU) 2017/745 (MDR), Class IIb, Rule 11
- UK Medical Devices Regulations 2002 as amended for UKCA marking
- ISO 13485 quality management system
- IEC 60601-1 for the Bluetooth bridge
- ISO 15197 performance requirements for in vitro blood glucose monitoring systems
- ISO 10993-1 biological evaluation and biocompatibility of skin-contact materials
- UKCA + CE marking, MHRA registration, EU Notified Body assessment

Sub-modules expected: enzyme-coated microneedle sensor, single-cell potentiostat ASIC, primary lithium manganese dioxide cell, flexible polyimide PCB, medical-grade acrylate skin adhesive, water-resistant overmoulded housing, Bluetooth Low Energy radio module, Bluetooth bridge housing + display, packaging (sterile blister + carton).
