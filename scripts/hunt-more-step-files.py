#!/usr/bin/env python3
"""
Hunt, download, and upload STEP/STL files from additional open-source repos.
Extends the existing library beyond KiCad, FreeCAD, NASA, and robotics repos.

Sources:
  - Open-source hardware projects on GitHub with mechanical CAD files
  - 3D printer parts, CNC components, drone frames, automation hardware
  - Scientific instruments, optical mounts, custom enclosures

Usage:
    python3 scripts/hunt-more-step-files.py [--dry-run] [--skip-clone]
"""

import os
import sys
import json
import hashlib
import re
import time
import subprocess
import argparse
from pathlib import Path
from dataclasses import dataclass

import requests as req

_env_local = Path(__file__).parent.parent / ".env.local"
if _env_local.exists():
    for line in _env_local.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        if k.strip() not in os.environ:
            os.environ[k.strip()] = v.strip().strip("'\"")

STAGING_DIR = Path(__file__).parent.parent / "data" / "extra-step-staging"
BUCKET = "xray-images"
STORAGE_PREFIX = "cad-lab/templates/community"
MAX_FILE_SIZE = 25 * 1024 * 1024
MIN_FILE_SIZE = 100
UPLOAD_DELAY = 0.3
MAX_PER_REPO = 50
LOG_FILE = Path(__file__).parent / "hunt_step_log.txt"

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

