#!/usr/bin/env python3
"""
Engine C — reference-price lookup helper.

Wraps `retrieve_relevant_records()` from `scripts/rag/retrieve.py`. For a given
free-text part query it returns aggregate price statistics for the top-k most
semantically similar reference records in the Phase 4 RAG corpus.

Strategy
--------

The Phase 4 corpus has 29,899 embedded records across four tables but only a
handful (7 of 9,080 `pretraining_extracted_parts`) carry a structured
`unit_price_gbp`. The rest mention price in free text inside `raw_excerpt`
(e.g. "USD $249 / GBP £249 / EUR €279"). This helper therefore looks for
prices in TWO places per hit:

    1. `fields.unit_price_gbp` — structured value if present.
    2. `fields.raw_excerpt` — regex-parsed price token; first plausible GBP /
       USD / EUR amount converted to GBP via fixed rates.

`find_reference_price()` returns:

    {
        'ref_count':        int,    # records inspected (== len(hits))
        'priced_count':     int,    # records that yielded a unit price
        'median_unit_cost_gbp': float | None,
        'p25_unit_cost_gbp':    float | None,
        'p75_unit_cost_gbp':    float | None,
        'top_excerpts':     list[str],   # up to 3 raw_excerpts (evidence)
        'top_sources':      list[dict],  # parallel list: {table, id, doc_id, score}
        'reason':           str,    # 'priced' | 'no_priced_hits' | 'no_hits'
    }

`None` is returned only when the input query is empty / invalid.

CLI
---
    python3 scripts/rag/reference_lookup.py "LFP prismatic cell 280 Ah" \
        --class bess-utility-scale --k 5

The CLI also accepts `--json` for machine-readable output, which is what
`enrich-state-with-reference-anchor.tsx` uses to call the lookup in batch.

Cost / latency
--------------
Each call embeds the query once via `text-embedding-3-small` (1536d, USD
0.02 / 1M tokens — cents per pipeline run) then loads the candidate
embeddings into memory (numpy) for cosine similarity. The corpus is small
enough (<30k rows) that a full table scan is fine; no ANN index needed.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

# Local import — retrieve.py is in the same folder.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from retrieve import retrieve_relevant_records  # noqa: E402

# ---------------------------------------------------------------------------
# FX rates (point estimates as of 2026-05; close enough for an Engine C
# advisory band — we are flagging 2× outliers, not signing off accounting).
# ---------------------------------------------------------------------------

USD_TO_GBP = 0.79
EUR_TO_GBP = 0.85

# ---------------------------------------------------------------------------
# Brief product_class → corpus product_class slugs. Engine C ships per-class
# gated on ≥10 docs + ≥500 records (Phase 4 plan), but the corpus uses
# different slug strings than the pipeline state's product_class field, so
# this map is the bridge. Empty list → "search the whole corpus" (fallback).
# ---------------------------------------------------------------------------

# This is currently a documentation table only — the corpus's `module_assignment`
# column on pretraining_extracted_parts is what retrieve.py filters on, and
# that column carries module-level labels (sensing_instrumentation, etc.)
# rather than product-class labels. So we do not pass class_filter through
# to retrieve_relevant_records here. The class hint stays in the query
# string so the embedding model can use it for relevance.
KNOWN_CORPUS_CLASSES = {
    'pv_string_inverter', 'heat-pump-residential', 'industrial_robot_arm',
    'bess-utility-scale', 'insulin_pump', 'dc_fast_ev_charger',
    'vfd-motor-drive', 'escalator', 'wearable_medical_device',
}


# ---------------------------------------------------------------------------
# Price extraction from raw_excerpt — covers the formats actually seen in
# the corpus during inspection (drawer: 2026-05-18 Engine C build):
#
#   "USD $249 / GBP £249 / EUR €279 / AUD $399"
#   "GBP £249"
#   "$5,768,612"
#   "1.9 million"
#   "60 USD/kW"  -> per-unit; skip if denominator unclear
# ---------------------------------------------------------------------------

# Order matters: GBP first, then USD, then EUR (we want native GBP when
# present to avoid FX rounding error).
_PRICE_PATTERNS = [
    # GBP: £1,234.56 / GBP £999 / £249
    (re.compile(r'(?:GBP\s*)?£\s*([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'GBP'),
    (re.compile(r'GBP\s+([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'GBP'),
    # USD: $1,234.56 / USD $249 / USD 249
    (re.compile(r'(?:USD\s*)?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'USD'),
    (re.compile(r'USD\s+([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'USD'),
    # EUR: €249 / EUR €999 / EUR 999
    (re.compile(r'(?:EUR\s*)?€\s*([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'EUR'),
    (re.compile(r'EUR\s+([0-9][0-9,]*(?:\.[0-9]+)?)', re.IGNORECASE), 'EUR'),
]


def _convert_to_gbp(amount: float, currency: str) -> float:
    if currency == 'GBP':
        return amount
    if currency == 'USD':
        return amount * USD_TO_GBP
    if currency == 'EUR':
        return amount * EUR_TO_GBP
    return amount  # unknown currency — caller should not have reached here


def _parse_price_from_excerpt(excerpt: str) -> float | None:
    """Best-effort price extraction. Returns price in GBP or None."""
    if not excerpt or not isinstance(excerpt, str):
        return None
    # Guard against false positives ("up to 70 percent", "$80→60/kW") — only
    # accept matches whose numeric value sits in a plausible per-unit range.
    # >£0.01, <£10,000,000.
    for pattern, currency in _PRICE_PATTERNS:
        m = pattern.search(excerpt)
        if not m:
            continue
        raw = m.group(1).replace(',', '')
        try:
            amount = float(raw)
        except ValueError:
            continue
        if not (0.01 <= amount <= 10_000_000):
            continue
        # Reject if the match is immediately followed by /kW, /kWh, /year etc.
        # — that's a rate, not a unit price. Look at the next 10 characters.
        tail = excerpt[m.end(): m.end() + 12].lower()
        if any(t in tail for t in ('/kw', '/kwh', '/year', '/yr', '/hour', '/hr', ' per kw')):
            continue
        return _convert_to_gbp(amount, currency)
    return None


def _percentile(sorted_vals: list[float], pct: float) -> float:
    """Linear-interpolated percentile (numpy-free for environment minimalism)."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    k = (n - 1) * pct
    f = int(k)
    c = min(f + 1, n - 1)
    if f == c:
        return sorted_vals[f]
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def find_reference_price(
    part_query: str,
    class_filter: str | None = None,
    k: int = 5,
) -> dict | None:
    """
    Retrieve up to k reference records similar to part_query.

    Returns aggregate stats:
        {ref_count, priced_count, median_unit_cost_gbp,
         p25_unit_cost_gbp, p75_unit_cost_gbp,
         top_excerpts: [str], top_sources: [dict], reason}

    `class_filter` is currently advisory — the corpus's parts table indexes
    `module_assignment` (module-level) rather than `product_class`, and we
    don't want to over-restrict the retrieval for a marginal precision gain.
    The class name is appended to the query string instead so the embedding
    model can use it for relevance ranking.

    Returns None if the query is empty.
    """
    if not part_query or not part_query.strip():
        return None

    # Compose a richer query — appending the class slug gives the embedding
    # model more signal without hard-filtering. "LFP prismatic cell" alone
    # retrieves general battery cells; "LFP prismatic cell bess-utility-scale"
    # biases toward utility BESS context.
    composed_query = part_query.strip()
    if class_filter:
        composed_query = f"{composed_query} {class_filter.replace('-', ' ')}"

    hits = retrieve_relevant_records(
        composed_query,
        k=k,
        tables=['pretraining_extracted_parts'],
    )

    # Specs fallback — when the parts table yields no priced hits the specs
    # table often does (the corpus has 37 spec rows with `spec_key` matching
    # /price|cost|msrp/ vs only 7 priced parts). We still ANCHOR on the parts
    # retrieval (those are the topical hits), but if parts came back with no
    # priced rows we also retrieve from specs and treat priced specs as
    # additional evidence rows so the lookup doesn't degrade to "no_priced_hits"
    # purely because the corpus lacks structured part-level prices.
    spec_hits: list[dict] = []
    if not any((h['fields'].get('unit_price_gbp') or 0) > 0 or
               _parse_price_from_excerpt(h['fields'].get('raw_excerpt') or '')
               for h in hits):
        # Append "price" to the query for the specs leg so we bias toward
        # price-labelled spec rows (Price | 249 GBP | ...).
        spec_hits = retrieve_relevant_records(
            composed_query + ' price',
            k=k,
            tables=['pretraining_extracted_specs'],
        )

    if not hits and not spec_hits:
        return {
            'ref_count': 0,
            'priced_count': 0,
            'median_unit_cost_gbp': None,
            'p25_unit_cost_gbp': None,
            'p75_unit_cost_gbp': None,
            'top_excerpts': [],
            'top_sources': [],
            'reason': 'no_hits',
        }

    # Top excerpts (evidence trail) — top 3 by score, raw text trimmed.
    top_excerpts: list[str] = []
    top_sources: list[dict] = []
    for h in hits[:3]:
        excerpt = h['fields'].get('raw_excerpt') or h['text'] or ''
        top_excerpts.append(str(excerpt)[:280])
        top_sources.append({
            'table': h['table'],
            'id': int(h['id']),
            'document_id': int(h['document_id']),
            'score': round(float(h['score']), 4),
        })

    # Per-hit unit price (structured first, regex second).
    prices_gbp: list[float] = []
    for h in hits:
        fields = h['fields']
        v = fields.get('unit_price_gbp')
        if isinstance(v, (int, float)) and v > 0:
            prices_gbp.append(float(v))
            continue
        parsed = _parse_price_from_excerpt(fields.get('raw_excerpt') or '')
        if parsed is not None:
            prices_gbp.append(parsed)

    # Spec fallback contributions — only currency-labelled spec rows count.
    # A spec_key matching /price|cost|msrp/ AND a parseable amount in the
    # raw_excerpt is the bar for inclusion (raises precision vs catching
    # "Energy cost savings 70 %").
    for sh in spec_hits:
        sf = sh['fields']
        sk = (sf.get('spec_key') or '').lower()
        if not any(t in sk for t in ('price', 'cost', 'msrp', 'list', 'asp')):
            continue
        # Reject percentage / ratio rows.
        unit = (sf.get('spec_unit') or '').lower()
        if '%' in unit or 'percent' in unit:
            continue
        # Try structured value + unit first.
        val = sf.get('spec_value')
        unit_u = (sf.get('spec_unit') or '').upper()
        amount: float | None = None
        try:
            amount = float(str(val).replace(',', '')) if val is not None else None
        except (ValueError, TypeError):
            amount = None
        if amount is not None and unit_u in ('GBP', 'USD', 'EUR') and 0.01 <= amount <= 10_000_000:
            prices_gbp.append(_convert_to_gbp(amount, unit_u))
            # Also surface the spec excerpt as additional evidence.
            ex = sf.get('raw_excerpt') or ''
            if ex and len(top_excerpts) < 6:
                top_excerpts.append(str(ex)[:280])
                top_sources.append({
                    'table': sh['table'],
                    'id': int(sh['id']),
                    'document_id': int(sh['document_id']),
                    'score': round(float(sh['score']), 4),
                })
            continue
        # Otherwise regex on the excerpt.
        parsed = _parse_price_from_excerpt(sf.get('raw_excerpt') or '')
        if parsed is not None:
            prices_gbp.append(parsed)
            ex = sf.get('raw_excerpt') or ''
            if ex and len(top_excerpts) < 6:
                top_excerpts.append(str(ex)[:280])
                top_sources.append({
                    'table': sh['table'],
                    'id': int(sh['id']),
                    'document_id': int(sh['document_id']),
                    'score': round(float(sh['score']), 4),
                })

    if not prices_gbp:
        return {
            'ref_count': len(hits),
            'priced_count': 0,
            'median_unit_cost_gbp': None,
            'p25_unit_cost_gbp': None,
            'p75_unit_cost_gbp': None,
            'top_excerpts': top_excerpts,
            'top_sources': top_sources,
            'reason': 'no_priced_hits',
        }

    prices_gbp.sort()
    median = _percentile(prices_gbp, 0.5)
    p25 = _percentile(prices_gbp, 0.25)
    p75 = _percentile(prices_gbp, 0.75)

    return {
        'ref_count': len(hits),
        'priced_count': len(prices_gbp),
        'median_unit_cost_gbp': round(median, 4),
        'p25_unit_cost_gbp': round(p25, 4),
        'p75_unit_cost_gbp': round(p75, 4),
        'top_excerpts': top_excerpts,
        'top_sources': top_sources,
        'reason': 'priced',
    }


