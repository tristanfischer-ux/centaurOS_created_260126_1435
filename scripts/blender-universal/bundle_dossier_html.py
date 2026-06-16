#!/usr/bin/env python3
"""
bundle_dossier_html.py <run_dir> [--no-renders]

Produce ONE self-contained, shareable HTML for a client (e.g. FishFrom): the run
dashboard + the full parts ledger + every engineering drawing inlined as base64,
so it opens in any browser offline with nothing to install and no broken image
links. Email it, or drop it on any static host.

The 3-D Blender renders are large; --no-renders swaps them for a one-line note to
keep the file email-friendly (drawings + ledger are the engineering content).

OUTPUT: <run_dir>/<run_name>-dossier.html  (single file)
"""
from __future__ import annotations

import base64
import mimetypes
import re
import sys
from pathlib import Path

RENDER_RE = re.compile(r"(00-hero|inspect-|module-|blender-cover|cover\.png|palette|tools-flow)", re.I)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: bundle_dossier_html.py <run_dir> [--no-renders]", file=sys.stderr)
        return 2
    run = Path(sys.argv[1]).resolve()
    drop_renders = "--no-renders" in sys.argv
    compress = "--compress" in sys.argv
    dash_path = run / "dashboard.html"
    if not dash_path.is_file():
        print(f"no dashboard.html in {run}", file=sys.stderr)
        return 1

    inlined = {"n": 0, "bytes": 0, "skipped": 0}

    def inline_images(html: str) -> str:
        def repl(m: re.Match) -> str:
            src = m.group(1)
            if src.startswith(("data:", "http://", "https://")):
                return m.group(0)
            p = (run / src).resolve()
            if not p.is_file():
                return m.group(0)
            if drop_renders and RENDER_RE.search(p.name):
                inlined["skipped"] += 1
                return ('src="data:image/svg+xml;base64,' + base64.b64encode(
                    b'<svg xmlns="http://www.w3.org/2000/svg" width="700" height="80">'
                    b'<rect width="100%" height="100%" fill="#eef1f5"/><text x="50%" y="50%" '
                    b'fill="#7a828d" font-family="sans-serif" font-size="13" text-anchor="middle" '
                    b'dominant-baseline="middle">3-D render omitted to keep the file small</text></svg>'
                ).decode() + '"')
            data = p.read_bytes()
            mime = mimetypes.guess_type(str(p))[0] or "image/png"
            if compress and p.suffix.lower() in (".png", ".jpg", ".jpeg"):
                try:
                    from PIL import Image
                    import io
                    im = Image.open(io.BytesIO(data)).convert("RGB")
                    if im.width > 1500:
                        im = im.resize((1500, round(im.height * 1500 / im.width)), Image.LANCZOS)
                    buf = io.BytesIO()
                    im.save(buf, "JPEG", quality=78, optimize=True)
                    data, mime = buf.getvalue(), "image/jpeg"
                except Exception:
                    pass
            b64 = base64.b64encode(data).decode()
            inlined["n"] += 1
            inlined["bytes"] += len(data)
            return f'src="data:{mime};base64,{b64}"'
        return re.sub(r'src="([^"]+)"', repl, html)

    dash = inline_images(dash_path.read_text(errors="ignore"))

    # fold the full parts ledger in as a section so it travels in the one file
    led_path = run / "parts-ledger.html"
    if led_path.is_file():
        led = inline_images(led_path.read_text(errors="ignore"))
        m = re.search(r"<body[^>]*>(.*)</body>", led, re.S)
        led_body = m.group(1) if m else led
        dash = dash.replace("</body>",
                            f'<hr style="margin:40px 0"><div id="full-ledger">{led_body}</div></body>')
        # the TOC link now points at the inlined section, not a separate file
        dash = dash.replace('href="parts-ledger.html" target="_blank"', 'href="#full-ledger"')

    out = run / f"{run.name}-dossier.html"
    out.write_text(dash)
    kb = out.stat().st_size // 1024
    print(f"wrote {out}")
    print(f"  self-contained: {inlined['n']} images inlined ({inlined['bytes']//1024} KB raw), "
          f"{inlined['skipped']} renders omitted — final {kb} KB"
          + ("  (EMAIL-FRIENDLY)" if kb < 20000 else "  (LARGE — consider --no-renders or a hosted link)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
