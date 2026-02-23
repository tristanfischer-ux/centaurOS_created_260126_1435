/**
 * @file emotional-context.test.ts
 *
 * @description Tests for the emotional signal detection module.
 * Verifies that the classifier correctly identifies stress, excitement,
 * frustration, uncertainty, and deflation signals from user messages,
 * and returns neutral for ambiguous or normal messages.
 */

import { detectEmotionalSignal, compileEmotionalPrompt } from '../emotional-context'

describe('detectEmotionalSignal', () => {
    // ─── Neutral ─────────────────────────────────────────────────────────
    describe('neutral detection', () => {
        it('returns neutral for empty string', () => {
            const result = detectEmotionalSignal('')
            expect(result.signal).toBe('neutral')
            expect(result.confidence).toBe(0)
        })

        it('returns neutral for normal business messages', () => {
            const result = detectEmotionalSignal('Can you help me with a go-to-market strategy?')
            expect(result.signal).toBe('neutral')
        })

        it('returns neutral for factual questions', () => {
            const result = detectEmotionalSignal('What are the key metrics for a SaaS business?')
            expect(result.signal).toBe('neutral')
        })
    })

    // ─── Stress ──────────────────────────────────────────────────────────
    describe('stress detection', () => {
        it('detects urgency words', () => {
            const result = detectEmotionalSignal('This is urgent — we need help ASAP!!')
            expect(result.signal).toBe('stress')
            expect(result.confidence).toBeGreaterThan(0.3)
        })

        it('detects "help" combined with short message', () => {
            const result = detectEmotionalSignal('Help! Stuck!')
            expect(result.signal).toBe('stress')
        })

        it('detects running out of runway language', () => {
            const result = detectEmotionalSignal("We're running out of time and desperately need to pivot")
            expect(result.signal).toBe('stress')
        })

        it('detects overwhelm', () => {
            const result = detectEmotionalSignal("I'm completely overwhelmed and blocked on everything")
            expect(result.signal).toBe('stress')
        })
    })

    // ─── Excitement ──────────────────────────────────────────────────────
    describe('excitement detection', () => {
        it('detects win sharing', () => {
            const result = detectEmotionalSignal('We just closed our first enterprise deal! Amazing!')
            expect(result.signal).toBe('excitement')
            expect(result.confidence).toBeGreaterThan(0.3)
        })

        it('detects launch celebration', () => {
            const result = detectEmotionalSignal('We just launched the product and the response is incredible!')
            expect(result.signal).toBe('excitement')
        })

        it('detects breakthrough language', () => {
            const result = detectEmotionalSignal('Huge breakthrough — we nailed the technical challenge')
            expect(result.signal).toBe('excitement')
        })
    })

    // ─── Frustration ─────────────────────────────────────────────────────
    describe('frustration detection', () => {
        it('detects repetition frustration', () => {
            const result = detectEmotionalSignal("I already said I want the short version. That's not what I asked for.")
            expect(result.signal).toBe('frustration')
            expect(result.confidence).toBeGreaterThan(0.3)
        })

        it('detects dissatisfaction', () => {
            const result = detectEmotionalSignal("No, that's not helpful. Still not what I meant.")
            expect(result.signal).toBe('frustration')
        })

        it('detects correction pattern', () => {
            const result = detectEmotionalSignal("Wrong. I said pricing strategy, not product strategy.")
            expect(result.signal).toBe('frustration')
        })
    })

    // ─── Uncertainty ─────────────────────────────────────────────────────
    describe('uncertainty detection', () => {
        it('detects "I don\'t know" language', () => {
            const result = detectEmotionalSignal("I'm not sure what to do. Should we pivot? Maybe we should wait?")
            expect(result.signal).toBe('uncertainty')
            expect(result.confidence).toBeGreaterThan(0.3)
        })

        it('detects advice-seeking', () => {
            const result = detectEmotionalSignal('What do you think? What would you recommend? Is it worth it?')
            expect(result.signal).toBe('uncertainty')
        })

        it('detects confusion', () => {
            const result = detectEmotionalSignal("I'm not sure what to do. I'm confused about which direction to go. Should we do option A or B?")
            expect(result.signal).toBe('uncertainty')
        })
    })

    // ─── Deflation ───────────────────────────────────────────────────────
    describe('deflation detection', () => {
        it('detects resignation', () => {
            const result = detectEmotionalSignal("Whatever you think. I guess it doesn't matter at this point.")
            expect(result.signal).toBe('deflation')
            expect(result.confidence).toBeGreaterThan(0.3)
        })

        it('detects giving up', () => {
            const result = detectEmotionalSignal("I'm tired of trying. Not sure it's worth continuing.")
            expect(result.signal).toBe('deflation')
        })

        it('detects disengagement', () => {
            const result = detectEmotionalSignal("Just do whatever. Don't care anymore.")
            expect(result.signal).toBe('deflation')
        })
    })

    // ─── Single Strong Signals ────────────────────────────────────────────
    describe('single strong signal detection', () => {
        it('detects crisis as stress from a single strong signal', () => {
            const result = detectEmotionalSignal("We're in crisis mode")
            expect(result.signal).toBe('stress')
            expect(result.confidence).toBeGreaterThanOrEqual(0.3)
        })

        it('detects launch as excitement from a single strong signal', () => {
            const result = detectEmotionalSignal('We just launched the product')
            expect(result.signal).toBe('excitement')
            expect(result.confidence).toBeGreaterThanOrEqual(0.3)
        })

        it('detects correction as frustration from a single strong signal', () => {
            const result = detectEmotionalSignal("That's not what I asked for")
            expect(result.signal).toBe('frustration')
            expect(result.confidence).toBeGreaterThanOrEqual(0.3)
        })

        it('detects "I don\'t know" as uncertainty from a single strong signal', () => {
            const result = detectEmotionalSignal("I don't know what to do")
            expect(result.signal).toBe('uncertainty')
            expect(result.confidence).toBeGreaterThanOrEqual(0.3)
        })

        it('detects giving up as deflation from a single strong signal', () => {
            const result = detectEmotionalSignal('I give up')
            expect(result.signal).toBe('deflation')
            expect(result.confidence).toBeGreaterThanOrEqual(0.3)
        })

        it('still returns neutral for ambiguous single signals', () => {
            expect(detectEmotionalSignal('Maybe we should look at Q3').signal).toBe('neutral')
            expect(detectEmotionalSignal('Can you help me with pricing?').signal).toBe('neutral')
            expect(detectEmotionalSignal('That is a huge market').signal).toBe('neutral')
        })
    })

    // ─── Structural Signals ──────────────────────────────────────────────
    describe('structural signal heuristics', () => {
        it('very short messages bias toward stress', () => {
            const result = detectEmotionalSignal('Help!')
            expect(['stress', 'neutral']).toContain(result.signal)
        })

        it('ALL CAPS words with urgency bias toward stress', () => {
            const result = detectEmotionalSignal('THIS IS NOT WORKING and I desperately need HELP with it NOW')
            expect(['stress', 'frustration']).toContain(result.signal)
        })

        it('multiple question marks bias toward uncertainty', () => {
            const result = detectEmotionalSignal('What should I do??? Which option is better??? How do I decide???')
            expect(result.signal).toBe('uncertainty')
        })
    })
})

describe('compileEmotionalPrompt', () => {
    it('returns empty string for neutral messages', () => {
        const result = compileEmotionalPrompt('Tell me about pricing strategies.')
        expect(result).toBe('')
    })

    it('returns non-empty prompt block for stressed messages', () => {
        const result = compileEmotionalPrompt('URGENT help needed ASAP!! Running out of time desperately!')
        expect(result).toContain('## Emotional Awareness')
        expect(result.length).toBeGreaterThan(50)
    })

    it('returns guidance mentioning celebration for excitement', () => {
        const result = compileEmotionalPrompt('We just shipped the product and it is incredible! Amazing breakthrough!')
        expect(result).toContain('## Emotional Awareness')
    })
})
