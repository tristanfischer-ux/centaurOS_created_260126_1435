#!/usr/bin/env python3
"""
CI Backfill: Generate STL for templates missing them.
=====================================================

Queries Supabase for step_templates with step_url but no stl_url,
downloads each STEP, converts to STL via the Modal /convert-step
endpoint, uploads the STL to Supabase Storage, and updates the DB row.

Designed to run in GitHub Actions — no CadQuery install needed locally.

Usage:
  python scripts/ci-backfill-stl.py

  # Limit to N templates (useful for testing):
  python scripts/ci-backfill-stl.py --limit 5

  # Dry run:
  python scripts/ci-backfill-stl.py --dry-run

Requires env vars:
  SUPABASE_URL             — e.g. https://xxx.supabase.co
  SUPABASE_KEY             — service role key
  MODAL_CAD_ENDPOINT_URL   — unified Modal CAD web app base URL
                             (e.g. https://tristan-fischer--forgeos-cad-cad-web.modal.run)
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

try:
    from supabase import create_client
except ImportError:
    print("Install supabase: pip install supabase")
    sys.exit(1)


SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
MODAL_BASE_URL = os.environ.get("MODAL_CAD_ENDPOINT_URL", "").rstrip("/")

BUCKET = "xray-images"
STORAGE_PREFIX = "cad-lab/templates"


def get_convert_url() -> str:
    """Build the /convert-step endpoint URL from the base CAD web app URL."""
    if not MODAL_BASE_URL:
        print("ERROR: MODAL_CAD_ENDPOINT_URL not set")
        sys.exit(1)
    return f"{MODAL_BASE_URL}/convert-step"


# Consecutive failure threshold — abort early if the endpoint is unreachable
CONSECUTIVE_FAIL_LIMIT = 5


def preflight_check() -> bool:
    """Verify the Modal endpoint is reachable before processing the full batch."""
    endpoint = get_convert_url()
    try:
        req = urllib.request.Request(endpoint, method="OPTIONS")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status < 500
    except urllib.error.HTTPError as e:
        # 405 Method Not Allowed is fine — means the route exists
        if e.code == 405:
            return True
        print(f"  WARN: Preflight returned HTTP {e.code}")
        return e.code < 500
    except Exception as e:
        print(f"  ERROR: Preflight failed — endpoint unreachable: {e}")
        return False


def download_step(url: str) -> bytes | None:
    """Download a STEP file from a public Supabase Storage URL."""
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except Exception as e:
        print(f"  WARN: Download failed for {url[:80]}...: {e}")
        return None


def convert_step_to_stl(step_b64: str, tolerance: float = 0.1) -> str | None:
    """
    Convert a STEP file to STL via the Modal /convert-step endpoint.

    Sends base64-encoded STEP and receives base64-encoded STL.
    Uses the dedicated conversion function (CadQuery importStep + exportSTL).
    """
    endpoint = get_convert_url()
    payload = json.dumps({
        "step_b64": step_b64,
        "tolerance": tolerance,
    }).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())

        if data.get("error"):
            print(f"  WARN: Modal error: {data['error'][:200]}")
            return None

        return data.get("stl")
    except Exception as e:
        print(f"  ERROR: Modal conversion failed: {e}")
        return None


def upload_stl(supabase_client, template: dict, stl_b64: str) -> str | None:
    """Upload an STL to Supabase Storage and return the public URL."""
    stl_bytes = base64.b64decode(stl_b64)
    storage_path = f"{STORAGE_PREFIX}/{template['category']}/{template['slug']}.stl"

    try:
        supabase_client.storage.from_(BUCKET).upload(
            storage_path,
            stl_bytes,
            file_options={"content-type": "model/stl", "upsert": "true"},
        )
        return supabase_client.storage.from_(BUCKET).get_public_url(storage_path)
    except Exception as e:
        print(f"  WARN: Upload failed for {template['slug']}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="CI backfill STL for step_templates")
    parser.add_argument("--limit", type=int, default=0, help="Max templates to process (0 = all)")
    parser.add_argument("--tolerance", type=float, default=0.1, help="STL mesh tolerance in mm")
    parser.add_argument("--dry-run", action="store_true", help="Count missing STLs without converting")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables")
        sys.exit(1)

    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("=" * 60)
    print("CI Backfill: STEP → STL via Modal /convert-step")
    print("=" * 60)
    print(f"  Endpoint:  {get_convert_url()[:60]}...")
    print(f"  Tolerance: {args.tolerance} mm")

    print("  Preflight check...", end=" ", flush=True)
    if not preflight_check():
        print("FAILED")
        print("  Aborting — Modal endpoint is not reachable.")
        print("  Verify MODAL_CAD_ENDPOINT_URL and that the Modal app is deployed.")
        sys.exit(1)
    print("OK")

    query = (
        supabase_client.table("step_templates")
        .select("id, slug, category, step_url, source_path")
        .not_.is_("step_url", "null")
        .is_("stl_url", "null")
    )
    if args.limit > 0:
        query = query.limit(args.limit)

    result = query.execute()
    templates = result.data or []
    print(f"  Templates needing STL: {len(templates)}")

    if args.dry_run:
        print("  (Dry run — nothing converted)")
        return

    if not templates:
        print("  Nothing to backfill. All templates have STL URLs.")
        return

    start = time.time()
    converted = 0
    failed = 0
    consecutive_failures = 0

    for i, t in enumerate(templates):
        slug = t["slug"]

        step_bytes = download_step(t["step_url"])
        if not step_bytes:
            failed += 1
            consecutive_failures += 1
            if consecutive_failures >= CONSECUTIVE_FAIL_LIMIT:
                print(f"\n  CIRCUIT BREAKER: {CONSECUTIVE_FAIL_LIMIT} consecutive failures — aborting.")
                break
            continue

        step_b64 = base64.b64encode(step_bytes).decode("utf-8")

        stl_b64 = convert_step_to_stl(step_b64, tolerance=args.tolerance)
        if not stl_b64:
            failed += 1
            consecutive_failures += 1
            print(f"  FAIL: {slug}")
            if consecutive_failures >= CONSECUTIVE_FAIL_LIMIT:
                print(f"\n  CIRCUIT BREAKER: {CONSECUTIVE_FAIL_LIMIT} consecutive failures — aborting.")
                break
            continue

        consecutive_failures = 0

        stl_url = upload_stl(supabase_client, t, stl_b64)
        if not stl_url:
            failed += 1
            continue

        try:
            supabase_client.table("step_templates").update(
                {"stl_url": stl_url}
            ).eq("id", t["id"]).execute()
            converted += 1
        except Exception as e:
            print(f"  WARN: DB update failed for {slug}: {e}")
            failed += 1

        done = i + 1
        if done % 10 == 0 or done == len(templates):
            elapsed = time.time() - start
            print(
                f"  Progress: {done}/{len(templates)} "
                f"({converted} ok, {failed} failed, {elapsed:.0f}s)"
            )

        time.sleep(0.5)

    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("DONE!")
    print(f"  Converted: {converted}")
    print(f"  Failed:    {failed}")
    print(f"  Time:      {elapsed:.0f}s")
    print("=" * 60)

    if failed > 0 and converted == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
