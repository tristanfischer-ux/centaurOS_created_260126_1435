#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regulatory_certification_cost.py

Universal regulatory certification cost + timeline lookup.

For a given (product_class, region) returns the mandatory certifications,
their cost, and critical-path duration. Costs and durations sourced from:
- UL CSDS published rates (UL 9540, UL 1973, UL 9540A, UL 1741-SB, UL 60730)
- TUV SUD / DEKRA / Intertek published certification body fee schedules
- FDA 510(k) MDUFA-V fee schedule (2024-2027 FY)
- FAA TSO Order 8150.1 cost data and TSO Authorization fee schedule
- UK CAA scheme of charges 2025-2026
- IEC / IEEE standards fees
- NFPA standards adoption fees and AHJ review average costs
- EU Notified Body fee schedules (annexes IV-VII of MDR 2017/745)

Cost ranges are mid-points of vendor quotes for batch 1 certification of
a single SKU. For multi-SKU programmes, deduct ~20-40% per additional SKU.

Input:
    {
      "product_class": "bess",
      "region": "UK",
      "target_market_volume_units_per_year": 5000
    }

Output:
    {
      "mandatory_certifications": [
        {"body": "UL", "standard": "UL 9540", "est_cost_gbp": 65000, "est_duration_months": 9, ...},
        ...
      ],
      "total_cost_gbp": ...,
      "total_critical_path_months": ...,
      "notes": "..."
    }

Notes:
- All costs in GBP. USD-quoted fees converted at 1 USD = 0.78 GBP (2026-05 rate).
- Critical path = max of duration (not sum) since most standards run in parallel.
- "target_market_volume_units_per_year" affects fee schedule slightly above 10k/yr.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402  (same-dir shared helper — drift-safe worked calculations)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'regulatory_certification_cost (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'UL CSDS published rates; TUV SUD / DEKRA / Intertek fee schedules; FDA 510(k) MDUFA-V fee schedule; FAA TSO Order 8150.1; UK CAA scheme of charges 2025-2026',
    "physics_basis": 'Lookup table by (product_class, region) → list of (body, standard, cost_USD, duration_months). Volume-dependent surveillance uplift.',
    "confidence_class": 'industry_typical',
    "last_reviewed_date": "2026-05-22",
}


USD_GBP = 0.78
EUR_GBP = 0.86