# ---------------------------------------------------------------------------
# Batch mode — read NDJSON queries from stdin, emit NDJSON results to stdout.
# This is the path used by enrich-state-with-reference-anchor.tsx so a single
# Python process embeds + matrix-loads once and serves many queries.
# ---------------------------------------------------------------------------

def _batch_mode(k: int) -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({'error': f'bad json: {e}', 'input': line[:200]}) + '\n')
            sys.stdout.flush()
            continue
        query = req.get('query') or ''
        class_filter = req.get('class') or None
        kk = int(req.get('k') or k)
        try:
            result = find_reference_price(query, class_filter=class_filter, k=kk)
        except Exception as e:  # noqa: BLE001 — surface to caller, don't crash batch
            result = {'error': str(e)}
        out = {'request_id': req.get('request_id'), 'result': result}
        sys.stdout.write(json.dumps(out) + '\n')
        sys.stdout.flush()
    return 0


def _cli() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('query', nargs='?', help='free-text part query')
    ap.add_argument('--class', dest='class_filter', help='corpus product_class hint (advisory)')
    ap.add_argument('--k', type=int, default=5)
    ap.add_argument('--json', action='store_true', help='emit machine-readable JSON')
    ap.add_argument('--batch', action='store_true', help='NDJSON-in/NDJSON-out batch over stdin')
    args = ap.parse_args()

    if args.batch:
        return _batch_mode(args.k)

    if not args.query:
        ap.print_help()
        return 2

    result = find_reference_price(args.query, class_filter=args.class_filter, k=args.k)
    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    if result is None:
        print('Empty query.')
        return 1

    print(f"\nQuery:        {args.query}")
    if args.class_filter:
        print(f"Class hint:   {args.class_filter}")
    print(f"Refs found:   {result['ref_count']}  (priced: {result['priced_count']})")
    print(f"Reason:       {result['reason']}")
    if result['median_unit_cost_gbp'] is not None:
        print(f"Median £:     {result['median_unit_cost_gbp']:.2f}  "
              f"(IQR {result['p25_unit_cost_gbp']:.2f} – {result['p75_unit_cost_gbp']:.2f})")
    print('\nTop excerpts:')
    for i, ex in enumerate(result['top_excerpts'], 1):
        src = result['top_sources'][i - 1]
        print(f"  {i}. [score={src['score']:+.3f} doc={src['document_id']}] {ex[:200]}")
    return 0


if __name__ == '__main__':
    raise SystemExit(_cli())
