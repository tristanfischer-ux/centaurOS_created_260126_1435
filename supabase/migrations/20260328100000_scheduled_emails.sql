-- Scheduled Emails table for onboarding drip sequences
-- INTENT: Support time-delayed email campaigns (onboarding, re-engagement)
-- without requiring external email automation tools.

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  template TEXT NOT NULL,
  template_data JSONB DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending', 'sent', 'failed', 'cancelled')),
  description TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the cron job that processes due emails
CREATE INDEX idx_scheduled_emails_due ON scheduled_emails (status, scheduled_for)
  WHERE status IN ('scheduled', 'pending');

-- Index for cancelling a user's remaining drip
CREATE INDEX idx_scheduled_emails_user ON scheduled_emails (user_id, status);

-- RLS: Only the system (service role) should access this table
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — this table is accessed via server actions only
-- Service role bypasses RLS automatically

COMMENT ON TABLE scheduled_emails IS 'Time-delayed email queue for onboarding drip sequences and scheduled notifications';
COMMENT ON COLUMN scheduled_emails.template IS 'Email template name matching EmailTemplate type in notifications/types.ts';
COMMENT ON COLUMN scheduled_emails.status IS 'scheduled=future, pending=ready to send, sent=delivered, failed=error, cancelled=user upgraded';