# (region, class) -> list of {body, standard, cost_usd, duration_months, scope}
CERTIFICATIONS: dict[tuple[str, str], list[dict]] = {
    # ------ BESS ------
    ("UK", "bess"): [
        {"body": "UL", "standard": "UL 9540 (System)", "cost_usd": 95000, "duration_months": 9,
         "scope": "Energy storage system as a whole", "currency": "USD"},
        {"body": "UL", "standard": "UL 9540A (fire prop)", "cost_usd": 180000, "duration_months": 6,
         "scope": "Thermal runaway propagation test", "currency": "USD"},
        {"body": "UL", "standard": "UL 1973 (Battery)", "cost_usd": 70000, "duration_months": 6,
         "scope": "Battery for stationary use", "currency": "USD"},
        {"body": "IEC TC120", "standard": "IEC 62619", "cost_usd": 55000, "duration_months": 5,
         "scope": "Industrial lithium safety", "currency": "USD"},
        {"body": "BSI", "standard": "BS EN 62933-5-2", "cost_usd": 35000, "duration_months": 4,
         "scope": "EES safety considerations", "currency": "USD"},
        {"body": "Local AHJ", "standard": "NFPA 855 review", "cost_usd": 25000, "duration_months": 3,
         "scope": "Installation safety review", "currency": "USD"},
        {"body": "UKCA / DTI", "standard": "UKCA EMC + LVD", "cost_usd": 20000, "duration_months": 2,
         "scope": "Electromagnetic compatibility", "currency": "USD"},
    ],
    ("EU", "bess"): [
        {"body": "TUV SUD", "standard": "IEC 62619", "cost_usd": 60000, "duration_months": 5,
         "scope": "Industrial lithium safety", "currency": "USD"},
        {"body": "TUV SUD", "standard": "IEC 62933-5-2", "cost_usd": 45000, "duration_months": 4,
         "scope": "EES safety", "currency": "USD"},
        {"body": "Notified Body", "standard": "CE EMC 2014/30/EU", "cost_usd": 30000, "duration_months": 3,
         "scope": "EMC + LVD", "currency": "USD"},
        {"body": "TUV", "standard": "IEC 61508 (SIL)", "cost_usd": 80000, "duration_months": 6,
         "scope": "Functional safety", "currency": "USD"},
    ],
    ("US", "bess"): [
        {"body": "UL", "standard": "UL 9540", "cost_usd": 95000, "duration_months": 9,
         "scope": "Energy storage system", "currency": "USD"},
        {"body": "UL", "standard": "UL 9540A", "cost_usd": 180000, "duration_months": 6,
         "scope": "Fire propagation", "currency": "USD"},
        {"body": "UL", "standard": "UL 1973", "cost_usd": 70000, "duration_months": 6,
         "scope": "Battery for stationary", "currency": "USD"},
        {"body": "Local AHJ", "standard": "NFPA 855 + IFC 1207", "cost_usd": 35000, "duration_months": 4,
         "scope": "Fire code review", "currency": "USD"},
        {"body": "FCC", "standard": "FCC Part 15 Subpart B", "cost_usd": 12000, "duration_months": 2,
         "scope": "EMC for digital devices", "currency": "USD"},
    ],
    # ------ Vertical Farm ------
    ("UK", "vf"): [
        {"body": "BSI", "standard": "BS EN 60204-1 (machinery)", "cost_usd": 18000, "duration_months": 3,
         "scope": "Electrical safety of machinery", "currency": "USD"},
        {"body": "UKCA", "standard": "UKCA Machinery + EMC", "cost_usd": 15000, "duration_months": 2,
         "scope": "Machinery + EMC directive", "currency": "USD"},
        {"body": "Soil Association", "standard": "Organic certification", "cost_usd": 4000, "duration_months": 6,
         "scope": "Operational only - not equipment", "currency": "USD"},
        {"body": "Local EHO", "standard": "Food production area", "cost_usd": 6000, "duration_months": 2,
         "scope": "Environmental health officer", "currency": "USD"},
    ],
    ("EU", "vf"): [
        {"body": "TUV", "standard": "CE Machinery 2006/42/EC", "cost_usd": 20000, "duration_months": 3,
         "scope": "Machinery safety", "currency": "USD"},
        {"body": "TUV", "standard": "CE EMC 2014/30/EU", "cost_usd": 15000, "duration_months": 2,
         "scope": "EMC", "currency": "USD"},
    ],
    ("US", "vf"): [
        {"body": "UL", "standard": "UL 60204-1", "cost_usd": 22000, "duration_months": 3,
         "scope": "Industrial machinery", "currency": "USD"},
        {"body": "FDA", "standard": "FSMA Produce Safety Rule", "cost_usd": 8000, "duration_months": 6,
         "scope": "Food safety modernization", "currency": "USD"},
    ],
    # ------ HAPS ------
    ("GLOBAL", "haps"): [
        {"body": "FAA", "standard": "TSO C198 + TSO C199", "cost_usd": 800000, "duration_months": 18,
         "scope": "UAS BVLOS detect-and-avoid", "currency": "USD"},
        {"body": "FAA", "standard": "Type Certificate (UAS Special Class 21.17(b))",
         "cost_usd": 2500000, "duration_months": 36,
         "scope": "Full type certification", "currency": "USD"},
        {"body": "ICAO", "standard": "ITU Article 22 + RR S5", "cost_usd": 80000, "duration_months": 12,
         "scope": "Frequency coordination", "currency": "USD"},
        {"body": "CAA UK", "standard": "UAS BVLOS authorisation", "cost_usd": 60000, "duration_months": 9,
         "scope": "UK CAA specific category", "currency": "USD"},
    ],
    ("UK", "haps"): [
        {"body": "CAA UK", "standard": "UAS specific category BVLOS", "cost_usd": 60000, "duration_months": 9,
         "scope": "Operational authorisation", "currency": "USD"},
        {"body": "Ofcom", "standard": "Frequency assignment", "cost_usd": 8000, "duration_months": 4,
         "scope": "Spectrum + uplink coordination", "currency": "USD"},
    ],
    # ------ Heat Pump ------
    ("UK", "heat_pump"): [
        {"body": "MCS", "standard": "MIS 3005 + MCS 007", "cost_usd": 8000, "duration_months": 6,
         "scope": "Heat pump product + installer scheme", "currency": "USD"},
        {"body": "BSI", "standard": "BS EN 14511 (performance)", "cost_usd": 18000, "duration_months": 3,
         "scope": "AHRI/EU performance rating", "currency": "USD"},
        {"body": "BSI", "standard": "BS EN 14825 (SCOP)", "cost_usd": 22000, "duration_months": 4,
         "scope": "Seasonal performance EU 813/2013", "currency": "USD"},
        {"body": "F-Gas (DEFRA)", "standard": "F-Gas Reg. EU 517/2014 + UK SI 2015/310", "cost_usd": 5000,
         "duration_months": 2,
         "scope": "Refrigerant containment", "currency": "USD"},
        {"body": "UKCA", "standard": "UKCA + UKCA EMC + LVD + PED", "cost_usd": 20000, "duration_months": 3,
         "scope": "Pressure equipment + electrical + EMC", "currency": "USD"},
    ],
    ("EU", "heat_pump"): [
        {"body": "TUV", "standard": "EN 14825 SCOP", "cost_usd": 25000, "duration_months": 4,
         "scope": "ErP labelling", "currency": "USD"},
        {"body": "TUV", "standard": "CE Marking PED + EMC + LVD", "cost_usd": 25000, "duration_months": 3,
         "scope": "Multiple directives", "currency": "USD"},
        {"body": "Notified Body", "standard": "Eurovent rating", "cost_usd": 8000, "duration_months": 6,
         "scope": "Industry endorsement", "currency": "USD"},
    ],
    ("US", "heat_pump"): [
        {"body": "AHRI", "standard": "AHRI 210/240 (SEER)", "cost_usd": 35000, "duration_months": 5,
         "scope": "Performance certification", "currency": "USD"},
        {"body": "UL", "standard": "UL 1995 / UL 60335-2-40", "cost_usd": 28000, "duration_months": 4,
         "scope": "Safety of heat pumps", "currency": "USD"},
        {"body": "DOE", "standard": "Energy Star + Federal min eff.", "cost_usd": 8000, "duration_months": 3,
         "scope": "Energy efficiency labelling", "currency": "USD"},
        {"body": "EPA", "standard": "Section 608 (refrigerant)", "cost_usd": 4000, "duration_months": 2,
         "scope": "F-Gas/refrigerant management", "currency": "USD"},
    ],
    # ------ Drone ------
    ("UK", "drone"): [
        {"body": "CAA UK", "standard": "A2 CofC or GVC", "cost_usd": 1500, "duration_months": 1,
         "scope": "Operator licence", "currency": "USD"},
        {"body": "CAA UK", "standard": "Specific category OA", "cost_usd": 25000, "duration_months": 6,
         "scope": "Operational authorisation BVLOS", "currency": "USD"},
        {"body": "UKCA", "standard": "UKCA RED + EMC + LVD", "cost_usd": 15000, "duration_months": 3,
         "scope": "Radio + electrical", "currency": "USD"},
    ],
    ("EU", "drone"): [
        {"body": "EASA", "standard": "Class C0-C6 marking", "cost_usd": 18000, "duration_months": 4,
         "scope": "EU 2019/945", "currency": "USD"},
        {"body": "TUV", "standard": "CE RED 2014/53/EU", "cost_usd": 15000, "duration_months": 3,
         "scope": "Radio equipment directive", "currency": "USD"},
    ],
    ("US", "drone"): [
        {"body": "FAA", "standard": "Part 107 + Remote ID", "cost_usd": 2000, "duration_months": 1,
         "scope": "Commercial operator", "currency": "USD"},
        {"body": "FAA", "standard": "Type Certificate (>25kg)", "cost_usd": 800000, "duration_months": 24,
         "scope": "Type cert for larger", "currency": "USD"},
        {"body": "FCC", "standard": "FCC Part 15.247", "cost_usd": 12000, "duration_months": 2,
         "scope": "RF + ISM band", "currency": "USD"},
    ],
    # ------ AUV ------
    ("UK", "auv"): [
        {"body": "Lloyd's Register", "standard": "LR UMSV Code", "cost_usd": 65000, "duration_months": 8,
         "scope": "Unmanned Marine Surface/Subsurface Vessel", "currency": "USD"},
        {"body": "MCA", "standard": "MAIB notification", "cost_usd": 5000, "duration_months": 1,
         "scope": "Maritime authority", "currency": "USD"},
        {"body": "UKCA", "standard": "UKCA marking + REACH", "cost_usd": 18000, "duration_months": 3,
         "scope": "Marking + chemicals", "currency": "USD"},
    ],
    ("EU", "auv"): [
        {"body": "DNV", "standard": "DNVGL-ST-0512 (UMSV)", "cost_usd": 70000, "duration_months": 8,
         "scope": "Underwater autonomous vehicles", "currency": "USD"},
        {"body": "EU MED", "standard": "MED 2014/90/EU", "cost_usd": 25000, "duration_months": 4,
         "scope": "Marine equipment directive", "currency": "USD"},
    ],
    ("US", "auv"): [
        {"body": "ABS", "standard": "ABS Guide for Unmanned Maritime Systems",
         "cost_usd": 75000, "duration_months": 9,
         "scope": "Classification society", "currency": "USD"},
        {"body": "USCG", "standard": "33 CFR Subchapter U", "cost_usd": 20000, "duration_months": 4,
         "scope": "Coast Guard authorisation", "currency": "USD"},
    ],
    # ------ Bioreactor ------
    ("UK", "bioreactor"): [
        {"body": "BSI", "standard": "BS EN ISO 14644 (cleanroom)", "cost_usd": 15000, "duration_months": 3,
         "scope": "Clean classification", "currency": "USD"},
        {"body": "MHRA", "standard": "GMP licence (Annex 1)", "cost_usd": 35000, "duration_months": 6,
         "scope": "Sterile manufacturing", "currency": "USD"},
        {"body": "MHRA", "standard": "MIA-IMP for clinical supply", "cost_usd": 45000, "duration_months": 8,
         "scope": "Investigational medicinal product", "currency": "USD"},
        {"body": "UKCA", "standard": "PED + Machinery + EMC", "cost_usd": 22000, "duration_months": 4,
         "scope": "Pressure vessel + machinery", "currency": "USD"},
    ],
    ("EU", "bioreactor"): [
        {"body": "EMA", "standard": "EU GMP Vol 4 Annex 1", "cost_usd": 50000, "duration_months": 9,
         "scope": "Sterile manufacturing", "currency": "USD"},
        {"body": "Notified Body", "standard": "CE PED 2014/68/EU", "cost_usd": 25000, "duration_months": 4,
         "scope": "Pressure equipment", "currency": "USD"},
    ],
    ("US", "bioreactor"): [
        {"body": "FDA", "standard": "21 CFR 211 (cGMP)", "cost_usd": 150000, "duration_months": 12,
         "scope": "Current Good Manufacturing Practice", "currency": "USD"},
        {"body": "FDA", "standard": "IND filing + audit", "cost_usd": 250000, "duration_months": 9,
         "scope": "Investigational New Drug", "currency": "USD"},
        {"body": "FDA", "standard": "BLA filing (PDUFA-VII)", "cost_usd": 4000000, "duration_months": 18,
         "scope": "Biologics License Application", "currency": "USD"},
        {"body": "ASME", "standard": "ASME BPE 2022", "cost_usd": 30000, "duration_months": 4,
         "scope": "Bioprocessing equipment", "currency": "USD"},
    ],
    # ------ CGM / medical ------
    ("US", "cgm"): [
        {"body": "FDA", "standard": "510(k) Class II", "cost_usd": 250000, "duration_months": 9,
         "scope": "Substantial equivalence", "currency": "USD"},
        {"body": "FDA", "standard": "ISO 14971 RMF", "cost_usd": 40000, "duration_months": 4,
         "scope": "Risk management file", "currency": "USD"},
        {"body": "FDA", "standard": "ISO 13485 QMS", "cost_usd": 60000, "duration_months": 6,
         "scope": "Quality system", "currency": "USD"},
        {"body": "CLIA", "standard": "CLIA waiver", "cost_usd": 35000, "duration_months": 4,
         "scope": "Lab-test waiver for OTC", "currency": "USD"},
    ],
    ("EU", "cgm"): [
        {"body": "Notified Body", "standard": "CE Class IIb MDR 2017/745", "cost_usd": 350000, "duration_months": 18,
         "scope": "Medical device MDR", "currency": "USD"},
        {"body": "TUV SUD", "standard": "ISO 13485", "cost_usd": 60000, "duration_months": 6,
         "scope": "QMS", "currency": "USD"},
    ],
    # ------ Edge AI / IoT ------
    ("EU", "edge_ai"): [
        {"body": "ETSI", "standard": "ETSI EN 303 645 (consumer IoT)", "cost_usd": 25000, "duration_months": 4,
         "scope": "Cybersecurity baseline", "currency": "USD"},
        {"body": "Notified Body", "standard": "CE RED + RF + EMC", "cost_usd": 30000, "duration_months": 4,
         "scope": "Radio + EMC", "currency": "USD"},
        {"body": "EU", "standard": "EU AI Act conformity", "cost_usd": 80000, "duration_months": 8,
         "scope": "High-risk AI system", "currency": "USD"},
    ],
    ("US", "edge_ai"): [
        {"body": "FCC", "standard": "FCC Part 15 Subpart C", "cost_usd": 15000, "duration_months": 2,
         "scope": "Intentional radiator", "currency": "USD"},
        {"body": "UL", "standard": "UL 2900-1 (cyber)", "cost_usd": 45000, "duration_months": 5,
         "scope": "Software cybersecurity", "currency": "USD"},
    ],
    # ------ EV charger ------
    ("UK", "ev_charger"): [
        {"body": "OZEV", "standard": "EVHS / Smart Charge Reg.", "cost_usd": 12000, "duration_months": 3,
         "scope": "Smart charge points 2021", "currency": "USD"},
        {"body": "UKCA", "standard": "BS EN 61851-1 + EN 62196", "cost_usd": 25000, "duration_months": 4,
         "scope": "EV conductive charge", "currency": "USD"},
        {"body": "UKCA", "standard": "BS EN 50550 (RCD)", "cost_usd": 8000, "duration_months": 2,
         "scope": "Residual current", "currency": "USD"},
    ],
    ("EU", "ev_charger"): [
        {"body": "TUV", "standard": "EN 61851-1 + IEC 62196", "cost_usd": 28000, "duration_months": 4,
         "scope": "EV charging", "currency": "USD"},
        {"body": "OCPP", "standard": "OCPP 2.0.1 certification", "cost_usd": 6000, "duration_months": 1,
         "scope": "Protocol conformance", "currency": "USD"},
    ],
    ("US", "ev_charger"): [
        {"body": "UL", "standard": "UL 2202 (Level 3 DC)", "cost_usd": 55000, "duration_months": 6,
         "scope": "DC fast charge", "currency": "USD"},
        {"body": "UL", "standard": "UL 2231 (PEV)", "cost_usd": 35000, "duration_months": 4,
         "scope": "Personnel protection", "currency": "USD"},
    ],
    # ------ Solar / Wind / H2 / Inverter ------
    ("US", "solar_inverter"): [
        {"body": "UL", "standard": "UL 1741-SB + IEEE 1547-2018", "cost_usd": 85000, "duration_months": 7,
         "scope": "Smart inverter grid-support", "currency": "USD"},
        {"body": "UL", "standard": "UL 1741 PCS", "cost_usd": 55000, "duration_months": 5,
         "scope": "Power conversion safety", "currency": "USD"},
    ],
    ("UK", "wind_turbine"): [
        {"body": "DNV", "standard": "IEC 61400-22 (Type Cert)", "cost_usd": 1500000, "duration_months": 30,
         "scope": "Wind turbine type certification", "currency": "USD"},
        {"body": "MCS", "standard": "MCS-006 small wind", "cost_usd": 12000, "duration_months": 4,
         "scope": "Small wind scheme (<50 kW)", "currency": "USD"},
    ],
    ("EU", "h2_electrolyser"): [
        {"body": "TUV", "standard": "ISO 22734 + ATEX 2014/34/EU", "cost_usd": 110000, "duration_months": 10,
         "scope": "PEM/AEM electrolyser + explosive atmospheres", "currency": "USD"},
        {"body": "Notified Body", "standard": "CE PED + Machinery + EMC", "cost_usd": 35000, "duration_months": 5,
         "scope": "Pressure + machinery", "currency": "USD"},
    ],
    ("UK", "ups_inverter"): [
        {"body": "UKCA", "standard": "BS EN 62040-1 + EN 62040-2", "cost_usd": 22000, "duration_months": 4,
         "scope": "UPS safety + EMC", "currency": "USD"},
    ],
    # ------ Additive / Subtractive ------
    ("UK", "3d_printer"): [
        {"body": "UKCA", "standard": "BS EN 60204-1 + EN 12100", "cost_usd": 15000, "duration_months": 3,
         "scope": "Machinery safety", "currency": "USD"},
    ],
    ("UK", "cnc_machine"): [
        {"body": "UKCA", "standard": "BS EN 12417 (machining centres)", "cost_usd": 18000, "duration_months": 3,
         "scope": "Machining centres safety", "currency": "USD"},
    ],
    # ------ E-bike ------
    ("UK", "e_bike"): [
        {"body": "UKCA", "standard": "BS EN 15194 (EPAC)", "cost_usd": 8000, "duration_months": 2,
         "scope": "Electrically power-assisted cycles", "currency": "USD"},
    ],
    ("EU", "e_bike"): [
        {"body": "TUV", "standard": "EN 15194", "cost_usd": 8000, "duration_months": 2,
         "scope": "EPAC", "currency": "USD"},
    ],
    # ------ Smallsat / Cubesat / GEO / Interplanetary ------
    ("GLOBAL", "smallsat"): [
        {"body": "FCC", "standard": "FCC Part 25 Earth Station", "cost_usd": 250000, "duration_months": 12,
         "scope": "Satellite licensing", "currency": "USD"},
        {"body": "ITU", "standard": "ITU coordination Article 9", "cost_usd": 150000, "duration_months": 18,
         "scope": "Orbital + frequency coordination", "currency": "USD"},
    ],
    ("GLOBAL", "cubesat"): [
        {"body": "FCC", "standard": "FCC Part 5 experimental", "cost_usd": 35000, "duration_months": 4,
         "scope": "Educational/experimental", "currency": "USD"},
    ],
    ("GLOBAL", "geo_comsat"): [
        {"body": "FCC", "standard": "FCC Part 25 + ITU Article 11", "cost_usd": 800000, "duration_months": 24,
         "scope": "GEO commercial coordination", "currency": "USD"},
    ],
    ("GLOBAL", "interplanetary"): [
        {"body": "COSPAR", "standard": "COSPAR Planetary Protection",
         "cost_usd": 350000, "duration_months": 18,
         "scope": "Planetary protection cat IV-V", "currency": "USD"},
        {"body": "FCC", "standard": "FCC Part 25 deep space", "cost_usd": 600000, "duration_months": 24,
         "scope": "Deep space allocation", "currency": "USD"},
    ],
    ("GLOBAL", "propulsion_thruster"): [
        {"body": "TUV / DNV", "standard": "AIAA S-080 + S-081", "cost_usd": 250000, "duration_months": 12,
         "scope": "Pressurised systems for space", "currency": "USD"},
    ],
    ("GLOBAL", "ground_station"): [
        {"body": "FCC", "standard": "FCC Part 25 Earth Station", "cost_usd": 65000, "duration_months": 6,
         "scope": "Earth station registration", "currency": "USD"},
    ],
    # ------ Medical ------
    ("US", "ventilator"): [
        {"body": "FDA", "standard": "510(k) Class II + ISO 80601-2-12", "cost_usd": 450000, "duration_months": 12,
         "scope": "Ventilator for critical care", "currency": "USD"},
        {"body": "FDA", "standard": "ISO 13485 QMS", "cost_usd": 80000, "duration_months": 6,
         "scope": "QMS", "currency": "USD"},
    ],
    ("EU", "ventilator"): [
        {"body": "Notified Body", "standard": "CE Class IIb MDR", "cost_usd": 350000, "duration_months": 18,
         "scope": "MDR 2017/745", "currency": "USD"},
    ],
    ("US", "dialysis_machine"): [
        {"body": "FDA", "standard": "510(k) Class III + IEC 60601-2-16", "cost_usd": 650000, "duration_months": 14,
         "scope": "Haemodialysis equipment", "currency": "USD"},
    ],
    ("EU", "dialysis_machine"): [
        {"body": "Notified Body", "standard": "CE Class IIb MDR", "cost_usd": 400000, "duration_months": 18,
         "scope": "MDR + IEC 60601-2-16", "currency": "USD"},
    ],
}


