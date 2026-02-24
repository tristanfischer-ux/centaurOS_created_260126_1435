/**
 * @file web-search.ts — Web search tool handler for non-Claude providers.
 *
 * @description Wraps the existing runPreSearch() as a tool handler so that
 * non-Claude specialists can invoke web search as a tool during conversation,
 * rather than only triggering on keyword heuristics.
 *
 * @related
 * - Web search infrastructure: src/lib/agents/web-search.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts (TOOL_WEB_SEARCH)
 */

import { runPreSearch, formatSearchResultsForPrompt } from "@/lib/agents/web-search"
import type { ToolHandler } from "./common"

export const handleWebSearch: ToolHandler = async (args, _ctx) => {
    const query = args.query as string
    if (!query || typeof query !== "string") {
        return "Error: `query` parameter is required."
    }

    try {
        const results = await runPreSearch(query, "business research", 2)

        if (results.sources.length === 0) {
            return "No relevant search results found for this query."
        }

        return formatSearchResultsForPrompt(results)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Web search failed: ${msg}`
    }
}
