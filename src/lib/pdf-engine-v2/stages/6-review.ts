import type { Module, SpecialistReview, ResearchResult, StageResult } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'

/**
 * Stage 6: Review
 * Runs Fang engineering review per module, then cross-module proofreader.
 */
export async function runReview(
  modules: Module[],
  research: ResearchResult
): Promise<StageResult<{ reviews: SpecialistReview[]; proofreadFindings: string }>> {
  const start = Date.now()
  
  try {
    const reviews: SpecialistReview[] = []
    
    // Process sequentially to avoid OpenRouter rate limits
    for (const mod of modules) {
      console.log(`[review] Fang reviewing module ${mod.id}...`)
      try {
        const review = await fangReview(mod, research)
        reviews.push(review)
      } catch (err) {
        console.error(`Failed to review module ${mod.id}:`, err)
        // Don't fail the whole stage
      }
    }
    
    let proofreadFindings = ''
    try {
      console.log(`[review] Proofreader checking all modules...`)
      proofreadFindings = await proofread(modules, reviews, research)
    } catch (err) {
      console.error('Failed to run proofreader:', err)
      // Don't fail the whole stage
    }

    return {
      ok: true,
      data: {
        reviews,
        proofreadFindings
      },
      durationMs: Date.now() - start
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during review stage',
      durationMs: Date.now() - start
    }
  }
}

async function fangReview(module: Module, research: ResearchResult): Promise<SpecialistReview> {
  const prompt = `You are Fang, VP of Manufacturing. Review this module for manufacturability, engineering soundness, material selection, tolerance feasibility, and risk assessment.

Module: ${module.name} (${module.purpose})
Description: ${module.description}
Failure Modes: ${(module.failureModes || []).join(', ')}
Key Parts: ${(module.keyParts || []).join(', ')}

Respond in valid JSON matching this schema:
{
  "verdict": "pass" | "warn" | "fail",
  "summary": "1-2 sentence summary",
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "manufacturability" | "engineering" | "materials" | "tolerances" | "risk",
      "message": "issue description",
      "suggestion": "optional suggestion"
    }
  ],
  "recommendations": ["actionable step 1"],
  "reviewMarkdown": "full review text"
}
`

  const controller = new AbortController()
  const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'xiaomi/mimo-v2.5-pro',
      max_tokens: 16384,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an expert manufacturing engineer. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
    }),
    signal: controller.signal,
  })

  // 60-second timeout using Promise.race as recommended by memory
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Fang review request timed out'))
    }, 60000)
  })

  let response: Response
  try {
    response = await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const msg = data.choices?.[0]?.message
  const content = msg?.content || msg?.reasoning || (msg?.reasoning_details?.length
    ? msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    : '')
  
  // Extract JSON in case LLM wraps it in markdown blocks
  let parsed: any = {}
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1])
    } else {
      parsed = JSON.parse(content)
    }
  } catch (err) {
    console.error('Failed to parse Fang review JSON:', err, content)
    throw new Error('Invalid JSON from Fang review')
  }

  return {
    specialistId: module.id,
    specialistName: 'Fang',
    verdict: parsed.verdict || 'warn',
    summary: sanitiseLlmOutput(parsed.summary || ''),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((i: any) => ({
      severity: i.severity || 'warning',
      category: i.category || 'engineering',
      message: sanitiseLlmOutput(i.message || ''),
      suggestion: i.suggestion ? sanitiseLlmOutput(i.suggestion) : undefined
    })) : [],
    recommendations: Array.isArray(parsed.recommendations) 
      ? parsed.recommendations.map((r: string) => sanitiseLlmOutput(r)) 
      : [],
    reviewMarkdown: sanitiseLlmOutput(parsed.reviewMarkdown || ''),
    reviewedAt: new Date().toISOString()
  }
}

async function proofread(
  modules: Module[],
  reviews: SpecialistReview[],
  research: ResearchResult
): Promise<string> {
  const prompt = `You are an expert engineering proofreader. Check these modules for cross-module consistency against the research.
Check that risk registers cover key hazards, failure modes are plausible, and flag any contradictions between modules.

Modules: ${JSON.stringify(modules.map(m => ({ 
  name: m.name, 
  desc: m.description, 
  risks: m.riskMatrix, 
  failureModes: m.failureModes 
})))}
Research Context: ${research.report}

Return a structured text summary of your findings.`

  const controller = new AbortController()
  const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'xiaomi/mimo-v2.5-pro',
      max_tokens: 16384,
      messages: [
        { role: 'system', content: 'You are an expert engineering proofreader.' },
        { role: 'user', content: prompt }
      ],
    }),
    signal: controller.signal,
  })

  // 60-second timeout
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Proofreader request timed out'))
    }, 60000)
  })

  let response: Response
  try {
    response = await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const msg = data.choices?.[0]?.message
  const content = msg?.content || msg?.reasoning || (msg?.reasoning_details?.length
    ? msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    : '')
  
  return sanitiseLlmOutput(content)
}
