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


# ── 5. RICH topology DEFERS when it is genuinely ROUTABLE (Codema/CO2-shaped): many
#      fluid/thermal edges whose BOTH endpoints are PLACED real parts — no
#      fluid/thermal loop is derived (only the always-on electrical fan-out). This
#      is the 2026-07-06 fix target: `rich` now counts ROUTABLE fluid/thermal edges
#      (resolve_endpoint + placed_xyz_mm on both ends), never the raw ledger length —
#      see [5b] for the BESS-shaped proveCatch this replaces (a mostly-electrical
#      ledger with unresolved fluid edges must NOT read as rich).
print("[5] rich topology (>=6 ROUTABLE fluid/thermal edges) defers")
# 9 distinct PLACED process-vessel-style parts chained into 8 genuinely-resolvable
# fluid/thermal edges — a real process-water/steam loop already drawn, Codema/CO2-
# shaped (their process_plant path resolves + routes every one of these directly).
_rich_chain = ["feed pump", "reactor vessel", "separator drum", "steam generator",
               "product cooler", "condensate tank", "return header",
               "storage vessel", "export pump"]
parts_richflow = [_part(nm, placed=(i * 1000.0, 0.0, 2000.0))
                  for i, nm in enumerate(_rich_chain)]
topo_rich = [{"mechanism": "fluid_loop" if i % 2 == 0 else "thermal",
              "from_part": _rich_chain[i], "to_part": _rich_chain[i + 1]}
             for i in range(8)]
check(B._n_routable_fluid_thermal_edges(topo_rich, parts_richflow) == 8,
      "all 8 chained edges are genuinely routable (both endpoints resolve + placed)")
# even with rack consumers + a reservoir present, a rich topology must NOT derive a
# fluid/thermal loop (only the electrical fan-out, and only if an electrical hub).
derived_rich = B.derive_flows(parts_richflow, racks_vf, topo_rich, _mechs("electrical", "fluid", "thermal"),
                              hubs=hubs_vf, collectors=collectors_vf)
check(not any(d["mech"] in ("fluid_supply", "fluid_return", "thermal", "thermal_return")
              for d in derived_rich),
      "rich topology derives NO fluid/thermal loop (defers to the explicit graph)")
check(B.DERIVE_RICH_TOPOLOGY_EDGES == 6, "rich-topology threshold = 6 edges")


# ── 5b. proveCatch — the exact BESS shape: a ledger DOMINATED by electrical_bus +
#      unresolved/rack-aggregate fluid_loop entries (mostly-electrical, few REAL
#      routable fluid edges) must NOT read as rich (the 2026-07-06 false-rich fix:
#      the OLD predicate counted raw len(explicit_topology) — 62 >= 6 would have
#      wrongly deferred and the coolant fan-out below would never have run). ──────
print("[5b] proveCatch: mostly-electrical ledger with unresolved fluid edges -> NOT rich")
parts_bess_shaped = [
    _part("DC busbar 1500 V", placed=(0.0, 0.0, 2400.0)),
    _part("liquid cooling chiller", placed=(6000.0, 1200.0, 2400.0)),
    # 'cold plate manifold' / 'expansion tank' deliberately UNPLACED — host-mounted
    # into a rack/BoP skid, exactly like the real BESS ledger (never given their own
    # placed_xyz_mm), so resolve_endpoint finds the Part but the routability gate
    # (placed_xyz_mm is not None) correctly fails it.
    _part("cold plate manifold"), _part("expansion tank"),
]
topo_bess_shaped = (
    # a big electrical_bus block of rack-aggregate candidates, like the real ledger.
    [{"mechanism": "electrical_bus", "from_part": "lfp_cell_string", "to_part": "dc_bus"}
     for _ in range(60)]
    # a handful of fluid_loop edges that never resolve to two PLACED parts — the
    # real BESS shape (chiller/tank -> the un-placed cold-plate manifold).
    + [{"mechanism": "fluid_loop", "from_part": "liquid cooling chiller",
        "to_part": "cold plate manifold"},
       {"mechanism": "fluid_loop", "from_part": "expansion tank",
        "to_part": "cold plate manifold"}]
)
check(len(topo_bess_shaped) >= B.DERIVE_RICH_TOPOLOGY_EDGES,
      f"raw ledger size alone ({len(topo_bess_shaped)}) would have been "
      f"'>= threshold' under the OLD buggy len()-based predicate")
