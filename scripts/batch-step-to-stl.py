#!/usr/bin/env python3
"""
Batch STEP → STL Converter
===========================

Converts all STEP files in the staging directory to STL so they can be
served directly in the browser's 3D viewer without a Modal round-trip.

CadQuery tessellates the B-rep geometry into triangle meshes (STL).
Each .step file gets a companion .stl written alongside it.

Usage:
  # Install CadQuery first (one-time):
  conda install -c conda-forge cadquery

  # Convert all STEP files:
  python scripts/batch-step-to-stl.py

  # Dry-run (count files, don't convert):
  python scripts/batch-step-to-stl.py --dry-run

  # Convert specific subdirectory:
  python scripts/batch-step-to-stl.py --source data/step-library-staging/freecad-library

  # Adjust mesh tolerance (lower = finer mesh, bigger file):
  python scripts/batch-step-to-stl.py --tolerance 0.05

  # Force re-convert even if STL already exists:
  python scripts/batch-step-to-stl.py --force
"""

import argparse
import os
import sys
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

DEFAULT_STAGING = Path(__file__).parent.parent / "data" / "step-library-staging"
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB — skip huge assemblies


def convert_one(step_path: str, tolerance: float, force: bool) -> dict:
    """
    Convert a single STEP file to STL.

    Runs in a subprocess via ProcessPoolExecutor so CadQuery import
    happens per-worker (avoids OCC threading issues).

    Returns dict with keys: step_path, stl_path, success, error, elapsed_ms, stl_size_bytes.
    """
    step_path = Path(step_path)
    stl_path = step_path.with_suffix(".stl")

    if stl_path.exists() and not force:
        return {
            "step_path": str(step_path),
            "stl_path": str(stl_path),
            "success": True,
            "skipped": True,
            "error": None,
            "elapsed_ms": 0,
            "stl_size_bytes": stl_path.stat().st_size,
        }

    t0 = time.monotonic()
    try:
        import cadquery as cq

        shape = cq.importers.importStep(str(step_path))
        cq.exporters.export(shape, str(stl_path), exportType="STL", tolerance=tolerance)

        elapsed = int((time.monotonic() - t0) * 1000)
        return {
            "step_path": str(step_path),
            "stl_path": str(stl_path),
            "success": True,
            "skipped": False,
            "error": None,
            "elapsed_ms": elapsed,
            "stl_size_bytes": stl_path.stat().st_size,
        }
    except Exception as e:
        elapsed = int((time.monotonic() - t0) * 1000)
        return {
            "step_path": str(step_path),
            "stl_path": str(stl_path),
            "success": False,
            "skipped": False,
            "error": str(e)[:300],
            "elapsed_ms": elapsed,
            "stl_size_bytes": 0,
        }


def collect_step_files(source_dir: Path) -> list[Path]:
    """Recursively find all STEP files under a directory."""
    extensions = {".step", ".stp", ".STEP", ".STP"}
    files = []
    for ext in extensions:
        files.extend(source_dir.rglob(f"*{ext}"))
    # Deduplicate (case-insensitive filesystems) and filter by size
    seen = set()
    unique = []
    for f in sorted(files):
        resolved = f.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if f.stat().st_size > MAX_FILE_SIZE:
            continue
        if f.stat().st_size < 100:
            continue
        unique.append(f)
    return unique


def main():
    parser = argparse.ArgumentParser(description="Batch STEP → STL converter")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_STAGING,
        help=f"Source directory (default: {DEFAULT_STAGING})",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.1,
        help="STL mesh tolerance in mm (default: 0.1, lower = finer mesh)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Parallel worker processes (default: 4)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-convert even if STL already exists",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count files without converting",
    )
    args = parser.parse_args()

    if not args.source.exists():
        print(f"ERROR: Source directory not found: {args.source}")
        sys.exit(1)

    # Verify CadQuery is available before spawning workers
    if not args.dry_run:
        try:
            import cadquery  # noqa: F401
        except ImportError:
            print("ERROR: CadQuery not installed.")
            print("Install via: conda install -c conda-forge cadquery")
            sys.exit(1)

    print("=" * 60)
    print("STEP → STL Batch Converter")
    print("=" * 60)
    print(f"  Source:    {args.source}")
    print(f"  Tolerance: {args.tolerance} mm")
    print(f"  Workers:   {args.workers}")
    print(f"  Force:     {args.force}")

    step_files = collect_step_files(args.source)
    print(f"\n  Found {len(step_files)} STEP files")

    if args.dry_run:
        already_have_stl = sum(1 for f in step_files if f.with_suffix(".stl").exists())
        need_conversion = len(step_files) - already_have_stl
        total_size_mb = sum(f.stat().st_size for f in step_files) / (1024 * 1024)
        print(f"  Already have STL: {already_have_stl}")
        print(f"  Need conversion:  {need_conversion}")
        print(f"  Total STEP size:  {total_size_mb:.1f} MB")
        print("\n  (Dry run — no files converted)")
        return

    if not step_files:
        print("  No STEP files to convert.")
        return

    # Convert in parallel
    print(f"\n  Converting {len(step_files)} files...\n")
    start = time.time()
    converted = 0
    skipped = 0
    failed = 0
    total_stl_bytes = 0

    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(convert_one, str(f), args.tolerance, args.force): f
            for f in step_files
        }
        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result["success"]:
                if result["skipped"]:
                    skipped += 1
                else:
                    converted += 1
                total_stl_bytes += result["stl_size_bytes"]
            else:
                failed += 1
                print(f"  FAIL: {Path(result['step_path']).name}: {result['error']}")

            done = i + 1
            if done % 50 == 0 or done == len(step_files):
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                print(
                    f"  Progress: {done}/{len(step_files)} "
                    f"({converted} converted, {skipped} skipped, {failed} failed, "
                    f"{rate:.1f} files/sec)"
                )

    elapsed = time.time() - start
    stl_mb = total_stl_bytes / (1024 * 1024)

    print("\n" + "=" * 60)
    print("DONE!")
    print(f"  Converted: {converted}")
    print(f"  Skipped:   {skipped} (STL already exists)")
    print(f"  Failed:    {failed}")
    print(f"  Total STL: {stl_mb:.1f} MB")
    print(f"  Time:      {elapsed:.0f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
