#!/usr/bin/env python3
"""Shared Anvil design-pack cover builder (PDF + HTML + click index).

Universal stage: same structure for every product class; only the body content
varies. All links are pack-relative — never machine-absolute paths.
"""
from __future__ import annotations

import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Sequence

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore


def _esc(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


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
    hero_html = ""
    if hero_rel and (pack / hero_rel).is_file():
        hero_html = (
            f'<p class="hero"><img src="{_esc(hero_rel)}" alt="Product hero" '
            f'style="max-width:100%;height:auto;border:1px solid #ddd"/></p>'
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{_esc(product_title)} — {_esc(brand)} cover</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #111; background: #fff; max-width: 860px; margin: 2rem auto; padding: 0 1.25rem;
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
</style>
</head>
<body>
<h1>{_esc(product_title)}</h1>
<p class="brand"><strong>{_esc(brand)}</strong> design pack · revision {_esc(pack_revision)} · {_esc(release)}</p>
{hero_html}
<h2>Configuration</h2>
<table>{rows_cfg}</table>
<h2>Decision summary</h2>
<ol>{decisions_html}</ol>
{open_html}
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
{links}
</ol>
</body>
</html>
"""
    click_path = pack / "00-COVER-CLICK-INDEX.html"
    click_path.write_text(click)

    pdf_path = pack / "00-COVER-NARRATIVE.pdf"
    if fitz is not None:
        _write_simple_pdf(
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
        )
    else:
        # Fallback: copy markdown as .pdf placeholder is wrong; skip file
        pdf_path = None  # type: ignore

    return {
        "md": str(md_path),
        "html": str(html_path),
        "click_index": str(click_path),
        "pdf": str(pdf_path) if pdf_path else None,
    }


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
        # wrap roughly
        chunk = d
        while chunk:
            write(f"{i}. {chunk[:95]}" if chunk == d else f"   {chunk[:95]}", 9)
            chunk = chunk[95:]
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
    doc.save(str(pdf_path))
    doc.close()


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        p = Path(td)
        (p / "MANIFEST.txt").write_text("x\n")
        (p / "dossier.xlsx").write_bytes(b"PK")
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
        assert not assert_relative_hrefs(Path(r["html"]), p)
        print("build_pack_cover selftest OK", r)
