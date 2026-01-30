# Common Errors in CentaurOS

Quick reference for frequently encountered errors and their solutions.

## React/Next.js Errors

### Hydration Mismatch

```
Error: Hydration failed because the initial UI does not match what was rendered on the server.
```

**Causes:**
- Date/time rendering
- Random values
- Browser-specific code in SSR
- Extensions modifying DOM

**Solutions:**
```typescript
// 1. Use suppressHydrationWarning for dates
<time dateTime={date} suppressHydrationWarning>
  {formatDate(date)}
</time>

// 2. Use client-only rendering
'use client';
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;

// 3. Use dynamic import with ssr: false
const ClientComponent = dynamic(() => import('./Client'), { ssr: false });
```

### "Cannot update a component while rendering"

```
Warning: Cannot update a component while rendering a different component
```

**Cause:** Calling setState during render

**Solution:**
```typescript
// WRONG
function Component() {
  const data = fetchData();
  setData(data); // During render!
  return <div>{data}</div>;
}

// CORRECT
function Component() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData().then(setData);
  }, []);
  return <div>{data}</div>;
}
```

### "Objects are not valid as a React child"

**Cause:** Rendering an object directly

**Solution:**
```typescript
// WRONG
return <div>{user}</div>;

// CORRECT
return <div>{user.name}</div>;
// Or
return <div>{JSON.stringify(user)}</div>;
```

## TypeScript Errors

### "Property does not exist on type"

```
Property 'name' does not exist on type 'unknown'
```

**Solutions:**
```typescript
// 1. Type assertion
const name = (data as User).name;

// 2. Type guard
if ('name' in data) {
  const name = data.name;
}

// 3. Update type definition
interface Data {
  name: string;  // Add missing property
}
```

### "Argument of type 'X' is not assignable to parameter of type 'Y'"

**Solutions:**
```typescript
// 1. Fix the type at source
const value: CorrectType = getValue();

// 2. Type assertion (use sparingly)
const value = getValue() as CorrectType;

// 3. Update function signature
function process(value: X | Y) { }
```

### "Type 'null' is not assignable to type 'X'"

**Solutions:**
```typescript
// 1. Make type nullable
let value: string | null = null;

// 2. Provide default
const value = getValue() ?? 'default';

// 3. Add null check
if (value !== null) {
  process(value);
}
```

## Supabase Errors

### "new row violates row-level security policy"

```
PostgrestError: new row violates row-level security policy for table
```

**Causes:**
- Missing foundry_id
- Wrong foundry_id
- No INSERT policy

**Solutions:**
```typescript
// 1. Include foundry_id
const { error } = await supabase.from('table').insert({
  ...data,
  foundry_id: user.user_metadata.foundry_id, // Required!
});

// 2. Check policies
// Run in SQL Editor:
// SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

### "JSON object requested, multiple (or no) rows returned"

```
PostgrestError: JSON object requested, multiple (or no) rows returned
```

**Cause:** `.single()` used but query returned 0 or 2+ rows

**Solutions:**
```typescript
// 1. Handle no results
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('id', id)
  .single();

if (error?.code === 'PGRST116') {
  return null; // Not found
}

// 2. Use .maybeSingle() instead
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('id', id)
  .maybeSingle(); // Returns null instead of error
```

### "relation does not exist"

```
PostgrestError: relation "public.table_name" does not exist
```

**Cause:** Table not created or wrong name

**Solutions:**
1. Run pending migrations: `npx supabase db push`
2. Check table name spelling (case-sensitive)
3. Check schema (public vs other)

### Connection refused / Network error

**Causes:**
- Supabase project paused
- Wrong URL
- Network issues

**Solutions:**
1. Check Supabase dashboard - unpause if needed
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Check network connectivity

## Server Action Errors

### "Server Actions must be async functions"

**Solution:**
```typescript
'use server';

// WRONG
export function myAction() { }

// CORRECT
export async function myAction() { }
```

### "Cannot use Server Actions with useEffect"

**Cause:** Calling server action in useEffect

**Solution:**
```typescript
// WRONG
useEffect(() => {
  serverAction(); // Error!
}, []);

// CORRECT - use fetch or create API route
useEffect(() => {
  fetch('/api/endpoint').then(r => r.json());
}, []);

// Or use server action from event handler
const handleClick = async () => {
  await serverAction(); // OK in event handlers
};
```

## Form Errors

### "A component is changing an uncontrolled input"

**Cause:** Switching between undefined and defined value

**Solution:**
```typescript
// WRONG
const [value, setValue] = useState(); // undefined initially

// CORRECT
const [value, setValue] = useState(''); // Empty string initially
```

### Form not submitting

**Causes:**
- Button type not set
- Form action not working

**Solutions:**
```typescript
// 1. Ensure button type is submit
<button type="submit">Submit</button>

// 2. Use form action correctly
<form action={serverAction}>
  <button type="submit">Submit</button>
</form>

// 3. Use onSubmit with preventDefault
<form onSubmit={async (e) => {
  e.preventDefault();
  await handleSubmit();
}}>
```

## Authentication Errors

### "Invalid JWT"

**Cause:** Token expired or malformed

**Solutions:**
1. Refresh the session
2. Re-login
3. Check for clock skew

### "User not authenticated"

```typescript
// Add authentication check
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  redirect('/login');
}
```

## Build Errors

### "Module not found"

```
Module not found: Can't resolve '@/components/...'
```

**Solutions:**
1. Check file exists at exact path
2. Check case sensitivity
3. Verify tsconfig.json paths:
   ```json
   {
     "compilerOptions": {
       "paths": { "@/*": ["./src/*"] }
     }
   }
   ```

### "Cannot find module" for dependencies

```
Cannot find module 'some-package'
```

**Solution:**
```bash
npm install some-package
# or
npm install
```

## Quick Fixes

| Error | Quick Fix |
|-------|-----------|
| Type mismatch | Add `as Type` assertion |
| Null reference | Add `?.` optional chaining |
| Missing foundry_id | Add from `user.user_metadata.foundry_id` |
| RLS violation | Check policies in Supabase |
| Hydration error | Wrap in `useEffect` or use `suppressHydrationWarning` |
| Module not found | Check path case sensitivity |
| Build fails | Run `npm run lint && npx tsc --noEmit` |
