-- Helper RPC to update pgvector embeddings on knowledge_notes.
-- PostgREST schema cache doesn't expose pgvector columns, so this
-- provides a workaround for server-side code and backfill scripts.

CREATE OR REPLACE FUNCTION update_knowledge_embedding(
  p_note_id uuid,
  p_embedding text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE knowledge_notes
  SET embedding = p_embedding::vector
  WHERE id = p_note_id;
END;
$$;

-- Also notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
