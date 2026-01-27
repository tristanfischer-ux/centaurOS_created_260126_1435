import { deleteTeam, updateTeamName } from '../teams'
import { addTeamMember, removeTeamMember } from '../team'

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

describe('Team Actions - Authorization', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default mock setup
        mockSupabaseClient.auth.getUser.mockResolvedValue({
            data: { user: { id: 'user-123', app_metadata: { foundry_id: 'foundry-123' } } }
        })
    })

    describe('deleteTeam', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await deleteTeam('team-123')
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
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
                return {}
            })

            const result = await deleteTeam('team-123')
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to delete the team' })
        })

        it('should require Executive or Founder role', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
            const mockProfile = { role: 'Apprentice' }
            const mockMembership = { profile_id: 'user-123' }

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
                return {}
            })

            const result = await deleteTeam('team-123')
            expect(result).toEqual({ error: 'Unauthorized: Only Executives and Founders can delete teams' })
        })

        it('should successfully delete team with proper authorization', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
            const mockProfile = { role: 'Executive' }
            const mockMembership = { profile_id: 'user-123' }

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
                return {}
            })

            const result = await deleteTeam('team-123')
            expect(result).toEqual({ success: true })
        })
    })

    describe('updateTeamName', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await updateTeamName('team-123', 'New Name')
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }

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
                                single: jest.fn().mockResolvedValue({ data: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await updateTeamName('team-123', 'New Name')
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to update the team name' })
        })

        it('should successfully update team name with proper authorization', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
            const mockMembership = { profile_id: 'user-123' }

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

            const result = await updateTeamName('team-123', 'New Name')
            expect(result).toEqual({ success: true })
        })
    })

    describe('addTeamMember', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await addTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should verify foundry matching', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
            const mockProfile = { foundry_id: 'foundry-456' } // Different foundry
            const mockMembership = { profile_id: 'user-123' }

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

            const result = await addTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ error: 'Unauthorized: Profile not in your Foundry' })
        })

        it('should successfully add team member with proper authorization', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }
            const mockProfile = { foundry_id: 'foundry-123' }
            const mockMembership = { profile_id: 'user-123' }

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
                    let callCount = 0
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockImplementation(() => {
                                        callCount++
                                        if (callCount === 1) {
                                            return Promise.resolve({ data: mockMembership })
                                        }
                                        return Promise.resolve({ data: null }) // Member doesn't exist yet
                                    })
                                })
                            })
                        }),
                        insert: jest.fn().mockResolvedValue({ error: null })
                    }
                }
                return {}
            })

            const result = await addTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ success: true })
        })
    })

    describe('removeTeamMember', () => {
        it('should require authentication', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await removeTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should require team membership', async () => {
            const mockTeam = { foundry_id: 'foundry-123' }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { foundry_id: 'foundry-123' } })
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
                                single: jest.fn().mockResolvedValue({ data: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await removeTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ error: 'Unauthorized: You must be a team member to remove members' })
        })

        it('should successfully remove team member with proper authorization', async () => {
            const mockTeam = { foundry_id: 'foundry-123', is_auto_generated: false }
            const mockMembership = { profile_id: 'user-123' }
            const mockMemberToRemove = { profile_id: 'profile-123' }
            const mockCurrentMembers = [
                { profile_id: 'user-123' },
                { profile_id: 'profile-123' },
                { profile_id: 'profile-456' }
            ]
            const mockRemaining = [
                { profile_id: 'user-123' },
                { profile_id: 'profile-456' }
            ]

            let memberCallCount = 0
            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { foundry_id: 'foundry-123' } })
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
                        // First call: check user membership
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
                        // Second call: check member to remove exists
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    eq: jest.fn().mockReturnValue({
                                        single: jest.fn().mockResolvedValue({ data: mockMemberToRemove })
                                    })
                                })
                            })
                        }
                    } else if (memberCallCount === 3) {
                        // Third call: get current members count
                        return {
                            select: jest.fn().mockResolvedValue({ data: mockCurrentMembers, error: null })
                        }
                    } else if (memberCallCount === 4) {
                        // Fourth call: get remaining members after deletion
                        return {
                            select: jest.fn().mockResolvedValue({ data: mockRemaining, error: null })
                        }
                    } else {
                        // Delete call
                        return {
                            delete: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({ error: null })
                            })
                        }
                    }
                }
                return {}
            })

            const result = await removeTeamMember('team-123', 'profile-123')
            expect(result).toEqual({ success: true })
        })
    })
})
