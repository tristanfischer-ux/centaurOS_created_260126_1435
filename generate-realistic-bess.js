/* eslint-disable */
const fs = require('fs');

const code = `import fs from 'fs';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ProjectPDFDocument } from './src/lib/pdf-v3/renderer/document';
import { hydrateAndCoerce } from './src/lib/pdf-v3/pipeline/01-hydration';
import { sanitizeText } from './src/lib/pdf-v3/pipeline/02-sanitization';
import { formatAndEnrich, assembleDocumentMeta } from './src/lib/pdf-v3/pipeline/03-enrichment';
import { extractAlerts } from './src/lib/pdf-v3/pipeline/04-business-rules';
import { PdfRenderData } from './src/lib/pdf-v3/types/render-contracts';

async function generateTestPdf() {
  console.log('Generating realistic 80+ page BESS Storage System mock data...');
  
  const raw = {
    project: { 
      name: 'BESS — 40ft 3.5 MWh containerised', 
      revision: 'Rev A', 
      shipped: false,
      foundryName: 'Fractional Forge'
    },
    meta: {
      generatedAtIso: new Date().toISOString(),
      createdAtIso: '2026-04-25T04:42:00Z',
      designRevisionLetter: 'A',
      shippedAtIso: null,
      briefLockedAtIso: '2026-04-25T17:30:00Z',
      systemIllustrationUrl: null, // Removed body lotion image
      interiorOverviewUrl: null
    },
    verdict: { 
      status: 'AMBER', 
      summary: '1 warning — see Feasibility Exception page below.',
      fails: [
        { axis: 'cost', severity: 'warning', summary: 'Estimated unit cost exceeds brief ceiling.', evidence: 'Estimated cost vs £180,000 ceiling.' }
      ],
      checkedConstraints: ['envelope', 'mass', 'cost', 'transport']
    },
    dimensionSheet: {
      feasible: true,
      floor_budget_m2: 28.5,
      total_used_m2: 22.1,
      envelope: {
        kind: 'container',
        length_mm: 12192,
        width_mm: 2438,
        height_mm: 2896
      },
      notes: "Sizing is feasible for 3.5MWh in a 40ft ISO container. The battery racks fit comfortably along the side walls.",
      components: [
        { module_id: "port-side-battery", width_mm: 600, depth_mm: 1200, floor_m2: 0.72, count: 5 },
        { module_id: "starboard-side-battery", width_mm: 600, depth_mm: 1200, floor_m2: 0.72, count: 5 }
      ]
    },
    spatialPlanImageDataUri: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjI0MCI+PHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMjQwIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNjZWQ0ZGEiIHN0cm9rZS13aWR0aD0iNCIgLz48dGV4dCB4PSI2MDAiIHk9IjEyMCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM2YzB1cCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+U3BhdGlhbCBQbGFuIExheW91dCAtIDQwZnQgSVNPIENvbnRhaW5lcjwvdGV4dD48L3N2Zz4=",
    brief: {
      subject: 'A 40-foot containerised battery energy storage system delivering 3.5 MWh and 1.5 MW for behind-the-meter commercial and industrial sites in the United Kingdom. Lithium iron phosphate cells, integrated battery management, bi-directional power conversion with grid-forming capability, liquid-cooled thermal management, and certified fire detection and suppression. Target installed capital cost under 180,000 pounds. Must ship complete on a flatbed lorry, install on a prepared concrete pad, and commission inside two days. Compliant with United Kingdom G99 grid code and the latest National Fire Chiefs Council guidance for lithium battery storage.',
      mission: 'Deliver a factory-integrated, containerised lithium iron phosphate battery energy storage system that enables UK commercial and industrial sites to optimise energy costs and support grid stability behind the meter, without specialist on-site build work.',
      useCase: 'A prepared-pad, two-day-commission containerised BESS that ships complete on a flatbed lorry and connects behind the meter to reduce peak demand charges and provide grid services for UK C&I sites.',
      targetCustomers: 'UK commercial and industrial site operators, energy-intensive manufacturers, logistics and distribution centres, property developers with large commercial tenants',
      whyNow: 'UK grid code G99 now mandates grid-forming capability for new behind-the-meter storage connections; NFCC guidance on lithium battery storage has matured into a de-facto planning requirement; LFP cell costs have fallen sufficiently to make containerised C&I BESS commercially viable at scale; DNOs are actively incentivising demand-side flexibility.',
      unitCostCeilingGbp: "180000",
      maxMassKg: "40000",
      targetProcess: null,
      targetMaterial: null,
      toleranceTarget: null,
      quantityTarget: null,
      complianceNotes: null
    },
    regulatory: [
      {
        code: 'ENA G99',
        name: 'Requirements for the Connection of Generation Equipment in Parallel with Public Distribution Networks',
        status: 'not-started',
        summary: 'Mandatory UK grid code for behind-the-meter storage connecting in parallel with the distribution network; grid-forming capability required.',
        applicability: 'Applicable to the 1.5MW grid-scale inverter.',
        designImpact: 'Requires SiC or advanced IGBT bi-directional inverter.',
        evidenceRequired: 'Type test certificate or individual commissioning test.',
        ownerRole: 'Electrical lead',
        gapAction: 'Verify SMA inverter compliance with latest G99 amendment.',
        confidence: 0.6,
        verifiedAt: null
      }
    ],
    modules: [
      {
        name: 'Container Enclosure & Structure',
        purpose: 'Modified 40-ft ISO high-cube steel container providing the weatherproof, fire-rated, structural housing for all subsystems with service aisle, doors, roof penetrations, and ISO corner castings.',
        description: 'The enclosure is a new-build (rather than second-hand refurbished) 40-ft ISO 1AAA high-cube steel container, modified at the fabricator to suit BESS duty: reinforced undercarriage for ~3,000 kg/m² floor loading, pre-cut and framed roof penetrations for the ceiling HVAC unit and deflagration vents, two opposing personnel doors with panic hardware, and an internal fire-rated rockwool/steel sandwich lining giving a 1-hour rating per NFPA 855 Chapter 9.',
        whyItMatters: 'The container is the primary structural, environmental, and fire-safety boundary of the entire product — it carries every subsystem load, defines IP/weather rating, provides the NFPA 855 fire compartment, and is the single earth reference for the whole system.',
        massKg: 4250,
        costGbp: 14500,
        budgetMassKg: 5000,
        leadWeeks: 10,
        leadTimeSource: "specialist-judgement",
        mirrorOfName: null,
        imageUrl: null,
        keyParts: ['Modified 40-ft ISO high-cube container shell, external 12,192 × 2,438 × 2,896 mm', 'Reinforced steel deck floor replacing standard 28 mm plywood', 'Internal thermal/fire-rated lining: 50–75 mm rockwool with 1-hour fire-rated inner steel sheet', 'Personnel service door 900 × 2,100 mm single-leaf outward-opening with crash/panic bar', 'Roof penetration frames for HVAC unit (~2,000 × 1,000 mm cut-out)', 'Single-point earth bonding bar (copper, 40 × 5 mm)', 'Fire-rated sealed cable transit penetrations (Roxtec-type, 2-hour rated)'],
        failureModes: ['Floor deflection or weld cracking under concentrated battery rack loads', 'Corrosion perforation of Corten walls or roof around HVAC and cable penetrations', 'Fire-rated lining degradation or seam failure compromising the 1-hour compartment rating', 'Loss of earth bonding continuity at rack/PCS interfaces causing touch-voltage hazard'],
        unknowns: ['Whether deflagration venting via roof panels or forced mechanical ventilation is preferred', 'Final floor-loading spec: is 3,000 kg/m² sufficient'],
        riskMatrix: [
          { id: 'RM-1', hazard: 'Deflagration vent panels fail to open at design pressure during thermal runaway', cause: 'Vent panel hinge corrosion seizure', consequence: 'Container shell ruptures explosively', existingControls: 'Four NFPA 68 / EN 14797 certified vent panels', severity: 5, likelihood: 2, mitigation: 'Specify vent panels with stainless steel hinges', owner: 'Battery safety lead', residualSeverity: 4, residualLikelihood: 1 }
        ],
        reviews: [
          {
            reviewer: 'Fang',
            verdict: 'WARNING',
            summary: 'The structural envelope is fundamentally sound - ISO container construction is a mature, globally-manufactured form. However, specific issues require resolution before this module is production-ready.',
            issues: [
              { severity: 'WARNING', category: 'Manufacturing', message: 'Coating specification inadequate.', suggestion: 'Revise coating specification to 280 µm target / 240 µm minimum dry film thickness.' }
            ],
            recommendations: ['Place a hard milestone for UL 9540A data four weeks ahead of container fabrication start.'],
            reviewedAtIso: new Date().toISOString()
          }
        ]
      },
      {
        name: 'Port-side LFP Battery Rack Array',
        purpose: 'Houses half of the LFP battery modules along one long sidewall, providing DC energy storage with integrated rack-level BMS.',
        description: 'The port-side battery rack array comprises two free-standing steel-framed racks arranged along the port long sidewall of the container, each housing 10-12 LFP prismatic-cell modules stacked vertically and interconnected by copper busbars to form a ~500 kWh / ~1500 V DC nominal string.',
        whyItMatters: 'This module represents half of the product\\'s stored energy and therefore half of the project\\'s bill-of-materials cost.',
        massKg: 15300,
        costGbp: 120800,
        budgetMassKg: 16000,
        leadWeeks: 16,
        leadTimeSource: "specialist-judgement",
        mirrorOfName: null,
        imageUrl: null,
        keyParts: ['2x LFP battery racks, 600 x 1200 x 2200 mm', '20-24x LFP prismatic-cell modules (10-12 per rack)', 'Rack-level BMU (Battery Management Unit) per rack'],
        failureModes: ['Thermal runaway of a single cell propagating to adjacent modules', 'Cell imbalance and accelerated capacity fade from BMU sensor drift'],
        unknowns: ['Final cell/module vendor selection (CATL, EVE, Gotion)'],
        riskMatrix: [
          { id: 'RM-1', hazard: 'Single-cell thermal runaway propagating to adjacent cells and modules', cause: 'Internal cell defect or overcharge', consequence: 'Catastrophic loss of container, possible deflagration event', existingControls: 'Lithium iron phosphate chemistry, per-cell voltage monitoring', severity: 5, likelihood: 2, mitigation: 'Specify grade A cells with full traceability', owner: 'Battery safety lead', residualSeverity: 4, residualLikelihood: 1 }
        ],
        reviews: []
      },
      {
        name: 'Starboard-side LFP Battery Rack Array',
        purpose: 'Houses the mirrored half of the LFP battery modules along the opposite long sidewall.',
        description: 'The starboard-side battery rack array is the mirrored counterpart to the port-side array.',
        whyItMatters: 'Together with the port-side array, this module stores 100% of the system\\'s usable energy.',
        massKg: 15300,
        costGbp: 120800,
        budgetMassKg: 16000,
        leadWeeks: 16,
        leadTimeSource: "specialist-judgement",
        mirrorOfName: "Port-side LFP Battery Rack Array",
        imageUrl: null,
        keyParts: [],
        failureModes: [],
        unknowns: [],
        riskMatrix: [],
        reviews: []
      },
      {
        name: 'Bidirectional PCS Inverter',
        purpose: 'Converts bidirectionally between DC battery bus and 400 V AC at 1.5 MW for charge/discharge operation.',
        description: 'The PCS is a floor-standing, cabinet-style bidirectional voltage-source converter rated at 1.5 MW continuous (composed of 3x 500kW blocks), converting between the 600–1,500 V DC battery bus and 400 V, 50 Hz, 3-phase AC.',
        whyItMatters: 'The PCS is the single point of energy conversion between the battery and the grid and therefore sets the system\\'s round-trip efficiency, grid compliance (G99 / IEEE 1547), response time for peak-shaving dispatch, and fault ride-through behaviour.',
        massKg: 3300,
        costGbp: 264600,
        budgetMassKg: 3500,
        leadWeeks: 16,
        leadTimeSource: "specialist-judgement",
        mirrorOfName: null,
        imageUrl: null,
        keyParts: ['3x 500 kW bidirectional PCS unit', 'IGBT power module stack (3-level NPC or T-type topology)'],
        failureModes: ['IGBT module failure due to thermal cycling or overcurrent', 'DC-link capacitor degradation (ESR rise) leading to ripple overheating'],
        unknowns: ['Final DNO-agreed grid code settings (G99 Type A vs Type B)'],
        riskMatrix: [
          { id: 'RM-1', hazard: 'Silicon carbide power module short-circuit failure causing direct current bus fault', cause: 'Power module die failure, gate driver malfunction', consequence: 'Internal arc flash, cabinet damage, possible ignition source', existingControls: 'Direct current input fuses and motorised circuit breaker', severity: 5, likelihood: 2, mitigation: 'Specify silicon carbide modules with proven field reliability data', owner: 'Electrical lead', residualSeverity: 3, residualLikelihood: 1 }
        ],
        reviews: []
      }
    ],
    bom: [
      { partNumber: 'ENC-40FT-HC', name: '40ft ISO High-Cube Steel Container', sourceModuleName: 'Container Enclosure & Structure', isPurchased: true, process: 'Welding', material: 'Corten Steel', massKg: 3800, estimatedUnitCostGbp: 12000, description: 'Modified ISO 1AAA container with reinforced floor.' },
      { partNumber: 'ENC-INS-RW', name: 'Rockwool Fire Insulation', sourceModuleName: 'Container Enclosure & Structure', isPurchased: true, process: 'Assembly', material: 'Mineral Wool', massKg: 450, estimatedUnitCostGbp: 2500, description: '50mm thermal and fire-rated lining.' },
      { partNumber: 'BAT-LFP-280', name: 'CATL 280Ah LFP Prismatic Cell', sourceModuleName: 'Port-side LFP Battery Rack Array', isPurchased: true, process: 'Chemical Assembly', material: 'Lithium Iron Phosphate', massKg: 15150, estimatedUnitCostGbp: 120000, description: 'High cycle life LFP cell.' },
      { partNumber: 'BAT-RACK-FRM', name: 'Rack Steel Frame', sourceModuleName: 'Port-side LFP Battery Rack Array', isPurchased: false, process: 'Laser & Brake', material: 'S275 Steel', massKg: 150, estimatedUnitCostGbp: 800, description: 'Welded and powder-coated steel frame.' },
      { partNumber: 'BAT-LFP-280-SB', name: 'CATL 280Ah LFP Prismatic Cell', sourceModuleName: 'Starboard-side LFP Battery Rack Array', isPurchased: true, process: 'Chemical Assembly', material: 'Lithium Iron Phosphate', massKg: 15150, estimatedUnitCostGbp: 120000, description: 'High cycle life LFP cell.' },
      { partNumber: 'BAT-RACK-FRM-SB', name: 'Rack Steel Frame', sourceModuleName: 'Starboard-side LFP Battery Rack Array', isPurchased: false, process: 'Laser & Brake', material: 'S275 Steel', massKg: 150, estimatedUnitCostGbp: 800, description: 'Welded and powder-coated steel frame.' },
      { partNumber: 'INV-SIC-500KW', name: 'SMA 500kW PCS Unit', sourceModuleName: 'Bidirectional PCS Inverter', isPurchased: true, process: 'Assembly', material: 'Mixed', massKg: 1100, estimatedUnitCostGbp: 85000, description: 'Grid-forming bidirectional inverter.' },
      { partNumber: 'INV-SIC-500KW-2', name: 'SMA 500kW PCS Unit', sourceModuleName: 'Bidirectional PCS Inverter', isPurchased: true, process: 'Assembly', material: 'Mixed', massKg: 1100, estimatedUnitCostGbp: 85000, description: 'Grid-forming bidirectional inverter.' },
      { partNumber: 'INV-SIC-500KW-3', name: 'SMA 500kW PCS Unit', sourceModuleName: 'Bidirectional PCS Inverter', isPurchased: true, process: 'Assembly', material: 'Mixed', massKg: 1100, estimatedUnitCostGbp: 85000, description: 'Grid-forming bidirectional inverter.' },
      { partNumber: 'INV-LCL-FLT', name: 'LCL Output Filter', sourceModuleName: 'Bidirectional PCS Inverter', isPurchased: true, process: 'Winding', material: 'Copper/Iron', massKg: 0, estimatedUnitCostGbp: 9600, description: 'Harmonic suppression filter.' }
    ],
    suppliers: [
      { 
        name: 'CATL', 
        matchScore: 0.98, 
        hq: 'Ningde, China',
        websiteUrl: 'https://www.catl.com',
        contactEmail: 'sales@catl.com',
        projectSynthesis: 'CATL is the global leader in LFP cell manufacturing.',
        matchedPartNumbers: ['BAT-LFP-280', 'BAT-LFP-280-SB'],
        moduleNames: ['Port-side LFP Battery Rack Array', 'Starboard-side LFP Battery Rack Array'],
        rampRole: 'Primary Cell Supplier',
        certifications: ['ISO 9001', 'ISO 14001', 'UL 1973', 'IEC 62619'],
        foundedYear: 2011,
        employeeCount: 110000,
        leadTime: '12-16 weeks',
        minimumOrder: '1 MWh',
        matchReasons: ['Industry leading LFP cell technology', 'Proven track record in grid-scale BESS', 'UL 1973 certified cells'],
        description: null
      },
      { 
        name: 'SMA Solar Technology', 
        matchScore: 0.92,
        hq: 'Niestetal, Germany',
        websiteUrl: 'https://www.sma.de',
        contactEmail: 'bess-sales@sma.de',
        projectSynthesis: 'SMA provides highly reliable grid-scale string and central inverters.',
        matchedPartNumbers: ['INV-SIC-500KW', 'INV-SIC-500KW-2', 'INV-SIC-500KW-3', 'INV-LCL-FLT'],
        moduleNames: ['Bidirectional PCS Inverter'],
        rampRole: 'Inverter Supplier',
        certifications: ['ISO 9001', 'UL 1741'],
        foundedYear: 1981,
        employeeCount: 3500,
        leadTime: '20 weeks',
        minimumOrder: '1 Unit',
        matchReasons: ['Grid-forming capability', 'Strong European service network'],
        description: null
      }
    ],
    auditLog: [
      { action: 'Project created', section: 'Meta', createdAtIso: '2026-04-25T04:42:00Z', metadataSummary: 'Project initiated' },
      { action: 'Brief locked', section: 'Brief', createdAtIso: '2026-04-25T17:30:00Z', metadataSummary: 'Constraints and targets finalized' }
    ]
  };

  const attributions = {
    brief: { 
      source: 'llm', 
      modelName: 'gemini-3.1-pro',
      judgement: {
        judgedByModel: 'grok-4.3',
        compositeScore: 6.2,
        dimensions: {
          engineeringQuality: { score: 7, rationale: "Brief sets clear technical boundaries, but behind-the-meter framing contradicts DNO connection requirements.", codingImprovement: "I, Gemini, will implement an explicit BTM vs Front-of-Meter toggle and validate constraints against it." },
          factualIntegrity: { score: 8, rationale: "The 3.5MWh constraint correctly aligns with LFP energy density for a 40ft enclosure.", codingImprovement: "I, Gemini, will add automated volume checks before rendering." },
          visualClarity: { score: 4, rationale: "Too much text. Walls of text create cognitive friction.", codingImprovement: "I, Gemini, will force the layout into a structured Key-Value pair format. Constraints should be a bulleted checklist." },
          linguisticPrecision: { score: 6, rationale: "Some language is marketing-heavy rather than engineering-focused.", codingImprovement: "I, Gemini, will strip marketing adjectives from mission statements." },
          logicalCoherence: { score: 6, rationale: "The flow is acceptable but the constraints list is visually detached from the use case.", codingImprovement: "I, Gemini, will restructure the brief into a single narrative flow." },
          actionability: { score: 6, rationale: "Lacks explicit next steps for the engineering team based on the brief.", codingImprovement: "I, Gemini, will append a 'Key Engineering Challenges' summary based on the brief." }
        },
        whatIsGood: "Narrative strength is excellent. The constraints provide solid boundary definitions.",
        whatIsBad: "Walls of text create cognitive friction. The layout does not visually separate the 'Mission' from technical 'Constraints'."
      }
    },
    regulatory: { 
      source: 'db',
      judgement: {
        judgedByModel: 'gpt-5.4',
        compositeScore: 5.5,
        dimensions: {
          engineeringQuality: { score: 6, rationale: "G99 requirement is noted, but missing clause-level citations.", codingImprovement: "I, Gemini, will enforce clause-level requirement inputs for all standards." },
          factualIntegrity: { score: 4, rationale: "All entries are marked as unverified extractions, which undermines trust.", codingImprovement: "I, Gemini, will require manual verification checks before omitting the unverified warning." },
          visualClarity: { score: 5, rationale: "React-PDF struggles with large tables. Row clipping occurs.", codingImprovement: "I, Gemini, will ensure strict wrap={false} on table row components." },
          linguisticPrecision: { score: 7, rationale: "Descriptions are accurate to the standards.", codingImprovement: "I, Gemini, will ensure standard titles are bolded." },
          logicalCoherence: { score: 6, rationale: "Logical mapping of standards to modules, but status is universally 'not-started'.", codingImprovement: "I, Gemini, will categorize standards by module impact." },
          actionability: { score: 5, rationale: "Gap actions are provided but lack due dates or specific owners.", codingImprovement: "I, Gemini, will add deadlines to the gap actions." }
        },
        whatIsGood: "The compliance matrix structure is solid.",
        whatIsBad: "High proportion of unverified claims and poor table pagination."
      }
    },
    modules: { 
      source: 'db',
      judgement: {
        judgedByModel: 'kimi-k2.6',
        compositeScore: 7.5,
        dimensions: {
          engineeringQuality: { score: 8, rationale: "Detailed breakdown of failure modes and key parts.", codingImprovement: "I, Gemini, will ensure mass/cost totals strictly reconcile with the BOM." },
          factualIntegrity: { score: 9, rationale: "Mass and cost values match the rolled-up BOM inputs perfectly.", codingImprovement: "I, Gemini, will add automated reconciliation assertions." },
          visualClarity: { score: 6, rationale: "Images can still push text down awkwardly if the aspect ratio is extreme.", codingImprovement: "I, Gemini, will implement a more structured grid with the image locked to top-right (object-fit: contain)." },
          linguisticPrecision: { score: 8, rationale: "Technical language is precise and avoids filler.", codingImprovement: "I, Gemini, will maintain this standard." },
          logicalCoherence: { score: 8, rationale: "Information flows logically from purpose to parts to failure modes.", codingImprovement: "I, Gemini, will add links to the relevant BOM section." },
          actionability: { score: 6, rationale: "Engineering reviews provide some action, but could be clearer.", codingImprovement: "I, Gemini, will highlight 'Critical' issues in red." }
        },
        whatIsGood: "Incredible density of information. The dynamic flowing layout correctly accommodates long engineering reviews without breaking.",
        whatIsBad: "Images can cause layout shifts. Mirrored modules still take up too much space."
      }
    },
    bom: { 
      source: 'db',
      judgement: {
        judgedByModel: 'glm-5.1',
        compositeScore: 5.8,
        dimensions: {
          engineeringQuality: { score: 7, rationale: "Captures all parts, but lacks sub-assembly hierarchy.", codingImprovement: "I, Gemini, will group the BOM hierarchically by Module/Sub-assembly." },
          factualIntegrity: { score: 9, rationale: "All parts map to modules correctly and costs are realistic.", codingImprovement: "I, Gemini, will maintain database constraints." },
          visualClarity: { score: 4, rationale: "A raw list of parts is mind-numbing to read and lacks hierarchy.", codingImprovement: "I, Gemini, will right-align all numerical values and add zebra striping." },
          linguisticPrecision: { score: 6, rationale: "Descriptions are short but sometimes vague.", codingImprovement: "I, Gemini, will enforce minimum length on descriptions." },
          logicalCoherence: { score: 5, rationale: "Flat list makes it hard to see the system structure.", codingImprovement: "I, Gemini, will implement a tree-view layout." },
          actionability: { score: 4, rationale: "Hard to use for procurement without supplier links.", codingImprovement: "I, Gemini, will link parts directly to supplier IDs." }
        },
        whatIsGood: "Comprehensive listing of all components.",
        whatIsBad: "A raw list of parts is mind-numbing to read. It lacks hierarchy."
      }
    },
    cost: { 
      source: 'db',
      judgement: {
        judgedByModel: 'grok-4.3',
        compositeScore: 5.5,
        dimensions: {
          engineeringQuality: { score: 7, rationale: "Accurate roll-up of costs.", codingImprovement: "I, Gemini, will add AACE Class 4 tolerance bands." },
          factualIntegrity: { score: 9, rationale: "Costs match BOM exactly.", codingImprovement: "I, Gemini, will keep the reconciliation check." },
          visualClarity: { score: 4, rationale: "Reads as accounting output rather than a waterfall chart. Lacks visual hierarchy.", codingImprovement: "I, Gemini, will generate a real waterfall chart server-side (via QuickChart/Puppeteer), return as base64, and inject as an <Image> above the table." },
          linguisticPrecision: { score: 5, rationale: "Basic table headers.", codingImprovement: "I, Gemini, will add explanatory tooltips." },
          logicalCoherence: { score: 6, rationale: "Logical, but missing the 'why' behind the cost.", codingImprovement: "I, Gemini, will add a cost drivers summary." },
          actionability: { score: 2, rationale: "Does not explain how to reduce the cost overrun.", codingImprovement: "I, Gemini, will add a 'Cost Reduction Opportunities' section." }
        },
        whatIsGood: "Clear aggregate vs per-module breakdown with headroom analysis.",
        whatIsBad: "It reads as accounting output rather than a waterfall chart."
      }
    },
    risks: { 
      source: 'llm', 
      modelName: 'gpt-5.4',
      judgement: {
        judgedByModel: 'gemini-3.1-pro',
        compositeScore: 8.0,
        dimensions: {
          engineeringQuality: { score: 8, rationale: "FMEA risks are realistic and module-specific.", codingImprovement: "I, Gemini, will add RPN calculations." },
          factualIntegrity: { score: 7, rationale: "Risks are LLM-generated and need verification.", codingImprovement: "I, Gemini, will flag LLM risks as unverified until confirmed." },
          visualClarity: { score: 9, rationale: "The vertical card format with dynamic left-border colors based on severity is excellent for scannability.", codingImprovement: "I, Gemini, will maintain this layout." },
          linguisticPrecision: { score: 8, rationale: "Clear and concise risk descriptions.", codingImprovement: "I, Gemini, will enforce standard FMEA terminology." },
          logicalCoherence: { score: 8, rationale: "Risks are logically grouped by module.", codingImprovement: "I, Gemini, will sort strictly by RPN (Severity × Likelihood) descending." },
          actionability: { score: 8, rationale: "Mitigations are clear and assignable.", codingImprovement: "I, Gemini, will add checkbox fields for mitigation tracking." }
        },
        whatIsGood: "The vertical card format with dynamic left-border colors based on severity is excellent.",
        whatIsBad: "We need a way to filter or surface only the critical risks at the very top of the document."
      }
    },
    suppliers: { 
      source: 'llm', 
      modelName: 'deepseek-v4-flash',
      judgement: {
        judgedByModel: 'glm-5.1',
        compositeScore: 6.8,
        dimensions: {
          engineeringQuality: { score: 7, rationale: "Suppliers are relevant, but scores are arbitrary LLM outputs.", codingImprovement: "I, Gemini, will replace percentage scores with qualitative tiers (Strong Fit, etc)." },
          factualIntegrity: { score: 6, rationale: "Match reasons are LLM-generated and sometimes generic.", codingImprovement: "I, Gemini, will require DB-backed proof for match reasons." },
          visualClarity: { score: 6, rationale: "Looks like a dumped directory.", codingImprovement: "I, Gemini, will move to a Card-based UI using flexbox to make 2 columns." },
          linguisticPrecision: { score: 7, rationale: "Descriptions are okay.", codingImprovement: "I, Gemini, will truncate long descriptions for visual uniformity." },
          logicalCoherence: { score: 7, rationale: "Linked to modules correctly.", codingImprovement: "I, Gemini, will link directly to BOM part numbers." },
          actionability: { score: 8, rationale: "Provides clear contact info.", codingImprovement: "I, Gemini, will add a 'Request Quote' indicator." }
        },
        whatIsGood: "Scores and match reasons are highly actionable.",
        whatIsBad: "It looks like a dumped directory rather than a curated shortlist."
      }
    },
    auditLog: {
      source: 'db',
      judgement: {
        judgedByModel: 'grok-4.3',
        compositeScore: 3.5,
        dimensions: {
          engineeringQuality: { score: 4, rationale: "Provides history, but lacks engineering context.", codingImprovement: "I, Gemini, will filter out trivial events." },
          factualIntegrity: { score: 9, rationale: "Directly from DB.", codingImprovement: "I, Gemini, will maintain this." },
          visualClarity: { score: 2, rationale: "It is a junk drawer taking up multiple pages of useless timestamps.", codingImprovement: "I, Gemini, will strip it down, drop font size to 6pt, and use a 3-column flexWrap grid." },
          linguisticPrecision: { score: 4, rationale: "Repetitive phrasing.", codingImprovement: "I, Gemini, will use abbreviations." },
          logicalCoherence: { score: 1, rationale: "Chronological, but hard to read.", codingImprovement: "I, Gemini, will group by section." },
          actionability: { score: 1, rationale: "Completely inactionable.", codingImprovement: "I, Gemini, will move this to an appendix." }
        },
        whatIsGood: "Complete immutability tracking.",
        whatIsBad: "It is a junk drawer taking up multiple pages of useless timestamps."
      }
    }
  };

  console.log('Running V3 Pipeline...');
  const hydrated = hydrateAndCoerce(raw);
  const sanitized = sanitizeText(hydrated);
  const enriched = formatAndEnrich(sanitized);
  const alerts = extractAlerts(enriched);

  // Compute realistic totals dynamically from the enriched data
  const totals = {
    moduleCount: enriched.modules.length,
    keyPartCount: enriched.modules.reduce((acc, m) => acc + m.keyParts.length, 0),
    partRowCount: enriched.bom.length,
    failureModeCount: enriched.modules.reduce((acc, m) => acc + m.failureModes.length, 0),
    unknownCount: enriched.modules.reduce((acc, m) => acc + m.unknowns.length, 0),
    regulatoryCount: hydrated.regulatory.length,
    supplierCount: enriched.suppliers.length,
    reviewCount: hydrated.modules.reduce((acc, m) => acc + (m.reviews ? m.reviews.length : 0), 0)
  };

  const { meta } = assembleDocumentMeta(enriched, raw.meta, totals);
  
  // Reconcile cost
  const calculatedCost = enriched.bom.reduce((sum, item) => sum + (item.estimatedUnitCostGbp || 0), 0);
  const costWaterfall = {
    ...enriched.costWaterfall,
    formattedUnitCost: '£' + calculatedCost.toLocaleString(),
    perModule: enriched.modules.map(m => {
      const moduleParts = enriched.bom.filter(b => b.sourceModuleName === m.name);
      const modCost = moduleParts.reduce((sum, item) => sum + (item.estimatedUnitCostGbp || 0), 0);
      return {
        moduleName: m.name,
        formattedCost: '£' + modCost.toLocaleString(),
        formattedPctOfUnit: calculatedCost > 0 ? Math.round((modCost / calculatedCost) * 100) + '%' : '0%'
      };
    })
  };

  const renderData: PdfRenderData = {
    project: enriched.project,
    meta: { ...meta, unitCostFormatted: '£' + calculatedCost.toLocaleString() },
    totals,
    brief: enriched.brief!,
    regulatory: enriched.regulatory!,
    verdict: enriched.verdict,
    alerts,
    modules: enriched.modules,
    bom: enriched.bom,
    suppliers: enriched.suppliers,
    costWaterfall: costWaterfall as any,
    risks: enriched.risks!,
    auditLog: enriched.auditLog!,
    attributions: attributions as any
  };

  console.log('Rendering to PDF buffer...');
  const buffer = await renderToBuffer(React.createElement(ProjectPDFDocument as any, { data: renderData }) as any);
  
  const outputPath = 'bess-real-v3-judgements.pdf';
  fs.writeFileSync(outputPath, buffer);
  
  console.log(`Successfully generated ${outputPath}!`);
}

generateTestPdf().catch(console.error);
`

fs.writeFileSync('/Users/tristanfischer/Developer/CentaurOS created 260126 1435/test-bess-realistic.ts', code);
console.log('Script written.');