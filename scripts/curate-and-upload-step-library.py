#!/usr/bin/env python3
"""
Curate and upload STEP/STL template files from open-source repositories
to Supabase Storage + seed the step_templates database table.

Sources:
  - KiCad 3D Library (CC-BY-SA 4.0) — electronic components
  - FreeCAD Parts Library (LGPL) — mechanical, architectural, furniture
  - NASA 3D Resources (Public Domain) — aerospace models

Usage:
  python scripts/curate-and-upload-step-library.py

Requires env vars:
  SUPABASE_URL  — e.g. https://xxx.supabase.co
  SUPABASE_KEY  — service role key
"""

import os
import sys
import json
import hashlib
import re
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from supabase import create_client
except ImportError:
    print("Install supabase: pip install supabase")
    sys.exit(1)

STAGING_DIR = Path(__file__).parent.parent / "data" / "step-library-staging"
BUCKET = "xray-images"
STORAGE_PREFIX = "cad-lab/templates"
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB Supabase limit
MAX_TEMPLATES_PER_CATEGORY = 9999   # Small batch for proof of concept
CONCURRENT_UPLOADS = 2            # Sequential to avoid rate limits
UPLOAD_DELAY = 0.3                # Seconds between uploads

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── KiCad category mapping ──────────────────────────────────────────

KICAD_CATEGORY_MAP = {
    "Battery": ("electronics", "batteries"),
    "Buzzer_Beeper": ("electronics", "buzzers"),
    "Capacitor_SMD": ("electronics", "capacitors-smd"),
    "Capacitor_THT": ("electronics", "capacitors-tht"),
    "Connector_Audio": ("electronics", "connectors-audio"),
    "Connector_BarrelJack": ("electronics", "connectors-barrel-jack"),
    "Connector_Card": ("electronics", "connectors-card"),
    "Connector_Coaxial": ("electronics", "connectors-coaxial"),
    "Connector_Dsub": ("electronics", "connectors-dsub"),
    "Connector_FFC-FPC": ("electronics", "connectors-ffc-fpc"),
    "Connector_HDMI": ("electronics", "connectors-hdmi"),
    "Connector_IDC": ("electronics", "connectors-idc"),
    "Connector_Molex": ("electronics", "connectors-molex"),
    "Connector_Phoenix_MC": ("electronics", "connectors-phoenix"),
    "Connector_PinHeader": ("electronics", "connectors-pin-header"),
    "Connector_PinSocket": ("electronics", "connectors-pin-socket"),
    "Connector_RJ": ("electronics", "connectors-rj"),
    "Connector_USB": ("electronics", "connectors-usb"),
    "Connector_Wire": ("electronics", "connectors-wire"),
    "Crystal": ("electronics", "crystals-oscillators"),
    "Diode_SMD": ("electronics", "diodes-smd"),
    "Diode_THT": ("electronics", "diodes-tht"),
    "Fuse": ("electronics", "fuses"),
    "Heatsink": ("electronics", "heatsinks"),
    "Inductor_SMD": ("electronics", "inductors-smd"),
    "Inductor_THT": ("electronics", "inductors-tht"),
    "LED_SMD": ("electronics", "leds-smd"),
    "LED_THT": ("electronics", "leds-tht"),
    "Mounting_Wago": ("electronics", "mounting-hardware"),
    "OptoDevice": ("electronics", "opto-devices"),
    "Package_BGA": ("electronics", "packages-bga"),
    "Package_DFN_QFN": ("electronics", "packages-dfn-qfn"),
    "Package_DIP": ("electronics", "packages-dip"),
    "Package_LGA": ("electronics", "packages-lga"),
    "Package_QFP": ("electronics", "packages-qfp"),
    "Package_SIP": ("electronics", "packages-sip"),
    "Package_SO": ("electronics", "packages-so"),
    "Package_SON": ("electronics", "packages-son"),
    "Package_TO_SOT_SMD": ("electronics", "packages-to-sot-smd"),
    "Package_TO_SOT_THT": ("electronics", "packages-to-sot-tht"),
    "Potentiometer_SMD": ("electronics", "potentiometers"),
    "Potentiometer_THT": ("electronics", "potentiometers"),
    "Relay_SMD": ("electronics", "relays"),
    "Relay_THT": ("electronics", "relays"),
    "Resistor_SMD": ("electronics", "resistors-smd"),
    "Resistor_THT": ("electronics", "resistors-tht"),
    "Sensor_Pressure": ("electronics", "sensors"),
    "Switch_DIP": ("electronics", "switches"),
    "Switch_Tactile": ("electronics", "switches"),
    "Transformer_SMD": ("electronics", "transformers"),
    "Transformer_THT": ("electronics", "transformers"),
    "Varistor": ("electronics", "varistors"),
}

