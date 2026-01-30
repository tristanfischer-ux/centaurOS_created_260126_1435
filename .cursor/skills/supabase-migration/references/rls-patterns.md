# RLS Policy Patterns for CentaurOS

CentaurOS uses Row Level Security (RLS) extensively for multi-tenant data isolation. This reference covers all RLS patterns used in the project.

## Core Concept: Foundry Isolation

All user data in CentaurOS is scoped to a `foundry_id`. This is the primary security boundary.

```sql
-- Get current user's foundry_id
(select (raw_user_meta_data->>'foundry_id')::uuid from auth.users where id = auth.uid())
```

## Standard CRUD Policies

### Basic Foundry-Scoped Table

```sql
-- Enable RLS
alter table public.my_table enable row level security;

-- SELECT: Users can view their foundry's data
create policy "select_own_foundry"
  on public.my_table for select
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

-- INSERT: Users can insert into their foundry
create policy "insert_own_foundry"
  on public.my_table for insert
  with check (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

-- UPDATE: Users can update their foundry's data
create policy "update_own_foundry"
  on public.my_table for update
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));

-- DELETE: Users can delete their foundry's data
create policy "delete_own_foundry"
  on public.my_table for delete
  using (foundry_id = (
    select (raw_user_meta_data->>'foundry_id')::uuid 
    from auth.users 
    where id = auth.uid()
  ));
```

## Role-Based Policies

### Admin-Only Operations

```sql
-- Only admins can perform this action
create policy "admin_only"
  on public.sensitive_table for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'admin'
      and foundry_id = sensitive_table.foundry_id
    )
  );
```

### Role Hierarchy (Admin > Manager > Member)

```sql
-- Managers and admins can update
create policy "manager_update"
  on public.team_settings for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('admin', 'manager')
      and foundry_id = team_settings.foundry_id
    )
  );
```

## Owner-Based Policies

### Creator Can Edit

```sql
-- Only the creator can update their own records
create policy "owner_update"
  on public.user_content for update
  using (
    user_id = auth.uid()
    and foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

### Assigned User Access

```sql
-- Users can view tasks assigned to them
create policy "assignee_select"
  on public.tasks for select
  using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

## Public Data Patterns

### Marketplace Public Listings

```sql
-- Anyone can view published marketplace listings
create policy "public_select"
  on public.marketplace_listings for select
  using (
    status = 'published'
    or foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

### Read-Only Public Data

```sql
-- Lookup tables readable by all authenticated users
create policy "authenticated_read"
  on public.categories for select
  to authenticated
  using (true);
```

## Cross-Foundry Patterns

### Marketplace Orders (Buyer + Seller)

```sql
-- Both buyer and seller foundries can view the order
create policy "order_select"
  on public.orders for select
  using (
    buyer_foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
    or seller_foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

### Shared Resources

```sql
-- Resources shared between multiple foundries
create policy "shared_select"
  on public.shared_documents for select
  using (
    owner_foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
    or id in (
      select document_id from public.document_shares
      where shared_with_foundry_id = (
        select (raw_user_meta_data->>'foundry_id')::uuid 
        from auth.users 
        where id = auth.uid()
      )
    )
  );
```

## Time-Based Policies

### Expire After Date

```sql
-- Only allow access to non-expired records
create policy "active_only"
  on public.invitations for select
  using (
    expires_at > now()
    and foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

## Service Role Bypass

For server-side operations that need to bypass RLS:

```typescript
// Use service role client
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// This bypasses all RLS policies
const { data } = await supabaseAdmin
  .from('any_table')
  .select('*');
```

**Warning:** Never expose service role key to client-side code.

## Debugging RLS

### Check Current User Context

```sql
-- In SQL Editor with authenticated session
select 
  auth.uid() as user_id,
  auth.jwt() as jwt_claims,
  (select raw_user_meta_data from auth.users where id = auth.uid()) as user_meta;
```

### List All Policies on Table

```sql
select 
  policyname,
  cmd,
  qual as using_expression,
  with_check as check_expression
from pg_policies 
where tablename = 'your_table_name';
```

### Test Policy as User

```sql
-- Temporarily become a user (testing only)
set request.jwt.claims.sub = 'user-uuid-here';
set request.jwt.claims.role = 'authenticated';

-- Now queries will use that user's RLS context
select * from public.my_table;
```

## Common Mistakes

### 1. Forgetting to Enable RLS

```sql
-- WRONG: Table has no RLS
create table public.my_table (...);

-- CORRECT: Always enable RLS
create table public.my_table (...);
alter table public.my_table enable row level security;
```

### 2. Missing foundry_id Check

```sql
-- WRONG: Only checks user_id
create policy "bad_policy"
  on public.my_table for select
  using (user_id = auth.uid());

-- CORRECT: Also check foundry_id
create policy "good_policy"
  on public.my_table for select
  using (
    user_id = auth.uid()
    and foundry_id = (select ...)
  );
```

### 3. Infinite Recursion

```sql
-- WRONG: Policy queries the same table
create policy "recursive_policy"
  on public.profiles for select
  using (
    role = (select role from public.profiles where id = auth.uid())
  );

-- CORRECT: Use auth.users or a different approach
create policy "safe_policy"
  on public.profiles for select
  using (
    foundry_id = (
      select (raw_user_meta_data->>'foundry_id')::uuid 
      from auth.users 
      where id = auth.uid()
    )
  );
```

### 4. Performance Issues

```sql
-- WRONG: Subquery runs for every row
create policy "slow_policy"
  on public.large_table for select
  using (
    category_id in (
      select id from categories where ...complex query...
    )
  );

-- CORRECT: Simplify or use security definer function
create policy "fast_policy"
  on public.large_table for select
  using (
    foundry_id = (select ... simple lookup ...)
  );
```

## Quick Reference

| Pattern | Use Case |
|---------|----------|
| `foundry_id = ...` | Standard multi-tenant isolation |
| `user_id = auth.uid()` | Owner-only access |
| `role in ('admin', 'manager')` | Role-based access |
| `status = 'published'` | Public content |
| `expires_at > now()` | Time-limited access |
| Service role client | Server-side bypass |