REPOS = [
    # 3D Printers & CNC
    {
        "url": "https://github.com/VoronDesign/Voron-2",
        "name": "voron-2",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Voron 2.4 CoreXY 3D printer — all printed & machined parts",
    },
    {
        "url": "https://github.com/VoronDesign/Voron-Trident",
        "name": "voron-trident",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Voron Trident 3D printer",
    },
    {
        "url": "https://github.com/VoronDesign/Voron-0",
        "name": "voron-0",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Voron 0 compact 3D printer",
    },
    {
        "url": "https://github.com/Klipper3d/klipper",
        "name": "klipper-parts",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Klipper firmware — includes mechanical parts for mounts",
    },
    {
        "url": "https://github.com/gnea/grbl",
        "name": "grbl-hardware",
        "category": "mechanical",
        "subcategory": "cnc-parts",
        "license": "GPL-3.0",
        "description": "GRBL CNC controller — hardware/mechanical parts",
    },
    # Drones
    {
        "url": "https://github.com/PX4/PX4-Autopilot",
        "name": "px4-autopilot",
        "category": "aerospace",
        "subcategory": "drones",
        "license": "BSD-3-Clause",
        "description": "PX4 flight controller — drone frame CAD files",
    },
    {
        "url": "https://github.com/ArduPilot/ardupilot",
        "name": "ardupilot",
        "category": "aerospace",
        "subcategory": "drones",
        "license": "GPL-3.0",
        "description": "ArduPilot autopilot — vehicle frame CAD files",
    },
    {
        "url": "https://github.com/betaflight/betaflight",
        "name": "betaflight",
        "category": "aerospace",
        "subcategory": "drones",
        "license": "GPL-3.0",
        "description": "Betaflight firmware — FC mount designs",
    },
    # Optical & Scientific
    {
        "url": "https://github.com/openUC2/UC2-GIT",
        "name": "openuc2",
        "category": "scientific",
        "subcategory": "optical-mounts",
        "license": "CERN-OHL-S-2.0",
        "description": "Open-source modular optical microscope toolbox",
    },
    {
        "url": "https://github.com/OpenFlexure/openflexure-microscope",
        "name": "openflexure",
        "category": "scientific",
        "subcategory": "microscopy",
        "license": "CERN-OHL-S-2.0",
        "description": "OpenFlexure microscope — 3D-printed flexure stage",
    },
    # Enclosures & Hardware
    {
        "url": "https://github.com/UltiMachine/Einsy-Retro",
        "name": "einsy-retro",
        "category": "electronics",
        "subcategory": "enclosures",
        "license": "GPL-3.0",
        "description": "Einsy Retro control board — enclosure designs",
    },
    {
        "url": "https://github.com/OLIMEX/OLINUXINO",
        "name": "olinuxino",
        "category": "electronics",
        "subcategory": "enclosures",
        "license": "GPL-3.0",
        "description": "Olimex OLinuXino — enclosure and mechanical designs",
    },
    # Automation & Actuators
    {
        "url": "https://github.com/OpenMachineTools/om-linear-actuator",
        "name": "om-linear-actuator",
        "category": "mechanical",
        "subcategory": "actuators",
        "license": "MIT",
        "description": "Open-source linear actuator designs",
    },
    {
        "url": "https://github.com/NiryoRobotics/niryo_one",
        "name": "niryo-one",
        "category": "mechanical",
        "subcategory": "robot-arms",
        "license": "GPL-3.0",
        "description": "Niryo One 6-axis robot arm — full mechanical CAD",
    },
    {
        "url": "https://github.com/michaelchua/open-source-biped",
        "name": "open-biped",
        "category": "mechanical",
        "subcategory": "humanoids",
        "license": "MIT",
        "description": "Open-source biped robot design",
    },
    # Hardware reference designs
    {
        "url": "https://github.com/raspberrypi/documentation",
        "name": "raspberry-pi-docs",
        "category": "electronics",
        "subcategory": "sbc-hardware",
        "license": "CC-BY-SA-4.0",
        "description": "Raspberry Pi mechanical drawings and models",
    },
    {
        "url": "https://github.com/openhwgroup/cva6",
        "name": "cva6-hardware",
        "category": "electronics",
        "subcategory": "processors",
        "license": "Apache-2.0",
        "description": "CVA6 RISC-V core — hardware reference models",
    },
    # Medical/Biomedical
    {
        "url": "https://github.com/e-nable/RaptorReloaded",
        "name": "e-nable-raptor",
        "category": "medical",
        "subcategory": "prosthetics",
        "license": "CC-BY-SA-4.0",
        "description": "e-NABLE Raptor Reloaded — 3D printable prosthetic hand with STL/CAD files",
    },
    {
        "url": "https://github.com/e-nable/Assembler",
        "name": "e-nable-assembler",
        "category": "medical",
        "subcategory": "prosthetics",
        "license": "CC-BY-SA-4.0",
        "description": "e-NABLE Assembler — OpenSCAD prosthetic hand designs",
    },
    # Farming & Agriculture
    {
        "url": "https://github.com/FarmBot-Docs/farmbot-genesis",
        "name": "farmbot-genesis",
        "category": "mechanical",
        "subcategory": "agricultural",
        "license": "CC-BY-SA-4.0",
        "description": "FarmBot Genesis documentation and CAD models",
    },
    # Additional open hardware
    {
        "url": "https://github.com/bigtreetech/BIGTREETECH-SKR-V1.3",
        "name": "btt-skr",
        "category": "electronics",
        "subcategory": "3d-printer-electronics",
        "license": "GPL-3.0",
        "description": "BigTreeTech SKR v1.3 — 3D printer controller board",
    },
    {
        "url": "https://github.com/Lulzbot/MOARstruder",
        "name": "lulzbot-extruder",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "LulzBot MOARstruder — large format extruder mechanical parts",
    },
    {
        "url": "https://github.com/RepRapLtd/RepRapFirmware",
        "name": "reprap-hardware",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "RepRap firmware — associated hardware reference designs",
    },
    {
        "url": "https://github.com/openbuilds/OpenBuildsPartLibrary",
        "name": "openbuilds-parts",
        "category": "mechanical",
        "subcategory": "extrusion-hardware",
        "license": "CC-BY-SA-4.0",
        "description": "OpenBuilds part library — V-slot extrusion, plates, and CNC parts",
    },
    {
        "url": "https://github.com/CapableRobot/CapableRobot_USBHub_Hardware",
        "name": "capable-robot-usb",
        "category": "electronics",
        "subcategory": "usb-hardware",
        "license": "CERN-OHL-P-2.0",
        "description": "Capable Robot USB Hub — enclosure and PCB mechanical designs",
    },
    {
        "url": "https://github.com/oshwmark/oshw-mark",
        "name": "oshw-examples",
        "category": "electronics",
        "subcategory": "open-hardware",
        "license": "CC0",
        "description": "OSHW reference designs with mechanical files",
    },
    {
        "url": "https://github.com/prusa3d/Original-Prusa-i3",
        "name": "prusa-i3",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Original Prusa i3 — full mechanical CAD for the MK2/MK3 printer",
    },
    {
        "url": "https://github.com/prusa3d/Prusa-Mendel",
        "name": "prusa-mendel",
        "category": "mechanical",
        "subcategory": "3d-printer-parts",
        "license": "GPL-3.0",
        "description": "Prusa Mendel — original RepRap-derived printer mechanics",
    },
    {
        "url": "https://github.com/DynamixelSDK/dynamixel_sdk",
        "name": "dynamixel-sdk",
        "category": "mechanical",
        "subcategory": "servo-actuators",
        "license": "Apache-2.0",
        "description": "Dynamixel SDK — servo motor mounting hardware",
    },
    {
        "url": "https://github.com/MillerRen/openarm",
        "name": "openarm",
        "category": "mechanical",
        "subcategory": "robot-arms",
        "license": "MIT",
        "description": "OpenArm — open-source 7DOF robotic arm with STEP files",
    },
]


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        print(line, flush=True)
    except (BrokenPipeError, OSError):
        pass
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def clone_repo(repo: dict, staging: Path) -> Path | None:
    target = staging / repo["name"]
    if target.exists():
        log(f"  Already cloned: {repo['name']}")
        return target

    log(f"  Cloning {repo['url']}...")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--filter=blob:limit=25m", repo["url"], str(target)],
            capture_output=True, text=True, timeout=300
        )
        if target.exists():
            log(f"  ✅ Cloned {repo['name']}")
            return target
        else:
            log(f"  ❌ Clone failed: {repo['name']}")
            return None
    except subprocess.TimeoutExpired:
        log(f"  ❌ Clone timed out: {repo['name']}")
        return None
    except Exception as e:
        log(f"  ❌ Clone error {repo['name']}: {e}")
        return None


