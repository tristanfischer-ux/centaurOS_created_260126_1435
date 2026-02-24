/**
 * @file linear.ts — Linear issue creation external action handler.
 *
 * @description Creates a Linear issue from specialist-proposed data.
 * Called from external-integrations.ts after founder approval.
 *
 * DECISION: This is a stub that returns structured data for the server action
 * to post via the Linear API. Full integration requires a Linear API key
 * in env vars (LINEAR_API_KEY).
 *
 * @security Requires founder approval. Never auto-executed.
 */

export interface LinearIssuePayload {
    title: string
    description: string
    priority?: "urgent" | "high" | "medium" | "low" | "none"
    labels?: string[]
    teamName?: string
}

/**
 * Create a Linear issue via the API.
 *
 * @param payload - Issue details from the specialist proposal
 * @returns Issue URL or error
 */
export async function createLinearIssue(
    payload: LinearIssuePayload,
): Promise<{ issueUrl: string | null; error: string | null }> {
    const apiKey = process.env.LINEAR_API_KEY
    if (!apiKey) {
        return { issueUrl: null, error: "Linear integration not configured. Add LINEAR_API_KEY to environment." }
    }

    const priorityMap: Record<string, number> = {
        none: 0, urgent: 1, high: 2, medium: 3, low: 4,
    }

    try {
        const response = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: apiKey,
            },
            body: JSON.stringify({
                query: `mutation IssueCreate($input: IssueCreateInput!) {
                    issueCreate(input: $input) {
                        success
                        issue { id identifier url title }
                    }
                }`,
                variables: {
                    input: {
                        title: payload.title,
                        description: payload.description,
                        ...(payload.priority ? { priority: priorityMap[payload.priority] ?? 0 } : {}),
                    },
                },
            }),
        })

        const data = await response.json()
        const issue = data?.data?.issueCreate?.issue

        if (issue?.url) {
            return { issueUrl: issue.url, error: null }
        }

        return { issueUrl: null, error: data?.errors?.[0]?.message ?? "Failed to create Linear issue" }
    } catch (err) {
        return { issueUrl: null, error: err instanceof Error ? err.message : "Linear API error" }
    }
}
