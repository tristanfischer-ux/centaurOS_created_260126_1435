#!/usr/bin/env npx tsx
/**
 * Sanity check: when a class has zero accumulated rows, the prompt-block
 * builder must return an empty string (so Stage 1.7 emits the brief
 * exactly as it did before this change for unseen classes).
 */
import { buildAccumulatedPromptBlock, ensureAccumulationTables } from './persist-emitted-modules'

ensureAccumulationTables()
const block = buildAccumulatedPromptBlock('class_that_has_never_been_seen_xyz123')
if (block === '') {
  console.log('OK — empty block for unseen class (no prompt pollution)')
  process.exit(0)
} else {
  console.error(`FAIL — non-empty block returned: ${block.slice(0, 200)}`)
  process.exit(1)
}
