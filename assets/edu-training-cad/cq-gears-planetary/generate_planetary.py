"""Generate a reusable educational planetary gearset as STEP and STL.

Prefer the promoted forge-truth family when the CadQuery library path is
available; otherwise fall back to the upstream cq_gears example parameters.
"""

from pathlib import Path

import cadquery as cq


OUTPUT_DIR = Path(__file__).resolve().parent
REPO_ROOT = OUTPUT_DIR.parents[1]
FAMILY_MODULE = (
    REPO_ROOT / "Tier 1 and 2 parts for cad " / "tier2_motor_drivetrain.py"
)


def build_planetary_gearset() -> cq.Workplane:
    """Build the documented three-planet training example."""
    if FAMILY_MODULE.is_file():
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "tier2_motor_drivetrain", FAMILY_MODULE
        )
        if spec is not None and spec.loader is not None:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module.planetary_gearset({})

    from cq_gears import PlanetaryGearset

    gearset = PlanetaryGearset(
        module=1.0,
        sun_teeth_number=12,
        planet_teeth_number=18,
        width=10.0,
        rim_width=3.0,
        n_planets=3,
        bore_d=6.0,
    )
    return cq.Workplane("XY").gear(gearset)


def main() -> None:
    """Export deterministic boundary-representation and mesh artifacts."""
    model = build_planetary_gearset()
    cq.exporters.export(model, str(OUTPUT_DIR / "planetary_gearset.step"))
    cq.exporters.export(model, str(OUTPUT_DIR / "planetary_gearset.stl"))


if __name__ == "__main__":
    main()
