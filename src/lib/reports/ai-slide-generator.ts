/**
 * @file ai-slide-generator.ts
 *
 * @description Server-side module that generates a complete strategic briefing
 * slide deck using the GPT-5.5 API. Unlike ai-narrative.ts which generates a
 * single summary, this module produces the ENTIRE document structure -- every
 * slide, headline, body paragraph, and data point -- from source context.
 *
 * INTENT: Produce high-quality executive presentations by having GPT-5.5 generate
 * 100% of the content structure, not just an executive summary.
 *
 * @related
 * - src/lib/reports/slide-deck-types.ts — Type definitions
 * - src/lib/reports/ai-narrative.ts — Simpler narrative generation (same SDK pattern)
 * - src/components/reports/SlideDeckRenderer.tsx — Renders the generated slides
 */

import type {
  SlideContent,
  StrategicBriefing,
  GenerateBriefingRequest,
  GenerateBriefingResponse,
} from './slide-deck-types'
import { generateSlideBackgroundImage } from './report-image-generator'

// DECISION: GPT-5.5 replaces Claude Opus for slide deck generation.
// AbortSignal.timeout() handles timeout. GPT-5.5 is a reasoning model:
// uses max_completion_tokens, not max_tokens.
const MODEL_ID = 'gpt-5.5'
// DECISION: 60s timeout because structured JSON generation with
// 12-18 slides takes significantly longer than a short narrative summary.
const API_TIMEOUT_MS = 60_000

// ─── Tone Instructions ───────────────────────────────────────────

const TONE_INSTRUCTIONS: Record<GenerateBriefingRequest['tone'], string> = {
  internal:
    'Write in casual first-person plural ("We built…", "Our approach…"). ' +
    'Be warm, confident, and team-oriented. Use conversational language.',
  board:
    'Write in formal third-person ("The company has…", "Management believes…"). ' +
    'Be precise, professional, and balanced. Use measured language.',
  investor:
    'Write in a metrics-forward, concise style. Lead with traction and velocity. ' +
    'Every sentence should carry data or insight. Be confident but evidence-based.',
}

// ─── Slide Type Descriptions ─────────────────────────────────────

const SLIDE_TYPE_GUIDE = `
Available slide types (use a variety for visual interest):

- "title": Opening slide. Fields: headline, subtitle, companyName, date.
- "hero-insight": ONE bold insight or key message. Fields: headline (short, punchy), body (1-2 sentences expanding on it), accent (optional category label like "Key Insight" or "Core Thesis").
- "section-divider": Transition between major sections. Fields: headline (section name), subtitle (optional teaser).
- "argument": A claim supported by evidence points. Fields: headline (the claim), body (optional context), supportingPoints (array of 3-5 strings).
- "comparison": Side-by-side contrast. Fields: headline, leftLabel, rightLabel, comparisonPairs (array of {left, right} strings, 3-5 pairs).
- "data-callout": ONE impressive metric or data point. Fields: headline (what this means), value (the number/stat as string), label (what it measures), context (1-2 sentences of why it matters).
- "evidence": A quote, data point, or proof point. Fields: headline, quote (the evidence text), attribution (optional source), analysis (1-2 sentences of interpretation).
- "summary": Closing takeaways. Fields: headline (e.g. "Key Takeaways"), takeaways (array of 3-5 strings), closingLine (optional final sentence).
`

// ─── Main Generator ──────────────────────────────────────────────

/**
 * Generate a complete strategic briefing slide deck from source context.
 *
 * @description Sends source material to GPT-5.5 and receives a fully structured
 * presentation with 12-18 slides. Each slide has a specific visual type and
 * all content needed for rendering.
 *
 * @param request - Source context, tone, and company name
 * @returns Full StrategicBriefing or error
 */
