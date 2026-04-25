-- Loop 3 P1: feasibility verdict column.
--
-- Frontier-LLM council (GPT-5.5, Gemini 3.1 Pro, DeepSeek V4-Pro, Kimi K2.6,
-- 2026-04-25 NIGHT) unanimously identified the highest-impact engine patch as
-- a "chief engineer feasibility gate": when sizing reports infeasible, mass
-- exceeds the brief, or cost exceeds the ceiling by a hard margin, the engine
-- should NOT ship a polished 91-page design package as if the project were
-- proceeding. Instead it should surface a Red verdict on the brief page,
-- emit a Feasibility Exception summary, and tag downstream sections as
-- tentative.
--
-- The verdict itself is computed deterministically (no LLM) inside the
-- proofreader stage and persisted here alongside `proofread_findings`. The
-- PDF export reads this column and renders the verdict banner + exception
-- page when status is "red".
--
-- Schema:
--   { "status": "green" | "amber" | "red",
--     "ran_at": ISO timestamp,
--     "fails": [
--       { "axis": "envelope" | "mass" | "cost" | "transport",
--         "severity": "blocker" | "warning",
--         "summary": "one-line founder-readable summary",
--         "evidence": "the numbers behind the call"
--       }
--     ],
--     "tradeoffs": [ "human-readable suggested next-action" ]
--   }

ALTER TABLE cad_lab_projects
    ADD COLUMN IF NOT EXISTS feasibility_verdict jsonb;

COMMENT ON COLUMN cad_lab_projects.feasibility_verdict IS
    'Deterministic feasibility verdict from the proofreader stage. Loop 3 P1, 2026-04-25 NIGHT. Status green/amber/red drives PDF rendering of the brief-page verdict banner and the optional Feasibility Exception page.';
