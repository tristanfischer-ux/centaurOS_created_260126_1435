drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop trigger if exists "update_company_invitations_updated_at_trigger" on "public"."company_invitations";

drop trigger if exists "update_project_assignments_updated_at_trigger" on "public"."project_assignments";

drop policy "Admins can create invitations" on "public"."company_invitations";

drop policy "Admins can delete invitations" on "public"."company_invitations";

drop policy "Admins can update invitations" on "public"."company_invitations";

drop policy "Admins can view invitations" on "public"."company_invitations";

drop policy "Service role full access to invitations" on "public"."company_invitations";

drop policy "Users can add to stack" on "public"."foundry_stack";

drop policy "Users can remove from stack" on "public"."foundry_stack";

drop policy "Users can view their stack" on "public"."foundry_stack";

drop policy "Admins can create assignments" on "public"."project_assignments";

drop policy "Admins can delete assignments" on "public"."project_assignments";

drop policy "Admins can update assignments" on "public"."project_assignments";

drop policy "Admins can view foundry assignments" on "public"."project_assignments";

drop policy "Apprentices can view own assignments" on "public"."project_assignments";

drop policy "admin_view_audit_log" on "public"."admin_audit_log";

drop policy "admin_view_fraud_signals" on "public"."fraud_signals";

drop policy "admin_view_metrics" on "public"."platform_metrics";

alter table "public"."company_invitations" drop constraint "company_invitations_foundry_id_fkey";

alter table "public"."project_assignments" drop constraint "project_assignments_foundry_id_fkey";

alter table "public"."foundries" drop constraint "foundries_owner_id_fkey";

drop function if exists "public"."generate_invitation_token"();

drop function if exists "public"."get_invitation_by_token"(invitation_token text);

drop function if exists "public"."is_invitation_valid"(invitation_token text);

drop function if exists "public"."transfer_task_assignee"(p_task_id uuid, p_new_assignee_id uuid);

drop function if exists "public"."update_company_invitations_updated_at"();

drop function if exists "public"."update_project_assignments_updated_at"();

drop materialized view if exists "public"."buyer_stats";

drop materialized view if exists "public"."category_stats";

drop view if exists "public"."platform_monthly_stats";

drop materialized view if exists "public"."supplier_search_ranking";

drop materialized view if exists "public"."platform_daily_stats";

drop index if exists "public"."idx_marketplace_listings_featured";

drop index if exists "public"."idx_marketplace_listings_featured_for";

drop index if exists "public"."idx_marketplace_listings_featured_order";