export async function generateStrategicBriefing(
  request: GenerateBriefingRequest,
): Promise<GenerateBriefingResponse> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn('[SlideGenerator] OPENAI_API_KEY not set — using fallback')
    return {
      success: true,
      briefing: buildFallbackBriefing(request),
    }
  }

  try {
    const { systemPrompt, userPrompt } = buildPrompts(request)
    console.info('[SlideGenerator] Prompt length:', (systemPrompt.length + userPrompt.length), 'chars')
    const genStart = Date.now()

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY?.trim()}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_completion_tokens: 8192,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })

    if (!resp.ok) {
      throw new Error(`OpenAI API error (${resp.status})`)
    }

    const data = await resp.json()
    console.info('[SlideGenerator] GPT-5.5 responded in', Date.now() - genStart, 'ms')
    const text = data.choices?.[0]?.message?.content ?? ''
    console.info('[SlideGenerator] Response length:', text.length, 'chars')
    const slides = parseSlideResponse(text)

    if (!slides || slides.length === 0) {
      console.error('[SlideGenerator] No slides parsed from response')
      return {
        success: true,
        briefing: buildFallbackBriefing(request),
      }
    }

    const briefing: StrategicBriefing = {
      id: crypto.randomUUID(),
      title: extractTitle(slides) ?? 'Strategic Briefing',
      subtitle: extractSubtitle(slides) ?? '',
      companyName: request.companyName,
      generatedAt: new Date().toISOString(),
      foundryId: '',
      tone: request.tone,
      slides,
      sourceContext: request.sourceContext,
    }

    // FLOW: Generate background images for visual slides in parallel.
    // Individual failures are non-fatal — slides render without images.
    try {
      const imageableSlides = briefing.slides
        .map((slide, idx) => ({ slide, idx }))
        .filter(({ slide }) =>
          slide.slideType === 'title' ||
          slide.slideType === 'hero-insight' ||
          slide.slideType === 'section-divider'
        )

      if (imageableSlides.length > 0) {
        const imageResults = await Promise.allSettled(
          imageableSlides.map(({ slide, idx }) =>
            generateSlideBackgroundImage(
              briefing.id,
              slide.slideType,
              slide.headline,
              request.companyName,
            ).then(url => ({ idx, url }))
          )
        )

        for (const result of imageResults) {
          if (result.status === 'fulfilled' && result.value.url) {
            const slide = briefing.slides[result.value.idx]
            if (
              slide.slideType === 'title' ||
              slide.slideType === 'hero-insight' ||
              slide.slideType === 'section-divider'
            ) {
              ;(slide as { imageUrl?: string }).imageUrl = result.value.url
            }
          }
        }
      }
    } catch (slideImgErr) {
      console.warn('[SlideGenerator] Slide image generation failed (non-fatal):', slideImgErr)
    }

    return { success: true, briefing }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[SlideGenerator] Generation failed:', { message })
    return {
      success: true,
      briefing: buildFallbackBriefing(request),
    }
  }
}

// ─── Prompt Builder ──────────────────────────────────────────────

// DECISION: Split into system + user prompts. System encodes role/instructions, user carries the data.
function buildPrompts(request: GenerateBriefingRequest): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are an expert presentation designer and executive communication specialist.',
    'Your job is to transform raw source material into a polished, professional slide deck.',
    '',
    '## Instructions',
    '',
    TONE_INSTRUCTIONS[request.tone],
    '',
    '- Create a presentation with 12-18 slides.',
    '- Start with a "title" slide and end with a "summary" slide.',
    '- Use "section-divider" slides to break the presentation into 3-4 major sections.',
    '- Each slide communicates ONE key idea. Headlines should be complete thoughts, not labels.',
    '- Vary the slide types for visual interest. Use at least 4 different types.',
    '- Build a narrative arc: setup/context → analysis/evidence → insights → conclusion.',
    '- Headlines should be assertive statements, not questions. Example: "Revenue grew 47% YoY" not "Revenue Growth".',
    '- Keep text concise. Body text should be 1-3 sentences max.',
    '- For argument slides, each supporting point should be one clear sentence.',
    '- For comparison slides, keep each pair short (under 15 words per side).',
    '- For data-callout slides, the value should be a single striking number or short stat.',
    '- Never use the word "AI" in the output.',
    '',
    '## Slide Types Reference',
    SLIDE_TYPE_GUIDE,
    '',
    '## Output Format',
    '',
    'CRITICAL: Return a single JSON object (not an array). Every slide object MUST include the "slideType" field.',
    '',
    'Return this exact structure:',
    '{"title":"Presentation Title","subtitle":"Brief subtitle","slides":[{"slideType":"title","headline":"...","subtitle":"...","companyName":"...","date":"..."},{"slideType":"hero-insight","headline":"...","body":"...","accent":"Key Insight"},{"slideType":"summary","headline":"Key Takeaways","takeaways":["...","..."],"closingLine":"..."}]}',
    '',
    'Each slide MUST have a "slideType" field set to one of: title, hero-insight, section-divider, argument, comparison, data-callout, evidence, summary.',
    '',
    'Return ONLY the JSON object. No markdown fences, no preamble, no explanation.',
  ].join('\n')

  const userPrompt = [
    `## Company Name: ${request.companyName}`,
    '',
    '## Source Material',
    '',
    request.sourceContext,
  ].join('\n')

  return { systemPrompt, userPrompt }
}

