import { uploadTaskAttachment, getTaskAttachments } from '../attachments'

// Mock Supabase
const mockSupabaseClient = {
    auth: {
        getUser: jest.fn()
    },
    from: jest.fn(),
    storage: {
        from: jest.fn()
    }
}

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => Promise.resolve(mockSupabaseClient))
}))

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}))

describe('Attachment Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default mock setup
        mockSupabaseClient.auth.getUser.mockResolvedValue({
            data: { user: { id: 'user-123', app_metadata: { foundry_id: 'foundry-123' } } }
        })
    })

    describe('uploadTaskAttachment', () => {
        const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
        const mockFormData = new FormData()
        mockFormData.append('file', mockFile)

        it('should successfully upload file and create task_files record', async () => {
            const mockProfile = { foundry_id: 'foundry-123' }
            const mockTask = { foundry_id: 'foundry-123' }
            const mockStorage = {
                upload: jest.fn().mockResolvedValue({ error: null }),
                getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.pdf' } })
            }

            const mockTaskFilesInsert = jest.fn().mockResolvedValue({ error: null })

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile, error: null })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
                            })
                        })
                    }
                }
                if (table === 'task_comments') {
                    return {
                        insert: jest.fn().mockResolvedValue({ error: null })
                    }
                }
                if (table === 'task_files') {
                    return {
                        insert: mockTaskFilesInsert
                    }
                }
                return {}
            })

            mockSupabaseClient.storage.from.mockReturnValue(mockStorage)

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ success: true, url: 'https://example.com/file.pdf' })
            expect(mockTaskFilesInsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    task_id: 'task-123',
                    file_name: 'test.pdf',
                    file_size: mockFile.size,
                    mime_type: 'application/pdf',
                    uploaded_by: 'user-123'
                })
            )
        })

        it('should return error when user is not authenticated', async () => {
            mockSupabaseClient.auth.getUser.mockResolvedValue({
                data: { user: null }
            })

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ error: 'Unauthorized' })
        })

        it('should return error when no file is provided', async () => {
            const emptyFormData = new FormData()

            const result = await uploadTaskAttachment('task-123', emptyFormData)

            expect(result).toEqual({ error: 'No file provided' })
        })

        it('should prevent cross-foundry uploads', async () => {
            const mockProfile = { foundry_id: 'foundry-123' }
            const mockTask = { foundry_id: 'foundry-456' } // Different foundry

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile, error: null })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ error: 'Unauthorized: Task belongs to a different foundry' })
        })

        it('should handle upload errors', async () => {
            const mockProfile = { foundry_id: 'foundry-123' }
            const mockTask = { foundry_id: 'foundry-123' }
            const mockStorage = {
                upload: jest.fn().mockResolvedValue({ error: { message: 'Storage quota exceeded' } })
            }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile, error: null })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
                            })
                        })
                    }
                }
                return {}
            })

            mockSupabaseClient.storage.from.mockReturnValue(mockStorage)

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ error: 'Storage quota exceeded' })
        })

        it('should handle task not found error', async () => {
            const mockProfile = { foundry_id: 'foundry-123' }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile, error: null })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Task not found' } })
                            })
                        })
                    }
                }
                return {}
            })

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ error: 'Task not found' })
        })

        it('should handle file record insertion failure', async () => {
            const mockProfile = { foundry_id: 'foundry-123' }
            const mockTask = { foundry_id: 'foundry-123' }
            const mockStorage = {
                upload: jest.fn().mockResolvedValue({ error: null }),
                getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.pdf' } })
            }

            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockProfile, error: null })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
                            })
                        })
                    }
                }
                if (table === 'task_comments') {
                    return {
                        insert: jest.fn().mockResolvedValue({ error: null })
                    }
                }
                if (table === 'task_files') {
                    return {
                        insert: jest.fn().mockResolvedValue({ error: { message: 'Database error' } })
                    }
                }
                return {}
            })

            mockSupabaseClient.storage.from.mockReturnValue(mockStorage)

            const result = await uploadTaskAttachment('task-123', mockFormData)

            expect(result).toEqual({ error: 'File uploaded but failed to record in database' })
        })
    })

    describe('getTaskAttachments', () => {
        it('should return empty array when storage list fails', async () => {
            const mockStorage = {
                list: jest.fn().mockResolvedValue({ data: null, error: { message: 'Storage error' } })
            }

            mockSupabaseClient.storage.from.mockReturnValue(mockStorage)

            const result = await getTaskAttachments('task-123')

            expect(result).toEqual([])
        })

        it('should return list of attachments with public URLs', async () => {
            const mockFiles = [
                { name: 'file1.pdf', metadata: { size: 1024 } },
                { name: 'file2.jpg', metadata: { size: 2048 } }
            ]
            const mockStorage = {
                list: jest.fn().mockResolvedValue({ data: mockFiles, error: null }),
                getPublicUrl: jest.fn((path: string) => ({
                    data: { publicUrl: `https://example.com/${path}` }
                }))
            }

            mockSupabaseClient.storage.from.mockReturnValue(mockStorage)

            const result = await getTaskAttachments('task-123')

            expect(result).toEqual([
                { name: 'file1.pdf', url: 'https://example.com/task-123/file1.pdf', size: 1024 },
                { name: 'file2.jpg', url: 'https://example.com/task-123/file2.jpg', size: 2048 }
            ])
        })
    })
})
