"use server"

import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export type AnalyzedTask = {
    title: string
    description: string
    role: 'Executive' | 'Apprentice' | 'AI_Agent'
}

export type AnalyzedObjective = {
    title: string
    description: string
    tasks: AnalyzedTask[]
}

export async function analyzeBusinessPlan(formData: FormData): Promise<{ objectives?: AnalyzedObjective[], error?: string }> {
    try {
        const file = formData.get('file') as File
        if (!file) {
            return { error: 'No file provided' }
        }

        let text = ''

        if (file.type === 'application/pdf') {
            const buffer = Buffer.from(await file.arrayBuffer())
            // Use dynamic require to avoid bundling issues in some environments
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse')
            const data = await pdfParse(buffer)
            text = data.text
        } else {
            text = await file.text()
        }

        if (!text || text.length < 50) {
            return { error: 'Could not extract enough text from the file.' }
        }

        // Truncate if too long (approx 100k chars to stay within token limits of generic models, though 4o is generous)
        const truncatedText = text.slice(0, 100000)

        const systemPrompt = `You are an expert business consultant and strategic planner.
        Your goal is to analyze a Business Plan and extract clear, actionable Strategic Objectives.
        
        For each Objective, break it down into 3-5 concrete Tasks.
        Assign a role to each task:
        - 'Executive': High-level decision making, signing, hiring, strategy.
        - 'Apprentice': Research, drafting, manual setup, phone calls.
        - 'AI_Agent': Data entry, generation, coding, analysis, scheduling.

        Return ONLY a raw JSON array of objects with the following structure:
        [
            {
                "title": "Objective Title",
                "description": "Brief description of the objective",
                "tasks": [
                    { "title": "Task 1", "description": "Details...", "role": "Executive" },
                    ...
                ]
            }
        ]
        Do not include markdown formatting like \`\`\`json. Just the raw JSON string.`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Analyze the following business plan:\n\n${truncatedText}` }
            ]
        })

        // Check if choices array exists and has elements before accessing
        if (!completion.choices || completion.choices.length === 0) {
            return { error: 'AI returned no response choices' }
        }

        const content = completion.choices[0].message.content
        if (!content) {
            return { error: 'AI returned no content' }
        }

        const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim()

        try {
            const objectives = JSON.parse(cleanedContent) as AnalyzedObjective[]
            return { objectives }
        } catch (e) {
            console.error("Failed to parse JSON", e)
            return { error: 'Failed to parse AI response' }
        }

    } catch (error) {
        console.error('Analysis failed:', error)
        return { error: 'Failed to analyze document. Please ensure it is a valid PDF or Text file.' }
    }
}
