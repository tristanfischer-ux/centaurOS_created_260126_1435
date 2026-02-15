/**
 * @file temporal-context.ts
 *
 * @description Generates time-aware context that specialists use to adapt
 * their tone, urgency, and recommendations based on when the conversation
 * is happening. A real colleague would know it's 11pm on a Friday and
 * respond differently than at 9am on Monday.
 *
 * Provides:
 * - Time-of-day awareness (morning, afternoon, evening, late night)
 * - Day-of-week context (Monday energy, Friday wrap-up, weekend)
 * - Calendar quarter awareness (end-of-quarter urgency)
 * - Behavioral guidance for each temporal context
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts
 * - Personality compilation: src/lib/agents/personality.ts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TimeOfDay = "early-morning" | "morning" | "afternoon" | "evening" | "late-night"
export type DayContext = "monday" | "midweek" | "friday" | "weekend"
export type QuarterPosition = "start" | "middle" | "end"

export interface TemporalContext {
    /** Current timestamp in user's perceived timezone */
    timestamp: Date
    /** Time of day bucket */
    timeOfDay: TimeOfDay
    /** Day of week context */
    dayContext: DayContext
    /** Where in the quarter we are */
    quarterPosition: QuarterPosition
    /** Formatted date string for display */
    formattedDate: string
    /** Formatted time string for display */
    formattedTime: string
    /** Behavioral guidance for the AI based on temporal context */
    behavioralGuidance: string
}

// ─── Time Classification ────────────────────────────────────────────────────

/**
 * Classifies the current hour into a time-of-day bucket.
 *
 * @param hour - Hour in 24h format (0-23)
 * @returns Time of day classification
 */
function classifyTimeOfDay(hour: number): TimeOfDay {
    if (hour >= 5 && hour < 9) return "early-morning"
    if (hour >= 9 && hour < 12) return "morning"
    if (hour >= 12 && hour < 17) return "afternoon"
    if (hour >= 17 && hour < 22) return "evening"
    return "late-night" // 22-4
}

/**
 * Classifies the day of week into a context bucket.
 *
 * @param dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 * @returns Day context classification
 */
function classifyDayContext(dayOfWeek: number): DayContext {
    if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend"
    if (dayOfWeek === 1) return "monday"
    if (dayOfWeek === 5) return "friday"
    return "midweek"
}

/**
 * Determines position within the current fiscal quarter.
 *
 * @param month - Month (0-11)
 * @param day - Day of month (1-31)
 * @returns Quarter position
 */
function classifyQuarterPosition(month: number, day: number): QuarterPosition {
    const monthInQuarter = month % 3 // 0, 1, or 2
    if (monthInQuarter === 0 && day <= 15) return "start"
    if (monthInQuarter === 2 && day >= 15) return "end"
    return "middle"
}

// ─── Behavioral Guidance ────────────────────────────────────────────────────

/**
 * Generates specific behavioral guidance based on temporal context.
 * This guidance is injected into the specialist's system prompt to
 * adapt their communication style.
 */
function generateBehavioralGuidance(
    timeOfDay: TimeOfDay,
    dayContext: DayContext,
    quarterPosition: QuarterPosition,
    formattedDate: string,
    formattedTime: string,
): string {
    const lines: string[] = [
        `Current time: ${formattedDate}, ${formattedTime}`,
    ]

    // Time-of-day adaptation
    switch (timeOfDay) {
        case "early-morning":
            lines.push("The founder is up early — they're likely energized and forward-looking. Match that energy. This is planning time.")
            break
        case "morning":
            lines.push("Peak working hours. The founder has mental energy for complex decisions. Bring your best analysis now.")
            break
        case "afternoon":
            lines.push("Afternoon working session. Be structured and efficient — cognitive energy may be lower. Lead with the key insight.")
            break
        case "evening":
            lines.push("It's evening. The founder is likely wrapping up or doing deep thinking. Be concise. Skip preamble. Get to the point faster than usual.")
            break
        case "late-night":
            lines.push("It's late. The founder is burning midnight oil — respect their time and energy. Be exceptionally concise and supportive. Skip the challenges for now; give them what they need to move forward and rest.")
            break
    }

    // Day-of-week adaptation
    switch (dayContext) {
        case "monday":
            lines.push("It's Monday — week-planning energy. Tie your advice to what can be accomplished this week. Set the agenda.")
            break
        case "midweek":
            lines.push("Midweek — execution mode. Focus on unblocking progress and making decisions that keep momentum.")
            break
        case "friday":
            lines.push("It's Friday — wrap-up energy. Help the founder close loops and set up next week. Avoid opening big new threads unless urgent.")
            break
        case "weekend":
            lines.push("The founder is working on the weekend — they're either deeply committed or dealing with something urgent. Keep things focused and don't create more work than necessary.")
            break
    }

    // Quarter position
    switch (quarterPosition) {
        case "start":
            lines.push("Start of quarter — planning and goal-setting energy. Good time for strategic discussions and ambitious commitments.")
            break
        case "middle":
            // No additional guidance needed for mid-quarter
            break
        case "end":
            lines.push("End of quarter approaching — deadline energy. Focus on what can realistically be completed. Flag anything at risk of missing targets.")
            break
    }

    return lines.join("\n")
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Builds a complete temporal context object for the current moment.
 *
 * @description Analyzes the current date and time to generate context
 * that helps specialists adapt their communication style. A late-night
 * response should feel different from a Monday morning response.
 *
 * @param now - Optional override for testing (defaults to current time)
 * @returns Complete temporal context with behavioral guidance
 */
export function buildTemporalContext(now?: Date): TemporalContext {
    const timestamp = now ?? new Date()
    const hour = timestamp.getHours()
    const dayOfWeek = timestamp.getDay()
    const month = timestamp.getMonth()
    const day = timestamp.getDate()

    const timeOfDay = classifyTimeOfDay(hour)
    const dayContext = classifyDayContext(dayOfWeek)
    const quarterPosition = classifyQuarterPosition(month, day)

    const formattedDate = timestamp.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    })
    const formattedTime = timestamp.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    })

    const behavioralGuidance = generateBehavioralGuidance(
        timeOfDay,
        dayContext,
        quarterPosition,
        formattedDate,
        formattedTime,
    )

    return {
        timestamp,
        timeOfDay,
        dayContext,
        quarterPosition,
        formattedDate,
        formattedTime,
        behavioralGuidance,
    }
}

/**
 * Compiles temporal context into a prompt block ready for injection
 * into the specialist system prompt.
 *
 * @param context - Optional pre-built temporal context (builds fresh if omitted)
 * @returns Formatted prompt block string
 */
export function compileTemporalPrompt(context?: TemporalContext): string {
    const ctx = context ?? buildTemporalContext()
    return `## Temporal Awareness\n${ctx.behavioralGuidance}`
}
