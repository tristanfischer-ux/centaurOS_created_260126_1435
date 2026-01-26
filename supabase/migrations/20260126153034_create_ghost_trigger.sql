-- Create Trigger Function to call Ghost Worker Edge Function
-- Note: Requires pg_net extension and valid Supabase Edge Function URL
create extension if not exists pg_net;

create or replace function public.trigger_ghost_worker()
returns trigger as $$
declare
  is_ai boolean;
  project_url text := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ghost-worker'; -- REPLACE WITH ACTUAL URL
  service_key text := 'YOUR_SERVICE_ROLE_KEY'; -- REPLACE WITH ACTUAL KEY
begin
  -- Check if Assignee is an AI Agent
  select (role = 'AI_Agent') into is_ai from public.profiles where id = NEW.assignee_id;
  
  if is_ai then
    -- Call Edge Function via pg_net
    perform net.http_post(
        url := project_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body := jsonb_build_object('record', row_to_json(NEW), 'type', TG_OP)
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

-- Create Trigger
create trigger on_task_assigned_to_ai
after insert or update of assignee_id on public.tasks
for each row
when (NEW.assignee_id is not null)
execute function public.trigger_ghost_worker();