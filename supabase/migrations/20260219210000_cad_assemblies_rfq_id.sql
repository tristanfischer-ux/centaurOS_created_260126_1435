-- Link Assembly Builder designs to marketplace RFQs so "View RFQ" survives navigation.
-- When a user creates an RFQ from an assembly, we store the rfq_id here.

ALTER TABLE cad_assemblies
  ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES public.rfqs(id) ON DELETE SET NULL;

COMMENT ON COLUMN cad_assemblies.rfq_id IS 'Marketplace RFQ created from this assembly (Export to RFQ).';

CREATE INDEX IF NOT EXISTS idx_cad_assemblies_rfq_id ON cad_assemblies(rfq_id) WHERE rfq_id IS NOT NULL;