# Aliases → the table's canonical class slugs. EXPLICIT + conservative — this
# replaces the old blind fuzzy snap (safe_choice) for product_class, which
# silently relabelled ANY unknown class to the alphabetically-first table entry
# ("water_treatment" → "3d_printer", v56d) and then rendered a WRONG-CLASS or £0
# certification basis as if it were real. Extend as genuinely-equivalent slugs
# appear; a class with no certification regime on file must fall to the honest
# not-estimated path, never a neighbour's numbers.
CLASS_SYNONYMS: dict[str, str] = {
    "battery_energy_storage": "bess", "battery_storage": "bess", "grid_battery": "bess",
    "vertical_farm": "vf", "vertical_farming": "vf",
    "heatpump": "heat_pump", "ashp": "heat_pump", "gshp": "heat_pump",
    "uav": "drone", "uas": "drone", "quadcopter": "drone",
    "uuv": "auv", "rov": "auv",
    "hydrogen_electrolyser": "h2_electrolyser", "electrolyser": "h2_electrolyser",
    "electrolyzer": "h2_electrolyser",
    "wind": "wind_turbine", "onshore_wind": "wind_turbine",
    "ev_charging_station": "ev_charger", "evse": "ev_charger",
    "cubesat_platform": "cubesat", "smallsat_platform": "smallsat",
    "continuous_glucose_monitor": "cgm", "glucose_monitor": "cgm",
}


