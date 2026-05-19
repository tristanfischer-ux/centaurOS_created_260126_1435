-- Phase 4 schema for real engineering spec-sheet ingestion
-- Created 2026-05-17. Tables live in ~/.forge-truth/forge-truth.db
-- Distinct from pretraining_products (LLM web-snippet summaries).
-- These tables hold parses of real manufacturer-published PDFs.

CREATE TABLE IF NOT EXISTS pretraining_spec_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_class TEXT,
    manufacturer TEXT,
    product_name TEXT,
    source_url TEXT,
    document_type TEXT,           -- datasheet / whitepaper / manual / installation / brochure
    pages INTEGER,
    downloaded_at TEXT,
    file_hash TEXT UNIQUE,        -- SHA-256, dedup key
    file_path TEXT,               -- ~/.forge-truth/spec-pdfs/<hash>.pdf
    extraction_status TEXT,       -- pending / done / failed
    extracted_at TEXT,
    extraction_cost_usd REAL,
    extraction_model TEXT
);

CREATE TABLE IF NOT EXISTS pretraining_extracted_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES pretraining_spec_documents(id) ON DELETE CASCADE,
    part_name TEXT,
    manufacturer TEXT,
    part_number TEXT,
    quantity REAL,
    unit_price_gbp REAL,
    module_assignment TEXT,
    sub_module_assignment TEXT,
    source_page INTEGER,
    raw_excerpt TEXT,
    confidence REAL
);

CREATE TABLE IF NOT EXISTS pretraining_extracted_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES pretraining_spec_documents(id) ON DELETE CASCADE,
    company_name TEXT,
    role TEXT,                    -- principal / subsupplier / cm / distributor
    website TEXT,
    raw_excerpt TEXT
);

CREATE TABLE IF NOT EXISTS pretraining_extracted_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES pretraining_spec_documents(id) ON DELETE CASCADE,
    spec_key TEXT,
    spec_value TEXT,
    spec_unit TEXT,
    raw_excerpt TEXT
);

CREATE TABLE IF NOT EXISTS pretraining_extracted_standards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES pretraining_spec_documents(id) ON DELETE CASCADE,
    standard_name TEXT,
    scope TEXT,
    raw_excerpt TEXT
);

CREATE INDEX IF NOT EXISTS idx_spec_documents_class ON pretraining_spec_documents(product_class);
CREATE INDEX IF NOT EXISTS idx_spec_documents_mfr ON pretraining_spec_documents(manufacturer);
CREATE INDEX IF NOT EXISTS idx_extracted_parts_doc ON pretraining_extracted_parts(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_parts_module ON pretraining_extracted_parts(module_assignment);
CREATE INDEX IF NOT EXISTS idx_extracted_suppliers_doc ON pretraining_extracted_suppliers(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_specs_doc ON pretraining_extracted_specs(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_standards_doc ON pretraining_extracted_standards(document_id);
