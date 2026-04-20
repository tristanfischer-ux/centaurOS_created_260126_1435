-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Money redesign · Chunk 1G · Legacy forward-migration
--
-- Copies a foundry's legacy cash-burn + investor data into the Money V2
-- tables so flipping `new_money_experience` shows populated surfaces
-- instead of empty states. Caller: Founder, one-shot per foundry before
-- flipping the flag.
--
-- IDEMPOTENT via legacy_source_{table,id} tags on V2 tables. Re-running is
-- safe — returns 0 row counts for already-migrated data. Never deletes
-- legacy rows; legacy `/cash-burn/*`, `/investors/*`, `/fundraise` continue
-- to work identically after migration.
--
-- Maps:
--   cash_out_items     → plan_line_items (direction='out')
--   cash_in_items      → plan_line_items (direction='in')
--   burn_scenarios     → money_scenarios (is_default forced to false;
--                                         V2 enforces one-default-per-foundry
--                                         unique idx so legacy multi-default
--                                         foundries can't insert; founder
--                                         picks default post-flip)
--   investor_shortlist → investor_pipeline_state (stage from shortlist or 'target')
--   investor_alerts    → investor_pipeline_state (stage='target' if not already
--                                                  in pipeline from shortlist)
--   investor_notes     → investor_pipeline_events (event_type='note_added',
--                                                   payload.legacy_note_id for
--                                                   idempotency)
--
-- Legacy investor_* tables use `user_id` scoping; this function resolves
-- user_id → foundry_id via profiles.active_foundry_id (fallback: foundry_id).
-- Rows whose user moved foundries before migration are skipped, not leaked.
--
-- NOT MIGRATED in this version:
--   burn_scenarios.item_overrides JSONB → money_scenario_overrides rows.
--   Legacy overrides referenced legacy cash_out/in_items IDs; the V2
--   plan_line_items IDs are different. Follow-up work can resolve via
--   legacy_source_id lookup; for now scenarios render name-only + no
--   overrides, and founders can rebuild overrides on the V2 plan.
--
-- Exec: `SELECT * FROM public.migrate_legacy_to_money_v2('<foundry_id>');`
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.migrate_legacy_to_money_v2(p_foundry_id text)
RETURNS TABLE (
  op text,
  count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_n integer := 0;
  v_inc_n integer := 0;
  v_scen_n integer := 0;
  v_shortlist_n integer := 0;
  v_alerts_n integer := 0;
  v_notes_n integer := 0;
BEGIN
  -- 1. cash_out_items → plan_line_items (out)
  INSERT INTO public.plan_line_items (
    foundry_id, name, direction, category, amount_cents, currency, frequency,
    effective_from, effective_to, notes, source,
    owner_user_id, legacy_source_table, legacy_source_id
  )
  SELECT
    c.foundry_id,
    COALESCE(NULLIF(c.name, ''), 'Untitled expense'),
    'out'::text,
    CASE
      WHEN c.pnl_category IN ('people','premises','tools','materials','growth','other') THEN c.pnl_category
      WHEN c.category = 'people' OR c.pnl_category ILIKE '%people%' OR c.pnl_category ILIKE '%salary%' THEN 'people'
      WHEN c.pnl_category ILIKE '%premises%' OR c.pnl_category ILIKE '%rent%' THEN 'premises'
      WHEN c.pnl_category ILIKE '%tool%' OR c.pnl_category ILIKE '%saas%' OR c.pnl_category ILIKE '%software%' THEN 'tools'
      WHEN c.pnl_category ILIKE '%material%' OR c.pnl_category ILIKE '%prototype%' THEN 'materials'
      WHEN c.pnl_category ILIKE '%growth%' OR c.pnl_category ILIKE '%marketing%' THEN 'growth'
      ELSE 'other'
    END,
    c.amount::integer,
    COALESCE(c.currency, 'GBP'),
    CASE WHEN c.frequency IN ('one_off','weekly','monthly','quarterly','annual','variable') THEN c.frequency ELSE 'monthly' END,
    COALESCE(c.effective_from, CURRENT_DATE),
    c.effective_to,
    c.notes,
    'legacy_migration'::text,
    c.created_by,
    'cash_out_items'::text,
    c.id
  FROM public.cash_out_items c
  WHERE c.foundry_id = p_foundry_id
    AND COALESCE(c.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.plan_line_items p
      WHERE p.legacy_source_table = 'cash_out_items' AND p.legacy_source_id = c.id
    );
  GET DIAGNOSTICS v_cost_n = ROW_COUNT;

  -- 2. cash_in_items → plan_line_items (in)
  INSERT INTO public.plan_line_items (
    foundry_id, name, direction, category, amount_cents, currency, frequency,
    effective_from, effective_to, probability_pct, notes, source,
    owner_user_id, legacy_source_table, legacy_source_id
  )
  SELECT
    c.foundry_id,
    COALESCE(NULLIF(c.name, ''), 'Untitled income'),
    'in'::text,
    CASE
      WHEN c.source_type IN ('revenue','grants','equity','loans') THEN c.source_type
      WHEN c.source_type ILIKE '%revenue%' OR c.source_type ILIKE '%sale%' THEN 'revenue'
      WHEN c.source_type ILIKE '%grant%' THEN 'grants'
      WHEN c.source_type ILIKE '%equity%' OR c.source_type ILIKE '%invest%' THEN 'equity'
      WHEN c.source_type ILIKE '%loan%' OR c.source_type ILIKE '%debt%' THEN 'loans'
      ELSE 'revenue'
    END,
    c.amount::integer,
    COALESCE(c.currency, 'GBP'),
    CASE WHEN c.frequency IN ('one_off','weekly','monthly','quarterly','annual','variable') THEN c.frequency ELSE 'monthly' END,
    COALESCE(c.effective_from, CURRENT_DATE),
    c.effective_to,
    COALESCE(c.probability_pct, 100),
    c.notes,
    'legacy_migration'::text,
    c.created_by,
    'cash_in_items'::text,
    c.id
  FROM public.cash_in_items c
  WHERE c.foundry_id = p_foundry_id
    AND COALESCE(c.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.plan_line_items p
      WHERE p.legacy_source_table = 'cash_in_items' AND p.legacy_source_id = c.id
    );
  GET DIAGNOSTICS v_inc_n = ROW_COUNT;

  -- 3. burn_scenarios → money_scenarios (is_default=false always; founder picks)
  INSERT INTO public.money_scenarios (
    foundry_id, name, is_default, visibility, template_source, legacy_source_id
  )
  SELECT
    b.foundry_id,
    COALESCE(NULLIF(b.name, ''), 'Untitled scenario'),
    false,
    'founders'::text,
    'legacy_migration'::text,
    b.id
  FROM public.burn_scenarios b
  WHERE b.foundry_id = p_foundry_id
    AND NOT EXISTS (
      SELECT 1 FROM public.money_scenarios ms
      WHERE ms.foundry_id = p_foundry_id AND ms.legacy_source_id = b.id
    );
  GET DIAGNOSTICS v_scen_n = ROW_COUNT;

  -- 4. investor_shortlist → investor_pipeline_state
  INSERT INTO public.investor_pipeline_state (
    foundry_id, round_id, marketplace_listing_id, current_stage,
    stage_entered_at, legacy_source_table, legacy_source_id
  )
  SELECT
    p_foundry_id,
    NULL,
    s.listing_id,
    CASE
      WHEN s.stage IN ('target','researching','contacted','meeting','due_diligence','verbal','closed','passed') THEN s.stage
      ELSE 'target'
    END,
    COALESCE(s.updated_at, s.created_at, now()),
    'investor_shortlist'::text,
    s.id
  FROM public.investor_shortlist s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE COALESCE(p.active_foundry_id, p.foundry_id) = p_foundry_id
    AND s.listing_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.investor_pipeline_state ips
      WHERE ips.foundry_id = p_foundry_id
        AND ips.marketplace_listing_id = s.listing_id
        AND ips.archived_at IS NULL
    );
  GET DIAGNOSTICS v_shortlist_n = ROW_COUNT;

  -- 5. investor_alerts → investor_pipeline_state (target stage; skip dupes)
  INSERT INTO public.investor_pipeline_state (
    foundry_id, round_id, marketplace_listing_id, current_stage,
    stage_entered_at, legacy_source_table, legacy_source_id
  )
  SELECT
    p_foundry_id,
    NULL,
    a.listing_id,
    'target'::text,
    COALESCE(a.created_at, now()),
    'investor_alerts'::text,
    a.id
  FROM public.investor_alerts a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE COALESCE(p.active_foundry_id, p.foundry_id) = p_foundry_id
    AND a.active = true
    AND a.listing_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.investor_pipeline_state ips
      WHERE ips.foundry_id = p_foundry_id
        AND ips.marketplace_listing_id = a.listing_id
        AND ips.archived_at IS NULL
    );
  GET DIAGNOSTICS v_alerts_n = ROW_COUNT;

  -- 6. investor_notes → investor_pipeline_events (note_added)
  INSERT INTO public.investor_pipeline_events (
    foundry_id, pipeline_state_id, event_type, payload, actor_user_id, created_at
  )
  SELECT
    p_foundry_id,
    ips.id,
    'note_added'::text,
    jsonb_build_object(
      'note_type', COALESCE(n.note_type, 'general'),
      'content', n.content,
      'legacy_note_id', n.id
    ),
    n.user_id,
    COALESCE(n.created_at, now())
  FROM public.investor_notes n
  JOIN public.profiles p ON p.id = n.user_id
  JOIN public.investor_pipeline_state ips
    ON ips.foundry_id = p_foundry_id
    AND ips.marketplace_listing_id = n.listing_id
    AND ips.archived_at IS NULL
  WHERE COALESCE(p.active_foundry_id, p.foundry_id) = p_foundry_id
    AND n.listing_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.investor_pipeline_events ipe
      WHERE ipe.pipeline_state_id = ips.id
        AND ipe.payload->>'legacy_note_id' = n.id::text
    );
  GET DIAGNOSTICS v_notes_n = ROW_COUNT;

  RETURN QUERY VALUES
    ('cost_lines',   v_cost_n),
    ('income_lines', v_inc_n),
    ('scenarios',    v_scen_n),
    ('shortlist',    v_shortlist_n),
    ('alerts',       v_alerts_n),
    ('notes',        v_notes_n);
END;
$$;

COMMENT ON FUNCTION public.migrate_legacy_to_money_v2(text) IS
  'MONEY-SCHEMA §5 Chunk 1G · idempotent forward-migration from legacy '
  'cash-burn + investor tables into Money V2. Call per foundry pre-flag-'
  'flip. Never deletes legacy rows. Safe to re-run.';

GRANT EXECUTE ON FUNCTION public.migrate_legacy_to_money_v2(text) TO service_role;