check(B._n_routable_fluid_thermal_edges(topo_bess_shaped, parts_bess_shaped) == 0,
      "CATCH: zero genuinely-routable fluid/thermal edges (both fluid_loop edges "
      "name an unplaced manifold) — the OLD raw-length check would have wrongly "
      "called this ledger RICH")
derived_bess_shaped = B.derive_flows(
    parts_bess_shaped, racks[:3], topo_bess_shaped, _mechs("electrical", "thermal"),
    hubs={"thermal": ("chiller", (11000.0, 1500.0, 2400.0))})
check(any(d["mech"] == "thermal" for d in derived_bess_shaped),
      "CATCH: correctly NOT rich -> the thermal fan-out actually runs and derives "
      "chiller -> rack coolant drops (this is what was silently skipped on real BESS)")


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


# ── 7b. v12 CARRIED-CURRENT proveCatches (2026-07-05) — the three "no carried
#      current" Line & velocity rows that survived the a0308d864 join_power_demands
#      fix on a FRESH rack-farm rebuild: derive_flows()'s discrete big-load feeder
#      + the trunk-and-branch aggregation both synthesize edges AFTER
#      cl.finalize_ledger's join already ran, and the electrical-hub role here
#      resolves to a NON-part label ('bms_ctrl') rather than a placed busbar — the
#      exact shape that starved the fix on the real v12 artefacts. ────────────────
print("[7b] v12 carried-current catches: join reproduction + mint-site guard")
parts_v12 = [
    _part("DC busbar 1500 V", placed=(0.0, 0.0, 2400.0)),
    _part("liquid cooling chiller", placed=(6000.0, 1200.0, 2400.0)),
    _part("cold plate manifold", placed=(6000.0, -1200.0, 2400.0)),
]
# electrical hub resolves to the BMS-controller ROLE LABEL (not a placed part) —
# reproduces the real v12 shape where hubs['electrical'] is 'bms_ctrl'; the fluid
# hub resolves to the passive manifold itself (HUB_FLUID_SUPPLY_RE matches
# 'manifold' for the FLUID fan-out, but that does NOT make it a powered device).
hubs_v12 = {"electrical": ("bms_ctrl", (5000.0, -900.0, 2400.0)),
            "fluid": ("cold plate manifold", (6000.0, -1200.0, 2400.0))}
# explicit_topology carries (a) the dropped-at-the-ledger aggregate edge (both
# endpoints unresolvable against parts_v12 — exactly finalize_ledger's real
# "both-endpoints-unresolved" drop) so _RATING['electrical'] resolves to None,
# and (b) a REAL already-ESTABLISHED sibling demand for the chiller (as the
# ledger's own completion-closer would stamp), which the join must find + copy.
topo_v12 = [
    {"mechanism": "electrical_bus", "from_part": "lfp_cell_string", "to_part": "dc_bus"},
    {"mechanism": "electrical_bus", "from_part": "DC busbar 1500 V",
     "to_part": "liquid cooling chiller", "constraint_kind": "current_rating",
     "required_value": 12.0, "required_unit": "A"},
]
derived_v12 = B.derive_flows(parts_v12, [(1000.0, 0.0, 2400.0)], topo_v12,
                             _mechs("electrical"), hubs=hubs_v12)
