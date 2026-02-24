/**
 * @file slack.ts — Slack message sending external action handler.
 *
 * @description Sends a Slack message from specialist-proposed data.
 * Called from external-integrations.ts after founder approval.
 *
 * @security Requires founder approval. Never auto-executed.
 * Requires SLACK_BOT_TOKEN in env vars.
 */

export interface SlackMessagePayload {
    channel: string
    message: string
    /** Optional thread timestamp to reply in a thread */
    threadTs?: string
}

/**
 * Send a Slack message via the Web API.
 *
 * @param payload - Message details from the specialist proposal
 * @returns Success status or error
 */
export async function sendSlackMessage(
    payload: SlackMessagePayload,
): Promise<{ success: boolean; error: string | null }> {
    const token = process.env.SLACK_BOT_TOKEN
    if (!token) {
        return { success: false, error: "Slack integration not configured. Add SLACK_BOT_TOKEN to environment." }
    }

    try {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                channel: payload.channel,
                text: payload.message,
                ...(payload.threadTs ? { thread_ts: payload.threadTs } : {}),
            }),
        })

        const data = await response.json()

        if (data.ok) {
            return { success: true, error: null }
        }

        return { success: false, error: data.error ?? "Failed to send Slack message" }
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Slack API error" }
    }
}
