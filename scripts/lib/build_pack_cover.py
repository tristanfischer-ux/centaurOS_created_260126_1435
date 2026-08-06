#!/usr/bin/env python3
"""Shared Anvil design-pack cover builder (PDF + HTML + click index).

Universal stage: same structure for every product class; only the body content
varies. All links are pack-relative — never machine-absolute paths.

Cover contract v2 adds an *illustrated* HTML (base64-embedded figures for
self-contained sharing) and upgrades the PDF with the same figures when
renders/drawings exist. Domain-agnostic figure discovery — motors get torque
bars if present; instruments get ghost shells and GA.
"""
from __future__ import annotations

import base64
import io
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Sequence

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# Ordered preference list: first hits win up to max_figures.
# Paths are pack-relative. Only files that exist are used.
DEFAULT_FIGURE_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("renders/00-hero.png", "Product hero"),
    ("renders/08-product-ghost-shell.png", "Ghost shell — see inside"),
    ("renders/13-product-exploded.png", "Exploded product view"),
    ("renders/12-product-ghost-shell-front.png", "Ghost shell — front"),
    ("renders/09-product-ghost-shell-side.png", "Ghost shell — side"),
    ("renders/10-product-ghost-shell-back.png", "Ghost shell — back"),
    ("renders/11-product-ghost-shell-top.png", "Ghost shell — top"),
    ("renders/04-product-exterior.png", "Product exterior"),
    ("renders/07-product-service.png", "Service / access view"),
    ("drawings/general-arrangement.png", "General arrangement"),
    ("drawings/interconnect.png", "Principal interconnect"),
    ("electromagnetics/01-dual-torque-bars.png", "Dual torque requirement bars"),
    ("electromagnetics/02-loaded-full_tony_bmag.png", "Loaded B-field (Tony)"),
    ("multiphysics/r2_stator_temperature_field.png", "Stator thermal field"),
)


def discover_pack_figures(
    pack: Path | str,
    *,
    max_figures: int = 10,
    extra: Sequence[tuple[str, str]] | None = None,
) -> list[tuple[str, str]]:
    """Return [(rel_path, caption), ...] for figures present under the pack."""
    pack = Path(pack)
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    candidates = list(extra or []) + list(DEFAULT_FIGURE_CANDIDATES)
    for rel, caption in candidates:
        rel_n = rel.replace("\\", "/").lstrip("./")
        if rel_n in seen:
            continue
        if (pack / rel_n).is_file():
            found.append((rel_n, caption))
            seen.add(rel_n)
        if len(found) >= max_figures:
            break
    return found


def _image_to_data_uri(
    path: Path,
    *,
    max_edge: int = 1800,
    jpeg_quality: int = 90,
) -> tuple[str, int, int]:
    """Return (data_uri, width, height) after optional downscale.

    Prefers JPEG for photographic renders; keeps PNG for line drawings when
    the source is small enough that PNG compresses better.
    """
    def _raw_fallback() -> tuple[str, int, int]:
        raw = path.read_bytes()
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}", 0, 0

    if Image is None:
        return _raw_fallback()

    try:
        im = Image.open(path)
        im.load()  # force decode so truncated stubs fail here, not later
    except Exception:
        # Unit fixtures often write PNG magic-only stubs; still embed as raw.
        return _raw_fallback()

    im = im.convert("RGB") if im.mode not in ("RGB", "L") else im
    if im.mode == "L":
        im = im.convert("RGB")
    w, h = im.size
    scale = min(1.0, max_edge / float(max(w, h, 1)))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        w, h = im.size

    # Line drawings (GA/interconnect) stay sharper as PNG when already small.
    is_drawing = "drawing" in path.as_posix().lower() or path.stat().st_size < 400_000
    buf = io.BytesIO()
    try:
        if is_drawing and path.suffix.lower() == ".png" and path.stat().st_size < 800_000:
            im_rgba = Image.open(path)
            if scale < 1.0:
                im_rgba = im_rgba.resize((w, h), Image.Resampling.LANCZOS)
            im_rgba.save(buf, format="PNG", optimize=True)
            mime = "image/png"
        else:
            im.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            mime = "image/jpeg"
    except Exception:
        return _raw_fallback()
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:{mime};base64,{b64}", w, h


