-- =============================================
-- MIGRATION: Enhance AI Data Centre Pack Task Descriptions
-- =============================================
-- This migration updates 25 task descriptions across 5 AI Data Centre packs with:
-- - Clear action items
-- - Official resource links (verified February 2026)
-- - Key details (timeline/requirements/specifications)
-- All resources verified February 2026

-- =============================================
-- PACK 1: Infrastructure Planning (5 tasks)
-- Pack ID: 77777777-7777-7777-7777-000000000001
-- =============================================

-- Task 1.1: Define Capacity Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Calculate total compute requirements (GPU/TPU count, FLOPS targets)
- Estimate storage needs for training datasets, checkpoints, and model artifacts
- Determine power budget based on server density and growth projections
- Document cooling requirements using thermal design power (TDP) specifications
- Plan for 3-5 year capacity growth with modular expansion in mind

**Official resources:**
- [Uptime Institute Tier Classification](https://uptimeinstitute.com/tiers) - Industry-standard tier definitions for availability
- [NVIDIA DGX SuperPOD Design Guide](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/index.html) - Official GPU cluster planning
- [NVIDIA Infrastructure Planning](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/planning.html) - Resource constraint analysis

**Key details:**
- Core constraints: power, cooling, and space are interdependent
- DGX H100 systems require 10.2kW per node typical power draw
- Plan for InfiniBand cable length limits affecting rack distribution
- Include 20-30% headroom for peak loads and future growth

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000001'
AND title = 'Define Capacity Requirements';

-- Task 1.2: Evaluate Site Options
UPDATE public.pack_items
SET description = '**What to do:**
- Assess available utility power capacity and reliability history
- Evaluate network connectivity options (fiber routes, latency to users)
- Conduct risk assessment for natural disasters (flood, earthquake, fire zones)
- Review local regulations, permitting requirements, and incentives
- Compare total cost of ownership across candidate sites

**Official resources:**
- [Uptime Institute Tier Certification](https://uptimeinstitute.com/tier-certification) - Site certification standards
- [NVIDIA White Space Infrastructure](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/infrastructure.html) - Physical space requirements
- [DOE Data Center Design Best Practices](https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design_0.pdf) - Site selection criteria

**Key details:**
- Power density for AI: 30-100+ kW per rack vs traditional 5-15 kW
- Minimum dual utility feeds recommended for Tier III+
- Consider water availability for liquid cooling systems
- Latency to major cloud regions affects hybrid deployments

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000001'
AND title = 'Evaluate Site Options';

-- Task 1.3: Design Data Centre Architecture
UPDATE public.pack_items
SET description = '**What to do:**
- Create floor layout optimizing for hot/cold aisle containment or liquid cooling
- Design rack placement considering cable length constraints (InfiniBand: <30m recommended)
- Plan power distribution paths from utility to rack PDUs
- Establish cooling zones based on heat density requirements
- Design network topology with structured cabling pathways

**Official resources:**
- [NVIDIA DGX SuperPOD Data Center Design](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/index.html) - Complete design guide
- [NVIDIA White Space Infrastructure](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/infrastructure.html) - Rack and aisle specifications
- [Uptime Institute Tier Standards](https://uptimeinstitute.com/tiers) - Availability architecture requirements

**Key details:**
- EIA-310 standard racks: minimum 19" x 48" (600mm x 1200mm)
- NVIDIA recommends 32" x 48" (800mm x 1200mm) for cable management
- Racks must include side walls; no chimneys for proper airflow
- Plan adjacent space for planned expansion from initial deployment

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000001'
AND title = 'Design Data Centre Architecture';

-- Task 1.4: Plan Phased Buildout
UPDATE public.pack_items
SET description = '**What to do:**
- Define phases aligned with business growth and funding milestones
- Design modular power and cooling infrastructure for incremental deployment
- Plan network backbone capacity for full buildout from day one
- Create commissioning schedule with testing milestones per phase
- Document dependencies between phases and critical path items

**Official resources:**
- [NVIDIA DGX SuperPOD Planning](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/planning.html) - Phased deployment guidance
- [Schneider Electric Reference Designs](https://www.se.com/us/en/work/solutions/for-business/data-centers-and-networks/reference-designs/) - Modular data center configurations
- [Uptime Institute Publications](https://uptimeinstitute.com/publications/asset/tier-certification-overview-english) - Certification phase requirements

**Key details:**
- Phase 1 should be operational within 12-18 months of site selection
- Over-provision power distribution backbone for future phases
- Liquid cooling infrastructure harder to retrofit—plan early
- Each phase should be independently operational and certified

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000001'
AND title = 'Plan Phased Buildout';

-- Task 1.5: Develop Cost Model
UPDATE public.pack_items
SET description = '**What to do:**
- Build detailed CapEx model: land, construction, equipment, installation
- Create OpEx projections: power, cooling, maintenance, staffing
- Calculate Total Cost of Ownership (TCO) over 5-10 year horizon
- Model scenarios for different utilization rates and growth trajectories
- Include depreciation schedules and residual value assumptions

**Official resources:**
- [Lawrence Berkeley Lab TCO Model](https://datacenters.lbl.gov/resources/total-cost-ownership-tco-model-data) - Free TCO calculator for data centers
- [Schneider Electric AI Blueprint](https://www.se.com/ww/en/about-us/newsroom/news/press-releases/schneider-electric-issues-industry-first-blueprint-for-optimizing-data-centers-to-harness-the-power-of-artificial-intelligence-65029e39bbf2f67dbb03d3e3) - AI data center cost factors
- [SNIA TCO Whitepaper](https://snia.org/sites/default/files/SSSI/SNIA_TCO_Whitepaper_02-2021.pdf) - Storage TCO methodology

**Key details:**
- CapEx: land, construction, power infrastructure, cooling, IT equipment
- OpEx: electricity (40-60% of costs), maintenance, staffing, software
- Power costs dominate TCO—model electricity price scenarios
- Include one-time costs: permitting, design, commissioning, training

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000001'
AND title = 'Develop Cost Model';

-- =============================================
-- PACK 2: Cooling System Design (5 tasks)
-- Pack ID: 77777777-7777-7777-7777-000000000002
-- =============================================

-- Task 2.1: Calculate Heat Loads
UPDATE public.pack_items
SET description = '**What to do:**
- Calculate total heat dissipation from GPU/TPU specifications (TDP values)
- Map heat density by rack position and cooling zone
- Account for power conversion losses (UPS, PDU inefficiency adds 5-15% heat)
- Model peak vs. sustained thermal loads for different workload profiles
- Include future expansion heat loads in system sizing

**Official resources:**
- [ASHRAE TC 9.9 Thermal Guidelines](https://tpc.ashrae.org/CustomPages?idx=6f28c3c5-8aaa-4aa7-ad20-0f18f70273cf) - Data center environmental standards
- [ASHRAE Thermal Guidelines Reference Card](https://xp20.ashrae.org/datacom1_4th/ReferenceCard.pdf) - Quick reference for temperature/humidity ranges
- [NVIDIA DGX White Space](https://docs.nvidia.com/dgx-superpod/design-guides/dgx-superpod-data-center-design-h100/latest/infrastructure.html) - GPU heat specifications

**Key details:**
- NVIDIA H100: ~700W TDP per GPU, ~10.2kW per 8-GPU node
- ASHRAE recommended inlet: 18-27°C (64.4-80.6°F)
- ASHRAE recommended humidity: 8-60% RH
- Cooling accounts for 19% of data center outages—don''t undersize

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000002'
AND title = 'Calculate Heat Loads';

-- Task 2.2: Evaluate Cooling Technologies
UPDATE public.pack_items
SET description = '**What to do:**
- Compare air cooling limitations vs. liquid cooling capabilities
- Evaluate direct-to-chip liquid cooling for high-density GPU racks
- Assess immersion cooling for extreme density deployments
- Analyze hybrid approaches combining air and liquid cooling
- Consider water usage and availability for each technology

**Official resources:**
- [GRC Immersion Cooling 101](https://www.grcooling.com/immersion-cooling-101/) - Single-phase immersion fundamentals
- [CoolIT Direct Liquid Cooling](https://www.coolitsystems.com/technical-brief/) - Technical brief on DLC solutions
- [CoolIT 4000W Breakthrough](https://www.coolitsystems.com/resources/news/coolit-systems-4000w-breakthrough-redefining-single-phase-dlc-for-ultra-high-wattage-ai-processors/) - Next-gen AI chip cooling
- [GRC Future of Immersion Cooling](https://www.grcooling.com/wp-content/uploads/grc_future_of_immersion_cooling_white_paper.pdf) - Technology roadmap

**Key details:**
- Air cooling practical limit: ~15-20 kW per rack
- Direct liquid cooling: supports 50-100+ kW per rack
- Immersion cooling: 1200x better heat transfer than air
- CoolIT coldplates now handle 4000W+ chips (Blackwell, MI355X)

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000002'
AND title = 'Evaluate Cooling Technologies';

-- Task 2.3: Design Cooling Distribution
UPDATE public.pack_items
SET description = '**What to do:**
- Design coolant distribution unit (CDU) placement and capacity
- Plan piping routes with redundant paths and isolation valves
- Specify pump sizing for required flow rates and head pressure
- Design manifold systems for row-level or rack-level distribution
- Plan leak detection and containment systems

**Official resources:**
- [CoolIT Systems Solutions](https://www.coolitsystems.com/technical-brief/) - CDU and distribution design
- [GRC ICEraQ Systems](https://www.grcooling.com/) - Immersion cooling system design
- [ASHRAE TC 9.9](https://tpc.ashrae.org/CustomPages?idx=6f28c3c5-8aaa-4aa7-ad20-0f18f70273cf) - Liquid cooling environmental guidelines

**Key details:**
- Liquid loops typically use facility water or glycol mixtures
- Design for 1.2-1.5x peak load capacity
- Include quick-disconnect fittings for server maintenance
- Leak detection sensors at every connection point

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000002'
AND title = 'Design Cooling Distribution';

-- Task 2.4: Optimize for Efficiency
UPDATE public.pack_items
SET description = '**What to do:**
- Set PUE targets aligned with industry best practices (target <1.3)
- Design for free cooling using outside air or water economizers
- Optimize chiller staging and variable speed drives
- Implement containment (hot aisle/cold aisle) to reduce mixing losses
- Plan for heat recovery and reuse where feasible

**Official resources:**
- [Green Grid PUE Examination](https://www.thegreengrid.org/en/resources/library-and-tools/20-PUE%3A-A-Comprehensive-Examination-of-the-Metric) - PUE measurement methodology
- [DOE Data Center Best Practices](https://www.energy.gov/sites/default/files/2024-07/best-practice-guide-data-center-design_0.pdf) - Energy efficiency guide
- [Lawrence Berkeley Lab DC Pro Tools](https://datacenters.lbl.gov/tools) - PUE estimation and optimization tools
- [DC Pro Assessment Tool](https://dcprotool.lbl.gov/) - Self-assessment for efficiency

**Key details:**
- Industry average PUE: 1.58; hyperscale leaders: 1.1-1.2
- Liquid cooling enables PUE <1.2 more easily than air
- Every 0.1 PUE reduction = ~7% lower power costs
- Free cooling hours depend on climate zone selection

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000002'
AND title = 'Optimize for Efficiency';

-- Task 2.5: Plan Redundancy
UPDATE public.pack_items
SET description = '**What to do:**
- Define redundancy level based on availability requirements (N+1, 2N)
- Design redundant chiller and pump configurations
- Plan for concurrent maintenance without capacity reduction
- Implement automatic failover between cooling paths
- Test failover scenarios during commissioning

**Official resources:**
- [Uptime Institute Tier Standards](https://uptimeinstitute.com/tiers) - Redundancy requirements by tier
- [APC UPS Design Configurations](https://www.apc.com/us/en/support/resources-tools/white-papers/comparing-ups-system-design-configurations.jsp) - Redundancy models explained
- [Schneider Electric Design Guide](https://www.se.com/us/en/download/document/SPD_NRAN-5TDSPN_EN/) - High-density cooling redundancy

**Key details:**
- Tier III: N+1 redundancy, concurrently maintainable
- Tier IV: 2N redundancy, fault tolerant
- Cooling failure can cause thermal shutdown in seconds at high density
- Test failover annually and after any maintenance

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000002'
AND title = 'Plan Redundancy';

-- =============================================
-- PACK 3: Power Infrastructure (5 tasks)
-- Pack ID: 77777777-7777-7777-7777-000000000003
-- =============================================

-- Task 3.1: Size Power Capacity
UPDATE public.pack_items
SET description = '**What to do:**
- Calculate total IT load from server specifications plus growth
- Add cooling, lighting, and auxiliary loads to IT load
- Size utility feed capacity with 20-30% growth headroom
- Plan power distribution tiers from utility to rack
- Document demand diversity factors for realistic sizing

**Official resources:**
- [Schneider Electric Reference Designs](https://www.se.com/us/en/work/solutions/for-business/data-centers-and-networks/reference-designs/) - Power configurations from 88kW to 56MW
- [Vertiv UPS Sizing Guide](https://www.vertivupssystems.com/ups-sizing) - Calculating UPS capacity requirements
- [Schneider AI Data Center Blueprint](https://www.se.com/ww/en/about-us/newsroom/news/press-releases/schneider-electric-issues-industry-first-blueprint-for-optimizing-data-centers-to-harness-the-power-of-artificial-intelligence-65029e39bbf2f67dbb03d3e3) - AI workload power planning

**Key details:**
- AI data center power growing 26-36% annually through 2028
- Single-phase: VA = Volts × Amps
- Three-phase: VA = Volts × Amps × √3
- Include UPS efficiency losses (~12%) in upstream sizing

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000003'
AND title = 'Size Power Capacity';

-- Task 3.2: Design Power Distribution
UPDATE public.pack_items
SET description = '**What to do:**
- Design switchgear and transformer configuration
- Plan main distribution boards and sub-distribution paths
- Specify bus duct or cable routing from transformers to PDUs
- Design rack-level power distribution (PDUs, outlets)
- Implement power metering at each distribution tier

**Official resources:**
- [Schneider Rack Powering Options](https://www.se.com/us/en/download/document/SPD_NRAN-5TDSPN_EN/) - High-density rack power delivery
- [Schneider DC Architecture Guide](https://www.se.com/ww/en/download/document/SPD_WP47_EN/) - DC distribution design considerations
- [ABB Power Distribution Design](https://search.abb.com/library/Download.aspx?DocumentID=9AKK107680A2361) - 2N electrical distribution for data centers

**Key details:**
- High-density racks may require 3-phase power per rack
- Consider 415V or 480V distribution for efficiency
- Plan for future voltage upgrades as density increases
- Include surge protection at each distribution tier

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000003'
AND title = 'Design Power Distribution';

-- Task 3.3: Specify UPS Systems
UPDATE public.pack_items
SET description = '**What to do:**
- Select UPS topology: double-conversion, line-interactive, or rotary
- Size UPS capacity with redundancy requirements (N+1 or 2N)
- Choose battery technology: VRLA, lithium-ion, or flywheel
- Plan battery runtime for generator start and transfer
- Design maintenance bypass for concurrent servicing

**Official resources:**
- [Vertiv Data Center UPS Systems](https://www.vertiv.com/en-us/about/news-and-insights/articles/product-class-articles/data-center-ups-systems/) - UPS selection guide
- [Vertiv TechTalk UPS Sizing](https://www.vertiv.com/en-asia/about/news-and-insights/events/ups-sizing-101-the-guide-to-selecting-the-right-ups-capacity/) - Capacity planning webinar
- [APC UPS Design Configurations](https://www.apc.com/us/en/support/resources-tools/white-papers/comparing-ups-system-design-configurations.jsp) - N, N+1, 2N comparison
- [Schneider UPS Deployment Guide](https://blog.se.com/datacenter/2020/07/20/design-considerations-deployment-ups-systems-in-data-centers/) - Design best practices

**Key details:**
- N: single UPS, zero redundancy
- N+1 Parallel: multiple UPS on common bus
- N+1 Isolated: primary UPS with bypass secondary
- 2N: two independent UPS systems, highest availability
- Battery recharge can add 20% load—size input breakers accordingly

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000003'
AND title = 'Specify UPS Systems';

-- Task 3.4: Plan Generator Backup
UPDATE public.pack_items
SET description = '**What to do:**
- Size generator capacity for full facility load plus starting surge
- Plan fuel storage for minimum 24-48 hours runtime
- Design automatic transfer switch (ATS) configuration
- Specify generator paralleling for large deployments
- Plan maintenance and testing schedule

**Official resources:**
- [Vertiv Power Systems](https://www.vertiv.com/en-us/about/news-and-insights/articles/product-class-articles/data-center-ups-systems/) - Backup power integration
- [Uptime Institute Tier Standards](https://uptimeinstitute.com/tiers) - Generator requirements by tier
- [Schneider Reference Designs](https://www.se.com/us/en/work/solutions/for-business/data-centers-and-networks/reference-designs/) - Generator integration patterns

**Key details:**
- Tier III: N+1 generators with 12 hours fuel on-site
- Tier IV: 2N generators with 24+ hours fuel on-site
- Generator start and load transfer: 10-15 seconds typical
- UPS batteries must bridge until generator online
- Test under load monthly; full failover test annually

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000003'
AND title = 'Plan Generator Backup';

-- Task 3.5: Implement Power Monitoring
UPDATE public.pack_items
SET description = '**What to do:**
- Deploy DCIM software for centralized power visibility
- Install metering at utility, UPS, PDU, and rack levels
- Configure alerts for capacity thresholds and anomalies
- Create dashboards for real-time and historical analysis
- Implement PUE tracking and efficiency reporting

**Official resources:**
- [Raritan Power IQ](https://www.raritan.com/products/power/dcim-software/power-iq) - DCIM power monitoring solution
- [Server Technology Sentry Power Manager](https://www.servertech.com/products/sentry-power-manager) - PDU management platform
- [Device42 Power Management](https://device42.com/data-center-power-management) - Power chain visualization
- [Lawrence Berkeley Lab Metering Guide](https://datacenters.lbl.gov/resources/data-center-metering-and-resource-guide) - Metering best practices

**Key details:**
- Monitor power factor to identify inefficient loads
- Set alerts at 70%, 80%, 90% capacity thresholds
- Track PUE continuously, not just during audits
- Correlate power data with IT workloads for optimization

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000003'
AND title = 'Implement Power Monitoring';

-- =============================================
-- PACK 4: Network Architecture (5 tasks)
-- Pack ID: 77777777-7777-7777-7777-000000000004
-- =============================================

-- Task 4.1: Define Network Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Document bandwidth requirements for training data ingestion and model sync
- Define latency targets for GPU-to-GPU communication (microseconds for collective ops)
- Specify throughput needs for storage access patterns
- Plan external connectivity for user traffic and cloud integration
- Document security and segmentation requirements

**Official resources:**
- [NVIDIA Networking Topologies](https://docs.nvidia.com/ai-enterprise/reference-architecture/latest/networking.html) - AI network requirements
- [NVIDIA Networking for AI Era](https://developer.nvidia.com/blog/networking-for-data-centers-and-the-era-of-ai/) - Network design for AI workloads
- [Arista Design Guides](https://www.arista.com/en/solutions/design-guides) - Data center network planning

**Key details:**
- East-West traffic (GPU-GPU): requires high bandwidth, ultra-low latency
- North-South traffic (external): requires security, DPUs recommended
- InfiniBand: 400Gb/s per port, sub-microsecond latency
- Ethernet: 100-400Gb/s, higher latency but simpler operations

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000004'
AND title = 'Define Network Requirements';

-- Task 4.2: Design Data Network
UPDATE public.pack_items
SET description = '**What to do:**
- Design spine-leaf topology for predictable latency and scalability
- Select switch platforms based on port density and throughput
- Plan for BGP or OSPF underlay with optional EVPN-VXLAN overlay
- Design for non-blocking fabric with appropriate oversubscription ratios
- Plan cabling infrastructure with structured pathways

**Official resources:**
- [Arista Leaf & Spine](https://www.arista.com/en/products/leaf-spine) - Spine-leaf switch products
- [Arista L3 Leaf-Spine Fabric](https://www.arista.io/help/articles/cHJvdmlzaW9uaW5nLnN0dWRpb3MuQWxsLmJ1aWx0SW4ubDNscw==) - L3LS deployment guide
- [Arista AI Network Fabric Guide](https://www.arista.com/assets/data/pdf/AI-Network-Fabric_Deployment_Guide.pdf) - AI-optimized network design
- [Arista Design and Deployment Guides](https://www.arista.com/en/solutions/design-guides) - Complete design documentation

**Key details:**
- Spine-leaf provides consistent hop count and latency
- Support for up to 5-stage Clos topology for large deployments
- R-Series: routing/IP storage; X-Series: scale-out data centers
- All Arista switches run EOS with EVPN, SR, VXLAN support

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000004'
AND title = 'Design Data Network';

-- Task 4.3: Design GPU Interconnect
UPDATE public.pack_items
SET description = '**What to do:**
- Select interconnect technology: InfiniBand for training, Ethernet for inference
- Design NVLink topology for intra-node GPU communication
- Plan InfiniBand fabric for multi-node GPU clusters
- Specify switch configuration for collective operations (SHARP)
- Design for rack-scale and multi-rack GPU domains

**Official resources:**
- [NVIDIA NVLink & NVLink Switch](https://www.nvidia.com/en-us/data-center/nvlink/) - GPU interconnect specifications
- [NVIDIA Multi-Node NVLink](https://docs.nvidia.com/multi-node-nvlink-systems/index.html) - Multi-node GPU connectivity
- [NVIDIA InfiniBand Cluster Guide](https://docs.nvidia.com/networking/display/ibclusteropmainguide) - InfiniBand operations
- [NVIDIA InfiniBand Datasheet](https://resources.nvidia.com/en-us-data-center-overview/infiniband-datasheet-networking-quantum-2) - Quantum-2 specifications

**Key details:**
- NVLink 6th gen: 3.6 TB/s per GPU, 14x faster than PCIe Gen6
- NVL72: 72 GPUs in all-to-all topology, 260 TB/s total bandwidth
- InfiniBand: SHARP for collective operations acceleration
- UFM (Unified Fabric Manager) for InfiniBand monitoring and automation

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000004'
AND title = 'Design GPU Interconnect';

-- Task 4.4: Plan Storage Network
UPDATE public.pack_items
SET description = '**What to do:**
- Design high-bandwidth storage fabric for training data access
- Plan for parallel file system connectivity (GPFS, Lustre, or unified)
- Specify network capacity for checkpoint writes and model artifacts
- Design storage tiering strategy for hot/warm/cold data
- Plan for data movement between storage tiers

**Official resources:**
- [VAST Data DASE Architecture](https://www.vastdata.com/platform/how-it-works) - Disaggregated shared-everything storage
- [VAST Data Platform Overview](https://vastdata.com/platform/supported-platforms) - Hardware-agnostic storage
- [VAST AI Reference Architecture](https://assets.ctfassets.net/2f3meiv6rg5s/3zcJ35iXQ7ATkVUpJdj9Us/e66943a0e3011bec4124a79683598102/vast-data-ai-reference-architecture.pdf) - AI storage design guide
- [Juniper VAST Configuration](https://juniper.net/documentation/us/en/software/jvd/jvd-ai-dc-apstra-amd/vast_storage_configuration.html) - Network integration guide

**Key details:**
- VAST DASE: scale capacity and compute independently
- All-flash eliminates tiering complexity for AI workloads
- Checkpoint writes can saturate network—design for burst capacity
- Single storage tier simplifies data management for AI pipelines

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000004'
AND title = 'Plan Storage Network';

-- Task 4.5: Implement Network Monitoring
UPDATE public.pack_items
SET description = '**What to do:**
- Deploy fabric-wide monitoring for switch health and port utilization
- Implement flow telemetry for traffic analysis and optimization
- Configure alerts for link failures, congestion, and errors
- Create dashboards for network performance visibility
- Set up InfiniBand-specific monitoring with UFM

**Official resources:**
- [NVIDIA UFM Guide](https://docs.nvidia.com/networking/display/ibclusteropmainguide) - InfiniBand fabric monitoring
- [Arista CloudVision](https://www.arista.io/help/articles/cHJvdmlzaW9uaW5nLnN0dWRpb3MuQWxsLmJ1aWx0SW4ubDNscw==) - Network observability platform
- [NVIDIA Networking Operations](https://docs.nvidia.com/networking/display/ibclusteropmainguide) - Automation and maintenance procedures

**Key details:**
- UFM provides InfiniBand-specific alerts and diagnostics
- Monitor for congestion that impacts training job performance
- Track packet errors and retransmissions as early warning signs
- Correlate network metrics with job completion times

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000004'
AND title = 'Implement Network Monitoring';

-- =============================================
-- PACK 5: Security & Compliance (5 tasks)
-- Pack ID: 77777777-7777-7777-7777-000000000005
-- =============================================

-- Task 5.1: Assess Security Requirements
UPDATE public.pack_items
SET description = '**What to do:**
- Identify applicable regulations (GDPR, HIPAA, SOX, industry-specific)
- Document customer contractual security requirements
- Assess data classification and protection needs
- Define threat model and risk tolerance
- Establish security baseline aligned with recognized frameworks

**Official resources:**
- [NIST Risk Management Framework](https://csrc.nist.gov/publications/detail/sp/800-37/rev-2/final) - SP 800-37 Rev. 2 security lifecycle
- [NIST Cybersecurity Framework 2.0](https://csrc.nist.gov/pubs/cswp/29/the-nist-cybersecurity-framework-csf-20/final) - High-level security outcomes
- [NIST Security Controls](https://csrc.nist.gov/pubs/sp/800/53/r5/final) - SP 800-53 Rev. 5 control catalog
- [ISO 27001:2022](https://www.iso.org/standard/27001) - Information security management standard

**Key details:**
- NIST RMF: categorize, select, implement, assess, authorize, monitor
- ISO 27001:2022 transition deadline: October 31, 2025
- Map requirements to specific controls for traceability
- Include AI-specific considerations (model security, data poisoning)

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000005'
AND title = 'Assess Security Requirements';

-- Task 5.2: Design Physical Security
UPDATE public.pack_items
SET description = '**What to do:**
- Design perimeter security: fencing, barriers, lighting, signage
- Plan access control zones with increasing restriction levels
- Specify CCTV coverage for all entry points and sensitive areas
- Design visitor management and escort procedures
- Plan security operations center (SOC) integration

**Official resources:**
- [CISA Facility Access Control](https://www.cisa.gov/sites/default/files/Facility%20Access%20Control%20-%20An%20Interagency%20Security%20Committee%20Best%20Practice.pdf) - Federal best practices guide
- [Alliance Canada Physical Security Standard](https://alliancecan.ca/en/document/1324) - Data center physical security requirements
- [ISA Physical Security Guide](https://www.isa.org/intech-home/2020/march-april/departments/physical-security-of-a-data-center) - Industrial security considerations
- [NIST Physical Security Handbook](https://csrc.nist.rip/publications/nistpubs/800-12/800-12-html/chapter15.html) - SP 800-12 Chapter 15

**Key details:**
- Walls must extend floor-to-ceiling, solid construction
- Doors: fail-safe emergency exit, security-grade hardware
- Windows: high-grade security film, blinds to block sightlines
- All racks locked unless single-tenant facility

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000005'
AND title = 'Design Physical Security';

-- Task 5.3: Implement Access Control
UPDATE public.pack_items
SET description = '**What to do:**
- Deploy identity management system with role-based access control
- Implement multi-factor authentication for all privileged access
- Configure access logging and audit trails
- Establish access review and recertification procedures
- Integrate physical and logical access control systems

**Official resources:**
- [NIST SP 800-53 Access Control](https://csrc.nist.gov/pubs/sp/800/53/r5/final) - AC family controls
- [ISO 27001 Access Control](https://www.iso.org/standard/27001) - Annex A.9 requirements
- [CISA Access Control Best Practices](https://www.cisa.gov/sites/default/files/Facility%20Access%20Control%20-%20An%20Interagency%20Security%20Committee%20Best%20Practice.pdf) - Identity verification procedures

**Key details:**
- Principle of least privilege: minimum access for job function
- Privileged access requires MFA and session recording
- Access reviews: quarterly for privileged, annual for standard
- Immediate revocation process for terminated employees

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000005'
AND title = 'Implement Access Control';

-- Task 5.4: Establish Data Protection
UPDATE public.pack_items
SET description = '**What to do:**
- Implement encryption at rest for all storage systems (AES-256)
- Deploy encryption in transit for all network communications (TLS 1.3)
- Establish key management procedures and key rotation schedules
- Plan data backup encryption and secure offsite storage
- Implement data loss prevention (DLP) controls

**Official resources:**
- [NIST SP 800-53 Cryptography](https://csrc.nist.gov/pubs/sp/800/53/r5/final) - SC family controls
- [ISO 27001 Cryptography](https://isms.online/iso-27001/annex-a-2022/8-24-use-of-cryptography-2022) - Annex A.8.24 guidance
- [ISO 27001:2022 Standard](https://www.iso.org/standard/27001) - Information security requirements

**Key details:**
- AES-256 for data at rest; TLS 1.3 minimum for data in transit
- Hardware security modules (HSMs) for key protection
- Key rotation: annually minimum, immediately on compromise
- Secure deletion procedures for decommissioned media

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000005'
AND title = 'Establish Data Protection';

-- Task 5.5: Prepare for Audits
UPDATE public.pack_items
SET description = '**What to do:**
- Document control implementations with evidence mapping
- Establish continuous compliance monitoring procedures
- Prepare for SOC 2 Type 2 audit (3-12 month observation period)
- Plan ISO 27001 certification timeline and scope
- Create audit response team and procedures

**Official resources:**
- [SOC 2 Requirements Guide](https://secureframe.com/hub/soc-2/requirements) - Five Trust Services Criteria explained
- [SOC 2 Type 2 Compliance Checklist](https://secureframe.com/compliance-resources/soc-2-type-ii-compliance-checklist) - Audit preparation checklist
- [SOC 2 Type 2 Overview](https://secureframe.com/blog/soc-2-type-ii) - Type 1 vs Type 2 comparison
- [Data Center Knowledge ISO 27001](https://www.datacenterknowledge.com/compliance/iso-27001-compliance-what-data-center-operators-and-customers-need-to-know) - ISO compliance guide

**Key details:**
- SOC 2 Type 2: 3-12 month audit period evaluating operational effectiveness
- Five Trust Services Criteria: Security, Availability, Processing Integrity, Confidentiality, Privacy
- ISO 27001: requires ISMS implementation before certification audit
- Maintain evidence repository for continuous audit readiness

---
Verified: February 2026'
WHERE pack_id = '77777777-7777-7777-7777-000000000005'
AND title = 'Prepare for Audits';

-- =============================================
-- VERIFICATION
-- =============================================
-- Verify updates were applied
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM public.pack_items
    WHERE pack_id IN (
        '77777777-7777-7777-7777-000000000001',
        '77777777-7777-7777-7777-000000000002',
        '77777777-7777-7777-7777-000000000003',
        '77777777-7777-7777-7777-000000000004',
        '77777777-7777-7777-7777-000000000005'
    )
    AND description LIKE '%**What to do:**%'
    AND description LIKE '%**Official resources:**%'
    AND description LIKE '%Verified: February 2026%';
    
    RAISE NOTICE 'Updated % AI Data Centre task descriptions with enhanced format', updated_count;
END $$;
