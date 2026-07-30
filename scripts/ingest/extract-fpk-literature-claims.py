#!/usr/bin/env python3
"""Extract formulas/materials/physics/FE claims from harvested FPK papers.

Uses OpenRouter on title+abstract (+ full text when present).
Writes fpk_extracted_claims + namespaced pretraining_extracted_specs with
embeddings (text-embedding-3-small) for dualSearch.

Modes:
  fulltext-first (default) — drain open full-text PDFs first
  abstract-only — papers with no open full text (abstract_only / no PDF path)
  all — either

For abstract-only papers we still extract formulas, materials, and a short
paper summary. Provenance is tagged ABSTRACT_ONLY (not peer full-text).

Usage:
  python3 scripts/ingest/extract-fpk-literature-claims.py --limit 40
  python3 scripts/ingest/extract-fpk-literature-claims.py --mode abstract-only --limit 30
  python3 scripts/ingest/extract-fpk-literature-claims.py --topic sic_traction_inverter
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import struct
import sys
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path.home() / ".forge-truth" / "forge-truth.db"
PRODUCT_CLASS = "formula_e_front_mgu"

SYSTEM = """You extract engineering knowledge from academic paper full text
OR from title+abstract when that is all that is available, for a Formula E /
EV front powertrain kit (motor + inverter + gearbox) knowledge base.

