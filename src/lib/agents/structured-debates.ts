/**
 * @file structured-debates.ts
 *
 * @description Provides structured debate formats for Specialist Council
 * sessions. Instead of free-form discussions, debates follow specific
 * formats that produce clearer decisions.
 *
 * Formats:
 * - Pro/Con: Two specialists argue for and against
 * - Round Robin: Each specialist gives their perspective in turn
 * - Decision Matrix: Specialists collaboratively score options
 * - Devil's Advocate: A specialist argues against their natural position
 * - Red Team: One specialist attacks the plan, others defend
 *
 * @related
 * - Council dialog: src/components/agents/specialist-council-dialog.tsx
 * - Council action: src/actions/run-specialist-council.ts
 * - Specialists: src/app/(platform)/agents/specialists-data.ts
 */

import type { SpecialistId } from '@/app/(platform)/agents/specialists-data'
import { getSpecialistById } from '@/app/(platform)/agents/specialists-data'

// ─── Types ──────────────────────────────────────────────────────────

export type DebateFormat = 'pro_con' | 'round_robin' | 'decision_matrix' | 'devils_advocate' | 'red_team'

export interface DebateConfig {
    /** The debate format */
    format: DebateFormat
    /** The question or topic being debated */
    topic: string
    /** Specialists participating */
    participants: SpecialistId[]
    /** For pro/con: who argues for */
    proSpecialist?: SpecialistId
    /** For pro/con: who argues against */
    conSpecialist?: SpecialistId
    /** For devil's advocate: who plays devil's advocate */
    devilsAdvocate?: SpecialistId
    /** For decision matrix: options being evaluated */
    options?: string[]
    /** For decision matrix: criteria to evaluate against */
    criteria?: string[]
}

export interface DebatePrompt {
    /** The specialist this prompt is for */
    specialistId: SpecialistId
    /** The role this specialist plays in the debate */
    role: string
    /** The full prompt text */
    prompt: string
    /** The order in which this specialist speaks */
    order: number
}

// ─── Debate Format Definitions ──────────────────────────────────────

export const DEBATE_FORMATS: Record<DebateFormat, {
    name: string
    description: string
    icon: string
    minParticipants: number
    maxParticipants: number
}> = {
    pro_con: {
        name: 'Pro vs Con',
        description: 'Two specialists argue for and against a decision',
        icon: 'Swords',
        minParticipants: 2,
        maxParticipants: 2,
    },
    round_robin: {
        name: 'Round Robin',
        description: 'Each specialist gives their perspective in turn',
        icon: 'RotateCcw',
        minParticipants: 3,
        maxParticipants: 6,
    },
    decision_matrix: {
        name: 'Decision Matrix',
        description: 'Specialists collaboratively score options against criteria',
        icon: 'Grid3x3',
        minParticipants: 2,
        maxParticipants: 5,
    },
    devils_advocate: {
        name: "Devil's Advocate",
        description: 'One specialist argues against their natural position',
        icon: 'Flame',
        minParticipants: 2,
        maxParticipants: 3,
    },
    red_team: {
        name: 'Red Team',
        description: 'One specialist attacks the plan, others defend',
        icon: 'Shield',
        minParticipants: 3,
        maxParticipants: 5,
    },
}

// ─── Prompt Generation ──────────────────────────────────────────────

/**
 * Generates debate prompts for each participant based on the debate format.
 *
 * @description Builds role-specific prompts for each specialist in the debate.
 * Each format produces different prompt structures that guide the specialists
 * into their assigned roles (advocate, challenger, scorer, etc.).
 *
 * @param config - The debate configuration including format, topic, and participants
 * @returns Array of prompts for each participant, ordered by speaking turn
 */
export function generateDebatePrompts(config: DebateConfig): DebatePrompt[] {
    switch (config.format) {
        case 'pro_con':
            return generateProConPrompts(config)
        case 'round_robin':
            return generateRoundRobinPrompts(config)
        case 'decision_matrix':
            return generateDecisionMatrixPrompts(config)
        case 'devils_advocate':
            return generateDevilsAdvocatePrompts(config)
        case 'red_team':
            return generateRedTeamPrompts(config)
        default:
            return generateRoundRobinPrompts(config)
    }
}

