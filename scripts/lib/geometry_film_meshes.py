#!/usr/bin/env python3
"""Denser IR-driven film mesh library for Blender (geometry kernel slave).

Still parametric / role-based — never freehand placement. Improves film
readability over raw boxes while keeping poses from assembly.json.

Requires bpy (Blender). Pure helpers for role→recipe are bpy-free for selftest.
"""
from __future__ import annotations

import math
from typing import Any, Optional


def film_recipe(role: str, family: str, name: str = "") -> str:
    """Choose a film recipe id from role/family/name (universal nouns)."""
    r = (role or "").lower()
    f = (family or "").lower()
    n = (name or "").lower()
    if r == "vessel" or "vessel" in n or "vial" in n or "culture" in n:
        return "vessel_dish"
    if r == "motor" or "motor" in n or "ipmsm" in n or "rotor" in n:
        return "motor_pack"
    if r == "pcb" or f == "board" or "pcb" in n or "board" in n or "mcu" in n:
        return "pcb_board"
    if r == "vent" or "filter" in n or "vent" in n:
        return "vent_filter"
    if r == "pump" or "pump" in n or "peristaltic" in n:
        return "pump_body"
    if r == "thermal" or "heatsink" in n or "tec" in n or "peltier" in n:
        return "thermal_stack"
    if r == "sensor" or "sensor" in n or "probe" in n or "optical" in n:
        return "sensor_probe"
    if r == "enclosure" or f == "envelope" or "enclosure" in n or "housing" in n or "shell" in n:
        return "enclosure_beveled"
    if r == "inverter" or "inverter" in n or "sic" in n:
        return "inverter_box"
    if f == "cylinder" or f == "flange_port":
        return "cylinder_capped"
    return "box_beveled"


def _selftest() -> None:
    assert film_recipe("vessel", "cylinder", "Culture Vessel") == "vessel_dish"
    assert film_recipe("motor", "cylinder", "IPMSM") == "motor_pack"
    assert film_recipe("pcb", "board", "MCU board") == "pcb_board"
    assert film_recipe("enclosure", "envelope", "Shell") == "enclosure_beveled"
    assert film_recipe("part", "box", "Bracket") == "box_beveled"
    print("geometry_film_meshes selftest OK")


def build_film_object(
    *,
    name: str,
    recipe: str,
    origin_m: tuple[float, float, float],
    params_m: dict[str, float],
    rpy_deg: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """Create a denser bpy object at origin_m (metres). Returns the Object."""
    import bpy  # type: ignore
    import mathutils  # type: ignore

    ox, oy, oz = origin_m
    builders = {
        "vessel_dish": _build_vessel_dish,
        "motor_pack": _build_motor_pack,
        "pcb_board": _build_pcb_board,
        "vent_filter": _build_vent_filter,
        "pump_body": _build_pump_body,
        "thermal_stack": _build_thermal_stack,
        "sensor_probe": _build_sensor_probe,
        "enclosure_beveled": _build_enclosure_beveled,
        "inverter_box": _build_inverter_box,
        "cylinder_capped": _build_cylinder_capped,
        "box_beveled": _build_box_beveled,
    }
    fn = builders.get(recipe, _build_box_beveled)
    obj = fn(name=name, ox=ox, oy=oy, oz=oz, p=params_m)
    obj.rotation_euler = (
        math.radians(rpy_deg[0]),
        math.radians(rpy_deg[1]),
        math.radians(rpy_deg[2]),
    )
    # Presentation bevel when mesh
    if obj.type == "MESH":
        try:
            bev = obj.modifiers.new(name="film_bevel", type="BEVEL")
            extent = max(params_m.get("w", 0.02), params_m.get("d", 0.02), params_m.get("h", 0.02), params_m.get("dia", 0.02))
            bev.width = min(0.002, max(0.0003, extent * 0.03))
            bev.segments = 3
            try:
                bev.harden_normals = True
            except Exception:
                pass
        except Exception:
            pass
    return obj


def _link(obj, coll):
    import bpy

    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def _build_box_beveled(*, name, ox, oy, oz, p, coll=None):
    import bpy

    w = max(p.get("w", 0.02), 0.002)
    d = max(p.get("d", 0.02), 0.002)
    h = max(p.get("h", 0.015), 0.001)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w / 2, d / 2, h / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def _build_enclosure_beveled(*, name, ox, oy, oz, p, coll=None):
    # Slightly thicker shell read: main body + thin lid lip
    import bpy

    w = max(p.get("w", 0.1), 0.01)
    d = max(p.get("d", 0.08), 0.01)
    h = max(p.get("h", 0.05), 0.01)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h * 0.48))
    body = bpy.context.active_object
    body.name = name
    body.scale = (w / 2, d / 2, h * 0.48)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Lid plate
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h * 0.96))
    lid = bpy.context.active_object
    lid.name = name + "_lid"
    lid.scale = (w * 0.52, d * 0.52, h * 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Join lid into body for one object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    lid.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_vessel_dish(*, name, ox, oy, oz, p, coll=None):
    import bpy

    dia = max(p.get("dia", p.get("w", 0.03)), 0.005)
    ln = max(p.get("len", p.get("h", 0.05)), 0.01)
    r = dia / 2
    body_h = max(ln * 0.7, 0.005)
    # Cylinder body (bottom at oz)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r, depth=body_h, location=(ox, oy, oz + body_h / 2)
    )
    body = bpy.context.active_object
    body.name = name
    # Top dome
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=r, location=(ox, oy, oz + body_h), segments=24, ring_count=12
    )
    dome = bpy.context.active_object
    dome.name = name + "_dome"
    # Scale dome to half-height dome
    dome.scale = (1.0, 1.0, 0.55)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Boolean-ish join
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    dome.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_motor_pack(*, name, ox, oy, oz, p, coll=None):
    import bpy

    dia = max(p.get("dia", p.get("w", 0.08)), 0.02)
    ln = max(p.get("len", p.get("h", 0.1)), 0.03)
    r = dia / 2
    # Main stator can
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r, depth=ln * 0.75, location=(ox, oy, oz + ln * 0.5)
    )
    body = bpy.context.active_object
    body.name = name
    # Front endbell
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r * 0.92, depth=ln * 0.12, location=(ox, oy, oz + ln * 0.12)
    )
    e1 = bpy.context.active_object
    e1.name = name + "_eb1"
    # Rear endbell + shaft stub
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r * 0.92, depth=ln * 0.12, location=(ox, oy, oz + ln * 0.88)
    )
    e2 = bpy.context.active_object
    e2.name = name + "_eb2"
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r * 0.18, depth=ln * 0.2, location=(ox, oy, oz + ln * 1.05)
    )
    shaft = bpy.context.active_object
    shaft.name = name + "_shaft"
    bpy.ops.object.select_all(action="DESELECT")
    for o in (body, e1, e2, shaft):
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_pcb_board(*, name, ox, oy, oz, p, coll=None):
    import bpy

    w = max(p.get("w", 0.08), 0.02)
    d = max(p.get("d", 0.05), 0.015)
    h = max(p.get("h", 0.0016), 0.001)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h / 2))
    board = bpy.context.active_object
    board.name = name
    board.scale = (w / 2, d / 2, h / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Corner pads
    pad_r = min(w, d) * 0.04
    for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=pad_r,
            depth=h * 1.4,
            location=(ox + sx * w * 0.4, oy + sy * d * 0.4, oz + h * 0.7),
        )
        pad = bpy.context.active_object
        pad.name = f"{name}_pad"
        board.select_set(True)
        pad.select_set(True)
        bpy.context.view_layer.objects.active = board
        try:
            bpy.ops.object.join()
        except Exception:
            pass
        board = bpy.context.active_object
    return board


