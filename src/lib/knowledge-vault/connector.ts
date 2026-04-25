/**
 * @file connector.ts
 *
 * @description Discovers connections between knowledge notes. When a new note
 * is created, this module scans existing notes for semantic relationships and
 * creates links automatically.
 *
 * Uses lightweight keyword/tag overlap for fast matching, with an optional
 * LLM pass for deeper semantic connections when enabled.
 *
 * @security Uses OpenAI API key from environment for LLM-based connections.
 *
 * @related
 * - src/lib/knowledge-vault/extractor.ts — Creates notes (triggers connection discovery)
 * - src/lib/knowledge-vault/manager.ts — CRUD for links
 */

import OpenAI from 'openai'
import { createKnowledgeLink, queryKnowledgeNotes } from './manager'
import type {
  KnowledgeNoteSummary,
  KnowledgeLinkRelationship,
} from './types'

/** Result of connection discovery */
export interface ConnectionDiscoveryResult {
  /** Number of new connections created */
  connectionsCreated: number
  /** Total candidate notes evaluated */
  candidatesEvaluated: number
  /** Errors encountered */
  errors: string[]
}

/**
 * Discovers and creates connections between a new note and existing notes.
 *
 * @description Two-phase approach:
 * 1. **Fast pass**: Tag/keyword overlap to find candidates
 * 2. **LLM pass** (optional): Semantic evaluation of top candidates
 *
 * @param foundryId - The foundry to search in
 * @param noteId - The newly created note
 * @param noteTitle - Title of the new note
 * @param noteContent - Content of the new note
 * @param noteTags - Tags on the new note
 * @param useLLM - Whether to use LLM for deeper semantic matching
 * @returns Discovery results
 *
 * @security RLS enforces foundry isolation
 */
export async function discoverConnections(
  foundryId: string,
  noteId: string,
  noteTitle: string,
  noteContent: string,
  noteTags: string[],
  useLLM: boolean = false
): Promise<ConnectionDiscoveryResult> {
  const result: ConnectionDiscoveryResult = {
    connectionsCreated: 0,
    candidatesEvaluated: 0,
    errors: [],
  }

  try {
    // Fetch recent non-archived notes from the vault
    const { notes: candidates } = await queryKnowledgeNotes(foundryId, {
      filters: { includeArchived: false },
      sortBy: 'created_at',
      sortOrder: 'desc',
      pageSize: 100,
    })

    // Exclude the note itself
    const otherNotes = candidates.filter((n) => n.id !== noteId)
    result.candidatesEvaluated = otherNotes.length

    if (otherNotes.length === 0) {
      return result
    }

    // Phase 1: Fast keyword/tag overlap scoring
    const scored = scoreByOverlap(noteTitle, noteContent, noteTags, otherNotes)
    const topCandidates = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    if (topCandidates.length === 0) {
      return result
    }

    if (useLLM) {
      // Phase 2: LLM evaluation of top candidates
      const connections = await evaluateWithLLM(
        noteTitle,
        noteContent,
        topCandidates.map((c) => c.note)
      )

      for (const conn of connections) {
        const created = await createKnowledgeLink(
          foundryId,
          noteId,
          conn.noteId,
          conn.relationship,
          conn.reason,
          'system'
        )
        if (created) {
          result.connectionsCreated++
        }
      }
    } else {
      // Without LLM: create "related" links for high-scoring candidates
      const threshold = 1.5
      for (const candidate of topCandidates) {
        if (candidate.score >= threshold) {
          const created = await createKnowledgeLink(
            foundryId,
            noteId,
            candidate.note.id,
            'related',
            `Shared terms: ${candidate.matchedTerms.join(', ')}`,
            'system'
          )
          if (created) {
            result.connectionsCreated++
          }
        }
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[KnowledgeVault/Connector] Discovery failed:', {
      foundryId,
      noteId,
      error: message,
    })
    result.errors.push(message)
    return result
  }
}

// ─── Fast Scoring ────────────────────────────────────────────────────

interface ScoredCandidate {
  note: KnowledgeNoteSummary
  score: number
  matchedTerms: string[]
}

