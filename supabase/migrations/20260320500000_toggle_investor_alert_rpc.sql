-- Atomic toggle for investor alerts — avoids TOCTOU race on rapid double-click.
-- Inserts with active=true if no row exists, flips active if row exists.
-- Returns the new active state.
CREATE OR REPLACE FUNCTION public.toggle_investor_alert(
  p_user_id UUID,
  p_listing_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result_active BOOLEAN;
BEGIN
  INSERT INTO public.investor_alerts (user_id, listing_id, active)
  VALUES (p_user_id, p_listing_id, true)
  ON CONFLICT (user_id, listing_id)
  DO UPDATE SET active = NOT investor_alerts.active
  RETURNING active INTO result_active;

  RETURN result_active;
END;
$$;
