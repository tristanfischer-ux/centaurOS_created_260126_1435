import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY'),
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

Deno.serve(async (req) => {
    try {
        const payload = await req.json()
        const { record } = payload

        // Only process INSERT or UPDATE where assignee_id changed
        if (!record.assignee_id) {
            return new Response('No assignee', { status: 200 })
        }

        // Check if Assignee is an AI Agent
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', record.assignee_id)
            .single()

        if (error || !profile || profile.role !== 'AI_Agent') {
            return new Response('Not an AI Agent', { status: 200 })
        }

        console.log(`AI Agent ${profile.full_name} assigned to task: ${record.id}`)

        // Handle "Ghost" Execution
        // 1. Fetch Objective Context if exists
        let context = ""
        if (record.objective_id) {
            const { data: objective } = await supabase
                .from('objectives')
                .select('title, description')
                .eq('id', record.objective_id)
                .single()
            if (objective) {
                context = `\nContext (Objective): ${objective.title} - ${objective.description}`
            }
        }

        // 2. Generate Output with GPT-4o
        const systemPrompt = `You are ${profile.full_name}, a highly capable AI employee at a fractional foundry.
    Your role is: ${profile.full_name}.
    
    You have been assigned a task. You must execute it or provide a detailed plan/draft.
    Output your work directly. Do not be chatty.
    
    Task: ${record.title}
    Description: ${record.description}
    ${context}`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Execute this task." }
            ]
        })

        const aiResponse = completion.choices[0].message.content

        // 3. Update Task with Amendment/Result
        // The "Handshake": AI proposes the work as an amendment for approval.
        await supabase.from('tasks').update({
            status: 'Amended_Pending_Approval',
            amendment_notes: aiResponse,
            // Optional: Add a comment too?
        }).eq('id', record.id)

        // Add a system log comment
        await supabase.from('task_comments').insert({
            task_id: record.id,
            user_id: record.assignee_id,
            content: "I have drafted a solution/response in the amendment notes for your review.",
            is_system_log: true,
            foundry_id: record.foundry_id
        })

        return new Response('AI Execution Complete', { status: 200 })

    } catch (error) {
        console.error(error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
})
