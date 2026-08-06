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


def _dual_grade_lines(twin: Path, pack: Path, floor_status: Optional[dict] = None) -> list[str]:
    """Tab floor (engine contracts) vs domain product grade (manufacturer sanity)."""
    lines: list[str] = []
    tab_min = None
    if floor_status and floor_status.get("min_score") is not None:
        tab_min = floor_status.get("min_score")
    sc = _read_json(twin / "tab-scorecard.json") or _read_json(pack / "tab-scorecard.json")
    if tab_min is None and isinstance(sc, dict):
        tab_min = (sc.get("summary") or {}).get("min_score")
    qsc = _read_json(twin / "quality-scorecard.json") or _read_json(pack / "quality-scorecard.json")
    domain = None
    release = None
    if isinstance(qsc, dict):
        for s in qsc.get("sections") or []:
            if not isinstance(s, dict):
                continue
            if s.get("name") == "domain_product_quality":
                domain = s.get("score")
            if s.get("name") == "release_readiness":
                release = s.get("score")
    st = _read_json(twin / "state.json")
    if domain is None and isinstance(st, dict):
        dpq = st.get("_domainProductQuality") or {}
        if isinstance(dpq, dict):
            domain = dpq.get("score")
    lines.append("GRADES (read both — they answer different questions):")
    lines.append(
        f"  · Tab floor (engine sheet contracts): "
        f"{tab_min if tab_min is not None else 'see tab-scorecard.json'}/10"
    )
    lines.append(
        f"  · Domain product grade (catalogue/kinetics/topology sanity): "
        f"{domain if domain is not None else 'see quality-scorecard domain_product_quality'}/10"
    )
    if release is not None:
        lines.append(
            f"  · Release readiness (homologation / Gerbers / HIL): {release}/10"
        )
    # Geometry completeness when CAD kernel has run
    geo = _read_json(twin / "geometry" / "completeness.json") or _read_json(
        pack / "geometry" / "completeness.json"
    )
    if isinstance(geo, dict) and geo.get("score") is not None:
        lines.append(
            f"  · Geometry completeness (BoM↔3D / STEP): {geo.get('score')}/10 "
            f"(solids={geo.get('n_solid')} paths={geo.get('n_path')} "
            f"holds={geo.get('n_open_holds')})"
        )
    lines.append(
        "  A high tab floor does NOT mean manufacturer-ready. "
        "Read ADVERSARIAL-*.md and open holds before any purchase order."
    )
    if (twin / "geometry" / "assembly.step").is_file() or (
        pack / "geometry" / "assembly.step"
    ).is_file():
        lines.append(
            "  CAD master: geometry/assembly.step — open in FreeCAD (free). "
            "Blender renders are film, not layout authority."
        )
    lines.append("")
    return lines


def write_readme_first(
    pack: Path,
    *,
    product_title: str,
    pack_revision: str,
    brand: str = "Anvil",
    ship_ok: Optional[bool] = None,
    twin: Optional[Path] = None,
    floor_status: Optional[dict] = None,
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
    ]
    if twin is not None:
        lines.extend(_dual_grade_lines(Path(twin), pack, floor_status=floor_status))
    lines += [
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
        ("drawings/", "GA / interconnect / BoM callouts / service"),
        ("drawings/ga-bom-callouts.png", "Principal BoM tag leaders"),
        ("drawings/service-access.png", "Service / access zones"),
        ("drawings/ga-optical-path.png", "OD / optical path (when sensing)"),
        (f"{ELECTROMAGNETICS_DIR}/", "EM field / torque evidence (motors only)"),
        ("instrument-physics/", "Instrument thermal / optics / fluid cards"),
        ("multiphysics/", "Thermal / stress / rotordynamics screens"),
        ("pcb/", "Draft boards + fab package"),
        ("firmware/", "Virtual MCU bring-up (not HIL)"),
        ("3d-model/", "GLB/USDZ review meshes"),
        ("geometry/", "CAD master: assembly.step + IR (FreeCAD)"),
        ("geometry/assembly.step", "Open in FreeCAD — engineering model"),
        ("geometry/README.txt", "How to open STEP; holds list"),
        ("drawings/ga-geometry-from-ir.svg", "GA projected from CAD IR (G-DRAW-SYNC)"),
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


def copy_geometry(twin: Path, pack: Path) -> list[str]:
    """Copy CAD-first geometry/ (STEP master + IR + completeness) into the pack."""
    src = twin / "geometry"
    dest = pack / "geometry"
    if not src.is_dir():
        return []
    # Always refresh from twin when kernel has run (master is twin geometry/)
    if dest.is_dir():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    copied = [str(p.relative_to(dest)) for p in dest.rglob("*") if p.is_file()]
    # G-DRAW-SYNC sheets live under twin/drawings — ship with pack drawings/
    draw_dest = pack / "drawings"
    for name in (
        "ga-geometry-from-ir.svg",
        "ga-geometry-from-ir.png",
        "ga-geometry-from-ir.json",
        "G-DRAW-SYNC.md",
    ):
        src_d = twin / "drawings" / name
        if src_d.is_file():
            draw_dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_d, draw_dest / name)
            copied.append(f"drawings/{name}")
    return copied[:50]


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


