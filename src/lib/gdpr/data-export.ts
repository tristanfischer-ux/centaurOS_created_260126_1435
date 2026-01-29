// @ts-nocheck
// TODO: Fix Supabase nested relationship type mismatches
/**
 * Data Export Service
 * Handles collection and export of user data for GDPR compliance
 */

import { SupabaseClient } from "@supabase/supabase-js"
import {
  UserDataExport,
  ProfileExportData,
  ProviderProfileExportData,
  OrderExportData,
  MessageExportData,
  ReviewExportData,
  PaymentExportData,
  BookingExportData,
  AuditLogEntry,
} from "@/types/gdpr"

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>

/**
 * Generate a complete data export for a user
 */
export async function generateDataExport(
  supabase: UntypedClient,
  userId: string,
  requestId?: string
): Promise<{ data: UserDataExport | null; url: string | null; error: string | null }> {
  try {
    const userData = await collectUserData(supabase, userId)
    
    if (!userData) {
      return { data: null, url: null, error: "Failed to collect user data" }
    }

    const exportData = formatExportData(userData, userId, requestId || "manual")

    // Upload to storage
    const uploadResult = await uploadExport(supabase, userId, exportData)

    if (uploadResult.error) {
      return { data: exportData, url: null, error: uploadResult.error }
    }

    return { data: exportData, url: uploadResult.url, error: null }
  } catch (err) {
    console.error("Error generating data export:", err)
    return {
      data: null,
      url: null,
      error: err instanceof Error ? err.message : "Failed to generate export",
    }
  }
}

/**
 * Collect all user data from various tables
 */
