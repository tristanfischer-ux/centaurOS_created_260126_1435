"""
ForgeOS Component Library — Supabase Seed Script
=================================================
Inserts all geometry types from Tier 1 + Tier 2 + Tier 3 (House) into the
component_geometry_types table, and seeds example catalogue parts.

Usage:
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=eyJ... python3 seed_supabase.py
"""

import os
import json
import sys

# You'll need: pip install supabase
try:
    from supabase import create_client
except ImportError:
    print("Install supabase-py: pip install supabase")
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tier1_universal import TIER1_REGISTRY
from tier2_electromechanical import TIER2_REGISTRY
from tier3_house import TIER3_HOUSE
from tier3_logistics import TIER3_LOGISTICS
from tier3_arch_styles import TIER3_ARCH_STYLES

# Connect
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")  # service_role key for seeding
if not url or not key:
    print("Set SUPABASE_URL and SUPABASE_KEY environment variables")
    sys.exit(1)

sb = create_client(url, key)

# Merge registries
FULL_REGISTRY = {}
FULL_REGISTRY.update(TIER1_REGISTRY)
FULL_REGISTRY.update(TIER2_REGISTRY)
FULL_REGISTRY.update(TIER3_HOUSE)
FULL_REGISTRY.update(TIER3_LOGISTICS)
FULL_REGISTRY.update(TIER3_ARCH_STYLES)

# Tier mapping
TIER_MAP = {}
for slug in TIER1_REGISTRY:
    TIER_MAP[slug] = "universal"
for slug in TIER2_REGISTRY:
    TIER_MAP[slug] = "electromechanical"
for slug in TIER3_HOUSE:
    TIER_MAP[slug] = "domain"
for slug in TIER3_LOGISTICS:
    TIER_MAP[slug] = "domain"
for slug in TIER3_ARCH_STYLES:
    TIER_MAP[slug] = "domain"


def get_function_source(func):
    """Extract the source code of a geometry function."""
    import inspect
    return inspect.getsource(func)


# ─── Seed Geometry Types ─────────────────────────────────────

print("=== Seeding component_geometry_types ===")
for slug, entry in FULL_REGISTRY.items():
    row = {
        "slug": slug,
        "name": entry["name"],
        "tier": TIER_MAP[slug],
        "category": entry["category"],
        "cadquery_code": get_function_source(entry["function"]),
        "param_schema": entry.get("param_schema", {}),
        "mounting_interfaces": entry.get("mounting_interfaces", []),
        "visual_tags": entry.get("visual_tags", []),
        "default_colour": entry.get("default_colour", "#888888"),
        "description": entry["function"].__doc__.strip() if entry["function"].__doc__ else "",
        "verified": True,
    }
    
    try:
        sb.table("component_geometry_types").upsert(row, on_conflict="slug").execute()
        print(f"  ✓ {slug}")
    except Exception as e:
        print(f"  ✗ {slug}: {e}")


# ─── Seed Mounting Standards ─────────────────────────────────

