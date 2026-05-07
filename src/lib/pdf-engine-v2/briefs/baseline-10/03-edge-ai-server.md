# Edge AI Inference Server Brief

We are designing a 1U rack-mount edge inference appliance for on-premises computer-vision and language-model workloads in UK light-industrial, retail-estate and telecoms-edge sites. Shipped with our reference inference stack pre-installed; customer deploys models via a web console or REST API.

Target market: UK and EU mid-market enterprises (100-5,000 employees) deploying edge AI for quality control on factory lines, real-time footfall analytics in retail, and low-latency language-model serving in telco base-stations. Competitors include NVIDIA IGX Orin, Dell PowerEdge XE7100, and Supermicro mini-edge systems.

Key constraints:
- Unit cost ceiling: £4,500 ex-works per 1U chassis
- Compute target: 2 TOPS INT8 sustained at 75 W total system draw
- External envelope: 438 × 450 × 43.5 mm (standard 1U rack)
- Peak power draw: ≤ 200 W at 90 % load; idle draw: ≤ 45 W
- Noise level: ≤ 50 dBA at 1 m in an office environment at 25 °C ambient
- Operating temperature 0 to 35 °C, short-duration non-condensing 0 to 40 °C
- Cooling budget: forced-air through front-rear flow, no liquid cooling
- Inference latency: < 20 ms per 1024-token language-model request; < 5 ms per 640 × 480 vision request
- Annual production volume: 1,500 units per year

Safety and regulatory:
- CE + UKCA marking, EMC Directive 2014/30/EU
- EN 62368-1 audio / video information and communication technology equipment safety
- Radio Equipment Directive 2014/53/EU for any Wi-Fi / Bluetooth
- RoHS 2 Directive 2011/65/EU
- WEEE Directive 2012/19/EU producer registration
- GDPR compliance for any personal-data processing in the appliance (architectural, not certified)
- Energy-efficiency labelling Regulation (EU) 2019/424 for enterprise servers

Sub-modules expected: custom inference accelerator PCIe card, x86 compute module, DDR5 ECC memory, NVMe boot drive + NVMe cache drive, 1U chassis with hot-swap fan tray, redundant PSU or single platinum-rated PSU, front-panel status LEDs + LCD, thermal management (heat sinks, heat pipes, blower fans), rear I/O panel (2 × 10GBASE-T + 2 × 2.5GBASE-T + 4 × USB + BMC IPMI), power distribution board.
