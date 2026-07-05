#!/usr/bin/env python3
"""
scripts/archetype-preflight.py — NEW-ARCHETYPE PRE-FLIGHT AUDITOR (read-only).

Executable form of docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md § "New-archetype pre-flight
(run BEFORE the first chain run)". Audits the seven known gap surfaces for a class
that has never been through a campaign, and maps every finding to one of the
playbook's 10 defect families with its known fix pattern.

USAGE
    python3 scripts/archetype-preflight.py <class_slug> <brief_path> [--no-node]
    python3 scripts/archetype-preflight.py --derive-slug <brief_path>
    python3 scripts/archetype-preflight.py --selftest

    <class_slug>   engine class slug, underscores (e.g. bess, co2_mineralisation)
    <brief_path>   path to the brief markdown (e.g. briefs-loop/co2_mineralisation.md)
    --no-node      skip the `npx tsx` bridge into the REAL isCatalogueComponent and
                   use the built-in Python mirror of it instead (offline mode; the
                   report header states which mode ran)
    --derive-slug  print the registered archetype slug a brief maps to (or UNKNOWN)
                   — used by scripts/run-validation.sh to wire this audit into the
                   execution path

ENFORCEMENT (Tristan 2026-07-05: "it needs to be in the code and not an md file")
    - scripts/run-validation.sh runs this audit before EVERY validation chain run
      and prints the report into the run log; a class with no completed full-nets
      run (no out/*/tab-scorecard.json with its slug, no
      scripts/.preflight-cleared/<slug> marker) PAUSES the runner on findings
      unless --force is given.
    - scripts/verify-engine-guards.sh runs --selftest so the auditor cannot rot.

THE SEVEN SURFACES (→ defect family)
    1. VOCABULARY            → family 1 (vocabulary/matcher gaps)
    2. CONSTANTS             → family 2 (two-truths / multi-mint — the 280 Ah pattern)
    3. BOP ROLES             → family 6 (one classification, both sides)
    4. CONDITIONAL LITERALS  → family 7 (verdict honesty — bare-literal siblings)
    5. PROCUREMENT MODEL     → family 8 (procurement-model mismatch) + decisions register
    6. DORMANT DEFAULTS      → family 5 (placeholder/default trust)
    7. UNIT-FAMILY COMPARISON → family 10 (unit-family comparison w/o normalisation —
       the gate-32 kg-vs-tonne + caco3 t/day-vs-kg/day pattern, item-12 recurring bug)

SEVERITY WEIGHTING (2026-07-05: a flat finding count OVERSTATES difficulty — CO2
got 21/33 tabs >=9 on its first run despite 61 raw findings). Every FINDING is
additionally tagged BLOCKER or QUALITY:
    BLOCKER  hits a hard gate / a contract HARD_REQUIRED_SLOT / a closure — the
             run dies or a tab reads 0 (families 2, 7, 10; the "no _BOP_ROLES*
             placement regex" shape of family 6).
    QUALITY  vocabulary/coverage polish that manifests as a sub-9 score, not a
             failure (families 1, 5, 8; the "TYPE_RULES 'other'" shape of family 6).
The summary line reads e.g. "61 finding(s) — 2 BLOCKER, 59 QUALITY-polish" so a
campaign fixes blockers first. See _finding_weight().

PROPERTIES
    - READ-ONLY: never writes inside the repo; never mutates any state.
    - Exit 0 always for an audit run (this is an audit, not a gate) — a summary
      count is printed so a wrapper can still grep it.
    - --selftest exercises every detector BOTH directions on synthetic fixtures
      (a planted defect must fire; a clean fixture must not) and exits 1 on failure.

LEXICON SOURCES (scraped/imported live so the audit never drifts from the code)
    isCatalogueComponent + token sets   src/lib/pdf-engine-v2/lib/emitter-completion.ts
    GENERIC_HEADS                       scripts/lib/numeric-claim-drift-detector.ts
    schedule valve/instrument regexes   scripts/build-excel-export.py (_SCHED_*_RX etc.)
    _GLOSSARY / _JOIN_NEVER_FOLD        scripts/build-excel-export.py
    _GLOSSARY_TAG_PREFIXES              scripts/lib/dossier_audit.py
    ga_massing exclusions               scripts/blender-universal/ga_massing.py (direct import — bpy-free)
    SHAPE_RULES / _BOP_ROLES*           scripts/blender-universal/build_universal_scene.py (AST scrape — bpy module)
    TYPE_RULES / TYPE_EXPECTED          scripts/blender-universal/parts_ledger.py
    registerArchetype quantity space    scripts/lib/engineering-contract.ts
    DEFAULT_* physics defaults          scripts/blender-universal/connection_sizing.py
    wholesale-rating guard              scripts/blender-universal/draw_panel_schedule.py
"""

from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

REPO = Path(__file__).resolve().parent.parent

# ── source files ─────────────────────────────────────────────────────────────
EMITTER_COMPLETION = REPO / "src/lib/pdf-engine-v2/lib/emitter-completion.ts"
DRIFT_DETECTOR = REPO / "scripts/lib/numeric-claim-drift-detector.ts"
EXCEL_EXPORT = REPO / "scripts/build-excel-export.py"
DOSSIER_AUDIT = REPO / "scripts/lib/dossier_audit.py"
GA_MASSING = REPO / "scripts/blender-universal/ga_massing.py"
SCENE_BUILDER = REPO / "scripts/blender-universal/build_universal_scene.py"
PARTS_LEDGER = REPO / "scripts/blender-universal/parts_ledger.py"
CONTRACT = REPO / "scripts/lib/engineering-contract.ts"
DET_EMITTER = REPO / "scripts/lib/deterministic-emitter.ts"
CLASS_PLANS_DIR = REPO / "scripts/lib/orchestrator/class-plans"
CONN_SIZING = REPO / "scripts/blender-universal/connection_sizing.py"
PANEL_SCHEDULE = REPO / "scripts/blender-universal/draw_panel_schedule.py"
COST_SANITY = REPO / "src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit.ts"
BRIEFS_LOOP = REPO / "briefs-loop"

# ── the 9 defect families (docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md) ─────────────
FAMILIES: Dict[int, Tuple[str, str]] = {
    1: ("Vocabulary/matcher gaps",
        "a bare noun can never decide a join; qualifiers decide, generics support — "
        "audit every matcher for the class's vocabulary FIRST (the f9dfc2918 discipline)"),
    2: ("Two-truths / multi-mint",
        "one mint, one owner; every consumer reads the contract quantity — a numeric "
        "literal inside a class plan/closure is a bug waiting (the 280 Ah pattern)"),
    3: ("Stale-artefact / ordering",
        "any authored artefact must be re-validated against the FINAL state; evidence "
        "runs need a staleness gate"),
    4: ("Identity field-swaps",
        "an accessory-shaped word whose researched PN disagrees with the copied modifier "
        "PN prefers the researched identity (_ACCESSORY_IDENTITY_RE family)"),
    5: ("Placeholder/default trust",
        "a reading that matches a schedule-wide default AND contradicts the consumer's "
        "own arithmetic is a placeholder — derive from own evidence"),
    6: ("Denominator dishonesty",
        "the expectation derives from the same shared classification that governs "
        "rendering (ga_massing/TYPE_RULES) — one classification, both sides"),
    7: ("Scorer double-penalties / silent caps",
        "every deduction exactly once; verdicts are live formulas, never bare literals; "
        "caps only with differentiated excellence criteria"),
    8: ("Procurement-model mismatches",
        "capture the archetype's real procurement model (with market citations) as "
        "contract inputs BEFORE judging any cost anchor; block price = authority, "
        "component lines = reconciled transparency breakdown"),
    9: ("LLM re-roll surfaces",
        "no LLM opinion may score, block, or vary a deliverable without a cache hit or "
        "deterministic corroboration — and verify a gate's claim before 'fixing'"),
    10: ("Unit-family comparison without normalization",
         "a value in unit A (kg, day, kWh, W…) compared or divided against a band/"
         "target in unit B of the SAME physical family (tonne, year, MWh, kW…) needs "
         "a canonical unit-family conversion (targetPerformanceValueAs / an explicit "
         "conversion factor) somewhere on the path — never compare raw magnitudes "
         "across a unit-family boundary (the gate-32 kg/tonne false-block + the "
         "caco3 closure t/day-vs-kg/day pattern, item-12 in CLAUDE.md's recurring-bug list)"),
}

# families whose FINDING-severity findings are, structurally, BLOCKER-weight: the
# failure mode is "the run dies or a tab reads 0" (a hard gate, a contract
# HARD_REQUIRED_SLOT, or a closure/verdict computed wrong) rather than a coverage/
# vocabulary gap that merely shaves a score. See module docstring §SEVERITY WEIGHTING.
_BLOCKER_FAMILIES = {7, 10}
_QUALITY_FAMILIES = {1, 5, 8}
# a family-2 finding whose snippet contains a READ-FIRST marker (`??` fallback or
# a `q(contract, ...)` mint helper) reads the contract quantity and only falls
# back to the literal when it is absent — a defensive default, not an active
# divergence (QUALITY, the "280 Ah pattern" only bites if the fallback is ever
# actually hit). A BARE literal on a quantity name with NEITHER marker present
# (a closure assigning `total_cell_mass_kg: 7000,` with no read at all, or "no
# registerArchetype block"/"no class plan file") is the true "literal-shadow-
# in-a-closure" shape the task calls out — BLOCKER.
_READ_FIRST_MARKER_RX = re.compile(r"\?\?|q\(")


def _finding_weight(f: "Finding") -> str:
    """BLOCKER | QUALITY | INFO — the stage-weight for one finding. Only FINDING-
    severity findings are weighted (INFO stays INFO — it was never counted in the
    headline count either). Family 2 (constants) is mixed: see
    _READ_FIRST_MARKER_RX above. Family 6 (BoP roles) is mixed: a family whose
    part gets NO placement regex at all is a visible drop (BLOCKER — a box is
    silently missing from every 3D render); a part that merely falls through
    TYPE_RULES to 'other' only narrows which drawing types check it (QUALITY — a
    coverage-expectation shrink, not a visible miss). Unclassified/future
    families default to QUALITY (the conservative, non-alarming bucket) until a
    campaign proves otherwise."""
    if f.severity != "FINDING":
        return "INFO"
    if f.family == 2:
        return "QUALITY" if _READ_FIRST_MARKER_RX.search(f.text) else "BLOCKER"
    if f.family == 6:
        return "BLOCKER" if "_BOP_ROLES* placement regex" in f.text else "QUALITY"
    if f.family in _BLOCKER_FAMILIES:
        return "BLOCKER"
    return "QUALITY"

