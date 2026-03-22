/**
 * @file document-extractor.ts
 *
 * @description Extracts atomic knowledge notes from uploaded documents (PDF, DOCX, TXT)
 * and saves them to the Knowledge Vault. Reuses the same note schema as conversation
 * extraction but with document-specific provenance tracking.
 *
 * INTENT: Users upload documents (business plans, market research, reports) and
 * the content becomes part of the organizational memory that all specialists
 * can reference. This bridges the gap between "upload a file" and "the AI knows
 * about it" without needing a full RAG/embedding pipeline.
 *
 * Architecture:
 * 1. Receives pre-parsed document text + metadata
 * 2. Splits into overlapping ~3000-token windows (extraction quality degrades on long input)
 * 3. Runs the extraction LLM on each window
 * 4. Deduplicates across windows and against existing vault notes
 * 5. Saves to knowledge_notes with document provenance in extraction_metadata
 *
 * @security Uses OpenAI API key from environment. No user document content is logged.
 *
 * @related
 * - src/lib/knowledge-vault/extractor.ts — Conversation extraction (similar pattern)
 * - src/actions/knowledge.ts — Server action that calls this
 * - src/actions/analyze.ts — PDF/DOCX parsing (reused upstream)
 */

import OpenAI from 'openai'
import { createKnowledgeNote, getKnowledgeDomains, queryKnowledgeNotes } from './manager'
import { discoverConnections } from './connector'
import type {
  KnowledgeNoteType,
  KnowledgeDomain,
  ExtractedNote,
} from './types'

// ─── Types ───────────────────────────────────────────────────────────

/** Input to the document extraction pipeline */
export interface DocumentExtractionInput {
  /** Pre-parsed plaintext content of the document */
  text: string
  /** Original filename for provenance tracking */
  documentName: string
  /** The foundry this document belongs to */
  foundryId: string
}

/** Result of the document extraction pipeline */
export interface DocumentExtractionResult {
  /** Total notes extracted across all windows */
  saved: number
  /** Notes skipped as duplicates */
  skipped: number
  /** Any errors during extraction */
  errors: string[]
  /** Number of text windows processed */
  windowsProcessed: number
}

// ─── Constants ───────────────────────────────────────────────────────

// DECISION: 3000 tokens ≈ 12,000 chars. GPT-4o-mini handles this well for
// extraction tasks. Larger windows degrade quality — the model starts
// producing vague, generic notes instead of specific, atomic ones.
const CHARS_PER_WINDOW = 12000
const WINDOW_OVERLAP_CHARS = 1500
const MAX_WINDOWS = 20

// ─── Document Extraction System Prompt ───────────────────────────────

const DOCUMENT_EXTRACTION_PROMPT = `You are a knowledge extraction engine for an organizational knowledge vault. Your job is to identify and extract atomic knowledge notes from a document section.

## What to Extract

Extract ONLY genuinely valuable knowledge — facts, decisions, insights, and lessons that the organization should remember long-term. Each note must be:

1. **Atomic**: One idea per note. If a note covers two topics, split it.
2. **Self-contained**: Readable without the original document context.
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

- Table of contents, page numbers, headers/footers
- Vague statements without specifics ("things are going well")
- Boilerplate legal disclaimers or standard terms
- Repetitions of information already extracted
- Questions or unclear items — only extract definitive statements, decisions, or verified facts
- Generic advice that anyone could give ("you should focus on growth")

## Quality Bar

Better to extract 3 excellent notes than 15 mediocre ones. The vault should be high-signal, not comprehensive.

## Confidence Scoring

- **0.8-1.0**: Explicitly stated facts with supporting data, clear decisions with rationale
- **0.6-0.79**: Well-supported insights, patterns with partial evidence
- **0.6-0.69**: Reasonable inferences from context with some support
- Below 0.6: Don't extract — not confident enough for the vault

## Output Format

Return a JSON array of extracted notes:

\`\`\`json
[
  {
    "title": "Short descriptive title (max 80 chars)",
    "content": "Full content of the note. Include specifics: numbers, names, dates. 2-4 sentences.",
    "description": "One-line summary for progressive disclosure (max 120 chars)",
    "note_type": "claim|decision|insight|fact|preference|lesson|observation",
    "confidence": 0.75,
    "tags": ["pricing", "strategy"],
    "suggested_domain": "strategy|product|finance|market|operations|team|technology|legal|null"
  }
]
\`\`\`

If there is nothing worth extracting from this section, return an empty array: []

CRITICAL: Return ONLY valid JSON. No markdown fences, no preamble, no explanation.`

// ─── Main Extraction Pipeline ────────────────────────────────────────

/**
 * Extracts knowledge notes from a document and saves them to the vault.
 *
 * @description Splits document text into overlapping windows, runs the
 * extraction LLM on each, deduplicates, and saves. Each saved note gets
 * document provenance in its extraction_metadata.
 *
 * @param input - The document text and metadata
 * @returns Counts of saved/skipped notes and any errors
 *
 * @security Uses OpenAI API. No document content is logged.
 */
