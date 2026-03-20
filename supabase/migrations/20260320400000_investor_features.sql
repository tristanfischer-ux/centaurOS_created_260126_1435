-- Migration: Investor Features — shortlist, notes, alerts
-- Enables the fundraising command center: pipeline tracking, activity logging, and alert subscriptions.

-- Shortlist: user's tracked investors with pipeline stages
CREATE TABLE public.investor_shortlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'researching'
    CHECK (stage IN ('researching','contacted','meeting','in_discussion','closed_won','closed_lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);
ALTER TABLE public.investor_shortlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shortlist" ON public.investor_shortlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_shortlist_user ON public.investor_shortlist(user_id);
CREATE INDEX idx_shortlist_stage ON public.investor_shortlist(user_id, stage);

-- Notes: per-investor activity log
CREATE TABLE public.investor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'note'
    CHECK (note_type IN ('note','meeting','email','call','milestone')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investor_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.investor_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_notes_listing ON public.investor_notes(user_id, listing_id);

-- Alerts: subscribe to investor changes
CREATE TABLE public.investor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);
ALTER TABLE public.investor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own alerts" ON public.investor_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-update trigger for shortlist.updated_at
CREATE OR REPLACE FUNCTION public.update_investor_shortlist_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_shortlist_updated_at BEFORE UPDATE ON public.investor_shortlist
  FOR EACH ROW EXECUTE FUNCTION public.update_investor_shortlist_updated_at();
