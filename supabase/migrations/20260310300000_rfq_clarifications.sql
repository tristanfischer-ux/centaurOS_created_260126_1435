-- Clarification Q&A for RFQs
CREATE TABLE IF NOT EXISTS public.rfq_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  answered_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfq_clarifications_rfq_id ON public.rfq_clarifications(rfq_id);

ALTER TABLE public.rfq_clarifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_clarifications" ON public.rfq_clarifications
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "buyer_manages_clarifications" ON public.rfq_clarifications
  FOR ALL USING (EXISTS (
    SELECT 1 FROM rfqs WHERE rfqs.id = rfq_id AND rfqs.buyer_id = auth.uid()
  ));
