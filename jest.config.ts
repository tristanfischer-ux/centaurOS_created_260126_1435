import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Add any custom config to be passed to Jest
const config: Config = {
    coverageProvider: 'v8',
    testEnvironment: 'jsdom',
    // OOM fix (Tristan 2026-06-24): the heavy orchestrator suites (relevance-sweep,
    // bootstrap-tool-plan, …) import large module graphs and grew jest workers past the
    // default heap → "Jest worker encountered N child process exceptions" → 10 suites
    // failed-to-RUN (0 real test failures), spuriously blocking the pre-push/CI gate.
    // Restart a worker before it OOMs, and cap parallelism so peak memory stays bounded.
    workerIdleMemoryLimit: '768MB',
    maxWorkers: '50%',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        // Worktree / sibling-checkout safety: pin React to this tree's copies so
        // parallel Jest workers cannot resolve a parent checkout's react-dom and
        // trip "Cannot read properties of null (reading 'useState')".
        '^react$': '<rootDir>/node_modules/react',
        '^react-dom$': '<rootDir>/node_modules/react-dom',
        '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
        '^react/jsx-dev-runtime$': '<rootDir>/node_modules/react/jsx-dev-runtime',
        // remark-gfm is ESM-only and next/jest's default transformIgnorePatterns
        // blocks it from being transformed. Provide a no-op mock for unit tests.
        '^remark-gfm$': '<rootDir>/src/__mocks__/remark-gfm.ts',
        // Strip the ESM-style `.js` extension from RELATIVE imports so jest resolves
        // them to the `.ts` source (e.g. class-reference-graph-db.ts imports
        // '../../class-reference-graph.js' → class-reference-graph.ts). tsx resolves
        // this at runtime; jest needs the map. Pre-existing break from commit f8c3a596c
        // that left 8 suites unable to load + blocked the pre-push hook.
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    // Allow transforming ES modules from node_modules
    transformIgnorePatterns: [
        'node_modules/(?!(react-markdown|remark-.*|unified|bail|is-plain-obj|trough|vfile|unist-.*|mdast-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|devlop|trim-lines)/)',
    ],
    // Exclude e2e tests and test utilities - they run with Playwright, not Jest.
    // Also exclude .claude/worktrees/ which contains leftover agent worktrees
    // — those are mirrors of the main tree carrying duplicate test files that
    // Jest would otherwise try to run, producing 251 spurious suite failures
    // that block the pre-push hook (2026-05-22 Tristan: "ship them all"
    // blocked by these spurious failures).
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/e2e/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/.claude/worktrees/',
        '<rootDir>/_archive/',
        // scripts/lib/cost/ and scripts/lib/orchestrator/ *.test.* are tsx-RUN assertion scripts
        // (a top-level main()/IIFE + console.log + process.exit — NO jest describe/it/expect). Jest
        // mis-collected them by the .test.* suffix, ran main(), and the process.exit KILLED the jest
        // worker → "child process exception" → 10 suites failed-to-RUN (0 real test failures),
        // spuriously blocking the pre-push/CI gate (the likely original cause of the main↔branch
        // drift — the gate was unpassable so pushes bypassed it). They run via `npx tsx <file>` /
        // verify-engine-guards.sh, not jest. The 3 REAL jest tests in scripts/lib/ (engineering-
        // ledger, engineering-problem-narrative, tool-selection-narrative) are top-level, not in
        // these subdirs, so they still run. Tristan 2026-06-24.
        '<rootDir>/scripts/lib/cost/',
        '<rootDir>/scripts/lib/orchestrator/',
        // a tsx-run assertion script (top-level guard checks + console.log "PASSED", no jest
        // describe/it) mis-suffixed .test.tsx — jest "must contain at least one test". Runs via tsx.
        '<rootDir>/src/lib/pdf-engine-v2/brief-expander.test.tsx',
    ],
    // Only match test files with .test. or .spec. patterns
    testMatch: [
        '**/__tests__/**/*.test.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)',
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'src/lib/**/*.{ts,tsx}',
        'src/actions/**/*.{ts,tsx}',
        '!src/**/__tests__/**',
        '!src/**/test-utils.*',
        '!src/types/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],

    // Coverage thresholds - ratchet up as we add more tests
    // Start low to match current coverage, increase over time
    coverageThreshold: {
        // Global minimum thresholds
        global: {
            branches: 1,
            functions: 1,
            lines: 1,
            statements: 1,
        },
        // Higher thresholds for critical shared code
        'src/lib/utils.ts': {
            branches: 80,
            functions: 100,
            lines: 90,
            statements: 90,
        },
        'src/lib/supabase/foundry-context.ts': {
            branches: 50,
            functions: 60,
            lines: 60,
            statements: 60,
        },
        'src/lib/server-action-utils.ts': {
            branches: 80,
            functions: 100,
            lines: 90,
            statements: 90,
        },
    },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)
