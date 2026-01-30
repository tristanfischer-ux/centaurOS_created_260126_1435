# Common Vercel Errors and Solutions

## Build Errors

### Error: Module not found

```
Module not found: Can't resolve '@/components/...'
```

**Causes:**
- Path alias not configured
- File doesn't exist
- Case sensitivity issue (Linux is case-sensitive)

**Solutions:**
1. Check `tsconfig.json` has correct paths:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```
2. Verify file exists at exact path
3. Check for case mismatches: `Button.tsx` vs `button.tsx`

### Error: Type errors

```
Type error: Property 'x' does not exist on type 'Y'
```

**Solutions:**
1. Run `npx tsc --noEmit` locally to see all errors
2. Fix each type error
3. Common fixes:
   - Add missing properties to interfaces
   - Use optional chaining: `obj?.property`
   - Add type assertions: `value as Type`
   - Update type definitions

### Error: ESLint errors

```
ESLint: error  'x' is defined but never used
```

**Solutions:**
1. Run `npm run lint` locally
2. Fix or disable specific rules:
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   const unusedVar = 'needed for side effect';
   ```
3. Remove unused imports/variables

### Error: Invalid next.config.js

```
Invalid next.config.js options detected
```

**Solutions:**
1. Check `next.config.ts` syntax
2. Verify all options are valid for your Next.js version
3. Remove deprecated options

## Runtime Errors

### Error: 500 Internal Server Error

**Diagnosis:**
```bash
vercel logs [deployment-url] --follow
```

**Common causes:**
1. Missing environment variables
2. Database connection failed
3. API key invalid

**Solutions:**
1. Check all env vars are set in Vercel dashboard
2. Verify Supabase project is running
3. Regenerate API keys if needed

### Error: 404 on API routes

**Causes:**
- Route file not in correct location
- Export not named correctly

**Solutions:**
1. API routes must be in `app/api/` directory
2. Must export named HTTP methods:
   ```typescript
   export async function GET(request: Request) { }
   export async function POST(request: Request) { }
   ```

### Error: CORS issues

```
Access-Control-Allow-Origin header missing
```

**Solution in Next.js API route:**
```typescript
export async function GET(request: Request) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
```

### Error: Edge function timeout

```
Function execution timed out
```

**Causes:**
- Long-running database queries
- External API slow to respond
- Infinite loops

**Solutions:**
1. Optimize queries
2. Add timeouts to external calls
3. Move heavy processing to background jobs

## Environment Variable Errors

### Error: Missing environment variable

```
Error: Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL
```

**Solutions:**
1. Add to Vercel project settings
2. For `NEXT_PUBLIC_*` vars, redeploy after adding (they're baked into build)
3. Verify no typos in variable names

### Error: env var undefined at runtime

**Cause:** Server-only env vars accessed in client code

**Solution:**
- Use `NEXT_PUBLIC_` prefix for client-accessible vars
- Or fetch from API route

## Deployment-Specific Errors

### Error: Build cache issues

**Symptoms:** Old code deploying, changes not reflected

**Solution:**
```bash
# Force clean build
vercel --prod --force
```

Or in Vercel Dashboard: Settings → General → "Clear Build Cache"

### Error: Function size too large

```
The Serverless Function is too large
```

**Solutions:**
1. Move large dependencies to client-side
2. Use dynamic imports:
   ```typescript
   const HeavyComponent = dynamic(() => import('./Heavy'), { ssr: false });
   ```
3. Split into smaller functions

### Error: Memory exceeded

```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
```

**Solutions:**
1. Optimize imports (tree-shaking)
2. Remove unused dependencies
3. Increase memory limit in vercel.json:
   ```json
   {
     "functions": {
       "app/api/**/*.ts": {
         "memory": 1024
       }
     }
   }
   ```

## Database Connection Errors

### Error: Supabase connection refused

**Causes:**
- Wrong Supabase URL
- Project paused
- Network issues

**Solutions:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Check Supabase dashboard - unpause if needed
3. Verify project region matches expectations

### Error: RLS policy violation

```
new row violates row-level security policy
```

**Solution:**
- Check RLS policies in Supabase
- Ensure user has correct permissions
- Verify `foundry_id` is set correctly

## Quick Fixes

### Force a fresh deployment
```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

### Check deployment status
```bash
# If Vercel CLI installed
vercel ls --limit 5

# Check specific deployment
vercel inspect [deployment-url]
```

### View real-time logs
```bash
vercel logs [deployment-url] --follow
```

### Promote previous deployment (rollback)
```bash
vercel promote [previous-deployment-url]
```
