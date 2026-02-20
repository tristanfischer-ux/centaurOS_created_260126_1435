#!/usr/bin/env python3
"""
Generate PNG thumbnail images for STEP/STL templates and upload to Supabase.

Downloads STL files from Supabase Storage, renders an isometric view using
trimesh + matplotlib (pure software rendering — no GPU needed), uploads
the PNG to Supabase Storage, and updates thumbnail_url in the database.

Resume-safe: only processes rows where thumbnail_url IS NULL and stl_url
IS NOT NULL. Re-running picks up where it left off.

Designed for Mac Studio — uses multiprocessing to saturate all cores.

Usage:
  pip install trimesh matplotlib numpy supabase requests Pillow
  python scripts/generate-template-thumbnails.py

  # Render only a specific category:
  python scripts/generate-template-thumbnails.py --category electronics

  # Limit to N templates (for testing):
  python scripts/generate-template-thumbnails.py --limit 50

  # Use more workers (default: 8):
  python scripts/generate-template-thumbnails.py --workers 16

Requires env vars:
  SUPABASE_URL  — e.g. https://xxx.supabase.co
  SUPABASE_KEY  — service role key
"""

import argparse
import io
import os
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # Non-interactive backend — no display needed

import matplotlib.pyplot as plt
import numpy as np
import requests

try:
    import trimesh
except ImportError:
    print("Install trimesh: pip install trimesh")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Install supabase: pip install supabase")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────

BUCKET = "xray-images"
STORAGE_PREFIX = "cad-lab/templates/thumbnails"
THUMB_SIZE = (256, 256)
UPLOAD_DELAY = 0.15
DPI = 100
DOWNLOAD_TIMEOUT = 30

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