def _tab_floor_status(
    twin: Path,
    pack: Path,
    *,
    floor: float,
) -> dict[str, Any]:
    """Read tab-scorecard summary; return floor verdict for send-pack gating."""
    sc = _read_json(twin / "tab-scorecard.json") or _read_json(pack / "tab-scorecard.json")
    if not isinstance(sc, dict):
        return {"ok": False, "reason": "no tab-scorecard.json", "min_score": None, "floor": floor}
    summary = sc.get("summary") if isinstance(sc.get("summary"), dict) else {}
    min_score = summary.get("min_score")
    min_tab = summary.get("min_tab")
    fail_tabs = list(summary.get("fail_tabs") or [])
    try:
        ms = float(min_score) if min_score is not None else None
    except (TypeError, ValueError):
        ms = None
    ok = ms is not None and ms + 1e-9 >= float(floor) and not fail_tabs
    # also treat any tab with score < floor as fail when tabs dict present
    if ok and isinstance(sc.get("tabs"), dict):
        for name, row in sc["tabs"].items():
            if not isinstance(row, dict):
                continue
            try:
                s = float(row.get("score"))
            except (TypeError, ValueError):
                continue
            if s + 1e-9 < float(floor):
                ok = False
                fail_tabs.append(name)
                if ms is None or s < ms:
                    ms = s
                    min_tab = name
    return {
        "ok": ok,
        "min_score": ms,
        "min_tab": min_tab,
        "fail_tabs": sorted(set(fail_tabs)),
        "floor": float(floor),
        "reason": (
            None
            if ok
            else f"tab floor {ms}/10 < {floor} (worst: {min_tab}); fails={fail_tabs[:8]}"
        ),
    }