drop index if exists "public"."idx_profiles_marketplace_tour_incomplete";


  create table "public"."ai_tools" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "name" text not null,
    "category" text not null,
    "provider" text not null,
    "description" text,
    "typical_monthly_cost" numeric,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."ai_tools" enable row level security;


  create table "public"."custom_slash_commands" (
    "id" uuid not null default gen_random_uuid(),
    "foundry_id" text not null,
    "name" text not null,
    "description" text not null,
    "usage" text,
    "icon" text default 'terminal'::text,
    "action_type" text not null,
    "action_config" jsonb not null default '{}'::jsonb,
    "enabled" boolean default true,
    "required_roles" text[],
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."custom_slash_commands" enable row level security;


  create table "public"."manufacturing_rfqs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "title" text not null,
    "specifications" text not null,
    "budget_range" text,
    "status" public.rfq_status default 'Open'::public.rfq_status,
    "foundry_id" text not null,
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."manufacturing_rfqs" enable row level security;


  create table "public"."message_reactions" (
    "id" uuid not null default gen_random_uuid(),
    "message_id" uuid not null,
    "user_id" uuid not null,
    "emoji" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."message_reactions" enable row level security;


  create table "public"."message_stars" (
    "id" uuid not null default gen_random_uuid(),
    "message_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."message_stars" enable row level security;


  create table "public"."pinned_messages" (
    "id" uuid not null default gen_random_uuid(),
    "message_id" uuid not null,
    "conversation_id" uuid not null,
    "pinned_by" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."pinned_messages" enable row level security;


  create table "public"."user_reminders" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "foundry_id" text not null,
    "message" text not null,
    "remind_at" timestamp with time zone not null,
    "conversation_id" uuid,
    "message_id" uuid,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_reminders" enable row level security;

alter table "public"."foundries" drop column "updated_at";

alter table "public"."foundries" alter column "id" drop default;

alter table "public"."foundry_stack" add column "tool_id" uuid;

alter table "public"."foundry_stack" alter column "provider_id" drop not null;

alter table "public"."marketplace_listings" drop column "featured_for";

alter table "public"."marketplace_listings" drop column "featured_order";

alter table "public"."marketplace_listings" drop column "is_featured";

alter table "public"."messages" add column "last_reply_at" timestamp with time zone;

alter table "public"."messages" add column "parent_message_id" uuid;

alter table "public"."messages" add column "reply_count" integer default 0;

alter table "public"."profiles" add column "availability_hours_per_week" integer;

alter table "public"."profiles" add column "availability_type" text;

alter table "public"."profiles" add column "executive_onboarding_completed" boolean default false;

alter table "public"."profiles" add column "expertise_areas" text[] default '{}'::text[];

alter table "public"."profiles" add column "headline" text;

alter table "public"."profiles" add column "industries" text[] default '{}'::text[];

alter table "public"."profiles" add column "linkedin_url" text;

alter table "public"."profiles" add column "looking_for" text[] default '{}'::text[];

alter table "public"."profiles" add column "paired_ai_id" uuid;

alter table "public"."profiles" add column "years_experience" integer;

alter table "public"."tasks" add column "progress" integer;

CREATE UNIQUE INDEX ai_tools_pkey ON public.ai_tools USING btree (id);

CREATE UNIQUE INDEX custom_slash_commands_foundry_id_name_key ON public.custom_slash_commands USING btree (foundry_id, name);

CREATE UNIQUE INDEX custom_slash_commands_pkey ON public.custom_slash_commands USING btree (id);

CREATE INDEX idx_commands_foundry ON public.custom_slash_commands USING btree (foundry_id) WHERE (enabled = true);

CREATE INDEX idx_foundry_stack_tool_id ON public.foundry_stack USING btree (tool_id);

CREATE INDEX idx_messages_parent ON public.messages USING btree (parent_message_id) WHERE (parent_message_id IS NOT NULL);

CREATE INDEX idx_pinned_conversation ON public.pinned_messages USING btree (conversation_id);

CREATE INDEX idx_profiles_availability_type ON public.profiles USING btree (availability_type) WHERE (availability_type IS NOT NULL);

CREATE INDEX idx_profiles_executive_onboarding_incomplete ON public.profiles USING btree (id) WHERE ((role = 'Executive'::public.member_role) AND ((executive_onboarding_completed IS NULL) OR (executive_onboarding_completed = false)));

CREATE INDEX idx_profiles_expertise_areas ON public.profiles USING gin (expertise_areas);

CREATE INDEX idx_profiles_industries ON public.profiles USING gin (industries);

CREATE INDEX idx_profiles_looking_for ON public.profiles USING gin (looking_for);

CREATE INDEX idx_profiles_paired_ai_id ON public.profiles USING btree (paired_ai_id);

CREATE INDEX idx_reactions_message ON public.message_reactions USING btree (message_id);

CREATE INDEX idx_reactions_user ON public.message_reactions USING btree (user_id);

CREATE INDEX idx_reminders_pending ON public.user_reminders USING btree (user_id, remind_at) WHERE (completed_at IS NULL);

CREATE INDEX idx_stars_user ON public.message_stars USING btree (user_id);

CREATE UNIQUE INDEX manufacturing_rfqs_pkey ON public.manufacturing_rfqs USING btree (id);

CREATE UNIQUE INDEX message_reactions_message_id_user_id_emoji_key ON public.message_reactions USING btree (message_id, user_id, emoji);

CREATE UNIQUE INDEX message_reactions_pkey ON public.message_reactions USING btree (id);

CREATE UNIQUE INDEX message_stars_message_id_user_id_key ON public.message_stars USING btree (message_id, user_id);

CREATE UNIQUE INDEX message_stars_pkey ON public.message_stars USING btree (id);

CREATE UNIQUE INDEX messaging_links_platform_profile_id_key ON public.messaging_links USING btree (platform, profile_id);

CREATE UNIQUE INDEX pinned_messages_message_id_conversation_id_key ON public.pinned_messages USING btree (message_id, conversation_id);

CREATE UNIQUE INDEX pinned_messages_pkey ON public.pinned_messages USING btree (id);

CREATE UNIQUE INDEX user_reminders_pkey ON public.user_reminders USING btree (id);

alter table "public"."ai_tools" add constraint "ai_tools_pkey" PRIMARY KEY using index "ai_tools_pkey";

alter table "public"."custom_slash_commands" add constraint "custom_slash_commands_pkey" PRIMARY KEY using index "custom_slash_commands_pkey";

alter table "public"."manufacturing_rfqs" add constraint "manufacturing_rfqs_pkey" PRIMARY KEY using index "manufacturing_rfqs_pkey";

alter table "public"."message_reactions" add constraint "message_reactions_pkey" PRIMARY KEY using index "message_reactions_pkey";

alter table "public"."message_stars" add constraint "message_stars_pkey" PRIMARY KEY using index "message_stars_pkey";

alter table "public"."pinned_messages" add constraint "pinned_messages_pkey" PRIMARY KEY using index "pinned_messages_pkey";

alter table "public"."user_reminders" add constraint "user_reminders_pkey" PRIMARY KEY using index "user_reminders_pkey";

alter table "public"."custom_slash_commands" add constraint "custom_slash_commands_action_type_check" CHECK ((action_type = ANY (ARRAY['webhook'::text, 'create_task'::text, 'navigate'::text, 'message'::text]))) not valid;

alter table "public"."custom_slash_commands" validate constraint "custom_slash_commands_action_type_check";

alter table "public"."custom_slash_commands" add constraint "custom_slash_commands_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."custom_slash_commands" validate constraint "custom_slash_commands_created_by_fkey";

alter table "public"."custom_slash_commands" add constraint "custom_slash_commands_foundry_id_fkey" FOREIGN KEY (foundry_id) REFERENCES public.foundries(id) ON DELETE CASCADE not valid;

alter table "public"."custom_slash_commands" validate constraint "custom_slash_commands_foundry_id_fkey";

alter table "public"."custom_slash_commands" add constraint "custom_slash_commands_foundry_id_name_key" UNIQUE using index "custom_slash_commands_foundry_id_name_key";

alter table "public"."foundry_stack" add constraint "foundry_stack_item_type_check" CHECK ((((provider_id IS NOT NULL) AND (tool_id IS NULL)) OR ((provider_id IS NULL) AND (tool_id IS NOT NULL)))) not valid;

alter table "public"."foundry_stack" validate constraint "foundry_stack_item_type_check";

alter table "public"."foundry_stack" add constraint "foundry_stack_tool_id_fkey" FOREIGN KEY (tool_id) REFERENCES public.ai_tools(id) not valid;

alter table "public"."foundry_stack" validate constraint "foundry_stack_tool_id_fkey";

alter table "public"."manufacturing_rfqs" add constraint "manufacturing_rfqs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."manufacturing_rfqs" validate constraint "manufacturing_rfqs_created_by_fkey";

alter table "public"."message_reactions" add constraint "message_reactions_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."message_reactions" validate constraint "message_reactions_message_id_fkey";

alter table "public"."message_reactions" add constraint "message_reactions_message_id_user_id_emoji_key" UNIQUE using index "message_reactions_message_id_user_id_emoji_key";

alter table "public"."message_reactions" add constraint "message_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."message_reactions" validate constraint "message_reactions_user_id_fkey";

alter table "public"."message_stars" add constraint "message_stars_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."message_stars" validate constraint "message_stars_message_id_fkey";

alter table "public"."message_stars" add constraint "message_stars_message_id_user_id_key" UNIQUE using index "message_stars_message_id_user_id_key";

alter table "public"."message_stars" add constraint "message_stars_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."message_stars" validate constraint "message_stars_user_id_fkey";

alter table "public"."messages" add constraint "messages_parent_message_id_fkey" FOREIGN KEY (parent_message_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_parent_message_id_fkey";

alter table "public"."messaging_links" add constraint "messaging_links_platform_profile_id_key" UNIQUE using index "messaging_links_platform_profile_id_key";

alter table "public"."pinned_messages" add constraint "pinned_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."pinned_messages" validate constraint "pinned_messages_conversation_id_fkey";

alter table "public"."pinned_messages" add constraint "pinned_messages_message_id_conversation_id_key" UNIQUE using index "pinned_messages_message_id_conversation_id_key";

alter table "public"."pinned_messages" add constraint "pinned_messages_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."pinned_messages" validate constraint "pinned_messages_message_id_fkey";

alter table "public"."pinned_messages" add constraint "pinned_messages_pinned_by_fkey" FOREIGN KEY (pinned_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."pinned_messages" validate constraint "pinned_messages_pinned_by_fkey";

alter table "public"."profiles" add constraint "profiles_paired_ai_id_fkey" FOREIGN KEY (paired_ai_id) REFERENCES public.profiles(id) not valid;

alter table "public"."profiles" validate constraint "profiles_paired_ai_id_fkey";

alter table "public"."tasks" add constraint "tasks_progress_check" CHECK (((progress IS NULL) OR ((progress >= 0) AND (progress <= 100)))) not valid;

alter table "public"."tasks" validate constraint "tasks_progress_check";

alter table "public"."user_reminders" add constraint "user_reminders_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL not valid;

alter table "public"."user_reminders" validate constraint "user_reminders_conversation_id_fkey";

alter table "public"."user_reminders" add constraint "user_reminders_foundry_id_fkey" FOREIGN KEY (foundry_id) REFERENCES public.foundries(id) ON DELETE CASCADE not valid;

alter table "public"."user_reminders" validate constraint "user_reminders_foundry_id_fkey";

alter table "public"."user_reminders" add constraint "user_reminders_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."user_reminders" validate constraint "user_reminders_message_id_fkey";

alter table "public"."user_reminders" add constraint "user_reminders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_reminders" validate constraint "user_reminders_user_id_fkey";

alter table "public"."foundries" add constraint "foundries_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."foundries" validate constraint "foundries_owner_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_escrow_balance_atomic(p_order_id uuid)
 RETURNS TABLE(total_held numeric, total_released numeric, available_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
      RETURN QUERY
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0) as total_held,
        COALESCE(SUM(CASE WHEN type IN ('release', 'fee_deduction', 'refund') THEN amount ELSE 0 END), 0) as total_released,
        COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN type IN ('release', 'fee_deduction', 'refund') THEN amount ELSE 0 END), 0) as available_balance
      FROM escrow_transactions
      WHERE order_id = p_order_id
      FOR UPDATE;
    END;
    $function$
;

CREATE OR REPLACE FUNCTION public.notify_task_forwarded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_forwarder_name TEXT;
    v_forwarding_entry JSONB;
BEGIN
    -- Check if task was forwarded (assignee changed and forwarding_history was updated)
    IF NEW.assignee_id IS NOT NULL 
       AND OLD.assignee_id IS NOT NULL 
       AND NEW.assignee_id != OLD.assignee_id 
       AND NEW.forwarding_history IS NOT NULL 
       AND jsonb_array_length(NEW.forwarding_history) > COALESCE(jsonb_array_length(OLD.forwarding_history), 0) THEN
        
        -- Get the latest forwarding entry
        v_forwarding_entry := NEW.forwarding_history->-1;
        
        -- Get name of person who forwarded it
        SELECT COALESCE(full_name, 'Someone') INTO v_forwarder_name 
        FROM profiles 
        WHERE id = OLD.assignee_id;
        
        PERFORM create_notification(
            NEW.assignee_id,
            'task_assigned',
            v_forwarder_name || ' forwarded you: ' || COALESCE(NEW.title, 'A Task'),
            COALESCE(v_forwarding_entry->>'reason', 'Click to view task details'),
            '/tasks?taskId=' || NEW.id,
            jsonb_build_object(
                'task_id', NEW.id,
                'forwarder_id', OLD.assignee_id,
                'forwarder_name', v_forwarder_name,
                'reason', v_forwarding_entry->>'reason'
            )
        );
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_message_reply_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_message_id IS NOT NULL THEN
    UPDATE messages 
    SET reply_count = reply_count + 1,
        last_reply_at = NEW.created_at
    WHERE id = NEW.parent_message_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_message_id IS NOT NULL THEN
    UPDATE messages 
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.parent_message_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

create materialized view "public"."buyer_stats" as  SELECT p.id AS buyer_id,
    count(o.id) AS total_orders,
    count(o.id) FILTER (WHERE (o.status = 'completed'::public.order_status)) AS completed_orders,
    COALESCE(sum(o.total_amount), (0)::numeric) AS total_spend,
    COALESCE(avg(o.total_amount), (0)::numeric) AS average_order_value,
    COALESCE(sum(
        CASE
            WHEN (pp.centaur_discount_percent > (0)::numeric) THEN (o.total_amount * (pp.centaur_discount_percent / 100.0))
            ELSE (0)::numeric
        END), (0)::numeric) AS total_savings,
    count(DISTINCT o.seller_id) AS unique_providers,
    max(o.created_at) AS last_order_at,
    now() AS updated_at
   FROM ((public.profiles p
     LEFT JOIN public.orders o ON ((o.buyer_id = p.id)))
     LEFT JOIN public.provider_profiles pp ON ((pp.id = o.seller_id)))
  GROUP BY p.id;


create materialized view "public"."category_stats" as  SELECT ml.category,
    count(o.id) AS total_orders,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.status = 'completed'::public.order_status)), (0)::numeric) AS total_gmv,
    count(DISTINCT pp.id) AS provider_count,
    count(DISTINCT o.buyer_id) AS buyer_count,
    COALESCE(avg(pr.rating), (0)::numeric) AS average_rating,
    now() AS updated_at
   FROM (((public.marketplace_listings ml
     LEFT JOIN public.provider_profiles pp ON ((pp.listing_id = ml.id)))
     LEFT JOIN public.orders o ON ((o.seller_id = pp.id)))
     LEFT JOIN public.reviews pr ON ((pr.reviewee_id = pp.id)))
  GROUP BY ml.category;


CREATE OR REPLACE FUNCTION public.notify_task_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_assigner_name TEXT;
BEGIN
    -- Only notify if there's an assignee and it's a new assignment
    IF NEW.assignee_id IS NOT NULL AND (OLD IS NULL OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
        -- Get the name of who assigned the task (the creator)
        SELECT COALESCE(full_name, 'Someone') INTO v_assigner_name 
        FROM profiles 
        WHERE id = NEW.creator_id;
        
        PERFORM create_notification(
            NEW.assignee_id,
            'task_assigned',
            v_assigner_name || ' assigned you: ' || COALESCE(NEW.title, 'New Task'),
            'Click to view task details and take action',
            '/tasks?taskId=' || NEW.id,
            jsonb_build_object(
                'task_id', NEW.id,
                'assigner_id', NEW.creator_id,
                'assigner_name', v_assigner_name
            )
        );
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_task_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_completer_name TEXT;
BEGIN
    -- Notify creator when task is completed
    IF NEW.status = 'Completed' AND (OLD IS NULL OR OLD.status != 'Completed') THEN
        IF NEW.creator_id IS NOT NULL AND NEW.creator_id != NEW.assignee_id THEN
            -- Get the name of who completed the task
            SELECT COALESCE(full_name, 'Someone') INTO v_completer_name 
            FROM profiles 
            WHERE id = NEW.assignee_id;
            
            PERFORM create_notification(
                NEW.creator_id,
                'task_completed',
                v_completer_name || ' completed: ' || COALESCE(NEW.title, 'A Task'),
                'Click to review the completed work',
                '/tasks?taskId=' || NEW.id,
                jsonb_build_object(
                    'task_id', NEW.id,
                    'completer_id', NEW.assignee_id,
                    'completer_name', v_completer_name
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

create materialized view "public"."platform_daily_stats" as  SELECT d.stat_date,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.status = 'completed'::public.order_status)), (0)::numeric) AS total_gmv,
    COALESCE(sum(o.platform_fee) FILTER (WHERE (o.status = 'completed'::public.order_status)), (0)::numeric) AS total_fees,
    count(o.id) AS total_orders,
    count(o.id) FILTER (WHERE (o.status = 'completed'::public.order_status)) AS completed_orders,
    count(o.id) FILTER (WHERE (o.status = 'disputed'::public.order_status)) AS disputed_orders,
    ( SELECT count(*) AS count
           FROM public.profiles
          WHERE ((profiles.created_at)::date <= d.stat_date)) AS total_users,
    ( SELECT count(*) AS count
           FROM public.provider_profiles
          WHERE ((provider_profiles.created_at)::date <= d.stat_date)) AS total_providers,
    ( SELECT count(DISTINCT orders.buyer_id) AS count
           FROM public.orders
          WHERE ((orders.created_at)::date <= d.stat_date)) AS total_buyers,
    count(DISTINCT o.seller_id) AS active_providers,
    count(DISTINCT o.buyer_id) AS active_buyers,
    ( SELECT count(*) AS count
           FROM public.profiles
          WHERE ((profiles.created_at)::date = d.stat_date)) AS new_users,
    COALESCE(avg(o.total_amount), (0)::numeric) AS average_order_value,
        CASE
            WHEN (count(o.id) > 0) THEN round((((count(o.id) FILTER (WHERE (o.status = 'disputed'::public.order_status)))::numeric / (count(o.id))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS dispute_rate,
        CASE
            WHEN (count(o.id) FILTER (WHERE (o.status = ANY (ARRAY['completed'::public.order_status, 'cancelled'::public.order_status]))) > 0) THEN round((((count(o.id) FILTER (WHERE (o.status = 'completed'::public.order_status)))::numeric / (count(o.id) FILTER (WHERE (o.status = ANY (ARRAY['completed'::public.order_status, 'cancelled'::public.order_status]))))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS completion_rate,
    now() AS updated_at
   FROM (( SELECT (generate_series((CURRENT_DATE - '365 days'::interval), (CURRENT_DATE)::timestamp without time zone, '1 day'::interval))::date AS stat_date) d
     LEFT JOIN public.orders o ON (((o.created_at)::date = d.stat_date)))
  GROUP BY d.stat_date
  ORDER BY d.stat_date DESC;


create or replace view "public"."platform_monthly_stats" as  SELECT (date_trunc('month'::text, (stat_date)::timestamp with time zone))::date AS month,
    sum(total_gmv) AS total_gmv,
    sum(total_fees) AS total_fees,
    sum(total_orders) AS total_orders,
    sum(completed_orders) AS completed_orders,
    max(total_users) AS total_users,
    max(total_providers) AS total_providers,
    max(total_buyers) AS total_buyers,
    sum(new_users) AS new_users,
    avg(average_order_value) AS avg_order_value
   FROM public.platform_daily_stats
  GROUP BY (date_trunc('month'::text, (stat_date)::timestamp with time zone))
  ORDER BY ((date_trunc('month'::text, (stat_date)::timestamp with time zone))::date) DESC;


create materialized view "public"."supplier_search_ranking" as  SELECT ml.id AS listing_id,
    pp.id AS provider_id,
    ml.title,
    ml.description,
    ml.category,
    ml.subcategory,
    ml.attributes,
    ml.image_url,
    ml.is_verified,
    ml.created_at AS listing_created_at,
    ml.search_vector,
    pp.tier,
    pp.is_active,
    pp.day_rate,
    pp.currency,
    pp.response_rate,
    pp.avg_response_time_hours,
    pp.completion_rate,
    pp.centaur_discount_percent,
    pp.created_at AS provider_created_at,
        CASE pp.tier
            WHEN 'verified_partner'::public.supplier_tier THEN 1.0
            WHEN 'approved'::public.supplier_tier THEN 0.7
            WHEN 'pending'::public.supplier_tier THEN 0.4
            ELSE 0.0
        END AS tier_score,
    COALESCE(( SELECT (avg(reviews.rating))::numeric(3,2) AS avg
           FROM public.reviews
          WHERE (reviews.reviewee_id = pp.id)), (0)::numeric) AS avg_rating,
    COALESCE(( SELECT count(*) AS count
           FROM public.reviews
          WHERE (reviews.reviewee_id = pp.id)), (0)::bigint) AS total_reviews,
    COALESCE(( SELECT count(*) AS count
           FROM public.orders
          WHERE ((orders.seller_id = pp.id) AND (orders.status = 'completed'::public.order_status))), (0)::bigint) AS total_orders
   FROM (public.marketplace_listings ml
     LEFT JOIN public.provider_profiles pp ON ((ml.id = pp.listing_id)))
  WHERE ((ml.is_verified = true) OR (pp.is_active = true));


CREATE OR REPLACE FUNCTION public.trigger_ghost_worker()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    declare
      is_ai boolean;
      project_url text := 'https://jyarhvinengfyrwgtskq.supabase.co/functions/v1/ghost-worker'; 
      service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YXJodmluZW5nZnlyd2d0c2txIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQzMzU2NCwiZXhwIjoyMDg1MDA5NTY0fQ.A4FN045WPv9yTe8EIe--lGyrFT-bF5W1y24gA4dyj1A';
    begin
      select (role = 'AI_Agent') into is_ai from public.profiles where id = NEW.assignee_id;
      
      if is_ai then
        perform net.http_post(
            url := project_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
            body := jsonb_build_object('record', row_to_json(NEW), 'type', TG_OP)
        );
      end if;
      return NEW;
    end;
    $function$
;

grant delete on table "public"."ai_tools" to "anon";

grant insert on table "public"."ai_tools" to "anon";

grant references on table "public"."ai_tools" to "anon";

grant select on table "public"."ai_tools" to "anon";

grant trigger on table "public"."ai_tools" to "anon";

grant truncate on table "public"."ai_tools" to "anon";

grant update on table "public"."ai_tools" to "anon";

grant delete on table "public"."ai_tools" to "authenticated";

grant insert on table "public"."ai_tools" to "authenticated";

grant references on table "public"."ai_tools" to "authenticated";

grant select on table "public"."ai_tools" to "authenticated";

grant trigger on table "public"."ai_tools" to "authenticated";

grant truncate on table "public"."ai_tools" to "authenticated";

grant update on table "public"."ai_tools" to "authenticated";

grant delete on table "public"."ai_tools" to "service_role";

grant insert on table "public"."ai_tools" to "service_role";

grant references on table "public"."ai_tools" to "service_role";

grant select on table "public"."ai_tools" to "service_role";

grant trigger on table "public"."ai_tools" to "service_role";

grant truncate on table "public"."ai_tools" to "service_role";

grant update on table "public"."ai_tools" to "service_role";

grant delete on table "public"."custom_slash_commands" to "anon";

grant insert on table "public"."custom_slash_commands" to "anon";

grant references on table "public"."custom_slash_commands" to "anon";

grant select on table "public"."custom_slash_commands" to "anon";

grant trigger on table "public"."custom_slash_commands" to "anon";

grant truncate on table "public"."custom_slash_commands" to "anon";

grant update on table "public"."custom_slash_commands" to "anon";

grant delete on table "public"."custom_slash_commands" to "authenticated";

grant insert on table "public"."custom_slash_commands" to "authenticated";

grant references on table "public"."custom_slash_commands" to "authenticated";

grant select on table "public"."custom_slash_commands" to "authenticated";

grant trigger on table "public"."custom_slash_commands" to "authenticated";

grant truncate on table "public"."custom_slash_commands" to "authenticated";

grant update on table "public"."custom_slash_commands" to "authenticated";

grant delete on table "public"."custom_slash_commands" to "service_role";

grant insert on table "public"."custom_slash_commands" to "service_role";

grant references on table "public"."custom_slash_commands" to "service_role";

grant select on table "public"."custom_slash_commands" to "service_role";

grant trigger on table "public"."custom_slash_commands" to "service_role";

grant truncate on table "public"."custom_slash_commands" to "service_role";

grant update on table "public"."custom_slash_commands" to "service_role";

grant delete on table "public"."manufacturing_rfqs" to "anon";

grant insert on table "public"."manufacturing_rfqs" to "anon";

grant references on table "public"."manufacturing_rfqs" to "anon";

grant select on table "public"."manufacturing_rfqs" to "anon";

grant trigger on table "public"."manufacturing_rfqs" to "anon";

grant truncate on table "public"."manufacturing_rfqs" to "anon";

grant update on table "public"."manufacturing_rfqs" to "anon";

grant delete on table "public"."manufacturing_rfqs" to "authenticated";

grant insert on table "public"."manufacturing_rfqs" to "authenticated";

grant references on table "public"."manufacturing_rfqs" to "authenticated";

grant select on table "public"."manufacturing_rfqs" to "authenticated";

grant trigger on table "public"."manufacturing_rfqs" to "authenticated";

grant truncate on table "public"."manufacturing_rfqs" to "authenticated";

grant update on table "public"."manufacturing_rfqs" to "authenticated";

grant delete on table "public"."manufacturing_rfqs" to "service_role";

grant insert on table "public"."manufacturing_rfqs" to "service_role";

grant references on table "public"."manufacturing_rfqs" to "service_role";

grant select on table "public"."manufacturing_rfqs" to "service_role";

grant trigger on table "public"."manufacturing_rfqs" to "service_role";

grant truncate on table "public"."manufacturing_rfqs" to "service_role";

grant update on table "public"."manufacturing_rfqs" to "service_role";

grant delete on table "public"."message_reactions" to "anon";

grant insert on table "public"."message_reactions" to "anon";

grant references on table "public"."message_reactions" to "anon";

grant select on table "public"."message_reactions" to "anon";

grant trigger on table "public"."message_reactions" to "anon";

grant truncate on table "public"."message_reactions" to "anon";

grant update on table "public"."message_reactions" to "anon";

grant delete on table "public"."message_reactions" to "authenticated";

grant insert on table "public"."message_reactions" to "authenticated";

grant references on table "public"."message_reactions" to "authenticated";

grant select on table "public"."message_reactions" to "authenticated";

grant trigger on table "public"."message_reactions" to "authenticated";

grant truncate on table "public"."message_reactions" to "authenticated";

grant update on table "public"."message_reactions" to "authenticated";

grant delete on table "public"."message_reactions" to "service_role";

grant insert on table "public"."message_reactions" to "service_role";

grant references on table "public"."message_reactions" to "service_role";

grant select on table "public"."message_reactions" to "service_role";

grant trigger on table "public"."message_reactions" to "service_role";

grant truncate on table "public"."message_reactions" to "service_role";

grant update on table "public"."message_reactions" to "service_role";

grant delete on table "public"."message_stars" to "anon";

grant insert on table "public"."message_stars" to "anon";

grant references on table "public"."message_stars" to "anon";

grant select on table "public"."message_stars" to "anon";

grant trigger on table "public"."message_stars" to "anon";

grant truncate on table "public"."message_stars" to "anon";

grant update on table "public"."message_stars" to "anon";

grant delete on table "public"."message_stars" to "authenticated";

grant insert on table "public"."message_stars" to "authenticated";

grant references on table "public"."message_stars" to "authenticated";

grant select on table "public"."message_stars" to "authenticated";

grant trigger on table "public"."message_stars" to "authenticated";

grant truncate on table "public"."message_stars" to "authenticated";

grant update on table "public"."message_stars" to "authenticated";

grant delete on table "public"."message_stars" to "service_role";

grant insert on table "public"."message_stars" to "service_role";

grant references on table "public"."message_stars" to "service_role";

grant select on table "public"."message_stars" to "service_role";

grant trigger on table "public"."message_stars" to "service_role";

grant truncate on table "public"."message_stars" to "service_role";

grant update on table "public"."message_stars" to "service_role";

grant delete on table "public"."pinned_messages" to "anon";

grant insert on table "public"."pinned_messages" to "anon";

grant references on table "public"."pinned_messages" to "anon";

grant select on table "public"."pinned_messages" to "anon";

grant trigger on table "public"."pinned_messages" to "anon";

grant truncate on table "public"."pinned_messages" to "anon";

grant update on table "public"."pinned_messages" to "anon";

grant delete on table "public"."pinned_messages" to "authenticated";

grant insert on table "public"."pinned_messages" to "authenticated";

grant references on table "public"."pinned_messages" to "authenticated";

grant select on table "public"."pinned_messages" to "authenticated";

grant trigger on table "public"."pinned_messages" to "authenticated";

grant truncate on table "public"."pinned_messages" to "authenticated";

grant update on table "public"."pinned_messages" to "authenticated";

grant delete on table "public"."pinned_messages" to "service_role";

grant insert on table "public"."pinned_messages" to "service_role";

grant references on table "public"."pinned_messages" to "service_role";

grant select on table "public"."pinned_messages" to "service_role";

grant trigger on table "public"."pinned_messages" to "service_role";

grant truncate on table "public"."pinned_messages" to "service_role";

grant update on table "public"."pinned_messages" to "service_role";

grant delete on table "public"."user_reminders" to "anon";

grant insert on table "public"."user_reminders" to "anon";

grant references on table "public"."user_reminders" to "anon";

grant select on table "public"."user_reminders" to "anon";

grant trigger on table "public"."user_reminders" to "anon";

grant truncate on table "public"."user_reminders" to "anon";

grant update on table "public"."user_reminders" to "anon";

grant delete on table "public"."user_reminders" to "authenticated";

grant insert on table "public"."user_reminders" to "authenticated";

grant references on table "public"."user_reminders" to "authenticated";

grant select on table "public"."user_reminders" to "authenticated";

grant trigger on table "public"."user_reminders" to "authenticated";

grant truncate on table "public"."user_reminders" to "authenticated";

grant update on table "public"."user_reminders" to "authenticated";

grant delete on table "public"."user_reminders" to "service_role";

grant insert on table "public"."user_reminders" to "service_role";

grant references on table "public"."user_reminders" to "service_role";

grant select on table "public"."user_reminders" to "service_role";

grant trigger on table "public"."user_reminders" to "service_role";

grant truncate on table "public"."user_reminders" to "service_role";

grant update on table "public"."user_reminders" to "service_role";


  create policy "Global Read for AI Tools"
  on "public"."ai_tools"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Admins can manage commands in their foundry"
  on "public"."custom_slash_commands"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.foundry_id = custom_slash_commands.foundry_id) AND (p.role = 'Executive'::public.member_role)))));



  create policy "Users can view commands in their foundry"
  on "public"."custom_slash_commands"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.foundry_id = custom_slash_commands.foundry_id)))));



  create policy "Users can view their foundry"
  on "public"."foundries"
  as permissive
  for select
  to public
