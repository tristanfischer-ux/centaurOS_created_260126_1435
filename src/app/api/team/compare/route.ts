import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getFoundryIdCached } from "@/lib/supabase/foundry-context";
import { aiGuard } from "@/lib/ai/guard";

/**
 * @file Team Member Comparison API
 * 
 * @description AI-powered analysis to recommend the best team member
 * for task assignment or delegation based on workload, skills, and availability.
 * 
 * @security
 * - Requires authenticated user
 * - Rate limited to prevent cost abuse (5 req/min/user)
 * - Input validated with Zod schema
 * - User must be in the same foundry as compared members
 * 
 * @audit Logs comparison requests for analytics
 */

// SECURITY: Zod schema for input validation
const TeamMemberSchema = z.object({
    id: z.string().uuid(),
    full_name: z.string().nullable(),
    email: z.string().email().nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    role: z.string(),
    activeTasks: z.number().int().min(0),
    completedTasks: z.number().int().min(0),
    pendingTasks: z.number().int().min(0),
    rejectedTasks: z.number().int().min(0),
    paired_ai_id: z.string().uuid().nullable().optional(),
    pairedAI: z.array(z.object({
        id: z.string(),
        full_name: z.string().nullable(),
    })).nullable().optional(),
});

const CompareRequestSchema = z.object({
    members: z.array(TeamMemberSchema).min(2).max(4),
    taskContext: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        urgency: z.enum(['low', 'medium', 'high']).optional(),
    }).optional(),
});

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }

    return openaiClient
}

// Response types
export interface CompareResponse {
    winner: string;
    winnerName: string;
    reasoning: string;
    tradeoffs: string[];
    summary: string;
}

