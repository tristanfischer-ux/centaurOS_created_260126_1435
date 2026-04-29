import { describe, expect, it, vi } from 'vitest';

import {
  absent,
  countMissing,
  dataError,
  type DataPresence,
  isPresent,
  notApplicable,
  present,
  unwrapOrDefault,
  unwrapOrThrow,
} from '../null-semantics';

describe('null-semantics helpers', () => {
  describe('constructors', () => {
    it('present wraps a value with status present', () => {
      const dp = present(42);
      expect(dp).toEqual({ status: 'present', value: 42 });
    });

    it('present works with complex types', () => {
      const dp = present({ mass: 12.5, unit: 'kg' });
      expect(dp).toEqual({
        status: 'present',
        value: { mass: 12.5, unit: 'kg' },
      });
    });

    it('present wraps null and undefined explicitly', () => {
      const dpNull = present(null);
      expect(dpNull).toEqual({ status: 'present', value: null });

      const dpUndef = present(undefined);
      expect(dpUndef).toEqual({ status: 'present', value: undefined });
    });

    it('absent creates an absent entry with reason', () => {
      const dp = absent('supplier did not provide lead time');
      expect(dp).toEqual({
        status: 'absent',
        reason: 'supplier did not provide lead time',
      });
    });

    it('notApplicable creates a not-applicable entry with reason', () => {
      const dp = notApplicable('thermal analysis not relevant for software module');
      expect(dp).toEqual({
        status: 'not-applicable',
        reason: 'thermal analysis not relevant for software module',
      });
    });

    it('dataError creates an error entry', () => {
      const dp = dataError('API returned 503');
      expect(dp).toEqual({
        status: 'error',
        error: 'API returned 503',
      });
    });
  });

  describe('isPresent type guard', () => {
    it('returns true for present values', () => {
      const dp = present('hello');
      expect(isPresent(dp)).toBe(true);
    });

    it('returns false for absent values', () => {
      expect(isPresent(absent('no data'))).toBe(false);
    });

    it('returns false for not-applicable values', () => {
      expect(isPresent(notApplicable('irrelevant'))).toBe(false);
    });

    it('returns false for error values', () => {
      expect(isPresent(dataError('timeout'))).toBe(false);
    });

    it('narrows the type so .value is accessible', () => {
      const dp: DataPresence<number> = present(99);
      if (isPresent(dp)) {
        const val: number = dp.value;
        expect(val).toBe(99);
      } else {
        throw new Error('should not reach here');
      }
    });
  });

  describe('unwrapOrThrow', () => {
    it('returns the value when present', () => {
      expect(unwrapOrThrow(present(7), 'test')).toBe(7);
    });

    it('throws with context and reason for absent', () => {
      expect(() => unwrapOrThrow(absent('no data'), 'cost rollup')).toThrow(
        '[null-semantics] cost rollup: expected present value but got absent — no data'
      );
    });

    it('throws with context and reason for not-applicable', () => {
      expect(() =>
        unwrapOrThrow(notApplicable('not relevant'), 'thermal check')
      ).toThrow(
        '[null-semantics] thermal check: expected present value but got not-applicable — not relevant'
      );
    });

    it('throws with context and error for error status', () => {
      expect(() => unwrapOrThrow(dataError('503'), 'supplier fetch')).toThrow(
        '[null-semantics] supplier fetch: expected present value but got error — 503'
      );
    });
  });

  describe('unwrapOrDefault', () => {
    it('returns the value when present, ignoring fallback', () => {
      expect(unwrapOrDefault(present(42), 0)).toBe(42);
    });

    it('returns the fallback when absent', () => {
      expect(unwrapOrDefault(absent('missing'), 0)).toBe(0);
    });

    it('returns the fallback when not-applicable', () => {
      expect(unwrapOrDefault(notApplicable('n/a'), 'default')).toBe('default');
    });

    it('returns the fallback when error', () => {
      expect(unwrapOrDefault(dataError('crash'), -1)).toBe(-1);
    });

    it('calls warnFn with a descriptive message when falling back', () => {
      const warn = vi.fn();
      unwrapOrDefault(absent('no supplier quote'), 0, warn);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        '[null-semantics] falling back to default: absent — no supplier quote'
      );
    });

    it('does not call warnFn when value is present', () => {
      const warn = vi.fn();
      unwrapOrDefault(present(10), 0, warn);
      expect(warn).not.toHaveBeenCalled();
    });

    it('calls warnFn with error detail for error status', () => {
      const warn = vi.fn();
      unwrapOrDefault(dataError('timeout'), 0, warn);
      expect(warn).toHaveBeenCalledWith(
        '[null-semantics] falling back to default: error — timeout'
      );
    });
  });

  describe('countMissing', () => {
    it('counts a fully-present record as zero missing', () => {
      const record = {
        mass: present(12.5),
        volume: present(3.2),
        cost: present(150),
      };
      const result = countMissing(record);
      expect(result).toEqual({
        total: 3,
        missing: 0,
        errors: 0,
        missingKeys: [],
      });
    });

    it('counts absent entries as missing', () => {
      const record = {
        mass: present(12.5),
        leadTime: absent('supplier did not quote'),
        cost: present(150),
      };
      const result = countMissing(record);
      expect(result).toEqual({
        total: 3,
        missing: 1,
        errors: 0,
        missingKeys: ['leadTime'],
      });
    });

    it('counts not-applicable entries as missing', () => {
      const record = {
        thermalLoad: notApplicable('software module'),
        mass: present(0.5),
      };
      const result = countMissing(record);
      expect(result).toEqual({
        total: 2,
        missing: 1,
        errors: 0,
        missingKeys: ['thermalLoad'],
      });
    });

    it('counts error entries separately from missing', () => {
      const record = {
        mass: present(12.5),
        cost: dataError('API timeout'),
        leadTime: absent('not quoted'),
      };
      const result = countMissing(record);
      expect(result).toEqual({
        total: 3,
        missing: 1,
        errors: 1,
        missingKeys: ['cost', 'leadTime'],
      });
    });

    it('handles an empty record', () => {
      const result = countMissing({});
      expect(result).toEqual({
        total: 0,
        missing: 0,
        errors: 0,
        missingKeys: [],
      });
    });

    it('handles a record where everything is missing or errored', () => {
      const record = {
        a: absent('reason a'),
        b: notApplicable('reason b'),
        c: dataError('reason c'),
      };
      const result = countMissing(record);
      expect(result).toEqual({
        total: 3,
        missing: 2,
        errors: 1,
        missingKeys: ['a', 'b', 'c'],
      });
    });
  });
});
