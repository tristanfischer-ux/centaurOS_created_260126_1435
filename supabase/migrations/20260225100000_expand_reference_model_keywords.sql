-- Expand reference model search keywords to improve matching accuracy.
-- Fixes: "four-wheeled flying vehicle" incorrectly matched Robotic Arm
-- because "for" prefix-matched "force torque".

UPDATE reference_models
SET search_keywords = search_keywords || ARRAY['flying', 'aerial', 'vtol', 'fly', 'reconnaissance', 'surveillance', 'firefighting', 'inspection']
WHERE category = 'drone';

UPDATE reference_models
SET search_keywords = search_keywords || ARRAY['vehicle', 'car', 'wheeled', 'wheels', 'automobile', 'motor vehicle']
WHERE category = 'ev';

UPDATE reference_models
SET search_keywords = search_keywords || ARRAY['flying', 'aerial vehicle', 'cargo drone', 'firefighting drone']
WHERE category = 'heavy-drone';

UPDATE reference_models
SET search_keywords = search_keywords || ARRAY['machine', 'prototype', 'mechanism']
WHERE category = 'generic';
