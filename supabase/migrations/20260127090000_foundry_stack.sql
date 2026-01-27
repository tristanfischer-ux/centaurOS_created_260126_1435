-- Link Service Providers to a User's Foundry
CREATE TABLE IF NOT EXISTS "public"."foundry_stack" (
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "foundry_id" text NOT NULL, -- The tenant ID
    "provider_id" uuid NOT NULL REFERENCES "public"."service_providers"("id") ON DELETE CASCADE,
    "status" text DEFAULT 'Active', -- 'Active', 'Pending_Onboarding'
    "created_at" timestamptz DEFAULT now(),
    UNIQUE("foundry_id", "provider_id")
);

-- RLS
ALTER TABLE "public"."foundry_stack" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their stack" ON "public"."foundry_stack"
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can add to stack" ON "public"."foundry_stack"
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can remove from stack" ON "public"."foundry_stack"
    FOR DELETE USING (auth.role() = 'authenticated');