# ── FreeCAD category mapping ────────────────────────────────────────

FREECAD_CATEGORY_MAP = {
    "Architectural Parts": ("architectural", "general"),
    "Building Construction": ("architectural", "construction"),
    "Electrical Parts": ("electrical", "general"),
    "Electronics Components Kit": ("electronics", "general"),
    "Furniture": ("furniture", "general"),
    "Generic Objects": ("general", "objects"),
    "HVAC": ("mechanical", "hvac"),
    "Mechanical Parts": ("mechanical", "general"),
    "Piping": ("mechanical", "piping"),
    "Wood Construction": ("architectural", "wood"),
}


def slugify(name: str) -> str:
    """Convert a filename to a URL-safe slug."""
    name = Path(name).stem
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[-\s]+", "-", name).strip("-")
    return name[:120]


def human_name(filename: str) -> str:
    """Convert a filename like 'Connector_USB_C_Amphenol.step' to a human name."""
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    name = re.sub(r"\s+", " ", name).strip()
    return name


def file_hash(filepath: Path) -> str:
    """Quick hash for deduplication."""
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def scan_kicad(staging: Path) -> list[dict]:
    """Scan KiCad 3D library for STEP files."""
    kicad_dir = staging / "kicad-3d"
    if not kicad_dir.exists():
        print("  KiCad directory not found, skipping")
        return []

    templates = []
    seen_hashes = set()

    for lib_dir in sorted(kicad_dir.iterdir()):
        if not lib_dir.is_dir() or lib_dir.name.startswith("."):
            continue

        lib_name = lib_dir.name.replace(".3dshapes", "")
        category, subcategory = KICAD_CATEGORY_MAP.get(
            lib_name, ("electronics", lib_name.lower().replace("_", "-"))
        )

        step_files = list(lib_dir.glob("*.step")) + list(lib_dir.glob("*.stp"))
        count = 0

        for sf in sorted(step_files):
            if sf.stat().st_size > MAX_FILE_SIZE or sf.stat().st_size < 100:
                continue

            fh = file_hash(sf)
            if fh in seen_hashes:
                continue
            seen_hashes.add(fh)

            slug = f"kicad-{slugify(sf.name)}-{fh}"
            templates.append({
                "slug": slug,
                "name": human_name(sf.name),
                "category": category,
                "subcategory": subcategory,
                "source_repo": "kicad",
                "source_path": str(sf.relative_to(staging)),
                "license": "CC-BY-SA-4.0",
                "local_path": str(sf),
                "file_size_bytes": sf.stat().st_size,
                "tags": [category, subcategory, "kicad", "electronic-component"],
                "is_assembly": False,
            })
            count += 1
            if count >= MAX_TEMPLATES_PER_CATEGORY:
                break

    return templates


