#!/usr/bin/env python3
"""
Hunt, curate, and upload open-source robot STEP/STL files to the Forge's
step_templates library.

Sources (all open-source licensed):
  - ODRI (Open Dynamic Robot Initiative)  — BSD-3-Clause — actuators, legs, bipeds
  - OpenArm (enactic)                     — CERN-OHL-S-2.0 — 7DOF humanoid arm
  - Poppy Project / Robotis Library       — GPL-3.0 — Dynamixel servos & frames
  - mjbots quad                           — Apache-2.0 — quadruped, actuators
  - Unitree Qmini                         — BSD-3-Clause — humanoid robot
  - Legend Robot                           — MIT / CC — humanoid parts
  - MuJoCo Menagerie (Google DeepMind)    — Apache-2.0 — 60+ robot mesh models
  - Franka Robotics                       — Apache-2.0 — Panda arm meshes
  - Universal Robots                      — BSD-2-Clause — UR arm meshes
  - HROS1 3D Models (Interbotix)          — CC-BY-SA-4.0 — humanoid research robot

Usage:
  python scripts/hunt-robot-step-files.py [--dry-run] [--skip-clone]

Requires:
  SUPABASE_URL  — e.g. https://xxx.supabase.co
  SUPABASE_KEY  — service role key
  git           — for cloning repos
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
from dataclasses import dataclass, field, asdict

try:
    from supabase import create_client
except ImportError:
    print("Install supabase: pip install supabase")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # dotenv optional — env vars can be set externally

# ── Config ────────────────────────────────────────────────────────────

STAGING_DIR = Path(__file__).parent.parent / "data" / "robot-step-staging"
BUCKET = "xray-images"
STORAGE_PREFIX = "cad-lab/templates/robotics"
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
MIN_FILE_SIZE = 100               # Skip tiny/broken files
UPLOAD_DELAY = 0.3                # Seconds between uploads
MAX_PER_REPO = 30                 # Cap per source to avoid flooding

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


# ── Source repos ──────────────────────────────────────────────────────

@dataclass
class RepoSource:
    """A GitHub repository to hunt for robot STEP/STL files."""
    name: str
    url: str
    license: str
    subcategories: list[str] = field(default_factory=list)
    sparse_paths: list[str] | None = None  # Sparse checkout paths (None = full clone)
    depth: int = 1
    tags: list[str] = field(default_factory=list)


ROBOT_REPOS: list[RepoSource] = [
    # ── Actuators & Hardware ──────────────────────────────────
    RepoSource(
        name="odri-actuators",
        url="https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware.git",
        license="BSD-3-Clause",
        subcategories=["actuators", "legs", "bipeds"],
        tags=["actuator", "torque-controlled", "brushless", "odri", "legged"],
    ),

    # ── Robot Arms ────────────────────────────────────────────
    RepoSource(
        name="franka-description",
        url="https://github.com/frankaemika/franka_description.git",
        license="Apache-2.0",
        subcategories=["arms", "grippers"],
        tags=["arm", "panda", "franka", "7dof", "gripper", "collaborative"],
    ),
    RepoSource(
        name="universal-robots",
        url="https://github.com/UniversalRobots/Universal_Robots_ROS2_Description.git",
        license="BSD-2-Clause",
        subcategories=["arms", "industrial"],
        tags=["arm", "ur", "universal-robots", "6dof", "industrial", "collaborative"],
    ),
    RepoSource(
        name="cloudgripper",
        url="https://github.com/cloudgripper/cloudgripper-robot.git",
        license="MIT",
        subcategories=["arms", "grippers"],
        tags=["arm", "gripper", "cloud", "manipulation"],
    ),

    # ── Grippers ──────────────────────────────────────────────
    RepoSource(
        name="parallel-gripper",
        url="https://github.com/roboninecom/3D-Printed-Parallel-Gripper-for-Robotics-Arms.git",
        license="GPL-3.0",
        subcategories=["grippers"],
        tags=["gripper", "parallel", "3d-printed", "servo"],
    ),
    RepoSource(
        name="actuated-umi-gripper",
        url="https://github.com/actuated-umi/actuated-umi-gripper.git",
        license="MIT",
        subcategories=["grippers"],
        tags=["gripper", "umi", "manipulation", "3d-printed"],
    ),

    # ── Humanoids & Bipeds ────────────────────────────────────
    RepoSource(
        name="unitree-qmini",
        url="https://github.com/unitreerobotics/Qmini.git",
        license="BSD-3-Clause",
        subcategories=["humanoid", "bipeds"],
        tags=["humanoid", "biped", "unitree", "walking"],
    ),
    RepoSource(
        name="legend-robot",
        url="https://github.com/chris050200/legend-robot.git",
        license="MIT",
        subcategories=["humanoid", "bipeds"],
        tags=["humanoid", "biped", "open-source"],
    ),
    RepoSource(
        name="hros1-3d-models",
        url="https://github.com/Interbotix/HROS1-3D-Models.git",
        license="CC-BY-SA-4.0",
        subcategories=["humanoid"],
        tags=["humanoid", "research", "interbotix"],
    ),

    # ── Multi-robot aggregator (STL meshes from 60+ robots) ──
    RepoSource(
        name="mujoco-menagerie",
        url="https://github.com/google-deepmind/mujoco_menagerie.git",
        license="Apache-2.0",
        subcategories=["arms", "quadrupeds", "humanoid", "mobile", "grippers"],
        tags=["mujoco", "simulation", "deepmind"],
    ),
]


# ── Subcategory classification ────────────────────────────────────────

SUBCATEGORY_KEYWORDS: dict[str, list[str]] = {
    "actuators": ["motor", "actuator", "servo", "dynamixel", "driver", "module", "qdd", "moteus"],
    "arms": ["arm", "manipulator", "link", "joint", "shoulder", "elbow", "wrist", "forearm"],
    "grippers": ["gripper", "end_effector", "finger", "hand", "claw", "jaw", "grasp"],
    "legs": ["leg", "hip", "knee", "ankle", "thigh", "shin", "foot", "femur", "tibia"],
    "bipeds": ["biped", "bipedal", "humanoid_leg", "bolt"],
    "quadrupeds": ["quadruped", "quad", "a1", "spot", "anymal", "go1", "go2", "b1", "b2"],
    "humanoid": ["humanoid", "torso", "head", "body", "chest", "pelvis", "neck"],
    "mobile": ["mobile", "base", "wheel", "agv", "amr", "platform", "chassis"],
    "sensors": ["sensor", "camera", "lidar", "imu", "encoder", "depth"],
    "frames": ["frame", "bracket", "mount", "plate", "housing", "enclosure", "shell"],
    "electronics": ["pcb", "board", "controller", "battery", "power"],
}


def classify_subcategory(filepath: Path, repo_subcategories: list[str]) -> str:
    """Infer the best subcategory from the file path and name."""
    path_lower = str(filepath).lower()
    name_lower = filepath.stem.lower()

    for subcat, keywords in SUBCATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in path_lower or kw in name_lower:
                return subcat

    return repo_subcategories[0] if repo_subcategories else "general"


# ── Utilities ─────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    """Convert a filename to a URL-safe slug."""
    name = Path(name).stem
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[-\s]+", "-", name).strip("-")
    return name[:100]


def human_name(filename: str) -> str:
    """Convert 'Motor_Assembly_v2.step' → 'Motor Assembly v2'."""
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", name).strip()


def file_hash(filepath: Path) -> str:
    """MD5 prefix for deduplication."""
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:10]


def clone_repo(repo: RepoSource, staging: Path) -> Path | None:
    """Shallow-clone a repo into the staging directory."""
    dest = staging / repo.name
    if dest.exists():
        print(f"    Already cloned: {repo.name}")
        return dest

    cmd = ["git", "clone", "--depth", str(repo.depth), repo.url, str(dest)]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=True)
        return dest
    except subprocess.CalledProcessError as e:
        print(f"    WARN: Clone failed for {repo.name}: {e.stderr[:200]}")
        return None
    except subprocess.TimeoutExpired:
        print(f"    WARN: Clone timed out for {repo.name} (300s)")
        return None


def scan_repo(repo: RepoSource, repo_dir: Path) -> list[dict]:
    """Scan a cloned repo for STEP/STL/OBJ files and build template records."""
    extensions = ["*.step", "*.stp", "*.STEP", "*.STP", "*.stl", "*.STL", "*.obj", "*.OBJ"]
    all_files: list[Path] = []
    for ext in extensions:
        all_files.extend(repo_dir.rglob(ext))

    all_files.sort(key=lambda f: f.stat().st_size)

    templates = []
    seen_hashes: set[str] = set()

    for fp in all_files:
        try:
            size = fp.stat().st_size
        except OSError:
            continue

        if size > MAX_FILE_SIZE or size < MIN_FILE_SIZE:
            continue

        fh = file_hash(fp)
        if fh in seen_hashes:
            continue
        seen_hashes.add(fh)

        subcategory = classify_subcategory(fp, repo.subcategories)
        slug = f"robot-{repo.name}-{slugify(fp.name)}-{fh}"

        ext_lower = fp.suffix.lower()
        is_step = ext_lower in (".step", ".stp")

        templates.append({
            "slug": slug,
            "name": human_name(fp.name),
            "category": "robotics",
            "subcategory": subcategory,
            "source_repo": repo.name,
            "source_path": str(fp.relative_to(repo_dir)),
            "license": repo.license,
            "local_path": str(fp),
            "file_size_bytes": size,
            "tags": ["robotics", subcategory, *repo.tags],
            "is_assembly": "assembly" in fp.stem.lower() or "asm" in fp.stem.lower(),
            "is_step": is_step,
        })

        if len(templates) >= MAX_PER_REPO:
            break

    return templates


# MuJoCo Menagerie robot type classification based on directory name
MENAGERIE_CLASSIFICATION: dict[str, str] = {
    # Quadrupeds
    "anybotics_anymal_b": "quadrupeds",
    "anybotics_anymal_c": "quadrupeds",
    "boston_dynamics_spot": "quadrupeds",
    "google_barkour_v0": "quadrupeds",
    "google_barkour_vb": "quadrupeds",
    "unitree_a1": "quadrupeds",
    "unitree_go1": "quadrupeds",
    "unitree_go2": "quadrupeds",
    # Humanoids
    "agility_cassie": "bipeds",
    "apptronik_apollo": "humanoid",
    "berkeley_humanoid": "humanoid",
    "booster_t1": "humanoid",
    "fourier_n1": "humanoid",
    "pal_talos": "humanoid",
    "robotis_op3": "humanoid",
    "unitree_g1": "humanoid",
    "unitree_h1": "humanoid",
    "pndbotics_adam_lite": "humanoid",
    "toddlerbot_2xc": "humanoid",
    "toddlerbot_2xm": "humanoid",
    # Arms
    "arx_l5": "arms",
    "franka_emika_panda": "arms",
    "franka_fr3": "arms",
    "franka_fr3_v2": "arms",
    "kinova_gen3": "arms",
    "kuka_iiwa_14": "arms",
    "low_cost_robot_arm": "arms",
    "rethink_robotics_sawyer": "arms",
    "trossen_vx300s": "arms",
    "trossen_wx250s": "arms",
    "trossen_wxai": "arms",
    "trs_so_arm100": "arms",
    "ufactory_lite6": "arms",
    "ufactory_xarm7": "arms",
    "universal_robots_ur10e": "arms",
    "universal_robots_ur5e": "arms",
    "unitree_z1": "arms",
    "robotstudio_so101": "arms",
    "agilex_piper": "arms",
    "i2rt_yam": "arms",
    # Grippers & Hands
    "leap_hand": "grippers",
    "robotiq_2f85": "grippers",
    "robotiq_2f85_v4": "grippers",
    "shadow_hand": "grippers",
    "shadow_dexee": "grippers",
    "tetheria_aero_hand_open": "grippers",
    "umi_gripper": "grippers",
    "wonik_allegro": "grippers",
    # Mobile
    "aloha": "mobile",
    "google_robot": "mobile",
    "hello_robot_stretch": "mobile",
    "hello_robot_stretch_3": "mobile",
    "pal_tiago": "mobile",
    "pal_tiago_dual": "mobile",
    "stanford_tidybot": "mobile",
    # Drones / Aerial
    "bitcraze_crazyflie_2": "drones",
    "skydio_x2": "drones",
    # Actuators
    "dynamixel_2r": "actuators",
    # Sports / Education
    "robot_soccer_kit": "mobile",
}


def scan_menagerie(repo: RepoSource, repo_dir: Path) -> list[dict]:
    """
    Smart-sample from MuJoCo Menagerie: pick representative meshes per robot
    rather than dumping all 1,800+ files.
    """
    templates: list[dict] = []
    seen_hashes: set[str] = set()

    robot_dirs = sorted(
        [d for d in repo_dir.iterdir() if d.is_dir() and not d.name.startswith(".")],
        key=lambda d: d.name,
    )

    for robot_dir in robot_dirs:
        robot_name = robot_dir.name
        assets_dir = robot_dir / "assets"
        if not assets_dir.exists():
            continue

        subcategory = MENAGERIE_CLASSIFICATION.get(robot_name, "general")
        robot_label = robot_name.replace("_", " ").title()

        mesh_files = (
            list(assets_dir.glob("*.stl"))
            + list(assets_dir.glob("*.STL"))
            + list(assets_dir.glob("*.obj"))
            + list(assets_dir.glob("*.OBJ"))
        )

        # Pick up to 5 representative meshes per robot (smallest first for speed)
        mesh_files.sort(key=lambda f: f.stat().st_size)
        picked = 0
        for fp in mesh_files:
            try:
                size = fp.stat().st_size
            except OSError:
                continue

            if size > MAX_FILE_SIZE or size < MIN_FILE_SIZE:
                continue

            fh = file_hash(fp)
            if fh in seen_hashes:
                continue
            seen_hashes.add(fh)

            ext_lower = fp.suffix.lower()
            slug = f"robot-menagerie-{slugify(robot_name)}-{slugify(fp.name)}-{fh}"

            part_name = human_name(fp.name)
            display_name = f"{robot_label} — {part_name}"

            templates.append({
                "slug": slug,
                "name": display_name,
                "category": "robotics",
                "subcategory": subcategory,
                "source_repo": "mujoco-menagerie",
                "source_path": str(fp.relative_to(repo_dir)),
                "license": repo.license,
                "local_path": str(fp),
                "file_size_bytes": size,
                "tags": [
                    "robotics", subcategory, "mujoco", "simulation",
                    robot_name.replace("_", "-"),
                ],
                "is_assembly": False,
                "is_step": False,
            })
            picked += 1
            if picked >= 5:
                break

    return templates


def upload_template(sb, template: dict, retries: int = 3) -> dict | None:
    """Upload a single file to Supabase Storage and return the enriched record."""
    local_path = Path(template["local_path"])
    if not local_path.exists():
        return None

    ext = local_path.suffix.lower()
    mime_map = {
        ".step": "application/step",
        ".stp": "application/step",
        ".stl": "model/stl",
        ".obj": "application/octet-stream",
    }
    mime_type = mime_map.get(ext, "application/octet-stream")
    url_key = "step_url" if ext in (".step", ".stp") else "stl_url"

    storage_path = f"{STORAGE_PREFIX}/{template['subcategory']}/{template['slug']}{ext}"

    for attempt in range(retries):
        try:
            with open(local_path, "rb") as f:
                file_data = f.read()

            sb.storage.from_(BUCKET).upload(
                storage_path,
                file_data,
                file_options={"content-type": mime_type, "upsert": "true"},
            )
            public_url = sb.storage.from_(BUCKET).get_public_url(storage_path)
            template[url_key] = public_url
            time.sleep(UPLOAD_DELAY)
            return template

        except Exception as e:
            if attempt < retries - 1:
                time.sleep((attempt + 1) * 2)
            else:
                print(f"    FAIL upload {template['slug']}: {e}")
                return None


def seed_database(sb, templates: list[dict]) -> int:
    """Upsert template records into step_templates."""
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
            "tags": list(set(t.get("tags", []))),
            "is_assembly": t.get("is_assembly", False),
            "metadata": {"hunt_source": "robot-step-hunter-v1"},
        }
        rows.append(row)

    if not rows:
        return 0

    inserted = 0
    for i in range(0, len(rows), 50):
        chunk = rows[i : i + 50]
        try:
            sb.table("step_templates").upsert(chunk, on_conflict="slug").execute()
            inserted += len(chunk)
        except Exception as e:
            print(f"    WARN: DB upsert failed for chunk {i}: {e}")

    return inserted


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Hunt robot STEP/STL files from open-source repos")
    parser.add_argument("--dry-run", action="store_true", help="Scan only, don't upload or seed DB")
    parser.add_argument("--skip-clone", action="store_true", help="Skip cloning, use existing staging data")
    args = parser.parse_args()

    print("=" * 65)
    print("  Robot STEP File Hunter — Forge Template Library")
    print("=" * 65)
    print(f"\n  Sources: {len(ROBOT_REPOS)} repositories")
    print(f"  Staging: {STAGING_DIR}")

    if not args.dry_run:
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("\nERROR: Set SUPABASE_URL and SUPABASE_KEY env vars (or use --dry-run)")
            sys.exit(1)
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        sb = None

    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    # ── Phase 1: Clone repos ────────────────────────────────────

    print("\n[1/4] Cloning repositories...\n")

    cloned: dict[str, Path] = {}
    for repo in ROBOT_REPOS:
        print(f"  {repo.name} ({repo.url.split('/')[-1].replace('.git', '')})")
        if args.skip_clone:
            dest = STAGING_DIR / repo.name
            if dest.exists():
                cloned[repo.name] = dest
                print(f"    Using existing: {dest}")
            else:
                print(f"    Not found, skipping")
        else:
            dest = clone_repo(repo, STAGING_DIR)
            if dest:
                cloned[repo.name] = dest

    print(f"\n  Cloned: {len(cloned)}/{len(ROBOT_REPOS)} repos")

    # ── Phase 2: Scan for STEP/STL files ────────────────────────

    print("\n[2/4] Scanning for STEP/STL files...\n")

    all_templates: list[dict] = []
    stats: dict[str, dict] = {}

    for repo in ROBOT_REPOS:
        if repo.name not in cloned:
            continue

        if repo.name == "mujoco-menagerie":
            templates = scan_menagerie(repo, cloned[repo.name])
        else:
            templates = scan_repo(repo, cloned[repo.name])

        step_count = sum(1 for t in templates if t.get("is_step"))
        mesh_count = len(templates) - step_count

        stats[repo.name] = {
            "total": len(templates),
            "step": step_count,
            "stl_obj": mesh_count,
            "license": repo.license,
        }

        print(f"  {repo.name}: {len(templates)} files ({step_count} STEP, {mesh_count} STL/OBJ)")
        all_templates.extend(templates)

    # Deduplicate by slug
    seen_slugs: set[str] = set()
    unique: list[dict] = []
    for t in all_templates:
        if t["slug"] not in seen_slugs:
            seen_slugs.add(t["slug"])
            unique.append(t)
    all_templates = unique

    print(f"\n  Total unique files: {len(all_templates)}")

    # Subcategory breakdown
    subcat_counts: dict[str, int] = {}
    for t in all_templates:
        sc = t["subcategory"]
        subcat_counts[sc] = subcat_counts.get(sc, 0) + 1

    print("\n  Subcategory breakdown:")
    for sc, count in sorted(subcat_counts.items(), key=lambda x: -x[1]):
        print(f"    {sc}: {count}")

    # Save manifest
    manifest_path = STAGING_DIR / "robot-manifest.json"
    safe = [{k: v for k, v in t.items() if k != "local_path"} for t in all_templates]
    with open(manifest_path, "w") as f:
        json.dump({"stats": stats, "templates": safe}, f, indent=2)
    print(f"\n  Manifest: {manifest_path}")

    if args.dry_run:
        print("\n  [DRY RUN] Skipping upload and database seeding.")
        print("\n" + "=" * 65)
        print(f"  Scan complete: {len(all_templates)} robot files found")
        print("=" * 65)
        return

    # ── Phase 3: Upload to Supabase Storage ─────────────────────

    print(f"\n[3/4] Uploading {len(all_templates)} files to Supabase Storage...\n")

    uploaded: list[dict] = []
    failed = 0
    start = time.time()

    for i, template in enumerate(all_templates):
        result = upload_template(sb, template)
        if result:
            uploaded.append(result)
        else:
            failed += 1

        if (i + 1) % 10 == 0 or (i + 1) == len(all_templates):
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(
                f"  Progress: {i + 1}/{len(all_templates)} "
                f"({len(uploaded)} ok, {failed} failed, {rate:.1f}/sec)"
            )

    print(f"\n  Uploaded: {len(uploaded)}")
    print(f"  Failed:   {failed}")

    # ── Phase 4: Seed database ──────────────────────────────────

    print(f"\n[4/4] Seeding {len(uploaded)} records into step_templates...\n")

    inserted = seed_database(sb, uploaded)
    print(f"  Inserted/updated: {inserted} records")

    # ── Summary ─────────────────────────────────────────────────

    elapsed_total = time.time() - start
    print("\n" + "=" * 65)
    print("  DONE!")
    print(f"  Robot files uploaded:  {len(uploaded)}")
    print(f"  Database records:      {inserted}")
    print(f"  Upload failures:       {failed}")
    print(f"  Time:                  {elapsed_total:.0f}s")

    # Per-repo breakdown
    repo_uploaded: dict[str, int] = {}
    for t in uploaded:
        repo_uploaded[t["source_repo"]] = repo_uploaded.get(t["source_repo"], 0) + 1
    print("\n  Per-source:")
    for repo_name, count in sorted(repo_uploaded.items(), key=lambda x: -x[1]):
        print(f"    {repo_name}: {count}")

    print("=" * 65)


if __name__ == "__main__":
    main()
