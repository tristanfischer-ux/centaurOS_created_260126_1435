-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'task_comments' 
  AND column_name IN ('message_id', 'synced_from_message');

-- Check synced comments have message_id
SELECT COUNT(*) as synced_comments_count
FROM task_comments
WHERE synced_from_message = true;

-- Check for orphaned comments (synced but no message_id)
SELECT COUNT(*) as orphaned_count
FROM task_comments
WHERE synced_from_message = true
  AND message_id IS NULL;
