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
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    // Allow transforming ES modules from node_modules
    transformIgnorePatterns: [
        'node_modules/(?!(react-markdown|remark-.*|unified|bail|is-plain-obj|trough|vfile|unist-.*|mdast-.*|micromark.*|decode-named-character-reference|character-entities|property-information|hast-util-whitespace|space-separated-tokens|comma-separated-tokens|devlop|trim-lines)/)',
    ],
    // Exclude e2e tests and test utilities - they run with Playwright, not Jest
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/e2e/',
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