def scan_repo(repo_dir: Path, repo: dict) -> list[dict]:
    extensions = {".step", ".stp", ".stl", ".STEP", ".STP", ".STL"}
    files = []
    seen_hashes = set()

    for ext in extensions:
        files.extend(repo_dir.rglob(f"*{ext}"))

    templates = []
    for f in sorted(files):
        if f.stat().st_size > MAX_FILE_SIZE or f.stat().st_size < MIN_FILE_SIZE:
            continue

        h = hashlib.md5()
        with open(f, "rb") as fh:
            for chunk in iter(lambda: fh.read(8192), b""):
                h.update(chunk)
        digest = h.hexdigest()[:12]

        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)

        name = f.stem.replace("_", " ").replace("-", " ")
        name = re.sub(r"\s+", " ", name).strip()
        slug_base = re.sub(r"[^\w\s-]", "", f.stem.lower())
        slug_base = re.sub(r"[-\s]+", "-", slug_base).strip("-")[:100]
        slug = f"{repo['name']}-{slug_base}-{digest}"

        ext_lower = f.suffix.lower()
        is_step = ext_lower in (".step", ".stp")

        templates.append({
            "slug": slug,
            "name": name,
            "category": repo["category"],
            "subcategory": repo["subcategory"],
            "source_repo": repo["name"],
            "source_path": str(f.relative_to(repo_dir)),
            "license": repo["license"],
            "local_path": str(f),
            "file_size_bytes": f.stat().st_size,
            "tags": [repo["category"], repo["subcategory"], repo["name"]],
            "is_assembly": False,
            "is_step": is_step,
        })

        if len(templates) >= MAX_PER_REPO:
            break

    return templates