chiller_d = next((d for d in derived_v12 if d.get("b_nm") == "liquid cooling chiller"), None)
check(chiller_d is not None and chiller_d.get("edge", {}).get("required_value") == 12.0,
      f"CATCH 1: bms_ctrl→chiller inherits the chiller's already-established demand "
      f"via join_power_demands (got {chiller_d.get('edge') if chiller_d else 'no edge'})")
manifold_d = next((d for d in derived_v12 if d.get("b_nm") == "cold plate manifold"), None)
check(manifold_d is None,
      "CATCH 2: no electrical tie minted to a passive fluid header with no power "
      "draw (mint-site guard — the row must not exist, never a fabricated current)")

# CATCH 3 — busway aggregation: a trunk grouped from REAL explicit ledger edges
# (each already carrying its OWN required_value; none has _share_edge's
# parent_total_value) must SUM its tributary taps rather than stay unsized.
real_taps = [
    {"i": 200 + j, "mech": "electrical_bus",
     "a_xyz": (0.0, 0.0, 2400.0), "b_xyz": (1000.0 * (j + 1), 0.0, 2400.0),
     "a_abstract": True, "b_abstract": True, "a_nm": "DC busbar 1500 V",
     "b_nm": f"tap{j}", "pa": None, "pb": None,
     "edge": {"from_part": "DC busbar 1500 V", "to_part": f"tap{j}",
              "mechanism": "electrical_bus", "constraint_kind": "current_rating",
              "required_value": 12.0, "required_unit": "A"}}
    for j in range(5)
]
g9, _p9 = B.group_fanout_trunks(real_taps)
check(len(g9) == 1, f"5 real explicit taps sharing an origin → ONE trunk (got {len(g9)})")
if g9:
    te = g9[0]["trunk_edge"]
    check(te is not None and te.get("required_value") == 60.0,
          f"CATCH 3: busway trunk sums its real tributary taps (5×12A=60A) — "
          f"got {te.get('required_value') if te else None}")
    check(te.get("to_part") == "(busway)", "busway trunk still targets the pseudo-node")
# NO-FABRICATION counter-case: a trunk whose taps carry no required_value at all
# (and no parent_total_value) must stay honestly None — never a guessed total.
unrated_taps = [
    {"i": 300 + j, "mech": "electrical_bus",
     "a_xyz": (0.0, 0.0, 2400.0), "b_xyz": (1000.0 * (j + 1), 0.0, 2400.0),
     "a_abstract": True, "b_abstract": True, "a_nm": "unrated hub",
     "b_nm": f"utap{j}", "pa": None, "pb": None,
     "edge": {"from_part": "unrated hub", "to_part": f"utap{j}",
              "mechanism": "electrical_bus"}}
    for j in range(4)
]
g10, _p10 = B.group_fanout_trunks(unrated_taps)
check(len(g10) == 1 and g10[0]["trunk_edge"] is not None
      and g10[0]["trunk_edge"].get("required_value") is None,
      "busway sum: an unrated fan-out stays honestly None (never fabricated)")


# ── 8. FLOW-LAYOUT region ordering (place_process_plant process train) ────────
#      flow_order_regions must (a) order the flow regions in CONNECTIVITY order so
#      directly-connected stages are ADJACENT, keeping each connected sub-chain
#      CONTIGUOUS (a disconnected upgrading→product chain is NOT interleaved with
#      the main feed→reaction→separation chain), and (b) push every NON-FLOW region
#      (control / instruments — touched by no flow edge) to the periphery. Keyed on
#      the connectivity graph, universal. Regression-harness rule 11 for the
#      2026-06-11 UNIVERSAL FLOW-LAYOUT.
print("[7c] BELOW-GRADE / GRAVITY-DRAIN routing (Sam Green SME review 2026-07-08) — "
      "ported from draw_pid.py::_is_below_grade_drain / draw_ga.py::_BELOW_GRADE_NAME_RE "
      "to the 3D scene: a gravity drain must route UNDERGROUND, never on the elevated "
      "pipe rack, and its below-grade collection point must sink into the slab.")
