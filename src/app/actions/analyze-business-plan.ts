'use server'

import OpenAI from 'openai'
import { withAIGate } from '@/lib/ai/with-ai-gate'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })
    }

    return openaiClient
}

export type ExtractedTask = {
    title: string
    description?: string
    status: 'Pending'
}

export type ExtractedObjective = {
    title: string
    description?: string
    status: 'In Progress'
    tasks: ExtractedTask[]
}

export type AnalysisResult = {
    success: boolean
    data?: ExtractedObjective[]
    error?: string
    limitReached?: boolean
}

export async function analyzeBusinessPlan(formData: FormData): Promise<AnalysisResult> {
    return withAIGate('business_plan_analysis', async ({ trackUsage }) => {
        const openai = getOpenAIClient()
        if (!openai) {
            return { success: false, error: 'AI analysis service is not configured' }
        }

        const file = formData.get('file') as File
        const textInput = formData.get('text') as string

        if (!file && !textInput) {
            return { success: false, error: 'No file or text provided' }
        }

        let contentToAnalyze = ''

        if (file) {
            if (file.type === 'application/pdf') {
                const arrayBuffer = await file.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdf = require('pdf-parse')
                const pdfData = await pdf(buffer)
                contentToAnalyze = pdfData.text
            } else {
                contentToAnalyze = await file.text()
            }
        } else {
            contentToAnalyze = textInput
        }

        if (!contentToAnalyze.trim()) {
            return { success: false, error: 'Could not extract text from input' }
        }

        const completion = await openai.chat.completions.create({
            model: 'openai/gpt-5.4',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert business analyst AI. Your goal is to analyze business plans and extract strategic objectives and actionable tasks.

          Output JSON format:
          {
            "objectives": [
              {
                "title": "Objective Title",
                "description": "Brief description of the objective",
                "tasks": [
                  {
                    "title": "Task Title",
                    "description": "Task description"
                  }
                ]
              }
            ]
          }

          Guidelines:
          - Analyze the entire document and extract ALL distinct structural pillars or strategic goals found.
          - Do not limit the number of objectives; capture everything relevant to the plan's success.
          - For each objective, identify all specific, actionable tasks required to achieve it.
          - Ensure tasks are concrete implementation steps, not just vague concepts.
          - Keep descriptions concise but informative.
          `,
                },
                {
                    role: 'user',
                    content: contentToAnalyze,
                },
            ],
            response_format: { type: 'json_object' },
        })

        await trackUsage({
            model: 'openai/gpt-5.4',
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
        })

        const result = JSON.parse(completion.choices[0].message.content || '{}') as { objectives: ExtractedObjective[] }

        // Add default status
        const objectives = result.objectives?.map(obj => ({
            ...obj,
            status: 'In Progress' as const,
            tasks: obj.tasks?.map(task => ({
                ...task,
                status: 'Pending' as const
            })) || []
        })) || []

        return { success: true, data: objectives }
    })
}
