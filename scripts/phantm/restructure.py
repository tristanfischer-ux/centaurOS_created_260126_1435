"""PHANTM report v6 — deterministic structure pass (Tristan 25 Jul).

Reorders the emitted markdown into the de-risking funnel:
  Part 0 Executive → I Concept & what must be true → II Hardening: facts and
  testing → III Design choices → IV How to manufacture → V Who can
  manufacture → Appendices.

Design rules (mistake-proofing):
  - CONTENT MOVES UNCHANGED. Blocks are split at numbered headers only
    ("## N." and "### N.M[letter]"); unnumbered headers (annexes, draft
    emails, the cell-outreach H1) stay inside their parent block.
  - BIJECTION ASSERT: the set of blocks found must equal the set the ORDER
    consumes — a new section in report.py that isn't mapped, or a mapped
    section that disappears, kills the build.
  - Header renumber keeps the original TITLE TEXT verbatim (no retyping).
  - Inline §-references are rewritten in ONE simultaneous pass from the same
    map (longest-match-first); an unmapped §-ref kills the build. Refs to
    the Excel workbook ("PHANTM-CALC.xlsx §N") are NOT report sections and
    are exempted, as are the "§A.N" appendix-item refs this pass creates.
"""
import re

# ---- the target structure -------------------------------------------------
# entries: ("PART", banner) | (new_num, [source keys merged in order])
#          | ("APP", letter, source key)
# For merged blocks the FIRST source's title is used unless an override is
# given as third element.
ORDER = [
    ("PART", "Part 0 — Executive: the state of play"),
    ("1", ["NEW-EXEC"]),
    ("PART", "Part I — The concept design and what must be true"),
    ("2", ["1"]),
    ("3", ["2"]),
    ("4", ["9", "9.1"],
     "The hex-cell wave conformer — what it is and how the actuator integrates"),
    ("5", ["9.3"]),
    ("6", ["9.4"]),
    ("7", ["NEW-CLAIMS"]),
    ("PART", "Part II — Hardening: facts and testing"),
    ("8", ["3", "3.1", "3.2", "3.3"]),
    ("9", ["4", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6"]),
    ("10", ["8", "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9"]),
    ("11", ["9.2"]),
    ("12", ["9.9"]),
    ("13", ["9.8", "9.8b"]),
    ("PART", "Part III — Design choices: what was tried, what won, what was killed"),
    ("14", ["10", "10.1", "10.1b", "10.2", "10.2b", "10.2c", "10.3", "10.3b", "10.4", "10.5"]),
    ("15", ["9.5"]),
    ("16", ["9.5b"]),
    ("17", ["9.5c"]),
    ("18", ["7"]),
    ("PART", "Part IV — How to manufacture"),
    ("19", ["5"]),
    ("20", ["9.7"]),
    ("21", ["9.6"],
     "How to make the cells — the fabrication tutorial (fabricators: Part V)"),
    ("22", ["11"]),
    ("PART", "Part V — Who can manufacture"),
    ("23", ["6"]),
    ("24", ["9.6b"]),
    ("25", ["13"]),
    ("PART", "Appendices"),
    ("APP", "A", "0"),
    ("APP", "B", "12"),
]

# child blocks rendered as ### subsections of their new parent
SUBSECTION_OF = {
    "3.1": ("8", "1"), "3.2": ("8", "2"), "3.3": ("8", "3"),
    "4.1": ("9", "1"), "4.2": ("9", "2"), "4.3": ("9", "3"),
    "4.4": ("9", "4"), "4.5": ("9", "5"), "4.6": ("9", "6"),
    "8.1": ("10", "1"), "8.2": ("10", "2"), "8.3": ("10", "3"),
    "8.4": ("10", "4"), "8.5": ("10", "5"), "8.6": ("10", "6"),
    "8.7": ("10", "7"), "8.8": ("10", "8"), "8.9": ("10", "9"),
    "10.1": ("14", "1"), "10.1b": ("14", "2"), "10.2": ("14", "3"),
    "10.2b": ("14", "4"), "10.2c": ("14", "5"),
    "10.3": ("14", "6"), "10.3b": ("14", "7"),
    "10.4": ("14", "8"), "10.5": ("14", "9"),
    "9.8b": ("13", "1"),
}

# inline §-reference map (old → new). Applied simultaneously, longest first.
REF_MAP = {
    "0": "A", "1": "2", "2": "3",
    "3": "8", "3.1": "8.1", "3.2": "8.2", "3.3": "8.3",
    "4": "9", "4.1": "9.1", "4.2": "9.2", "4.3": "9.3", "4.4": "9.4",
    "4.5": "9.5", "4.6": "9.6",
    "5": "19", "5.1": "19.1", "5.2": "19.2", "5.3": "19.3", "5.4": "19.4",
    "6": "23", "7": "18",
    "8": "10", "8.1": "10.1", "8.2": "10.2", "8.3": "10.3", "8.4": "10.4",
    "8.5": "10.5", "8.6": "10.6", "8.7": "10.7", "8.8": "10.8", "8.9": "10.9",
    "9": "11",  # plain §9 refs mean the cell physics
    "9.1": "4", "9.2": "11", "9.3": "5", "9.4": "6",
    "9.5": "15", "9.5b": "16", "9.5c": "17", "9.6": "21", "9.6b": "24",
    "9.7": "20", "9.8": "13", "9.9": "12",
    "10": "14", "10.1": "14.1", "10.1b": "14.2", "10.2": "14.3",
    "10.2b": "14.4", "10.2c": "14.5",
    "10.3": "14.6", "10.3b": "14.7",
    "10.4": "14.8", "10.5": "14.9",
    "9.8b": "13.1",
    "11": "22", "12": "B", "13": "25",
    # items inside §0 (Tony feedback list) → appendix-A items
    "0.1": "A.1", "0.2": "A.2", "0.3": "A.3", "0.4": "A.4", "0.5": "A.5",
    "0.6": "A.6", "0.7": "A.7", "0.8": "A.8", "0.9": "A.9", "0.10": "A.10",
    "0.11": "A.11",
}

# ---- document split (Tony, 26 Jul) ----------------------------------------
# "What would be much easier to cope with was a report that had no history in
# it, but only analyses and info about the most recent iteration of design —
# one can always go back to a previous session if the latest turns out to be a
# dead end. It's very time consuming to keep on churning through ALL the old
# stuff as it can obscure the latest results / tweaks / optimisations."
#
# He is right, and it is measurable: of 1285 rendered lines, the optimisation
# campaign narrative (199), supplier outreach emails (291), manufacturing and
# fabricator sections (~228) and the feedback-history appendix accounted for
# well over half. The design-and-analysis core he actually wants is ~350.
#
# Tony also set the SEQUENCE: confirm the efficacy of his next design first,
# and only then look at manufacturing implications — "I don't think we're very
# close to that point yet." So manufacturing leaves the lead document; it is
# not deleted, because the supplier work is real and Tristan's standing
# instruction is that knowing what does NOT work is as valuable as knowing what
# does. Nothing is lost; it moves to a companion.
#
# CRITICAL: section NUMBERS are unchanged across the split. A reference to §19
# from the current-state document still means §19, now found in the companion.
# Renumbering per document would break every cross-reference in the prose and
# silently mis-point the reader.
CURRENT = "current"     # the latest design, its analyses and its open gates
ARCHIVE = "archive"     # history, kills, manufacturing, suppliers, outreach

DOC_OF = {
    # --- the current design and what is known about it -------------------
    "1": CURRENT, "2": CURRENT, "3": CURRENT, "4": CURRENT, "5": CURRENT,
    "6": CURRENT, "7": CURRENT, "8": CURRENT, "9": CURRENT, "10": CURRENT,
    "11": CURRENT, "12": CURRENT, "13": CURRENT,
    # §14 splits: the campaign NARRATIVE and its kill list are history; the
    # chosen operating point and the four gate results are current findings.
    "14": ARCHIVE, "14.1": ARCHIVE, "14.2": ARCHIVE,
    "14.3": CURRENT, "14.4": CURRENT, "14.5": CURRENT, "14.6": CURRENT,
    "14.7": CURRENT, "14.8": CURRENT, "14.9": CURRENT,
    "15": CURRENT,
    "16": ARCHIVE,          # drive/PCB options ledger — passed and failed
    "17": CURRENT,          # firmware, written and tested
    "18": CURRENT,          # open questions (also shipped standalone)
    # --- manufacturing and who can build it: deferred per Tony's sequence -
    "19": ARCHIVE, "20": ARCHIVE, "21": ARCHIVE, "22": ARCHIVE,
    "23": ARCHIVE, "24": ARCHIVE, "25": ARCHIVE,
    "A": ARCHIVE,           # response to Tony's feedback — the historical record
    "B": ARCHIVE,           # traceability
}

# Part banners belong to whichever document still holds sections under them.
PART_DOC = {
    "Part 0 — Executive: the state of play": CURRENT,
    "Part I — The concept design and what must be true": CURRENT,
    "Part II — Hardening: facts and testing": CURRENT,
    "Part III — Design choices: what was tried, what won, what was killed": None,
    "Part IV — How to manufacture": ARCHIVE,
    "Part V — Who can manufacture": ARCHIVE,
    "Appendices": ARCHIVE,
}

HDR_RE = re.compile(r"^(##|###) (\d+(?:\.\d+)?[a-z]?|NEW-[A-Z]+)[. ]\s*(.*)$")


def _split(md):
    """Split into (preamble, {key: (title, body_lines)})."""
    lines = md.splitlines()
    blocks, preamble = {}, []
    key, title, body = None, None, []

    def flush():
        if key is not None:
            assert key not in blocks, f"duplicate section key {key}"
            blocks[key] = (title, body[:])

    for ln in lines:
        m = HDR_RE.match(ln)
        # only NUMBERED ## / ### headers start a block; H3 needs a dotted or
        # sentinel key so "### 1. Micro MIM" (draft email) stays in-block
        is_block = bool(m) and (m.group(1) == "##" or "." in m.group(2)
                                or m.group(2).startswith("NEW-"))
        if is_block:
            flush()
            key, title, body = m.group(2), m.group(3), []
        elif key is None:
            preamble.append(ln)
        else:
            body.append(ln)
    flush()
    return preamble, blocks


def restructure(md, new_title, doc=None, preamble_extra=None):
    """Emit one document.

    doc=None keeps the historical single-file behaviour (everything, in order).
    doc=CURRENT / ARCHIVE emits only that document's sections, with numbering
    left ALONE so cross-references between the two still resolve.
    """
    preamble, blocks = _split(md)
    # replace the old H1 title line (first line of preamble)
    assert preamble and preamble[0].startswith("# "), "title line not found"
    preamble[0] = "# " + new_title
    if preamble_extra:
        preamble = [preamble[0]] + ["", *preamble_extra] + preamble[1:]

    def doc_of(num):
        """A subsection INHERITS its parent's document unless overridden.

        Defaulting a subsection to ARCHIVE instead would silently drag whole
        current-state sections (8, 9, 10, 13 — each of which has subsections)
        into the archive, and the orphan-parent path would then mint a
        duplicate heading for them there.
        """
        if num in DOC_OF:
            return DOC_OF[num]
        if "." in num:
            return doc_of(num.split(".", 1)[0])
        return ARCHIVE

    def wanted(num):
        return doc is None or doc_of(num) == doc

    consumed = set()
    out = []
    for entry in ORDER:
        if entry[0] == "PART":
            want = PART_DOC.get(entry[1])
            # a banner whose sections straddle both documents (Part III) is
            # emitted in either; one pinned to the other document is skipped
            if doc is not None and want is not None and want != doc:
                continue
            out += ["", "---", "", f"# {entry[1]}", ""]
            continue
        if entry[0] == "APP":
            _, letter, src = entry
            assert src in blocks, f"appendix source {src} missing"
            consumed.add(src)          # consumed regardless, for the bijection
            if not wanted(letter):
                continue
            title, body = blocks[src]
            out += [f"## Appendix {letter} — {title}"] + body
            continue
        new_num, srcs = entry[0], entry[1]
        override = entry[2] if len(entry) > 2 else None
        for i, src in enumerate(srcs):
            assert src in blocks, f"section source {src} missing"
            title, body = blocks[src]
            consumed.add(src)
            if i == 0:
                if wanted(new_num):
                    out += [f"## {new_num}. {override or title}"] + body
            elif src in SUBSECTION_OF:
                parent, subnum = SUBSECTION_OF[src]
                assert parent == new_num, f"{src}: parent map disagrees"
                sub = f"{new_num}.{subnum}"
                if wanted(sub):
                    # a kept subsection whose PARENT went to the other document
                    # still needs a heading to sit under, or it is orphaned
                    if not wanted(new_num) and not any(
                            ln.startswith(f"## {new_num}.") for ln in out):
                        out += ["", f"## {new_num}. {override or blocks[srcs[0]][0]}",
                                "", f"*(campaign narrative and the kill list are in "
                                f"the companion archive; the current operating "
                                f"point and gate results follow)*", ""]
                    out += [f"### {sub} {title}"] + body
            else:  # merged continuation (e.g. 9.1 into 4): body only
                if wanted(new_num):
                    out += body

    leftover = set(blocks) - consumed
    assert not leftover, f"unmapped sections left over: {sorted(leftover)}"

    text = "\n".join(preamble + out)

    # ---- inline §-reference rewrite (simultaneous, longest-first) ----------
    keys = sorted(REF_MAP, key=len, reverse=True)
    pat = re.compile(r"(PHANTM-CALC\.xlsx §\d+)|§(" +
                     "|".join(re.escape(k) for k in keys) +
                     r")(?!\d|\.\d|[a-z])")

    def sub(m):
        if m.group(1):
            return m.group(1)          # Excel-workbook refs are not sections
        return "§" + REF_MAP[m.group(2)]

    text = pat.sub(sub, text)
    stray = [s for s in re.findall(r"§(\d[\w.]*)", text)
             if not re.match(r"^(?:[12]?\d)(?:\.\d+)?$|^A\.\d+$", s.rstrip("."))]
    assert not stray, f"unmapped §-refs after rewrite: {stray}"
    return text