print("\n=== Seeding mounting_standards ===")
mounting_standards = [
    {
        "slug": "bolt_circle_m2_9mm",
        "name": "M2 Bolt Circle Ø9mm (4-hole)",
        "interface_type": "bolt_circle",
        "params": {"bolt_size": "M2", "pcd": 9.0, "count": 4, "bolt_length": 5},
        "mates_with": ["m2_clearance_hole"],
    },
    {
        "slug": "bolt_circle_m3_16mm",
        "name": "M3 Bolt Circle Ø16mm (4-hole)",
        "interface_type": "bolt_circle",
        "params": {"bolt_size": "M3", "pcd": 16.0, "count": 4, "bolt_length": 8},
        "mates_with": ["m3_clearance_hole"],
    },
    {
        "slug": "bolt_circle_m3_19mm",
        "name": "M3 Bolt Circle Ø19mm (4-hole)",
        "interface_type": "bolt_circle",
        "params": {"bolt_size": "M3", "pcd": 19.0, "count": 4, "bolt_length": 8},
        "mates_with": ["m3_clearance_hole"],
    },
    {
        "slug": "nema17_bolt_pattern",
        "name": "NEMA 17 Bolt Pattern (31mm spacing)",
        "interface_type": "bolt_grid",
        "params": {"bolt_size": "M3", "spacing_x": 31.0, "spacing_y": 31.0, "rows": 2, "cols": 2},
        "mates_with": ["m3_clearance_hole"],
    },
    {
        "slug": "motor_shaft_5mm",
        "name": "5mm Motor Shaft (D-flat)",
        "interface_type": "press_fit",
        "params": {"shaft_d": 5.0, "flat_depth": 0.5, "engagement_length": 10},
        "mates_with": ["5mm_bore_hub", "5mm_coupling"],
    },
    {
        "slug": "motor_shaft_3_175mm",
        "name": "3.175mm (1/8 inch) Motor Shaft",
        "interface_type": "press_fit",
        "params": {"shaft_d": 3.175, "engagement_length": 8},
        "mates_with": ["3mm_bore_hub"],
    },
    {
        "slug": "usb_c_standard",
        "name": "USB Type-C Receptacle Interface",
        "interface_type": "electrical",
        "params": {"type": "USB-C", "pins": 24, "data_rate": "USB 3.1"},
        "mates_with": ["usb_c_plug"],
    },
    {
        "slug": "jst_xh_4pin",
        "name": "JST-XH 4-Pin Interface",
        "interface_type": "electrical",
        "params": {"type": "JST-XH", "pins": 4, "pitch": 2.5, "voltage_max": 250},
        "mates_with": ["jst_xh_4pin_housing"],
    },
    {
        "slug": "pcb_mounting_m2_5",
        "name": "PCB M2.5 Mounting (4-hole, 30.5mm)",
        "interface_type": "bolt_grid",
        "params": {"bolt_size": "M2.5", "spacing_x": 30.5, "spacing_y": 30.5, "rows": 2, "cols": 2},
        "mates_with": ["m2_5_standoff"],
    },
    {
        "slug": "608_bearing_bore",
        "name": "608 Bearing Seat (Ø22mm bore, Ø8mm shaft)",
        "interface_type": "press_fit",
        "params": {"bore_d": 22.0, "shaft_d": 8.0, "width": 7.0},
        "mates_with": ["608_bearing_housing", "8mm_shaft"],
    },
]

for std in mounting_standards:
    try:
        sb.table("mounting_standards").upsert(std, on_conflict="slug").execute()
        print(f"  ✓ {std['slug']}")
    except Exception as e:
        print(f"  ✗ {std['slug']}: {e}")


# ─── Seed Example Catalogue Parts ────────────────────────────

