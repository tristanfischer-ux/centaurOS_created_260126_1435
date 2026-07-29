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
harvest-fpk-literature.py           ← OpenAlex + Crossref → documents + links
        │ --oa-pdf (is_oa only, bounded batch)
        ▼
~/.forge-truth/fpk-pdfs/            ← validated %PDF files + document.file_path
        │
        ▼
extract-fpk-literature-claims.py    ← LLM claims + OpenAI embeddings
        │
        ▼
fpk-literature-search.ts            ← chain READ: lookup by component_id
```

## Commands

```bash
python3 scripts/ingest/migrate-fpk-literature-schema.py
python3 scripts/ingest/harvest-fpk-literature.py --min 10
python3 scripts/ingest/harvest-fpk-literature.py --status
python3 scripts/ingest/harvest-fpk-literature.py --oa-pdf --oa-limit 10
python3 scripts/ingest/extract-fpk-literature-claims.py --limit 80
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

- Abstracts/metadata first; OA PDFs when available (Unpaywall later).
- `--oa-pdf` considers only OpenAlex rows marked `is_oa=1`, requires a direct
  `pdf_url`, validates the `%PDF-` header, caps each file at 50 MiB, and writes
  `pretraining_spec_documents.file_path`; it never probes closed works.
- Peer-reviewed **hint** from OpenAlex/Crossref type+DOI — not a substitute for curator QA.
- Chain never calls OpenAlex — only reads DB.
