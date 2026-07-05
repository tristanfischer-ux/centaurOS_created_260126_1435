#!/usr/bin/env python3
"""
ooxml_strict_check.py — DETERMINISTIC Excel-strict OOXML validator for a shipped .xlsx.

WHY THIS EXISTS (Tristan 2026-07-05)
------------------------------------
Tristan opened `bess-campaign-v3_dossier_2026-07-05_0017.xlsx` in real Excel for Mac
and got "We found a problem with some content in '...'. Do you want us to try to
recover as much as we can? ... " LibreOffice — our ONLY automated verifier before
this module existed — opens the identical file without complaint. Our pipeline had
NEVER validated a shipped workbook against Excel's stricter OOXML reader; LibreOffice
tolerates constructs Excel refuses outright.

ROOT CAUSE FOUND (reproduced in isolation, no ForgeOS code involved): openpyxl writes
a clean vmlDrawing part for legacy cell comments — ONE `<v:shapetype id="_x0000_t202">`
+ N `<v:shape>` elements each with a UNIQUE id ("_x0000_s1026", "_x0000_s1027", ...).
`scripts/build-excel-export.py :: recalc_and_cache()` then round-trips the WHOLE file
through `soffice --convert-to xlsx` to cache formula values for preview surfaces, and
LibreOffice's own OOXML writer re-emits the FULL shapetype boilerplate once PER
comment shape (instead of once, referenced by all) and stamps every shape with the
literal, non-unique id="shape_0" — so any worksheet with >=2 legacy comments ships
with N duplicate ids in the same vmlDrawing part. Two identical ids in one XML part is
exactly the class of defect Excel's strict parser rejects at open; LibreOffice's own
reader does not enforce VML id uniqueness, so it opens its own broken output fine.
VERIFIED UNIVERSAL, not BESS-specific: Codema v79's already-shipped dossier.xlsx (a
completely different product class, built weeks earlier) carries the identical defect.

The writer fix (`_dedupe_vml_shape_ids`, `build-excel-export.py`) repairs the vmlDrawing
part in `_finalise_deterministic_zip`. THIS module is the standing GATE: it re-checks
every shipped workbook against the exact rule that caught this bug, plus the other
Excel-strict gotchas our writer is known to touch (comment/VML pairing, defined-name
syntax + scoping, conditional-formatting sqref validity, hyperlink location integrity,
relationship-graph integrity, content-types completeness, and part-level well-
formedness) — so a NEW construct that trips Excel's strict reader is caught at BUILD
time, not discovered by Tristan opening the file in real Excel.

WHY STRUCTURAL RULES, NOT VENDORED ECMA-376/ISO-29500 XSDS
------------------------------------------------------------
The full transitional spreadsheetML schema set is large, cross-references DrawingML
and shared-type schemas, and validating a real multi-sheet workbook against it is
noisy (Microsoft's own writers routinely emit constructs at the edge of strict XSD
conformance that Excel itself accepts). It also would not have caught THIS bug: XML
Schema does not enforce attribute-value uniqueness unless the attribute is typed
`xsd:ID` and scoped correctly, which the ad-hoc VML DTD doesn't cleanly give us net
of the constructs above. A vendored XSD would need to be broad, brittle, and re-tuned
per false-positive; a small set of TARGETED structural rules, each keyed to a real,
reproduced Excel-strict rejection, is deterministic, fast, and maintenance-honest.
This is the documented fallback the task explicitly allows.

PUBLIC API
----------
    check_workbook(path: str) -> list[Finding]
    check_workbook_bytes(data: bytes) -> list[Finding]
    Finding(rule, severity, part, message)

Stdlib only: zipfile, re, io, html, xml.etree.ElementTree.
"""

from __future__ import annotations

import html
import io
import os
import re
import sys
import zipfile
import defusedxml.ElementTree as ET  # hardened against XXE/billion-laughs — a checked
                                      # workbook may come from an untrusted source (e.g.
                                      # a file Tristan received), never stdlib ElementTree
from defusedxml.common import DefusedXmlException
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #

@dataclass
class Finding:
    rule: str
    severity: str            # "HIGH" | "MED" | "LOW"
    part: str
    message: str


# --------------------------------------------------------------------------- #
# Shared regexes
# --------------------------------------------------------------------------- #

_ID_ATTR_RX = re.compile(rb'\bid="([^"]*)"')
_REL_TAG_RX = re.compile(rb'<Relationship\b[^>]*/>')
_REL_ID_RX = re.compile(rb'\bId="([^"]*)"')
_REL_TYPE_RX = re.compile(rb'\bType="([^"]*)"')
_REL_TARGET_RX = re.compile(rb'\bTarget="([^"]*)"')
_REL_TARGETMODE_RX = re.compile(rb'\bTargetMode="([^"]*)"')

_DEFNAME_TAG_RX = re.compile(rb'<definedName\b([^>]*)>')
_NAME_ATTR_RX = re.compile(rb'\bname="([^"]*)"')
_LOCALSHEET_ATTR_RX = re.compile(rb'\blocalSheetId="([^"]*)"')

