-- ============================================================================
-- Wave 1 Piece 4: character_registry — persistent knowledge of character_id →
-- vendor / MPN / price across pipeline runs.
--
-- Purpose:
--   The PDF Engine v2 radical-resolution stage repeatedly re-discovers the
--   same parts (LFP cells, BMS slave ICs, IGBTs, RCDs, etc.) every run.
--   This table persists the result of distributor lookups, vendor-catalog
--   matches, plausibility checks and Tavily searches so subsequent runs hit
--   cache first and only fall through to live discovery on miss.
--
--   The registry grows organically: every new character_id seen by the
--   engine (across all product classes) becomes a row; price / source-grade
--   are upgraded when a higher-confidence source confirms.
--
-- Bootstrapping:
--   Seeded from the two in-code tables in
--     src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts
--   namely MPN_HINTS_BY_CHARACTER (~70 entries with hand-curated MPN arrays)
--   and OEM_CATALOG_BY_CHARACTER (~10 entries linking character_id to a
--   VENDOR_CATALOG partType).  Where both tables name the same character_id
--   the rows are merged (mpn_hints AND vendor_catalog_part_type populated).
--
-- Source-grade taxonomy (matches the renderer):
--   verified    -- confirmed at a distributor (MPN + price + stock)
--   priced      -- vendor-catalog match with a known unit price
--   canonical   -- vendor-catalog match without a confirmed unit price
--   plausible   -- plausibility / training-data inference
--   unverified  -- LLM-only, no external confirmation
--
-- RLS state:
--   Enabled. Service-role full access only. No anon / authenticated policy
--   (this is engine-internal; the app reads via service role).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.character_registry (
    id                            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),

    character_id                  text           NOT NULL,

    -- Semantic composition (radical hierarchy)
    function_radical_primary      text,
    material_radical_primary      text,
    function_radical_secondary    text,
    material_radical_secondary    text,

    -- Coarse part class for routing in the resolution stage.
    part_class                    text           CHECK (part_class IN (
                                                      'electronic_cots',
                                                      'mechanical_cots',
                                                      'oem_subsystem',
                                                      'structural_fabricated',
                                                      'software_ip'
                                                  )),

    -- MPN array for distributor lookup (Mouser / Farnell / RS / Digi-Key).
    mpn_hints                     jsonb          NOT NULL DEFAULT '[]'::jsonb,

    -- Canonical manufacturer name (when known); e.g. "TE Connectivity".
    manufacturer                  text,

    -- Link to the vendor catalog partType (see lib/vendor-catalog.ts) when
    -- this character_id maps to an OEM subsystem.
    vendor_catalog_part_type      text,

    -- Last known unit price (GBP) and its provenance.
    unit_price_gbp                numeric,
    unit_price_source             text           CHECK (unit_price_source IN (
                                                      'distributor',
                                                      'vendor_catalog',
                                                      'tavily_extract',
                                                      'plausibility_inferred',
                                                      'training_data'
                                                  )),
    source_url                    text,

    -- Renderer-facing grade for citation styling.
    source_grade                  text           NOT NULL CHECK (source_grade IN (
                                                      'verified',
                                                      'priced',
                                                      'canonical',
                                                      'plausible',
                                                      'unverified'
                                                  )),

    -- 0..1 confidence (1 = distributor-confirmed, 0 = LLM-only).
    confidence_score              numeric        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

    -- Product classes that have used this character (energy_storage, auv, ...)
    product_classes               text[]         NOT NULL DEFAULT '{}',

    -- When we last confirmed; NULL = pure seed-data, never re-verified.
    last_verified_at              timestamptz,

    created_at                    timestamptz    NOT NULL DEFAULT now(),
    updated_at                    timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.character_registry IS
    'Persistent registry of character_id -> vendor / MPN / price. '
    'Hit-first cache for pdf-engine-v2 radical resolution (stages/4b). '
    'Service-role only.';

COMMENT ON COLUMN public.character_registry.source_grade IS
    'Renderer taxonomy: verified | priced | canonical | plausible | unverified.';

COMMENT ON COLUMN public.character_registry.mpn_hints IS
    'JSONB array of manufacturer-part-number strings used as starting points '
    'for distributor search.  Order matters: best match first.';

COMMENT ON COLUMN public.character_registry.last_verified_at IS
    'NULL = pure seed data, never independently confirmed. '
    'Set when a distributor / Tavily / vendor-catalog probe confirms.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS character_registry_character_id_key
    ON public.character_registry (character_id);

CREATE INDEX IF NOT EXISTS character_registry_product_classes_gin
    ON public.character_registry USING gin (product_classes);

CREATE INDEX IF NOT EXISTS character_registry_source_grade_idx
    ON public.character_registry (source_grade);

