'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { 
  DocumentType, 
  Signature, 
  RequiredSignature, 
  ApprenticeshipDocument 
} from '@/types/apprenticeship'
import { isValidUUID, sanitizeErrorMessage } from '@/lib/security/sanitize'
import type { Json } from '@/types/database.types'

// =============================================
// AUTH HELPERS
// =============================================

/**
 * Verify the current user has access to an enrollment.
 *
 * @description Checks the user is the apprentice, mentor, buddy,
 * or a Founder/Executive in the same foundry.
 *
 * @security Prevents IDOR by checking direct association or elevated role
 * within the same foundry.
 */
async function verifyEnrollmentAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  enrollmentId: string
): Promise<{ authorized: boolean; error?: string }> {
  // AUTH: Get enrollment details for ownership check
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('foundry_id, apprentice_id, senior_mentor_id, workplace_buddy_id')
    .eq('id', enrollmentId)
    .single()

  if (!enrollment) {
    return { authorized: false, error: 'Enrollment not found' }
  }

  // AUTH: Check if user is directly associated with the enrollment
  const isDirectlyAssociated =
    enrollment.apprentice_id === userId ||
    enrollment.senior_mentor_id === userId ||
    enrollment.workplace_buddy_id === userId

  if (isDirectlyAssociated) {
    return { authorized: true }
  }

  // AUTH: Check if user is Founder/Executive in the same foundry
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', userId)
    .single()

  if (
    profile?.foundry_id === enrollment.foundry_id &&
    profile?.role &&
    ['Founder', 'Executive'].includes(profile.role)
  ) {
    return { authorized: true }
  }

  return { authorized: false, error: 'Not authorized to access this enrollment' }
}

// =============================================
// DOCUMENT RETRIEVAL
// =============================================

/**
 * Get all documents for an enrollment.
 *
 * @description Fetches every document attached to the given enrollment.
 *
 * @param enrollmentId - The enrollment to retrieve documents for
 * @returns List of documents or an error
 *
 * @security Requires authenticated user with enrollment access
 */
export async function getEnrollmentDocuments(enrollmentId: string) {
  const supabase = await createClient()

  // AUTH: Verify the caller is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // AUTH: Verify the caller has access to this enrollment
  const access = await verifyEnrollmentAccess(supabase, user.id, enrollmentId)
  if (!access.authorized) return { error: access.error }

  const { data: documents, error } = await supabase
    .from('apprenticeship_documents')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('[ApprenticeshipDocs] Error fetching documents:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  return { documents: documents as unknown as ApprenticeshipDocument[] }
}

/**
 * Get documents requiring user's signature
 */
export async function getPendingSignatures() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Validate user ID is a valid UUID before using in query
  if (!isValidUUID(user.id)) {
    return { error: 'Invalid user ID' }
  }
  
  // Get user's enrollments using separate queries instead of .or() with string interpolation
  const [apprenticeResult, mentorResult, buddyResult] = await Promise.all([
    supabase.from('apprenticeship_enrollments').select('id').eq('apprentice_id', user.id),
    supabase.from('apprenticeship_enrollments').select('id').eq('senior_mentor_id', user.id),
    supabase.from('apprenticeship_enrollments').select('id').eq('workplace_buddy_id', user.id)
  ])
  
  // Combine and deduplicate enrollment IDs
  const allEnrollmentIds = [
    ...(apprenticeResult.data || []).map(e => e.id),
    ...(mentorResult.data || []).map(e => e.id),
    ...(buddyResult.data || []).map(e => e.id)
  ]
  const enrollmentIds = [...new Set(allEnrollmentIds)]
  
  if (enrollmentIds.length === 0) {
    return { documents: [] }
  }
  
  const { data: documents, error } = await supabase
    .from('apprenticeship_documents')
    .select(`
      *,
      enrollment:apprenticeship_enrollments(
        apprentice:profiles!apprentice_id(full_name, email),
        programme:apprenticeship_programmes(title)
      )
    `)
    .in('enrollment_id', enrollmentIds)
    .in('status', ['pending_signatures', 'partially_signed'])
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error fetching pending signatures:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  // Filter to only documents where this user needs to sign
  const pendingForUser = (documents || []).filter(doc => {
    const signatures = (doc.signatures || []) as unknown as Signature[]
    const required = (doc.requires_signatures || []) as unknown as RequiredSignature[]
    
    // Check if user is in required list and hasn't signed yet
    const userRequired = required.find((r: RequiredSignature) => r.user_id === user.id)
    if (!userRequired) return false
    
    const userSigned = signatures.find((s: Signature) => s.user_id === user.id)
    return !userSigned
  })
  
  return { documents: pendingForUser }
}

/**
 * Get a single document by ID.
 *
 * @description Fetches a document and its related enrollment/profile data.
 *
 * @param documentId - The document to retrieve
 * @returns The document with enrollment details, or an error
 *
 * @security Requires authenticated user with access to the parent enrollment
 */
