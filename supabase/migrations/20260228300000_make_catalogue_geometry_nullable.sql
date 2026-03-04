-- Make geometry_type_slug nullable on component_catalogue.
-- Many real-world BOM-grounding parts (timing belts, connectors, pneumatic cylinders,
-- pillow block bearings) have no matching CadQuery geometry type. Allowing NULL lets
-- us seed procurement-reference parts without forcing a spurious geometry mapping.

ALTER TABLE component_catalogue
  ALTER COLUMN geometry_type_slug DROP NOT NULL;
