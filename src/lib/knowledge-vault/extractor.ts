/**
 * @file extractor.ts
 *
 * @description The Knowledge Extractor identifies and extracts atomic knowledge
 * notes from specialist conversations. This is the core synthesis pipeline that
 * transforms raw dialogue into structured, interconnected knowledge.
 *
 * Architecture:
 * 1. Receives conversation messages from a specialist thread
 * 2. Sends them to an LLM with extraction instructions
 * 3. Parses the response into structured notes
 * 4. Deduplicates against existing notes in the vault
 * 5. Saves new notes and creates suggested links
 *
 * Quality principle: Better to extract 3 excellent notes than 15 mediocre ones.
 * Aggressive quality filtering ensures the vault stays high-signal.
 *
 * @security Uses OpenAI API key from environment. No user data is logged.
 *
 * @related
 * - src/lib/agent-memory/observer.ts — Compresses conversations (different purpose)
 * - src/lib/knowledge-vault/connector.ts — Discovers connections after extraction
 * - src/lib/knowledge-vault/manager.ts — Saves extracted notes
 */

import OpenAI from 'openai'
import { createKnowledgeNote, createKnowledgeLink, getKnowledgeDomains, queryKnowledgeNotes } from './manager'
import type {
  ExtractionInput,
  ExtractionResult,
  ExtractedNote,
  KnowledgeNoteType,
  KnowledgeLinkRelationship,
  KnowledgeDomain,
} from './types'

// ─── Extraction System Prompt ────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a knowledge extraction engine for an organizational knowledge vault. Your job is to identify and extract atomic knowledge notes from specialist conversations.

## What to Extract

Extract ONLY genuinely valuable knowledge — facts, decisions, insights, and lessons that the organization should remember long-term. Each note must be:

1. **Atomic**: One idea per note. If a note covers two topics, split it.
2. **Self-contained**: Readable without the conversation context.
3. **Specific**: Include numbers, names, dates, and concrete details.
4. **Actionable or referenceable**: Someone should want to find this later.

## Note Types

- **claim**: A factual assertion about the business, market, or domain ("Our CAC is $47, down from $62 last quarter")
- **decision**: A choice that was made with rationale ("Decided to use freemium model because...")
- **insight**: An analytical finding or synthesis ("The data suggests our enterprise segment has 3x better retention")
- **fact**: A verified piece of information ("Our main competitor launched feature X on Jan 15")
- **preference**: An organizational or user preference ("CEO prefers weekly updates in bullet format")
- **lesson**: Something learned from experience ("Last product launch taught us to soft-launch to 10% first")
- **observation**: A pattern or trend noticed ("Customer support tickets spike every Monday morning")

## What NOT to Extract

- Pleasantries, greetings, or small talk
- Vague statements without specifics ("things are going well")
- Repetitions of information already in the conversation
- Questions or unclear items — only extract definitive statements, decisions, or verified facts
- Generic advice that anyone could give ("you should focus on growth")

## Quality Bar

If you're unsure whether something is worth extracting, don't extract it. The vault should be high-signal, not comprehensive. A vault with 20 excellent notes is more useful than one with 200 mediocre notes.

## Confidence Scoring

- **0.9-1.0**: Explicitly stated facts, decisions with clear rationale, direct quotes
- **0.7-0.89**: Well-supported insights, clear patterns with evidence
- **0.6-0.69**: Reasonable inferences, emerging patterns with some support
- Below 0.6: Don't extract — not confident enough for the vault

## Output Format

Return a JSON array of extracted notes. Each note:

\`\`\`json
[
  {
    "title": "Short descriptive title (max 80 chars)",
    "content": "Full content of the note. Include specifics: numbers, names, dates. 2-4 sentences.",
    "description": "One-line summary for progressive disclosure (max 120 chars)",
    "note_type": "claim|decision|insight|fact|preference|lesson|observation",
    "confidence": 0.85,
    "tags": ["pricing", "strategy"],
    "suggested_domain": "strategy|product|finance|market|operations|team|technology|legal|null"
  }
]
\`\`\`

If there is nothing worth extracting, return an empty array: []

CRITICAL: Return ONLY valid JSON. No markdown fences, no preamble, no explanation.`

// ─── Extract Knowledge ───────────────────────────────────────────────

/**
 * Extracts atomic knowledge notes from a specialist conversation.
 *
 * @description Takes recent messages from a specialist thread and identifies
 * extractable knowledge — facts, decisions, insights, etc. Deduplicates
 * against existing vault notes and saves new ones.
 *
 * @param input - The conversation messages and metadata
 * @returns Extraction results including saved/skipped counts
 *
 * @security Uses OpenAI API. No user PII is logged.
 */