# The four conditional-literal families already fixed (context for surface 4;
# from _compliance_verdict_fx's own docstring in build-excel-export.py):
FIXED_CONDITIONAL_FAMILIES = [
    "FAIL (soft) defect/issue strings (_SOFT_MISS_RX → live recompute)",
    "generative-benchmark verdicts",
    "Connection-trace bare-'OK'",
    "Risk & Regulatory compliance-gate verdict (_compliance_verdict_fx)",
]

# ── tiny utils ───────────────────────────────────────────────────────────────

def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _line_of(src: str, idx: int) -> int:
    return src.count("\n", 0, idx) + 1


class Finding:
    def __init__(self, family: int, surface: str, text: str, where: str = "",
                 severity: str = "FINDING"):
        self.family = family
        self.surface = surface
        self.text = text
        self.where = where
        self.severity = severity  # FINDING | INFO
        self.weight: Optional[str] = None  # BLOCKER | QUALITY | INFO — set by run_audit()

    def render(self) -> str:
        fam_name = FAMILIES[self.family][0]
        loc = f" ({self.where})" if self.where else ""
        tag = self.weight or self.severity
        return (f"- **[{tag}] [family {self.family} — {fam_name}]** "
                f"{self.text}{loc}\n  - fix pattern: {FAMILIES[self.family][1]}")


# ═════════════════════════════════════════════════════════════════════════════
# LEXICON SCRAPERS (each returns data + is unit-testable on synthetic sources)
# ═════════════════════════════════════════════════════════════════════════════