print("\n=== Seeding component_catalogue (examples) ===")
catalogue_parts = [
    {
        "name": "EMAX ECO II 2807 1300KV",
        "manufacturer": "EMAX",
        "part_number": "ECO2-2807-1300",
        "geometry_type_slug": "brushless_motor_outrunner",
        "geometry_params": {"od": 34.5, "height": 13.5, "shaft_d": 5.0, "shaft_h": 8.0, "bolt_pcd": 19.0, "bolt_count": 4, "bolt_size": 3.0},
        "mounting_points": [
            {"name": "base_mount", "standard_slug": "bolt_circle_m3_19mm", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}},
            {"name": "shaft", "standard_slug": "motor_shaft_5mm", "position": {"x": 0, "y": 0, "z": 21.5}, "normal": {"x": 0, "y": 0, "z": 1}},
        ],
        "weight_g": 38.0,
        "material": "Aluminium / Copper",
        "sources": [{"supplier": "GetFPV", "url": "https://www.getfpv.com/emax-eco-ii-2807", "price": 15.99, "currency": "USD", "in_stock": True}],
        "tags": ["drone", "motor", "7inch", "long_range"],
    },
    {
        "name": "NEMA 17 Stepper - 42BYGH40 (1.8°)",
        "manufacturer": "Generic",
        "part_number": "42BYGH40",
        "geometry_type_slug": "stepper_motor_nema",
        "geometry_params": {"nema_size": 17, "body_l": 40.0, "shaft_d": 5.0, "shaft_l": 24.0},
        "mounting_points": [
            {"name": "faceplate", "standard_slug": "nema17_bolt_pattern", "position": {"x": 0, "y": 0, "z": 5}, "normal": {"x": 0, "y": 0, "z": 1}},
            {"name": "shaft", "standard_slug": "motor_shaft_5mm", "position": {"x": 0, "y": 0, "z": 29}, "normal": {"x": 0, "y": 0, "z": 1}},
        ],
        "weight_g": 280.0,
        "material": "Steel / Aluminium",
        "sources": [{"supplier": "Amazon", "url": "https://amazon.co.uk/dp/B07TGJSVRK", "price": 8.99, "currency": "GBP", "in_stock": True}],
        "tags": ["3d_printer", "cnc", "stepper", "nema17"],
    },
    {
        "name": "M3×10 Socket Head Cap Screw (50pk)",
        "manufacturer": "Generic",
        "part_number": "ISO4762-M3x10-A2",
        "geometry_type_slug": "socket_head_cap_screw",
        "geometry_params": {"thread_d": 3.0, "thread_l": 10.0},
        "weight_g": 1.2,
        "material": "A2 Stainless Steel",
        "sources": [{"supplier": "Bolt Base", "url": "https://boltbase.co.uk/m3x10-shcs", "price": 3.49, "currency": "GBP", "in_stock": True}],
        "tags": ["fastener", "m3", "stainless"],
    },
    {
        "name": "608-2RS Ball Bearing",
        "manufacturer": "SKF",
        "part_number": "608-2RS1",
        "geometry_type_slug": "ball_bearing",
        "geometry_params": {"id": 8.0, "od": 22.0, "width": 7.0, "shielded": True},
        "mounting_points": [
            {"name": "bore", "standard_slug": "608_bearing_bore", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}},
        ],
        "weight_g": 12.0,
        "material": "Chrome Steel",
        "sources": [{"supplier": "RS Components", "url": "https://uk.rs-online.com/web/p/608-2rs1", "price": 2.85, "currency": "GBP", "in_stock": True}],
        "tags": ["bearing", "skateboard", "3d_printer", "608"],
    },
    {
        "name": "Noctua NF-A4x10 FLX (40mm Fan)",
        "manufacturer": "Noctua",
        "part_number": "NF-A4x10-FLX",
        "geometry_type_slug": "axial_fan",
        "geometry_params": {"size": 40.0, "depth": 10.0, "blade_count": 7, "hole_d": 3.2},
        "weight_g": 9.0,
        "material": "PBT + Fiberglass",
        "sources": [{"supplier": "Amazon", "url": "https://amazon.co.uk/dp/B009NQLT0M", "price": 13.49, "currency": "GBP", "in_stock": True}],
        "tags": ["fan", "cooling", "40mm", "quiet"],
    },
    {
        "name": "SpeedyBee F405 V4 Flight Controller",
        "manufacturer": "SpeedyBee",
        "part_number": "F405-V4",
        "geometry_type_slug": "pcb_board",
        "geometry_params": {
            "width": 36.0, "height": 36.0, "thickness": 1.6, "corner_r": 2.0,
            "holes": [
                {"x": -15.25, "y": -15.25, "d": 2.2},
                {"x": -15.25, "y": 15.25, "d": 2.2},
                {"x": 15.25, "y": -15.25, "d": 2.2},
                {"x": 15.25, "y": 15.25, "d": 2.2},
            ],
            "components": [
                {"x": 0, "y": 0, "w": 7, "d": 7, "h": 1.5},
                {"x": -8, "y": 8, "w": 4, "d": 4, "h": 1.2},
                {"x": 10, "y": -5, "w": 5, "d": 3, "h": 2},
            ],
        },
        "mounting_points": [
            {"name": "stack_mount", "standard_slug": "pcb_mounting_m2_5", "position": {"x": 0, "y": 0, "z": 0}, "normal": {"x": 0, "y": 0, "z": -1}},
        ],
        "weight_g": 8.5,
        "material": "FR4 PCB",
        "sources": [{"supplier": "GetFPV", "url": "https://www.getfpv.com/speedybee-f405-v4", "price": 32.99, "currency": "USD", "in_stock": True}],
        "tags": ["fc", "flight_controller", "drone", "30x30"],
    },
]

for part in catalogue_parts:
    try:
        sb.table("component_catalogue").insert(part).execute()
        print(f"  ✓ {part['name']}")
    except Exception as e:
        print(f"  ✗ {part['name']}: {e}")

print("\n=== Seeding complete ===")
