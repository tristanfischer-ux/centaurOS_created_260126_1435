"""PHANTM v2 — package the client deliverable: markdown -> HTML -> PDF -> zip.

WHY THE PRINT CSS IS FUSSY. show-md makes wide tables scroll horizontally,
which print silently CLIPS at the page edge, so the stylesheet has to put
tables back into normal flow. The obvious way to do that — word-break:
break-word with overflow-wrap: anywhere — then produces the opposite defect: a
narrow first column breaks words mid-syllable ("Photochem / ical etch"), which
is legible but looks careless in a document going to a client. So breaking is
allowed only at real word boundaries, with hyphens: auto for genuine syllable
breaks, and the first column of each table is given room to breathe.

Run: ~/.venvs/phantm/bin/python tony_v2_package.py
"""

from __future__ import annotations

import datetime
import importlib.util
import json
import os
import subprocess
import zipfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC_MD = "PHANTM-TONY-V2-ANSWER.md"

PRINT_CSS = """
<style>
@media print {
  body { max-width: 100% !important; padding: 20px 12px !important;
         font-size: 12.5px; }
  /* tables back into normal flow — scrolling tables get clipped in print */
  table { display: table !important; width: 100% !important;
          overflow-x: visible !important; table-layout: auto;
          font-size: 10.5px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  /* Break at word boundaries and real syllables ONLY. `anywhere` snaps words
     in half when a column is narrow, which reads as sloppy. */
  th, td { padding: 4px 6px !important; word-break: normal;
           overflow-wrap: break-word; hyphens: auto; vertical-align: top; }
  /* give the first column of a table room so route/quantity names stay whole */
  td:first-child, th:first-child { min-width: 8.5em; }
  pre { white-space: pre-wrap; word-break: normal; }
  h1, h2, h3 { break-after: avoid; }
  blockquote { break-inside: avoid; }
}
</style>
"""


def render_html(md_name: str) -> str:
    # show-md has no .py extension, so spec_from_file_location cannot infer a
    # loader — name it explicitly (same pattern as package.py).
    from importlib.machinery import SourceFileLoader
    ldr = SourceFileLoader("show_md",
                           os.path.expanduser("~/.claude/scripts/show-md"))
    show_md = importlib.util.module_from_spec(
        importlib.util.spec_from_loader("show_md", ldr))
    ldr.exec_module(show_md)
    html = show_md.render(Path(os.path.join(OUT, md_name)))
    t = open(html).read()
    assert "</head>" in t, "no </head> to inject print CSS into"
    # replace any previously injected block rather than stacking them
    if "@media print" in t:
        import re
        t = re.sub(r"<style>\s*@media print.*?</style>", "", t,
                   flags=re.S)
    open(html, "w").write(t.replace("</head>", PRINT_CSS + "</head>", 1))
    return str(html)


def to_pdf(html: str, pdf: str, min_bytes: int = 40_000) -> bool:
    subprocess.run([CHROME, "--headless", "--disable-gpu",
                    "--virtual-time-budget=20000",
                    f"--print-to-pdf={pdf}", f"file://{os.path.abspath(html)}"],
                   capture_output=True, timeout=180)
    return os.path.exists(pdf) and os.path.getsize(pdf) > min_bytes


def verify_pdf(pdf: str, probes: list[str]) -> list[str]:
    """Extract the PDF text and confirm key phrases survived rendering.

    This is the check that caught the mid-word break: a phrase present in the
    markdown but absent from the PDF means the renderer did something to it.
    """
    try:
        import pypdf
    except ImportError:
        import sys
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pypdf"],
                       check=False)
        import pypdf
    txt = "\n".join(p.extract_text() for p in pypdf.PdfReader(pdf).pages)
    # Rejoin LEGITIMATE end-of-line hyphenation ("injec-\ntion" -> "injection")
    # before matching. Deliberately narrow: a break with NO hyphen is left
    # alone, so the defect this check exists for — a column so tight that a
    # word snaps mid-syllable unhyphenated ("Photochem" / "ical") — still
    # fails. Normalising everything would blunt the check into uselessness.
    import re
    txt = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", txt)
    flat = " ".join(txt.split())
    return [p for p in probes if p not in flat]


def main():
    ver = json.load(open(os.path.join(HERE, "version.json")))
    tag = f"{datetime.datetime.now():%Y%m%d-%H%M}-V{ver['major']}.{ver['minor']}"

    html = render_html(SRC_MD)
    pdf = os.path.join(OUT, "PHANTM-TONY-V2-ANSWER.pdf")
    ok = to_pdf(html, pdf)
    print(f"PDF {'OK' if ok else 'THIN'} "
          f"({os.path.getsize(pdf)//1024 if os.path.exists(pdf) else 0} KB)")

    probes = ["Photochemical etch and stack", "Halve the gap to 30",
              "both targets met, with margin", "Fine blanking and stack",
              "Micro metal injection moulding", "pre-wound coil",
              "Wire electro-discharge machining", "Sintered ferrite",
              "Is a 30 µm gap acceptable"]
    missing = verify_pdf(pdf, probes)
    if missing:
        print("  PDF text check FAILED — these phrases did not survive "
              "rendering (usually a column too narrow, breaking words):")
        for m in missing:
            print(f"    missing: {m!r}")
        raise SystemExit(1)
    print(f"  PDF text check: all {len(probes)} phrases intact")

    xl = sorted(f for f in os.listdir(OUT)
                if f.endswith(".xlsx") and "TONY-V2-CALC" in f)[-1]
    manifest = [
        ("PHANTM-TONY-V2-ANSWER.pdf",  f"1-PHANTM-actuator-report-{tag}.pdf"),
        ("PHANTM-TONY-V2-ANSWER.html", f"1-PHANTM-actuator-report-{tag}.html"),
        ("PHANTM-TONY-V2-ANSWER.md",   f"1-PHANTM-actuator-report-{tag}.md"),
        (xl,                            f"2-PHANTM-calculations-{tag}.xlsx"),
    ]
    dest = os.path.expanduser("~/Downloads")
    zp = os.path.join(dest if os.access(dest, os.W_OK) else OUT,
                      f"PHANTM-actuator-{tag}.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for src, arc in manifest:
            z.write(os.path.join(OUT, src), arc)
    print(f"wrote {zp} ({os.path.getsize(zp)//1024} KB)")
    for _, a in manifest:
        print(f"    {a}")


if __name__ == "__main__":
    main()