export async function extractKnowledge(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const { messages, specialistId, threadId, foundryId } = input

  const result: ExtractionResult = {
    extracted: [],
    saved: 0,
    skipped: 0,
    errors: [],
  }

  // VALIDATION: Need at least 2 messages (user + assistant) to extract from
  if (messages.length < 2) {
    return result
  }

  try {
    // Step 1: Call LLM to identify extractable knowledge
    const extracted = await callExtractionLLM(messages)

    if (extracted.length === 0) {
      return result
    }

    result.extracted = extracted

    // Step 2: Fetch existing notes for deduplication
    const { notes: existingNotes } = await queryKnowledgeNotes(foundryId, {
      filters: {},
      pageSize: 100,
      sortBy: 'created_at',
      sortOrder: 'desc',
    })

    // Step 3: Fetch domains for matching
    const domains = await getKnowledgeDomains(foundryId)
    const domainBySlug = new Map<string, KnowledgeDomain>()
    for (const d of domains) {
      domainBySlug.set(d.slug, d)
    }

    // Step 4: Save each extracted note (with dedup)
    for (const note of extracted) {
      // Simple deduplication: check if a note with very similar title exists
      const isDuplicate = existingNotes.some((existing) =>
        normalizeForDedup(existing.title) === normalizeForDedup(note.title)
      )

      if (isDuplicate) {
        result.skipped++
        continue
      }

      // Match domain
      const domainId = note.suggested_domain
        ? domainBySlug.get(note.suggested_domain)?.id ?? null
        : null

      // Create the note
      const savedNote = await createKnowledgeNote(foundryId, {
        title: note.title,
        content: note.content,
        description: note.description,
        note_type: note.note_type,
        domain_id: domainId,
        source_specialist: specialistId,
        source_thread_id: threadId,
        confidence: note.confidence,
        tags: note.tags,
        extraction_metadata: {
          extraction_version: 1,
          message_count: messages.length,
          extracted_at: new Date().toISOString(),
        },
      })

      if (savedNote) {
        result.saved++

        // Create links to existing notes if suggested
        for (const link of note.suggested_links ?? []) {
          await createKnowledgeLink(
            foundryId,
            savedNote.id,
            link.note_id,
            link.relationship,
            link.reason,
            'system'
          )
        }
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[KnowledgeVault/Extractor] Extraction failed:', {
      foundryId,
      specialistId,
      error: message,
    })
    result.errors.push(message)
    return result
  }
}

// ─── LLM Call ────────────────────────────────────────────────────────

/**
 * Calls the extraction LLM to identify knowledge in conversation messages.
 */
async function callExtractionLLM(
  messages: Array<{ role: string; content: string }>
): Promise<ExtractedNote[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[KnowledgeVault/Extractor] OPENAI_API_KEY not set, skipping extraction')
    return []
  }

  const openai = new OpenAI({ apiKey })

  // Format conversation for the LLM
  const conversationText = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4',
    temperature: 0.2,
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract knowledge from the following specialist conversation:\n\n${conversationText}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return []
  }

  // Parse the JSON response
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      console.warn('[KnowledgeVault/Extractor] LLM response is not an array')
      return []
    }

    // VALIDATION: Ensure each note has required fields and valid types
    const validTypes: KnowledgeNoteType[] = [
      'claim', 'decision', 'insight', 'fact', 'preference', 'lesson', 'observation',
    ]

    return parsed
      .filter((note: Record<string, unknown>) => {
        if (!note.title || !note.content || !note.note_type) return false
        if (!validTypes.includes(note.note_type as KnowledgeNoteType)) return false
        if (typeof note.confidence === 'number' && note.confidence < 0.6) return false
        return true
      })
      .map((note: Record<string, unknown>) => ({
        title: String(note.title).slice(0, 200),
        content: String(note.content),
        description: String(note.description ?? '').slice(0, 300),
        note_type: note.note_type as KnowledgeNoteType,
        confidence: typeof note.confidence === 'number'
          ? Math.min(Math.max(note.confidence, 0), 1)
          : 0.8,
        tags: Array.isArray(note.tags)
          ? (note.tags as string[]).filter((t) => typeof t === 'string').slice(0, 10)
          : [],
        suggested_domain: typeof note.suggested_domain === 'string'
          ? note.suggested_domain
          : null,
        suggested_links: Array.isArray(note.suggested_links)
          ? (note.suggested_links as Array<Record<string, unknown>>)
              .filter((l) => l.note_id && l.relationship)
              .map((l) => ({
                note_id: String(l.note_id),
                relationship: (l.relationship ?? 'related') as KnowledgeLinkRelationship,
                reason: String(l.reason ?? ''),
              }))
          : [],
      }))
  } catch {
    console.error('[KnowledgeVault/Extractor] Failed to parse LLM response:', {
      responseLength: content.length,
      firstChars: content.slice(0, 100),
    })
    return []
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Normalizes a title for deduplication comparison.
 */
function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