def scan_freecad(staging: Path) -> list[dict]:
    """Scan FreeCAD Parts Library for STEP files."""
    fc_dir = staging / "freecad-library"
    if not fc_dir.exists():
        print("  FreeCAD directory not found, skipping")
        return []

    templates = []
    seen_hashes = set()

    for category_dir in sorted(fc_dir.iterdir()):
        if not category_dir.is_dir() or category_dir.name.startswith("."):
            continue

        dir_name = category_dir.name
        category, subcategory = FREECAD_CATEGORY_MAP.get(
            dir_name, ("general", dir_name.lower().replace(" ", "-"))
        )

        step_files = list(category_dir.rglob("*.step")) + list(category_dir.rglob("*.stp"))
        count = 0

        for sf in sorted(step_files):
            if sf.stat().st_size > MAX_FILE_SIZE or sf.stat().st_size < 100:
                continue

            fh = file_hash(sf)
            if fh in seen_hashes:
                continue
            seen_hashes.add(fh)

            slug = f"freecad-{slugify(sf.name)}-{fh}"
            templates.append({
                "slug": slug,
                "name": human_name(sf.name),
                "category": category,
                "subcategory": subcategory,
                "source_repo": "freecad",
                "source_path": str(sf.relative_to(staging)),
                "license": "LGPL",
                "local_path": str(sf),
                "file_size_bytes": sf.stat().st_size,
                "tags": [category, subcategory, "freecad"],
                "is_assembly": False,
            })
            count += 1
            if count >= MAX_TEMPLATES_PER_CATEGORY:
                break

    return templates


def scan_nasa(staging: Path) -> list[dict]:
    """Scan NASA 3D Resources for STL/OBJ files."""
    nasa_dir = staging / "nasa-3d"
    if not nasa_dir.exists():
        print("  NASA directory not found, skipping")
        return []

    templates = []
    seen_hashes = set()

    model_files = (
        list(nasa_dir.rglob("*.stl"))
        + list(nasa_dir.rglob("*.STL"))
        + list(nasa_dir.rglob("*.obj"))
        + list(nasa_dir.rglob("*.step"))
        + list(nasa_dir.rglob("*.stp"))
    )

    for sf in sorted(model_files):
        if sf.stat().st_size > MAX_FILE_SIZE or sf.stat().st_size < 100:
            continue

        fh = file_hash(sf)
        if fh in seen_hashes:
            continue
        seen_hashes.add(fh)

        slug = f"nasa-{slugify(sf.name)}-{fh}"
        templates.append({
            "slug": slug,
            "name": human_name(sf.name),
            "category": "aerospace",
            "subcategory": "nasa",
            "source_repo": "nasa",
            "source_path": str(sf.relative_to(staging)),
            "license": "public-domain",
            "local_path": str(sf),
            "file_size_bytes": sf.stat().st_size,
            "tags": ["aerospace", "nasa", "space", "public-domain"],
            "is_assembly": False,
        })

        if len(templates) >= MAX_TEMPLATES_PER_CATEGORY:
            break

    return templates


def _upload_single_file(
    storage_path: str, local_path: Path, mime_type: str, retries: int = 3
) -> str | None:
    """Upload one file to Supabase Storage with retry. Returns public URL or None."""
    for attempt in range(retries):
        try:
            with open(local_path, "rb") as f:
                file_data = f.read()

            supabase.storage.from_(BUCKET).upload(
                storage_path,
                file_data,
                file_options={"content-type": mime_type, "upsert": "true"},
            )

            public_url = supabase.storage.from_(BUCKET).get_public_url(storage_path)
            time.sleep(UPLOAD_DELAY)
            return public_url

        except Exception as e:
            if attempt < retries - 1:
                wait = (attempt + 1) * 2
                time.sleep(wait)
            else:
                print(f"  WARN: Failed to upload {storage_path}: {e}")
                return None


