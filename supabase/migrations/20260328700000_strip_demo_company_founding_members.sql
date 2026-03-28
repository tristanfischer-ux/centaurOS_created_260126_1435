-- Strip founding member status from demo company team members.
-- These were created during testing, not real signups.
-- Real companies (solarforschools, soldado) are NOT touched.

UPDATE public.profiles
SET is_founding_member = false,
    founding_member_number = NULL
WHERE is_founding_member = true
  AND (
    email LIKE '%@sararobotics.com'
    OR email LIKE '%@perigee-labs.com'
    OR email LIKE '%@freyaminiatures.com'
    OR email LIKE '%@greenerconsultants.com'
    OR email = 'strategy-ai@soldado.uk'
    OR email = 'tristan.fischer@centaurdynamics.io'
  );
