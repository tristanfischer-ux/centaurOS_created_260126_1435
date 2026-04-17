-- Cancel any pending rows from the retired Day 1 / 3 / 7 / 14 onboarding drip.
-- INTENT: atomic swap. The new 6-email welcome drip (20260417010000 + code
-- release) supersedes the legacy drip. Without cancelling pending rows,
-- anyone already part-way through the old drip would receive BOTH sequences.
--
-- Rows stay in the table (audit trail) — only their status is flipped.

UPDATE scheduled_emails
   SET status = 'cancelled',
       error_message = 'Retired by 20260417020000 — replaced by welcome_day0-5 drip',
       updated_at = now()
 WHERE status IN ('scheduled', 'pending')
   AND template IN (
     'onboarding_day1_welcome',
     'onboarding_day3_dfm',
     'onboarding_day7_assessment',
     'onboarding_day14_upgrade'
   );
