/**
 * @file ethics-types.ts — Type definitions for agent ethics guidelines.
 *
 * @description Defines the ethical principles that guide specialist behavior.
 * These types ensure consistent ethics integration across the agent system.
 *
 * @principles
 * - Honesty: Tell the truth, especially when uncomfortable
 * - Loyalty: Act in the founder's best interests
 * - Transparency: No hidden agendas, clear about limitations
 * - Candor: Direct feedback, even when challenging
 * - Protective: Flag risks proactively
 *
 * @related
 * - Ethics guidelines: src/lib/agents/ethics.ts
 * - Personality compilation: src/lib/agents/personality.ts
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 */

/**
 * Core ethical principle that guides agent behavior.
 * Each principle has behavioral directives, anti-patterns to avoid,
 * and trigger conditions when the principle should be emphasized.
 */
export type EthicalPrincipleId =
	| "honesty"
	| "loyalty"
	| "transparency"
	| "candor"
	| "protective"

/**
 * Behavioral directive for an ethical principle — what the agent
 * should actively do when embodying this principle.
 */
export interface EthicalDirective {
	/** What the agent SHOULD do */
	action: string
	/** Context or situation where this directive applies */
	trigger: string
	/** Why this matters to the founder */
	rationale: string
}

/**
 * Anti-patterns — what the agent should actively avoid
 * when operating under this principle.
 */
export interface EthicalAntiPattern {
	/** What NOT to do */
	behavior: string
	/** Why this violates the principle */
	violation: string
	/** What to do instead */
	alternative: string
}

/**
 * Complete definition of a single ethical principle.
 */
export interface EthicalPrinciple {
	/** Unique identifier */
	id: EthicalPrincipleId
	/** Human-readable name */
	name: string
	/** Brief summary of the principle */
	summary: string
	/** What the agent should actively do */
	directives: EthicalDirective[]
	/** What the agent should avoid */
	antiPatterns: EthicalAntiPattern[]
	/** Example scenarios where this principle applies */
	examples: EthicalExample[]
}

/**
 * Illustrative example showing the principle in action.
 */
export interface EthicalExample {
	/** Scenario description */
	scenario: string
	/** How the ethical agent responds */
	righteousResponse: string
	/** How an unethical agent would respond */
	unethicalResponse: string
	/** Which principle(s) this demonstrates */
	principles: EthicalPrincipleId[]
}

/**
 * How strongly each ethical principle applies to a specialist.
 * Allows customization of ethics emphasis based on specialist role.
 */
export interface EthicsAlignment {
	/** Which principles this specialist emphasizes */
	emphasizedPrinciples: EthicalPrincipleId[]
	/** Which principle guides their primary decision-making */
	primaryPrinciple: EthicalPrincipleId
	/** Role-specific ethics guidance */
	roleGuidance: string
	/** Situations where they should invoke specific principles */
	situationalGuidance: SituationalGuidance[]
}

/**
 * Context-specific guidance for when to apply ethics in specialist work.
 */
export interface SituationalGuidance {
	/** Situation or trigger */
	situation: string
	/** Which principle(s) to invoke */
	principles: EthicalPrincipleId[]
	/** What to do */
	guidance: string
}

/**
 * Compiled ethics prompt block — the natural-language
 * ethics section injected into agent prompts.
 */
export interface CompiledEthicsBlock {
	/** Introduction to the ethical framework */
	preamble: string
	/** The ethical principles as prompt text */
	principles: string
	/** Situational guidance as prompt text */
	situationalGuidance: string
	/** Closing statement reinforcing ethics commitment */
	commitment: string
}
