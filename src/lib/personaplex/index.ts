/**
 * @file index.ts — Barrel export for the PersonaPlex integration module.
 *
 * @description Provides a clean public API for the PersonaPlex integration,
 * including the API client, type definitions, and persona mapping utilities.
 *
 * @related
 * - Client: src/lib/personaplex/client.ts
 * - Types: src/lib/personaplex/types.ts
 * - Persona mapping: src/lib/personaplex/persona-mapping.ts
 */

// Types
export type {
    PersonaPlexVoiceId,
    PersonaPlexSessionConfig,
    PersonaPlexEvent,
    PersonaPlexEventType,
    PersonaPlexSessionResponse,
    PersonaPlexClientConfig,
    PersonaPlexUsageRecord,
    SpecialistPersonaPlexMapping,
} from "./types"

export { PERSONAPLEX_VOICES } from "./types"

// Client
export { PersonaPlexClient, createPersonaPlexClient } from "./client"

// Persona mapping
export {
    SPECIALIST_VOICE_MAP,
    compilePersonaPlexPrompt,
    generateAllMappings,
    getPersonaPlexVoice,
} from "./persona-mapping"

// Availability detection
export { checkVoiceBackend, resetVoiceBackendCache } from "./availability"
export type { VoiceBackend } from "./availability"

// Cost model
export {
    PERSONAPLEX_COST_PER_MINUTE,
    SELF_HOST_BREAKEVEN_MINUTES_PER_DAY,
    GROWTH_SCENARIOS,
    calculateSessionCost,
    projectMonthlyCost,
    runAllScenarios,
} from "./cost-model"

export type { CostBreakdown, MonthlyProjection } from "./cost-model"
