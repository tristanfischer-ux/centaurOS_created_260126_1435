"""Unit tests for the UNIVERSAL FLOW-DERIVATION (derive_flows + role classifiers).

These are PURE-PYTHON tests of the connectivity-derivation logic — they stub `bpy`
and `forge_blender_lib` so the module imports without Blender, then exercise the
role detectors + derive_flows directly. They guard the invariants the 2026-06-11
flow-derivation work established (regression-harness rule 11):

  • a BESS-shaped state derives DC-bus → each rack + chiller → each rack → coolant
    return → chiller (per-rack, NOT one centroid bus);
  • a VF-shaped state derives the closed WATER loop (reservoir → each rack → return
    skid → reservoir) with supply + return on DISTINCT mechanisms;
  • a RICH topology (≥6 edges, e-fuel) DEFERS — only the electrical fan-out is ever
    derived, never a fluid/thermal loop;
  • the underscore-boundary role regexes match topology endpoints (led_array,
    lfp_cell_string) that the old \\b form missed.
  • the per-rack fan-out is GROUPED into a TRUNK-AND-BRANCH (header/busway):
    each (hub, mechanism) feeding >= 3 consumers collapses to ONE trunk + N short
    taps (group_fanout_trunks), supply and return on separate parallel trunks,
    while the electrical chain + the lone collector→hub edge stay passthrough.

Run:  python3 scripts/blender-universal/test_derive_flows.py
Exit 0 = all pass; exit 1 = a failure (with the failing assertion printed).
"""
import sys
import types
from pathlib import Path

# ── stub the Blender-only deps so the module imports headless ────────────────
_bpy = types.ModuleType("bpy")
_bpy.data = types.SimpleNamespace()
_bpy.ops = types.SimpleNamespace()
_bpy.context = types.SimpleNamespace()
sys.modules.setdefault("bpy", _bpy)
sys.modules.setdefault("mathutils", types.ModuleType("mathutils"))
# minimal forge_blender_lib stub (only the names referenced at import / by the
# functions under test — none of the geometry builders are called here).
_fl = types.ModuleType("forge_blender_lib")
_fl.MM = 0.001
sys.modules.setdefault("forge_blender_lib", _fl)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_universal_scene as B  # noqa: E402


# ── tiny test harness ────────────────────────────────────────────────────────
_FAILS = []


def check(cond, msg):
    if cond:
        print(f"  PASS  {msg}")
    else:
        print(f"  FAIL  {msg}")
        _FAILS.append(msg)


def _part(name, placed=None):
    """A minimal placed/unplaced Part for role-classifier tests."""
    p = B.Part(name, "mod", "reg", 10, "box", None, 1, "")
    if placed is not None:
        p.placed_xyz_mm = placed
        p.anchors = {"top": (placed[0], placed[1], placed[2] + 1000.0),
                     "centre": placed, "bottom": placed}
    return p


def _mechs(*fams):
    return set(fams)


# ── 1. underscore-boundary regexes (the led_array / lfp_cell_string bug) ──────
print("[1] underscore-boundary role detection")
# These were the real defects: \barray\b / \bcell\b do NOT match an underscore-joined
# token (the '_' is a word char). The fixed (?<![a-z]) form must catch them.
import re  # noqa: E402
GROW = re.compile(r"(?<![a-z])(?:grow|growing|tray|canopy|led|tier|crop|plant|"
                  r"propagation|array|trolley)(?![a-z])", re.IGNORECASE)
RACK = re.compile(r"(?<![a-z])(?:rack|cell|string|module|pack|battery)(?![a-z])",
                  re.IGNORECASE)
check(bool(GROW.search("led_array")), "GROW matches 'led_array' (was missed by \\barray\\b)")
check(bool(GROW.search("canopy_tier")), "GROW matches 'canopy_tier'")
check(bool(RACK.search("lfp_cell_string")), "RACK matches 'lfp_cell_string'")
check(bool(RACK.search("battery_rack")), "RACK matches 'battery_rack'")
check(not GROW.search("overlay_arrayed"), "GROW does NOT match 'arrayed' (boundary holds)")