export async function collectUserData(
  supabase: UntypedClient,
  userId: string
): Promise<{
  profile: ProfileExportData | null
  providerProfile: ProviderProfileExportData | null
  orders: OrderExportData[]
  messages: MessageExportData[]
  reviews: ReviewExportData[]
  payments: PaymentExportData[]
  bookings: BookingExportData[]
  auditLog: AuditLogEntry[]
} | null> {
  try {
    // Collect profile data
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, bio, phone_number, skills, created_at, updated_at")
      .eq("id", userId)
      .single()

    // Collect provider profile if exists
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id, headline, bio, day_rate, tier, created_at")
      .eq("user_id", userId)
      .maybeSingle()

    // Collect orders as buyer
    const { data: buyerOrders } = await supabase
      .from("orders")
      .select(`
        id, order_number, status, total_amount, currency, order_type, created_at, completed_at,
        seller:provider_profiles!orders_seller_id_fkey(headline)
      `)
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })

    // Collect orders as seller (via provider profile)
    let sellerOrders: OrderExportData[] = []
    if (providerProfile) {
      const { data: sellerOrdersData } = await supabase
        .from("orders")
        .select(`
          id, order_number, status, total_amount, currency, order_type, created_at, completed_at,
          buyer:profiles!orders_buyer_id_fkey(full_name)
        `)
        .eq("seller_id", providerProfile.id)
        .order("created_at", { ascending: false })

      sellerOrders = (sellerOrdersData || []).map((o) => {
        // Handle buyer as potentially being an array or single object
        const buyer = Array.isArray(o.buyer) ? o.buyer[0] : o.buyer
        return {
          id: o.id,
          order_number: o.order_number,
          role: "seller" as const,
          status: o.status,
          total_amount: o.total_amount,
          currency: o.currency,
          order_type: o.order_type,
          created_at: o.created_at,
          completed_at: o.completed_at,
          counterparty_name: buyer?.full_name || null,
        }
      })
    }

    const orders: OrderExportData[] = [
      ...(buyerOrders || []).map((o) => {
        // Handle seller as potentially being an array or single object
        const seller = Array.isArray(o.seller) ? o.seller[0] : o.seller
        return {
          id: o.id,
          order_number: o.order_number,
          role: "buyer" as const,
          status: o.status,
          total_amount: o.total_amount,
          currency: o.currency,
          order_type: o.order_type,
          created_at: o.created_at,
          completed_at: o.completed_at,
          counterparty_name: seller?.headline || null,
        }
      }),
      ...sellerOrders,
    ]

    // Collect messages
    const { data: conversations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId)

    let messages: MessageExportData[] = []
    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map((c) => c.conversation_id)
      
      const { data: messagesData } = await supabase
        .from("messages")
        .select(`
          id, conversation_id, content, sender_id, created_at,
          conversation:conversations!messages_conversation_id_fkey(
            participants:conversation_participants(
              user:profiles(full_name)
            )
          )
        `)
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(1000)

      messages = (messagesData || []).map((m) => {
        // Handle conversation as potentially being an array or single object
        const conversation = Array.isArray(m.conversation) ? m.conversation[0] : m.conversation
        // Handle participants as potentially being an array
        const participants = conversation?.participants || []
        const flatParticipants = Array.isArray(participants) ? participants.flat() : participants
        
        // Find other party name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const otherParty = (flatParticipants as any[])?.find(
          (p: { user: { full_name: string | null } | { full_name: string | null }[] }) => {
            const user = Array.isArray(p.user) ? p.user[0] : p.user
            return user?.full_name !== profile?.full_name
          }
        )
        
        const otherPartyUser = Array.isArray(otherParty?.user) ? otherParty?.user[0] : otherParty?.user
        
        return {
          id: m.id,
          conversation_id: m.conversation_id,
          content: m.content,
          is_sender: m.sender_id === userId,
          created_at: m.created_at,
          other_party_name: otherPartyUser?.full_name || null,
        }
      })
    }

    // Collect reviews given
    const { data: reviewsGiven } = await supabase
      .from("reviews")
      .select(`
        id, rating, comment, order_id, created_at,
        reviewee:provider_profiles!reviews_provider_id_fkey(headline)
      `)
      .eq("reviewer_id", userId)

    // Collect reviews received (as provider)
    let reviewsReceived: ReviewExportData[] = []
    if (providerProfile) {
      const { data: receivedData } = await supabase
        .from("reviews")
        .select(`
          id, rating, comment, order_id, created_at,
          reviewer:profiles!reviews_reviewer_id_fkey(full_name)
        `)
        .eq("provider_id", providerProfile.id)

      reviewsReceived = (receivedData || []).map((r) => {
        const reviewer = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer
        return {
          id: r.id,
          type: "received" as const,
          rating: r.rating,
          comment: r.comment,
          order_id: r.order_id,
          other_party_name: reviewer?.full_name || null,
          created_at: r.created_at,
        }
      })
    }

    const reviews: ReviewExportData[] = [
      ...(reviewsGiven || []).map((r) => {
        const reviewee = Array.isArray(r.reviewee) ? r.reviewee[0] : r.reviewee
        return {
          id: r.id,
          type: "given" as const,
          rating: r.rating,
          comment: r.comment,
          order_id: r.order_id,
          other_party_name: reviewee?.headline || null,
          created_at: r.created_at,
        }
      }),
      ...reviewsReceived,
    ]

    // Collect payments/transactions
    const { data: paymentsData } = await supabase
      .from("escrow_transactions")
      .select("id, amount, currency, status, transaction_type, created_at, stripe_payment_intent_id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order("created_at", { ascending: false })

    const payments: PaymentExportData[] = (paymentsData || []).map((p) => ({
      id: p.id,
      type: p.transaction_type === "capture" ? "sent" : "received",
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      payment_method: "card", // Default
      created_at: p.created_at,
      transaction_reference: p.stripe_payment_intent_id,
    }))

    // Collect bookings
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select(`
        id, status, scheduled_at, duration_minutes, created_at,
        provider:provider_profiles(display_name)
      `)
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false })

    const bookings: BookingExportData[] = (bookingsData || []).map((b) => ({
      id: b.id,
      status: b.status,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      provider_name: b.provider?.display_name || null,
      created_at: b.created_at,
    }))

    // Collect audit log entries for this user
    const { data: auditData } = await supabase
      .from("gdpr_audit_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500)

    const auditLog: AuditLogEntry[] = (auditData || []).map((a) => ({
      id: a.id,
      user_id: a.user_id,
      accessor_id: a.accessor_id,
      accessor_type: a.accessor_type,
      action: a.action,
      data_type: a.data_type,
      details: a.details || {},
      ip_address: a.ip_address,
      user_agent: a.user_agent,
      created_at: a.created_at,
    }))

    return {
      profile: profile as ProfileExportData | null,
      providerProfile: providerProfile as ProviderProfileExportData | null,
      orders,
      messages,
      reviews,
      payments,
      bookings,
      auditLog,
    }
  } catch (err) {
    console.error("Error collecting user data:", err)
    return null
  }
}

/**
 * Format collected data into export structure
 */
