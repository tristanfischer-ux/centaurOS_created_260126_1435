import {
  stripToolCallLeaks,
  stripMarkdownBleed,
  fixUnicodeBreakage,
  stripTelemetryLeaks,
  stripEngineSyntax,
  sanitiseJsonArray,
  stripReasoningLeaks,
  sanitiseLlmOutput
} from './sanitiser';

describe('Sanitiser', () => {
  describe('stripToolCallLeaks', () => {
    it('strips lookup_process(sheet_metal) but preserves "The motor (DC brushless) drives the pump (500 L/min)"', () => {
      const input = 'The motor (DC brushless) drives the pump (500 L/min) lookup_process(sheet_metal)';
      const result = stripToolCallLeaks(input);
      expect(result).not.toContain('lookup_process');
      expect(result).toContain('The motor (DC brushless) drives the pump (500 L/min)');
    });

    it('strips calculate_stress(force=100, area=0.01) but preserves "ISO 9001:2015"', () => {
      const input = 'calculate_stress(force=100, area=0.01) According to ISO 9001:2015';
      const result = stripToolCallLeaks(input);
      expect(result).not.toContain('calculate_stress');
      expect(result).toContain('According to ISO 9001:2015');
    });
  });

  describe('stripMarkdownBleed', () => {
    it('converts **bold text** to bold text', () => {
      const input = 'This is **bold text** right here';
      const result = stripMarkdownBleed(input);
      expect(result).toBe('This is bold text right here');
    });

    it('leaves plain text unchanged', () => {
      const input = 'This is just plain text';
      const result = stripMarkdownBleed(input);
      expect(result).toBe(input);
    });
  });

  describe('fixUnicodeBreakage', () => {
    it('removes Â and Ã artefacts', () => {
      const input = 'Temperature Â is 25Ã°C';
      const result = fixUnicodeBreakage(input);
      expect(result).toBe('Temperature  is 25°C');
    });
  });

  describe('stripTelemetryLeaks', () => {
    it('removes "ramp role unassigned" and "model google/gemini-2.5-flash"', () => {
      const input = 'model google/gemini-2.5-flash ramp role unassigned The actual text';
      const result = stripTelemetryLeaks(input);
      expect(result).not.toContain('model google');
      expect(result).not.toContain('ramp role unassigned');
      expect(result).toContain('The actual text');
    });
  });

  describe('stripEngineSyntax', () => {
    it('removes [REPLACE_PART partId=CE-001] and [INSERT_COMPONENT]', () => {
      const input = 'Part one [REPLACE_PART partId=CE-001] and part two [INSERT_COMPONENT]';
      const result = stripEngineSyntax(input);
      expect(result).not.toContain('[REPLACE_PART');
      expect(result).not.toContain('[INSERT_COMPONENT]');
      expect(result).toBe('Part one  and part two');
    });
  });

  describe('sanitiseJsonArray', () => {
    it('handles null, undefined, "[]", actual arrays, string-encoded arrays', () => {
      expect(sanitiseJsonArray(null)).toEqual([]);
      expect(sanitiseJsonArray(undefined)).toEqual([]);
      expect(sanitiseJsonArray('[]')).toEqual([]);
      expect(sanitiseJsonArray(['A', 'B'])).toEqual(['A', 'B']);
      expect(sanitiseJsonArray('["A", "B"]')).toEqual(['A', 'B']);
      expect(sanitiseJsonArray('not an array')).toEqual(['not an array']);
    });
  });

  describe('stripReasoningLeaks', () => {
    it('removes "We are asked to write a comprehensive report about..." and "Let me analyse the key findings..."', () => {
      const input = 'We are asked to write a comprehensive report about this. Let me analyse the key findings. The real report starts here.';
      const result = stripReasoningLeaks(input);
      expect(result).not.toContain('We are asked');
      expect(result).not.toContain('Let me analyse');
      expect(result).toContain('The real report starts here.');
    });
  });

  describe('sanitiseLlmOutput', () => {
    it('master function chains all passes correctly', () => {
      const input = '**Important** [INSERT_COMPONENT] We are asked to write this. calculate_stress(10) Â model google/gemini-pro text.';
      const result = sanitiseLlmOutput(input);
      expect(result).not.toContain('**');
      expect(result).not.toContain('[');
      expect(result).not.toContain('We are asked');
      expect(result).not.toContain('calculate_stress');
      expect(result).not.toContain('Â');
      expect(result).not.toContain('model google');
      expect(result).toContain('Important');
      expect(result).toContain('text.');
    });
  });
});