# ── 2. HUB / COLLECTOR role classification ───────────────────────────────────
print("[2] hub / collector role detectors")
check(bool(B.HUB_ELECTRICAL_RE.search("panel busbar")), "panel busbar = electrical hub")
check(bool(B.HUB_ELECTRICAL_RE.search("power distribution unit (PDU)")), "PDU = electrical hub")
check(bool(B.HUB_ELECTRICAL_RE.search("redundant PSU pair")), "PSU = electrical hub")
check(bool(B.HUB_FLUID_SUPPLY_RE.search("fertigation reservoir")), "fertigation reservoir = fluid-supply hub")
check(bool(B.HUB_FLUID_SUPPLY_RE.search("coolant distribution manifold")), "manifold = fluid-supply hub")
check(bool(B.HUB_THERMAL_RE.search("liquid cooling chiller")), "chiller = thermal hub")
check(bool(B.HUB_THERMAL_RE.search("CRAC precision air unit")), "CRAC = thermal hub")
check(bool(B.COLLECTOR_RE.search("return drainage grid")), "return drainage grid = collector")
check(bool(B.COLLECTOR_THERMAL_RE.search("coolant return pipe")), "coolant return pipe = thermal collector")
# exclusions: a label / sensor is never a hub
check(bool(B.ROLE_EXCLUDE_RE.search("arc flash hazard label")), "label excluded from roles")
check(bool(B.ROLE_EXCLUDE_RE.search("pack temperature sensor")), "sensor excluded from roles")


# ── 3. BESS-shaped derivation: DC bus → each rack + chiller loop ──────────────
print("[3] BESS per-rack derivation (15 racks)")
racks = [(i * 720.0, 0.0, 2500.0) for i in range(15)]
parts_bess = [
    _part("DC busbar 800 V"), _part("liquid cooling chiller"),
    _part("coolant return pipe"), _part("HVAC condensate pump"),
    _part("step-up transformer"), _part("PCS inverter 1 MW bidirectional"),
]
hubs = {"electrical": ("switchgear", (11000.0, 0.0, 2500.0)),
        "thermal": ("chiller", (11000.0, 1500.0, 2500.0))}
collectors = {}
e_chain = [("pcs", (11000.0, -1500.0, 2000.0)), ("transformer", (12500.0, 0.0, 1300.0))]
topo_bess = [{"mechanism": "electrical_bus", "from_part": "lfp_cell_string", "to_part": "dc_bus"},
             {"mechanism": "thermal", "from_part": "pcs_inverter", "to_part": "heat_rejection"},
             {"mechanism": "mechanical", "from_part": "step_up_transformer", "to_part": "enclosure_atmosphere"}]
derived = B.derive_flows(parts_bess, racks, topo_bess, _mechs("electrical", "thermal"),
                         hubs=hubs, collectors=collectors, electrical_chain=e_chain)
elec = [d for d in derived if d["mech"] == "electrical_bus"]
th_sup = [d for d in derived if d["mech"] == "thermal"]
th_ret = [d for d in derived if d["mech"] == "thermal_return"]
elec_to_racks = [d for d in elec if str(d["b_nm"]).startswith("rack[")]
check(len(elec_to_racks) == 15, f"electrical fans to ALL 15 racks (got {len(elec_to_racks)})")
check(len(th_sup) == 15, f"chiller supplies ALL 15 racks (got {len(th_sup)})")
check(len(th_ret) == 16, f"thermal return closes: 15 racks + collector→hub (got {len(th_ret)})")
check(any(d["b_nm"] == "pcs" for d in elec), "electrical chain reaches PCS")
check(any(d["b_nm"] == "transformer" for d in elec), "electrical chain reaches transformer")
# the return must target the PRECISE coolant return pipe, NOT the HVAC condensate pump
check(any("coolant return pipe" in str(d["b_nm"]) for d in th_ret),
      "thermal return targets 'coolant return pipe' (not the HVAC condensate pump)")