def _build_vent_filter(*, name, ox, oy, oz, p, coll=None):
    import bpy

    dia = max(p.get("dia", p.get("w", 0.03)), 0.01)
    ln = max(p.get("len", p.get("h", 0.02)), 0.008)
    r = dia / 2
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r, depth=ln * 0.6, location=(ox, oy, oz + ln * 0.4)
    )
    body = bpy.context.active_object
    body.name = name
    # Cap
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r * 1.05, depth=ln * 0.25, location=(ox, oy, oz + ln * 0.85)
    )
    cap = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    cap.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_pump_body(*, name, ox, oy, oz, p, coll=None):
    import bpy

    w = max(p.get("w", p.get("dia", 0.04)), 0.02)
    d = max(p.get("d", 0.03), 0.015)
    h = max(p.get("h", p.get("len", 0.04)), 0.02)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h * 0.4))
    body = bpy.context.active_object
    body.name = name
    body.scale = (w / 2, d / 2, h * 0.4)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=min(w, d) * 0.35, depth=h * 0.35, location=(ox, oy, oz + h * 0.85)
    )
    head = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_thermal_stack(*, name, ox, oy, oz, p, coll=None):
    import bpy

    w = max(p.get("w", 0.04), 0.015)
    d = max(p.get("d", 0.04), 0.015)
    h = max(p.get("h", 0.02), 0.008)
    # Base plate
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h * 0.15))
    base = bpy.context.active_object
    base.name = name
    base.scale = (w / 2, d / 2, h * 0.15)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Fins
    n_fins = 5
    for i in range(n_fins):
        fx = ox + (i / (n_fins - 1) - 0.5) * w * 0.8
        bpy.ops.mesh.primitive_cube_add(size=2, location=(fx, oy, oz + h * 0.55))
        fin = bpy.context.active_object
        fin.scale = (w * 0.04, d * 0.45, h * 0.4)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        base.select_set(True)
        fin.select_set(True)
        bpy.context.view_layer.objects.active = base
        try:
            bpy.ops.object.join()
        except Exception:
            pass
        base = bpy.context.active_object
    return base


def _build_sensor_probe(*, name, ox, oy, oz, p, coll=None):
    import bpy

    w = max(p.get("w", 0.012), 0.005)
    d = max(p.get("d", 0.012), 0.005)
    h = max(p.get("h", p.get("len", 0.03)), 0.01)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h * 0.25))
    body = bpy.context.active_object
    body.name = name
    body.scale = (w / 2, d / 2, h * 0.25)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=min(w, d) * 0.2, depth=h * 0.6, location=(ox, oy, oz + h * 0.7)
    )
    probe = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    probe.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.join()
    except Exception:
        pass
    return body


def _build_inverter_box(*, name, ox, oy, oz, p, coll=None):
    return _build_enclosure_beveled(name=name, ox=ox, oy=oy, oz=oz, p=p)


def _build_cylinder_capped(*, name, ox, oy, oz, p, coll=None):
    import bpy

    dia = max(p.get("dia", p.get("w", 0.03)), 0.005)
    ln = max(p.get("len", p.get("h", 0.04)), 0.008)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=dia / 2, depth=ln, location=(ox, oy, oz + ln / 2)
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


if __name__ == "__main__":
    _selftest()
