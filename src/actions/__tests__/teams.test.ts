import { deleteTeam, updateTeamName } from '../teams'
import { addTeamMember, removeTeamMember } from '../team'

// Valid UUID test constants
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const VALID_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440002'
const VALID_TEAM_ID = '550e8400-e29b-41d4-a716-446655440003'
const VALID_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440004'
// VALID_MEMBER_ID unused - keeping for potential future tests
// const VALID_MEMBER_ID = '550e8400-e29b-41d4-a716-446655440005'
const VALID_OTHER_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440006'

// Mock Supabase
const mockSupabaseClient = {
    auth: {
        getUser: jest.fn()
    },
    from: jest.fn()
}

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => Promise.resolve(mockSupabaseClient))
}))

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}))

// Mock getFoundryIdCached - this is crucial for the tests to work
jest.mock('@/lib/supabase/foundry-context', () => ({
    getFoundryIdCached: jest.fn(() => Promise.resolve(VALID_FOUNDRY_ID))
}))

describe('Team Actions - Authorization', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default mock setup
        mockSupabaseClient.auth.getUser.mockResolvedValue({
            data: { user: { id: VALID_USER_ID, app_metadata: { foundry_id: VALID_FOUNDRY_ID } } }
        })
    })

    describe('deleteTeam', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await deleteTeam(VALID_TEAM_ID)
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockProfile = { role: 'Executive' }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile })
                            })
                        })
                    }
                }
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: null })
                                })
                            })
                        })
                    }
                }
                if (table === 'task_assignees') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                not: jest.fn().mockResolvedValue({ data: [], error: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await deleteTeam(VALID_TEAM_ID)
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to delete the team' })
        })

        it('should require Executive or Founder role', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockProfile = { role: 'Apprentice' }
            const mockMembership = { profile_id: VALID_USER_ID }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile })
                            })
                        })
                    }
                }
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMembership })
                                })
                            })
                        })
                    }
                }
                if (table === 'task_assignees') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                not: jest.fn().mockResolvedValue({ data: [], error: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await deleteTeam(VALID_TEAM_ID)
            expect(result).toEqual({ error: 'Unauthorized: Only Executives and Founders can delete teams' })
        })

        it('should successfully delete team with proper authorization', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockProfile = { role: 'Executive' }
            const mockMembership = { profile_id: VALID_USER_ID }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile })
                            })
                        })
                    }
                }
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        }),
                        delete: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ error: null })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMembership })
                                })
                            })
                        })
                    }
                }
                if (table === 'task_assignees') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                not: jest.fn().mockResolvedValue({ data: [], error: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await deleteTeam(VALID_TEAM_ID)
            expect(result).toEqual({ success: true })
        })
    })

    describe('updateTeamName', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await updateTeamName(VALID_TEAM_ID, 'New Name')
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: null })
                                })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await updateTeamName(VALID_TEAM_ID, 'New Name')
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to update the team name' })
        })

        it('should successfully update team name with proper authorization', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockMembership = { profile_id: VALID_USER_ID }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        }),
                        update: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ error: null })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMembership })
                                })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await updateTeamName(VALID_TEAM_ID, 'New Name')
            expect(result).toEqual({ success: true })
        })
    })

    describe('addTeamMember', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await addTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should verify foundry matching', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockProfile = { foundry_id: VALID_OTHER_FOUNDRY_ID } // Different foundry
            const mockMembership = { profile_id: VALID_USER_ID }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMembership })
                                })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await addTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ error: 'Unauthorized: Profile not in your Foundry' })
        })

        it('should successfully add team member with proper authorization', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID }
            const mockProfile = { foundry_id: VALID_FOUNDRY_ID }
            const mockMembership = { profile_id: VALID_USER_ID }

            let memberCallCount = 0
            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    memberCallCount++
                    if (memberCallCount === 1) {
                        // Check user membership
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    eq: jest.fn().mockReturnValue({
                                        single: jest.fn().mockResolvedValue({ data: mockMembership })
                                    })
                                })
                            })
                        }
                    } else if (memberCallCount === 2) {
                        // Check if new member already exists
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    eq: jest.fn().mockReturnValue({
                                        single: jest.fn().mockResolvedValue({ data: null }) // Member doesn't exist yet
                                    })
                                })
                            })
                        }
                    } else {
                        // Insert
                        return {
                            insert: jest.fn().mockResolvedValue({ error: null })
                        }
                    }
                }
                return {}
            })

            const result = await addTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ success: true })
        })
    })

    describe('removeTeamMember', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await removeTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID, is_auto_generated: false }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { foundry_id: VALID_FOUNDRY_ID } })
                            })
                        })
                    }
                }
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: null })
                                })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await removeTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to remove members' })
        })

        it('should successfully remove team member with proper authorization', async () => {
            const mockTeam = { foundry_id: VALID_FOUNDRY_ID, is_auto_generated: false }
            const mockMembership = { profile_id: VALID_USER_ID }
            const mockMemberToRemove = { profile_id: VALID_PROFILE_ID }
            const VALID_EXTRA_MEMBER = '550e8400-e29b-41d4-a716-446655440007'
            const mockCurrentMembers = [
                { profile_id: VALID_USER_ID },
                { profile_id: VALID_PROFILE_ID },
                { profile_id: VALID_EXTRA_MEMBER }
            ]
            const mockRemainingMembers = [
                { profile_id: VALID_USER_ID },
                { profile_id: VALID_EXTRA_MEMBER }
            ]

            // Helper to create chainable mock for .eq().eq().single()
            const createDoubleEqChainMock = (data: unknown) => ({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data })
                })
            })

            let memberCallCount = 0
            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { foundry_id: VALID_FOUNDRY_ID } })
                            })
                        })
                    }
                }
                if (table === 'teams') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTeam })
                            })
                        })
                    }
                }
                if (table === 'team_members') {
                    memberCallCount++
                    if (memberCallCount === 1) {
                        // First call: check user membership - .select().eq().eq().single()
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue(createDoubleEqChainMock(mockMembership))
                            })
                        }
                    } else if (memberCallCount === 2) {
                        // Second call: check member to remove exists - .select().eq().eq().single()
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue(createDoubleEqChainMock(mockMemberToRemove))
                            })
                        }
                    } else if (memberCallCount === 3) {
                        // Third call: get current members count - .select().eq()
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({ data: mockCurrentMembers, error: null })
                            })
                        }
                    } else if (memberCallCount === 4) {
                        // Delete call - .delete().eq().eq()
                        return {
                            delete: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    eq: jest.fn().mockResolvedValue({ error: null })
                                })
                            })
                        }
                    } else {
                        // Fifth call: get remaining members after delete - .select().eq()
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({ data: mockRemainingMembers, error: null })
                            })
                        }
                    }
                }
                return {}
            })

            const result = await removeTeamMember(VALID_TEAM_ID, VALID_PROFILE_ID)
            expect(result).toEqual({ success: true })
        })
    })
})
