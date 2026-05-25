/**
 * @file scripts/ingest/extract-keyword-map.ts — Helper for the sweep script.
 *
 * Prints the enabled KEYWORD_MAP entries to stdout as tab-separated rows:
 *   <distributor>\t<keyword>\t<componentClass>\t<maxPages>
 *
 * Called by run-weekly-component-sweep.sh via `npx tsx`.
 * Not intended for direct use.
 */

import { KEYWORD_MAP } from '../distributor-keyword-map'

for (const entry of KEYWORD_MAP) {
  if (entry.enabled === false) continue
  const cols = [
    entry.distributor,
    entry.keyword,
    entry.componentClass,
    String(entry.maxPages),
  ].join('\t')
  process.stdout.write(cols + '\n')
}
