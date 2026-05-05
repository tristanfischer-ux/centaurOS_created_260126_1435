/**
 * Strip tool-call leaks: lookup_process(...), calculate_stress(...), etc.
 * Found in loop 15: Agent emits function-call text that leaks into narrative fields.
 *
 * IMPORTANT: Only strips patterns that match known LLM tool-call naming conventions
 * (underscore_separated or camelCase function names followed by parenthesised args).
 * Does NOT strip legitimate parenthetical text like "The motor (DC brushless) drives..."
 *
 * @param text The input string
 * @returns Cleaned string
 */
export function stripToolCallLeaks(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\b[a-z]{2,}_[a-z]{2,}\s*\([a-zA-Z0-9_,\s."=]*\)/g, '').trim();
}

/**
 * Strip markdown bold syntax that bleeds into PDF: **bold** → bold
 * Found in loop 18: Bold asterisks leak and render as literal asterisks.
 * @param text The input string
 * @returns Cleaned string
 */
export function stripMarkdownBleed(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

/**
 * Fix unicode breakage: common encoding errors from PDF rendering.
 * Found in loop 22: Omega (Ω) renders as @, degree symbols break, Â appears from UTF-8 misparse.
 *
 * The real bug is Omega → @ (not @ → Omega). The @ symbol is legitimate
 * (emails, GitHub handles, part references like "M3x8@10mm"). Only strip
 * Â (UTF-8 double-byte artefact) and Ã (similar encoding artefact).
 *
 * @param text The input string
 * @returns Cleaned string
 */
export function fixUnicodeBreakage(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/Â/g, '')
    .replace(/Ã/g, '');
}

/**
 * Strip internal telemetry leaks: "ramp role unassigned", "model google/...", dates
 * Found in loop 24: Engine metrics leak into the report content.
 * @param text The input string
 * @returns Cleaned string
 */
export function stripTelemetryLeaks(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/ramp role unassigned/gi, '')
    .replace(/model google\/[-a-zA-Z0-9.]+/gi, '')
    .replace(/model openai\/[-a-zA-Z0-9.]+/gi, '')
    .trim();
}

/**
 * Strip engine syntax: [REPLACE_PART partId=...], [INSERT_...]
 * Found in loop 11: Draft instructions left in final text.
 * @param text The input string
 * @returns Cleaned string
 */
export function stripEngineSyntax(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\[[A-Z_]+\s+[^\]]*\]/g, '').replace(/\[[A-Z_]+\]/g, '').trim();
}

/**
 * Sanitise JSON array fields: handle null, undefined, "[]", unicode escapes
 * Found in loop 21: JSON string arrays parsed incorrectly.
 * @param input The input array or string
 * @returns An array of strings
 */
export function sanitiseJsonArray(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(item => String(item).replace(/\\u[0-9A-Fa-f]{4}/g, ''));
  }
  if (typeof input === 'string') {
    if (input.trim() === '[]') return [];
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed.map((item: unknown) => String(item).replace(/\\u[0-9A-Fa-f]{4}/g, ''));
      }
    } catch {
      return [input];
    }
  }
  return [];
}

/**
 * Strip reasoning leaks: "We are asked to write...", "Let me analyse..."
 * Found in loop 28: LLMs leave scratchpad text in the output.
 * @param text The input string
 * @returns Cleaned string
 */
export function stripReasoningLeaks(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/We are asked to (write|analyse|review)[^.]*\./gi, '')
    .replace(/Let me analyse[^.]*\./gi, '')
    .replace(/I will now[^.]*\./gi, '')
    .replace(/Here is the (analysis|report)[^:]*:/gi, '')
    .trim();
}

/**
 * Master sanitiser: apply all passes in order
 * @param text The input string
 * @returns Cleaned string
 */
export function sanitiseLlmOutput(text: string): string {
  if (!text) return '';
  if (typeof text !== 'string') return String(text);
  let cleaned = text;
  cleaned = stripToolCallLeaks(cleaned);
  cleaned = stripReasoningLeaks(cleaned);
  cleaned = stripTelemetryLeaks(cleaned);
  cleaned = stripEngineSyntax(cleaned);
  cleaned = fixUnicodeBreakage(cleaned);
  cleaned = stripMarkdownBleed(cleaned);
  return cleaned.trim();
}
