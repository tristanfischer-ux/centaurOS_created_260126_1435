import { HydratedProjectData } from '../types/raw-schema';
import type { SanitizedProjectData } from '../types/render-contracts';
export type { SanitizedProjectData };

const SCRATCH_PAD_REGEXES = [
  /We need to produce a single sentence[^\n]*\n?/gi,
  /Here is a single sentence[^\n]*\n?/gi,
  /I will produce[^\n]*\n?/gi,
  /Thinking process:[^\n]*\n?/gi,
  /Here is the[^\n]*\n?/gi,
  /Here's the[^\n]*\n?/gi,
  /Sure, here is[^\n]*\n?/gi,
];

function sanitizeString(text: string): string {
  let cleaned = text;

  // 1. Strip LLM telemetry lines
  cleaned = cleaned.replace(/^MISSING\s*[–\-]\s*Not found on website\s*\n?/gm, '');
  cleaned = cleaned.replace(/target provenance:.*\n?/gmi, '');

  // 2. Strip scratch-pad thoughts
  for (const regex of SCRATCH_PAD_REGEXES) {
    cleaned = cleaned.replace(regex, '');
  }

  // 3. Strip Markdown asterisks
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');

  // 4. Replace Greek/math characters that fail in standard PDF fonts
  cleaned = cleaned.replace(/Ω/g, 'ohms');
  cleaned = cleaned.replace(/m²/g, 'm^2');
  cleaned = cleaned.replace(/°C/g, 'degC');

  // 5. Revert overzealous LLM acronym expansions
  cleaned = cleaned.replace(/Deutsches Institut für Normung/gi, 'DIN');

  return cleaned.trim();
}

export function sanitizeText(hydrated: HydratedProjectData): SanitizedProjectData {
  const sanitizeValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        sanitizedObj[key] = sanitizeValue(val);
      }
      return sanitizedObj;
    }
    return value;
  };

  return sanitizeValue(hydrated) as SanitizedProjectData;
}
