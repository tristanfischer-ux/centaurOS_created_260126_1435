"""Shared FAIL-SOFT input helpers for engineering tools.

Tristan 2026-06-14: the audit found ~69% of tools crash on realistic inputs, almost
all the same way — a tool hardcodes a vocabulary for a CATEGORICAL input (mode,
material, type, vehicle...) and raises on anything off-list. An LLM-driven planner
supplies free-form strings, so anything outside the exact vocabulary crashes the tool.

A tool must NEVER crash on an unknown categorical value. Use `safe_choice()` to
normalise it to the nearest allowed value (case/space-insensitive, synonym-aware,
fuzzy) or a sensible default, recording a warning instead of raising. Likewise
`safe_float()` coerces a stray string/None to a number with a default.

Import idiom (works regardless of the spawn cwd):
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from _fail_soft import safe_choice, safe_float
"""
from __future__ import annotations
import difflib


def safe_choice(value, allowed, default=None, *, label="input", synonyms=None, warnings=None):
    """Return a member of `allowed` for `value`, NEVER raising.

    Resolution order: exact → case/whitespace-insensitive → synonym map → fuzzy
    nearest (difflib, cutoff 0.7) → `default` (or first allowed) + a recorded warning.

    allowed   : list/tuple/set/dict-keys of canonical values.
    synonyms  : optional {alias: canonical} map.
    warnings  : optional list; an unknown-value note is appended (for the tool's
                output `warnings`/`notes`, so the substitution is auditable).
    """
    allowed = list(allowed)
    if default is None and allowed:
        default = allowed[0]
    if value is None:
        return default
    s = str(value).strip().lower()
    norm = {str(a).strip().lower(): a for a in allowed}
    if s in norm:
        return norm[s]
    if synonyms:
        syn = {str(k).strip().lower(): v for k, v in synonyms.items()}
        if s in syn:
            cs = str(syn[s]).strip().lower()
            if cs in norm:
                return norm[cs]
    close = difflib.get_close_matches(s, list(norm.keys()), n=1, cutoff=0.7)
    if close:
        return norm[close[0]]
    if warnings is not None:
        warnings.append(f"{label}: unrecognised value {value!r} → defaulted to {default!r} (allowed: {allowed})")
    return default


def safe_float(value, default=0.0, *, label="input", warnings=None):
    """Coerce `value` to float, NEVER raising; non-numeric/None → `default` + warning."""
    if value is None:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        if warnings is not None:
            warnings.append(f"{label}: non-numeric value {value!r} → defaulted to {default}")
        return float(default)


def safe_float_list(value, default=None, *, label="input", warnings=None):
    """Coerce `value` to a list of floats, NEVER raising. Handles the forms an
    LLM-driven planner actually wires a LIST input as:
      a real list/tuple → float each; a scalar → [float]; a comma/space/semicolon
      STRING "1, 2, 3" → [1.0, 2.0, 3.0] (the recurring bootstrap defect that
      crashed the transformer's standard_ratings_kva and the control tool's
      plant_numerator/denominator); None/garbage → `default` (or []).
    """
    fallback = list(default) if default is not None else []
    if value is None:
        return fallback
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, str):
        toks = value.replace(";", ",").replace(" ", ",").split(",")
    else:
        try:
            toks = list(value)
        except TypeError:
            return fallback
    out = []
    for t in toks:
        try:
            out.append(float(t))
        except (TypeError, ValueError):
            pass
    if not out and warnings is not None:
        warnings.append(f"{label}: could not parse {value!r} as a number list → defaulted to {fallback}")
    return out or fallback