def upload_template(template: dict, retries: int = 3) -> dict | None:
    """
    Upload a template's STEP (or STL/OBJ) file to Supabase Storage.
    Also uploads the companion STL if a pre-converted .stl exists
    alongside the STEP file (generated by batch-step-to-stl.py).
    """
    local_path = Path(template["local_path"])
    if not local_path.exists():
        return None

    ext = local_path.suffix.lower()

    # ── Upload the primary file ──────────────────────────────────
    if ext in (".step", ".stp"):
        mime_type = "application/step"
        url_key = "step_url"
    elif ext == ".stl":
        mime_type = "model/stl"
        url_key = "stl_url"
    elif ext == ".obj":
        mime_type = "application/octet-stream"
        url_key = "stl_url"
    else:
        return None

    storage_path = f"{STORAGE_PREFIX}/{template['category']}/{template['slug']}{ext}"
    url = _upload_single_file(storage_path, local_path, mime_type, retries)
    if not url:
        return None
    template[url_key] = url

    # ── Upload companion STL if STEP was the primary ─────────────
    # batch-step-to-stl.py writes a .stl next to each .step file
    if ext in (".step", ".stp"):
        companion_stl = local_path.with_suffix(".stl")
        if companion_stl.exists() and companion_stl.stat().st_size > 100:
            stl_storage_path = (
                f"{STORAGE_PREFIX}/{template['category']}/{template['slug']}.stl"
            )
            stl_url = _upload_single_file(
                stl_storage_path, companion_stl, "model/stl", retries
            )
            if stl_url:
                template["stl_url"] = stl_url

    return template


def seed_database(templates: list[dict]) -> int:
    """Insert template records into the step_templates table."""
    rows = []
    for t in templates:
        row = {
            "slug": t["slug"],
            "name": t["name"],
            "category": t["category"],
            "subcategory": t.get("subcategory"),
            "source_repo": t["source_repo"],
            "source_path": t["source_path"],
            "license": t["license"],
            "step_url": t.get("step_url"),
            "stl_url": t.get("stl_url"),
            "file_size_bytes": t.get("file_size_bytes"),
            "tags": t.get("tags", []),
            "is_assembly": t.get("is_assembly", False),
            "metadata": t.get("metadata", {}),
        }
        rows.append(row)

    if not rows:
        return 0

    # Batch upsert in chunks of 50
    inserted = 0
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        try:
            supabase.table("step_templates").upsert(
                chunk, on_conflict="slug"
            ).execute()
            inserted += len(chunk)
        except Exception as e:
            print(f"  WARN: DB upsert failed for chunk {i}: {e}")

    return inserted


def backfill_stl_urls():
    """
    Find templates in the DB that have step_url but no stl_url,
    look for companion .stl files locally, upload them, and update the DB.

    Usage:
      python scripts/curate-and-upload-step-library.py --backfill-stl
    """
    print("=" * 60)
    print("STEP Template Library — Backfill STL URLs")
    print("=" * 60)

    # Fetch templates missing stl_url
    result = (
        supabase.table("step_templates")
        .select("id, slug, category, step_url, source_path")
        .not_.is_("step_url", "null")
        .is_("stl_url", "null")
        .execute()
    )
    templates = result.data or []
    print(f"\n  Found {len(templates)} templates with step_url but no stl_url")

    if not templates:
        print("  Nothing to backfill.")
        return

    uploaded = 0
    skipped = 0

    for t in templates:
        # Find the local STEP file from source_path
        local_step = STAGING_DIR / t["source_path"]
        if not local_step.exists():
            skipped += 1
            continue

        companion_stl = local_step.with_suffix(".stl")
        if not companion_stl.exists() or companion_stl.stat().st_size < 100:
            skipped += 1
            continue

        stl_storage_path = (
            f"{STORAGE_PREFIX}/{t['category']}/{t['slug']}.stl"
        )
        stl_url = _upload_single_file(stl_storage_path, companion_stl, "model/stl")
        if not stl_url:
            skipped += 1
            continue

        # Update the DB row
        try:
            supabase.table("step_templates").update(
                {"stl_url": stl_url}
            ).eq("id", t["id"]).execute()
            uploaded += 1
        except Exception as e:
            print(f"  WARN: DB update failed for {t['slug']}: {e}")
            skipped += 1

        if uploaded % 25 == 0 and uploaded > 0:
            print(f"  Progress: {uploaded} updated, {skipped} skipped")

    print(f"\n  Updated: {uploaded}")
    print(f"  Skipped: {skipped}")
    print("=" * 60)


