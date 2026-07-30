# FPK Literature Corpus — Anvil world-expert rail

**Goal:** Every FPK subcomponent has ≥10 high-quality (ideally peer-reviewed) papers; extracts land in searchable materials / physics / formula / FEA stores.

## Pipeline (ingest-only live APIs)

```
fpk-literature-topics.json          ← research topics ↔ component_ids
        │
        ▼
migrate-fpk-literature-schema.py    ← fpk_* tables in forge-truth.db
        │
        ▼
harvest-fpk-literature.py           ← OpenAlex + Crossref → abstracts + links
        │
        ▼
download-fpk-oa-fulltext.py         ← Unpaywall/OpenAlex → PDF + pdftotext scrape
        │
        ▼
~/.forge-truth/fpk-pdfs/            ← validated %PDF files + document.file_path
        │                             extracted_full_text = FULL scrape (≥5k)
        ▼
extract-fpk-literature-claims.py    ← LLM claims on FULLTEXT first + embeddings
        │
        ▼
fe-front-wire-fpk-claims.py         ← attach claims to physics-tree leaves
        │
        ▼
fpk-literature-search.ts            ← chain READ: lookup by component_id
```

**Hard rule:** abstracts-only is not literature work. Prove with:
`python3 scripts/ingest/download-fpk-oa-fulltext.py --prove`

## Commands

```bash
python3 scripts/ingest/migrate-fpk-literature-schema.py
python3 scripts/ingest/harvest-fpk-literature.py --min 10
python3 scripts/ingest/harvest-fpk-literature.py --status
python3 scripts/ingest/download-fpk-oa-fulltext.py --limit 40
python3 scripts/ingest/download-fpk-oa-fulltext.py --prove
python3 scripts/ingest/extract-fpk-literature-claims.py --limit 80
python3 scripts/fe-front-wire-fpk-claims.py --twin out/formula-e-front-mgu-20260729-1432
```

## Tables

| Table | Purpose |
|---|---|
| `fpk_literature_topics` | Topic definitions |
| `fpk_component_literature` | component_id ↔ document_id (≥10 target) |
| `fpk_extracted_claims` | formulas, materials, physics, FEA, chemistry… |
| `fpk_literature_harvest_log` | harvest audit |
| `pretraining_spec_documents` | paper abstracts (`source_type=fpk_literature`) |
| `pretraining_extracted_specs` | namespaced `fpk:*` keys for dualSearch |

## Search (chain)

```ts
import {
  lookupFpkComponentLiterature,
  lookupFpkClaims,
  fpkLiteratureCoverage,
} from '@/lib/pdf-engine-v2/lib/knowledge/fpk-literature-search'

lookupFpkComponentLiterature({ componentId: 'stator_windings', k: 12 })
lookupFpkClaims({ componentId: 'dc_link_capacitor_bank', claimKind: 'formula' })
```

## Honesty

- Harvest still stores abstracts first for coverage; **fulltext download is mandatory**
  via `download-fpk-oa-fulltext.py` (Unpaywall → PDF → pdftotext → FTS).
- Harvest `--oa-pdf` is legacy (needs `is_oa=1` in harvest_log — usually 0). Prefer
  the Unpaywall fulltext script.
- Peer-reviewed **hint** from OpenAlex/Crossref type+DOI — not a substitute for curator QA.
- Chain never calls Unpaywall/OpenAlex — only reads DB after ingest.