/**
 * Scores candidates by keyword and tag overlap with the new note.
 * Fast, no LLM call needed.
 */
function scoreByOverlap(
  title: string,
  content: string,
  tags: string[],
  candidates: KnowledgeNoteSummary[]
): ScoredCandidate[] {
  // Extract significant terms from the new note
  const newTerms = extractTerms(`${title} ${content}`)
  const newTagSet = new Set(tags.map((t) => t.toLowerCase()))

  return candidates.map((candidate) => {
    const candidateTerms = extractTerms(`${candidate.title} ${candidate.description}`)
    const candidateTagSet = new Set((candidate.tags ?? []).map((t: string) => t.toLowerCase()))

    let score = 0
    const matchedTerms: string[] = []

    // Tag overlap (high signal — 2 points each)
    for (const tag of newTagSet) {
      if (candidateTagSet.has(tag)) {
        score += 2
        matchedTerms.push(`tag:${tag}`)
      }
    }

    // Term overlap (1 point each)
    for (const term of newTerms) {
      if (candidateTerms.has(term)) {
        score += 1
        matchedTerms.push(term)
      }
    }

    // Same note type bonus (weaker signal)
    if (candidate.note_type === 'decision' || candidate.note_type === 'insight') {
      score += 0.5
    }

    return { note: candidate, score, matchedTerms }
  })
}

/**
 * Extracts significant terms from text (stop words removed, lowercased).
 */
function extractTerms(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
    'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'yet', 'both', 'each',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her', 'my', 'me',
    'who', 'what', 'which', 'when', 'where', 'how', 'why', 'all', 'any',
    'some', 'more', 'most', 'other', 'than', 'then', 'also', 'just',
    'very', 'much', 'many', 'such', 'only', 'over', 'even', 'back',
    'there', 'here', 'out', 'well', 'new', 'like', 'make', 'use',
  ])

  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  )
}

// ─── LLM Evaluation ─────────────────────────────────────────────────

interface LLMConnection {
  noteId: string
  relationship: KnowledgeLinkRelationship
  reason: string
}

/**
 * Uses an LLM to evaluate semantic connections between a new note
 * and candidate notes.
 */
async function evaluateWithLLM(
  noteTitle: string,
  noteContent: string,
  candidates: KnowledgeNoteSummary[]
): Promise<LLMConnection[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return []
  }

  const openai = new OpenAI({ apiKey })

  const candidateList = candidates
    .map((c, i) => `[${i}] "${c.title}" (${c.note_type}): ${c.description}`)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4',
    temperature: 0,
    max_completion_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: `You evaluate semantic connections between knowledge notes. Given a new note and a list of existing notes, identify which existing notes are meaningfully connected.

Return a JSON array of connections:
[{"index": 0, "relationship": "supports|contradicts|extends|supersedes|caused_by|led_to|related", "reason": "brief explanation"}]

Only include connections that are genuinely meaningful. If no strong connections exist, return [].
Relationships: supports (evidences), contradicts (conflicts with), extends (builds on), supersedes (replaces), caused_by, led_to, related (general).

Return ONLY valid JSON.`,
      },
      {
        role: 'user',
        content: `New note: "${noteTitle}"\n${noteContent}\n\nExisting notes:\n${candidateList}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) return []

  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return []

    const validRelationships: KnowledgeLinkRelationship[] = [
      'related', 'supports', 'contradicts', 'extends', 'supersedes', 'caused_by', 'led_to',
    ]

    return parsed
      .filter((c: Record<string, unknown>) => {
        const idx = c.index as number
        return typeof idx === 'number' && idx >= 0 && idx < candidates.length
          && validRelationships.includes(c.relationship as KnowledgeLinkRelationship)
      })
      .map((c: Record<string, unknown>) => ({
        noteId: candidates[c.index as number].id,
        relationship: c.relationship as KnowledgeLinkRelationship,
        reason: String(c.reason ?? ''),
      }))
  } catch {
    console.error('[KnowledgeVault/Connector] Failed to parse LLM response')
    return []
  }
}