/**
 * Generates prompts for a Pro vs Con debate between two specialists.
 */
function generateProConPrompts(config: DebateConfig): DebatePrompt[] {
    const pro = config.proSpecialist ?? config.participants[0]
    const con = config.conSpecialist ?? config.participants[1]
    const proSpec = getSpecialistById(pro)
    const conSpec = getSpecialistById(con)

    return [
        {
            specialistId: pro,
            role: 'Advocate (FOR)',
            prompt: `You are arguing FOR this decision: "${config.topic}"

Make the strongest possible case. Use data, examples, and your domain expertise. Be passionate and convincing. Address potential counterarguments preemptively.

Structure your argument:
1. **Core thesis** (1 sentence)
2. **Three strongest arguments** (with evidence)
3. **Anticipated objections and rebuttals**
4. **What success looks like if we proceed**

You are ${proSpec?.name ?? pro}. Stay in character. Be persuasive.`,
            order: 1,
        },
        {
            specialistId: con,
            role: 'Challenger (AGAINST)',
            prompt: `You are arguing AGAINST this decision: "${config.topic}"

Make the strongest possible case for NOT doing this. Identify risks, costs, opportunity costs, and hidden assumptions. Be rigorous and honest.

Structure your argument:
1. **Core concern** (1 sentence)
2. **Three strongest arguments against** (with evidence)
3. **Hidden risks the advocate might miss**
4. **What could go wrong and the cost of failure**
5. **Alternative approach** (what to do instead)

You are ${conSpec?.name ?? con}. Stay in character. Be thorough.`,
            order: 2,
        },
    ]
}

/**
 * Generates prompts for a Round Robin debate where each specialist speaks in turn.
 */
function generateRoundRobinPrompts(config: DebateConfig): DebatePrompt[] {
    return config.participants.map((id, index) => {
        const spec = getSpecialistById(id)
        return {
            specialistId: id,
            role: `${spec?.title ?? id} Perspective`,
            prompt: `The team is discussing: "${config.topic}"

Give your perspective from your domain expertise as ${spec?.name ?? id} (${spec?.title ?? ''}).

Structure your response:
1. **Your take** (1-2 sentences, your honest opinion)
2. **What you see that others might miss** (from your domain)
3. **Key risk or opportunity** (from your perspective)
4. **Your recommendation** (specific, actionable)

Be concise (200-300 words max). Be opinionated — don't hedge. If you disagree with what others have said, say so directly.`,
            order: index + 1,
        }
    })
}

/**
 * Generates prompts for a Decision Matrix debate where specialists score options.
 */
function generateDecisionMatrixPrompts(config: DebateConfig): DebatePrompt[] {
    const options = config.options ?? ['Option A', 'Option B']
    const criteria = config.criteria ?? ['Cost', 'Speed', 'Risk', 'Impact']

    return config.participants.map((id, index) => {
        const spec = getSpecialistById(id)
        return {
            specialistId: id,
            role: `${spec?.title ?? id} Scorer`,
            prompt: `Score these options for: "${config.topic}"

Options: ${options.join(', ')}
Criteria: ${criteria.join(', ')}

For each option, score each criterion from 1-5 and explain your reasoning.

Format as a table:
| Criterion | ${options.join(' | ')} |
|---|${options.map(() => '---|').join('')}
${criteria.map(c => `| ${c} | ${options.map(() => '[score] - [reason]').join(' | ')} |`).join('\n')}

Then give your overall recommendation with reasoning.

Score from YOUR expertise as ${spec?.name ?? id} (${spec?.title ?? ''}). Different specialists will weight criteria differently — that's the point.`,
            order: index + 1,
        }
    })
}

/**
 * Generates prompts for a Devil's Advocate debate where one specialist
 * argues against their natural position.
 */