def init_supabase():
    """Create a fresh Supabase client (needed per-process for multiprocessing)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── STL Download ──────────────────────────────────────────────────────

def download_stl(url: str) -> bytes | None:
    """Download an STL file from a URL. Returns raw bytes or None on failure."""
    try:
        resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        print(f"  WARN: Download failed for {url}: {e}")
        return None


# ── Thumbnail Rendering ──────────────────────────────────────────────

def render_thumbnail(stl_bytes: bytes) -> bytes | None:
    """
    Render an STL mesh to a PNG thumbnail using trimesh + matplotlib.
    Returns PNG bytes or None on failure.

    DECISION: Using matplotlib's mplot3d instead of pyrender/OSMesa because
    it's pure-Python with zero native dependencies — guaranteed to work on
    any Mac without OpenGL driver headaches. The visual quality is more than
    sufficient for 256x256 card thumbnails.
    """
    try:
        mesh = trimesh.load(io.BytesIO(stl_bytes), file_type="stl")

        if isinstance(mesh, trimesh.Scene):
            meshes = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not meshes:
                return None
            mesh = trimesh.util.concatenate(meshes)

        if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
            return None

        mesh.vertices -= mesh.centroid
        scale = mesh.extents.max()
        if scale > 0:
            mesh.vertices /= scale

        fig = plt.figure(figsize=(THUMB_SIZE[0] / DPI, THUMB_SIZE[1] / DPI), dpi=DPI)
        ax = fig.add_subplot(111, projection="3d")

        vertices = mesh.vertices
        faces = mesh.faces

        from mpl_toolkits.mplot3d.art3d import Poly3DCollection

        triangles = vertices[faces]

        face_normals = np.cross(
            triangles[:, 1] - triangles[:, 0],
            triangles[:, 2] - triangles[:, 0],
        )
        norms = np.linalg.norm(face_normals, axis=1, keepdims=True)
        norms[norms == 0] = 1
        face_normals = face_normals / norms

        light_dir = np.array([0.5, 0.3, 0.8])
        light_dir = light_dir / np.linalg.norm(light_dir)
        intensity = np.clip(np.dot(face_normals, light_dir), 0.15, 1.0)

        face_colors = np.zeros((len(faces), 4))
        face_colors[:, 0] = 0.35 + 0.45 * intensity  # R — warm orange tint
        face_colors[:, 1] = 0.45 + 0.35 * intensity  # G
        face_colors[:, 2] = 0.55 + 0.30 * intensity  # B — slight blue ambient
        face_colors[:, 3] = 1.0

        poly = Poly3DCollection(
            triangles,
            facecolors=face_colors,
            edgecolors=(0.3, 0.3, 0.3, 0.08),
            linewidths=0.15,
        )
        ax.add_collection3d(poly)

        pad = 0.65
        ax.set_xlim(-pad, pad)
        ax.set_ylim(-pad, pad)
        ax.set_zlim(-pad, pad)

        ax.view_init(elev=25, azim=-135)
        ax.set_axis_off()
        fig.patch.set_facecolor("#f8f8f8")
        ax.set_facecolor("#f8f8f8")
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=DPI, bbox_inches="tight", pad_inches=0.02)
        plt.close(fig)

        buf.seek(0)
        img = Image.open(buf)
        img = img.resize(THUMB_SIZE, Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue()

    except Exception as e:
        print(f"  WARN: Render failed: {e}")
        return None


# ── Upload + DB Update ───────────────────────────────────────────────

def upload_thumbnail(sb, slug: str, png_bytes: bytes, retries: int = 3) -> str | None:
    """Upload a PNG to Supabase Storage. Returns the public URL or None."""
    storage_path = f"{STORAGE_PREFIX}/{slug}.png"

    for attempt in range(retries):
        try:
            sb.storage.from_(BUCKET).upload(
                storage_path,
                png_bytes,
                file_options={"content-type": "image/png", "upsert": "true"},
            )
            public_url = sb.storage.from_(BUCKET).get_public_url(storage_path)
            return public_url
        except Exception as e:
            if attempt < retries - 1:
                time.sleep((attempt + 1) * 2)
            else:
                print(f"  WARN: Upload failed for {slug}: {e}")
                return None


def update_thumbnail_url(sb, template_id: str, url: str) -> bool:
    """Set thumbnail_url in step_templates for a given row."""
    try:
        sb.table("step_templates").update({"thumbnail_url": url}).eq("id", template_id).execute()
        return True
    except Exception as e:
        print(f"  WARN: DB update failed for {template_id}: {e}")
        return False


# ── Single-template processing (runs in worker process) ──────────────

def process_one(template: dict) -> dict:
    """
    Download STL, render thumbnail, upload PNG, update DB.
    Returns a result dict with status.
    """
    slug = template["slug"]
    stl_url = template["stl_url"]
    template_id = template["id"]

    stl_bytes = download_stl(stl_url)
    if not stl_bytes:
        return {"slug": slug, "status": "download_failed"}

    png_bytes = render_thumbnail(stl_bytes)
    if not png_bytes:
        return {"slug": slug, "status": "render_failed"}

    sb = init_supabase()
    public_url = upload_thumbnail(sb, slug, png_bytes)
    if not public_url:
        return {"slug": slug, "status": "upload_failed"}

    ok = update_thumbnail_url(sb, template_id, public_url)
    if not ok:
        return {"slug": slug, "status": "db_update_failed"}

    time.sleep(UPLOAD_DELAY)
    return {"slug": slug, "status": "ok", "url": public_url}


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate STL thumbnails for step_templates")
    parser.add_argument("--category", type=str, help="Only process a specific category")
    parser.add_argument("--limit", type=int, default=0, help="Max templates to process (0 = all)")
    parser.add_argument("--workers", type=int, default=8, help="Number of parallel workers")
    parser.add_argument("--dry-run", action="store_true", help="Query and report count without processing")
    args = parser.parse_args()

    print("=" * 60)
    print("STEP Template Library — Thumbnail Generator")
    print("=" * 60)

    sb = init_supabase()

    # Fetch templates needing thumbnails
    query = (
        sb.table("step_templates")
        .select("id, slug, stl_url, category")
        .not_.is_("stl_url", "null")
        .is_("thumbnail_url", "null")
    )

    if args.category:
        query = query.eq("category", args.category)

    query = query.order("category").order("slug")

    # Supabase paginates at 1000 — fetch all pages
    all_templates = []
    page_size = 1000
    offset = 0

    while True:
        page = query.range(offset, offset + page_size - 1).execute()
        rows = page.data or []
        all_templates.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size

    if args.limit > 0:
        all_templates = all_templates[: args.limit]

    total = len(all_templates)
    print(f"\n  Found {total} templates needing thumbnails")

    if args.category:
        print(f"  Category filter: {args.category}")

    if total == 0:
        print("  Nothing to do.")
        return

    if args.dry_run:
        cats = {}
        for t in all_templates:
            cats[t["category"]] = cats.get(t["category"], 0) + 1
        print("\n  Breakdown by category:")
        for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
            print(f"    {cat}: {count}")
        return

    # Process with multiprocessing
    print(f"\n  Processing with {args.workers} workers...\n")
    start = time.time()
    ok = 0
    failed = 0

    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_one, t): t for t in all_templates}

        for i, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if result["status"] == "ok":
                ok += 1
            else:
                failed += 1
                print(f"  [{i}/{total}] FAIL {result['slug']}: {result['status']}")

            if ok % 25 == 0 and ok > 0:
                elapsed = time.time() - start
                rate = ok / elapsed if elapsed > 0 else 0
                print(f"  [{i}/{total}] Progress: {ok} ok, {failed} failed ({rate:.1f}/sec)")

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"DONE!")
    print(f"  Thumbnails generated: {ok}")
    print(f"  Failed:               {failed}")
    print(f"  Total time:           {elapsed:.0f}s")
    print(f"  Rate:                 {ok / elapsed:.1f} thumbnails/sec" if elapsed > 0 else "")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