def _resolve_class(raw, classes: list[str]) -> str | None:
    """Resolve the payload's product_class to a table slug: exact (normalised) →
    explicit synonym → None (honestly uncovered). Deliberately NO fuzzy nearest-
    neighbour: certification regimes are class-specific, so a mis-snap fabricates
    a wrong-class cost basis (the v56d "water_treatment → 3d_printer" trap)."""
    s = str(raw or "").strip().lower()
    if not s:
        return None
    norm = {str(c).strip().lower(): c for c in classes}
    if s in norm:
        return norm[s]
    syn = CLASS_SYNONYMS.get(s)
    if syn and syn in norm:
        return norm[syn]
    return None


def compute(payload: dict) -> dict:
    # FAIL-SOFT: region is a fixed vocabulary (the table's regions) — snap an
    # off-list value to the nearest rather than missing every key. product_class
    # resolves EXACT-or-synonym only (_resolve_class above); a genuinely-uncovered
    # class returns an HONEST not-estimated result — total_cost_gbp: null + a
    # not_estimated_for_class status (the same convention as generic-tool-class-
    # applicability.ts markNotEstimatedForClass) — NEVER a fabricated £0 (v56d
    # minted regulatory_cert_cost_gbp = 0 for a UK/EU water plant from exactly
    # this path; a zero with no basis must be an honest absent).
    _regions = sorted({r for r, _ in CERTIFICATIONS.keys()})
    _classes = sorted({c for _, c in CERTIFICATIONS.keys()})
    region = safe_choice(payload.get("region", "UK"), _regions, default="UK", label="region")
    raw_class = payload.get("product_class", "")
    cls = _resolve_class(raw_class, _classes)
    volume = float(payload.get("target_market_volume_units_per_year", 0))

    key = (region, cls)
    if cls is None or key not in CERTIFICATIONS:
        # Try GLOBAL fallback
        global_key = ("GLOBAL", cls)
        if cls is not None and global_key in CERTIFICATIONS:
            certs = CERTIFICATIONS[global_key]
            key_used = global_key
        else:
            if cls is None:
                reason = (f"no certification schedule on file for product class "
                          f"{str(raw_class)!r} — the lookup table covers "
                          f"{len(_classes)} discrete-product classes and refuses to "
                          f"substitute a neighbouring class's fee schedule. Scope the "
                          f"certification cost & critical path with the relevant "
                          f"conformity body at FEED stage.")
            else:
                reason = (f"no certification data on file for ({region}, {cls}); "
                          f"regions with data for this class: "
                          f"{sorted(set(r for r, c in CERTIFICATIONS.keys() if c == cls))}.")
            return {
                "product_class": cls if cls is not None else str(raw_class),
                "region": region,
                # HONEST ABSENT: null, not 0 — the bootstrap quantity materialiser
                # (num(output, field) undefined → no mint) then leaves
                # regulatory_cert_cost_gbp unminted instead of minting £0.
                "status": "not_estimated_for_class",
                "not_estimated_reason": reason,
                "note": reason,
                "mandatory_certifications": [],
                "total_cost_gbp": None,
                "total_critical_path_months": None,
                "worked": [],
            }
    else:
        certs = CERTIFICATIONS[key]
        key_used = key

    # Build per-cert costs
    items = []
    total_cost_gbp = 0.0
    max_duration = 0
    for c in certs:
        usd = c["cost_usd"]
        gbp = round(usd * USD_GBP)
        items.append({
            "body": c["body"],
            "standard": c["standard"],
            "est_cost_gbp": gbp,
            "est_cost_usd": usd,
            "est_duration_months": c["duration_months"],
            "scope": c["scope"],
        })
        total_cost_gbp += gbp
        if c["duration_months"] > max_duration:
            max_duration = c["duration_months"]

    # Volume-dependent uplift (above 10k units/yr, add surveillance fees).
    # NOTE fix 2026-07-03: the >50k branch was previously unreachable (an
    # `elif` behind `> 10000`), so a 60k unit/yr programme got +15% not +25% —
    # check the LARGER threshold first.
    base_cost_gbp = total_cost_gbp
    surveillance_uplift_pct = 0
    if volume > 50000:
        surveillance_uplift_pct = 25
    elif volume > 10000:
        surveillance_uplift_pct = 15
    total_cost_gbp = base_cost_gbp * (1.0 + surveillance_uplift_pct / 100.0)

    # ── worked[] — hand-checkable totals (inputs → formula → result) ────────────
    # Built from the SAME live values summed above (_worked.py drift-safety
    # contract) so the Calculations tab shows HOW total_cost_gbp / the critical
    # path arise from the per-certification schedule, not just the outputs.
    worked = [
        worked_calc(
            label="Total certification cost",
            formula="C_total = C_certs x (1 + uplift / 100)",
            values={"C_certs": (round(base_cost_gbp), "GBP"),
                    "uplift": (surveillance_uplift_pct, "%")},
            result=round(total_cost_gbp), result_unit="GBP",
            assumptions=[
                f"C_certs = sum of the {len(items)} mandatory certification fees for ({key_used[0]}, {key_used[1]}): "
                + " + ".join(f"£{it['est_cost_gbp']:,}" for it in items),
                f"USD-quoted vendor fees converted at 1 USD = {USD_GBP} GBP",
                "volume surveillance uplift: +15% above 10k units/yr, +25% above 50k",
            ],
        ),
        worked_calc(
            label="Certification critical path",
            formula="T_critical = max(cert durations)",
            values={"cert durations": (" / ".join(str(it["est_duration_months"]) for it in items), "months")},
            result=max_duration, result_unit="months",
            assumptions=["critical path = MAX of individual standards (parallel testing assumed), not the sum"],
        ),
    ]

    return {
        "product_class": cls,
        "region": region,
        "lookup_key_used": list(key_used),
        "mandatory_certifications": items,
        "total_cost_gbp": round(total_cost_gbp),
        "total_critical_path_months": max_duration,
        "surveillance_uplift_pct": surveillance_uplift_pct,
        "worked": worked,
        "notes": (
            f"Costs are USD-quoted vendor fees converted at 1 USD=0.78 GBP. "
            f"Critical path = MAX of individual standards (parallel testing assumed). "
            f"Above 10k units/yr, +15% for surveillance fees; above 50k, +25%. "
            f"Excludes internal engineering time, sample fabrication, and re-test fees."
        ),
    }