# proveCatch — a gravity-fed run into a below-grade collection point.
check(B._is_below_grade_drain_edge("toray_tm720d_400_ro_membrane", "drain_collection_sump", ""),
      "proveCatch: a run into a 'sump' node is flagged below-grade")
check(B._is_below_grade_drain_edge("floor_drain", "collection_tank", "gravity_fed_drainage"),
      "proveCatch: material_context explicitly saying 'gravity' is flagged below-grade "
      "even when the destination node name doesn't itself carry a pit noun")
check(B._is_below_grade_drain_edge("x", "5000L Concrete Drain Pit", ""),
      "proveCatch: a human-readable 'Drain Pit' name (not just a snake_case tag) matches "
      "the same noun signal build_part uses to sink the part")
check(B._is_below_grade_drain_edge("x", "Catch-Pit 3", ""),
      "proveCatch: 'catch-pit' / 'catch pit' spelling variants both match")
check(B._is_below_grade_drain_edge("drain_water_tank", "nursery_drain_collection_sump", ""),
      "proveCatch: drain_water_tank -> nursery_drain_collection_sump")
check(B._is_below_grade_drain_edge("cloth_filter", "drain_water_tank", ""),
      "proveCatch: cloth_filter -> drain_water_tank (destination is a drain collection vessel — no material_context required)")
# Sam J3 2026-07-09: dirty-side recovery filter → drain store is buried even when the
# destination is a galvanised drainwater tank (not only a sump/pit name).
check(B._is_below_grade_drain_edge("Nursery Cloth Filter", "Drain Water Tank", ""),
      "proveCatch: human-readable recovery filter → drain store is below-grade")
check(B._is_below_grade_drain_edge("cloth_filter", "drain_water_reservoir", ""),
      "proveCatch: cloth_filter → drain_water_reservoir (drain-store noun) is below-grade")
# proveNoFalsePositive — the excluded/negative cases (mirrors draw_pid_test.py G2c-e).
check(not B._is_below_grade_drain_edge("dosing_pump", "drain_collection_sump", ""),
      "proveNoFalsePositive: a dosing pump discharging into a sump stays above-ground")
check(not B._is_below_grade_drain_edge("drain_transfer_pump", "cip_tank", ""),
      "proveNoFalsePositive: a pump discharging into an ordinary tank stays above-ground")
check(not B._is_below_grade_drain_edge("submersible_lift_pump", "drain_collection_sump", ""),
      "proveNoFalsePositive: the RISEN discharge LEAVING a lift pump (source name carries "
      "'pump') is excluded even though the destination is a sump")
check(not B._is_below_grade_drain_edge("reverse_osmosis_skid", "cloth_filter", ""),
      "proveNoFalsePositive: an ordinary process-to-process edge (no pit/gravity signal) "
      "stays above-ground")
check(not B._is_below_grade_drain_edge("dc_busbar_800v", "rack_block_01", ""),
      "proveNoFalsePositive: an all-pressurised/electrical archetype (BESS-shaped names, "
      "no sump/pit/gravity noun anywhere) never trips below-grade")

# Plant-spanning fluid demotion (Codema 1538 / 1715 / vision-critic stray-pipe).
# Universal: plan-span geometry only (no below-grade noun exemption — 1715 class).
# proveCatch / proveNoFalsePositive.
try:
    B._selftest_plant_spanning_fluid_demote()
    check(True, "plant-spanning fluid demote selftest")
except AssertionError as _e:
    check(False, f"plant-spanning fluid demote selftest: {_e}")

