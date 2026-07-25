"""PHANTM — deliverable packager (codified 25 Jul; previously ad hoc).

md → inline every local image as a data URI (show-md renders markdown from a
JS string, so <img> src must be self-contained) → styled standalone HTML via
show-md's own render() → PDF via headless Chrome → zip with the calc workbook
and Tony's CAD.

Run: ~/.venvs/phantm/bin/python package.py
"""
import base64
import importlib.util
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ZIP_NAME = "PHANTM-actuator-report-2026-07-25.zip"

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

pdf_path = os.path.join(OUT, "PHANTM-actuator-report.pdf")
r = subprocess.run([CHROME, "--headless", "--disable-gpu",
                    "--virtual-time-budget=20000",
                    f"--print-to-pdf={pdf_path}", f"file://{html_path}"],
                   capture_output=True, text=True, timeout=180)
ok_pdf = os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 500_000
print(f"PDF {'OK' if ok_pdf else 'FAILED'} ({os.path.getsize(pdf_path)//1024} KB)")
if not ok_pdf:
    sys.exit(1)

zip_dir = os.path.expanduser("~/Downloads")
if not os.access(zip_dir, os.W_OK):
    zip_dir = OUT
zip_path = os.path.join(zip_dir, ZIP_NAME)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ("PHANTM-report-standalone.html", "PHANTM-actuator-report.pdf",
              "PHANTM-CALC.xlsx", "tony-24hex-subarray.stl",
              "tony-7hex-subarray.stl", "tony-24hex-subarray.skp"):
        z.write(os.path.join(OUT, f), f)
print(f"wrote {zip_path} ({os.path.getsize(zip_path)//1024//1024} MB)")