def assert_relative_hrefs(html_path: Path, pack_root: Path) -> list[str]:
    """Return problems for href/src that are absolute or escape the pack."""
    text = html_path.read_text(errors="replace")
    problems: list[str] = []
    if "/Users/" in text or "file://" in text:
        problems.append(f"{html_path.name}: contains absolute machine path")
    for m in re.finditer(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", text, re.I):
        href = m.group(1).strip()
        if href.startswith(("#", "mailto:", "https://", "http://", "data:")):
            continue
        if href.startswith("/") or re.match(r"^[A-Za-z]:\\", href):
            problems.append(f"absolute href: {href}")
            continue
        if "://" in href:
            problems.append(f"scheme href: {href}")
            continue
        target = (html_path.parent / href).resolve()
        try:
            target.relative_to(pack_root.resolve())
        except ValueError:
            problems.append(f"href escapes pack: {href}")
            continue
        # Existence is soft for optional media; hard for obvious workbook paths.
        if href.endswith((".xlsx", ".pdf", ".html", ".md", ".txt")) and not target.is_file():
            # allow missing optional cover siblings during unit tests
            if "dossier" in href or href.endswith("MANIFEST.txt"):
                if not target.is_file():
                    problems.append(f"missing target: {href}")
    return problems


def build_pack_cover(
    *,
    pack_dir: Path | str,
    product_title: str,
    twin_id: str,
    pack_revision: str,
    ship_ok: bool,
    decision_bullets: Sequence[str],
    folder_map: Sequence[tuple[str, str, str]],
    brand: str = "Anvil",
    release_date: str | None = None,
    config_extra: Sequence[tuple[str, str]] | None = None,
    open_items: Sequence[str] | None = None,
    ten_minute_route: str | None = None,
    hero_rel: str | None = None,
    body_sections: Sequence[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    """Write 00-COVER-NARRATIVE.{md,html,pdf} and 00-COVER-CLICK-INDEX.html."""
    pack = Path(pack_dir)
    pack.mkdir(parents=True, exist_ok=True)
    release = release_date or date.today().isoformat()
    status = "ship_ok = true" if ship_ok else "ship_ok = false"

    md_lines = [
        f"# {product_title}",
        "",
        f"**{brand} design pack** — concept engineering dossier. Not clinical, not homologated, not a certified medical device unless separately evidenced.",
        "",
        "---",
        "",
        "## Configuration block",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Pack revision | **{pack_revision}** |",
        f"| Release date | **{release}** |",
        f"| Digital model (twin) | `{twin_id}` |",
        f"| Authoritative inventory | `MANIFEST.txt` |",
        f"| Workbook of record | `dossier.xlsx` |",
        f"| Ship status | **`{status}`** |",
    ]
    for k, v in config_extra or []:
        md_lines.append(f"| {k} | {v} |")
    md_lines += [
        "",
        "---",
        "",
        "## Decision summary — read this first",
        "",
    ]
    for i, b in enumerate(decision_bullets, 1):
        md_lines.append(f"**{i}.** {b}")
        md_lines.append("")
    if open_items:
        md_lines += ["### Open items", ""]
        for item in open_items:
            md_lines.append(f"- {item}")
        md_lines.append("")
    md_lines += [
        "---",
        "",
        "## Folder map — what to open",
        "",
        "| Area | Entry file (relative path) | What it supports |",
        "|---|---|---|",
    ]
    for area, path, what in folder_map:
        md_lines.append(f"| {area} | `{path}` | {what} |")
    md_lines.append("")
    if ten_minute_route:
        md_lines += [f"**Ten-minute route:** {ten_minute_route}", ""]
    for title, body in body_sections or []:
        md_lines += ["---", "", f"## {title}", "", body, ""]

    md_text = "\n".join(md_lines)
    md_path = pack / "00-COVER-NARRATIVE.md"
    md_path.write_text(md_text)

    # HTML narrative
    rows_cfg = "".join(
        f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>"
        for k, v in [
            ("Pack revision", pack_revision),
            ("Release date", release),
            ("Digital model (twin)", twin_id),
            ("Ship status", status),
            *((config_extra or [])),
        ]
    )
    rows_map = "".join(
        f'<tr><td>{_esc(a)}</td><td><a href="{_esc(p)}"><code>{_esc(p)}</code></a></td>'
        f"<td>{_esc(w)}</td></tr>"
        for a, p, w in folder_map
    )
    decisions_html = "".join(f"<li>{_esc(b)}</li>" for b in decision_bullets)
    open_html = ""
    if open_items:
        open_html = "<h3>Open items</h3><ul>" + "".join(
            f"<li>{_esc(x)}</li>" for x in open_items
        ) + "</ul>"
    body_html = ""
    for title, body in body_sections or []:
        body_html += f"<h2>{_esc(title)}</h2><p>{_esc(body)}</p>"
    figures = discover_pack_figures(pack, max_figures=12)
    if hero_rel and (pack / hero_rel).is_file():
        # Ensure hero is first when explicitly requested
        hero_n = hero_rel.replace("\\", "/").lstrip("./")
        figures = [(r, c) for r, c in figures if r != hero_n]
        figures = [(hero_n, "Product hero")] + figures
        figures = figures[:10]

    hero_html = ""
    if figures:
        rel0, cap0 = figures[0]
        hero_html = (
            f'<p class="hero"><img src="{_esc(rel0)}" alt="{_esc(cap0)}" '
            f'style="max-width:100%;height:auto;border:1px solid #ddd"/></p>'
        )
    elif hero_rel and (pack / hero_rel).is_file():
        hero_html = (
            f'<p class="hero"><img src="{_esc(hero_rel)}" alt="Product hero" '
            f'style="max-width:100%;height:auto;border:1px solid #ddd"/></p>'
        )

    fig_gallery = ""
    if len(figures) > 1:
        tiles = "".join(
            f'<figure class="tile"><a href="{_esc(r)}">'
            f'<img src="{_esc(r)}" alt="{_esc(c)}"/></a>'
            f"<figcaption>{_esc(c)} · <code>{_esc(r)}</code></figcaption></figure>"
            for r, c in figures[1:]
        )
        fig_gallery = f'<h2>Key figures</h2><div class="gallery">{tiles}</div>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{_esc(product_title)} — {_esc(brand)} cover</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; background: #fff; max-width: 920px; margin: 2rem auto; padding: 0 1.25rem;
         line-height: 1.45; }}
  h1 {{ font-size: 1.6rem; margin-bottom: 0.25rem; }}
  h2 {{ font-size: 1.15rem; margin-top: 1.75rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.25rem; }}
  table {{ border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.25rem; font-size: 0.95rem; }}
  th, td {{ border: 1px solid #ddd; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }}
  th {{ background: #f6f6f6; width: 32%; }}
  code {{ font-size: 0.88em; }}
  .brand {{ color: #444; font-size: 0.95rem; margin-bottom: 1.25rem; }}
  .route {{ background: #f8f8f8; padding: 0.75rem 1rem; border-left: 3px solid #222; }}
  a {{ color: #0b57d0; }}
  .gallery {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }}
  .tile {{ margin: 0; }}
  .tile img {{ width: 100%; height: auto; border: 1px solid #ddd; display: block; }}
  figcaption {{ font-size: 0.82rem; color: #444; margin-top: 0.35rem; }}
  .note {{ color: #666; font-size: 0.9rem; }}
</style>
</head>
<body>
<h1>{_esc(product_title)}</h1>
<p class="brand"><strong>{_esc(brand)}</strong> design pack · revision {_esc(pack_revision)} · {_esc(release)}</p>
{hero_html}
<p class="note">Self-contained illustrated cover (embedded figures):
  <a href="00-COVER-NARRATIVE-illustrated.html">00-COVER-NARRATIVE-illustrated.html</a></p>
<h2>Configuration</h2>
<table>{rows_cfg}</table>
<h2>Decision summary</h2>
<ol>{decisions_html}</ol>
{open_html}
{fig_gallery}
<h2>Folder map</h2>
<table>
<thead><tr><th>Area</th><th>Entry file</th><th>What it supports</th></tr></thead>
<tbody>{rows_map}</tbody>
</table>
{f'<p class="route"><strong>Ten-minute route:</strong> {_esc(ten_minute_route)}</p>' if ten_minute_route else ''}
{body_html}
<p style="margin-top:2rem;color:#666;font-size:0.85rem">Generated by Anvil <code>build_pack_cover</code>. All links are relative to this pack folder.</p>
</body>
</html>
"""
    html_path = pack / "00-COVER-NARRATIVE.html"
    html_path.write_text(html)

    # Click index — compact navigation
    links = "".join(
        f'<li><a href="{_esc(p)}"><strong>{_esc(a)}</strong></a> — {_esc(w)} '
        f'(<code>{_esc(p)}</code>)</li>'
        for a, p, w in folder_map
    )
    click = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{_esc(product_title)} — click index</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; background: #fff; max-width: 720px; margin: 2rem auto; padding: 0 1.25rem; }}
  a {{ color: #0b57d0; }}
  li {{ margin: 0.45rem 0; }}
</style>
</head>
<body>
<h1>Open first</h1>
<p>{_esc(product_title)} · {_esc(pack_revision)}</p>
<ol>
<li><a href="00-COVER-NARRATIVE.html">Cover narrative</a></li>
<li><a href="00-COVER-NARRATIVE-illustrated.html">Illustrated cover (embedded figures)</a></li>
<li><a href="00-COVER-NARRATIVE.pdf">Cover PDF</a></li>
{links}
</ol>
</body>
</html>
"""
    click_path = pack / "00-COVER-CLICK-INDEX.html"
    click_path.write_text(click)

    illust = write_illustrated_cover(
        pack,
        product_title=product_title,
        brand=brand,
        pack_revision=pack_revision,
        release=release,
        status=status,
        twin_id=twin_id,
        decision_bullets=list(decision_bullets),
        open_items=list(open_items or []),
        folder_map=list(folder_map),
        ten_minute_route=ten_minute_route,
        figures=figures,
        body_sections=list(body_sections or []),
        config_extra=list(config_extra or []),
    )

    pdf_path = pack / "00-COVER-NARRATIVE.pdf"
    if fitz is not None:
        _write_illustrated_pdf(
            pdf_path,
            title=product_title,
            brand=brand,
            revision=pack_revision,
            release=release,
            status=status,
            twin_id=twin_id,
            decisions=list(decision_bullets),
            folder_map=list(folder_map),
            open_items=list(open_items or []),
            ten_minute_route=ten_minute_route,
            figures=figures,
            pack=pack,
        )
    else:
        # Fallback: copy markdown as .pdf placeholder is wrong; skip file
        pdf_path = None  # type: ignore

    return {
        "md": str(md_path),
        "html": str(html_path),
        "click_index": str(click_path),
        "pdf": str(pdf_path) if pdf_path else None,
        "illustrated_html": illust.get("illustrated_html"),
        "figures": [r for r, _ in figures],
    }


def write_illustrated_cover(
    pack: Path | str,
    *,
    product_title: str,
    brand: str = "Anvil",
    pack_revision: str = "V1",
    release: str | None = None,
    status: str = "ship_ok = false",
    twin_id: str = "",
    decision_bullets: Sequence[str] | None = None,
    open_items: Sequence[str] | None = None,
    folder_map: Sequence[tuple[str, str, str]] | None = None,
    ten_minute_route: str | None = None,
    figures: Sequence[tuple[str, str]] | None = None,
    body_sections: Sequence[tuple[str, str]] | None = None,
    config_extra: Sequence[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    """Write 00-COVER-NARRATIVE-illustrated.html with base64-embedded figures.

    Self-contained for email / single-file share. Zip still ships relative-path
    assets under renders/ and drawings/ for full-resolution review.
    """
    pack = Path(pack)
    release = release or date.today().isoformat()
    figs = list(figures) if figures is not None else discover_pack_figures(pack)
    if not figs:
        # Still emit a stub so navigation links resolve.
        stub = pack / "00-COVER-NARRATIVE-illustrated.html"
        stub.write_text(
            f"<!DOCTYPE html><html lang='en'><body><p>No pack figures found for "
            f"{_esc(product_title)}. Open <a href='00-COVER-NARRATIVE.html'>cover</a>.</p>"
            f"</body></html>",
            encoding="utf-8",
        )
        return {"illustrated_html": str(stub), "figures": [], "embedded_bytes": 0}

    decisions_html = "".join(f"<li>{_esc(b)}</li>" for b in (decision_bullets or []))
    open_html = ""
    if open_items:
        open_html = "<h2>Open items / partner asks</h2><ul>" + "".join(
            f"<li>{_esc(x)}</li>" for x in open_items
        ) + "</ul>"
    rows_cfg = "".join(
        f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>"
        for k, v in [
            ("Pack revision", pack_revision),
            ("Release date", release),
            ("Digital model (twin)", twin_id),
            ("Ship status", status),
            *((config_extra or [])),
        ]
    )
    body_html = ""
    for title, body in body_sections or []:
        body_html += f"<h2>{_esc(title)}</h2><p>{_esc(body)}</p>"

    total_embed = 0
    figure_blocks: list[str] = []
    for rel, caption in figs:
        path = pack / rel
        if not path.is_file():
            continue
        data_uri, _w, _h = _image_to_data_uri(path)
        # rough size of data uri payload
        total_embed += max(0, len(data_uri) - 32)
        figure_blocks.append(
            f'<figure class="fig">'
            f'<a class="L" href="{_esc(rel)}"><img src="{data_uri}" alt="{_esc(caption)}"/></a>'
            f'<figcaption>{_esc(caption)} · '
            f'<a class="L" href="{_esc(rel)}"><code>{_esc(rel)}</code></a></figcaption>'
            f"</figure>"
        )

    map_html = ""
    if folder_map:
        rows = "".join(
            f'<tr><td>{_esc(a)}</td><td><a href="{_esc(p)}"><code>{_esc(p)}</code></a></td>'
            f"<td>{_esc(w)}</td></tr>"
            for a, p, w in folder_map
        )
        map_html = (
            "<h2>Folder map</h2><table><thead><tr><th>Area</th><th>Entry</th>"
            f"<th>Supports</th></tr></thead><tbody>{rows}</tbody></table>"
        )

    html = f"""<!DOCTYPE html>
<html lang="en-GB"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{_esc(product_title)} · {_esc(brand)} · {_esc(pack_revision)}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; background: #fff; max-width: 960px; margin: 1.5rem auto; padding: 0 1.25rem;
         line-height: 1.45; }}
  h1 {{ font-size: 1.55rem; margin-bottom: 0.2rem; }}
  h2 {{ font-size: 1.12rem; margin-top: 1.6rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.2rem; }}
  table {{ border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.1rem; font-size: 0.93rem; }}
  th, td {{ border: 1px solid #ddd; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }}
  th {{ background: #f6f6f6; width: 30%; }}
  .brand {{ color: #444; margin-bottom: 1rem; }}
  .fig {{ margin: 1.25rem 0; }}
  .fig img {{ width: 100%; height: auto; border: 1px solid #ccc; display: block; background: #fafafa; }}
  figcaption {{ font-size: 0.85rem; color: #333; margin-top: 0.4rem; }}
  a.L {{ color: #0b57d0; text-decoration: none; }}
  a.L:hover {{ text-decoration: underline; }}
  .route {{ background: #f8f8f8; padding: 0.75rem 1rem; border-left: 3px solid #222; }}
  .foot {{ margin-top: 2rem; color: #666; font-size: 0.82rem; }}
</style>
</head>
<body>
<h1>{_esc(product_title)}</h1>
<p class="brand"><strong>{_esc(brand)}</strong> design pack · {_esc(pack_revision)} · {_esc(release)}
 · illustrated cover (figures embedded for offline share)</p>
<p>Links are relative (for example <code>renders/00-hero.png</code>). They travel with the zip
and do not depend on anyone’s computer path. Full-resolution sources sit beside this HTML.</p>
<h2>Configuration</h2>
<table>{rows_cfg}</table>
<h2>Decision summary</h2>
<ol>{decisions_html}</ol>
{open_html}
<h2>Key figures</h2>
{"".join(figure_blocks)}
{map_html}
{f'<p class="route"><strong>Ten-minute route:</strong> {_esc(ten_minute_route)}</p>' if ten_minute_route else ''}
{body_html}
<p class="foot">Generated by Anvil <code>build_pack_cover.write_illustrated_cover</code>.
 Embedded payload ≈ {total_embed // 1024} KB across {len(figure_blocks)} figures.
 Thin navigation cover: <a class="L" href="00-COVER-NARRATIVE.html">00-COVER-NARRATIVE.html</a>.</p>
</body>
</html>
"""
    out = pack / "00-COVER-NARRATIVE-illustrated.html"
    out.write_text(html, encoding="utf-8")
    return {
        "illustrated_html": str(out),
        "figures": [r for r, _ in figs],
        "embedded_bytes": total_embed,
    }


def upgrade_pack_cover_illustration(
    pack: Path | str,
    *,
    product_title: str | None = None,
    pack_revision: str | None = None,
    brand: str = "Anvil",
    twin_id: str = "",
    ship_ok: bool | None = None,
) -> dict[str, Any]:
    """Upgrade an existing pack cover with illustrated HTML + figure PDF pages.

    Reads decision bullets from existing 00-COVER-NARRATIVE.md when present so
    chrome re-application does not wipe narrative. Safe to call from
    ``apply_send_pack_chrome``.
    """
    pack = Path(pack)
    md_path = pack / "00-COVER-NARRATIVE.md"
    title = product_title or pack.name
    revision = pack_revision or "V1"
    decisions: list[str] = []
    open_items: list[str] = []
    if md_path.is_file():
        text = md_path.read_text(encoding="utf-8", errors="replace")
        # Title
        for line in text.splitlines():
            if line.startswith("# "):
                title = line[2:].strip() or title
                break
        # Pack revision
        m = re.search(r"Pack revision\s*\|\s*\*\*([^*]+)\*\*", text)
        if m:
            revision = m.group(1).strip()
        # Decision bullets: lines starting with **N.**
        for m in re.finditer(r"\*\*\d+\.\*\*\s*(.+)", text):
            decisions.append(m.group(1).strip())
        # Open items under ### Open items
        in_open = False
        for line in text.splitlines():
            if line.strip().startswith("### Open"):
                in_open = True
                continue
            if in_open:
                if line.startswith("##") or line.startswith("---"):
                    break
                if line.strip().startswith("- "):
                    open_items.append(line.strip()[2:].strip())
    if not decisions:
        decisions = ["See dossier.xlsx and MANIFEST.txt for the engineering case."]

    status = (
        "ship_ok = true"
        if ship_ok is True
        else "ship_ok = false"
        if ship_ok is False
        else "see cover for ship status"
    )
    figures = discover_pack_figures(pack)
    folder_map: list[tuple[str, str, str]] = [
        ("Cover", "00-COVER-NARRATIVE.html", "Narrative"),
        ("Illustrated", "00-COVER-NARRATIVE-illustrated.html", "Embedded figures"),
        ("Workbook", "dossier.xlsx", "Engineering dossier") if (pack / "dossier.xlsx").is_file()
        else ("Inventory", "MANIFEST.txt", "File list"),
    ]
    if (pack / "renders").is_dir():
        folder_map.append(("Renders", "renders/", "Product views"))
    if (pack / "drawings").is_dir():
        folder_map.append(("Drawings", "drawings/", "GA / interconnect"))
    if (pack / "instrument-physics").is_dir():
        folder_map.append(("Physics", "instrument-physics/", "Instrument one-pagers"))
    if (pack / "electromagnetics").is_dir():
        folder_map.append(("EM", "electromagnetics/", "Field / torque evidence"))

    illust = write_illustrated_cover(
        pack,
        product_title=title,
        brand=brand,
        pack_revision=revision,
        status=status,
        twin_id=twin_id or pack.parent.name,
        decision_bullets=decisions,
        open_items=open_items,
        folder_map=folder_map,
        figures=figures,
    )
    pdf_path = pack / "00-COVER-NARRATIVE.pdf"
    if fitz is not None and figures:
        _write_illustrated_pdf(
            pdf_path,
            title=title,
            brand=brand,
            revision=revision,
            release=date.today().isoformat(),
            status=status,
            twin_id=twin_id or pack.parent.name,
            decisions=decisions,
            folder_map=folder_map,
            open_items=open_items,
            ten_minute_route=None,
            figures=figures,
            pack=pack,
        )
        illust["pdf"] = str(pdf_path)
    # Ensure thin HTML links to illustrated if it already exists
    thin = pack / "00-COVER-NARRATIVE.html"
    if thin.is_file():
        html = thin.read_text(encoding="utf-8", errors="replace")
        if "00-COVER-NARRATIVE-illustrated.html" not in html:
            inject = (
                '<p class="note">Self-contained illustrated cover: '
                '<a href="00-COVER-NARRATIVE-illustrated.html">'
                "00-COVER-NARRATIVE-illustrated.html</a></p>\n"
            )
            html = html.replace("</h1>", "</h1>\n" + inject, 1)
            thin.write_text(html, encoding="utf-8")
    return illust


def _write_simple_pdf(
    pdf_path: Path,
    *,
    title: str,
    brand: str,
    revision: str,
    release: str,
    status: str,
    twin_id: str,
    decisions: list[str],
    folder_map: list[tuple[str, str, str]],
    open_items: list[str],
    ten_minute_route: str | None,
) -> None:
    """Light multi-page PDF with relative path table (no absolute paths)."""
    _write_illustrated_pdf(
        pdf_path,
        title=title,
        brand=brand,
        revision=revision,
        release=release,
        status=status,
        twin_id=twin_id,
        decisions=decisions,
        folder_map=folder_map,
        open_items=open_items,
        ten_minute_route=ten_minute_route,
        figures=[],
        pack=pdf_path.parent,
    )


def _write_illustrated_pdf(
    pdf_path: Path,
    *,
    title: str,
    brand: str,
    revision: str,
    release: str,
    status: str,
    twin_id: str,
    decisions: list[str],
    folder_map: list[tuple[str, str, str]],
    open_items: list[str],
    ten_minute_route: str | None,
    figures: Sequence[tuple[str, str]],
    pack: Path,
) -> None:
    """Multi-page PDF: narrative then one figure per page (when available)."""
    assert fitz is not None
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    y = 50

    def write(text: str, size: float = 10, bold: bool = False) -> None:
        nonlocal y, page
        if y > 800:
            page = doc.new_page(width=595, height=842)
            y = 50
        font = "helv"
        page.insert_text((50, y), text[:110], fontsize=size, fontname=font)
        y += size + 6

    write(title, 16, True)
    write(f"{brand} design pack  ·  {revision}  ·  {release}", 11)
    write(f"Twin: {twin_id}", 10)
    write(f"Status: {status}", 10)
    y += 8
    write("Decision summary", 13, True)
    for i, d in enumerate(decisions, 1):
        chunk = d
        first = True
        while chunk:
            write(f"{i}. {chunk[:95]}" if first else f"   {chunk[:95]}", 9)
            chunk = chunk[95:]
            first = False
    if open_items:
        y += 6
        write("Open items", 12, True)
        for item in open_items:
            write(f"• {item[:100]}", 9)
    y += 8
    write("Folder map (paths relative to this pack)", 12, True)
    for area, path, what in folder_map:
        write(f"{area}: {path}", 9)
        write(f"    {what[:100]}", 8)
    if ten_minute_route:
        y += 8
        write("Ten-minute route", 12, True)
        chunk = ten_minute_route
        while chunk:
            write(chunk[:100], 9)
            chunk = chunk[100:]
    y += 12
    write("All links in the HTML cover are pack-relative.", 8)
    write("Generated by Anvil build_pack_cover.", 8)
    if figures:
        write(f"Following pages: {len(figures)} key figures.", 9)

    # Figure pages — re-encode to JPEG temp bytes for reasonable PDF size
    for rel, caption in figures:
        src = Path(pack) / rel
        if not src.is_file():
            continue
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 40), caption[:90], fontsize=11, fontname="helv")
        page.insert_text((50, 56), rel[:100], fontsize=8, fontname="helv")
        try:
            if Image is not None:
                data_uri, _w, _h = _image_to_data_uri(src, max_edge=1600, jpeg_quality=85)
                # strip data URI header
                b64 = data_uri.split(",", 1)[1]
                img_bytes = base64.b64decode(b64)
                rect = fitz.Rect(40, 70, 555, 800)
                page.insert_image(rect, stream=img_bytes, keep_proportion=True)
            else:
                rect = fitz.Rect(40, 70, 555, 800)
                page.insert_image(rect, filename=str(src), keep_proportion=True)
        except Exception as exc:  # pragma: no cover
            page.insert_text((50, 100), f"(figure embed failed: {exc})", fontsize=9)

    doc.save(str(pdf_path))
    doc.close()


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        p = Path(td)
        (p / "MANIFEST.txt").write_text("x\n")
        (p / "dossier.xlsx").write_bytes(b"PK")
        rend = p / "renders"
        rend.mkdir()
        # tiny valid PNG (1x1)
        png_1x1 = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        (rend / "00-hero.png").write_bytes(png_1x1)
        r = build_pack_cover(
            pack_dir=p,
            product_title="Selftest Pack",
            twin_id="selftest",
            pack_revision="V0",
            ship_ok=False,
            decision_bullets=["Selftest only."],
            folder_map=[("Inventory", "MANIFEST.txt", "list")],
        )
        assert Path(r["html"]).is_file()
        assert Path(r["illustrated_html"]).is_file()
        assert "data:image" in Path(r["illustrated_html"]).read_text()
        assert not assert_relative_hrefs(Path(r["html"]), p)
        print("build_pack_cover selftest OK", r)
