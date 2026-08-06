#!/usr/bin/env python3
"""Universal Anvil send-pack chrome (P0) — navigation + scorecards + capability extras.

Call after a design-pack folder exists (excel bundle or hand-built). Idempotent:
rewrites README-FIRST, FOLDER-GUIDE, copies scorecards, optional 3d-model/firmware,
and rewrites cover prose paths that still say em-honesty/.

Does not invent electromagnetics/ or multiphysics/ content.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any, Optional

try:
    from pack_layout import ELECTROMAGNETICS_DIR, FORBIDDEN_PACK_SEGMENTS
except ImportError:  # pragma: no cover
    ELECTROMAGNETICS_DIR = "electromagnetics"
    FORBIDDEN_PACK_SEGMENTS = ("em-honesty",)


def _read_json(path: Path) -> Optional[dict]:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_readme_first(
    pack: Path,
    *,
    product_title: str,
    pack_revision: str,
    brand: str = "Anvil",
    ship_ok: Optional[bool] = None,
) -> Path:
    ship = (
        "ship_ok = true"
        if ship_ok is True
        else "ship_ok = false"
        if ship_ok is False
        else "see cover for ship status"
    )
    has_em = (pack / ELECTROMAGNETICS_DIR).is_dir()
    has_mp = (pack / "multiphysics").is_dir()
    has_phys = (pack / "instrument-physics").is_dir()
    lines = [
        f"{product_title} — {brand} concept design pack {pack_revision}",
        f"{brand} · concept engineering · {ship}",
        "",
        "1. Extract this zip as a folder.",
        "2. Open 00-COVER-NARRATIVE.pdf  or  00-COVER-NARRATIVE.html",
        "3. Or use 00-COVER-CLICK-INDEX.html for one-click navigation.",
        "4. Engineering workbook: dossier.xlsx",
    ]
    if has_em:
        lines.append(f"5. Domain electromagnetics evidence: {ELECTROMAGNETICS_DIR}/")
    if has_mp:
        lines.append("   Multiphysics screens: multiphysics/")
    if has_phys:
        lines.append("   Instrument physics one-pagers: instrument-physics/")
    lines += [
        "",
        f'(Internal name "em-honesty" is never used. Customer folder is {ELECTROMAGNETICS_DIR}/ when EM applies.)',
        "",
    ]
    path = pack / "README-FIRST.txt"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def write_folder_guide(pack: Path, *, pack_revision: str) -> Path:
    rows = [
        ("00-COVER-NARRATIVE.pdf / .html", "Start here"),
        ("00-COVER-CLICK-INDEX.html", "Quick clickable index"),
        ("README-FIRST.txt", "This orientation note"),
        ("dossier.xlsx", "Engineering workbook (live formulas)"),
        ("tab-scorecard.json", "Per-tab quality scores (if present)"),
        ("quality-scorecard.json", "Section quality scores (if present)"),
        ("renders/", "Product renders"),
        ("drawings/", "GA / interconnect / sections"),
        (f"{ELECTROMAGNETICS_DIR}/", "EM field / torque evidence (motors only)"),
        ("instrument-physics/", "Instrument thermal / optics / fluid cards"),
        ("multiphysics/", "Thermal / stress / rotordynamics screens"),
        ("pcb/", "Draft boards + fab package"),
        ("firmware/", "Virtual MCU bring-up (not HIL)"),
        ("3d-model/", "GLB/USDZ review meshes"),
        ("run-logs/", "Optional rebuild logs"),
    ]
    present = []
    for name, desc in rows:
        key = name.split()[0].rstrip("/")
        if key.startswith("00-") or key.endswith(".txt") or key.endswith(".xlsx") or key.endswith(".json"):
            if (pack / key).exists() or any(pack.glob(key.replace("00-COVER-NARRATIVE.pdf", "00-COVER*"))):
                present.append((name, desc))
            elif "COVER" in name and list(pack.glob("00-COVER*")):
                present.append((name, desc))
            elif key == "dossier.xlsx" and any(pack.glob("*.xlsx")):
                present.append((name, desc))
        else:
            if (pack / key).exists():
                present.append((name, desc))

    lines = [
        f"How this pack is organised (Anvil design pack {pack_revision})",
        "",
    ]
    for name, desc in present:
        lines.append(f"  {name:<36} {desc}")
    lines += [
        "",
        f'Note: older tools used folder name "em-honesty" for EM evidence.',
        f"This send pack uses {ELECTROMAGNETICS_DIR}/ only when EM applies.",
        "",
    ]
    path = pack / "FOLDER-GUIDE.txt"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def copy_scorecards(twin: Path, pack: Path) -> list[str]:
    copied = []
    for name in ("tab-scorecard.json", "quality-scorecard.json"):
        src = twin / name
        if src.is_file():
            shutil.copy2(src, pack / name)
            copied.append(name)
    return copied


def rewrite_em_honesty_prose(pack: Path) -> int:
    """Replace customer-facing em-honesty/ path strings with electromagnetics/."""
    n = 0
    for path in pack.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".md", ".html", ".txt", ".json"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "em-honesty" not in text and "em_honesty" not in text:
            continue
        new = text.replace("em-honesty/", f"{ELECTROMAGNETICS_DIR}/")
        new = new.replace("em-honesty\\", f"{ELECTROMAGNETICS_DIR}/")
        new = re.sub(r"(?<![\w-])em-honesty(?![\w-])", ELECTROMAGNETICS_DIR, new)
        # Keep historical comments
        if "was em-honesty" in text.lower() or "older internal" in text.lower():
            # don't double-replace explanatory sentences into nonsense
            pass
        if new != text:
            path.write_text(new, encoding="utf-8")
            n += 1
    return n


def copy_3d_model(twin: Path, pack: Path) -> list[str]:
    dest = pack / "3d-model"
    copied: list[str] = []
    # Already present
    if dest.is_dir() and any(dest.iterdir()):
        return ["3d-model/ (already present)"]
    dest.mkdir(exist_ok=True)
    patterns = [
        "product-3d-shell-*.glb",
        "product-3d-shell-*.usdz",
        "3d-model/**/*",
    ]
    sources: list[Path] = []
    for pat in ("product-3d-shell-on.glb", "product-3d-shell-off.glb",
                "product-3d-shell-on.usdz", "product-3d-shell-off.usdz"):
        p = twin / pat
        if p.is_file():
            sources.append(p)
    src_dir = twin / "3d-model"
    if src_dir.is_dir():
        for p in src_dir.rglob("*"):
            if p.is_file():
                sources.append(p)
    for src in sources:
        if src_dir in src.parents or src.parent == twin:
            rel = src.name if src.parent == twin else src.relative_to(src_dir)
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out)
            copied.append(str(rel))
    if copied and not (dest / "README.txt").is_file():
        (dest / "README.txt").write_text(
            "3D review meshes (GLB/USDZ). Concept morphology — not a supplier STEP fab package.\n",
            encoding="utf-8",
        )
    return copied


def copy_firmware(twin: Path, pack: Path) -> list[str]:
    dest = pack / "firmware"
    if dest.is_dir() and any(dest.iterdir()):
        return ["firmware/ (already present)"]
    src = twin / "firmware"
    copied: list[str] = []
    if src.is_dir():
        shutil.copytree(src, dest, dirs_exist_ok=True)
        return [str(p.relative_to(dest)) for p in dest.rglob("*") if p.is_file()][:20]
    # Loose twin root firmware proofs
    dest.mkdir(exist_ok=True)
    for name in ("bring-up-contract.json",):
        p = twin / name
        if p.is_file():
            shutil.copy2(p, dest / p.name)
            copied.append(p.name)
    fw_readme = twin / "firmware" / "README.md"
    if not fw_readme.is_file() and (twin / "README.md").is_file():
        # only copy twin README if it looks like firmware notes
        txt = (twin / "README.md").read_text(encoding="utf-8", errors="replace")[:400].lower()
        if "firmware" in txt or "bring-up" in txt or "qemu" in txt:
            shutil.copy2(twin / "README.md", dest / "README.md")
            copied.append("README.md")
    # pcb firmware trees
    for board_root in (twin / "pcb-boards", twin / "pcb"):
        if not board_root.is_dir():
            continue
        for proof in board_root.rglob("firmware"):
            if proof.is_dir():
                rel = proof.relative_to(board_root)
                out = dest / "boards" / rel
                shutil.copytree(proof, out, dirs_exist_ok=True)
                copied.append(str(rel))
    if copied and not (dest / "README.txt").is_file():
        (dest / "README.txt").write_text(
            "Firmware / bring-up artefacts.\n"
            "HONESTY: virtual or contract proofs only unless a HIL transcript is present.\n"
            "NOT a claim of hardware-validated firmware.\n",
            encoding="utf-8",
        )
    return copied


def apply_send_pack_chrome(
    twin: Path | str,
    pack: Path | str,
    *,
    product_title: str = "Anvil design pack",
    pack_revision: str = "V1",
    brand: str = "Anvil",
    ship_ok: Optional[bool] = None,
    include_3d: bool = True,
    include_firmware: bool = True,
    rewrite_em_paths: bool = True,
) -> dict[str, Any]:
    twin_p = Path(twin)
    pack_p = Path(pack)
    pack_p.mkdir(parents=True, exist_ok=True)

    sc = _read_json(twin_p / "tab-scorecard.json") or _read_json(pack_p / "tab-scorecard.json")
    if ship_ok is None and isinstance(sc, dict):
        v = sc.get("verdict") or {}
        if isinstance(v, dict) and "ships" in v:
            ship_ok = bool(v.get("ships"))
        elif isinstance(sc.get("summary"), dict):
            ship_ok = bool(sc["summary"].get("all_pass")) and float(
                sc["summary"].get("min_score") or 0
            ) >= 8

    report: dict[str, Any] = {"pack": str(pack_p), "actions": []}
    write_readme_first(
        pack_p,
        product_title=product_title,
        pack_revision=pack_revision,
        brand=brand,
        ship_ok=ship_ok,
    )
    report["actions"].append("README-FIRST.txt")
    write_folder_guide(pack_p, pack_revision=pack_revision)
    report["actions"].append("FOLDER-GUIDE.txt")
    sc_copied = copy_scorecards(twin_p, pack_p)
    if sc_copied:
        report["actions"].append(f"scorecards:{','.join(sc_copied)}")
    if include_3d:
        c3 = copy_3d_model(twin_p, pack_p)
        if c3:
            report["actions"].append(f"3d-model:{len(c3)} files")
    if include_firmware:
        cf = copy_firmware(twin_p, pack_p)
        if cf:
            report["actions"].append(f"firmware:{len(cf)} entries")
    if rewrite_em_paths:
        n = rewrite_em_honesty_prose(pack_p)
        if n:
            report["actions"].append(f"rewrote_em_honesty_paths:{n} files")
    # Cover contract v2 — illustrated HTML + figure PDF when renders/drawings exist.
    # Do not overwrite a handcrafted multi-MB illustrated cover (e.g. FE narrative pack).
    existing_ill = pack_p / "00-COVER-NARRATIVE-illustrated.html"
    skip_illust = existing_ill.is_file() and existing_ill.stat().st_size > 500_000
    if skip_illust:
        report["actions"].append(
            f"illustrated_cover:kept existing ({existing_ill.stat().st_size // 1024} KB)"
        )
    else:
        try:
            from build_pack_cover import upgrade_pack_cover_illustration
        except ImportError:  # pragma: no cover
            upgrade_pack_cover_illustration = None  # type: ignore
        if upgrade_pack_cover_illustration is not None:
            try:
                ill = upgrade_pack_cover_illustration(
                    pack_p,
                    product_title=product_title,
                    pack_revision=pack_revision,
                    brand=brand,
                    twin_id=twin_p.name,
                    ship_ok=ship_ok,
                )
                n_fig = len(ill.get("figures") or [])
                report["actions"].append(f"illustrated_cover:{n_fig} figures")
                report["illustrated"] = ill
            except Exception as exc:  # never block chrome for cover polish
                report["actions"].append(f"illustrated_cover_skipped:{exc}")
    report["ship_ok"] = ship_ok
    return report


def rezip_pack(pack: Path, zip_path: Optional[Path] = None) -> Path:
    import zipfile

    pack = Path(pack)
    # Do not use Path.with_suffix — names like V1.16-foo treat ".16-foo" as the suffix.
    zip_path = Path(zip_path) if zip_path else pack.parent / f"{pack.name}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(pack.rglob("*")):
            if f.is_file():
                zf.write(f, f.relative_to(pack.parent).as_posix())
    return zip_path


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td) / "twin"
        pack = Path(td) / "pack"
        twin.mkdir()
        pack.mkdir()
        (pack / "MANIFEST.txt").write_text("x\n")
        (pack / "dossier.xlsx").write_bytes(b"PK")
        (twin / "tab-scorecard.json").write_text(
            json.dumps({"summary": {"all_pass": True, "min_score": 9}, "verdict": {"ships": False}})
        )
        (twin / "product-3d-shell-on.glb").write_bytes(b"glTF")
        r = apply_send_pack_chrome(
            twin, pack, product_title="Selftest", pack_revision="V0", ship_ok=False
        )
        assert (pack / "README-FIRST.txt").is_file()
        assert (pack / "FOLDER-GUIDE.txt").is_file()
        assert (pack / "tab-scorecard.json").is_file()
        assert (pack / "3d-model" / "product-3d-shell-on.glb").is_file()
        print("build_send_pack selftest OK", r)
