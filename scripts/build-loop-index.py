#!/usr/bin/env python3
"""build-loop-index.py — the recursive-improvement loop INDEX Tristan opens to look back.

Reads out/loop-ledger.json (one entry per round), copies each round's self-contained
evidence page into ~/Downloads/forgeos-loop/, and builds index.html there with — per
round — the Blender hero thumbnail, the harsh FLOOR score, my honest visual self-check
(what works / what an experienced engineer would still flag), and a link to the full
page (Blender + all 8 drawings + the full priced BoM). Light theme. Self-contained.

Usage: python3 scripts/build-loop-index.py   (then `open` the printed path)
"""
import base64, json, shutil, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEST = Path.home() / "Downloads" / "forgeos-loop"
DEST.mkdir(parents=True, exist_ok=True)


def thumb(png: Path, width=560) -> str | None:
    """Downscaled JPEG thumbnail so the index loads instantly (the full-res render lives
    on the round page). Falls back to raw PNG if PIL is unavailable."""
    if not png.exists() or png.stat().st_size < 200:
        return None
    try:
        from PIL import Image
        import io
        im = Image.open(png).convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"
    except Exception:
        return f"data:image/png;base64,{base64.b64encode(png.read_bytes()).decode('ascii')}"


def main() -> int:
    ledger = json.loads((REPO / "out" / "loop-ledger.json").read_text())
    cards = ""
    for r in ledger:
        rdir = REPO / r["dir"]
        # copy the full self-contained round page into the Downloads folder
        src_page = REPO / "out" / r["page"]
        if src_page.exists():
            shutil.copy(src_page, DEST / r["page"])
        hero = None
        for name in ("inspect-hero.png", "00-hero.png", "inspect-iso.png"):
            if (rdir / name).exists():
                hero = thumb(rdir / name)
                break
        floor = r.get("floor", "—")
        fcls = "hi" if isinstance(floor, int) and floor >= 8 else "lo" if isinstance(floor, int) and floor < 6 else "mid"
        good = "".join(f"<li>{g}</li>" for g in r.get("good", []))
        bad = "".join(f"<li>{b}</li>" for b in r.get("bad", []))
        img = f'<a href="{r["page"]}"><img src="{hero}"></a>' if hero else '<div class="noimg">no render</div>'
        cards += f"""
        <section class="card">
          <div class="thumb">{img}</div>
          <div class="body">
            <div class="hd">
              <h2>Round {r['n']} — {r['label']}</h2>
              <span class="floor {fcls}">floor {floor}/10</span>
            </div>
            <p class="headline">{r.get('headline','')}</p>
            <div class="cols">
              <div><h3 class="g">What works</h3><ul class="g">{good}</ul></div>
              <div><h3 class="b">What an engineer would still flag</h3><ul class="b">{bad}</ul></div>
            </div>
            <p class="link"><a href="{r['page']}">Open the full Round {r['n']} page →</a> <span class="note">(Blender model + all 8 engineering drawings + the full priced bill of materials)</span></p>
          </div>
        </section>"""

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>ForgeOS — recursive improvement loop</title>
<style>
 body{{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#f4f6f8;max-width:1080px;margin:0 auto;padding:26px 22px;line-height:1.5}}
 h1{{font-size:24px;margin:0 0 2px}} .sub{{color:#666;margin:0 0 22px}}
 .card{{display:flex;gap:18px;background:#fff;border:1px solid #e3e8ee;border-radius:12px;padding:16px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.04)}}
 .thumb{{flex:0 0 300px}} .thumb img{{width:300px;border:1px solid #e3e8ee;border-radius:8px;display:block}}
 .noimg{{width:300px;height:200px;display:flex;align-items:center;justify-content:center;color:#c0392b;background:#fff5f5;border:1px dashed #f0b0b0;border-radius:8px}}
 .body{{flex:1;min-width:0}}
 .hd{{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f6;padding-bottom:6px}}
 h2{{font-size:17px;margin:0}}
 .floor{{font-size:13px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap}}
 .floor.lo{{color:#fff;background:#c0392b}} .floor.mid{{color:#fff;background:#d08a00}} .floor.hi{{color:#fff;background:#0a7a33}}
 .headline{{color:#444;font-size:13.5px;margin:8px 0 10px;font-style:italic}}
 .cols{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
 h3{{font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}}
 h3.g{{color:#0a7a33}} h3.b{{color:#c0392b}}
 ul{{margin:0;padding-left:16px;font-size:12.5px}} ul.g li{{margin-bottom:3px}} ul.b li{{margin-bottom:3px;color:#7a2018}}
 .link{{margin:12px 0 0;font-size:13px}} .link a{{font-weight:600;color:#1257b0;text-decoration:none}} .note{{color:#888;font-size:11.5px}}
 .aim{{background:#fff;border:1px solid #e3e8ee;border-radius:12px;padding:14px 18px;margin-bottom:18px;font-size:13.5px;color:#333}}
</style></head><body>
<h1>ForgeOS — recursive self-improvement loop</h1>
<p class="sub">Deterministic engine → Blender → bill of materials, scored harshly on the FLOOR (the worst dimension), driving toward a design a 20-year engineer would be thrilled with. Universal across archetypes. Test archetype: yellowtail-kingfish RAS (204 t/yr, £5M ceiling).</p>
<div class="aim"><b>How to read this:</b> each round below shows the real engine output — click any round to see the Blender 3D model, all 8 engineering drawings, and the full priced bill of materials. The green/red lists are my own honest visual check of that round (not a claim that it's done).</div>
{cards}
<p class="sub">Generated by scripts/build-loop-index.py · light theme · {len(ledger)} round(s) so far.</p>
</body></html>"""

    out = DEST / "index.html"
    out.write_text(html)
    print(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
