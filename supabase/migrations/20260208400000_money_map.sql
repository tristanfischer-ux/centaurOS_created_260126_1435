/**
 * Migration: Money Map — Revenue & Cost Allocation
 *
 * Purpose: Enable foundries to model their revenue streams, cost structure,
 * and overhead allocation. Supports both manual data entry and auto-population
 * from platform marketplace data (orders, retainers, escrow).
 *
 * Security:
 * - RLS ensures strict foundry isolation — users only see their own foundry's data
 * - All writes require authenticated user with foundry membership
 * - Snapshots are immutable once created (append-only)
 *
 * Related:
 * - Frontend: src/app/(platform)/money-map/
 * - Actions:  src/actions/money-map.ts
 * - Engine:   src/lib/money-map/allocation.ts
 *
 * Rollback: DROP TABLE money_map_cost_links, money_map_snapshots,
 *           money_map_cost_items, money_map_revenue_streams CASCADE;
 */

-- ============================================================
-- Revenue Streams
-- ============================================================
CREATE TABLE money_map_revenue_streams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id  UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'other'
                CHECK (category IN ('product', 'service', 'marketplace', 'subscription', 'other')),
    amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'GBP',
    period      TEXT NOT NULL DEFAULT 'monthly'
                CHECK (period IN ('monthly', 'quarterly', 'annual')),
    source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'auto')),
    auto_source_type TEXT
                CHECK (auto_source_type IN ('marketplace_orders', 'retainers', 'bookings', 'platform_fees')),
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mm_revenue_foundry ON money_map_revenue_streams(foundry_id);

-- ============================================================
-- Cost Items
-- ============================================================
CREATE TABLE money_map_cost_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id  UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'other'
                CHECK (category IN ('personnel', 'infrastructure', 'marketing', 'operations', 'other')),
    amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'GBP',
    period      TEXT NOT NULL DEFAULT 'monthly'
                CHECK (period IN ('monthly', 'quarterly', 'annual')),
    cost_type   TEXT NOT NULL DEFAULT 'overhead'
                CHECK (cost_type IN ('direct', 'indirect', 'overhead')),
    source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'auto')),
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mm_cost_foundry ON money_map_cost_items(foundry_id);

-- ============================================================
-- Cost Links (allocation of costs to revenue streams)
-- ============================================================
CREATE TABLE money_map_cost_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_item_id        UUID NOT NULL REFERENCES money_map_cost_items(id) ON DELETE CASCADE,
    revenue_stream_id   UUID NOT NULL REFERENCES money_map_revenue_streams(id) ON DELETE CASCADE,
    allocation_pct      NUMERIC(5,2) NOT NULL DEFAULT 0
                        CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
    allocation_method   TEXT NOT NULL DEFAULT 'revenue_proportional'
                        CHECK (allocation_method IN ('revenue_proportional', 'equal', 'headcount', 'custom')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cost_item_id, revenue_stream_id)
);

CREATE INDEX idx_mm_link_cost ON money_map_cost_links(cost_item_id);
CREATE INDEX idx_mm_link_revenue ON money_map_cost_links(revenue_stream_id);

-- ============================================================
-- Snapshots (point-in-time captures)
-- ============================================================
CREATE TABLE money_map_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id      UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    period_label    TEXT NOT NULL,
    snapshot_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_revenue   NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_costs     NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_margin_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mm_snapshot_foundry ON money_map_snapshots(foundry_id);

-- ============================================================
-- Row-Level Security
-- ============================================================

-- RLS: Revenue Streams
ALTER TABLE money_map_revenue_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own foundry revenue streams"
    ON money_map_revenue_streams FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_revenue_streams.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Insert own foundry revenue streams"
    ON money_map_revenue_streams FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_revenue_streams.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Update own foundry revenue streams"
    ON money_map_revenue_streams FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_revenue_streams.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Delete own foundry revenue streams"
    ON money_map_revenue_streams FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_revenue_streams.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

-- RLS: Cost Items
ALTER TABLE money_map_cost_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own foundry cost items"
    ON money_map_cost_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_cost_items.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Insert own foundry cost items"
    ON money_map_cost_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_cost_items.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Update own foundry cost items"
    ON money_map_cost_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_cost_items.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Delete own foundry cost items"
    ON money_map_cost_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_cost_items.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

-- RLS: Cost Links (access via cost_item's foundry)
ALTER TABLE money_map_cost_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own foundry cost links"
    ON money_map_cost_links FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM money_map_cost_items ci
            JOIN foundry_members fm ON fm.foundry_id = ci.foundry_id
            WHERE ci.id = money_map_cost_links.cost_item_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Insert own foundry cost links"
    ON money_map_cost_links FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM money_map_cost_items ci
            JOIN foundry_members fm ON fm.foundry_id = ci.foundry_id
            WHERE ci.id = money_map_cost_links.cost_item_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Update own foundry cost links"
    ON money_map_cost_links FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM money_map_cost_items ci
            JOIN foundry_members fm ON fm.foundry_id = ci.foundry_id
            WHERE ci.id = money_map_cost_links.cost_item_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Delete own foundry cost links"
    ON money_map_cost_links FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM money_map_cost_items ci
            JOIN foundry_members fm ON fm.foundry_id = ci.foundry_id
            WHERE ci.id = money_map_cost_links.cost_item_id
              AND fm.user_id = auth.uid()
        )
    );

-- RLS: Snapshots
ALTER TABLE money_map_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own foundry snapshots"
    ON money_map_snapshots FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_snapshots.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

CREATE POLICY "Insert own foundry snapshots"
    ON money_map_snapshots FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM foundry_members fm
            WHERE fm.foundry_id = money_map_snapshots.foundry_id
              AND fm.user_id = auth.uid()
        )
    );

-- Snapshots are append-only (no update/delete policies)

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_money_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mm_revenue_updated
    BEFORE UPDATE ON money_map_revenue_streams
    FOR EACH ROW EXECUTE FUNCTION update_money_map_updated_at();

CREATE TRIGGER trg_mm_cost_updated
    BEFORE UPDATE ON money_map_cost_items
    FOR EACH ROW EXECUTE FUNCTION update_money_map_updated_at();

CREATE TRIGGER trg_mm_link_updated
    BEFORE UPDATE ON money_map_cost_links
    FOR EACH ROW EXECUTE FUNCTION update_money_map_updated_at();