def _rest_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def _storage_headers(content_type: str) -> dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }


def upload_and_seed(templates: list[dict], dry_run: bool = False) -> int:
    if dry_run:
        log(f"  [DRY RUN] Would upload {len(templates)} files")
        return len(templates)

    uploaded = 0
    for i, t in enumerate(templates):
        local_path = Path(t["local_path"])
        if not local_path.exists():
            continue

        ext = local_path.suffix.lower()
        if ext in (".step", ".stp"):
            mime_type = "application/step"
            url_key = "step_url"
        elif ext == ".stl":
            mime_type = "model/stl"
            url_key = "stl_url"
        else:
            continue

        storage_path = f"{STORAGE_PREFIX}/{t['category']}/{t['slug']}{ext}"

        with open(local_path, "rb") as fh:
            file_data = fh.read()

        r = req.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}",
            headers=_storage_headers(mime_type),
            data=file_data,
        )
        if r.status_code not in (200, 201):
            continue

        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"
        t[url_key] = public_url
        time.sleep(UPLOAD_DELAY)

        row = {
            "slug": t["slug"],
            "name": t["name"],
            "category": t["category"],
            "subcategory": t["subcategory"],
            "source_repo": t["source_repo"],
            "source_path": t["source_path"],
            "license": t["license"],
            "step_url": t.get("step_url"),
            "stl_url": t.get("stl_url"),
            "file_size_bytes": t.get("file_size_bytes"),
            "tags": t.get("tags", []),
            "is_assembly": t.get("is_assembly", False),
        }

        upsert_headers = _rest_headers()
        upsert_headers["Prefer"] = "resolution=merge-duplicates"
        r2 = req.post(
            f"{SUPABASE_URL}/rest/v1/step_templates",
            headers=upsert_headers,
            json=row,
        )
        if r2.status_code in (200, 201, 409):
            uploaded += 1
        else:
            log(f"    ⚠ DB insert failed {t['slug']}: HTTP {r2.status_code}")

        if uploaded % 20 == 0 and uploaded > 0:
            log(f"    📤 Uploaded {uploaded} files...")

    return uploaded


def main() -> None:
    parser = argparse.ArgumentParser(description="Hunt more STEP files from GitHub repos")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-clone", action="store_true")
    args = parser.parse_args()

    log("=" * 70)
    log("ForgeOS — Hunt Additional STEP/STL Files")
    log(f"Repos: {len(REPOS)} sources")
    log(f"Staging: {STAGING_DIR}")
    log("=" * 70)

    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        sys.exit(1)

    total_templates = []

    for repo in REPOS:
        log(f"\n--- {repo['name']} ({repo['category']}/{repo['subcategory']}) ---")

        if not args.skip_clone:
            repo_dir = clone_repo(repo, STAGING_DIR)
        else:
            repo_dir = STAGING_DIR / repo["name"]
            if not repo_dir.exists():
                log(f"  Skipped (not cloned)")
                continue

        if not repo_dir:
            continue

        templates = scan_repo(repo_dir, repo)
        step_count = sum(1 for t in templates if t.get("is_step"))
        stl_count = len(templates) - step_count
        log(f"  Found: {step_count} STEP, {stl_count} STL files")

        if templates:
            uploaded = upload_and_seed(templates, dry_run=args.dry_run)
            log(f"  Uploaded: {uploaded}")
            total_templates.extend(templates)

    log(f"\n{'='*70}")
    log(f"COMPLETE — {len(total_templates)} total files from {len(REPOS)} repos")
    log(f"{'='*70}")


if __name__ == "__main__":
    main()