# _route_below_grade: the underground leg must stay BELOW the ground-slab underside,
# never rise to the rack, and must still land exactly on both given endpoints.
_slab_underside = B.DECK_Z_MM - B.GROUND_SLAB_THICK_MM
_before_count = B._UNDERGROUND_RUN_COUNT
_a_xyz = (0.0, 0.0, 900.0)     # a normal above-slab source nozzle
_b_xyz = (5000.0, 0.0, -900.0)  # a sunk collection point's inlet
_wp = B._route_below_grade(_a_xyz, _b_xyz)
check(_wp[0] == _a_xyz and _wp[-1] == _b_xyz,
      "_route_below_grade: waypoints start/end exactly on the given source/destination")
check(all(p[2] <= _slab_underside + 1.0 for p in _wp[1:-1]),
      "_route_below_grade: every intermediate waypoint stays AT/BELOW the ground-slab "
      "underside (never detours up onto the elevated rack)")
check(B._UNDERGROUND_RUN_COUNT == _before_count + 1,
      "_route_below_grade: advances the per-scene stagger counter (so 2+ underground "
      "runs never share one trench elevation)")

# build_part's below-grade PART SINK: the same name-noun signal pushes the part's own
# base down so it sits sunk in the slab, top ≈ DECK_Z_MM, regardless of which vessel
# KIND it resolves to (tank vs a leg/skirt-supported column/vertical/reactor/bed —
# forcing "tank" avoids legs dangling below grade, see build_part's kind-override).
check(B._BELOW_GRADE_NAME_RE.search("Drain Collection Sump") is not None
      and B._BELOW_GRADE_NAME_RE.search("5000L Concrete Drain Pit") is not None,
      "proveCatch: both a 'sump' name and a human 'Drain Pit' name trip the part-sink signal")
check(B._BELOW_GRADE_NAME_RE.search("Reverse Osmosis Skid") is None
      and B._BELOW_GRADE_NAME_RE.search("DC Busbar 800V") is None,
      "proveNoFalsePositive: ordinary equipment names never trip the part-sink signal")


print("[8] flow_order_regions — process-train ordering + periphery split")


def _rpart(name, region_key, rank):
    """A Part carrying an explicit region_key + region_rank (what extract_parts
    sets from the module display name), for the region-ordering tests."""
    return B.Part(name, "mod", region_key, rank, "box", None, 1, "")


# An e-fuel-shaped design: M1 feed → M2 reaction → M3 separation (one chain), and a
# SEPARATE M4 upgrading → M6 product chain (no explicit M3→M4 edge), plus M5
# utilities fed by the reactor (thermal), and M7/M8 non-flow (control/instruments).
# GOTCHA: part names must resolve via token_overlap without a conflicting
# discriminator (e.g. topo "feed compressor" cannot land on "CO2 feed compressor"
# because candidate disc {co2} ∉ query → veto score 0). Use matching names.
flow_parts = [
    _rpart("feed compressor", "M1 Feed", 10),
    _rpart("synthesis reactor", "M2 Reaction", 20),
    _rpart("3-phase separator", "M3 Separation", 30),
    _rpart("fractionation column", "M4 Upgrading", 40),
    _rpart("waste-heat steam generator", "M5 Utilities", 60),
    _rpart("SAF storage tank", "M6 Storage", 50),
    _rpart("safety instrumented system", "M7 Control", 70),
    _rpart("pressure transmitters", "M8 Instruments", 70),
]
flow_topo = [
    {"mechanism": "fluid_loop", "from_part": "feed compressor", "to_part": "synthesis reactor"},
    {"mechanism": "fluid_loop", "from_part": "synthesis reactor", "to_part": "separator"},
    {"mechanism": "thermal", "from_part": "synthesis reactor", "to_part": "steam generator"},
    {"mechanism": "fluid_loop", "from_part": "fractionation column", "to_part": "storage tank"},
    # an electrical bus must NOT pull its endpoints into the flow train:
    {"mechanism": "electrical_bus", "from_part": "pressure transmitters", "to_part": "feed compressor"},
]
flow_regions, periphery = B.flow_order_regions(flow_parts, flow_topo)
idx = {rk: i for i, rk in enumerate(flow_regions)}
# (a) the non-flow control/instruments regions are in the PERIPHERY, not the train.
check("M7 Control" in periphery and "M8 Instruments" in periphery,
      "control + instruments (no flow edge) → periphery")
