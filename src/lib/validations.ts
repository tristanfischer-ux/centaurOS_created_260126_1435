import { z } from 'zod'

// Task schemas
export const createTaskSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(500, 'Title must be 500 characters or less'),
  description: z.string()
    .max(10000, 'Description must be 10,000 characters or less')
    .optional(),
  objectiveId: z.string().uuid('Invalid objective ID').optional().nullable(),
  assigneeIds: z.array(z.string().uuid('Invalid assignee ID')).min(1, 'At least one assignee is required'),
  deadline: z.union([
    z.string().datetime('Invalid date format'),
    z.null(),
    z.undefined()
  ]).optional().nullable(),
  riskLevel: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  fileCount: z.number().int().min(0).default(0)
})

export const updateTaskSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(['Pending', 'Accepted', 'Completed', 'Rejected', 'Amended_Pending_Approval', 'Pending_Executive_Approval', 'Pending_Peer_Review']).optional(),
  assigneeId: z.string().uuid().optional(),
  deadline: z.string().datetime().optional().nullable()
})

// Custom date string validator that accepts ISO 8601 and other common formats
const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' }
)

export const updateTaskDatesSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  startDate: z.union([
    dateStringSchema,
    z.null(),
    z.undefined()
  ]).optional().nullable(),
  endDate: z.union([
    dateStringSchema,
    z.null(),
    z.undefined()
  ]).optional().nullable()
}).refine(data => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate)
  }
  return true
}, { message: 'Start date must be before end date' })

// Objective schemas
export const createObjectiveSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  description: z.string()
    .max(10000, 'Description must be 10,000 characters or less')
    .optional(),
  playbookId: z.string().uuid().optional(),
  selectedTaskIds: z.array(z.string()).optional()
})

// Team/Member schemas
export const inviteMemberSchema = z.object({
  email: z.string()
    .email('Invalid email address'),
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be 100 characters or less'),
  role: z.enum(['Executive', 'Apprentice', 'AI_Agent', 'Founder'])
})

export const createTeamSchema = z.object({
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be 100 characters or less'),
  memberIds: z.array(z.string().uuid()).min(2, 'Teams must have at least 2 members')
})

export const updateTeamNameSchema = z.object({
  teamId: z.string().uuid('Invalid team ID'),
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be 100 characters or less')
})

// Marketplace schemas
export const createRFQSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  specifications: z.string()
    .min(10, 'Specifications must be at least 10 characters')
    .max(5000, 'Specifications must be 5,000 characters or less')
    .optional(),
  budgetRange: z.string()
    .regex(/^\$?[\d,]+\s*-\s*\$?[\d,]+$|^\$?[\d,]+$/, 'Invalid budget format (e.g., "$500 - $1,000")')
    .optional()
})

// Comment schemas
export const addCommentSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(5000, 'Comment must be 5,000 characters or less')
})

// Allowed MIME types for file uploads (security hardening)
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/csv',
  'text/markdown',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
] as const

// Attachment schemas
export const uploadAttachmentSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  fileName: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .refine(
      (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
      { message: 'Invalid filename' }
    ),
  fileSize: z.number().int().max(10 * 1024 * 1024, 'File must be 10MB or less'),
  fileType: z.string().refine(
    (type) => ALLOWED_MIME_TYPES.includes(type as typeof ALLOWED_MIME_TYPES[number]),
    { message: 'File type not allowed. Supported: PDF, Office docs, images, text, and ZIP files.' }
  )
})

// Helper function to validate and return typed result
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const errorMessage = result.error.issues.map(e => e.message).join(', ')
  return { success: false, error: errorMessage }
}
