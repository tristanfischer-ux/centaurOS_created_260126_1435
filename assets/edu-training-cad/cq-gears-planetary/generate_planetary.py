"""Generate a reusable educational planetary gearset as STEP and STL."""

from pathlib import Path

import cadquery as cq
from cq_gears import PlanetaryGearset


OUTPUT_DIR = Path(__file__).resolve().parent


def build_planetary_gearset() -> cq.Workplane:
    """Build the upstream project's documented three-planet example."""
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