def main():
    # Check for --backfill-stl flag
    if "--backfill-stl" in sys.argv:
        backfill_stl_urls()
        return

    print("=" * 60)
    print("STEP Template Library — Curate & Upload")
    print("=" * 60)

    if not STAGING_DIR.exists():
        print(f"ERROR: Staging directory not found: {STAGING_DIR}")
        print("Run the download script first.")
        sys.exit(1)

    # ── Phase 1: Scan all sources ────────────────────────────────

    print("\n[1/3] Scanning repositories for STEP/STL files...\n")

    all_templates: list[dict] = []

    print("  Scanning KiCad 3D Library...")
    kicad = scan_kicad(STAGING_DIR)
    print(f"    Found {len(kicad)} templates")
    all_templates.extend(kicad)

    print("  Scanning FreeCAD Parts Library...")
    freecad = scan_freecad(STAGING_DIR)
    print(f"    Found {len(freecad)} templates")
    all_templates.extend(freecad)

    print("  Scanning NASA 3D Resources...")
    nasa = scan_nasa(STAGING_DIR)
    print(f"    Found {len(nasa)} templates")
    all_templates.extend(nasa)

    print(f"\n  Total templates to process: {len(all_templates)}")

    # Deduplicate by slug
    seen_slugs = set()
    unique = []
    for t in all_templates:
        if t["slug"] not in seen_slugs:
            seen_slugs.add(t["slug"])
            unique.append(t)
    all_templates = unique
    print(f"  After dedup: {len(all_templates)}")

    # Save manifest
    manifest_path = STAGING_DIR / "manifest.json"
    with open(manifest_path, "w") as f:
        safe_templates = [{k: v for k, v in t.items() if k != "local_path"} for t in all_templates]
        json.dump(safe_templates, f, indent=2)
    print(f"  Manifest saved to {manifest_path}")

    # Print category breakdown
    categories: dict[str, int] = {}
    for t in all_templates:
        cat = t["category"]
        categories[cat] = categories.get(cat, 0) + 1
    print("\n  Category breakdown:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"    {cat}: {count}")

    # ── Phase 2: Upload to Supabase Storage ──────────────────────

    print(f"\n[2/3] Uploading {len(all_templates)} files to Supabase Storage...\n")

    uploaded: list[dict] = []
    failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=CONCURRENT_UPLOADS) as pool:
        futures = {pool.submit(upload_template, t): t for t in all_templates}
        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result:
                uploaded.append(result)
            else:
                failed += 1

            if (i + 1) % 25 == 0 or (i + 1) == len(all_templates):
                elapsed = time.time() - start
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                print(f"  Progress: {i + 1}/{len(all_templates)} "
                      f"({len(uploaded)} ok, {failed} failed, "
                      f"{rate:.1f} files/sec)")

    print(f"\n  Uploaded: {len(uploaded)}")
    print(f"  Failed:   {failed}")

    # ── Phase 3: Seed database ───────────────────────────────────

    print(f"\n[3/3] Seeding {len(uploaded)} records into step_templates table...\n")

    inserted = seed_database(uploaded)
    print(f"  Inserted/updated: {inserted} records")

    # ── Summary ──────────────────────────────────────────────────

    print("\n" + "=" * 60)
    print("DONE!")
    print(f"  Templates uploaded: {len(uploaded)}")
    print(f"  Database records:   {inserted}")
    print(f"  Total time:         {time.time() - start:.0f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