function generateDevilsAdvocatePrompts(config: DebateConfig): DebatePrompt[] {
    const advocate = config.devilsAdvocate ?? config.participants[0]
    const spec = getSpecialistById(advocate)

    const prompts: DebatePrompt[] = [
        {
            specialistId: advocate,
            role: "Devil's Advocate",
            prompt: `IMPORTANT: You are playing Devil's Advocate. Argue AGAINST your natural position on: "${config.topic}"

As ${spec?.name ?? advocate}, you would normally support this. But for this exercise, find every reason it could fail. Be ruthless. Challenge every assumption.

Structure:
1. **What I would normally say** (1 sentence — acknowledge your natural position)
2. **But here's why I'm wrong** (argue against yourself)
3. **The hidden assumptions** (what we're taking for granted)
4. **The worst-case scenario** (if this goes wrong)
5. **What we'd need to see to be confident** (conditions for proceeding)

This is the most valuable thing you can do — find the flaws before reality does.`,
            order: 1,
        },
    ]

    // Other participants respond to the devil's advocate
    const others = config.participants.filter(id => id !== advocate)
    others.forEach((id, index) => {
        const otherSpec = getSpecialistById(id)
        prompts.push({
            specialistId: id,
            role: 'Respondent',
            prompt: `${spec?.name ?? advocate} just played Devil's Advocate on: "${config.topic}"

Respond to their challenges. Which concerns are valid? Which are overblown? What would you add?

Be specific. Don't dismiss their concerns — engage with them seriously.`,
            order: index + 2,
        })
    })

    return prompts
}

/**
 * Generates prompts for a Red Team debate where one specialist attacks
 * the plan and others defend it.
 */
function generateRedTeamPrompts(config: DebateConfig): DebatePrompt[] {
    const attacker = config.participants[0]
    const defenders = config.participants.slice(1)
    const attackerSpec = getSpecialistById(attacker)

    const prompts: DebatePrompt[] = [
        {
            specialistId: attacker,
            role: 'Red Team (Attacker)',
            prompt: `You are RED TEAMING this plan: "${config.topic}"

Your job is to find every way this could fail. Think like a competitor, a skeptical investor, or Murphy's Law personified.

Structure:
1. **Attack vector 1**: [How this fails] — Likelihood: [High/Medium/Low]
2. **Attack vector 2**: [How this fails] — Likelihood: [High/Medium/Low]
3. **Attack vector 3**: [How this fails] — Likelihood: [High/Medium/Low]
4. **The kill shot**: The single most likely way this plan dies
5. **What the team is NOT seeing**

Be aggressive. The team needs to hear the hard truth.`,
            order: 1,
        },
    ]

    defenders.forEach((id, index) => {
        prompts.push({
            specialistId: id,
            role: 'Blue Team (Defender)',
            prompt: `${attackerSpec?.name ?? attacker} just red-teamed the plan: "${config.topic}"

Defend the plan against their attacks. For each attack vector:
- Is it valid? (Be honest)
- If valid, what's the mitigation?
- If overblown, why?

Then: What would you change about the plan based on this red team exercise?`,
            order: index + 2,
        })
    })

    return prompts
}

/**
 * Generates a synthesis prompt for the Chief of Staff to summarize the debate.
 *
 * @description After all specialists have spoken, Cal (Chief of Staff) synthesizes
 * the full debate into a clear decision brief with recommendation.
 *
 * @param config - The debate configuration
 * @param debateTranscript - The full debate transcript from all participants
 * @returns A synthesis prompt string for the Chief of Staff
 */
export function generateSynthesisPrompt(
    config: DebateConfig,
    debateTranscript: string,
): string {
    return `You are Cal, the Chief of Staff. The team just completed a ${DEBATE_FORMATS[config.format].name} debate on: "${config.topic}"

Here's the full transcript:
${debateTranscript}

Synthesize this into a clear decision brief:

## Debate Summary
What was discussed and the key positions.

## Points of Agreement
Where the team aligned.

## Points of Disagreement
Where the team diverged and why.

## Key Risks Identified
The most important risks surfaced.

## Recommendation
Based on the debate, what should the founder do? Be specific.

## Decision Required
Frame the decision clearly: "The question is: [X] or [Y]?"

## Confidence Level
How confident is the team in this recommendation? (High/Medium/Low) and why.

Be direct. The founder needs a clear recommendation, not a summary of opinions.`
}
