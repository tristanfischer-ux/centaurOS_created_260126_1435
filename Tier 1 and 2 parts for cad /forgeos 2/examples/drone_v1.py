"""
ForgeOS Example — Generate a drone using the DroneGrammar
==========================================================

Usage:
    python examples/drone_v1.py
    python examples/drone_v1.py --format step glb stl
    python examples/drone_v1.py --prop-size 3 --motor 1404
    python examples/drone_v1.py --prop-size 7 --motor 2806 --material 3d_print_petg
"""

import sys
import os
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from grammars.drone import DroneGrammar


def main():
    parser = argparse.ArgumentParser(description="Generate a drone with ForgeOS")
    parser.add_argument("--prop-size", type=float, help="Prop size in inches (3/5/7)")
    parser.add_argument("--motor", type=str, help="Motor size (1404/2004/2207/2306/2806)")
    parser.add_argument("--material", type=str, help="Frame material (carbon_fibre/3d_print_tpu/3d_print_petg)")
    parser.add_argument("--config", type=str, help="Config type (true_x/stretch_x)")
    parser.add_argument("--format", nargs="+", default=["step", "glb"],
                        help="Export formats (step glb stl)")
    parser.add_argument("--output", type=str, default="drone_v1",
                        help="Output base filename")
    args = parser.parse_args()

    grammar = DroneGrammar()
    params = {}
    if args.prop_size: params["prop_size_inch"] = args.prop_size
    if args.motor: params["motor_size"] = args.motor
    if args.material: params["frame_material"] = args.material
    if args.config: params["config_type"] = args.config

    print(f"Grammar: {grammar.display_name}")
    print(f"Parameters: {params or 'defaults'}")

    assembly, result = grammar.generate(params)
    print(f"\n{result}")

    if not result.passed:
        print("\nBuild failed — check parameters.")
        sys.exit(1)

    paths = grammar.export(assembly, args.output, formats=args.format)
    print()
    for fmt, path in paths.items():
        size_kb = os.path.getsize(path) / 1024
        print(f"  {fmt.upper()}: {path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
