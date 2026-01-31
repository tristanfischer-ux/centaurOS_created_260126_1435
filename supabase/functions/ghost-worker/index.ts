import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

// SECURITY: Validate required environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const openaiKey = Deno.env.get('OPENAI_API_KEY')

if (!supabaseUrl || !supabaseKey) {
    console.error('[CRITICAL] Missing required Supabase environment variables')
}

const openai = new OpenAI({
    apiKey: openaiKey,
})

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

// SECURITY: Sanitize text for AI prompts to prevent injection
function sanitizeForPrompt(text: string | null | undefined): string {
    if (!text) return ''
    return text
        .replace(/[<>]/g, '')
        .substring(0, 10000)
}

// SECURITY: Validate UUID format
function isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
}

Deno.serve(async (req) => {
    // SECURITY: Verify authorization header
    const authHeader = req.headers.get('Authorization')
    const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    // SECURITY: Check environment configuration
    if (!supabase || !openaiKey) {
        return new Response(JSON.stringify({ error: 'Service configuration error' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    try {
        const payload = await req.json()
        const { record } = payload

        // SECURITY: Validate payload structure
        if (!record || typeof record !== 'object') {
            return new Response(JSON.stringify({ error: 'Invalid payload' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        // Only process INSERT or UPDATE where assignee_id changed
        if (!record.assignee_id) {
            return new Response('No assignee', { status: 200 })
        }

        // SECURITY: Validate assignee_id is a valid UUID
        if (!isValidUUID(record.assignee_id)) {
            return new Response(JSON.stringify({ error: 'Invalid assignee ID' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            })
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
        // SECURITY: Sanitize user-controlled input before using in prompts
        const sanitizedTitle = sanitizeForPrompt(record.title)
        const sanitizedDescription = sanitizeForPrompt(record.description)
        const sanitizedName = sanitizeForPrompt(profile.full_name)
        
        const systemPrompt = `You are ${sanitizedName}, a highly capable AI employee at a fractional foundry.
    Your role is: ${sanitizedName}.
    
    You have been assigned a task. You must execute it or provide a detailed plan/draft.
    Output your work directly. Do not be chatty.`

        // SECURITY: Separate system instructions from user-controlled content
        const userMessage = `Task: ${sanitizedTitle}
Description: ${sanitizedDescription}
${context}

Execute this task.`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
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
        console.error('[ghost-worker] Error:', error instanceof Error ? error.message : 'Unknown error')
        // SECURITY: Don't expose internal error details to clients
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        })
    }
})
