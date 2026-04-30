/**
 * @file supplier-description-sanitiser.ts — DEPRECATED, re-exports from
 * llm-output-sanitiser.ts for backwards compatibility. New code should
 * import from llm-output-sanitiser directly.
 */
export {
    SUPPLIER_DESCRIPTION_FALLBACK,
    SUPPLIER_DESCRIPTION_LEAK_PATTERNS,
    TOOL_CALL_LEAK_PATTERNS,
    hasSupplierDescriptionLeak,
    stripToolCallLeaks,
    sanitiseSupplierDescription,
    formatJsonArrayField,
} from "./llm-output-sanitiser"