def write_draft_tab_floor_note(
    pack: Path,
    status: dict[str, Any],
    *,
    pack_revision: str,
) -> Path:
    """Honest DRAFT note when tab floor is below the send gate."""
    path = pack / "00-DRAFT-TAB-FLOOR-NOTE.txt"
    lines = [
        f"DRAFT TAB-FLOOR NOTE — {pack_revision}",
        "",
        f"Required floor: ≥ {status.get('floor')}/10 on every scored tab.",
        f"Current min: {status.get('min_score')}  (worst tab: {status.get('min_tab')})",
        f"Failing / below-floor tabs: {', '.join(status.get('fail_tabs') or []) or '(none listed)'}",
        "",
        "This pack ships as concept DRAFT until the floor is met.",
        "ship_ok remains false while the floor fails or race/HIL evidence is open.",
        "Do not treat a beautiful electromagnetics/ folder as a green send gate.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


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
    tab_floor: Optional[float] = None,
    enforce_tab_floor: Optional[bool] = None,
) -> dict[str, Any]:
    """Apply navigation chrome. Tab floor gate:

    - ``ANVIL_TAB_FLOOR`` env (default 9) sets the numeric floor.
    - ``ANVIL_TAB_FLOOR_ENFORCE=1`` makes a below-floor pack a hard error
      (return includes ``tab_floor_block: true``; callers may refuse zip).
    - Below floor always writes ``00-DRAFT-TAB-FLOOR-NOTE.txt``.
    """
    import os

    twin_p = Path(twin)
    pack_p = Path(pack)
    pack_p.mkdir(parents=True, exist_ok=True)

    if tab_floor is None:
        try:
            tab_floor = float(os.environ.get("ANVIL_TAB_FLOOR", "9"))
        except ValueError:
            tab_floor = 9.0
    if enforce_tab_floor is None:
        enforce_tab_floor = os.environ.get("ANVIL_TAB_FLOOR_ENFORCE", "").strip() in (
            "1", "true", "TRUE", "yes", "YES",
        )

    sc = _read_json(twin_p / "tab-scorecard.json") or _read_json(pack_p / "tab-scorecard.json")
    if ship_ok is None and isinstance(sc, dict):
        v = sc.get("verdict") or {}
        if isinstance(v, dict) and "ships" in v:
            ship_ok = bool(v.get("ships"))
        elif isinstance(sc.get("summary"), dict):
            ship_ok = bool(sc["summary"].get("all_pass")) and float(
                sc["summary"].get("min_score") or 0
            ) >= float(tab_floor)

    floor_status = _tab_floor_status(twin_p, pack_p, floor=float(tab_floor))
    if not floor_status["ok"]:
        # Never claim ship_ok over a failed tab floor
        ship_ok = False

    report: dict[str, Any] = {
        "pack": str(pack_p),
        "actions": [],
        "tab_floor": floor_status,
    }
    write_readme_first(
        pack_p,
        product_title=product_title,
        pack_revision=pack_revision,
        brand=brand,
        ship_ok=ship_ok,
        twin=twin_p,
        floor_status=floor_status,
    )
    report["actions"].append("README-FIRST.txt")
    write_folder_guide(pack_p, pack_revision=pack_revision)
    report["actions"].append("FOLDER-GUIDE.txt")
    sc_copied = copy_scorecards(twin_p, pack_p)
    if sc_copied:
        report["actions"].append(f"scorecards:{','.join(sc_copied)}")
    # CAD-first geometry kernel + optional kernel hero film (pack rebuild chain)
    try:
        from geometry_pack_hooks import ensure_geometry_and_heroes_for_pack
    except ImportError:  # pragma: no cover
        ensure_geometry_and_heroes_for_pack = None  # type: ignore
    if ensure_geometry_and_heroes_for_pack is not None:
        try:
            _geo_h = ensure_geometry_and_heroes_for_pack(twin_p)
            if _geo_h.get("actions"):
                report["actions"].extend(_geo_h["actions"])
            report["geometry_hooks"] = {
                k: _geo_h.get(k)
                for k in ("kernel_ok", "hero_ok", "hero_ran", "kernel_built")
            }
        except Exception as _ghe:  # pragma: no cover
            report["actions"].append(f"geometry_hooks_error:{_ghe}")

    # CAD master (STEP) — always copy when twin/geometry exists
    cg = copy_geometry(twin_p, pack_p)
    if cg:
        report["actions"].append(f"geometry:{len(cg)} files")
        report["geometry_step"] = (pack_p / "geometry" / "assembly.step").is_file()
    # Copy kernel hero PNGs into pack root + renders/
    n_hero = 0
    for name in (
        "00-hero.png",
        "hero-embed.png",
        "01-top.png",
        "04-product-exterior.png",
        "05-product-left.png",
        "06-product-right.png",
        "07-product-service.png",
        "08-product-ghost-shell.png",
        "kernel-hero-manifest.json",
    ):
        src = twin_p / name
        if not src.is_file():
            continue
        dest_r = pack_p / "renders"
        dest_r.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest_r / name)
        if name.endswith(".png") and name.startswith(("00-", "hero-")):
            shutil.copy2(src, pack_p / name)
        n_hero += 1
    if n_hero:
        report["actions"].append(f"kernel_heroes:{n_hero} files")

    # Optional hard gate: ANVIL_REQUIRE_STEP=1 fails pack without STEP
    if os.environ.get("ANVIL_REQUIRE_STEP", "").strip() in ("1", "true", "TRUE", "yes"):
        step_ok = (pack_p / "geometry" / "assembly.step").is_file() or (
            twin_p / "geometry" / "assembly.step"
        ).is_file()
        if not step_ok:
            report["step_block"] = True
            report["actions"].append("ANVIL_REQUIRE_STEP blocked send (no assembly.step)")
            ship_ok = False

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

    # Tab floor honesty
    if floor_status["ok"]:
        draft_note = pack_p / "00-DRAFT-TAB-FLOOR-NOTE.txt"
        if draft_note.is_file():
            draft_note.unlink()
            report["actions"].append("removed DRAFT tab-floor note (floor met)")
        report["actions"].append(
            f"tab_floor_ok:min={floor_status.get('min_score')}≥{tab_floor}"
        )
    else:
        write_draft_tab_floor_note(pack_p, floor_status, pack_revision=pack_revision)
        report["actions"].append(
            f"tab_floor_DRAFT:min={floor_status.get('min_score')}<{tab_floor}"
        )
        if enforce_tab_floor:
            report["tab_floor_block"] = True
            report["actions"].append("ANVIL_TAB_FLOOR_ENFORCE blocked send")

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

    # Ship adversarial / council summary when twin has one (bio-style pack honesty)
    for name in (
        "ADVERSARIAL-MANUFACTURER-REVIEW.md",
        "ADVERSARIAL-DOMAIN-REVIEW.md",
        "ADVERSARIAL-COUNCIL-SYNTHESIS.json",
    ):
        src = twin_p / name
        if src.is_file() and not (pack_p / name).is_file():
            shutil.copy2(src, pack_p / name)
            report["actions"].append(f"copied:{name}")

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
