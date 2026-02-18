#!/usr/bin/env python3
"""
Quick upload of diverse STEP/STL templates from all three sources.
Picks a representative sample across categories for proof of concept.
"""

import os
import sys
import hashlib
import re
import time
from pathlib import Path

from supabase import create_client

STAGING = Path(__file__).parent.parent / "data" / "step-library-staging"
BUCKET = "xray-images"
PREFIX = "cad-lab/templates"

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def slugify(name: str) -> str:
    name = Path(name).stem
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[-\s]+", "-", name).strip("-")
    return name[:100]


def human_name(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", name).strip()


def md5(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def upload(local_path: Path, slug: str, category: str) -> str | None:
    ext = local_path.suffix.lower()
    mime = {"step": "application/step", ".stp": "application/step",
            ".stl": "model/stl", ".obj": "application/octet-stream"}.get(ext, "application/step")
    storage_path = f"{PREFIX}/{category}/{slug}{ext}"

    for attempt in range(3):
        try:
            with open(local_path, "rb") as f:
                data = f.read()
            sb.storage.from_(BUCKET).upload(
                storage_path, data,
                file_options={"content-type": mime, "upsert": "true"}
            )
            url = sb.storage.from_(BUCKET).get_public_url(storage_path)
            time.sleep(0.5)
            return url
        except Exception as e:
            if attempt < 2:
                time.sleep((attempt + 1) * 3)
            else:
                print(f"  FAIL: {slug}: {e}")
                return None


def seed_row(template: dict) -> None:
    try:
        sb.table("step_templates").upsert(template, on_conflict="slug").execute()
    except Exception as e:
        print(f"  DB FAIL: {template['slug']}: {e}")


# ── Curated picks: FreeCAD ───────────────────────────────────────

FREECAD_PICKS = [
    ("Mechanical Parts/Bearings", "mechanical", "bearings"),
    ("Mechanical Parts/Fasteners", "mechanical", "fasteners"),
    ("Mechanical Parts/Profiles EN", "mechanical", "profiles"),
    ("Mechanical Parts/Automotive", "mechanical", "automotive"),
    ("Mechanical Parts/Enclosures", "mechanical", "enclosures"),
    ("Electrical Parts/Hotend", "electrical", "hotend"),
    ("Electrical Parts/Electrical Switches", "electrical", "switches"),
    ("Electrical Parts/Stepper Motors", "electrical", "motors"),
    ("HVAC", "hvac", "general"),
    ("Architectural Parts", "architectural", "general"),
    ("Robots", "robotics", "general"),
    ("Hydraulics", "mechanical", "hydraulics"),
    ("Pipes and tubes", "mechanical", "piping"),
    ("Industrial Design", "industrial", "general"),
    ("Computing", "electronics", "computing"),
    ("Medical Parts", "medical", "general"),
    ("Generic objects", "general", "objects"),
    ("Sports", "consumer", "sports"),
    ("Logistics", "industrial", "logistics"),
]

# ── Curated picks: NASA ─────────────────────────────────────────

NASA_PICKS = [
    "Beam Waveguide Deep Space Station Antenna",
    "Galileo",
    "Ka-Band Satellite Beacon Receiver",
    "Hubble Space Telescope",
    "Mars Curiosity Rover",
    "James Webb Space Telescope",
    "International Space Station",
    "Space Shuttle",
    "Apollo",
    "Voyager",
    "SLS",
    "Orion",
    "Mars 2020",
    "Cassini",
    "Juno",
    "Perseverance",
    "Ingenuity",
    "OSIRIS-REx",
    "Parker Solar Probe",
    "Europa Clipper",
]


def process_freecad():
    fc = STAGING / "freecad-library"
    if not fc.exists():
        print("FreeCAD not found, skipping")
        return 0

    count = 0
    for subdir, category, subcategory in FREECAD_PICKS:
        target = fc / subdir
        if not target.exists():
            continue

        files = list(target.rglob("*.step")) + list(target.rglob("*.stp"))
        if not files:
            continue

        # Pick first 3 smallest files (faster upload)
        files.sort(key=lambda f: f.stat().st_size)
        for f in files[:3]:
            if f.stat().st_size > 15_000_000 or f.stat().st_size < 100:
                continue

            h = md5(f)
            slug = f"freecad-{slugify(f.name)}-{h}"
            name = human_name(f.name)

            print(f"  Uploading: {name} ({category}/{subcategory})")
            url = upload(f, slug, category)
            if url:
                seed_row({
                    "slug": slug,
                    "name": name,
                    "category": category,
                    "subcategory": subcategory,
                    "source_repo": "freecad",
                    "source_path": str(f.relative_to(STAGING)),
                    "license": "LGPL",
                    "step_url": url,
                    "file_size_bytes": f.stat().st_size,
                    "tags": [category, subcategory, "freecad"],
                    "is_assembly": False,
                })
                count += 1

    return count


def process_nasa():
    nasa = STAGING / "nasa-3d"
    if not nasa.exists():
        print("NASA not found, skipping")
        return 0

    count = 0
    for keyword in NASA_PICKS:
        matches = list(nasa.rglob(f"*{keyword}*/*.stl")) + list(nasa.rglob(f"*{keyword}*/*.STL"))
        if not matches:
            matches = list(nasa.rglob(f"*{keyword}*.stl")) + list(nasa.rglob(f"*{keyword}*.STL"))
        if not matches:
            continue

        # Pick first 2 smallest
        matches.sort(key=lambda f: f.stat().st_size)
        for f in matches[:2]:
            if f.stat().st_size > 15_000_000 or f.stat().st_size < 100:
                continue

            h = md5(f)
            slug = f"nasa-{slugify(f.name)}-{h}"
            name = human_name(f.name)

            parent_name = f.parent.name if f.parent != nasa else "general"

            print(f"  Uploading: {name} (aerospace/nasa)")
            url = upload(f, slug, "aerospace")
            if url:
                seed_row({
                    "slug": slug,
                    "name": name,
                    "category": "aerospace",
                    "subcategory": slugify(parent_name),
                    "source_repo": "nasa",
                    "source_path": str(f.relative_to(STAGING)),
                    "license": "public-domain",
                    "stl_url": url,
                    "file_size_bytes": f.stat().st_size,
                    "tags": ["aerospace", "nasa", "space", "public-domain", slugify(parent_name)],
                    "is_assembly": False,
                })
                count += 1

    return count


def main():
    print("=" * 60)
    print("Quick Diverse Template Upload")
    print("=" * 60)

    total = 0

    print("\n[1/2] FreeCAD (mechanical, electrical, architectural)...\n")
    fc_count = process_freecad()
    total += fc_count
    print(f"\n  FreeCAD: {fc_count} uploaded\n")

    print("[2/2] NASA (aerospace)...\n")
    nasa_count = process_nasa()
    total += nasa_count
    print(f"\n  NASA: {nasa_count} uploaded\n")

    print("=" * 60)
    print(f"DONE! Uploaded {total} new templates")
    print(f"  FreeCAD: {fc_count}")
    print(f"  NASA:    {nasa_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
