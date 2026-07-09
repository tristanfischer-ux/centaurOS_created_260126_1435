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
from retrieve import (  # noqa: E402
    retrieve_relevant_records,
    retrieve_relevant_records_many,
)

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


def _compose_query(part_query: str, class_filter: str | None) -> str:
    composed = part_query.strip()
    if class_filter:
        composed = f"{composed} {class_filter.replace('-', ' ')}"
    return composed


def _parts_have_price(hits: list[dict]) -> bool:
    return any(
        (h['fields'].get('unit_price_gbp') or 0) > 0
        or _parse_price_from_excerpt(h['fields'].get('raw_excerpt') or '')
        for h in hits
    )


def _aggregate_reference_price(hits: list[dict], spec_hits: list[dict]) -> dict:
    """Turn retrieval hits into Engine C aggregate stats (pure; no I/O)."""
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
    for sh in spec_hits:
        sf = sh['fields']
        sk = (sf.get('spec_key') or '').lower()
        if not any(t in sk for t in ('price', 'cost', 'msrp', 'list', 'asp')):
            continue
        unit = (sf.get('spec_unit') or '').lower()
        if '%' in unit or 'percent' in unit:
            continue
        val = sf.get('spec_value')
        unit_u = (sf.get('spec_unit') or '').upper()
        amount: float | None = None
        try:
            amount = float(str(val).replace(',', '')) if val is not None else None
        except (ValueError, TypeError):
            amount = None
        if amount is not None and unit_u in ('GBP', 'USD', 'EUR') and 0.01 <= amount <= 10_000_000:
            prices_gbp.append(_convert_to_gbp(amount, unit_u))
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
    return {
        'ref_count': len(hits),
        'priced_count': len(prices_gbp),
        'median_unit_cost_gbp': round(_percentile(prices_gbp, 0.5), 4),
        'p25_unit_cost_gbp': round(_percentile(prices_gbp, 0.25), 4),
        'p75_unit_cost_gbp': round(_percentile(prices_gbp, 0.75), 4),
        'top_excerpts': top_excerpts,
        'top_sources': top_sources,
        'reason': 'priced',
    }


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

    composed_query = _compose_query(part_query, class_filter)
    hits = retrieve_relevant_records(
        composed_query,
        k=k,
        tables=['pretraining_extracted_parts'],
    )
    # Specs fallback — when the parts table yields no priced hits the specs
    # table often does. We still ANCHOR on the parts retrieval.
    spec_hits: list[dict] = []
    if not _parts_have_price(hits):
        spec_hits = retrieve_relevant_records(
            composed_query + ' price',
            k=k,
            tables=['pretraining_extracted_specs'],
        )
    return _aggregate_reference_price(hits, spec_hits)


# ---------------------------------------------------------------------------
# Batch mode — read ALL NDJSON queries from stdin, then ONE embed batch + ONE
# corpus matrix load (2026-07-09). Same cosine / same model as the single-query
# path — quality-identical; wall-clock drops from ~N OpenAI RTTs to ~N/64.
# ---------------------------------------------------------------------------

def _batch_mode(k: int) -> int:
    # INTENT: drain stdin first so we can batch-embed. The TS driver already
    # writes every request then closes stdin — no streaming requirement.
    reqs: list[dict] = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            reqs.append(json.loads(line))
        except json.JSONDecodeError as e:
            reqs.append({'_parse_error': f'bad json: {e}', '_raw': line[:200]})

    # Preserve request order for stdout pairing.
    composed: list[str] = []
    meta: list[tuple[str | None, int, bool]] = []  # (request_id, k, empty_query)
    for req in reqs:
        if '_parse_error' in req:
            meta.append((None, k, True))
            composed.append('')
            continue
        query = req.get('query') or ''
        class_filter = req.get('class') or None
        kk = int(req.get('k') or k)
        empty = not query or not str(query).strip()
        meta.append((req.get('request_id'), kk, empty))
        composed.append('' if empty else _compose_query(str(query), class_filter))

    # Parts retrieval for every non-empty query (empty → skip).
    live_idxs = [i for i, (_rid, _kk, empty) in enumerate(meta) if not empty and composed[i]]
    live_queries = [composed[i] for i in live_idxs]
    parts_by_live: list[list[dict]] = []
    if live_queries:
        # Use max k among live requests so one matrix pass covers all.
        k_parts = max(meta[i][1] for i in live_idxs) if live_idxs else k
        try:
            parts_by_live = retrieve_relevant_records_many(
                live_queries,
                k=k_parts,
                tables=['pretraining_extracted_parts'],
            )
        except Exception as e:  # noqa: BLE001
            # Fail the whole batch with per-row errors rather than silent empty.
            err = {'error': str(e)}
            for req, (rid, _kk, _empty) in zip(reqs, meta):
                if '_parse_error' in req:
                    sys.stdout.write(json.dumps({
                        'error': req['_parse_error'], 'input': req.get('_raw', ''),
                    }) + '\n')
                else:
                    sys.stdout.write(json.dumps({'request_id': rid, 'result': err}) + '\n')
            sys.stdout.flush()
            return 0

    parts_hits: list[list[dict] | None] = [None] * len(reqs)
    for j, i in enumerate(live_idxs):
        # Trim to this request's k (many() used max-k).
        parts_hits[i] = parts_by_live[j][: meta[i][1]]

    # Specs fallback only for rows with no priced parts hits.
    spec_need_idxs = [
        i for i in live_idxs
        if parts_hits[i] is not None and not _parts_have_price(parts_hits[i] or [])
    ]
    spec_hits_map: dict[int, list[dict]] = {}
    if spec_need_idxs:
        spec_queries = [composed[i] + ' price' for i in spec_need_idxs]
        k_spec = max(meta[i][1] for i in spec_need_idxs)
        try:
            spec_lists = retrieve_relevant_records_many(
                spec_queries,
                k=k_spec,
                tables=['pretraining_extracted_specs'],
            )
            for j, i in enumerate(spec_need_idxs):
                spec_hits_map[i] = spec_lists[j][: meta[i][1]]
        except Exception as e:  # noqa: BLE001
            # Specs are a fallback — leave empty and let aggregate report no_priced_hits.
            sys.stderr.write(f"[reference_lookup] specs batch failed (non-fatal): {e}\n")

    for i, req in enumerate(reqs):
        if '_parse_error' in req:
            sys.stdout.write(json.dumps({
                'error': req['_parse_error'], 'input': req.get('_raw', ''),
            }) + '\n')
            continue
        rid, _kk, empty = meta[i]
        if empty:
            result = None
        else:
            try:
                result = _aggregate_reference_price(
                    parts_hits[i] or [],
                    spec_hits_map.get(i, []),
                )
            except Exception as e:  # noqa: BLE001
                result = {'error': str(e)}
        sys.stdout.write(json.dumps({'request_id': rid, 'result': result}) + '\n')
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