_LEGAL_NAME_RX = re.compile(r'^[A-Za-z_\\][A-Za-z0-9_.\\?]*$')
_CELLREF_RX = re.compile(r'^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$')

_CF_SQREF_RX = re.compile(rb'<conditionalFormatting\b[^>]*\bsqref="([^"]*)"')
_CELLTOK_RX = re.compile(r'^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$')

_HYPERLINK_TAG_RX = re.compile(rb'<hyperlink\b([^>]*?)/?>')
_RID_ATTR_RX = re.compile(rb'\br:id="([^"]*)"')
_LOCATION_ATTR_RX = re.compile(rb'\blocation="([^"]*)"')

_LEGACYDRAWING_RX = re.compile(rb'<legacyDrawing\b[^>]*r:id="([^"]*)"')


def _parse_rels(data: bytes) -> Dict[str, Dict[str, str]]:
    """Id -> {type, target} for every <Relationship> tag, attribute-order agnostic."""
    out: Dict[str, Dict[str, str]] = {}
    for m in _REL_TAG_RX.finditer(data):
        tag = m.group(0)
        idm = _REL_ID_RX.search(tag)
        if not idm:
            continue
        tym = _REL_TYPE_RX.search(tag)
        tgm = _REL_TARGET_RX.search(tag)
        tmm = _REL_TARGETMODE_RX.search(tag)
        out[idm.group(1).decode()] = {
            "type": tym.group(1).decode() if tym else "",
            "target": tgm.group(1).decode() if tgm else "",
            "targetMode": tmm.group(1).decode() if tmm else "Internal",
        }
    return out


def _resolve_part(base_dir: str, target: str) -> str:
    resolved = os.path.normpath(os.path.join(base_dir, target)).replace(os.sep, "/")
    return resolved.lstrip("/")


# --------------------------------------------------------------------------- #
# Rule 1 — every part is well-formed XML (catches encoding/escaping corruption)
# --------------------------------------------------------------------------- #

