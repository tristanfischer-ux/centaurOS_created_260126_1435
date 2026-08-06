"""Universal customer-facing design-pack layout (Anvil).

INTENT (2026-08-06): one schema for every product class. Class-specific
*content* is optional; *paths* are not. The old EM nickname ``em-honesty/``
must never ship.
"""
from __future__ import annotations

from typing import Final

# Customer-facing evidence folder for electromagnetic field / torque packs.
# Historical internal name: em-honesty/ (do not reintroduce on packs).
ELECTROMAGNETICS_DIR: Final[str] = "electromagnetics"

FORBIDDEN_PACK_SEGMENTS: Final[tuple[str, ...]] = (
    "em-honesty",
)

# Top-level dirs that may appear when that domain has artefacts.
OPTIONAL_DOMAIN_DIRS: Final[tuple[str, ...]] = (
    "renders",
    "drawings",
    "pcb",
    ELECTROMAGNETICS_DIR,
    "instrument-physics",
    "multiphysics",
    "3d-model",
    "firmware",
    "run-logs",
)

# Always expected on a send pack (when excel export completed / chrome applied).
REQUIRED_SEND_FILES: Final[tuple[str, ...]] = (
    "MANIFEST.txt",
    "README-FIRST.txt",
    "FOLDER-GUIDE.txt",
)

# Optional always-nice chrome (copied when twin has them).
OPTIONAL_CHROME_FILES: Final[tuple[str, ...]] = (
    "tab-scorecard.json",
    "quality-scorecard.json",
    "00-COVER-NARRATIVE.pdf",
    "00-COVER-NARRATIVE.html",
    "00-COVER-CLICK-INDEX.html",
)

# Preferred workbook names (any one is enough).
WORKBOOK_CANDIDATES: Final[tuple[str, ...]] = (
    "dossier.xlsx",
    # legacy dated DRAFT workbooks also acceptable
)

COVER_CANDIDATES: Final[tuple[str, ...]] = (
    "00-COVER-NARRATIVE.pdf",
    "00-COVER-NARRATIVE.html",
)


def is_forbidden_pack_path(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").strip("/").split("/")
    return any(seg in FORBIDDEN_PACK_SEGMENTS for seg in parts)


def electromagnetics_dest(filename: str) -> str:
    """Relative path under the pack for an EM evidence file."""
    return f"{ELECTROMAGNETICS_DIR}/{filename.lstrip('/')}"


def connection_ghost_majority(
    n_ledger_connections: int,
    n_rendered_rows: int,
    *,
    min_ledger: int = 20,
    ratio: float = 3.0,
) -> bool:
    """True when ledger connections dominate rendered connection-trace rows.

    Canonical implementation: topology_prune.connection_ghost_majority.
    Kept here so pack_layout tests need no extra import.
    """
    try:
        from topology_prune import connection_ghost_majority as _impl
        return _impl(
            n_ledger_connections, n_rendered_rows,
            min_ledger=min_ledger, ratio=ratio,
        )
    except ImportError:
        n_rows = max(int(n_rendered_rows), 1)
        n_led = int(n_ledger_connections)
        return n_led >= min_ledger and n_led > n_rows * ratio


# Plant-economic driver keys that must not score as live Inputs on an
# instrument-class twin unless explicitly wired to a capital model.
INSTRUMENT_FORBIDDEN_PLANT_DRIVERS: Final[tuple[str, ...]] = (
    "sale_price",
    "feedstock_price",
    "feed_price",
    "fcr",
    "annual_volume",
    "lcoe",
    "plant_capacity_tpy",
    "capacity_factor_plant",
)


def instrument_plant_driver_leaks(
    is_instrument: bool,
    driver_keys: list[str] | tuple[str, ...],
) -> list[str]:
    """Return forbidden plant drivers present when product is an instrument."""
    if not is_instrument:
        return []
    forbidden = set(INSTRUMENT_FORBIDDEN_PLANT_DRIVERS)
    return sorted({k for k in driver_keys if k in forbidden or k.lower() in forbidden})


def validate_pack_root(pack_dir) -> list[str]:
    """Return list of layout violations for a design-pack directory."""
    from pathlib import Path

    pack = Path(pack_dir)
    problems: list[str] = []
    if not pack.is_dir():
        return [f"not a directory: {pack}"]
    for path in pack.rglob("*"):
        rel = str(path.relative_to(pack))
        if is_forbidden_pack_path(rel):
            problems.append(f"forbidden path segment: {rel}")
    has_manifest = (pack / "MANIFEST.txt").is_file()
    has_workbook = any((pack / name).is_file() for name in WORKBOOK_CANDIDATES) or any(
        pack.glob("*.xlsx")
    )
    if not has_manifest:
        problems.append("missing MANIFEST.txt")
    if not has_workbook:
        problems.append("missing workbook (dossier.xlsx or dated .xlsx)")
    # Soft chrome: recommend but do not fail legacy packs without README-FIRST
    # until build_send_pack has been applied (tests may require explicitly).
    return problems


def validate_send_pack_chrome(pack_dir) -> list[str]:
    """Stricter chrome check for packs that claim Anvil P0 navigation parity."""
    from pathlib import Path

    pack = Path(pack_dir)
    problems = validate_pack_root(pack)
    for name in REQUIRED_SEND_FILES:
        if not (pack / name).is_file():
            problems.append(f"missing chrome file: {name}")
    return problems
