-- ═══════════════════════════════════════════════════════════════
-- Extract Core Library — Single source of truth for grammar base classes
-- ═══════════════════════════════════════════════════════════════
--
-- Eliminates duplication: ParamSpec, Constraint, ValidationResult,
-- DomainGrammar are stored once. All domain grammars reference this
-- via core_library_code = NULL (resolved at runtime from __core_library__).
--
-- Runtime: Modal worker and app fetch __core_library__.python_code when
-- a grammar's core_library_code is null.

-- 1. Allow core_library_code to be null for domain grammars
ALTER TABLE cad_grammars
  ALTER COLUMN core_library_code DROP NOT NULL;

-- 2. Insert the canonical core library row
--    python_code = the core (ParamSpec, Constraint, DomainGrammar, etc.)
--    core_library_code = '' (the core does not depend on another core)
INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, is_active, version
)
SELECT
  '__core_library__',
  'Core Library',
  'Base classes for domain grammars (ParamSpec, Constraint, DomainGrammar)',
  '{}',
  '{}',
  core_library_code,
  '',
  '[]'::jsonb,
  '{}'::jsonb,
  NULL,
  'built_in',
  true,
  1
FROM cad_grammars
WHERE name = 'building'
LIMIT 1;

-- 3. Clear core_library_code from all domain grammars so they use __core_library__
UPDATE cad_grammars
SET core_library_code = NULL
WHERE name != '__core_library__';