Return STRICT JSON:
{
  "paper_summary": "3-5 sentences: what the paper studies, method, and result relevant to traction motors / SiC inverters / gearboxes / cooling. Plain language.",
  "claims": [
    {
      "claim_kind": "summary|formula|material|physics|geometry|manufacturing|fea|chemistry|thermal|electrical",
      "symbol": "optional short symbol e.g. C_dc, R_th, Br",
      "expression": "formula or relation if any (ASCII math OK)",
      "value_text": "numeric or qualitative claim",
      "unit": "SI unit if any",
      "material_grade": "if material claim",
      "elements": "composition if known",
      "density_kg_m3": null,
      "component_id_hint": "snake_case part if clear else null",
      "excerpt": "short quote ≤240 chars",
      "confidence": 0.0-1.0
    }
  ]
}
Rules:
- ALWAYS include paper_summary.
- ALWAYS include one claim with claim_kind=summary whose value_text repeats the summary.
- Prefer formulas and materials when the text supports them.
- If only an abstract is available, still extract what you can; set confidence ≤0.55.
- Max 10 claims including the summary. No markdown outside JSON.
"""

DEFAULT_MODEL = "z-ai/glm-5.2"
ABSTRACT_MODEL = "google/gemini-2.5-flash"


def load_key(name: str) -> str:
    if os.environ.get(name):
        return os.environ[name]
    for p in (ROOT / ".env.local", ROOT / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def call_llm(api_key: str, user: str, model: str = DEFAULT_MODEL) -> dict[str, Any]:
    body = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 3200,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://forgeos.local",
            "X-Title": "ForgeOS FPK Literature Extract",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
    content = data["choices"][0]["message"].get("content") or ""
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return {"claims": []}
    from json import JSONDecoder

    try:
        obj, _ = JSONDecoder().raw_decode(text, start)
        return obj if isinstance(obj, dict) else {"claims": []}
    except json.JSONDecodeError:
        return {"claims": []}


def embed(text: str, api_key: str) -> bytes | None:
    if not api_key:
        return None
    body = {
        "model": "text-embedding-3-small",
        "input": text[:8000],
        "dimensions": 1536,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        vec = data["data"][0]["embedding"]
        return struct.pack(f"{len(vec)}f", *vec)
    except Exception as e:
        print(f"[embed] fail: {e}", file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--topic", default="")
    ap.add_argument(
        "--mode",
        choices=("fulltext-first", "abstract-only", "all"),
        default="fulltext-first",
        help="fulltext-first drains open PDFs; abstract-only targets no-PDF papers",
    )
    ap.add_argument(
        "--model",
        default="",
        help="OpenRouter model id (default: glm-5.2; abstract-only defaults to gemini-2.5-flash)",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    or_key = load_key("OPENROUTER_API_KEY")
    oa_key = load_key("OPENAI_API_KEY")
    if not or_key:
        raise SystemExit("OPENROUTER_API_KEY required")

    model = args.model or (
        ABSTRACT_MODEL if args.mode == "abstract-only" else DEFAULT_MODEL
    )

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    # DECISION: Prefer fulltext PDFs when mode=fulltext-first. Abstract-only mode
    # deliberately mines papers we cannot download (paywalled / no open PDF).
    sql = """
      SELECT DISTINCT d.id AS document_id, d.product_name AS title,
             d.extracted_full_text AS body, d.source_url,
             d.file_path, d.extraction_status,
             cl.topic_id, cl.component_id,
             length(COALESCE(d.extracted_full_text,'')) AS body_len
      FROM pretraining_spec_documents d
      JOIN fpk_component_literature cl ON cl.document_id = d.id
      WHERE d.source_type = 'fpk_literature'
        AND d.id NOT IN (SELECT DISTINCT document_id FROM fpk_extracted_claims)
        AND d.extracted_full_text IS NOT NULL
        AND length(trim(d.extracted_full_text)) > 80
    """
    params: list[Any] = []
    if args.mode == "abstract-only":
        sql += """
        AND (
          d.extraction_status = 'abstract_only'
          OR d.file_path IS NULL
          OR TRIM(COALESCE(d.file_path,'')) = ''
        )
        AND COALESCE(d.extraction_status, '') != 'fulltext'
        """
    elif args.mode == "fulltext-first":
        # Keep selecting all unclaimed, but order fulltext first (below).
        pass
    if args.topic:
        sql += " AND cl.topic_id = ?"
        params.append(args.topic)
    if args.mode == "abstract-only":
        sql += """
      ORDER BY length(COALESCE(d.extracted_full_text,'')) DESC, d.id DESC
      LIMIT ?
        """
    else:
        sql += """
      ORDER BY
        CASE WHEN d.extraction_status = 'fulltext' THEN 0 ELSE 1 END,
        CASE WHEN d.file_path IS NOT NULL AND TRIM(d.file_path) != '' THEN 0 ELSE 1 END,
        length(COALESCE(d.extracted_full_text,'')) DESC,
        d.id DESC
      LIMIT ?
        """
    params.append(args.limit)
    rows = con.execute(sql, params).fetchall()
    print(
        f"[extract] mode={args.mode} model={model} docs={len(rows)}",
        flush=True,
    )

    n_claims = 0
    for row in rows:
        title = row["title"] or ""
        is_abstract = (row["extraction_status"] == "abstract_only") or not (
            row["file_path"] and str(row["file_path"]).strip()
        )
        # Fulltext scrape → larger window; abstract-only stays short
        body_cap = 14000 if (row["body_len"] or 0) >= 5000 else 6000
        body = (row["body"] or "")[:body_cap]
        user = (
            f"TOPIC={row['topic_id']} COMPONENT_HINT={row['component_id']}\n"
            f"SOURCE_KIND={'ABSTRACT_ONLY' if is_abstract else 'FULLTEXT'}\n"
            f"TITLE: {title}\n\nTEXT:\n{body}\n"
        )
        if args.dry_run:
            print("DRY", row["document_id"], "abstract" if is_abstract else "full", title[:80])
            continue
        try:
            obj = call_llm(or_key, user, model=model)
        except Exception as e:
            print(f"[extract] LLM fail doc={row['document_id']}: {e}", flush=True)
            continue
        claims = [c for c in (obj.get("claims") or []) if isinstance(c, dict)]
        summary = str(obj.get("paper_summary") or "").strip()
        if summary and not any(
            str(c.get("claim_kind") or "").lower() == "summary" for c in claims
        ):
            claims.insert(
                0,
                {
                    "claim_kind": "summary",
                    "value_text": summary[:1200],
                    "excerpt": summary[:240],
                    "confidence": 0.5 if is_abstract else 0.7,
                    "component_id_hint": row["component_id"],
                },
            )
        # GOTCHA: empty claim lists must still mark the document processed, else
        # the NOT IN subquery re-selects the same off-topic papers forever and
        # the autonomous literature phase stalls with flat claim counts.
        if not claims:
            con.execute(
                """
                INSERT INTO fpk_extracted_claims
                  (document_id, product_class, component_id, topic_id, claim_kind,
                   symbol, expression, value_text, unit, material_grade, elements,
                   density_kg_m3, excerpt, confidence, source_detail, embed_hash, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["document_id"],
                    PRODUCT_CLASS,
                    row["component_id"],
                    row["topic_id"],
                    "no_claim",
                    None,
                    None,
                    "NO_ENGINEERING_CLAIM",
                    None,
                    None,
                    None,
                    None,
                    (title or "")[:200],
                    0.0,
                    f"fpk_literature_empty:{row['document_id']}",
                    None,
                    None,
                ),
            )
            con.commit()
            print(
                f"[extract] doc={row['document_id']} claims=0 marked_empty — {title[:70]}",
                flush=True,
            )
            continue
        for c in claims:
            kind = str(c.get("claim_kind") or "physics")
            excerpt = str(c.get("excerpt") or "")[:500]
            symbol = c.get("symbol")
            expression = c.get("expression")
            value_text = c.get("value_text")
            unit = c.get("unit")

            def _as_text(val: Any) -> str | None:
                if val is None:
                    return None
                if isinstance(val, (list, tuple, dict)):
                    return json.dumps(val, ensure_ascii=False)[:500]
                return str(val)

            def _as_float(val: Any) -> float | None:
                if val is None or isinstance(val, (list, tuple, dict)):
                    return None
                try:
                    return float(val)
                except (TypeError, ValueError):
                    return None

            material_grade = _as_text(c.get("material_grade"))
            elements = _as_text(c.get("elements"))
            density = _as_float(c.get("density_kg_m3"))
            embed_src = " | ".join(
                str(x)
                for x in [
                    kind,
                    symbol,
                    expression,
                    value_text,
                    unit,
                    material_grade,
                    excerpt,
                    title,
                ]
                if x
            )
            emb = embed(embed_src, oa_key)
            eh = hashlib.sha256(embed_src.encode()).hexdigest()[:32] if emb else None
            comp = c.get("component_id_hint") or row["component_id"]
            if isinstance(comp, (list, dict)):
                comp = _as_text(comp)
            con.execute(
                """
                INSERT INTO fpk_extracted_claims
                  (document_id, product_class, component_id, topic_id, claim_kind,
                   symbol, expression, value_text, unit, material_grade, elements,
                   density_kg_m3, excerpt, confidence, source_detail, embed_hash, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["document_id"],
                    PRODUCT_CLASS,
                    comp,
                    row["topic_id"],
                    kind,
                    _as_text(symbol),
                    _as_text(expression),
                    _as_text(value_text),
                    _as_text(unit),
                    material_grade,
                    elements,
                    density,
                    excerpt,
                    float(
                        c.get("confidence")
                        or (0.45 if is_abstract else 0.5)
                    ),
                    (
                        f"fpk_literature_abstract:{row['document_id']}"
                        if is_abstract
                        else f"fpk_literature:{row['document_id']}"
                    ),
                    eh,
                    emb,
                ),
            )
            # also write namespaced spec for dualSearch consumers
            spec_name = f"fpk:{kind}:{symbol or hashlib.sha1(embed_src.encode()).hexdigest()[:10]}"
            try:
                con.execute(
                    """
                    INSERT OR IGNORE INTO pretraining_extracted_specs
                      (document_id, spec_key, spec_value, spec_unit, raw_excerpt,
                       embedding, embed_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    """,
                    (
                        row["document_id"],
                        spec_name,
                        str(value_text or expression or "")[:500],
                        unit,
                        excerpt,
                        emb,
                        eh,
                    ),
                )
            except sqlite3.Error as e:
                print(f"[extract] spec write skip: {e}", file=sys.stderr)
            n_claims += 1
        con.commit()
        print(
            f"[extract] doc={row['document_id']} claims={len(claims)} — {title[:70]}",
            flush=True,
        )

    total = con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0]
    print(f"[extract] done wrote={n_claims} total_claims={total}")
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
