/**
 * @file route-mapper.ts
 *
 * @description Maps git-changed files to the platform routes they affect.
 * Used by the verification script to determine which pages to smoke-test.
 *
 * Outputs a comma-separated list of routes to stdout, suitable for passing
 * to the Playwright smoke test via the SMOKE_ROUTES env var.
 *
 * @example
 *   # Map unstaged changes to routes
 *   npx tsx scripts/route-mapper.ts
 *
 *   # Map changes between HEAD and a specific ref
 *   npx tsx scripts/route-mapper.ts --ref main
 *
 *   # Pipe to smoke test
 *   SMOKE_ROUTES=$(npx tsx scripts/route-mapper.ts) npx playwright test e2e/smoke.spec.ts
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

/** Critical routes to always test when mapping is uncertain */
const CRITICAL_FALLBACK_ROUTES = [
  '/new-tasks',
  '/new-objectives',
  '/canvas',
  '/team',
  '/home',
  '/messages',
] as const

/** Regex to extract route from a platform page file path */
const PLATFORM_PAGE_REGEX =
  /^src\/app\/\(platform\)\/(.+?)\/page\.tsx$/

/** Regex to match non-page platform files (layouts, components colocated with pages) */
const PLATFORM_COLOCATED_REGEX =
  /^src\/app\/\(platform\)\/(.+?)\/(?!page\.tsx)[^/]+\.tsx$/

/**
 * Reads the component-route-map.json config file.
 *
 * @returns Record mapping file paths to arrays of routes
 */
function loadComponentRouteMap(): Record<string, string[]> {
  const mapPath = path.join(__dirname, 'component-route-map.json')
  try {
    const raw = readFileSync(mapPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, string[]>
    // Filter out the _comment key
    const { _comment, ...mapping } = parsed as Record<string, string[] | string>
    return mapping as Record<string, string[]>
  } catch (error) {
    console.error(
      '[RouteMapper] Warning: Could not load component-route-map.json:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return {}
  }
}

/**
 * Gets the list of changed files from git.
 *
 * @param ref - Optional git ref to diff against (defaults to unstaged + staged changes)
 * @returns Array of changed file paths relative to repo root
 */
function getChangedFiles(ref?: string): string[] {
  try {
    let output: string

    if (ref) {
      // Diff against a specific ref (e.g. main branch)
      output = execSync(`git diff --name-only ${ref}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } else {
      // Get both staged and unstaged changes
      const unstaged = execSync('git diff --name-only', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const staged = execSync('git diff --cached --name-only', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      output = `${unstaged}\n${staged}`
    }

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && (line.endsWith('.ts') || line.endsWith('.tsx') || line.endsWith('.json')))
  } catch {
    console.error('[RouteMapper] Warning: git diff failed, using fallback routes')
    return []
  }
}

/**
 * Extracts the platform route from a page.tsx file path.
 *
 * @param filePath - File path like "src/app/(platform)/new-tasks/page.tsx"
 * @returns Route like "/new-tasks" or null if not a page file
 */
function extractRouteFromPageFile(filePath: string): string | null {
  const match = filePath.match(PLATFORM_PAGE_REGEX)
  if (!match) return null

  // Convert file path segment to route
  // e.g. "the-forge/cad-lab" -> "/the-forge/cad-lab"
  const routePath = `/${match[1]}`

  // Replace [param] with a placeholder that smoke test can skip
  // Dynamic routes need special handling
  if (routePath.includes('[')) return null

  return routePath
}

/**
 * Extracts the route from a colocated platform file (not page.tsx but in the same dir).
 *
 * @param filePath - File path like "src/app/(platform)/objectives/create-objective-dialog.tsx"
 * @returns Route like "/objectives" or null
 */
function extractRouteFromColocatedFile(filePath: string): string | null {
  const match = filePath.match(PLATFORM_COLOCATED_REGEX)
  if (!match) return null

  const routePath = `/${match[1]}`
  if (routePath.includes('[')) return null

  return routePath
}

/**
 * Maps a single changed file to the routes it affects.
 *
 * @param filePath - Changed file path
 * @param componentMap - The component-to-route mapping config
 * @returns Array of affected routes
 */
function mapFileToRoutes(
  filePath: string,
  componentMap: Record<string, string[]>
): string[] {
  const routes: string[] = []

  // 1. Direct page file match
  const pageRoute = extractRouteFromPageFile(filePath)
  if (pageRoute) {
    routes.push(pageRoute)
    return routes
  }

  // 2. Colocated platform file match
  const colocatedRoute = extractRouteFromColocatedFile(filePath)
  if (colocatedRoute) {
    routes.push(colocatedRoute)
  }

  // 3. Check component-route-map for exact match
  if (componentMap[filePath]) {
    routes.push(...componentMap[filePath])
  }

  // 4. Check component-route-map for directory prefix match
  // e.g. "src/components/retainers/foo.tsx" matches "src/components/retainers"
  for (const [pattern, mappedRoutes] of Object.entries(componentMap)) {
    if (pattern !== filePath && filePath.startsWith(pattern + '/')) {
      routes.push(...mappedRoutes)
    }
  }

  return routes
}

/**
 * Main entry point. Maps git-changed files to platform routes.
 *
 * @description Reads git diff, maps each changed file to affected routes
 * using direct path extraction and the component-route-map.json config.
 * Falls back to critical routes if no specific mapping is found.
 */
function main(): void {
  // Parse --ref argument
  const refArgIndex = process.argv.indexOf('--ref')
  const ref = refArgIndex !== -1 ? process.argv[refArgIndex + 1] : undefined

  const changedFiles = getChangedFiles(ref)
  const componentMap = loadComponentRouteMap()

  if (changedFiles.length === 0) {
    console.error('[RouteMapper] No changed files detected, using critical fallback routes')
    process.stdout.write(CRITICAL_FALLBACK_ROUTES.join(','))
    return
  }

  console.error(`[RouteMapper] Found ${changedFiles.length} changed files`)

  const allRoutes = new Set<string>()

  for (const file of changedFiles) {
    const routes = mapFileToRoutes(file, componentMap)
    for (const route of routes) {
      allRoutes.add(route)
    }
  }

  if (allRoutes.size === 0) {
    console.error('[RouteMapper] No route mappings found, using critical fallback routes')
    process.stdout.write(CRITICAL_FALLBACK_ROUTES.join(','))
    return
  }

  console.error(`[RouteMapper] Mapped to ${allRoutes.size} routes:`)
  for (const route of allRoutes) {
    console.error(`  → ${route}`)
  }

  // Output comma-separated routes to stdout (stderr used for logs above)
  process.stdout.write([...allRoutes].join(','))
}

main()