/**
 * POST /api/team/compare
 * 
 * @description Analyze team members and recommend the best choice
 * for task assignment based on workload and availability.
 * 
 * @security Requires authentication, rate limited
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        // SECURITY: Validate API key is present
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('[TeamCompareAPI] OPENAI_API_KEY is not configured');
            return NextResponse.json(
                { error: "AI comparison service is not configured" },
                { status: 503 }
            );
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { error: "AI comparison service is not configured" },
                { status: 503 }
            );
        }
        
        // AUTH: Authenticate user
        const supabase = await createClient();
        const guard = await aiGuard(supabase, 'comparison_assistant');
        if (guard.denied) return guard.response;
        const user = { id: guard.userId };

        // SECURITY: Rate limit to prevent OpenAI cost abuse (5 requests per minute per user)
        const rateLimitResult = await rateLimit('api', `team-compare:${user.id}`, { limit: 5, window: 60 * 1000 });
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before comparing again." },
                { status: 429 }
            );
        }

        // VALIDATION: Validate request body with Zod
        const body = await req.json();
        const validation = CompareRequestSchema.safeParse(body);
        
        if (!validation.success) {
            console.error('[TeamCompareAPI] Validation failed:', validation.error.issues);
            return NextResponse.json(
                { error: "Invalid request data" },
                { status: 400 }
            );
        }
        
        const { members, taskContext } = validation.data;

        // SECURITY: Verify foundry isolation - all members must belong to user's foundry
        const foundry_id = await getFoundryIdCached();
        if (!foundry_id) {
            return NextResponse.json(
                { error: "User not in a foundry" },
                { status: 403 }
            );
        }

        // Verify all member IDs belong to the same foundry
        const memberIds = members.map(m => m.id);
        const { data: memberProfiles, error: memberError } = await supabase
            .from('profiles')
            .select('id, foundry_id')
            .in('id', memberIds);

        if (memberError || !memberProfiles) {
            console.error('[TeamCompareAPI] Failed to verify members:', memberError);
            return NextResponse.json(
                { error: "Failed to verify team members" },
                { status: 500 }
            );
        }

        // Check all members belong to user's foundry
        const invalidMembers = memberProfiles.filter(p => p.foundry_id !== foundry_id);
        if (invalidMembers.length > 0) {
            console.warn('[TeamCompareAPI] Cross-foundry comparison attempt:', {
                userId: user.id,
                userFoundry: foundry_id,
                invalidMembers: invalidMembers.map(m => ({ id: m.id, foundry: m.foundry_id }))
            });
            return NextResponse.json(
                { error: "Unauthorized: All team members must belong to your foundry" },
                { status: 403 }
            );
        }

        // Ensure we found all requested members
        if (memberProfiles.length !== memberIds.length) {
            console.warn('[TeamCompareAPI] Some members not found:', {
                requested: memberIds.length,
                found: memberProfiles.length
            });
            return NextResponse.json(
                { error: "Some team members could not be found" },
                { status: 404 }
            );
        }

        // Build the prompt
        const systemPrompt = `You are an expert advisor helping founders and executives delegate tasks effectively within their team.

Your task is to analyze the provided team members and recommend who would be the best fit for task assignment, considering:
1. Current workload (fewer active tasks = more capacity)
2. Track record (completed tasks, rejection rate)
3. Role fit (some roles are better suited for certain tasks)
4. AI pairing (AI-paired members may handle certain tasks better)

Guidelines:
- Prioritize team members with capacity (lower active + pending tasks)
- Consider completion rate as an indicator of reliability
- Be practical - founders need clear recommendations
- Acknowledge trade-offs between options

Return ONLY a raw JSON object (no markdown formatting) with this exact structure:
{
    "winner": "member-id-here",
    "winnerName": "Full name of the recommended member",
    "reasoning": "2-3 sentences explaining why this person is the best choice for delegation",
    "tradeoffs": ["Trade-off 1: Why you might consider someone else", "Trade-off 2: ..."],
    "summary": "One sentence bottom-line recommendation"
}`;

        // Format members for the prompt
        const membersDescription = members.map((member, index) => {
            const bandwidth = calculateBandwidth(member.activeTasks, member.pendingTasks);
            const aiPairingStatus = member.paired_ai_id && member.pairedAI?.[0]
                ? `AI-Paired (with ${member.pairedAI[0].full_name})`
                : 'Not paired with AI';
            
            return `${index + 1}. **${member.full_name || 'Unknown'}** (ID: ${member.id})
   Role: ${member.role}
   Bandwidth: ${bandwidth.label} (${bandwidth.score}% utilized)
   Active Tasks: ${member.activeTasks}
   Pending Tasks: ${member.pendingTasks}
   Completed Tasks: ${member.completedTasks}
   Rejected Tasks: ${member.rejectedTasks}
   AI Pairing: ${aiPairingStatus}
   ${member.bio ? `Bio: ${member.bio.substring(0, 200)}${member.bio.length > 200 ? '...' : ''}` : ''}`;
        }).join("\n\n");

        const contextSection = taskContext 
            ? `\nTask Context:
- Title: ${taskContext.title || "Not specified"}
- Description: ${taskContext.description || "Not specified"}
- Urgency: ${taskContext.urgency || "Not specified"}`
            : "";

        const userPrompt = `Please compare these ${members.length} team members and recommend who should be assigned a new task:

${membersDescription}
${contextSection}

Analyze their availability and recommend the best person for task delegation.`;

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        });

        // AUDIT: Track AI usage
        await guard.trackUsage({
            model: 'gpt-4.1-mini',
            promptTokens: completion.usage?.prompt_tokens || 1000,
            completionTokens: completion.usage?.completion_tokens || 500,
        });

        if (!completion.choices || completion.choices.length === 0) {
            return NextResponse.json(
                { error: "AI returned no response" },
                { status: 500 }
            );
        }

        const content = completion.choices[0].message.content;
        if (!content) {
            return NextResponse.json(
                { error: "AI returned empty content" },
                { status: 500 }
            );
        }

        // Clean up potential markdown formatting
        const cleanedContent = content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        try {
            const parsed = JSON.parse(cleanedContent);

            // Validate the response structure
            const response: CompareResponse = {
                winner: String(parsed.winner || members[0].id),
                winnerName: String(parsed.winnerName || members[0].full_name || 'Unknown'),
                reasoning: String(parsed.reasoning || "Unable to generate reasoning"),
                tradeoffs: Array.isArray(parsed.tradeoffs)
                    ? parsed.tradeoffs.map((t: unknown) => String(t))
                    : [],
                summary: String(parsed.summary || "Unable to generate summary"),
            };

            // Verify the winner ID matches one of the input members
            const winnerMember = members.find(m => m.id === response.winner);
            if (!winnerMember) {
                // AI returned invalid winner ID, default to first member
                response.winner = members[0].id;
                response.winnerName = members[0].full_name || 'Unknown';
            }

            // AUDIT: Log successful comparison (could write to analytics table)
            console.info('[TeamCompareAPI] Comparison completed:', {
                userId: user.id,
                memberCount: members.length,
                recommendedMember: response.winner,
            });

            return NextResponse.json(response);

        } catch (parseError) {
            console.error("[TeamCompareAPI] Failed to parse AI response:", parseError);
            console.error("[TeamCompareAPI] Raw content:", cleanedContent);
            return NextResponse.json(
                { error: "Failed to parse AI response. Please try again." },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error("[TeamCompareAPI] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * Calculate bandwidth score and label from task counts.
 * Uses same formula as routing-agent.ts.
 */
function calculateBandwidth(activeTasks: number, pendingTasks: number): { 
    label: string; 
    score: number 
} {
    const score = Math.min(100, (activeTasks * 20) + (pendingTasks * 10));
    if (score <= 40) {
        return { label: 'Has capacity', score };
    } else if (score <= 70) {
        return { label: 'At capacity', score };
    } else {
        return { label: 'Overloaded', score };
    }
}