// ─── Response Parser ─────────────────────────────────────────────

// DECISION: We still strip markdown fences and handle edge cases because
// the model can occasionally produce wrapped output.
function parseSlideResponse(raw: string): SlideContent[] | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed: unknown = JSON.parse(cleaned)

    // GOTCHA: The model sometimes wraps the response in an array [{ ... }]
    // instead of returning a plain object { ... }.
    let obj: { title?: string; subtitle?: string; slides?: unknown[] }
    if (Array.isArray(parsed) && parsed.length > 0) {
      obj = parsed[0] as typeof obj
    } else {
      obj = parsed as typeof obj
    }

    if (!Array.isArray(obj?.slides)) {
      console.warn('[SlideGenerator] Response missing slides array:', Object.keys(obj ?? {}))
      return null
    }

    const validSlides = obj.slides.filter(isValidSlide)
    console.info('[SlideGenerator] Parsed', validSlides.length, 'valid slides from', obj.slides.length, 'total')
    return validSlides
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    console.error('[SlideGenerator] JSON parse failed:', { message, rawLength: raw.length })
    return null
  }
}

function isValidSlide(slide: unknown): slide is SlideContent {
  if (typeof slide !== 'object' || slide === null) return false
  const s = slide as Record<string, unknown>
  const validTypes = [
    'title', 'hero-insight', 'argument', 'comparison',
    'data-callout', 'evidence', 'summary', 'section-divider',
  ]
  return (
    typeof s.slideType === 'string' &&
    validTypes.includes(s.slideType) &&
    typeof s.headline === 'string'
  )
}

function extractTitle(slides: SlideContent[]): string | undefined {
  const titleSlide = slides.find(s => s.slideType === 'title')
  return titleSlide?.headline
}

function extractSubtitle(slides: SlideContent[]): string | undefined {
  const titleSlide = slides.find(s => s.slideType === 'title')
  if (titleSlide?.slideType === 'title') {
    return titleSlide.subtitle
  }
  return undefined
}

// ─── Fallback ────────────────────────────────────────────────────

// INTENT: The app must never show a blank deck. This deterministic fallback
// produces a usable (if generic) briefing when the API is unavailable.
function buildFallbackBriefing(request: GenerateBriefingRequest): StrategicBriefing {
  const contextPreview = request.sourceContext.slice(0, 200)

  return {
    id: crypto.randomUUID(),
    title: 'Strategic Briefing',
    subtitle: `Prepared for ${request.companyName}`,
    companyName: request.companyName,
    generatedAt: new Date().toISOString(),
    foundryId: '',
    tone: request.tone,
    slides: [
      {
        slideType: 'title',
        headline: 'Strategic Briefing',
        subtitle: `Prepared for ${request.companyName}`,
        companyName: request.companyName,
        date: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      },
      {
        slideType: 'section-divider',
        headline: 'Context & Background',
        subtitle: 'Setting the stage',
      },
      {
        slideType: 'hero-insight',
        headline: 'Source material provided for analysis',
        body: contextPreview.length >= 200
          ? `${contextPreview}…`
          : contextPreview || 'No source context was provided.',
        accent: 'Overview',
      },
      {
        slideType: 'argument',
        headline: 'Narrative generation requires the OpenAI API',
        body: 'The strategic briefing system uses GPT-5.5 to synthesize source material into a structured presentation.',
        supportingPoints: [
          'Set OPENAI_API_KEY in your environment variables',
          'The system uses GPT-5.5 for high-quality generation',
          'Fallback content is shown when the API is unavailable',
        ],
      },
      {
        slideType: 'summary',
        headline: 'Next Steps',
        takeaways: [
          'Configure the OPENAI_API_KEY environment variable',
          'Provide detailed source material for richer presentations',
          'Choose the right tone for your audience',
        ],
        closingLine: 'Once configured, GPT-5.5 will generate the full presentation from your source material.',
      },
    ],
  }
}