using (true);



  create policy "Users can create RFQs"
  on "public"."manufacturing_rfqs"
  as permissive
  for insert
  to public
with check ((foundry_id = public.get_my_foundry_id()));



  create policy "Users can delete RFQs in their foundry"
  on "public"."manufacturing_rfqs"
  as permissive
  for delete
  to public
using ((foundry_id = public.get_my_foundry_id()));



  create policy "Users can update RFQs in their foundry"
  on "public"."manufacturing_rfqs"
  as permissive
  for update
  to public
using ((foundry_id = public.get_my_foundry_id()))
with check ((foundry_id = public.get_my_foundry_id()));



  create policy "Users can view own RFQs"
  on "public"."manufacturing_rfqs"
  as permissive
  for select
  to public
using ((foundry_id = public.get_my_foundry_id()));



  create policy "Users can add their own reactions"
  on "public"."message_reactions"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can remove their own reactions"
  on "public"."message_reactions"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can view reactions in conversations they participate in"
  on "public"."message_reactions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cp.profile_id = auth.uid())))));



  create policy "Users can star messages in their conversations"
  on "public"."message_stars"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_stars.message_id) AND (cp.profile_id = auth.uid()))))));



  create policy "Users can unstar their own stars"
  on "public"."message_stars"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own stars"
  on "public"."message_stars"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can pin messages in their conversations"
  on "public"."pinned_messages"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.conversation_id = pinned_messages.conversation_id) AND (cp.profile_id = auth.uid())))));



  create policy "Users can unpin messages they pinned or any admin"
  on "public"."pinned_messages"
  as permissive
  for delete
  to public