def scrape_ts_set(src: str, name: str) -> List[str]:
    """Extract the string members of `const <name> = new Set<...>([ ... ])`.
    Tolerates multi-line bodies and inline // comments between entries."""
    m = re.search(rf"{re.escape(name)}\s*=\s*new Set(?:<[^>]*>)?\(\[(.*?)\]\)", src, re.S)
    if not m:
        return []
    body = m.group(1)
    # strip // comments so a stray token inside one is never collected
    body = re.sub(r"//[^\n]*", "", body)
    return [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", body)]


def scrape_ts_qualifier_gated(src: str) -> Dict[str, List[str]]:
    """Extract QUALIFIER_GATED_HEADS: Record<string, Set<string>>."""
    m = re.search(r"QUALIFIER_GATED_HEADS[^=]*=\s*\{(.*?)\n\}", src, re.S)
    if not m:
        return {}
    out: Dict[str, List[str]] = {}
    for head, body in re.findall(r"(\w+):\s*new Set\(\[([^\]]*)\]\)", m.group(1)):
        out[head] = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", body)]
    return out


def _ast_tree(path: Path) -> ast.Module:
    return ast.parse(_read(path))


def ast_assigned_names(tree: ast.Module, wanted: Sequence[str]) -> Dict[str, ast.expr]:
    """Top-level and nested Assign nodes for the wanted names → value expr."""
    out: Dict[str, ast.expr] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id in wanted and node.targets[0].id not in out:
            out[node.targets[0].id] = node.value
    return out


def _const_str(node: ast.expr) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    # re.compile('pattern', flags) call → its first arg
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
            and node.func.attr == "compile" and node.args:
        return _const_str(node.args[0])
    return None


def ast_regexes(tree: ast.Module, names: Sequence[str]) -> Dict[str, re.Pattern]:
    out: Dict[str, re.Pattern] = {}
    for nm, val in ast_assigned_names(tree, names).items():
        pat = _const_str(val)
        if pat:
            try:
                out[nm] = re.compile(pat, re.I)
            except re.error:
                pass
    return out


def ast_str_set(tree: ast.Module, name: str) -> List[str]:
    val = ast_assigned_names(tree, [name]).get(name)
    if isinstance(val, ast.Set):
        return [e.value for e in val.elts
                if isinstance(e, ast.Constant) and isinstance(e.value, str)]
    return []


def ast_pair_rules(tree: ast.Module, name: str, slug_first: bool) -> List[Tuple[str, str]]:
    """Extract a `name = [ (a, b, ...), ... ]` list where the first two tuple
    elements are strings (or re.compile calls). Returns [(slug, pattern)] with
    element order controlled by slug_first (TYPE_RULES/_BOP_ROLES are
    (slug, regex); SHAPE_RULES is (regex, shape))."""
    val = ast_assigned_names(tree, [name]).get(name)
    rules: List[Tuple[str, str]] = []
    if isinstance(val, (ast.List, ast.Tuple)):
        for elt in val.elts:
            if isinstance(elt, (ast.Tuple, ast.List)) and len(elt.elts) >= 2:
                a, b = _const_str(elt.elts[0]), _const_str(elt.elts[1])
                if a is not None and b is not None:
                    rules.append((a, b) if slug_first else (b, a))
    return rules


def scrape_glossary_abbrevs(tree: ast.Module) -> List[str]:
    """_GLOSSARY = [(category, [(abbrev, description), ...]), ...] → abbrev list."""
    val = ast_assigned_names(tree, ["_GLOSSARY"]).get("_GLOSSARY")
    abbrevs: List[str] = []
    if val is not None:
        for node in ast.walk(val):
            if isinstance(node, ast.Tuple) and len(node.elts) == 2 \
                    and all(isinstance(e, ast.Constant) and isinstance(e.value, str)
                            for e in node.elts):
                abbrevs.append(node.elts[0].value)
    return abbrevs


def scrape_default_constants(tree: ast.Module) -> List[Tuple[str, float, int]]:
    """DEFAULT_* = <number> module constants → (name, value, lineno)."""
    out: List[Tuple[str, float, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name) \
                and node.targets[0].id.startswith("DEFAULT_") \
                and isinstance(node.value, ast.Constant) \
                and isinstance(node.value.value, (int, float)):
            out.append((node.targets[0].id, float(node.value.value), node.lineno))
    return out


# ═════════════════════════════════════════════════════════════════════════════
# PYTHON MIRROR OF foldPluralToken / isCatalogueComponent (emitter-completion.ts)
# — used when the node bridge is unavailable; the bridge is authoritative.
# ═════════════════════════════════════════════════════════════════════════════

class CatalogueLexicon:
    def __init__(self, structural: Sequence[str], catalogue: Sequence[str],
                 housing_heads: Sequence[str], housing_quals: Sequence[str],
                 gated: Dict[str, List[str]], never_fold: Sequence[str]):
        self.structural = set(structural)
        self.catalogue = set(catalogue)
        self.housing_heads = set(housing_heads)
        self.housing_quals = set(housing_quals)
        self.gated = {k: set(v) for k, v in gated.items()}
        self.never_fold = set(never_fold)

    def fold(self, t: str) -> str:
        s = str(t or "").lower()
        if len(s) < 4 or s in self.never_fold:
            return s
        if re.search(r"[^aeiou]ies$", s):
            return s[:-3] + "y"
        if re.search(r"(ches|shes|sses|xes|zes)$", s):
            return s[:-2]
        if s.endswith("s") and not re.search(r"(ss|us|is)$", s):
            return s[:-1]
        return s

    def tokens(self, name: str) -> List[str]:
        return [self.fold(t) for t in re.split(r"[^a-z0-9]+", str(name or "").lower()) if t]

    def is_catalogue(self, name: str) -> bool:
        toks = self.tokens(name)
        if not toks:
            return False
        structural = any(t in self.structural for t in toks)
        qualified_housing = (any(t in self.housing_heads for t in toks)
                             and any(t in self.housing_quals for t in toks))
        qualified_gated = any(h in toks and any(t in quals for t in toks)
                              for h, quals in self.gated.items())
        catalogue = (any(t in self.catalogue for t in toks)
                     or qualified_housing or qualified_gated)
        if catalogue and not structural:
            return True
        if structural and not catalogue:
            return False
        if catalogue and structural:
            last = toks[-1] if toks else ""
            if last in self.housing_heads and qualified_housing:
                return True
            return last not in self.structural
        return False


def load_catalogue_lexicon() -> CatalogueLexicon:
    src = _read(EMITTER_COMPLETION)
    return CatalogueLexicon(
        structural=scrape_ts_set(src, "STRUCTURAL_TOKEN_SET"),
        catalogue=scrape_ts_set(src, "CATALOGUE_TOKEN_SET"),
        housing_heads=scrape_ts_set(src, "HOUSING_HEADS"),
        housing_quals=scrape_ts_set(src, "HOUSING_QUALIFIERS"),
        gated=scrape_ts_qualifier_gated(src),
        never_fold=scrape_ts_set(src, "NEVER_FOLD"),
    )


def node_is_catalogue(names: Sequence[str], timeout_s: int = 240) -> Optional[Dict[str, bool]]:
    """ONE `npx tsx` invocation calling the REAL isCatalogueComponent for every
    name. Returns None on any failure (caller falls back to the Python mirror)."""
    mod = EMITTER_COMPLETION.with_suffix("").as_posix()
    js = (
        "import fs from 'fs';\n"
        f"import {{ isCatalogueComponent }} from '{mod}';\n"
        "const names = JSON.parse(fs.readFileSync(0, 'utf8'));\n"
        "const out = {};\n"
        "for (const n of names) out[n] = isCatalogueComponent(n);\n"
        "process.stdout.write(JSON.stringify(out));\n"
    )
    try:
        proc = subprocess.run(
            ["npx", "--yes", "tsx", "-e", js], input=json.dumps(list(names)),
            capture_output=True, text=True, timeout=timeout_s, cwd=str(REPO))
        if proc.returncode != 0:
            return None
        # tsx may print banners on stderr; stdout must be the pure JSON object
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        return None


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 1 — VOCABULARY (family 1)
# ═════════════════════════════════════════════════════════════════════════════

_STOPWORDS = set("""
a an and are as at be been being but by can could do does each every for from
has have how if in into is it its may more most must no nor not of on or our
per shall should so such than that the their them then there these they this
those to too under until up upon via was we were what when where which while
who whose will with within without would you your also all any both other same
own only over out about above across after against along among around before
below between during off once
provide provides provided providing include includes included including require
requires required requiring deliver delivers delivered delivering ensure
ensures ensured design designed sized rated using use used shall
approximately typical typically nominal nominally minimum maximum least
new full two three four five six seven eight nine ten single double dual
tall total overall complete field level based ready
cost costs work works headline beginning market price prices pricing budget
summary section sections delivery scope project overview objective objectives
requirement requirements
""".split())

_UNIT_TOKENS = set("""
kw kwh kv kva kvar mw mwh gwh w wh v a ma ah hz bar mbar kpa mpa psi ppm ppb
m mm cm km m2 m3 ft kg g t tonne tonnes hr h min s sec degc c k litre litres
l lpm lps gpm nm rpm db dba pct kmol mol kj mj gj yr day days year years week
weeks month months x
""".split())


def extract_brief_vocabulary(brief_text: str) -> Tuple[List[Tuple[str, int]], List[str], List[str]]:
    """Returns (token_freq [(folded_token, count)], phrases, tag_prefixes).
    Deterministic noun-ish extraction: stopword-delimited runs of alpha tokens;
    tokens are the atom the shared matchers actually join on."""
    text = re.sub(r"```.*?```", " ", brief_text, flags=re.S)
    tag_prefixes = sorted({m.group(1) for m in
                           re.finditer(r"\b([A-Z]{1,4})-\d+", text)})
    counts: Counter = Counter()
    phrases: List[str] = []
    for line in text.splitlines():
        line = re.sub(r"[#>*_`|]+", " ", line)
        toks = re.findall(r"[A-Za-z][A-Za-z0-9-]*", line)
        run: List[str] = []
        for t in toks + ["."]:
            low = t.lower().strip("-")
            if (low in _STOPWORDS or low in _UNIT_TOKENS or len(low) < 3
                    or low.isdigit()):
                if run:
                    phrases.append(" ".join(run[-5:]))
                    run = []
                continue
            run.append(low)
            counts[low] += 1
    seen = set()
    phrases = [p for p in phrases if not (p in seen or seen.add(p))]
    return counts.most_common(), phrases, tag_prefixes


def scrape_class_plan_word_names(plan_src: str) -> List[str]:
    return sorted({m.group(1).replace("_", " ") for m in
                   re.finditer(r"word_name:\s*'([^']+)'", plan_src)})


def audit_vocabulary(slug: str, brief_text: str, plan_src: str,
                     use_node: bool = True) -> Tuple[List[Finding], Dict]:
    findings: List[Finding] = []
    lex = load_catalogue_lexicon()

    drift_src = _read(DRIFT_DETECTOR)
    generic_heads = set(scrape_ts_set(drift_src, "GENERIC_HEADS"))

    excel_tree = _ast_tree(EXCEL_EXPORT)
    sched_rx = ast_regexes(excel_tree, [
        "_SCHED_VALVE_RX", "_INSTRUMENT_ROW_RX", "_SCHED_CONTROL_SYSTEM_RX",
        "_VESSEL_SHAPE_RX", "_SCHED_ELECTRICAL_SENSE_RX", "_SCHED_ACCESSORY_RX"])
    join_never_fold = set(ast_str_set(excel_tree, "_JOIN_NEVER_FOLD"))
    glossary_abbrevs = {a.upper() for a in scrape_glossary_abbrevs(excel_tree)}

    dossier_tree = _ast_tree(DOSSIER_AUDIT)
    glossary_prefixes = set(ast_str_set(dossier_tree, "_GLOSSARY_TAG_PREFIXES"))

    # ga_massing is bpy-free by design — import it directly
    sys.path.insert(0, str(GA_MASSING.parent))
    try:
        import ga_massing  # type: ignore
        ga_excluded = ga_massing.is_ga_non_massing
    except Exception:
        ga_rx = ast_regexes(_ast_tree(GA_MASSING), ["GA_NON_MASSING_RE"])
        _rx = ga_rx.get("GA_NON_MASSING_RE")
        ga_excluded = (lambda n: bool(_rx.search(n))) if _rx else (lambda n: False)

    scene_tree = _ast_tree(SCENE_BUILDER)
    shape_rules = [(re.compile(p, re.I), s) for s, p in
                   ast_pair_rules(scene_tree, "SHAPE_RULES", slug_first=False)]
    ledger_tree = _ast_tree(PARTS_LEDGER)
    type_rules = [(s, re.compile(p, re.I)) for s, p in
                  ast_pair_rules(ledger_tree, "TYPE_RULES", slug_first=True)]
    bop_tables = load_bop_roles()

    token_freq, phrases, tag_prefixes = extract_brief_vocabulary(brief_text)
    plan_nouns = scrape_class_plan_word_names(plan_src)
    for pn in plan_nouns:
        phrases.append(pn)
        for t in pn.split():
            if t not in _STOPWORDS and t not in _UNIT_TOKENS and len(t) >= 3:
                token_freq.append((t, 1))

    # collapse duplicate tokens after plan merge, fold plurals
    folded: Counter = Counter()
    for tok, n in token_freq:
        folded[lex.fold(tok)] += n
    all_tokens = sorted(folded)

    # authoritative catalogue answer: the REAL TS function via node, else mirror
    node_answers = node_is_catalogue(all_tokens + phrases) if use_node else None
    mode = "node bridge (real isCatalogueComponent)" if node_answers else \
           "python mirror of isCatalogueComponent (node bridge unavailable)"

    def is_cat(name: str) -> bool:
        if node_answers is not None and name in node_answers:
            return bool(node_answers[name])
        return lex.is_catalogue(name)

    def token_known(tok: str) -> List[str]:
        known: List[str] = []
        if tok in lex.catalogue:
            known.append("catalogue-token")
        if tok in lex.structural:
            known.append("structural-token")
        if tok in lex.housing_heads or tok in lex.housing_quals:
            known.append("housing")
        if tok in lex.gated or any(tok in q for q in lex.gated.values()):
            known.append("qualifier-gated")
        if tok in generic_heads:
            known.append("GENERIC_HEADS")
        for nm, rx in sched_rx.items():
            if rx.search(tok):
                known.append(nm)
                break
        if ga_excluded(tok):
            known.append("ga_massing-exclusion")
        for rx, shape in shape_rules:
            if rx.search(tok):
                known.append(f"SHAPE_RULES:{shape}")
                break
        for ts, rx in type_rules:
            if rx.search(tok):
                known.append(f"TYPE_RULES:{ts}")
                break
        for tbl, rules in bop_tables.items():
            hit = next((s for s, rx in rules if rx.search(tok)), None)
            if hit:
                known.append(f"{tbl}:{hit}")
                break
        return known

    coverage = {tok: token_known(tok) for tok in all_tokens}
    unknown = [(tok, folded[tok]) for tok in all_tokens if not coverage[tok]]
    unknown.sort(key=lambda kv: (-kv[1], kv[0]))
    phrase_toks = {p: [lex.fold(t) for t in p.split()] for p in phrases}

    # PRINCIPAL phrases (for the BoP-role surface): words the engine could
    # actually mint — class-plan word_names + short brief phrases whose HEAD
    # token some lexicon knows. Folded, deduped, order-preserving.
    principal_phrases: List[str] = []
    _seen_p = set()
    for pn in plan_nouns:
        fp = " ".join(lex.fold(t) for t in pn.split())
        if fp and fp not in _seen_p:
            _seen_p.add(fp)
            principal_phrases.append(fp)
    for p, ptoks in phrase_toks.items():
        if 1 <= len(ptoks) <= 3 and coverage.get(ptoks[-1]):
            fp = " ".join(ptoks)
            if fp not in _seen_p:
                _seen_p.add(fp)
                principal_phrases.append(fp)

    # TIERING (honesty without prose noise): the matchers join on EQUIPMENT
    # vocabulary. An unknown token is a FINDING when it is (a) part of a class-plan
    # word_name (the engine WILL mint that word), or (b) sits in a brief phrase
    # beside a KNOWN equipment token (qualifier vocabulary — "qualifiers decide,
    # generics support"). Unknown tokens with no equipment context are brief PROSE
    # and collapse into one compact INFO note.
    plan_tokens = {lex.fold(t) for pn in plan_nouns for t in pn.split()}
    equipment_adjacent: Dict[str, str] = {}
    for p, ptoks in phrase_toks.items():
        if len(ptoks) < 2:
            continue
        if any(coverage.get(t) for t in ptoks):
            for t in ptoks:
                if not coverage.get(t):
                    equipment_adjacent.setdefault(t, p)

    prose_unknown: List[Tuple[str, int]] = []
    for tok, n in unknown:
        if tok in plan_tokens:
            findings.append(Finding(
                1, "VOCABULARY",
                f"class-plan word_name token `{tok}` is unknown to EVERY shared "
                f"matcher lexicon — the engine WILL mint a word carrying it and no "
                f"join can fire",
                "class plan word_name vs all matcher lexicons"))
        elif tok in equipment_adjacent and n >= 2:
            findings.append(Finding(
                1, "VOCABULARY",
                f"brief equipment-qualifier token `{tok}` (×{n}, beside known "
                f"equipment in \"{equipment_adjacent[tok]}\") is unknown to every "
                f"shared matcher lexicon — the qualifier that should DECIDE a join "
                f"cannot",
                "brief vocabulary vs all matcher lexicons"))
        else:
            prose_unknown.append((tok, n))
    if prose_unknown:
        listed = ", ".join(f"`{t}`×{n}" for t, n in prose_unknown[:40])
        more = f" (+{len(prose_unknown) - 40} more)" if len(prose_unknown) > 40 else ""
        findings.append(Finding(
            1, "VOCABULARY",
            f"{len(prose_unknown)} further brief tokens unknown to every lexicon but "
            f"with no equipment context (prose — review only if any is actually an "
            f"equipment family): {listed}{more}",
            "", severity="INFO"))

    # tag prefixes vs the dossier-audit glossary prefix set
    for pfx in tag_prefixes:
        if pfx not in glossary_prefixes:
            findings.append(Finding(
                1, "VOCABULARY",
                f"brief tag prefix `{pfx}-…` is not in _GLOSSARY_TAG_PREFIXES — every "
                f"principal row using it fires glossary_undocumented_prefix (MED)",
                "scripts/lib/dossier_audit.py:_GLOSSARY_TAG_PREFIXES"))

    # acronyms in the brief vs the workbook glossary
    acronyms = sorted({t for t in re.findall(r"\b[A-Z]{2,6}\b", brief_text)
                       if t.upper() not in glossary_abbrevs
                       and not re.fullmatch(r"[IVX]+", t)})
    if acronyms:
        findings.append(Finding(
            1, "VOCABULARY",
            f"brief acronyms with no workbook-glossary entry: {', '.join(acronyms)}",
            "scripts/build-excel-export.py:_GLOSSARY", severity="INFO"))

    # NEVER_FOLD cross-lexicon drift (TS vs Python join key) — deterministic
    div = lex.never_fold.symmetric_difference(join_never_fold)
    if div:
        findings.append(Finding(
            1, "VOCABULARY",
            f"NEVER_FOLD lexicons have diverged: TS emitter-completion.ts has "
            f"{sorted(lex.never_fold)} but Python _JOIN_NEVER_FOLD has "
            f"{sorted(join_never_fold)} (difference: {sorted(div)}) — a name "
            f"containing a diverged token plural-folds differently on the two sides",
            "emitter-completion.ts:NEVER_FOLD vs build-excel-export.py:_JOIN_NEVER_FOLD"))

    # NEVER_FOLD candidates: s-ending mass-noun-looking brief tokens whose
    # singular never appears in the brief (the 'mains' signature)
    candidates = []
    for tok, n in folded.items():
        raw_forms = {t for t, _ in token_freq if lex.fold(t) == tok}
        for raw in raw_forms:
            if (raw.endswith("s") and len(raw) >= 4
                    and not re.search(r"(ss|us|is)$", raw)
                    and raw not in lex.never_fold and raw not in join_never_fold
                    and lex.fold(raw) != raw
                    and not re.search(rf"\b{re.escape(lex.fold(raw))}\b", brief_text, re.I)
                    and folded[tok] >= 2):
                candidates.append(raw)
    if candidates:
        findings.append(Finding(
            1, "VOCABULARY",
            f"plural-fold NEVER_FOLD candidates (s-ending tokens whose singular never "
            f"appears in the brief — possible mass nouns, review before first run): "
            f"{', '.join(sorted(set(candidates)))}",
            "emitter-completion.ts:NEVER_FOLD + build-excel-export.py:_JOIN_NEVER_FOLD",
            severity="INFO"))

    detail = {"mode": mode, "coverage": coverage, "phrases": phrases,
              "unknown": unknown,
              "principal_phrases": principal_phrases,
              "is_cat": {p: is_cat(p) for p in principal_phrases},
              "shape_rules": shape_rules, "type_rules": type_rules,
              "plan_nouns": plan_nouns}
    return findings, detail


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 2 — CONSTANTS (family 2, the 280 Ah pattern)
# ═════════════════════════════════════════════════════════════════════════════

_LEGIT_MARKERS = re.compile(
    r"physics_constant|physical standard|ISO 668|citation:|standard atmosphere", re.I)
_NUM = r"-?\d[\d_]*(?:\.\d+)?"

# ids that are structural plan-file vocabulary, never contract quantities
_NON_QUANTITY_IDS = {
    "word_name", "unit_price_gbp", "macro_assembly_prices", "tool_id",
    "contract_update", "input_from_contract", "consistency_rules",
    "envelope_predicate", "max_iterations", "convergence_tolerance_pct",
    "coupled_pairs", "feeds_into", "per_unit_label", "min_value", "max_value",
}


def contract_block(contract_src: str, slug: str) -> Tuple[str, int]:
    """The registerArchetype('<slug>' …) block and its 1-based start line."""
    for variant in {slug, slug.replace("_", "-"), slug.replace("-", "_")}:
        m = re.search(rf"registerArchetype\(\s*'{re.escape(variant)}'", contract_src)
        if m:
            nxt = contract_src.find("\nregisterArchetype(", m.end())
            end = nxt if nxt != -1 else len(contract_src)
            return contract_src[m.start():end], _line_of(contract_src, m.start())
    return "", 0


def harvest_quantity_names(block: str) -> set:
    names = set(re.findall(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b", block))
    return names - _NON_QUANTITY_IDS


def scan_shadow_literals(src: str, quantity_names: set, label: str,
                         base_line: int = 0) -> List[Tuple[str, int, str, str]]:
    """Numeric literals adjacent to a contract quantity name → the multi-mint
    pattern. Returns (file_label, line, quantity, snippet)."""
    hits: List[Tuple[str, int, str, str]] = []
    pats = [
        # foo?.value ?? 314  /  foo ?? 314
        re.compile(rf"\b(\w+(?:_\w+)+)(?:\?\.value)?\s*\?\?\s*({_NUM})"),
        # q(contract, 'foo', 314)   /   q(c, 'foo', 314)
        re.compile(rf"q\(\s*\w+\s*,\s*'(\w+)'\s*,\s*({_NUM})\s*\)"),
        # foo: 314   (contract_update / stepMassAgg literal mints)
        re.compile(rf"\b(\w+(?:_\w+)+)\s*:\s*({_NUM})\s*[,}}\n]"),
    ]
    for i, line in enumerate(src.splitlines(), start=1):
        if _LEGIT_MARKERS.search(line):
            continue
        for pat in pats:
            for m in pat.finditer(line):
                name, num = m.group(1), m.group(2)
                if name not in quantity_names:
                    continue
                try:
                    val = float(num.replace("_", ""))
                except ValueError:
                    continue
                if val in (0.0, 1.0):
                    continue
                snippet = line.strip()
                if len(snippet) > 110:
                    snippet = snippet[:107] + "…"
                hits.append((label, base_line + i - (1 if base_line else 0), name, snippet))
                break
    # dedupe by (file, line)
    seen, out = set(), []
    for h in hits:
        if (h[0], h[1]) not in seen:
            seen.add((h[0], h[1]))
            out.append(h)
    return out


def audit_constants(slug: str, plan_path: Optional[Path], plan_src: str) -> List[Finding]:
    findings: List[Finding] = []
    contract_src = _read(CONTRACT)
    block, block_line = contract_block(contract_src, slug)
    if not block:
        findings.append(Finding(
            2, "CONSTANTS",
            f"no registerArchetype('{slug}') block in engineering-contract.ts — the "
            f"class has no contract quantity namespace yet; every downstream numeric "
            f"is un-anchored (mint the contract FIRST)",
            "scripts/lib/engineering-contract.ts"))
        return findings
    qnames = harvest_quantity_names(block)

    scans: List[Tuple[str, str, int]] = []
    if plan_src:
        scans.append((plan_src, str(plan_path.relative_to(REPO)) if plan_path else "class-plan", 0))
    scans.append((block, f"scripts/lib/engineering-contract.ts (block @ line {block_line})",
                  block_line))
    det_src = _read(DET_EMITTER)
    scans.append((det_src, "scripts/lib/deterministic-emitter.ts", 0))

    for src, label, base in scans:
        for f, line, name, snippet in scan_shadow_literals(src, qnames, label, base):
            sev = "INFO" if "engineering-contract" in f else "FINDING"
            # a literal inside the contract block itself is usually the canonical
            # mint (one owner) — INFO; a literal in a plan/emitter is a shadow.
            findings.append(Finding(
                2, "CONSTANTS",
                f"numeric literal shadows contract quantity `{name}`: `{snippet}`",
                f"{f}:{line}", severity=sev))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 3 — BOP ROLES (family 6)
# ═════════════════════════════════════════════════════════════════════════════

def load_bop_roles() -> Dict[str, List[Tuple[str, re.Pattern]]]:
    tree = _ast_tree(SCENE_BUILDER)
    tables: Dict[str, List[Tuple[str, re.Pattern]]] = {}
    for tbl in ("_BOP_ROLES", "_BOP_ROLES_COMPUTE", "_GROW_BOP_ROLES", "_TM_BOP_ROLES"):
        rules = []
        for s, p in ast_pair_rules(tree, tbl, slug_first=True):
            try:
                rules.append((s, re.compile(p, re.I)))
            except re.error:
                pass
        if rules:
            tables[tbl] = rules
    return tables


def audit_bop_roles(phrases: Sequence[str], is_cat: Dict[str, bool],
                    shape_rules, type_rules,
                    bop_tables: Dict[str, List[Tuple[str, re.Pattern]]]) -> List[Finding]:
    """Equipment families (principal-looking brief/plan phrases) vs the placement
    tables: no _BOP_ROLES regex → silent 3D scene drop; TYPE_RULES 'other' →
    invisible on every P&ID/SLD/panel-schedule/process-schedule expectation."""
    findings: List[Finding] = []

    def classify_shape(name: str) -> str:
        for rx, shape in shape_rules:
            if rx.search(name):
                return shape
        return "box"

    def classify_type(name: str) -> str:
        for slug_, rx in type_rules:
            if rx.search(name):
                return slug_
        return "other"

    seen = set()
    for phrase in phrases:
        key = phrase.lower()
        if key in seen or len(phrase.split()) > 5:
            continue
        seen.add(key)
        shape = classify_shape(phrase)
        typ = classify_type(phrase)
        principal = (is_cat.get(phrase, False)
                     or shape not in ("box", "instrument")
                     or typ in ("vessel", "rotating", "exchanger", "separator",
                                "electrical"))
        if not principal:
            continue
        bop_hits = [f"{tbl}:{slug_}" for tbl, rules in bop_tables.items()
                    for slug_, rx in rules if rx.search(phrase)]
        if not bop_hits:
            findings.append(Finding(
                6, "BOP ROLES",
                f"equipment family \"{phrase}\" (shape={shape}, type={typ}) matches NO "
                f"_BOP_ROLES* placement regex — a BoM part of this family gets no "
                f"dedicated 3D box (silent scene drop)",
                "scripts/blender-universal/build_universal_scene.py:_BOP_ROLES*"))
        if typ == "other":
            findings.append(Finding(
                6, "BOP ROLES",
                f"equipment family \"{phrase}\" falls to TYPE_RULES 'other' — its "
                f"drawing-coverage expectation shrinks to {{blender, general-arrangement}} "
                f"so it is never checked against P&ID/SLD/panel-schedule/BFD",
                "scripts/blender-universal/parts_ledger.py:TYPE_RULES"))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 4 — CONDITIONAL LITERALS (family 7)
# ═════════════════════════════════════════════════════════════════════════════

_VERDICT_RX = re.compile(r"^(?:PASS|FAIL|OKAY|GOOD|DONE)\b|^[Oo][Kk]\b|^[✓✗](?:\s|$)")

_HELPER_ALLOWLIST = {
    "fx_verdict", "_verdict_expr", "_write_defect_cell", "_write_defect_join_cell",
    "_compliance_verdict_fx", "_enforce_live_check_gate", "_cf_verdict",
    "verdict_text", "compute_verdict", "_fx_evidence_expr",
}


def scan_conditional_verdict_literals(py_src: str,
                                      filename: str = "<src>") -> List[Tuple[int, str]]:
    """Sibling patterns of the four fixed conditional-literal families: a bare
    verdict STRING reaching a worksheet RENDER call (`ws.cell(...)`/`ws.append(...)`
    argument tree, directly or via an IfExp branch) outside the formula helpers.
    Verdict strings computed into STATE dicts are legitimate (the workbook side is
    guarded by _enforce_live_check_gate); comparisons (`x == "PASS"`) and formula
    strings (leading '=') never fire."""
    tree = ast.parse(py_src)
    parents: Dict[ast.AST, ast.AST] = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node

    def enclosing_fn(node: ast.AST) -> str:
        cur = node
        while cur in parents:
            cur = parents[cur]
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                return cur.name
        return ""

    def verdict_const(n: ast.AST) -> bool:
        return (isinstance(n, ast.Constant) and isinstance(n.value, str)
                and not n.value.startswith("=") and bool(_VERDICT_RX.match(n.value)))

    hits: List[Tuple[int, str]] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr in ("cell", "append")):
            continue
        recv = node.func.value
        recv_name = recv.id if isinstance(recv, ast.Name) else getattr(recv, "attr", "")
        if not (str(recv_name).startswith("ws") or "sheet" in str(recv_name).lower()):
            continue  # list.append into state is not a render site
        fn = enclosing_fn(node)
        if fn in _HELPER_ALLOWLIST or "selftest" in fn.lower():
            continue
        for arg in node.args:
            for sub in ast.walk(arg):
                if verdict_const(sub) and not isinstance(parents.get(sub), ast.Compare):
                    kind = ("conditional " if isinstance(parents.get(sub), ast.IfExp)
                            else "")
                    hits.append((sub.lineno,
                                 f"ws.{node.func.attr}(…) renders a bare {kind}"
                                 f"verdict literal (in {fn or 'module'})"))
    return sorted(set(hits))


def audit_conditional_literals() -> List[Finding]:
    findings: List[Finding] = []
    src = _read(EXCEL_EXPORT)
    for line, what in scan_conditional_verdict_literals(src, "build-excel-export.py"):
        findings.append(Finding(
            7, "CONDITIONAL LITERALS",
            f"sibling of the fixed conditional-literal families: {what} — route it "
            f"through fx_verdict/_verdict_expr so the verdict is a live formula",
            f"scripts/build-excel-export.py:{line}"))
    if not findings:
        findings.append(Finding(
            7, "CONDITIONAL LITERALS",
            "no sibling conditional verdict-literal patterns found outside the formula "
            "helpers; the four known families are fixed ("
            + "; ".join(FIXED_CONDITIONAL_FAMILIES) + ") and _enforce_live_check_gate "
            "guards the built workbook",
            "scripts/build-excel-export.py", severity="INFO"))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 5 — PROCUREMENT MODEL (family 8) + decisions register
# ═════════════════════════════════════════════════════════════════════════════

_MARKET_CITE_RX = re.compile(
    r"BloombergNEF|BNEF|IEA\b|tender|market survey|market rate|market-cited|\$\s?\d+\s*/\s*k?Wh",
    re.I)


def audit_procurement(slug: str, brief_path: Path) -> List[Finding]:
    findings: List[Finding] = []
    contract_src = _read(CONTRACT)
    block, _ = contract_block(contract_src, slug)

    market_consts = sorted(set(re.findall(r"\bMARKET_[A-Z0-9_]+\b", block)))
    citations = len(_MARKET_CITE_RX.findall(block))
    if not market_consts and citations == 0:
        findings.append(Finding(
            8, "PROCUREMENT MODEL",
            f"the `{slug}` contract block has NO market-cited block-price anchor "
            f"(no MARKET_* constant, no market citation) — per-line component costs "
            f"will be bottom-up-summed with no procurement-scope authority (the BESS "
            f"$80/kWh DC-block pattern: MARKET_DC_BLOCK_GBP_PER_KWH_2026 + scope "
            f"statement + reconciliation factor)",
            "scripts/lib/engineering-contract.ts"))
    else:
        findings.append(Finding(
            8, "PROCUREMENT MODEL",
            f"market anchor present: {', '.join(market_consts) or '(comment citations only)'} "
            f"({citations} market citation(s) in the block)",
            "scripts/lib/engineering-contract.ts", severity="INFO"))

    decisions = brief_path.with_name(brief_path.stem + ".decisions.json")
    if not decisions.exists():
        findings.append(Finding(
            8, "PROCUREMENT MODEL",
            f"no decisions register `{decisions.name}` beside the brief — human market "
            f"facts (the two BESS adjudications: 5 MWh/20 ft density; $80/kWh scope) "
            f"have nowhere to land, and an undecided divergence still fails "
            f"(build-excel-export.py::_load_brief_decisions renders "
            f"CONSISTENT-WITH-DECISION only from this file)",
            str(decisions.relative_to(REPO)) if decisions.is_relative_to(REPO) else str(decisions)))
    else:
        findings.append(Finding(
            8, "PROCUREMENT MODEL",
            f"decisions register present: {decisions.name}",
            "", severity="INFO"))

    # top-down CAPEX plausibility band (gate 32) for the class
    if COST_SANITY.exists():
        sanity = _read(COST_SANITY)
        if not re.search(rf"\b{re.escape(slug)}\b", sanity):
            findings.append(Finding(
                8, "PROCUREMENT MODEL",
                f"no `{slug}` entry (or alias) in independent-cost-sanity-audit.ts — "
                f"the whole-plant £/output-unit plausibility band (gate 32) cannot "
                f"check this class top-down",
                "src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit.ts",
                severity="INFO"))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 6 — DORMANT DEFAULTS (family 5)
# ═════════════════════════════════════════════════════════════════════════════

_ELECTRICAL_TOPOLOGY_RX = re.compile(
    r"\bkV\b|switchgear|transformer|busbar|inverter|panel schedule|circuit|"
    r"switchboard|MCC\b", re.I)


def audit_dormant_defaults(brief_text: str) -> List[Finding]:
    findings: List[Finding] = []
    defaults = scrape_default_constants(_ast_tree(CONN_SIZING))
    electrical = bool(_ELECTRICAL_TOPOLOGY_RX.search(brief_text))

    if defaults:
        rendered = ", ".join(f"{n}={v:g} (line {ln})" for n, v, ln in defaults)
        findings.append(Finding(
            5, "DORMANT DEFAULTS",
            f"connection-schedule sizing defaults the class's topology will trust when "
            f"a real reading is absent: {rendered} — any of these recurring verbatim "
            f"across the schedule is the wholesale-rating signature (observed: 27.4 A, "
            f"4.2 A, 15 A placeholders on prior campaigns)",
            "scripts/blender-universal/connection_sizing.py", severity="INFO"))

    panel_src = _read(PANEL_SCHEDULE)
    guard = "_dominant_default_amps" in panel_src
    if electrical and guard:
        findings.append(Finding(
            5, "DORMANT DEFAULTS",
            "class has electrical topology; the wholesale-rating dominance detector "
            "(_dominant_default_amps: value recurring ≥3× AND >30% of readings) and "
            "its re-derive guards (_demand_needs_circuit_override) are present in "
            "draw_panel_schedule.py — verify on the first run that no current value "
            "dominates the schedule",
            "scripts/blender-universal/draw_panel_schedule.py", severity="INFO"))
    elif electrical and not guard:
        findings.append(Finding(
            5, "DORMANT DEFAULTS",
            "class has electrical topology but draw_panel_schedule.py has NO "
            "_dominant_default_amps dominance detector — wholesale placeholder "
            "currents would be trusted schedule-wide",
            "scripts/blender-universal/draw_panel_schedule.py"))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SURFACE 7 — UNIT-FAMILY COMPARISON (family 10, the gate-32 kg/tonne pattern)
# ═════════════════════════════════════════════════════════════════════════════
#
# The #1 recurring cross-archetype defect (CLAUDE.md item-12): a value in unit A
# reaches a comparison/division against a band or target in unit B of the SAME
# physical family with no canonical conversion on the path. Hit BESS (cell-Ah)
# and CO2 TWICE in one session (gate-32 kg-vs-tonne; a caco3 closure
# t/day-vs-kg/day). This is a DETECTOR (finds the structural pattern), not a
# refactor — it never edits engineering-contract.ts / the emitters / the gates
# it reads. A mirror of this exact detector is ported into
# scripts/regression-harness.tsx (UNIVERSAL.unit_family_comparison_normalized)
# so a future regression fails the BUILD, not just the pre-flight audit.

_UNIT_SUFFIX_FAMILY: Dict[str, str] = {
    "kg": "mass_kg", "kgs": "mass_kg", "kilogram": "mass_kg", "kilograms": "mass_kg",
    "t": "mass_t", "tonne": "mass_t", "tonnes": "mass_t", "ton": "mass_t", "tons": "mass_t",
    "day": "time_day", "days": "time_day", "daily": "time_day", "pd": "time_day",
    "yr": "time_yr", "yrs": "time_yr", "year": "time_yr", "years": "time_yr",
    "py": "time_yr", "annum": "time_yr", "pa": "time_yr",
    "kwh": "energy_kwh", "mwh": "energy_mwh", "gwh": "energy_gwh",
    "w": "power_w", "kw": "power_kw", "mw": "power_mw",
}
# two identifiers whose unit suffixes land in different members of the SAME
# group are the same physical dimension at a different scale/period — dividing
# or comparing them raw (no conversion between) is the bug shape.
_UNIT_CONFLICT_GROUPS: List[set] = [
    {"mass_kg", "mass_t"},
    {"time_day", "time_yr"},
    {"energy_kwh", "energy_mwh", "energy_gwh"},
    {"power_w", "power_kw", "power_mw"},
]
_UNIT_GENERIC_TOKENS = {
    "value", "output", "target", "low", "high", "band", "cost", "price", "total",
    "rate", "capacity", "actual", "expected", "result", "amount", "per", "gbp",
}
_UNIT_CANONICAL_CONVERTER_NAMES = (
    "targetPerformanceValueAs", "toCanonicalUnit", "convertUnit", "canonicalUnitValue",
    "normaliseUnit", "normalizeUnit", "unitFamilyConvert", "throughputToPerYear",
)
# a nearby conversion-factor literal (1000 kg/t, 0.001, 365 day/yr, 24 h/day,
# 8760 h/yr, 2204.6 lb/t) or a canonical-converter call name defuses the
# finding — the path DOES normalise between the two units.
_UNIT_CONVERSION_DEFUSE_RX = re.compile(
    r"\b(1000|0\.001|1e3|1e-3|365(?:\.25)?|24|8760|3600|2204\.6)\b|"
    + "|".join(re.escape(n) for n in _UNIT_CANONICAL_CONVERTER_NAMES))
_UNIT_IDENT_RX = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
_UNIT_ARITH_OR_COMPARE_RX = re.compile(r"/|<=|>=|<|>|===|!==|==")


def _unit_ident_tokens(name: str) -> List[str]:
    """camelCase AND snake_case → lowercase token list ('caco3OutputKgPerDay' and
    'caco3_output_kg_per_day' both → [caco3, output, kg, per, day])."""
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    return [p.lower() for p in re.split(r"[_.]", s) if p]


def _unit_families_and_base(name: str) -> Tuple[set, set]:
    """→ (unit-family set, base/stem token set). The base set is what identifies
    'the same physical quantity' across two differently-unit-suffixed names."""
    toks = _unit_ident_tokens(name)
    fams = {_UNIT_SUFFIX_FAMILY[t] for t in toks if t in _UNIT_SUFFIX_FAMILY}
    base = {t for t in toks if t not in _UNIT_SUFFIX_FAMILY and t not in _UNIT_GENERIC_TOKENS}
    return fams, base


# chars that mean "the gap between these two identifier mentions crosses a
# template-literal / string boundary" — two `${...}` interpolations sitting in
# the SAME narrative sentence are not a code-level comparison of each other,
# even though both idents and some unrelated '/' (a unit-label like "kg/day"
# inside the prose) share the line.
_UNIT_BOUNDARY_CHARS = ("`", "$", "{", "}", "'", '"')


def scan_unit_family_comparisons(src: str, label: str = "<src>",
                                 window: int = 2) -> List[Tuple[str, int, str]]:
    """DETECTOR (not a refactor): flags a line where an arithmetic (/) or
    comparison (<,<=,>,>=,==,===) operator sits DIRECTLY BETWEEN two identifier
    mentions that (a) share at least one non-generic base token (the same
    physical quantity) and (b) carry CONFLICTING unit-family suffixes within
    the same conflict group (mass_kg vs mass_t; time_day vs time_yr; kwh vs
    mwh vs gwh; w vs kw vs mw), with no canonical-conversion literal/call
    within `window` lines either side. Requiring the operator to sit strictly
    between the two mentions (not merely present anywhere on the line) is what
    keeps this a comparison detector rather than a co-occurrence detector — a
    narrative string quoting two unrelated quantities ("ratedMw ... /kW ...
    ratedKw" in one long template literal) shares a line but never places an
    operator directly between the two idents without crossing a template-
    literal/string boundary, so it does not fire. Structural + universal —
    keyed on identifier UNIT SUFFIXES and shared stems, never a class name.
    proveCatch (both directions, incl. the two known real-world false-positive
    shapes) lives in _selftest(). Returns (label, 1-based line, message)."""
    lines = src.splitlines()
    hits: List[Tuple[str, int, str]] = []
    for i, line in enumerate(lines):
        occurrences = []
        for m in _UNIT_IDENT_RX.finditer(line):
            fams, base = _unit_families_and_base(m.group(0))
            if fams:
                occurrences.append((m.start(), m.end(), m.group(0), fams, base))
        if len(occurrences) < 2:
            continue
        conflict = None
        for a_i in range(len(occurrences)):
            for b_i in range(a_i + 1, len(occurrences)):
                sa, ea, ta, fams_a, base_a = occurrences[a_i]
                sb, eb, tb, fams_b, base_b = occurrences[b_i]
                if ta == tb or not (base_a & base_b):
                    continue
                lo_pos, hi_pos = (ea, sb) if ea <= sb else (eb, sa)
                between = line[lo_pos:hi_pos]
                if any(ch in between for ch in _UNIT_BOUNDARY_CHARS):
                    continue  # the two mentions live in separate template/string spans
                if not _UNIT_ARITH_OR_COMPARE_RX.search(between):
                    continue  # co-occur on the line, but no operator DIRECTLY between them
                for group in _UNIT_CONFLICT_GROUPS:
                    a_in, b_in = fams_a & group, fams_b & group
                    if a_in and b_in and a_in != b_in:
                        conflict = (ta, sorted(a_in), tb, sorted(b_in))
                        break
                if conflict:
                    break
            if conflict:
                break
        if not conflict:
            continue
        lo, hi = max(0, i - window), min(len(lines), i + window + 1)
        if _UNIT_CONVERSION_DEFUSE_RX.search("\n".join(lines[lo:hi])):
            continue
        ta, fams_a, tb, fams_b = conflict
        snippet = line.strip()
        if len(snippet) > 120:
            snippet = snippet[:117] + "…"
        hits.append((label, i + 1,
                     f"`{ta}` ({'/'.join(fams_a)}) vs `{tb}` ({'/'.join(fams_b)}) "
                     f"compared/divided with no unit-family conversion nearby: {snippet}"))
    return hits


def audit_unit_family_comparisons() -> List[Finding]:
    """Runs the detector across the known comparison sites: the independent
    cost-sanity gate (gate 32 — the CO2 kg/tonne false-block), the CO2 emitter
    + closure library (the caco3 t/day-vs-kg/day pattern), and the contract
    itself. Read-only, class-agnostic (runs on every pre-flight regardless of
    slug — this is a codebase-wide lint, not a per-brief check)."""
    findings: List[Finding] = []
    targets = [
        (COST_SANITY, "src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit.ts"),
        (REPO / "scripts/lib/orchestrator/emitters/co2-mineralisation.ts",
         "scripts/lib/orchestrator/emitters/co2-mineralisation.ts"),
        (REPO / "scripts/deterministic_checks_lib.py", "scripts/deterministic_checks_lib.py"),
        (CONTRACT, "scripts/lib/engineering-contract.ts"),
    ]
    for path, label in targets:
        if not path.exists():
            continue
        for f, line, what in scan_unit_family_comparisons(_read(path), label):
            findings.append(Finding(10, "UNIT-FAMILY COMPARISON", what, f"{f}:{line}"))
    if not findings:
        findings.append(Finding(
            10, "UNIT-FAMILY COMPARISON",
            "no un-normalised unit-family comparisons detected in the known gate-32/"
            "caco3-closure comparison sites (independent-cost-sanity-audit.ts, "
            "co2-mineralisation.ts, deterministic_checks_lib.py, engineering-contract.ts)",
            "", severity="INFO"))
    return findings


# ═════════════════════════════════════════════════════════════════════════════
# SLUG DERIVATION (used by run-validation.sh — deterministic fast parse)
# ═════════════════════════════════════════════════════════════════════════════

def registered_slugs() -> List[str]:
    return sorted(set(re.findall(r"registerArchetype\(\s*'([a-z0-9_]+)'",
                                 _read(CONTRACT))))


_CLASS_IN_STATE_RX = re.compile(r'"class"\s*:\s*"([a-z0-9_]+)"')


def slug_from_prior_runs(brief_path: Path) -> Optional[str]:
    """The classification cache: a prior run dir whose 0-original-brief.md is
    byte-equal to this brief carries the engine's OWN classification in its
    state.json. Most-recent match wins. None when no prior run matches."""
    out_root = REPO / "out"
    if not out_root.exists():
        return None
    try:
        target = _read(brief_path).strip()
    except OSError:
        return None
    matches: List[Tuple[float, Path]] = []
    for ob in out_root.glob("*/0-original-brief.md"):
        st = ob.parent / "state.json"
        try:
            if st.exists() and ob.read_text(encoding="utf-8").strip() == target:
                matches.append((st.stat().st_mtime, st))
        except OSError:
            continue
    for _, st in sorted(matches, reverse=True):
        m = _CLASS_IN_STATE_RX.search(_read(st))
        if m:
            return m.group(1)
    return None


def derive_slug(brief_path: Path, slugs: Optional[Sequence[str]] = None,
                brief_text: Optional[str] = None) -> str:
    """Deterministically map a brief to a registered archetype slug. First
    preference: the engine's own classification from a prior run of the SAME
    brief (slug_from_prior_runs — disambiguates e.g. the Codema brief, a
    water-treatment plant FOR a vertical farm). Fallback: exact stem
    containment wins big, then slug-token presence in the stem, then in the
    brief text. Returns 'UNKNOWN' when nothing scores ≥ 2 — an UNKNOWN class is
    by definition a never-run class."""
    if brief_text is None:  # real-path mode only; fixtures pass brief_text
        prior = slug_from_prior_runs(brief_path)
        if prior:
            return prior
    slugs = list(slugs) if slugs is not None else registered_slugs()
    stem = brief_path.stem.lower().replace("-", "_")
    text = (brief_text if brief_text is not None else _read(brief_path)).lower()
    stem_words = stem.replace("_", " ")
    best_score, best_slug = 0.0, "UNKNOWN"
    for s in slugs:
        toks = s.split("_")
        score = 0.0
        if s in stem:
            score += 3.0
        score += 2.0 * sum(1 for t in toks
                           if re.search(rf"\b{re.escape(t)}\b", stem_words)) / len(toks)
        in_text = sum(1 for t in toks if re.search(rf"\b{re.escape(t)}\b", text))
        score += 1.0 * in_text / len(toks)
        if in_text == len(toks):
            score += 1.5  # every slug token in the brief text (stem-less briefs
            #               like fischer_farms_codema → water_treatment)
        if score > best_score or (score == best_score and s < best_slug):
            best_score, best_slug = score, s
    return best_slug if best_score >= 2.0 else "UNKNOWN"


# ═════════════════════════════════════════════════════════════════════════════
# REPORT
# ═════════════════════════════════════════════════════════════════════════════

def run_audit(slug: str, brief_path: Path, use_node: bool = True
             ) -> Tuple[str, int, int, int]:
    brief_text = _read(brief_path)
    plan_path = CLASS_PLANS_DIR / f"{slug.replace('_', '-')}.ts"
    plan_src = _read(plan_path) if plan_path.exists() else ""

    all_findings: List[Finding] = []

    vocab_findings, detail = audit_vocabulary(slug, brief_text, plan_src, use_node)
    all_findings += vocab_findings
    all_findings += audit_constants(slug, plan_path if plan_src else None, plan_src)
    all_findings += audit_bop_roles(
        detail["principal_phrases"], detail["is_cat"], detail["shape_rules"],
        detail["type_rules"], load_bop_roles())
    all_findings += audit_conditional_literals()
    all_findings += audit_procurement(slug, brief_path)
    all_findings += audit_dormant_defaults(brief_text)
    all_findings += audit_unit_family_comparisons()

    if not plan_src:
        all_findings.append(Finding(
            2, "CONSTANTS",
            f"no class plan file {plan_path.name} — the auto-planner will improvise "
            f"tools for this class (the co2-mineralisation plan exists precisely to "
            f"stop domain-mismatched tool contamination)",
            str(CLASS_PLANS_DIR.relative_to(REPO))))

    for f in all_findings:
        f.weight = _finding_weight(f)

    by_family: Dict[int, List[Finding]] = {}
    for f in all_findings:
        by_family.setdefault(f.family, []).append(f)

    n_findings = sum(1 for f in all_findings if f.severity == "FINDING")
    n_info = sum(1 for f in all_findings if f.severity == "INFO")
    n_blocker = sum(1 for f in all_findings if f.weight == "BLOCKER")
    n_quality = sum(1 for f in all_findings if f.weight == "QUALITY")

    lines = [
        f"# Archetype pre-flight audit — `{slug}`",
        "",
        f"- brief: `{brief_path}`",
        f"- class plan: `{plan_path.name}`" + ("" if plan_src else " **(MISSING)**"),
        f"- catalogue-candidacy mode: {detail['mode']}",
        f"- playbook: docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md (10 defect families; run "
        f"pre-flight fixes BEFORE the first chain run)",
        "",
        f"## Summary: {n_findings} finding(s) — {n_blocker} BLOCKER, {n_quality} "
        f"QUALITY-polish; {n_info} informational note(s)",
        "",
    ]
    for fam in sorted(by_family):
        fam_name, fix = FAMILIES[fam]
        fs = by_family[fam]
        nf = sum(1 for f in fs if f.severity == "FINDING")
        nfb = sum(1 for f in fs if f.weight == "BLOCKER")
        nfq = sum(1 for f in fs if f.weight == "QUALITY")
        lines.append(f"## Family {fam} — {fam_name} ({nf} finding(s): "
                     f"{nfb} BLOCKER, {nfq} QUALITY-polish)")
        lines.append("")
        for f in sorted(fs, key=lambda f: (f.severity != "FINDING", f.surface)):
            lines.append(f.render())
        lines.append("")

    # appendix: token coverage for the curious (kept short)
    unknown = detail["unknown"]
    lines.append("## Appendix — vocabulary coverage")
    lines.append("")
    lines.append(f"- brief/plan tokens evaluated: {len(detail['coverage'])}; "
                 f"unknown-everywhere: {len(unknown)}")
    known_sample = [f"`{t}`→{'/'.join(k[:2])}" for t, k in
                    sorted(detail["coverage"].items()) if k][:20]
    lines.append(f"- sample known tokens: {', '.join(known_sample)}")
    lines.append("")
    return "\n".join(lines), n_findings, n_blocker, n_quality


# ═════════════════════════════════════════════════════════════════════════════
# SELFTEST — every detector proves the catch BOTH directions on fixtures
# ═════════════════════════════════════════════════════════════════════════════

def _selftest() -> int:
    failures: List[str] = []

    def expect(cond: bool, msg: str):
        (failures.append(msg) if not cond else None)
        print(("  PASS  " if cond else "  FAIL  ") + msg)

    print("[selftest] scrape_ts_set — multi-line body with inline comments")
    ts_fixture = """
const STRUCTURAL_TOKEN_SET = new Set<string>([
  'spar', 'mount',
  // a comment between entries
  'tower',
])
const NEVER_FOLD = new Set<string>(['ups', 'mains'])  // trailing comment
"""
    got = scrape_ts_set(ts_fixture, "STRUCTURAL_TOKEN_SET")
    expect(got == ["spar", "mount", "tower"], f"comment-tolerant scrape: {got}")
    expect(scrape_ts_set(ts_fixture, "NEVER_FOLD") == ["ups", "mains"],
           "single-line scrape")
    expect(scrape_ts_set(ts_fixture, "NO_SUCH_SET") == [],
           "missing set scrapes empty, no crash")

    print("[selftest] foldPluralToken mirror (against the TS spec)")
    lex = CatalogueLexicon([], [], [], [], {}, ["ups", "lens", "bellows", "scada", "mains"])
    for raw, want in [("valves", "valve"), ("batteries", "battery"),
                      ("switches", "switch"), ("mains", "mains"),
                      ("chassis", "chassis"), ("gps", "gps"), ("glasses", "glass")]:
        expect(lex.fold(raw) == want, f"fold('{raw}') == '{want}' (got '{lex.fold(raw)}')")

    print("[selftest] isCatalogueComponent mirror vs the REAL lexicons")
    real = load_catalogue_lexicon()
    expect(len(real.catalogue) > 50 and len(real.structural) > 20,
           f"real lexicons load ({len(real.catalogue)} catalogue / "
           f"{len(real.structural)} structural tokens)")
    for name, want in [
        ("Pressure Transmitter", True),          # catalogue
        ("Manual Isolation Valves", True),       # plural-folded catalogue
        ("battery_pack_enclosure", False),       # bare housing head → structural
        ("motor_pylon_mount", False),            # structural head wins tiebreak
        ("MCC cabinet", True),                   # qualified housing
        ("Emergency Stop", True),                # qualifier-gated head
        ("Module Support System", False),        # bare 'module' stays scope word
        ("carbon fibre spar", False),            # structural
    ]:
        got_v = real.is_catalogue(name)
        expect(got_v == want, f"mirror is_catalogue('{name}') == {want} (got {got_v})")

    print("[selftest] family 1 — unknown-noun detection, both directions")
    generic = {"pump", "valve"}
    known_tok = "transmitter"
    unknown_tok = "zorble"
    expect(known_tok in real.catalogue, "'transmitter' known to catalogue lexicon")
    expect(unknown_tok not in real.catalogue and unknown_tok not in real.structural
           and unknown_tok not in generic,
           "'zorble' unknown to every token lexicon (fires family 1)")

    print("[selftest] family 2 — literal-shadowed quantity, both directions")
    qnames = {"cell_capacity_ah", "cell_voltage_v"}
    src_bad = "const cellAh = c.quantities.cell_capacity_ah?.value ?? 314\n" \
              "const x = q(contract, 'cell_voltage_v', 3.2)\n" \
              "total_cell_mass_kg: 7000,\n"
    hits = scan_shadow_literals(src_bad, qnames, "fixture.ts")
    expect(any(h[2] == "cell_capacity_ah" for h in hits),
           "`?? 314` fallback on a contract quantity fires")
    expect(any(h[2] == "cell_voltage_v" for h in hits),
           "q(contract,'name',literal) fires")
    expect(not any(h[2] == "total_cell_mass_kg" for h in hits),
           "a literal on a NON-contract name does not fire")
    src_ok = ("const cellAh = c.quantities.cell_capacity_ah?.value ?? 314 "
              "// physics_constant citation\n"
              "const scale = other_thing?.value ?? 314\n")
    expect(scan_shadow_literals(src_ok, qnames, "fixture.ts") == [],
           "documented physics_constant line and non-quantity name do not fire")

    print("[selftest] family 6 — BoP role gap, both directions")
    bop = {"_BOP_ROLES": [("transformer", re.compile("transformer", re.I))]}
    shape_rules = [(re.compile("transformer", re.I), "transformer_box"),
                   (re.compile("skid", re.I), "skid_box")]
    type_rules = [("electrical", re.compile("transformer", re.I))]
    fs = audit_bop_roles(["step-up transformer", "zorble skid"],
                         {"step-up transformer": True, "zorble skid": True},
                         shape_rules, type_rules, bop)
    expect(any("zorble skid" in f.text and "_BOP_ROLES" in f.text for f in fs),
           "unplaced equipment family fires the scene-drop finding")
    expect(any("zorble skid" in f.text and "TYPE_RULES" in f.text for f in fs),
           "TYPE_RULES 'other' fallthrough fires")
    expect(not any("step-up transformer" in f.text for f in fs),
           "a placed+typed family does not fire")

    print("[selftest] family 7 — conditional verdict literal, both directions")
    py_bad = ("def render(ws, ok):\n"
              "    ws.cell(1, 1, 'PASS' if ok else 'FAIL — broken')\n"
              "    ws.cell(2, 1, 'OK')\n")
    hits7 = scan_conditional_verdict_literals(py_bad)
    expect(len(hits7) >= 2, f"planted IfExp + bare .cell literal both fire ({hits7})")
    py_ok = ("def render(ws, ok, fx):\n"
             "    ws.cell(1, 1, '=' + fx)\n"
             "    if status == 'PASS':\n"
             "        pass\n"
             "    ws.cell(2, 1, 'done' if x == 'PASS' else 'no')\n"
             "    row['status'] = 'PASS' if ok else 'FAIL'\n"
             "    rows.append('PASS' if ok else 'FAIL')\n"
             "def fx_verdict(conds, ws):\n"
             "    ws.cell(1, 1, 'PASS' if conds else 'FAIL')\n"
             "def _selftest_thing(ws):\n"
             "    ws.cell(1, 1, 'PASS')\n")
    expect(scan_conditional_verdict_literals(py_ok) == [],
           "formula strings, comparisons, state dicts, list.append, allowlisted "
           "helpers and selftests do not fire")

    print("[selftest] family 8 — decisions register, both directions")
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        bp = Path(td) / "some_brief.md"
        bp.write_text("x")
        fs8 = audit_procurement("bess", bp)  # bess block HAS a market anchor
        expect(any(f.severity == "FINDING" and "decisions register" in f.text
                   for f in fs8),
               "missing .decisions.json fires")
        (Path(td) / "some_brief.decisions.json").write_text("{}")
        fs8b = audit_procurement("bess", bp)
        expect(not any(f.severity == "FINDING" and "decisions register" in f.text
                       for f in fs8b),
               "present .decisions.json does not fire")
        expect(not any("NO market-cited" in f.text for f in fs8b),
               "bess market anchor (MARKET_DC_BLOCK_GBP_PER_KWH_2026) is detected")
        fs8c = audit_procurement("no_such_class_zzz", bp)
        expect(any("NO market-cited" in f.text for f in fs8c),
               "a class with no contract block / anchor fires the anchor finding")

    print("[selftest] family 5 — dormant defaults scrape, both directions")
    fixture = ast.parse("DEFAULT_SYSTEM_VOLTAGE_V = 400.0\nOTHER_CONST = 5\n"
                        "DEFAULT_NAME = 'str'\n")
    ds = scrape_default_constants(fixture)
    expect(ds == [("DEFAULT_SYSTEM_VOLTAGE_V", 400.0, 1)],
           f"numeric DEFAULT_* scraped, non-DEFAULT and string skipped ({ds})")

    print("[selftest] family 10 — unit-family comparison, both directions "
          "(the gate-32 kg/tonne + caco3 t/day-vs-kg/day pattern)")
    unit_bad = (
        "const co2OutputKgPerYear = 365000\n"
        "const co2BandLowGbpPerTonne = 1500\n"
        "if (cost / co2OutputKgPerYear < co2BandLowGbpPerTonne) { flag() }\n"
    )
    unit_hits = scan_unit_family_comparisons(unit_bad, "fixture.ts")
    expect(len(unit_hits) >= 1,
           f"raw kg-vs-tonne comparison with a shared 'co2' stem fires ({unit_hits})")
    unit_good = (
        "const co2OutputKgPerYear = 365000\n"
        "const co2OutputCanonical = targetPerformanceValueAs(state, 't/yr')\n"
        "const co2BandLowGbpPerTonne = 1500\n"
        "if (cost / co2OutputKgPerYear < co2BandLowGbpPerTonne) { flag() }\n"
    )
    expect(scan_unit_family_comparisons(unit_good, "fixture.ts") == [],
           "a nearby targetPerformanceValueAs() canonical-conversion call defuses "
           "the same raw comparison")
    unit_ok_converted = (
        "const co2OutputTPerYear = 365\n"
        "const co2BandLowGbpPerTonne = 1500\n"
        "if (cost / co2OutputTPerYear < co2BandLowGbpPerTonne) { flag() }\n"
    )
    expect(scan_unit_family_comparisons(unit_ok_converted, "fixture.ts") == [],
           "already-matching units (both tonne) never fire — no false positive "
           "once normalised")
    day_yr_bad = (
        "const caco3OutputKgPerDay = 2270\n"
        "const caco3TargetKgPerYear = 828550\n"
        "if (caco3OutputKgPerDay > caco3TargetKgPerYear) { flag() }\n"
    )
    expect(len(scan_unit_family_comparisons(day_yr_bad, "fixture.ts")) >= 1,
           "day-vs-year denominator mismatch on the same 'caco3'+'target'/'output' "
           "stem fires (the caco3 closure shape)")
    unrelated = (
        "const pumpFlowKgPerDay = 50\n"
        "const boilerDutyMwh = 12\n"
        "if (pumpFlowKgPerDay / boilerDutyMwh > 1) { noop() }\n"
    )
    expect(scan_unit_family_comparisons(unrelated, "fixture.ts") == [],
           "two DIFFERENT physical quantities (no shared base stem) never fire, "
           "even with conflicting-family unit suffixes")

    print("[selftest] family 10 — false-positive guards (the 3 real hits found "
          "on the live engineering-contract.ts, all narrative/multi-step, not bugs)")
    narrative_fp = (
        "brief_summary: `${ratedMw.toFixed(2)} MW electrolyser "
        "(≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW benchmark).`,\n"
    )
    expect(scan_unit_family_comparisons(narrative_fp, "fixture.ts") == [],
           "ratedMw and ratedKw quoted in the SAME narrative template literal, "
           "with an unrelated '/' inside a DIFFERENT ${} interpolation, does not "
           "fire — the operator never sits directly between the two mentions "
           "without crossing a template-literal boundary")
    two_step_conversion_fp = (
        "total_salt_inventory_t: Math.round(totalSaltInventoryKg / 100) / 10,\n"
    )
    expect(scan_unit_family_comparisons(two_step_conversion_fp, "fixture.ts") == [],
           "a two-step kg->t conversion written as '/100)/10' (the property KEY "
           "and the source IDENT are not directly flanking an operator) does not fire")

    print("[selftest] severity weighting — BLOCKER vs QUALITY, both directions")
    f_fam2_readfirst_qq = Finding(
        2, "CONSTANTS",
        "numeric literal shadows contract quantity `dod_fraction`: "
        "`dod_fraction: c.quantities?.dod_fraction?.value ?? 0.80,`")
    f_fam2_readfirst_qcall = Finding(
        2, "CONSTANTS",
        "numeric literal shadows contract quantity `cell_voltage_v`: "
        "`const cellVoltageV = q(contract, 'cell_voltage_v', 3.2)`")
    f_fam2_bare_closure = Finding(
        2, "CONSTANTS",
        "numeric literal shadows contract quantity `total_cell_mass_kg`: "
        "`total_cell_mass_kg: 7000,`")
    f_fam2_no_contract_block = Finding(
        2, "CONSTANTS",
        "no registerArchetype('zzz') block in engineering-contract.ts — the "
        "class has no contract quantity namespace yet")
    f_fam1 = Finding(1, "VOCABULARY", "brief token unknown to every matcher lexicon")
    f_fam8 = Finding(8, "PROCUREMENT MODEL", "NO market-cited block-price anchor")
    f_fam7 = Finding(7, "CONDITIONAL LITERALS", "bare verdict literal")
    f_fam10 = Finding(10, "UNIT-FAMILY COMPARISON", "kg vs tonne no conversion")
    f_fam6_drop = Finding(6, "BOP ROLES", "matches NO _BOP_ROLES* placement regex")
    f_fam6_other = Finding(6, "BOP ROLES", "falls to TYPE_RULES 'other' fallthrough")
    f_info = Finding(1, "VOCABULARY", "prose note", severity="INFO")
    expect(_finding_weight(f_fam2_readfirst_qq) == "QUALITY",
           "family 2 `?? fallback` read-the-contract-first shape = QUALITY "
           "(a defensive default, not an active divergence)")
    expect(_finding_weight(f_fam2_readfirst_qcall) == "QUALITY",
           "family 2 `q(contract, name, literal)` read-first helper shape = QUALITY")
    expect(_finding_weight(f_fam2_bare_closure) == "BLOCKER",
           "family 2 BARE closure literal with NO read-first marker "
           "(literal-shadow-in-a-closure) = BLOCKER")
    expect(_finding_weight(f_fam2_no_contract_block) == "BLOCKER",
           "family 2 'no registerArchetype block' (no contract namespace at all) "
           "= BLOCKER")
    expect(_finding_weight(f_fam1) == "QUALITY", "family 1 (vocab/matcher) = QUALITY")
    expect(_finding_weight(f_fam8) == "QUALITY", "family 8 (no market anchor) = QUALITY")
    expect(_finding_weight(f_fam7) == "BLOCKER", "family 7 (verdict literal) = BLOCKER")
    expect(_finding_weight(f_fam10) == "BLOCKER", "family 10 (unit-family) = BLOCKER")
    expect(_finding_weight(f_fam6_drop) == "BLOCKER",
           "family 6 'no placement regex' (visible 3D scene drop) = BLOCKER")
    expect(_finding_weight(f_fam6_other) == "QUALITY",
           "family 6 'TYPE_RULES other' (coverage-expectation shrink) = QUALITY")
    expect(_finding_weight(f_info) == "INFO", "an INFO-severity finding stays INFO")

    print("[selftest] NEVER_FOLD divergence detection, both directions")
    a, b = {"ups", "mains"}, {"ups", "gas"}
    expect(bool(a.symmetric_difference(b)), "diverged sets fire")
    expect(not a.symmetric_difference(set(a)), "identical sets do not fire")

    print("[selftest] slug derivation, both directions")
    expect(derive_slug(Path("bess_20ft_grid_storage.md"), slugs=["bess", "dac"],
                       brief_text="battery energy storage container") == "bess",
           "stem containment derives the slug")
    expect(derive_slug(Path("mystery_widget.md"), slugs=["bess", "dac"],
                       brief_text="a fabulous mystery widget") == "UNKNOWN",
           "no-match brief derives UNKNOWN (never-run by definition)")
    expect(derive_slug(BRIEFS_LOOP / "bess_20ft_grid_storage.md") == "bess",
           "real bess brief derives 'bess' from the registered archetype list")
    expect(derive_slug(BRIEFS_LOOP / "co2_mineralisation.md") == "co2_mineralisation",
           "real co2 brief derives 'co2_mineralisation'")

    print("[selftest] live-repo lexicon integrity")
    excel_tree = _ast_tree(EXCEL_EXPORT)
    rx = ast_regexes(excel_tree, ["_SCHED_VALVE_RX", "_INSTRUMENT_ROW_RX"])
    expect("_SCHED_VALVE_RX" in rx and rx["_SCHED_VALVE_RX"].search("solenoid valve"),
           "_SCHED_VALVE_RX extracted and matches 'solenoid valve'")
    expect("_INSTRUMENT_ROW_RX" in rx
           and rx["_INSTRUMENT_ROW_RX"].search("pressure transmitter"),
           "_INSTRUMENT_ROW_RX extracted and matches 'pressure transmitter'")
    prefixes = set(ast_str_set(_ast_tree(DOSSIER_AUDIT), "_GLOSSARY_TAG_PREFIXES"))
    expect("TK" in prefixes and "PT" in prefixes,
           f"_GLOSSARY_TAG_PREFIXES loads ({len(prefixes)} prefixes)")
    bop_tables = load_bop_roles()
    expect("_BOP_ROLES" in bop_tables and len(bop_tables["_BOP_ROLES"]) > 10,
           f"_BOP_ROLES loads ({ {k: len(v) for k, v in bop_tables.items()} })")
    tr = ast_pair_rules(_ast_tree(PARTS_LEDGER), "TYPE_RULES", slug_first=True)
    expect(len(tr) > 5, f"TYPE_RULES loads ({len(tr)} rules)")
    sr = ast_pair_rules(_ast_tree(SCENE_BUILDER), "SHAPE_RULES", slug_first=False)
    expect(len(sr) > 10, f"SHAPE_RULES loads ({len(sr)} rules)")

    print()
    if failures:
        print(f"[selftest] {len(failures)} FAILURE(S)")
        return 1
    print("[selftest] ALL GREEN — archetype-preflight selftest: OK")
    return 0


# ═════════════════════════════════════════════════════════════════════════════

def main(argv: List[str]) -> int:
    if "--selftest" in argv:
        return _selftest()
    if "--derive-slug" in argv:
        args = [a for a in argv if not a.startswith("--")]
        if len(args) != 1 or not Path(args[0]).exists():
            print("UNKNOWN")
            return 0
        print(derive_slug(Path(args[0])))
        return 0
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 0
    slug, brief = args[0], Path(args[1])
    if not brief.exists():
        print(f"brief not found: {brief}")
        return 0  # an audit, not a gate — but nothing to audit
    use_node = "--no-node" not in argv
    report, n, n_blocker, n_quality = run_audit(slug, brief, use_node=use_node)
    print(report)
    print(f"PRE-FLIGHT SUMMARY: {n} finding(s) for `{slug}` — {n_blocker} BLOCKER, "
          f"{n_quality} QUALITY-polish — an audit, not a gate (exit 0). Fix BLOCKERs "
          f"first, then QUALITY-polish, BEFORE the first chain run "
          f"(docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md §pre-flight).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
