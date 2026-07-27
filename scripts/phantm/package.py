"""PHANTM — deliverable packager (codified 25 Jul; previously ad hoc).

md → inline every local image as a data URI (show-md renders markdown from a
JS string, so <img> src must be self-contained) → styled standalone HTML via
show-md's own render() → PDF via headless Chrome → zip with the calc workbook
and Tony's CAD.

Run: ~/.venvs/phantm/bin/python package.py
"""
import base64
import datetime
import importlib.util
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# ---- sequential version + datetime stamp in every deliverable NAME ---------
# (Tony 25 Jul: "multiple files with identical names is a documentation
# nightmare... a fully sequential version number is the most effective —
# V1.3, 1.31 — a date and timestamp is good too". So: BOTH.)
_vp = os.path.join(HERE, "version.json")
_v = json.load(open(_vp))
_v["minor"] += 1
json.dump(_v, open(_vp, "w"), indent=1)
VER = f"V{_v['major']}.{_v['minor']}"
STAMP = datetime.datetime.now().strftime("%Y%m%d-%H%M")
TAG = f"{VER}-{STAMP}"
ZIP_NAME = f"PHANTM-report-{TAG}.zip"
print(f"build {TAG}")

# v7 split (Tony, 26 Jul): the deliverable is a current-design report plus a
# companion archive. Both get the same treatment — inlined images, build stamp,
# styled HTML, PDF — so neither is a second-class artefact.
DOCS = [
    ("PHANTM-ACTUATOR-REPORT.md", "report", "current design and analysis"),
    ("PHANTM-ARCHIVE.md", "archive", "history, kills, manufacture, suppliers"),
]

md = open(os.path.join(OUT, "PHANTM-ACTUATOR-REPORT.md")).read()


def inline(m):
    alt, src = m.group(1), m.group(2)
    if src.startswith("data:") or src.startswith("http"):
        return m.group(0)
    p = os.path.join(OUT, src)
    if not os.path.exists(p):
        print(f"  WARN missing image {src}")
        return m.group(0)
    b64 = base64.b64encode(open(p, "rb").read()).decode()
    return f"![{alt}](data:image/png;base64,{b64})"


md_inline = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", inline, md)
# stamp the build tag INSIDE the document so content and filename cross-check
first_nl = md_inline.index("\n")
md_inline = (md_inline[:first_nl]
             + f"\n\n**Build {TAG}** — filename of record: "
             f"`PHANTM-report-{TAG}.pdf` / `.html`; calculator "
             f"`PHANTM-CALC-{TAG}.xlsx`. Supersedes every earlier build."
             + md_inline[first_nl:])
n_imgs = md_inline.count("data:image/png")
sa_md = os.path.join(OUT, "PHANTM-report-standalone.md")
open(sa_md, "w").write(md_inline)
print(f"inlined {n_imgs} images")

from importlib.machinery import SourceFileLoader  # noqa: E402
loader = SourceFileLoader("show_md", os.path.expanduser("~/.claude/scripts/show-md"))
spec = importlib.util.spec_from_loader("show_md", loader)
show_md = importlib.util.module_from_spec(spec)
loader.exec_module(show_md)
from pathlib import Path  # noqa: E402
html_path = show_md.render(Path(sa_md))
print(f"wrote {html_path}")

# ---- print stylesheet: show-md makes wide tables scroll horizontally, which
# PRINT clips at the page edge (Tristan 25 Jul: fabricator tables cut off).
# Force print tables back to normal flow, full width, with wrapped cells.
PRINT_CSS = """
<style>
@media print {
  body { max-width: 100% !important; padding: 24px 8px !important; font-size: 13px; }
  table { display: table !important; width: 100% !important;
          overflow-x: visible !important; font-size: 9.5px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { padding: 3px 5px !important; word-break: break-word;
           overflow-wrap: anywhere; hyphens: auto; }
  pre { white-space: pre-wrap; word-break: break-word; }
  h1, h2, h3 { break-after: avoid; }
}
</style>
"""
html_txt = open(html_path).read()
assert "</head>" in html_txt, "no </head> to inject print CSS into"
open(html_path, "w").write(html_txt.replace("</head>", PRINT_CSS + "</head>", 1))
print("injected print stylesheet (tables fit page width)")