using (((pinned_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'Executive'::public.member_role))))));



  create policy "Users can view pins in conversations they participate in"
  on "public"."pinned_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE ((cp.conversation_id = pinned_messages.conversation_id) AND (cp.profile_id = auth.uid())))));



  create policy "Users can insert profiles"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Users can view own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "Everyone can view providers"
  on "public"."service_providers"
  as permissive
  for select
  to public
using (true);



  create policy "Users can create their own reminders"
  on "public"."user_reminders"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can delete their own reminders"
  on "public"."user_reminders"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update their own reminders"
  on "public"."user_reminders"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own reminders"
  on "public"."user_reminders"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "admin_view_audit_log"
  on "public"."admin_audit_log"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE (admin_users.user_id = auth.uid()))));



  create policy "admin_view_fraud_signals"
  on "public"."fraud_signals"
  as permissive
  for select
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE (admin_users.user_id = auth.uid())))));



  create policy "admin_view_metrics"
  on "public"."platform_metrics"
  as permissive
  for select
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.admin_users
  WHERE (admin_users.user_id = auth.uid())))));


CREATE TRIGGER trigger_update_reply_count AFTER INSERT OR DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_message_reply_count();

CREATE TRIGGER trigger_notify_task_forwarded AFTER UPDATE OF assignee_id ON public.tasks FOR EACH ROW WHEN (((old.assignee_id IS NOT NULL) AND (new.forwarding_history IS NOT NULL))) EXECUTE FUNCTION public.notify_task_forwarded();


  create policy "Allow authenticated uploads 164dduw_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'task-attachments'::text));



