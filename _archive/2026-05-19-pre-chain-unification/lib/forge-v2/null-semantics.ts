/**
 * Explicit presence semantics for pipeline data.
 *
 * WHY: The pipeline treats absent values as zero/empty/success throughout,
 * producing polished but wrong reports. This type forces every consumer to
 * handle the "data is missing" case explicitly rather than defaulting to
 * a falsy value that looks like a real measurement.
 *
 * Flagged by 3/6 pipeline council models as critical (item X4).
 */

export type DataPresence<T> =
  | { status: 'present'; value: T }
  | { status: 'absent'; reason: string }
  | { status: 'not-applicable'; reason: string }
  | { status: 'error'; error: string };

export function present<T>(value: T): DataPresence<T> {
  return { status: 'present', value };
}

export function absent(reason: string): DataPresence<never> {
  return { status: 'absent', reason };
}

export function notApplicable(reason: string): DataPresence<never> {
  return { status: 'not-applicable', reason };
}

export function dataError(error: string): DataPresence<never> {
  return { status: 'error', error };
}

export function isPresent<T>(
  dp: DataPresence<T>
): dp is { status: 'present'; value: T } {
  return dp.status === 'present';
}

export function unwrapOrThrow<T>(dp: DataPresence<T>, context: string): T {
  if (dp.status === 'present') {
    return dp.value;
  }

  const detail =
    dp.status === 'error'
      ? dp.error
      : dp.reason;

  throw new Error(
    `[null-semantics] ${context}: expected present value but got ${dp.status} — ${detail}`
  );
}

export function unwrapOrDefault<T>(
  dp: DataPresence<T>,
  fallback: T,
  warnFn?: (msg: string) => void
): T {
  if (dp.status === 'present') {
    return dp.value;
  }

  const detail =
    dp.status === 'error'
      ? dp.error
      : dp.reason;

  if (warnFn) {
    warnFn(
      `[null-semantics] falling back to default: ${dp.status} — ${detail}`
    );
  }

  return fallback;
}

export function countMissing(
  record: Record<string, DataPresence<unknown>>
): {
  total: number;
  missing: number;
  errors: number;
  missingKeys: string[];
} {
  const keys = Object.keys(record);
  let missing = 0;
  let errors = 0;
  const missingKeys: string[] = [];

  for (const key of keys) {
    const entry = record[key];
    if (entry.status === 'absent' || entry.status === 'not-applicable') {
      missing++;
      missingKeys.push(key);
    } else if (entry.status === 'error') {
      errors++;
      missingKeys.push(key);
    }
  }

  return { total: keys.length, missing, errors, missingKeys };
}
