-- Fix corrupted marketplace attributes
-- Root cause: Python scripts used json.dumps() before posting to Supabase REST API,
-- double-serializing the JSON. This turned {"key":"val"} into a string that got stored
-- as numeric-keyed JSONB: {"0":"{","1":"\"","2":"k", ...}
--
-- This migration reconstructs the original JSON from numeric keys, preserves any
-- properly-named keys, and updates the row. Idempotent: fixed rows no longer match WHERE.

DO $$
DECLARE
  rec RECORD;
  max_key INT;
  reconstructed TEXT;
  i INT;
  parsed JSONB;
  named_keys JSONB;
  k TEXT;
  fixed_count INT := 0;
  error_count INT := 0;
BEGIN
  FOR rec IN
    SELECT id, attributes
    FROM marketplace_listings
    WHERE attributes ? '0'
      AND attributes->>'0' IN ('{', '"')
  LOOP
    BEGIN
      -- Find the max numeric key to know the string length
      SELECT MAX(k::int) INTO max_key
      FROM jsonb_object_keys(rec.attributes) AS k
      WHERE k ~ '^\d+$';

      -- Reconstruct the JSON string from numeric keys in order
      reconstructed := '';
      FOR i IN 0..max_key LOOP
        IF rec.attributes ? i::text THEN
          reconstructed := reconstructed || (rec.attributes->>i::text);
        END IF;
      END LOOP;

      -- Parse the reconstructed string
      parsed := reconstructed::jsonb;

      -- Extract any properly-named keys (non-numeric) from original
      named_keys := '{}'::jsonb;
      FOR k IN SELECT jsonb_object_keys(rec.attributes) LOOP
        IF k !~ '^\d+$' THEN
          named_keys := named_keys || jsonb_build_object(k, rec.attributes->k);
        END IF;
      END LOOP;

      -- Merge: parsed base + named keys overlay (named keys win on conflict)
      parsed := parsed || named_keys;

      -- Update the row
      UPDATE marketplace_listings
      SET attributes = parsed
      WHERE id = rec.id;

      fixed_count := fixed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING 'Failed to fix listing %: %', rec.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Fixed % listings, % errors', fixed_count, error_count;
END $$;