check("M7 Control" not in flow_regions and "M8 Instruments" not in flow_regions,
      "control + instruments NOT in the flow train")
# (b) the flow regions ARE the connected ones (M1,M2,M3,M4,M5,M6).
check(set(flow_regions) == {"M1 Feed", "M2 Reaction", "M3 Separation",
                            "M4 Upgrading", "M5 Utilities", "M6 Storage"},
      f"flow train = the 6 flow-connected regions (got {flow_regions})")
# (c) directly-connected stages are ADJACENT: feed next to reaction, reaction next
#     to separation, upgrading next to its product storage.
check(abs(idx["M1 Feed"] - idx["M2 Reaction"]) == 1,
      "feed compression adjacent to reaction")
check(abs(idx["M2 Reaction"] - idx["M3 Separation"]) == 1,
      "reaction adjacent to separation")
check(abs(idx["M4 Upgrading"] - idx["M6 Storage"]) == 1,
      "upgrading adjacent to its product storage")
# (d) the main feed→reaction→separation chain reads left→right in flow order.
check(idx["M1 Feed"] < idx["M2 Reaction"] < idx["M3 Separation"],
      "main train reads feed→reaction→separation left→right")
# (e) the disconnected M4→M6 chain stays CONTIGUOUS (not interleaved through the
#     main chain): no main-chain region sits BETWEEN M4 and M6.
lo, hi = sorted((idx["M4 Upgrading"], idx["M6 Storage"]))
between = [rk for rk, i in idx.items() if lo < i < hi]
check(between == [], f"upgrading→product chain is contiguous (nothing between: {between})")
# (f) electrical_bus is NOT a flow mechanism (its endpoints don't force the train).
check("electrical_bus" not in B._FLOW_MECHANISMS,
      "electrical_bus excluded from the flow-train mechanisms")
check("fluid_loop" in B._FLOW_MECHANISMS and "thermal" in B._FLOW_MECHANISMS,
      "fluid_loop + thermal ARE flow-train mechanisms")

# A design with NO usable flow edge (only an electrical star) → empty flow train,
# every region falls to periphery so the caller uses the rank fallback (no drop).
noflow_parts = [_rpart("inverter", "Power", 60), _rpart("controller", "Control", 70)]
noflow_topo = [{"mechanism": "electrical_bus", "from_part": "inverter", "to_part": "controller"}]
nf_flow, nf_periph = B.flow_order_regions(noflow_parts, noflow_topo)
check(nf_flow == [] and set(nf_periph) == {"Power", "Control"},
      "no flow edge ⇒ empty train + all regions to periphery (rank fallback, no drop)")