def _selftest() -> int:
    """proveCatch for the routed residuals (commit e74d4502e): (a) the v56d
    adversarial input — an uncovered water-treatment class — minted a fabricated
    regulatory_cert_cost_gbp = £0 (silently snapped to '3d_printer' by the old
    fuzzy default, then the (EU, 3d_printer) miss returned literal 0); it MUST
    now return an HONEST ABSENT (null + not_estimated_for_class). (b) a covered
    class emitted NO worked[] — it must now show the hand-checkable totals."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # (a) THE catch — the exact v56d shape: uncovered class must be honest-absent
    for region in ("EU", "UK"):
        out = compute({"product_class": "water_treatment", "region": region})
        chk(f"uncovered_null_not_zero[{region}]", out["total_cost_gbp"] is None)
        chk(f"uncovered_status[{region}]", out.get("status") == "not_estimated_for_class")
        chk(f"uncovered_keeps_raw_class[{region}]", out["product_class"] == "water_treatment")
    # the old fuzzy snap must be dead: no wrong-class basis ('3d_printer') anywhere
    chk("no_wrong_class_snap", "3d_printer" not in json.dumps(compute({"product_class": "water_treatment", "region": "UK"})))

    # (b) covered class: real cost + worked[] present and arithmetically sound
    out = compute({"product_class": "bess", "region": "UK"})
    chk("covered_cost_positive", isinstance(out["total_cost_gbp"], int) and out["total_cost_gbp"] > 0)
    worked = out.get("worked") or []
    chk("covered_worked_present", len(worked) == 2)
    total_wc = worked[0]
    chk("worked_total_matches_output", (total_wc.get("result") or {}).get("value") == out["total_cost_gbp"])
    base = sum(it["est_cost_gbp"] for it in out["mandatory_certifications"])
    chk("worked_base_is_cert_sum", f"{base:,}" in str(total_wc.get("substitution")) or str(base) in str(total_wc.get("substitution")).replace(",", ""))
    chk("critical_path_is_max", (worked[1].get("result") or {}).get("value")
        == max(it["est_duration_months"] for it in out["mandatory_certifications"]))

    # explicit synonym still resolves (conservative alias, not fuzzy)
    chk("synonym_vf", compute({"product_class": "vertical_farm", "region": "UK"})["total_cost_gbp"] > 0)
    # GLOBAL fallback intact (haps has GLOBAL + UK entries; US falls to GLOBAL)
    chk("global_fallback", compute({"product_class": "haps", "region": "US"})["lookup_key_used"] == ["GLOBAL", "haps"])

    # volume-uplift order fix: >50k must take +25%, not the +15% elif shadow
    hi = compute({"product_class": "bess", "region": "UK", "target_market_volume_units_per_year": 60000})
    chk("uplift_50k_is_25pct", hi["surveillance_uplift_pct"] == 25)
    mid = compute({"product_class": "bess", "region": "UK", "target_market_volume_units_per_year": 20000})
    chk("uplift_10k_is_15pct", mid["surveillance_uplift_pct"] == 15)

    if fails:
        print(f"[regulatory_certification_cost] SELFTEST FAIL: {', '.join(fails)}", file=sys.stderr)
        return 1
    print("[regulatory_certification_cost] selftest OK (uncovered class → honest absent, never £0; covered class → 2 worked calcs; uplift order fixed)")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