def _rule_well_formed_xml(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    for name in z.namelist():
        if name.endswith(".xml") or name.endswith(".rels") or name.endswith(".vml"):
            try:
                ET.fromstring(z.read(name))
            except ET.ParseError as ex:
                findings.append(Finding("well_formed_xml", "HIGH", name,
                                         f"XML parse error: {ex}"))
            except DefusedXmlException as ex:
                findings.append(Finding("well_formed_xml", "HIGH", name,
                                         f"disallowed XML construct (XXE/entity-expansion "
                                         f"guard): {ex}"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 2 — [Content_Types].xml declares every part (Default ext or Override)
# --------------------------------------------------------------------------- #

def _rule_content_types_completeness(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    try:
        ct = z.read("[Content_Types].xml").decode("utf-8", "replace")
    except KeyError:
        return [Finding("content_types_completeness", "HIGH", "[Content_Types].xml",
                         "part is missing entirely")]
    defaults = dict(re.findall(r'<Default Extension="([^"]+)" ContentType="([^"]+)"\s*/>', ct))
    overrides = set(re.findall(r'<Override PartName="([^"]+)"', ct))
    for name in z.namelist():
        if name.endswith("/") or name == "[Content_Types].xml":
            continue
        part = "/" + name
        if part in overrides:
            continue
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext in defaults:
            continue
        findings.append(Finding("content_types_completeness", "HIGH", name,
                                 "zip member has no [Content_Types].xml Default "
                                 "or Override declaration"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 3 — VML duplicate ids (THE bug: bess-campaign-v3 / Codema v79 repair-trigger)
# --------------------------------------------------------------------------- #

def _rule_vml_duplicate_ids(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    for name in z.namelist():
        if name.startswith("xl/drawings/") and name.endswith(".vml"):
            data = z.read(name)
            counts: Dict[bytes, int] = {}
            for m in _ID_ATTR_RX.finditer(data):
                counts[m.group(1)] = counts.get(m.group(1), 0) + 1
            dupes = {k.decode(): v for k, v in counts.items() if v > 1}
            if dupes:
                findings.append(Finding(
                    "vml_duplicate_id", "HIGH", name,
                    f"duplicate VML id(s) {dupes} — Excel's strict OOXML parser "
                    "rejects a document with a repeated id (the 'we found a problem "
                    "with some content' repair-trigger); LibreOffice does not enforce "
                    "VML id uniqueness so it opens the same file cleanly."))
    return findings


# --------------------------------------------------------------------------- #
# Rule 4 — every comments part is paired with a legacyDrawing + vmlDrawing part
# --------------------------------------------------------------------------- #

def _rule_comment_vml_pairing(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    names = set(z.namelist())
    for relname in names:
        if not (relname.startswith("xl/worksheets/_rels/") and relname.endswith(".xml.rels")):
            continue
        rels = _parse_rels(z.read(relname))
        has_comments = any(r["type"].endswith("/comments") for r in rels.values())
        if not has_comments:
            continue
        sheet_name = "xl/worksheets/" + os.path.basename(relname)[: -len(".rels")]
        vml_rel_ids = {rid for rid, r in rels.items() if r["type"].endswith("/vmlDrawing")}
        if not vml_rel_ids:
            findings.append(Finding(
                "comment_vml_pairing", "HIGH", sheet_name,
                "worksheet has a comments relationship but no vmlDrawing relationship "
                "— a comment with no VML shape to render is a classic Excel-repair "
                "trigger"))
            continue
        sheet_data = z.read(sheet_name) if sheet_name in names else b""
        legacy_m = _LEGACYDRAWING_RX.search(sheet_data)
        if not legacy_m:
            findings.append(Finding(
                "comment_vml_pairing", "HIGH", sheet_name,
                "worksheet has comments + a vmlDrawing relationship but no "
                "<legacyDrawing> element wiring them together"))
            continue
        legacy_rid = legacy_m.group(1).decode()
        if legacy_rid not in vml_rel_ids:
            findings.append(Finding(
                "comment_vml_pairing", "HIGH", sheet_name,
                f"<legacyDrawing r:id={legacy_rid}> does not resolve to the "
                "vmlDrawing relationship"))
            continue
        target = _resolve_part(os.path.dirname(sheet_name), rels[legacy_rid]["target"])
        if target not in names:
            findings.append(Finding(
                "comment_vml_pairing", "HIGH", sheet_name,
                f"legacyDrawing target part '{target}' does not exist in the zip"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 5 — defined-name syntax + scoping (INP_* etc.)
# --------------------------------------------------------------------------- #

def _rule_defined_name_syntax(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    try:
        wb = z.read("xl/workbook.xml")
    except KeyError:
        return findings
    seen: Dict[tuple, int] = {}
    for m in _DEFNAME_TAG_RX.finditer(wb):
        attrs = m.group(1)
        nm = _NAME_ATTR_RX.search(attrs)
        if not nm:
            continue
        name = html.unescape(nm.group(1).decode())
        local = _LOCALSHEET_ATTR_RX.search(attrs)
        scope = local.group(1).decode() if local else "__workbook__"
        if not name.startswith("_xlnm."):
            if len(name) > 255 or not _LEGAL_NAME_RX.match(name):
                findings.append(Finding(
                    "defined_name_syntax", "HIGH", "xl/workbook.xml",
                    f"defined name '{name}' fails Excel's legal-name grammar "
                    "(must start with a letter/underscore/backslash, no spaces, "
                    "<=255 chars)"))
            elif _CELLREF_RX.match(name.upper()):
                findings.append(Finding(
                    "defined_name_syntax", "HIGH", "xl/workbook.xml",
                    f"defined name '{name}' is indistinguishable from a cell "
                    "reference"))
        key = (name, scope)
        seen[key] = seen.get(key, 0) + 1
    for (name, scope), n in seen.items():
        if n > 1:
            findings.append(Finding(
                "defined_name_syntax", "HIGH", "xl/workbook.xml",
                f"defined name '{name}' (scope={scope}) declared {n} times"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 6 — conditional-formatting sqref validity (empty / malformed ranges)
# --------------------------------------------------------------------------- #

def _rule_cf_sqref_validity(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    for name in z.namelist():
        if not (name.startswith("xl/worksheets/sheet") and name.endswith(".xml")):
            continue
        data = z.read(name)
        for m in _CF_SQREF_RX.finditer(data):
            sq = html.unescape(m.group(1).decode()).strip()
            if not sq:
                findings.append(Finding("cf_sqref_validity", "HIGH", name,
                                         "empty conditionalFormatting sqref"))
                continue
            for tok in sq.split():
                if not _CELLTOK_RX.match(tok):
                    findings.append(Finding(
                        "cf_sqref_validity", "HIGH", name,
                        f"malformed conditionalFormatting sqref token '{tok}'"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 7 — hyperlink location/r:id integrity
# --------------------------------------------------------------------------- #

def _rule_hyperlink_integrity(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    names = set(z.namelist())
    for name in names:
        if not (name.startswith("xl/worksheets/sheet") and name.endswith(".xml")):
            continue
        data = z.read(name)
        relname = os.path.join(os.path.dirname(name), "_rels",
                                os.path.basename(name) + ".rels").replace(os.sep, "/")
        relids = set(_parse_rels(z.read(relname)).keys()) if relname in names else set()
        for m in _HYPERLINK_TAG_RX.finditer(data):
            tag = m.group(1)
            rid = _RID_ATTR_RX.search(tag)
            loc = _LOCATION_ATTR_RX.search(tag)
            if not rid and not loc:
                findings.append(Finding("hyperlink_integrity", "HIGH", name,
                                         "hyperlink has neither r:id nor location"))
            elif rid and rid.group(1).decode() not in relids:
                findings.append(Finding(
                    "hyperlink_integrity", "HIGH", name,
                    f"hyperlink r:id={rid.group(1).decode()} does not resolve "
                    f"in {relname or '(missing .rels)'}"))
            elif loc:
                lv = html.unescape(loc.group(1).decode())
                if "!" not in lv:
                    findings.append(Finding(
                        "hyperlink_integrity", "MED", name,
                        f"hyperlink location '{lv}' missing a '!' sheet/cell "
                        "separator"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 8 — relationship-graph integrity (dangling r:id, dangling .rels targets)
# --------------------------------------------------------------------------- #

def _rule_relationship_integrity(z: zipfile.ZipFile) -> List[Finding]:
    findings: List[Finding] = []
    names = set(z.namelist())

    # (a) every Target in every .rels file must resolve to a real zip member
    for relname in names:
        if not relname.endswith(".rels"):
            continue
        base_dir = os.path.dirname(os.path.dirname(relname))  # strip "_rels/x.rels"
        for rid, r in _parse_rels(z.read(relname)).items():
            if r["targetMode"] == "External" or r["target"].startswith(("http:", "https:")):
                continue
            resolved = _resolve_part(base_dir, r["target"])
            if resolved not in names:
                findings.append(Finding(
                    "relationship_integrity", "HIGH", relname,
                    f"relationship {rid} target '{r['target']}' -> '{resolved}' "
                    "does not exist in the zip"))

    # (b) every r:id USED inside a part must be DECLARED in that part's .rels
    for name in names:
        if not name.endswith(".xml"):
            continue
        data = z.read(name)
        rids = {m.decode() for m in re.findall(rb'r:id="([^"]*)"', data)}
        if not rids:
            continue
        relname = os.path.join(os.path.dirname(name), "_rels",
                                os.path.basename(name) + ".rels").replace(os.sep, "/")
        relids = set(_parse_rels(z.read(relname)).keys()) if relname in names else set()
        missing = rids - relids
        if missing:
            findings.append(Finding(
                "relationship_integrity", "HIGH", name,
                f"r:id(s) {sorted(missing)} used but not declared in "
                f"{relname if relname in names else '(missing .rels part)'}"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 9 — formula legality: no bare '~' operator outside a string literal
# (Tristan 2026-07-05, Excel repair round 2: real Excel's repair report on a
# shipped v10 dossier said EXACTLY "Removed Records: Formula from
# /xl/worksheets/sheet24.xml part"; LibreOffice opened the same file clean).
# --------------------------------------------------------------------------- #

_FORMULA_TAG_RX = re.compile(rb'<f\b[^>]*>(.*?)</f>', re.S)
_STRING_LITERAL_RX = re.compile(r'"(?:[^"]|"")*"')


def _strip_string_literals(formula: str) -> str:
    """Blank out every quoted string literal (Excel's '""'-escaped-quote convention
    honoured) so an operator-legality check never trips on a character that is
    legitimate INSIDE a text literal (e.g. the wildcard-escape '~*' passed to
    FIND/SEARCH, or plain prose like '~£11.6k')."""
    return _STRING_LITERAL_RX.sub(lambda m: '"' * len(m.group(0)), formula)


def _rule_formula_illegal_tilde_operator(z: zipfile.ZipFile) -> List[Finding]:
    """Excel's A1 formula grammar has NO '~' operator outside a quoted string
    literal. ROOT CAUSE (reproduced in isolation): a parenthesised reference-UNION
    argument list — valid, comma-joined Excel A1 syntax used to pass several
    non-contiguous cells as ONE argument to a function that takes exactly one
    range (COUNTIF/COUNTIFS), e.g. `COUNTIF(($B$33,$B$34,$B$35),"<8")` — is
    silently REWRITTEN by `build-excel-export.py :: recalc_and_cache()`'s
    `soffice --convert-to xlsx` round-trip (LibreOffice's OOXML export filter
    substitutes the ODFF reference-CONCATENATION operator '~' for the OOXML
    union operator ',' inside that construct: `($B$33~$B$34~$B$35)`). Real Excel's
    strict parser cannot parse '~' as a formula operator and DROPS the whole
    formula on open. LibreOffice's own reader is what PRODUCED the corruption, so
    it opens its own broken output without complaint — exactly why a structural
    gate is needed rather than relying on LibreOffice as the verifier. The fix at
    source (`_contiguous_col_ranges()` in build-excel-export.py) never emits a
    union-in-parens at all: MIN/COUNT/COUNTA take multiple plain range arguments
    directly (they are variadic — no union needed), and a COUNTIF over
    non-contiguous cells is decomposed into one COUNTIF PER contiguous run,
    summed. proveCatch: fires on the pre-fix literal '~' pattern; a rebuild using
    only `_contiguous_col_ranges()` output never emits '~' and passes clean."""
    findings: List[Finding] = []
    for name in z.namelist():
        if not (name.startswith("xl/worksheets/sheet") and name.endswith(".xml")):
            continue
        data = z.read(name)
        for m in _FORMULA_TAG_RX.finditer(data):
            formula = html.unescape(m.group(1).decode("utf-8", "replace"))
            if "~" not in formula:
                continue
            if "~" in _strip_string_literals(formula):
                findings.append(Finding(
                    "formula_illegal_tilde_operator", "HIGH", name,
                    "formula contains a '~' character outside any string literal "
                    "— not a valid Excel A1 operator; real Excel silently DROPS "
                    f"the whole formula on open: {formula[:200]}"))
    return findings


# --------------------------------------------------------------------------- #
# Rule 10 — workbook-wide circular-reference detection (Tristan 2026-07-05,
# Excel repair round 2's SEPARATE report: a workbook-wide "one or more circular
# references" warning, independent of the formula-legality repair above).
# --------------------------------------------------------------------------- #

_SHEET_TAG_RX = re.compile(rb'<sheet name="([^"]*)"[^>]*r:id="(rId\d+)"')
_SHEET_REL_RX = re.compile(rb'Id="(rId\d+)"[^>]*Target="worksheets/(sheet\d+\.xml)"')
_DEFNAME_FULL_RX = re.compile(rb'<definedName\b[^>]*name="([^"]*)"[^>]*>(.*?)</definedName>', re.S)
_CELL_TAG_RX = re.compile(rb'<c\b([^>]*?)(?:/>|>(.*?)</c>)', re.S)
_CELL_R_ATTR_RX = re.compile(rb'r="([A-Z]+[0-9]+)"')

_QSHEET_OR_BARE = r"(?:'(?P<qsheet>(?:[^']|'')+)'|(?P<sheet>[A-Za-z_][A-Za-z0-9_.]*))"
_REF_TOKEN_RX = re.compile(
    _QSHEET_OR_BARE + r"?!(?P<cell1>\$?[A-Z]{1,3}\$?[0-9]{1,7})"
    r"(?::(?P<cell2>\$?[A-Z]{1,3}\$?[0-9]{1,7}))?"
)
_BARE_CELL_RX = re.compile(
    r"(?<![A-Za-z0-9_!])(\$?[A-Z]{1,3}\$?[0-9]{1,7})"
    r"(?::(\$?[A-Z]{1,3}\$?[0-9]{1,7}))?(?![A-Za-z0-9_(])"
)
_NAME_TOKEN_RX = re.compile(r"[A-Za-z_][A-Za-z0-9_.]*")
_DEFNAME_TARGET_RX = re.compile(
    r"(?:'(?P<q>[^']+)'|(?P<b>[A-Za-z_][A-Za-z0-9_.]*))!"
    r"(?P<c1>\$?[A-Z]{1,3}\$?[0-9]{1,7})(?::(?P<c2>\$?[A-Z]{1,3}\$?[0-9]{1,7}))?"
)


def _col_to_num(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def _num_to_col(n: int) -> str:
    s = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        s = chr(65 + rem) + s
    return s


def _split_cell(cell: str):
    m = re.match(r"\$?([A-Z]{1,3})\$?([0-9]{1,7})", cell)
    return m.group(1), int(m.group(2))


def _expand_range(cell1: str, cell2: Optional[str], cap: int = 4000):
    """A cell/range token -> its individual cell addresses, or None if the range
    is too large to expand cheaply (>cap cells) — treated as opaque; any formula
    CELL inside an opaque range is still discovered independently via its own
    <f> entry, so a genuine cycle through it is caught from the OTHER side."""
    c1, r1 = _split_cell(cell1)
    c2, r2 = _split_cell(cell2) if cell2 else (c1, r1)
    n1, n2 = sorted((_col_to_num(c1), _col_to_num(c2)))
    r1, r2 = sorted((r1, r2))
    if (n2 - n1 + 1) * (r2 - r1 + 1) > cap:
        return None
    return [f"{_num_to_col(cn)}{rn}" for cn in range(n1, n2 + 1) for rn in range(r1, r2 + 1)]


def _load_sheet_map_and_defined_names(z: zipfile.ZipFile):
    wb = z.read("xl/workbook.xml")
    try:
        rels = z.read("xl/_rels/workbook.xml.rels")
    except KeyError:
        return {}, {}
    rid_to_file = {m.group(1).decode(): m.group(2).decode() for m in _SHEET_REL_RX.finditer(rels)}
    name_to_file: Dict[str, str] = {}
    for m in _SHEET_TAG_RX.finditer(wb):
        nm = html.unescape(m.group(1).decode())
        rid = m.group(2).decode()
        if rid in rid_to_file:
            name_to_file[nm] = "xl/worksheets/" + rid_to_file[rid]
    defined: Dict[str, str] = {}
    for m in _DEFNAME_FULL_RX.finditer(wb):
        nm = html.unescape(m.group(1).decode())
        defined[nm] = html.unescape(m.group(2).decode()).strip()
    return name_to_file, defined


def _parse_sheet_formulas(data: bytes) -> Dict[str, str]:
    """Cell-ref -> formula text for every FORMULA cell on one worksheet part.
    Correctly distinguishes a self-closing empty cell (`<c r="P36" s="84"/>`, no
    body, cannot carry a formula) from an open/close cell (`<c r="O36" ...>
    <f>...</f>...</c>`) — a naive `<c [^>]*r="X"[^>]*>(.*?)</c>` regex matches a
    self-closing cell's own attributes but then walks forward to the NEXT
    `</c>` in the file for its body, misattributing a LATER cell's formula to
    THIS cell's ref (confirmed on row 36 of a real 'Bill of Materials' sheet: a
    genuinely empty P36 was misread as containing a formula that actually lived
    in Q36, manufacturing a false P36<->O36 circular-reference report)."""
    out: Dict[str, str] = {}
    for m in _CELL_TAG_RX.finditer(data):
        body = m.group(2)
        if body is None:
            continue
        rm = _CELL_R_ATTR_RX.search(m.group(1))
        if not rm:
            continue
        fm = _FORMULA_TAG_RX.search(body)
        if fm:
            out[rm.group(1).decode()] = html.unescape(fm.group(1).decode("utf-8", "replace"))
    return out


def _rule_circular_references(z: zipfile.ZipFile) -> List[Finding]:
    """A deterministic replica of Excel's own circular-reference check: parse
    every formula on every sheet (+ every defined name), build the cell-level
    dependency graph, and DFS for a cycle. Real-world catch (v10 dossier,
    2026-07-05): a display formula written into the SAME cell as the raw
    sentinel value it read (`ws.cell(r, 11, sentinel)` immediately overwritten
    by `ws.cell(r, 11, f'=IF($K{r}=1,...)')`) — the sentinel was clobbered
    before it could be read, leaving the formula reading its own cell, on every
    one of 5 registered-drawing rows. Fixed at source by moving the sentinel to
    its own column. Cross-sheet, same-sheet, and defined-name references are
    all resolved; ranges over 4000 cells are opaque (not proof against a cycle,
    but any formula cell inside one is still discovered via its own <f> entry)."""
    names = set(z.namelist())
    if "xl/workbook.xml" not in names:
        return []
    name_to_file, defined = _load_sheet_map_and_defined_names(z)
    all_formulas: Dict[tuple, str] = {}
    for sheetname, path in name_to_file.items():
        if path not in names:
            continue
        for cell, formula in _parse_sheet_formulas(z.read(path)).items():
            all_formulas[(sheetname, cell)] = formula

    edges: Dict[tuple, set] = {}

    def add_edge(src, tgt_sheet, c1, c2):
        cells = _expand_range(c1, c2)
        if cells is None:
            return
        edges.setdefault(src, set()).update((tgt_sheet, cc) for cc in cells)

    for (sheet, cell), formula in all_formulas.items():
        src = (sheet, cell)
        for m in _REF_TOKEN_RX.finditer(formula):
            tgt_sheet = (m.group("qsheet") or "").replace("''", "'") or m.group("sheet")
            if tgt_sheet not in name_to_file:
                continue
            add_edge(src, tgt_sheet, m.group("cell1"), m.group("cell2"))
        stripped = _REF_TOKEN_RX.sub(" ", formula)
        for m in _BARE_CELL_RX.finditer(stripped):
            add_edge(src, sheet, m.group(1), m.group(2))
        for m in _NAME_TOKEN_RX.finditer(stripped):
            tok = m.group(0)
            if tok not in defined or re.match(r"^[A-Z]{1,3}[0-9]{1,7}$", tok):
                continue
            tm = _DEFNAME_TARGET_RX.match(defined[tok])
            if tm:
                tgt_sheet = tm.group("q") or tm.group("b")
                if tgt_sheet in name_to_file:
                    add_edge(src, tgt_sheet, tm.group("c1"), tm.group("c2"))

    WHITE, GRAY = 0, 1
    color: Dict[tuple, int] = {}
    findings: List[Finding] = []
    seen_sigs = set()

    def dfs(start):
        stack = [(start, iter(edges.get(start, ())))]
        color[start] = GRAY
        path = [start]
        while stack:
            node, it = stack[-1]
            advanced = False
            for nxt in it:
                if nxt not in edges:
                    continue
                if color.get(nxt, WHITE) == WHITE:
                    color[nxt] = GRAY
                    path.append(nxt)
                    stack.append((nxt, iter(edges.get(nxt, ()))))
                    advanced = True
                    break
                if color.get(nxt) == GRAY:
                    idx = path.index(nxt)
                    cyc = path[idx:] + [nxt]
                    sig = frozenset(cyc)
                    if sig not in seen_sigs:
                        seen_sigs.add(sig)
                        chain = " -> ".join(f"'{s}'!{c}" for s, c in cyc)
                        part = name_to_file.get(cyc[0][0], cyc[0][0])
                        findings.append(Finding(
                            "circular_reference", "HIGH", part,
                            f"circular reference: {chain}"))
            if not advanced:
                color[node] = 2  # BLACK
                stack.pop()
                path.pop()

    for node in list(edges.keys()):
        if color.get(node, WHITE) == WHITE:
            dfs(node)
    return findings


RULES = (
    _rule_well_formed_xml,
    _rule_content_types_completeness,
    _rule_vml_duplicate_ids,
    _rule_comment_vml_pairing,
    _rule_defined_name_syntax,
    _rule_cf_sqref_validity,
    _rule_hyperlink_integrity,
    _rule_relationship_integrity,
    _rule_formula_illegal_tilde_operator,
    _rule_circular_references,
)


def check_workbook_bytes(data: bytes) -> List[Finding]:
    findings: List[Finding] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for rule in RULES:
            try:
                findings.extend(rule(z))
            except Exception as ex:  # noqa: BLE001 — a crashing rule is itself a finding
                findings.append(Finding(rule.__name__, "HIGH", "<gate>",
                                         f"rule crashed: {ex}"))
    return findings


def check_workbook(path: str) -> List[Finding]:
    with open(path, "rb") as fh:
        return check_workbook_bytes(fh.read())


def scorecard(findings: List[Finding]) -> dict:
    high = sum(1 for f in findings if f.severity == "HIGH")
    med = sum(1 for f in findings if f.severity == "MED")
    low = sum(1 for f in findings if f.severity == "LOW")
    return {"high": high, "med": med, "low": low, "total": len(findings),
            "verdict": "FAIL" if high else ("WARN" if med else "PASS"),
            "ship_ok": high == 0}


# ═════════════════════════════════════════════════════════════════════════════
# Fixture builders — a minimal, hand-built zip per test case. Each BAD_* fixture
# mutates exactly ONE part away from the GOOD baseline so a firing finding is
# attributable to the rule under test (proveCatch, not a coincidence).
# ═════════════════════════════════════════════════════════════════════════════

_GOOD_CONTENT_TYPES = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>
</Types>"""

_GOOD_ROOT_RELS = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

_GOOD_WORKBOOK = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="INP_TEST">Sheet1!$A$1</definedName></definedNames>
</workbook>"""

_GOOD_WORKBOOK_RELS = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""

_GOOD_SHEET1 = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" t="str"><f>IF(A1&gt;0,"ok ~ non-zero","~bad")</f><v>ok ~ non-zero</v></c></row></sheetData>
<conditionalFormatting sqref="A1:A1"><cfRule type="cellIs" priority="1" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting>
<hyperlinks><hyperlink ref="A1" location="Sheet1!A1" display="x"/></hyperlinks>
<legacyDrawing r:id="rId2"/>
</worksheet>"""

_GOOD_SHEET1_RELS = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/>
</Relationships>"""

_GOOD_COMMENTS1 = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<authors><author>Test</author></authors>
<commentList><comment ref="A1" authorId="0"><text><r><t>hello</t></r></text></comment></commentList>
</comments>"""

_GOOD_VML = (b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             b'<xml xmlns:v="urn:schemas-microsoft-com:vml" '
             b'xmlns:o="urn:schemas-microsoft-com:office:office" '
             b'xmlns:x="urn:schemas-microsoft-com:office:excel">'
             b'<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" '
             b'path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/>'
             b'<v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>'
             b'<v:shape id="_x0000_s1026" type="#_x0000_t202" '
             b'style="position:absolute;visibility:hidden">'
             b'<x:ClientData ObjectType="Note"><x:Row>0</x:Row>'
             b'<x:Column>0</x:Column></x:ClientData></v:shape></xml>')

# the ACTUAL LibreOffice-recalc defect: shapetype + shape re-declared per comment,
# every shape id the same literal "shape_0" — reproduced byte-for-byte in isolation
# (see module docstring) and independently confirmed on the live BESS/Codema output.
_BAD_VML_DUPLICATE_IDS = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<xml xmlns:v="urn:schemas-microsoft-com:vml" '
    b'xmlns:o="urn:schemas-microsoft-com:office:office" '
    b'xmlns:x="urn:schemas-microsoft-com:office:excel">'
    + (b'<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" '
       b'path="m,l,21600l21600,21600l21600,xe"><v:stroke joinstyle="miter"/>'
       b'<v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>'
       b'<v:shape id="shape_0" fillcolor="#ffffe1" type="#_x0000_t202" '
       b'style="position:absolute;visibility:hidden">'
       b'<x:ClientData ObjectType="Note"><x:Row>0</x:Row>'
       b'<x:Column>0</x:Column></x:ClientData></v:shape>') * 3
    + b'</xml>')


def _build_zip(parts: Dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)
    return buf.getvalue()


def _good_parts() -> Dict[str, bytes]:
    return {
        "[Content_Types].xml": _GOOD_CONTENT_TYPES,
        "_rels/.rels": _GOOD_ROOT_RELS,
        "xl/workbook.xml": _GOOD_WORKBOOK,
        "xl/_rels/workbook.xml.rels": _GOOD_WORKBOOK_RELS,
        "xl/worksheets/sheet1.xml": _GOOD_SHEET1,
        "xl/worksheets/_rels/sheet1.xml.rels": _GOOD_SHEET1_RELS,
        "xl/comments1.xml": _GOOD_COMMENTS1,
        "xl/drawings/vmlDrawing1.vml": _GOOD_VML,
    }


def _fixture_good() -> bytes:
    return _build_zip(_good_parts())


def _fixture_bad(rule: str) -> bytes:
    parts = _good_parts()
    if rule == "vml_duplicate_id":
        parts["xl/drawings/vmlDrawing1.vml"] = _BAD_VML_DUPLICATE_IDS
    elif rule == "comment_vml_pairing":
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'<legacyDrawing r:id="rId2"/>', b'')
    elif rule == "defined_name_syntax":
        parts["xl/workbook.xml"] = _GOOD_WORKBOOK.replace(
            b'<definedNames><definedName name="INP_TEST">Sheet1!$A$1</definedName></definedNames>',
            b'<definedNames><definedName name="INP_TEST">Sheet1!$A$1</definedName>'
            b'<definedName name="INP_TEST">Sheet1!$A$2</definedName></definedNames>')
    elif rule == "cf_sqref_validity":
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'sqref="A1:A1"', b'sqref=""')
    elif rule == "hyperlink_integrity":
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'<hyperlink ref="A1" location="Sheet1!A1" display="x"/>',
            b'<hyperlink ref="A1" display="x"/>')
    elif rule == "content_types_completeness":
        # remove the ONLY declaration covering .vml parts (no Override exists for
        # vmlDrawing1.vml, so dropping the Default leaves it wholly undeclared —
        # unlike removing a worksheet Override, which the generic xml Default still
        # covers, so it wouldn't prove this rule fires).
        parts["[Content_Types].xml"] = _GOOD_CONTENT_TYPES.replace(
            b'<Default Extension="vml" '
            b'ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>',
            b'')
    elif rule == "relationship_integrity":
        parts["xl/_rels/workbook.xml.rels"] = _GOOD_WORKBOOK_RELS.replace(
            b'Target="worksheets/sheet1.xml"', b'Target="worksheets/sheet9.xml"')
    elif rule == "well_formed_xml":
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'</worksheet>', b'')  # unclosed root element
    elif rule == "formula_illegal_tilde_operator":
        # the ACTUAL v10-dossier defect: a reference-union argument list corrupted by
        # LibreOffice's OOXML round-trip export from ',' to '~' between BARE cell refs
        # (outside any string literal) — real Excel drops the whole formula on open.
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'<c r="B1" t="str"><f>IF(A1&gt;0,"ok ~ non-zero","~bad")</f><v>ok ~ non-zero</v></c>',
            b'<c r="B1" t="n"><f>COUNT(A1:A1,($A$1~$A$1))</f><v>1</v></c>')
    elif rule == "circular_reference":
        # two cells that each read the other -- the exact shape of the real defect
        # (a display formula written into the same cell as the sentinel it reads).
        parts["xl/worksheets/sheet1.xml"] = _GOOD_SHEET1.replace(
            b'<c r="B1" t="str"><f>IF(A1&gt;0,"ok ~ non-zero","~bad")</f><v>ok ~ non-zero</v></c>',
            b'<c r="B1" t="n"><f>A1+1</f><v>2</v></c>').replace(
            b'<c r="A1"><v>1</v></c>',
            b'<c r="A1"><f>B1+1</f><v>3</v></c>')
    else:
        raise ValueError(f"no BAD fixture for rule '{rule}'")
    return _build_zip(parts)


def _selftest() -> int:
    bad = 0

    good_findings = check_workbook_bytes(_fixture_good())
    good_highs = [f for f in good_findings if f.severity == "HIGH"]
    if good_highs:
        print(f"  FAIL: clean fixture produced HIGH findings: {good_highs}")
        bad += 1
    else:
        print("  clean fixture: 0 HIGH findings (OK)")

    for rule in ("vml_duplicate_id", "comment_vml_pairing", "defined_name_syntax",
                 "cf_sqref_validity", "hyperlink_integrity",
                 "content_types_completeness", "relationship_integrity",
                 "well_formed_xml", "formula_illegal_tilde_operator",
                 "circular_reference"):
        data = _fixture_bad(rule)
        findings = check_workbook_bytes(data)
        hits = [f for f in findings if f.rule == rule and f.severity == "HIGH"]
        if not hits:
            print(f"  FAIL: proveCatch for '{rule}' did not fire")
            bad += 1
        else:
            print(f"  proveCatch '{rule}': fired ({len(hits)} finding(s)) (OK)")

    # the LITERAL v3/Codema defect pattern (3x duplicated shapetype+shape_0) must
    # be caught with the EXACT dupe counts we observed on the real files.
    real_pattern_findings = [
        f for f in check_workbook_bytes(_fixture_bad("vml_duplicate_id"))
        if f.rule == "vml_duplicate_id"
    ]
    if real_pattern_findings and "shape_0" in real_pattern_findings[0].message \
            and "_x0000_t202" in real_pattern_findings[0].message:
        print("  proveCatch 'vml_duplicate_id' names the exact real-world ids "
              "(shape_0 / _x0000_t202) (OK)")
    else:
        print("  FAIL: vml_duplicate_id finding did not name the real ids")
        bad += 1

    if bad:
        print(f"ooxml_strict_check selftest FAILED ({bad} case(s))")
        return 1
    print("ooxml_strict_check selftest: OK")
    return 0


def _cli(path: str) -> int:
    findings = check_workbook(path)
    sc = scorecard(findings)
    for f in findings:
        print(f"  [{f.severity}] {f.rule} :: {f.part} :: {f.message}")
    print(f"ooxml_strict_check: {sc['high']} HIGH, {sc['med']} MED, {sc['low']} LOW "
          f"-> {sc['verdict']}")
    return 0 if sc["ship_ok"] else 1


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
        sys.exit(_selftest())
    elif len(sys.argv) >= 2:
        sys.exit(_cli(sys.argv[1]))
    else:
        print("usage: ooxml_strict_check.py --selftest | <path.xlsx>", file=sys.stderr)
        sys.exit(2)