# ── PHASE D — the scene-builder schedule surfaces the iterative-feedback fields ──
# Drives the REAL write path (B._CONN_SPECS → B.write_connection_schedule) the way
# main() does, with three constructed runs at a tight volt-drop limit:
#   (1) an in-spec run — must NOT be upsized (no spurious response);
#   (2) a tripping run the ladder CAN fix — D1 auto-upsize (schedule.upsized[]);
#   (3) an excessive LV-reach run — D2 design recommendation (schedule.design_feedback[]).
# This guards the connection_sizing ↔ build_universal_scene wiring (the second file
# of the Phase-D change) so a future edit that drops design_feedback / upsized from
# the schedule is caught here, not by a visual inspection.
import os as _os
import tempfile as _tempfile
import shutil as _shutil
cs = B.cs
_saved_lim = _os.environ.get("CONN_VOLTDROP_LIMIT_PCT")
_tmpdir = _tempfile.mkdtemp(prefix="phaseD-sched-")
try:
    _os.environ["CONN_VOLTDROP_LIMIT_PCT"] = "1"   # tight, to force a trip
    B._CONN_SPECS.clear()
    # (1) in-spec: 1500 V bus, short — well within 1%.
    s_ok = cs.size_connection_to_spec(
        {"from_part": "string", "to_part": "dc_bus", "mechanism": "electrical_bus",
         "constraint_kind": "current_rating", "required_value": 400.0,
         "required_unit": "A", "material_context": "1500 V DC bus"}, 8.0)
    s_ok["run_name"] = "ok_run"
    B._CONN_SPECS.append(s_ok)
    # (2) D1-fixable trip: 48 V LV bus at 200 A over 60 m → trips 1%, ladder fixes it.
    s_d1 = cs.size_connection_to_spec(
        {"from_part": "rect", "to_part": "load", "mechanism": "electrical_bus",
         "constraint_kind": "current_rating", "required_value": 200.0,
         "required_unit": "A", "material_context": "48 V DC bus"}, 60.0)
    s_d1["run_name"] = "d1_run"
    B._CONN_SPECS.append(s_d1)
    # (3) D2 excessive reach: 48 V LV bus at 1500 A over 250 m → sub-distribution.
    s_d2 = cs.size_connection_to_spec(
        {"from_part": "pack", "to_part": "remote_load", "mechanism": "electrical_bus",
         "constraint_kind": "current_rating", "required_value": 1500.0,
         "required_unit": "A", "material_context": "48 V DC bus"}, 250.0)
    s_d2["run_name"] = "d2_run"
    B._CONN_SPECS.append(s_d2)
    _sched = B.write_connection_schedule(_tmpdir)
finally:
    B._CONN_SPECS.clear()
    _shutil.rmtree(_tmpdir, ignore_errors=True)
    if _saved_lim is None:
        _os.environ.pop("CONN_VOLTDROP_LIMIT_PCT", None)
    else:
        _os.environ["CONN_VOLTDROP_LIMIT_PCT"] = _saved_lim

_t = _sched["totals"]
check(_sched.get("voltdrop_limit_pct") == 1.0,
      "Phase D: schedule records the active volt-drop limit (the D3 env knob)")
check("design_feedback" in _sched and "upsized" in _sched,
      "Phase D: schedule carries design_feedback[] (D2) + upsized[] (D1)")
check(s_ok["upsized"] is False and s_ok["within_spec"] is True,
      "Phase D: in-spec run is NOT upsized (no spurious response)")
check(s_d1["upsized"] is True and s_d1["within_spec"] is True
      and s_d1["final_size_label"] != s_d1["original_size_label"],
      "Phase D: D1 auto-upsize grew the conductor + brought the run in-spec")
check(_t["runs_upsized"] >= 1 and any(u["run_name"] == "d1_run" for u in _sched["upsized"]),
      "Phase D: D1 upsize recorded in schedule.upsized[] with BEFORE→AFTER sizes")
check(bool(s_d2["design_recommendation"]),
      "Phase D: D2 emitted a design recommendation on the excessive-reach run")
check(_t["design_recommendations"] >= 1
      and any(d["run_name"] == "d2_run" for d in _sched["design_feedback"]),
      "Phase D: D2 recommendation recorded in schedule.design_feedback[]")
check(any(k in (_sched["design_feedback"][0]["recommendation"] or "").lower()
          for k in ("sub-distribution", "step-down", "relocate")),
      "Phase D: D2 recommendation proposes sub-distribution / step-down / relocate")



# ── summary ──────────────────────────────────────────────────────────────────
print()
if _FAILS:
    print(f"FAILED {len(_FAILS)} check(s):")
    for m in _FAILS:
        print(f"  - {m}")
    sys.exit(1)
print("ALL CHECKS PASSED")
print("[derive_flows] selftest OK")
sys.exit(0)