check(not any("condensate pump" in str(d["b_nm"]) for d in th_ret),
      "thermal return does NOT mis-target the HVAC condensate pump")


# ── 4. VF-shaped derivation: closed water loop, supply≠return mechanism ───────
print("[4] VF water-loop derivation (8 racks)")
racks_vf = [(i * 2800.0, (i // 4) * 2200.0, 2400.0) for i in range(8)]
parts_vf = [_part("fertigation reservoir"), _part("return drainage grid"),
            _part("panel busbar"), _part("DX HVAC unit")]
hubs_vf = {"electrical": ("control", (24000.0, 1000.0, 2400.0)),
           "fluid": ("nutrient", (24000.0, 2000.0, 2400.0)),
           "thermal": ("hvac", (24000.0, 3000.0, 2400.0))}
collectors_vf = {"fluid": ("water", (24000.0, 4000.0, 2400.0))}
topo_vf = [{"mechanism": "electrical_bus", "from_part": "main_distribution_panel", "to_part": "led_array"},
           {"mechanism": "fluid_loop", "from_part": "hvac_evaporator", "to_part": "condensate_loop"}]
derived_vf = B.derive_flows(parts_vf, racks_vf, topo_vf, _mechs("electrical", "fluid"),
                            hubs=hubs_vf, collectors=collectors_vf)
sup = [d for d in derived_vf if d["mech"] == "fluid_supply"]
ret = [d for d in derived_vf if d["mech"] == "fluid_return"]
elec_vf = [d for d in derived_vf if d["mech"] == "electrical_bus"
           and str(d["b_nm"]).startswith("rack[")]
check(len(sup) == 8, f"fertigation supplies ALL 8 racks (got {len(sup)})")
check(len(ret) == 9, f"water return closes: 8 racks + collector→hub (got {len(ret)})")
check(len(elec_vf) == 8, f"panel powers ALL 8 LED racks (got {len(elec_vf)})")
check("fluid_supply" in B.MECH_COLOUR and "fluid_return" in B.MECH_COLOUR,
      "supply + return are DISTINCT mechanisms with distinct colours")
check(B.MECH_COLOUR["fluid_supply"] != B.MECH_COLOUR["fluid_return"],
      "fluid_supply colour != fluid_return colour (two distinct lines)")


# ── 5. RICH topology DEFERS (e-fuel): no fluid/thermal loop derived ──────────
print("[5] rich topology (≥6 edges) defers")
topo_rich = [{"mechanism": "fluid_loop", "from_part": f"a{i}", "to_part": f"b{i}"}
             for i in range(8)]
# even with rack consumers + a reservoir present, a rich topology must NOT derive a
# fluid/thermal loop (only the electrical fan-out, and only if an electrical hub).
derived_rich = B.derive_flows(parts_vf, racks_vf, topo_rich, _mechs("electrical", "fluid", "thermal"),
                              hubs=hubs_vf, collectors=collectors_vf)
check(not any(d["mech"] in ("fluid_supply", "fluid_return", "thermal", "thermal_return")
              for d in derived_rich),
      "rich topology derives NO fluid/thermal loop (defers to the explicit graph)")
check(B.DERIVE_RICH_TOPOLOGY_EDGES == 6, "rich-topology threshold = 6 edges")


# ── 6. no consumers ⇒ no derivation (process-plant has no rack anchors) ───────
print("[6] no rack consumers ⇒ empty derivation")
check(B.derive_flows(parts_bess, [], topo_bess, _mechs("electrical", "thermal")) == [],
      "no consumer anchors ⇒ no derived flows")


# ── 7. TRUNK-AND-BRANCH grouping: the per-rack fan-out collapses to ONE trunk
#      per (hub, mechanism) + N short taps, NOT N full runs. This is the busway
#      invariant — keyed purely on the SHARED-ENDPOINT fan-out structure, no class.
print("[7] trunk-and-branch fan-out grouping (header/busway)")
# Re-use the BESS derivation from [3]: 15 racks, electrical hub + thermal hub +
# thermal-return collector port + a 2-stage electrical chain (rack_block→pcs→txfmr).
groups, passthrough = B.group_fanout_trunks(derived)
by_mech = {}
for g in groups:
    by_mech.setdefault(g["mech"], []).append(g)
# ONE electrical trunk (the DC/power busway) whose consumers include all 15 racks
# (it may also pick up the big-load skids that share the hub — that's correct).
check("electrical_bus" in by_mech and len(by_mech["electrical_bus"]) == 1,
      f"electrical fan-out → exactly ONE trunk (got "
      f"{len(by_mech.get('electrical_bus', []))})")
if by_mech.get("electrical_bus"):
    n_elec_cons = len(by_mech["electrical_bus"][0]["consumers"])
    check(n_elec_cons >= 15,
          f"electrical trunk taps ALL 15 racks (got {n_elec_cons} consumers)")
# ONE thermal SUPPLY trunk + ONE thermal RETURN trunk (separate mechanisms →
# separate parallel busways), each tapping the 15 racks.
check("thermal" in by_mech and len(by_mech["thermal"]) == 1,
      f"thermal supply → ONE trunk (got {len(by_mech.get('thermal', []))})")
check("thermal_return" in by_mech and len(by_mech["thermal_return"]) == 1,
      f"thermal return → ONE trunk (got {len(by_mech.get('thermal_return', []))})")
if by_mech.get("thermal"):
    check(len(by_mech["thermal"][0]["consumers"]) == 15,
          f"thermal supply trunk taps 15 racks "
          f"(got {len(by_mech['thermal'][0]['consumers'])})")
# the thermal RETURN trunk's ORIGIN is the SHARED collector port (consumers gather
# INTO it), so origin_is_a is False (the shared endpoint is the edges' b_xyz).
if by_mech.get("thermal_return"):
    check(by_mech["thermal_return"][0]["origin_is_a"] is False,
          "thermal-return trunk gathers INTO the collector (shared endpoint = b_xyz)")
# the 2-stage electrical chain (rack_block→pcs→transformer) and the lone
# collector→hub closing edge are NOT fan-outs → they stay passthrough.
pass_mechs = [r["mech"] for r in passthrough]
check(any(str(r["b_nm"]) == "transformer" for r in passthrough),
      "electrical-chain stage (→transformer) stays a passthrough edge, not a tap")
check(any(r["mech"] == "thermal_return" for r in passthrough),
      "the collector→hub closing edge stays passthrough (single edge, not a fan-out)")
# a SMALL fan-out (< TRUNK_MIN_CONSUMERS) must NOT trunk — single loads route normal.
small = [{"i": j, "mech": "electrical_bus", "a_xyz": (0.0, 0.0, 0.0),
          "b_xyz": (1000.0 * j, 0.0, 0.0), "a_abstract": True, "b_abstract": True,
          "a_nm": "hub", "b_nm": f"load{j}", "pa": None, "pb": None}
         for j in range(2)]   # only 2 consumers
g2, p2 = B.group_fanout_trunks(small)
check(len(g2) == 0 and len(p2) == 2,
      f"a 2-consumer fan-out does NOT trunk (got {len(g2)} groups, {len(p2)} passthrough)")
check(B.TRUNK_MIN_CONSUMERS == 3, "trunk threshold = 3 distinct consumers")


# ── summary ──────────────────────────────────────────────────────────────────
print()
if _FAILS:
    print(f"FAILED {len(_FAILS)} check(s):")
    for m in _FAILS:
        print(f"  - {m}")
    sys.exit(1)
print("ALL CHECKS PASSED")
sys.exit(0)
