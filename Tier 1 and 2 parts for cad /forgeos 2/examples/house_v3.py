"""
ForgeOS Example — Generate a house using the BuildingGrammar
==============================================================

This is the reference example that proves the grammar framework works.
Run it to generate STEP, GLB, and STL files.

Usage:
    python examples/house_v3.py
    python examples/house_v3.py --format step glb stl
    python examples/house_v3.py --length 15000 --width 4000
"""

import sys
import os
import argparse

# Ensure project root is on the path (needed when running from examples/ directory)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from grammars.building import BuildingGrammar


def main():
    parser = argparse.ArgumentParser(description="Generate a house with ForgeOS")
    parser.add_argument("--length", type=float, help="Building length in mm")
    parser.add_argument("--width", type=float, help="Building width in mm")
    parser.add_argument("--ridge-height", type=float, help="Ridge height in mm")
    parser.add_argument("--pitch", type=float, help="Roof pitch in degrees")
    parser.add_argument("--no-loft", action="store_true", help="Omit loft floor")
    parser.add_argument("--format", nargs="+", default=["step", "glb"],
                        choices=["step", "glb", "stl"],
                        help="Export formats (default: step glb)")
    parser.add_argument("--output", default="house_v3", help="Output base name")
    args = parser.parse_args()

    # Build params from CLI args
    params = {}
    if args.length:
        params["length"] = args.length
    if args.width:
        params["width"] = args.width
    if args.ridge_height:
        params["ridge_height"] = args.ridge_height
    if args.pitch:
        params["roof_pitch_deg"] = args.pitch
    if args.no_loft:
        params["has_loft"] = False

    # Generate
    grammar = BuildingGrammar()
    print(f"Grammar: {grammar.display_name}")
    print(f"Parameters: {grammar.defaults() | params}")
    print()

    assembly, result = grammar.generate(params)
    print(result)
    print()

    if not result.passed:
        print("Build failed validation. Fix errors above.")
        sys.exit(1)

    # Export
    paths = grammar.export(assembly, args.output, formats=args.format)
    for fmt, path in paths.items():
        size = os.path.getsize(path)
        print(f"  {fmt.upper()}: {path} ({size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