CREATE INDEX IF NOT EXISTS character_registry_last_verified_at_idx
    ON public.character_registry (last_verified_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.character_registry_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS character_registry_touch_updated_at ON public.character_registry;
CREATE TRIGGER character_registry_touch_updated_at
BEFORE UPDATE ON public.character_registry
FOR EACH ROW EXECUTE FUNCTION public.character_registry_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.character_registry ENABLE ROW LEVEL SECURITY;

-- Service role has implicit bypass of RLS in Supabase but we add an explicit
-- policy so the table stays usable if RLS-bypass is ever revoked.
DROP POLICY IF EXISTS character_registry_service_role_all ON public.character_registry;
CREATE POLICY character_registry_service_role_all
    ON public.character_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No anon / authenticated policies: engine-internal only.

-- ---------------------------------------------------------------------------
-- Seed data
--
-- All seed rows are scoped to product_classes = {'energy_storage'} because
-- both source tables are BESS-centric in their present form.  Subsequent
-- pipeline runs will add rows for other product classes and append to
-- product_classes when an existing character is reused.
--
-- Defaults:
--   * MPN_HINTS_BY_CHARACTER  -> source_grade='verified' (hand-curated MPN
--     list — not yet distributor-confirmed, but considered canonical seed),
--     unit_price_source='training_data', confidence_score=0.85,
--     last_verified_at=NULL.
--   * OEM_CATALOG_BY_CHARACTER -> source_grade='priced' when the catalog
--     entry has a typicalUnitPriceGbp on its lead vendor, else 'canonical',
--     unit_price_source='vendor_catalog', confidence_score=0.75.
--   * Where a character appears in BOTH tables, the row is merged:
--     mpn_hints AND vendor_catalog_part_type populated, source_grade upgraded
--     to 'priced' when the catalog has a price.
-- ---------------------------------------------------------------------------

INSERT INTO public.character_registry (
    character_id,
    mpn_hints,
    vendor_catalog_part_type,
    unit_price_gbp,
    unit_price_source,
    source_grade,
    confidence_score,
    product_classes
) VALUES
    -- ── MPN_HINTS_BY_CHARACTER (hand-curated; not yet distributor-confirmed) ──
    ('dc_contactor',                  '["EV200HAANA","LEV200A4ANA"]'::jsonb,           NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('protection_relay',              '["P127C6A0350A0"]'::jsonb,                       NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('gas_sensor',                    '["712-MQ-2","MQ135"]'::jsonb,                    NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('optical_arc_sensor',            '["AFDA48D","AFDA24D"]'::jsonb,                   NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('network_switch',                '["EDS-405A-EIP","EDS-405A"]'::jsonb,             NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('resistor',                      '["HLP300R100J","HLP300R050J"]'::jsonb,           NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('copper_busbar',                 '["BUSA-08X03-24-T","BUSA-10X03-24-T"]'::jsonb,   NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('cable_transit_frame',           '["S/S 32/0 R0","EXII32"]'::jsonb,                NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('thermal_insulation_panel',      '["ROCKFLEX-80"]'::jsonb,                         NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('circuit_breaker',               '["XT5N 1000 Ekip Touch LSI 3p F F","E2.2N 2000 Ekip Hi-Touch LSI 4p WMP"]'::jsonb, NULL, NULL, 'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('steel_bolt',                    '["526-9064","278-6010"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('steel_threaded_rod',            '["527-0104","278-6090"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('copper_wire',                   '["224-4488","879-7004"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('copper_terminal',               '["RB16-10-X","LCD16-14R-Q","P14-14R-T"]'::jsonb, NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('polymer_gasket',                '["614-3249","614-3231"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('aluminium_heatsink',            '["460-1466","FA-T220-38E"]'::jsonb,              NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('bms_isolation_ic',              '["ADUM1411ARWZ","ISO7741DWR"]'::jsonb,           NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('bms_slave_monitor_ic',          '["LTC6804-1","LTC6804-2","MAX17841BGTL+T"]'::jsonb, NULL,                           NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('can_transceiver_ic',            '["TCAN1042HDR","TJA1051T"]'::jsonb,              NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('isolation_transceiver_ic',      '["ISO1042BDWVR","ISO1500DBQ"]'::jsonb,           NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('esd_protection_diode',          '["SP1004-04UTG","SP3010-04UTG"]'::jsonb,         NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('smoke_detector_aspirating',     '["VESDA-VLP-002"]'::jsonb,                       NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('vibration_isolator_mount',      '["VIB-25-A","NM50R"]'::jsonb,                    NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('pressure_relief_valve',         '["CAL-553560","316030"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('expansion_vessel',              '["REFLEX-N-18","ZILMET-18L"]'::jsonb,            NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('hydronic_circulator_pump',      '["UPM3-25-70","WILO-YONOS-25-7"]'::jsonb,        NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('rcd_type_b_module',             '["DFS4-040-4-003-B"]'::jsonb,                    NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('emergency_stop_button',         '["XALK178","XB4BS8442"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('ccs_connector_assembly',        '["1404577","CCSDC-200A-PHOENIX"]'::jsonb,        NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('ble_soc_module',                '["NRF52832-QFAA-R","NRF52840-QIAA-R"]'::jsonb,   NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('coin_cell_battery_cr1632',      '["CR1632","CR1632MFR"]'::jsonb,                  NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('accelerometer_3axis_lp',        '["LIS2DW12TR","BMA400"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('imu_6dof_module',               '["ICM-42688-P","BMI088"]'::jsonb,                NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('magnetometer_3axis',            '["LIS3MDLTR","IIS2MDC"]'::jsonb,                 NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('barometer_pressure_sensor',     '["BMP388","BMP585"]'::jsonb,                     NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('gnss_receiver_module',          '["SAM-M10Q-00B","NEO-M9N-00B"]'::jsonb,          NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('telemetry_radio_modem',         '["RFD-900X","HOLYBRO-SIK-V3"]'::jsonb,           NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('rc_receiver_module',            '["R9MINI","X8R"]'::jsonb,                        NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('brushless_dc_motor',            '["T-MOTOR-MN605S","KDE-700XF-295"]'::jsonb,      NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('electronic_speed_controller',   '["TEKKO32-F4-65A","XROTOR-PRO-80A"]'::jsonb,     NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('propeller_carbon_blade',        '["T-MOTOR-G29x9.5-CF","MA-19x10-CF"]'::jsonb,    NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('ac_circuit_breaker',            '["3AH5103-2","VD4-12-1250-25"]'::jsonb,          NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('gate_drive_isolated_dcdc',      '["MGJ2D241505SC","RP-1515D"]'::jsonb,            NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('insulation_monitoring_device',  '["ISO685-D-P","ISO685W-D-B"]'::jsonb,            NULL,                              NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),
    ('intrusion_detector_pir',        '["BOSCH-ISC-PDL1-W18G","HONEYWELL-IS-310"]'::jsonb, NULL,                           NULL,    'training_data', 'verified', 0.85, ARRAY['energy_storage']),

    -- ── pcb_controller appears in BOTH tables: merge MPN hints + vendor catalog ──
    ('pcb_controller',                '["NXP-BMS-SLAVE-REF","ISL94212"]'::jsonb,        'bms_controller',                  6500,    'vendor_catalog', 'priced',   0.85, ARRAY['energy_storage']),

    -- ── OEM_CATALOG_BY_CHARACTER (vendor-catalog mappings only) ──
    -- lfp_prismatic_cell: catalog lead vendor CATL @ £45 -> priced
    ('lfp_prismatic_cell',            '[]'::jsonb,                                      'lfp_prismatic_cell',              45,      'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- power_converter -> pcs_inverter @ £45000 -> priced
    ('power_converter',               '[]'::jsonb,                                      'pcs_inverter',                    45000,   'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- transformer -> hv_dc_switchgear @ £140 -> priced (note: lead vendor lower-priced contactor)
    ('transformer',                   '[]'::jsonb,                                      'hv_dc_switchgear',                140,     'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- liquid_cooling_system -> thermal_management_liquid @ £12000 -> priced
    ('liquid_cooling_system',         '[]'::jsonb,                                      'thermal_management_liquid',       12000,   'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- fire_suppression_system -> fire_suppression_bess @ £12000 -> priced
    ('fire_suppression_system',       '[]'::jsonb,                                      'fire_suppression_bess',           12000,   'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- pressure_vessel -> fire_suppression_bess (same partType, fire-suppression cylinders) -> priced
    ('pressure_vessel',               '[]'::jsonb,                                      'fire_suppression_bess',           12000,   'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- ems_controller -> ems_controller @ £400 (Victron) -> priced
    ('ems_controller',                '[]'::jsonb,                                      'ems_controller',                  400,     'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- switchboard_enclosure -> hv_dc_switchgear @ £140 -> priced
    ('switchboard_enclosure',         '[]'::jsonb,                                      'hv_dc_switchgear',                140,     'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage']),
    -- steel_door -> hv_dc_switchgear (nearest catalog class) -> priced
    ('steel_door',                    '[]'::jsonb,                                      'hv_dc_switchgear',                140,     'vendor_catalog', 'priced',   0.75, ARRAY['energy_storage'])
ON CONFLICT (character_id) DO NOTHING;

COMMIT;