export async function extractKnowledgeFromDocument(
  input: DocumentExtractionInput
): Promise<DocumentExtractionResult> {
  const { text, documentName, foundryId } = input

  const result: DocumentExtractionResult = {
    saved: 0,
    skipped: 0,
    errors: [],
    windowsProcessed: 0,
  }

  if (text.length < 100) {
    result.errors.push('Document too short for meaningful extraction')
    return result
  }

  try {
    const windows = splitIntoWindows(text)
    result.windowsProcessed = windows.length

    // Fetch existing notes for deduplication
    const { notes: existingNotes } = await queryKnowledgeNotes(foundryId, {
      filters: {},
      pageSize: 200,
      sortBy: 'created_at',
      sortOrder: 'desc',
    })

    const existingTitles = new Set(
      existingNotes.map((n) => normalizeForDedup(n.title))
    )

    // Fetch domains for matching
    const domains = await getKnowledgeDomains(foundryId)
    const domainBySlug = new Map<string, KnowledgeDomain>()
    for (const d of domains) {
      domainBySlug.set(d.slug, d)
    }

    // Track titles extracted in this run to avoid cross-window duplicates
    const extractedTitlesThisRun = new Set<string>()

    // Process each window sequentially to avoid overwhelming the API
    for (let i = 0; i < windows.length; i++) {
      try {
        const extracted = await callDocumentExtractionLLM(windows[i])

        for (const note of extracted) {
          const normalized = normalizeForDedup(note.title)

          // Deduplicate against existing vault + this run
          if (existingTitles.has(normalized) || extractedTitlesThisRun.has(normalized)) {
            result.skipped++
            continue
          }

          const domainId = note.suggested_domain
            ? domainBySlug.get(note.suggested_domain)?.id ?? null
            : null

          const savedNote = await createKnowledgeNote(foundryId, {
            title: note.title,
            content: note.content,
            description: note.description,
            note_type: note.note_type,
            domain_id: domainId,
            source_specialist: null,
            source_thread_id: null,
            confidence: note.confidence,
            tags: note.tags,
            extraction_metadata: {
              source_type: 'document',
              document_name: documentName,
              extraction_version: 1,
              window_index: i,
              total_windows: windows.length,
              extracted_at: new Date().toISOString(),
            },
          })

          if (savedNote) {
            result.saved++
            extractedTitlesThisRun.add(normalized)

            // Fire-and-forget: discover connections to existing notes
            discoverConnections(
              foundryId,
              savedNote.id,
              savedNote.title,
              savedNote.content,
              note.tags,
              false
            ).catch(() => { /* connection discovery is best-effort */ })
          }
        }
      } catch (windowErr) {
        const message = windowErr instanceof Error ? windowErr.message : 'Unknown error'
        console.error('[KnowledgeVault/DocExtractor] Window extraction failed:', {
          foundryId,
          documentName,
          windowIndex: i,
          error: message,
        })
        result.errors.push(`Window ${i + 1}: ${message}`)
      }
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[KnowledgeVault/DocExtractor] Extraction failed:', {
      foundryId,
      documentName,
      error: message,
    })
    result.errors.push(message)
    return result
  }
}

// ─── Text Windowing ──────────────────────────────────────────────────

/**
 * Splits document text into overlapping windows for extraction.
 *
 * DECISION: Overlapping windows prevent knowledge at window boundaries
 * from being missed. The deduplication step handles any duplicates
 * created by the overlap.
 */
function splitIntoWindows(text: string): string[] {
  if (text.length <= CHARS_PER_WINDOW) {
    return [text]
  }

  const windows: string[] = []
  let start = 0

  while (start < text.length && windows.length < MAX_WINDOWS) {
    const end = Math.min(start + CHARS_PER_WINDOW, text.length)
    windows.push(text.slice(start, end))

    if (end >= text.length) break
    start = end - WINDOW_OVERLAP_CHARS
  }

  return windows
}

// ─── LLM Call ────────────────────────────────────────────────────────

/**
 * Calls the extraction LLM for a single document window.
 */
async function callDocumentExtractionLLM(
  windowText: string
): Promise<ExtractedNote[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[KnowledgeVault/DocExtractor] OPENAI_API_KEY not set, skipping extraction')
    return []
  }

  const openai = new OpenAI({ apiKey })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: DOCUMENT_EXTRACTION_PROMPT },
      {
        role: 'user',
        content: `Extract knowledge from the following document section:\n\n${windowText}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      console.warn('[KnowledgeVault/DocExtractor] LLM response is not an array')
      return []
    }

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
          : 0.7,
        tags: Array.isArray(note.tags)
          ? (note.tags as string[]).filter((t) => typeof t === 'string').slice(0, 10)
          : [],
        suggested_domain: typeof note.suggested_domain === 'string'
          ? note.suggested_domain
          : null,
        suggested_links: [],
      }))
  } catch {
    console.error('[KnowledgeVault/DocExtractor] Failed to parse LLM response:', {
      responseLength: content.length,
      firstChars: content.slice(0, 100),
    })
    return []
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
