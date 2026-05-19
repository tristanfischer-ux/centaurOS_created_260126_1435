/**
 * @file action-logger.test.ts — verification of the shared action logger.
 *
 * Covers:
 *   - attach() creates dir + truncates file
 *   - logLlm() emits action_type='llm_call' + cost_usd estimate
 *   - logGate() emits gate_name + verdict + reasons
 *   - logRepair() emits before_hash + after_hash automatically
 *   - logStage() emits stage_start / stage_end pairing
 *   - getActionLogger() returns a silent stub when unattached
 *   - estimateCostUsd() returns undefined for unknown models, never zero
 *   - shortHash() is deterministic + same input ↔ same hash
 *
 * Run: npx jest src/lib/pdf-engine-v2/lib/action-logger.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ActionLogger,
  attachActionLogger,
  detachActionLogger,
  estimateCostUsd,
  getActionLogger,
  shortHash,
} from './action-logger'

describe('action-logger', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'action-logger-test-'))
  })

  afterEach(() => {
    detachActionLogger()
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  describe('ActionLogger.attach', () => {
    it('creates a fresh actions.jsonl in the iter dir', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      expect(existsSync(join(tmpDir, 'actions.jsonl'))).toBe(true)
      expect(readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8')).toBe('')
    })

    it('truncates the file on re-attach', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.log({ step_name: 'x', action_type: 'note' })
      expect(readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8')).toContain('"x"')
      logger.attach(tmpDir)
      expect(readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8')).toBe('')
    })

    it('becomes a no-op when iterDir is undefined', () => {
      const logger = new ActionLogger()
      logger.attach(undefined)
      logger.log({ step_name: 'silent', action_type: 'note' })
      expect(logger.isAttached()).toBe(false)
    })
  })

  describe('ActionLogger.logLlm', () => {
    it('writes action_type=llm_call with all spec fields', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.logLlm({
        step_name: 'research',
        model: 'xiaomi/mimo-v2.5-pro',
        prompt_tokens: 5_000,
        completion_tokens: 10_000,
        latency_ms: 12_345,
        finish_reason: 'stop',
        ok: true,
      })
      const line = readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8').trim()
      const rec = JSON.parse(line)
      expect(rec.action_type).toBe('llm_call')
      expect(rec.step_name).toBe('research')
      expect(rec.model).toBe('xiaomi/mimo-v2.5-pro')
      expect(rec.prompt_tokens).toBe(5_000)
      expect(rec.completion_tokens).toBe(10_000)
      expect(rec.tokens_in).toBe(5_000)        // alias for chain-v2 compat
      expect(rec.tokens_out).toBe(10_000)
      expect(rec.latency_ms).toBe(12_345)
      expect(rec.finish_reason).toBe('stop')
      expect(rec.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      // cost = (5000/1M)*0.50 + (10000/1M)*2.00 = 0.0025 + 0.020 = 0.0225 USD
      expect(rec.cost_usd).toBeCloseTo(0.0225, 4)
    })

    it('omits cost_usd for unknown models (never zero)', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.logLlm({
        step_name: 't',
        model: 'someunknown/model-v0.1',
        prompt_tokens: 100,
        completion_tokens: 200,
      })
      const line = readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8').trim()
      const rec = JSON.parse(line)
      expect(rec.cost_usd).toBeUndefined()
    })
  })

  describe('ActionLogger.logGate', () => {
    it('writes action_type=gate_evaluation with gate_name + verdict + reasons', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.logGate({
        step_name: 'physics_ledger',
        gate_name: 'G0_physics',
        verdict: 'HALT',
        score: 0,
        reasons: ['perpetual motion'],
      })
      const rec = JSON.parse(readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8').trim())
      expect(rec.action_type).toBe('gate_evaluation')
      expect(rec.gate_name).toBe('G0_physics')
      expect(rec.verdict).toBe('HALT')
      expect(rec.score).toBe(0)
      expect(rec.reasons).toEqual(['perpetual motion'])
    })
  })

  describe('ActionLogger.logRepair', () => {
    it('auto-computes before_hash + after_hash from values', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.logRepair({
        step_name: 'engine_a_retry_1',
        target_field: 'state.bomLines',
        before_value: { cell_count: 4900 },
        after_value:  { cell_count: 3500 },
        key_changes: 'cell_count: 4900 → 3500',
      })
      const rec = JSON.parse(readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8').trim())
      expect(rec.action_type).toBe('state_repair')
      expect(rec.target_field).toBe('state.bomLines')
      expect(rec.key_changes).toBe('cell_count: 4900 → 3500')
      expect(rec.before_hash).toMatch(/^[a-f0-9]{12}$/)
      expect(rec.after_hash).toMatch(/^[a-f0-9]{12}$/)
      expect(rec.before_hash).not.toEqual(rec.after_hash)
    })
  })

  describe('ActionLogger.logStage', () => {
    it('emits paired stage_start + stage_end records', () => {
      const logger = new ActionLogger()
      logger.attach(tmpDir)
      logger.logStage({ step_name: 'research', action_type: 'stage_start' })
      logger.logStage({ step_name: 'research', action_type: 'stage_end', outcome: 'ok', duration_ms: 1234 })
      const lines = readFileSync(join(tmpDir, 'actions.jsonl'), 'utf-8').trim().split('\n')
      expect(lines.length).toBe(2)
      const start = JSON.parse(lines[0])
      const end = JSON.parse(lines[1])
      expect(start.action_type).toBe('stage_start')
      expect(end.action_type).toBe('stage_end')
      expect(end.outcome).toBe('ok')
      expect(end.duration_ms).toBe(1234)
    })
  })

  describe('module-level singleton', () => {
    it('getActionLogger() returns a silent no-op when not attached', () => {
      detachActionLogger()
      const logger = getActionLogger()
      // Should NOT throw, should write nowhere.
      logger.logLlm({ step_name: 'x', model: 'whatever' })
      expect(logger.isAttached()).toBe(false)
    })

    it('attachActionLogger() makes getActionLogger() return an attached logger', () => {
      const a = attachActionLogger(tmpDir)
      const b = getActionLogger()
      expect(a).toBe(b)
      expect(b.isAttached()).toBe(true)
    })
  })

  describe('estimateCostUsd', () => {
    it('returns USD for a known model', () => {
      // gemini-3.1-flash-lite: [0.10, 0.40] per M
      // 1000 in + 1000 out → (0.10 + 0.40) / 1000 = 0.0005
      expect(estimateCostUsd('google/gemini-3.1-flash-lite', 1000, 1000)).toBeCloseTo(0.0005, 6)
    })
    it('returns undefined for unknown models', () => {
      expect(estimateCostUsd('made/up-v0', 1000, 1000)).toBeUndefined()
    })
    it('returns undefined when tokens are all zero', () => {
      expect(estimateCostUsd('anthropic/claude-haiku-4.5', 0, 0)).toBeUndefined()
    })
  })

  describe('shortHash', () => {
    it('is deterministic', () => {
      expect(shortHash({ a: 1, b: 2 })).toBe(shortHash({ a: 1, b: 2 }))
    })
    it('changes when input changes', () => {
      expect(shortHash({ a: 1 })).not.toBe(shortHash({ a: 2 }))
    })
    it('handles unstringifiable input without throwing', () => {
      const circular: any = {}
      circular.self = circular
      expect(() => shortHash(circular)).not.toThrow()
    })
  })
})