export async function getDocument(documentId: string) {
  const supabase = await createClient()

  // AUTH: Verify the caller is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // AUTH: Fetch the document to discover its enrollment, then verify access
  const { data: docRef } = await supabase
    .from('apprenticeship_documents')
    .select('enrollment_id')
    .eq('id', documentId)
    .single()

  if (!docRef) return { error: 'Document not found' }

  const access = await verifyEnrollmentAccess(supabase, user.id, docRef.enrollment_id)
  if (!access.authorized) return { error: access.error }

  const { data: document, error } = await supabase
    .from('apprenticeship_documents')
    .select(`
      *,
      enrollment:apprenticeship_enrollments(
        apprentice:profiles!apprentice_id(full_name, email, avatar_url),
        senior_mentor:profiles!senior_mentor_id(full_name, email),
        programme:apprenticeship_programmes(title, level)
      )
    `)
    .eq('id', documentId)
    .single()
  
  if (error) {
    console.error('[ApprenticeshipDocs] Error fetching document:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  return { document: document as unknown as ApprenticeshipDocument & { enrollment: unknown } }
}

// =============================================
// DOCUMENT SIGNING
// =============================================

/**
 * Sign a document
 */
export async function signDocument(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Get current document state
  const { data: document } = await supabase
    .from('apprenticeship_documents')
    .select('signatures, requires_signatures, status, enrollment_id')
    .eq('id', documentId)
    .single()
  
  if (!document) return { error: 'Document not found' }
  
  // Check if user is authorized to sign
  const required = (document.requires_signatures || []) as unknown as RequiredSignature[]
  const userRequired = required.find((r: RequiredSignature) => r.user_id === user.id)
  
  if (!userRequired) {
    return { error: 'You are not required to sign this document' }
  }
  
  // Check if already signed
  const signatures = (document.signatures || []) as unknown as Signature[]
  const alreadySigned = signatures.find((s: Signature) => s.user_id === user.id)
  
  if (alreadySigned) {
    return { error: 'You have already signed this document' }
  }
  
  // Get user's full name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()
  
  // Add signature
  const newSignature: Signature = {
    user_id: user.id,
    role: userRequired.role,
    signed_at: new Date().toISOString(),
    full_name: profile?.full_name || 'Unknown'
  }
  
  const updatedSignatures = [...signatures, newSignature]
  
  // Determine new status
  const allSigned = required.every((r: RequiredSignature) => 
    updatedSignatures.some((s: Signature) => s.user_id === r.user_id)
  )
  
  const newStatus = allSigned ? 'signed' : 'partially_signed'
  
  // Update document
  const { error } = await supabase
    .from('apprenticeship_documents')
    .update({
      signatures: updatedSignatures as unknown as Json,
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)
  
  if (error) {
    console.error('Error signing document:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  // If document is fully signed, update enrollment record
  if (allSigned) {
    const { data: doc } = await supabase
      .from('apprenticeship_documents')
      .select('document_type, enrollment_id')
      .eq('id', documentId)
      .single()
    
    if (doc) {
      const updateField = getEnrollmentFieldForDocument(doc.document_type)
      if (updateField) {
        await supabase
          .from('apprenticeship_enrollments')
          .update({ [updateField]: new Date().toISOString() })
          .eq('id', doc.enrollment_id)
      }
    }
  }
  
  revalidatePath('/apprenticeship')
  return { success: true, status: newStatus }
}

function getEnrollmentFieldForDocument(docType: string): string | null {
  switch (docType) {
    case 'apprenticeship_agreement':
      return 'agreement_signed_at'
    case 'commitment_statement':
      return 'commitment_statement_signed_at'
    case 'training_plan':
      return 'training_plan_approved_at'
    default:
      return null
  }
}

// =============================================
// DOCUMENT CREATION
// =============================================

/**
 * Create a new document
 */
export async function createDocument(input: {
  enrollmentId: string
  documentType: DocumentType
  title: string
  description?: string
  content?: Record<string, unknown>
  fileUrl?: string
  requiredSignatures: RequiredSignature[]
  validFrom?: string
  validUntil?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { error: 'Unauthorized' }
  
  // Verify user has permission to create documents for this enrollment
  const { data: enrollment } = await supabase
    .from('apprenticeship_enrollments')
    .select('senior_mentor_id, foundry_id')
    .eq('id', input.enrollmentId)
    .single()
  
  if (!enrollment) return { error: 'Enrollment not found' }
  
  // Check if user is mentor or executive
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()
  
  const canCreate = 
    enrollment.senior_mentor_id === user.id || 
    (profile?.role && ['Executive', 'Founder'].includes(profile.role) && profile.foundry_id === enrollment.foundry_id)
  
  if (!canCreate) {
    return { error: 'Only mentors or executives can create documents' }
  }
  
  // Enrich required signatures with full names
  const enrichedSignatures = await Promise.all(
    input.requiredSignatures.map(async (sig) => {
      const { data: sigProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', sig.user_id)
        .single()
      return { ...sig, full_name: sigProfile?.full_name || 'Unknown' }
    })
  )
  
  const { data: document, error } = await supabase
    .from('apprenticeship_documents')
    .insert({
      enrollment_id: input.enrollmentId,
      document_type: input.documentType,
      title: input.title,
      description: input.description || null,
      content: (input.content || null) as unknown as Json,
      file_url: input.fileUrl || null,
      requires_signatures: enrichedSignatures as unknown as Json,
      status: enrichedSignatures.length > 0 ? 'pending_signatures' : 'draft',
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
      created_by: user.id
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating document:', error)
    return { error: sanitizeErrorMessage(error) }
  }
  
  // Create notifications for required signers
  for (const sig of enrichedSignatures) {
    await createSignatureNotification(sig.user_id, document.id, input.title)
  }
  
  revalidatePath('/apprenticeship')
  return { success: true, document }
}

async function createSignatureNotification(userId: string, documentId: string, documentTitle: string) {
  const supabase = await createClient()
  
  try {
    // Get user's foundry_id for the notification
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', userId)
      .single()
    
    if (userProfile?.foundry_id) {
      await supabase.from('notifications').insert({
        user_id: userId,
        foundry_id: userProfile.foundry_id,
        type: 'document_signature_required',
        title: 'Document Requires Your Signature',
        message: `Please review and sign: ${documentTitle}`,
        metadata: { document_id: documentId } as unknown as Json,
        is_read: false
      })
    }
  } catch (error) {
    console.warn('[ApprenticeshipDocs] Could not create notification:', error instanceof Error ? error.message : error)
  }
}
