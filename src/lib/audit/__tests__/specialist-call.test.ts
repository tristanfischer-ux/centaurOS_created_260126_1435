import { recordSpecialistCall } from '../specialist-call'

const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const VALID_FOUNDRY_ID = 'foundry-test-001'
const FAKE_INSERTED_ID = '550e8400-e29b-41d4-a716-446655440099'

// Capture inserts so each test can assert the exact dual-write payload that
// hits public.audit_log. The Postgres trigger
// (20260422001200_money_ai_credits.sql) keys off this payload to write the
// ai_credits_ledger row, so the field shape here is load-bearing.
let capturedInsert: Record<string, unknown> | null = null
let nextInsertReturn: { data: { id: string } | null; error: { message: string } | null } = {
    data: { id: FAKE_INSERTED_ID },
    error: null,
}

const mockAdminClient = {
    from: jest.fn(() => ({
        insert: jest.fn((payload: Record<string, unknown>) => {
            capturedInsert = payload
            return {
                select: jest.fn(() => ({
                    single: jest.fn(() => Promise.resolve(nextInsertReturn)),
                })),
            }
        }),
    })),
}

jest.mock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => mockAdminClient),
}))

beforeEach(() => {
    jest.clearAllMocks()
    capturedInsert = null
    nextInsertReturn = {
        data: { id: FAKE_INSERTED_ID },
        error: null,
    }
})

describe('recordSpecialistCall', () => {
    it('writes a specialist_call audit_log row with the dual-write payload', async () => {
        const id = await recordSpecialistCall({
            foundryId: VALID_FOUNDRY_ID,
            specialistId: 'cal',
            section: 'forge',
            model: 'sonnet',
            inputTokens: 1200,
            outputTokens: 450,
            durationMs: 3210,
            invokedByUserId: VALID_USER_ID,
            invocationId: 'trace-abc-123',
        })

        expect(id).toBe(FAKE_INSERTED_ID)
        expect(mockAdminClient.from).toHaveBeenCalledWith('audit_log')
        expect(capturedInsert).not.toBeNull()
        expect(capturedInsert).toMatchObject({
            foundry_id: VALID_FOUNDRY_ID,
            user_id: VALID_USER_ID,
            actor_user_id: VALID_USER_ID,
            actor_specialist: 'cal',
            action: 'specialist_call',
            event: 'specialist_call',
            entity_type: 'specialist_call',
            section: 'forge',
        })
        // Dual-write: payload + metadata must contain the same jsonb so legacy
        // and SHARED-§1.3 readers see the same shape, AND the ai_credits trigger
        // can read from either column.
        expect(capturedInsert?.payload).toEqual({
            model: 'sonnet',
            input_tokens: 1200,
            output_tokens: 450,
            duration_ms: 3210,
            specialist_id: 'cal',
            invocation_id: 'trace-abc-123',
        })
        expect(capturedInsert?.metadata).toEqual(capturedInsert?.payload)
    })

    it('returns null when foundryId is missing (cannot bill)', async () => {
        const id = await recordSpecialistCall({
            foundryId: null,
            specialistId: 'sage',
            section: 'forge',
            model: 'haiku',
            inputTokens: 100,
            outputTokens: 50,
            invokedByUserId: VALID_USER_ID,
        })
        expect(id).toBeNull()
        expect(mockAdminClient.from).not.toHaveBeenCalled()
    })

    it('returns null when invokedByUserId is missing (audit_log.user_id is NOT NULL)', async () => {
        const id = await recordSpecialistCall({
            foundryId: VALID_FOUNDRY_ID,
            specialistId: 'sage',
            section: 'forge',
            model: 'haiku',
            inputTokens: 100,
            outputTokens: 50,
            invokedByUserId: null,
        })
        expect(id).toBeNull()
        expect(mockAdminClient.from).not.toHaveBeenCalled()
    })

    it('swallows insert errors and returns null (cost tracking is non-fatal)', async () => {
        nextInsertReturn = {
            data: null,
            error: { message: 'connection lost' },
        }
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

        const id = await recordSpecialistCall({
            foundryId: VALID_FOUNDRY_ID,
            specialistId: 'finn',
            section: 'money',
            model: 'opus',
            inputTokens: 800,
            outputTokens: 200,
            invokedByUserId: VALID_USER_ID,
        })
        expect(id).toBeNull()
        expect(errSpy).toHaveBeenCalled()
        errSpy.mockRestore()
    })

    it('omits optional fields cleanly when not provided', async () => {
        await recordSpecialistCall({
            foundryId: VALID_FOUNDRY_ID,
            specialistId: 'priya',
            section: 'plan',
            model: 'deepseek-v4',
            inputTokens: 5,
            outputTokens: 5,
            invokedByUserId: VALID_USER_ID,
        })
        expect(capturedInsert?.payload).toEqual({
            model: 'deepseek-v4',
            input_tokens: 5,
            output_tokens: 5,
            duration_ms: null,
            specialist_id: 'priya',
            invocation_id: null,
        })
        expect(capturedInsert?.entity_id).toBeNull()
    })
})
