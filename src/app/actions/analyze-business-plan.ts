'use server'

import OpenAI from 'openai'
// import pdf from 'pdf-parse'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
})

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
}

export async function analyzeBusinessPlan(formData: FormData): Promise<AnalysisResult> {
    try {
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
            model: 'gpt-4o',
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
    } catch (error) {
        console.error('Error analyzing business plan:', error)
        return { success: false, error: 'Failed to analyze business plan. Please try again.' }
    }
}