export function formatExportData(
  data: NonNullable<Awaited<ReturnType<typeof collectUserData>>>,
  userId: string,
  requestId: string
): UserDataExport {
  return {
    exportedAt: new Date().toISOString(),
    userId,
    requestId,
    data: {
      profile: data.profile,
      providerProfile: data.providerProfile,
      orders: data.orders,
      messages: data.messages,
      reviews: data.reviews,
      payments: data.payments,
      bookings: data.bookings,
      auditLog: data.auditLog,
    },
  }
}

/**
 * Upload export data to storage
 */
export async function uploadExport(
  supabase: UntypedClient,
  userId: string,
  data: UserDataExport
): Promise<{ url: string | null; error: string | null }> {
  try {
    const fileName = `exports/${userId}/${data.requestId}_${Date.now()}.json`
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: "application/json" })

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("gdpr-exports")
      .upload(fileName, blob, {
        contentType: "application/json",
        upsert: false,
      })

    if (uploadError) {
      console.error("Error uploading export:", uploadError)
      return { url: null, error: "Failed to upload export file" }
    }

    // Generate signed URL valid for 7 days
    const { data: urlData, error: urlError } = await supabase.storage
      .from("gdpr-exports")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7) // 7 days

    if (urlError) {
      console.error("Error generating signed URL:", urlError)
      return { url: null, error: "Failed to generate download URL" }
    }

    return { url: urlData.signedUrl, error: null }
  } catch (err) {
    console.error("Error in uploadExport:", err)
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    }
  }
}

/**
 * Get export download URL for a completed request
 */
export async function getExportUrl(
  supabase: UntypedClient,
  requestId: string,
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  // Get the request to verify ownership and get stored URL
  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("user_id, status, export_url")
    .eq("id", requestId)
    .single()

  if (fetchError || !request) {
    return { url: null, error: "Request not found" }
  }

  if (request.user_id !== userId) {
    return { url: null, error: "Not authorized to access this export" }
  }

  if (request.status !== "completed") {
    return { url: null, error: "Export not ready" }
  }

  if (!request.export_url) {
    return { url: null, error: "Export URL not available" }
  }

  // If the stored URL is still valid, return it
  // Otherwise, we might need to regenerate (depends on how URLs are stored)
  return { url: request.export_url, error: null }
}

/**
 * Generate a summary of what data will be included in export
 */
export async function getExportSummary(
  supabase: UntypedClient,
  userId: string
): Promise<{
  summary: {
    category: string
    itemCount: number
    description: string
  }[]
  error: string | null
}> {
  try {
    // Count records in each category
    const { count: ordersCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId)

    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    let sellerOrdersCount = 0
    if (providerProfile) {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", providerProfile.id)
      sellerOrdersCount = count || 0
    }

    const { data: conversations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId)

    let messagesCount = 0
    if (conversations && conversations.length > 0) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", conversations.map((c) => c.conversation_id))
      messagesCount = count || 0
    }

    const { count: reviewsGivenCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("reviewer_id", userId)

    const { count: bookingsCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId)

    return {
      summary: [
        {
          category: "Profile Information",
          itemCount: 1,
          description: "Your personal profile data including name, email, bio, and settings",
        },
        ...(providerProfile
          ? [
              {
                category: "Provider Profile",
                itemCount: 1,
                description: "Your provider/seller profile including business info and certifications",
              },
            ]
          : []),
        {
          category: "Orders (as buyer)",
          itemCount: ordersCount || 0,
          description: "Orders you have placed",
        },
        ...(sellerOrdersCount > 0
          ? [
              {
                category: "Orders (as seller)",
                itemCount: sellerOrdersCount,
                description: "Orders you have fulfilled",
              },
            ]
          : []),
        {
          category: "Messages",
          itemCount: messagesCount,
          description: "Your conversation history",
        },
        {
          category: "Reviews Given",
          itemCount: reviewsGivenCount || 0,
          description: "Reviews you have written",
        },
        {
          category: "Bookings",
          itemCount: bookingsCount || 0,
          description: "Service bookings you have made",
        },
        {
          category: "Payment History",
          itemCount: (ordersCount || 0) + sellerOrdersCount,
          description: "Transaction records (retained for 7 years per UK tax law)",
        },
      ],
      error: null,
    }
  } catch (err) {
    console.error("Error generating export summary:", err)
    return {
      summary: [],
      error: "Failed to generate export summary",
    }
  }
}
