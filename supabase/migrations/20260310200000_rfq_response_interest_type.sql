-- Add 'interest' to response_type enum
ALTER TABLE public.rfq_responses
  DROP CONSTRAINT IF EXISTS rfq_responses_response_type_check;
ALTER TABLE public.rfq_responses
  ADD CONSTRAINT rfq_responses_response_type_check
  CHECK (response_type IN ('accept', 'info_request', 'decline', 'interest'));