pdf_path = os.path.join(OUT, "PHANTM-actuator-report.pdf")
r = subprocess.run([CHROME, "--headless", "--disable-gpu",
                    "--virtual-time-budget=20000",
                    f"--print-to-pdf={pdf_path}", f"file://{html_path}"],
                   capture_output=True, text=True, timeout=180)
ok_pdf = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 500_000
print(f"PDF {'OK' if ok_pdf else 'FAILED'} ({os.path.getsize(pdf_path)//1024} KB)")
if not ok_pdf:
    sys.exit(1)


def build_secondary(src_md, slug, min_bytes=20_000):
    """Same pipeline for the companion documents (archive, question packs)."""
    src = os.path.join(OUT, src_md)
    if not os.path.exists(src):
        print(f"  WARN missing {src_md}")
        return None, None
    txt = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", inline, open(src).read())
    nl = txt.index("\n")
    txt = (txt[:nl] + f"\n\n**Build {TAG}** — companion to "
           f"`PHANTM-report-{TAG}.pdf`. Section numbers match that report."
           + txt[nl:])
    tmp = os.path.join(OUT, f"PHANTM-{slug}-standalone.md")
    open(tmp, "w").write(txt)
    hp = show_md.render(Path(tmp))
    h = open(hp).read()
    open(hp, "w").write(h.replace("</head>", PRINT_CSS + "</head>", 1))
    pp = os.path.join(OUT, f"PHANTM-{slug}.pdf")
    subprocess.run([CHROME, "--headless", "--disable-gpu",
                    "--virtual-time-budget=20000",
                    f"--print-to-pdf={pp}", f"file://{hp}"],
                   capture_output=True, text=True, timeout=180)
    ok = os.path.exists(pp) and os.path.getsize(pp) > min_bytes
    print(f"  {slug}: PDF {'OK' if ok else 'THIN'} "
          f"({os.path.getsize(pp)//1024 if os.path.exists(pp) else 0} KB)")
    return os.path.basename(hp), os.path.basename(pp)


SECONDARY = {}
for _src, _slug in (("PHANTM-ARCHIVE.md", "archive"),
                    ("PHANTM-QUESTIONS-TONY.md", "questions-tony"),
                    ("PHANTM-QUESTIONS-VLAD.md", "questions-vlad")):
    SECONDARY[_slug] = build_secondary(_src, _slug)

zip_dir = os.path.expanduser("~/Downloads")
if not os.access(zip_dir, os.W_OK):
    zip_dir = OUT
zip_path = os.path.join(zip_dir, ZIP_NAME)
# working files keep stable names in out/ (the verifier reads them); the
# DELIVERABLE names inside the zip carry the version + timestamp. Tony's own
# CAD keeps its received-date provenance instead of our build tag.
# Ordered so the first three files are the ones to read, in reading order.
MANIFEST = [
    ("PHANTM-report-standalone.html", f"1-PHANTM-CURRENT-DESIGN-{TAG}.html"),
    ("PHANTM-actuator-report.pdf",    f"1-PHANTM-CURRENT-DESIGN-{TAG}.pdf"),
]
for _slug, _label in (("questions-tony", "2-QUESTIONS-FOR-TONY"),
                      ("questions-vlad", "2-QUESTIONS-FOR-VLAD"),
                      ("archive", "3-PHANTM-ARCHIVE-history-and-manufacture")):
    _h, _p = SECONDARY.get(_slug, (None, None))
    if _h:
        MANIFEST.append((_h, f"{_label}-{TAG}.html"))
    if _p:
        MANIFEST.append((_p, f"{_label}-{TAG}.pdf"))
MANIFEST += [
    ("PHANTM-CALC.xlsx",              f"PHANTM-CALC-{TAG}.xlsx"),
    ("tony-24hex-subarray.stl", "tony-24hex-subarray-received-20260724.stl"),
    ("tony-7hex-subarray.stl",  "tony-7hex-subarray-received-20260724.stl"),
    ("tony-24hex-subarray.skp", "tony-24hex-subarray-received-20260724.skp"),
]
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for src, arcname in MANIFEST:
        z.write(os.path.join(OUT, src), arcname)
print(f"wrote {zip_path} ({os.path.getsize(zip_path)//1024//1024} MB)")
print("zip contents: " + ", ".join(a for _, a in MANIFEST))
