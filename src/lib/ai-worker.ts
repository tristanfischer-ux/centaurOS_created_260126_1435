import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export async function runAIWorker(taskId: string, assigneeId: string) {
    console.log(`🤖 Ghost Worker triggered for Task ${taskId}`)
    const supabase = await createClient()

    // 1. Verify Assignee is AI
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', assigneeId)
        .single()

    if (!profile || profile.role !== 'AI_Agent') {
        return // Not for us
    }

    try {
        // 2. Fetch Task & Objective
        const { data: task } = await supabase
            .from('tasks')
            .select('*, objective:objective_id(title, description)')
            .eq('id', taskId)
            .single()

        if (!task) return

        // 3. Generate Content
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        })

        const context = task.objective
            ? `\nContext (Objective): ${task.objective.title} - ${task.objective.description}`
            : ""

        const systemPrompt = `You are ${profile.full_name}, a highly capable AI employee.
        Task: ${task.title}
        Description: ${task.description || "No description provided."}
        ${context}
        
        Your goal: Execute this task directly. Provide a concrete output, draft, or solution.
        Do not say "I will do this". DO IT.`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Execute." }
            ]
        })

        const aiResponse = completion.choices[0].message.content || "I have analyzed the task."

        // 4. Update Task (The "Handshake")
        await supabase.from('tasks').update({
            status: 'Amended_Pending_Approval',
            amendment_notes: aiResponse,
        }).eq('id', taskId)

        // 5. Log Comment
        await supabase.from('task_comments').insert({
            task_id: taskId,
            foundry_id: task.foundry_id,
            user_id: assigneeId,
            content: "I have completed a draft. Please review my amendment.",
            is_system_log: true
        })

        console.log(`✅ Ghost Worker completed Task ${taskId}`)

    } catch (e) {
        console.error("Ghost Worker Execution Failed", e)
    }
}
