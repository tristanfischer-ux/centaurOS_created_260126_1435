"use server"

/**
 * Invoice Server Actions
 * Server-side actions for invoice generation and management
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  Invoice,
  InvoiceSummary,
  InvoiceFilters,
  InvoiceDocumentType,
} from "@/types/invoices"
import {
  generateBuyerInvoice,
  generateSellerSelfBill,
  generatePlatformFeeInvoice,
  generateAllOrderInvoices,
  getOrderInvoices,
  storeInvoiceDocument,
} from "@/lib/invoicing/generator"
import {
  generateAndUploadInvoicePDF,
  getInvoiceDownloadUrl,
  generateInvoicePreview,
} from "@/lib/invoicing/pdf"

/**
 * Generate all invoices for a completed order
 * Called when an order is completed
 * @param orderId Order ID
 * @returns Generated invoices
 */
export async function generateOrderInvoices(
  orderId: string
): Promise<{ data: Invoice[]; errors: string[] }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], errors: ["Not authenticated"] }
  }

  // Verify user has access to this order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id, status")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { data: [], errors: ["Order not found"] }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === user.id

  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { data: [], errors: ["Not authorized to generate invoices for this order"] }
  }

  // Generate all invoices
  const result = await generateAllOrderInvoices(supabase, orderId)

  // Upload PDFs and store references
  const storedInvoices: Invoice[] = []
  for (const invoice of result.data) {
    const uploadResult = await generateAndUploadInvoicePDF(supabase, invoice)
    
    if (uploadResult.url) {
      // Update invoice with file URL
      invoice.fileUrl = uploadResult.url
      
      // Store in order_documents
      await storeInvoiceDocument(supabase, invoice, uploadResult.url)
      storedInvoices.push(invoice)
    } else {
      result.errors.push(`Failed to upload ${invoice.documentType}: ${uploadResult.error}`)
    }
  }

  revalidatePath(`/orders/${orderId}`)

  return { data: storedInvoices, errors: result.errors }
}

/**
 * Get invoices for an order
 * @param orderId Order ID
 * @returns Array of invoice documents
 */
export async function getInvoicesForOrder(
  orderId: string
): Promise<{
  data: Array<{ id: string; documentType: string; fileUrl: string; generatedAt: string }>
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated" }
  }

  // Verify user has access to this order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { data: [], error: "Order not found" }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === user.id

  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { data: [], error: "Not authorized to view invoices for this order" }
  }

  return getOrderInvoices(supabase, orderId)
}

/**
 * Download an invoice
 * @param invoiceId Order document ID
 * @returns Signed download URL
 */
export async function downloadInvoice(
  invoiceId: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { url: null, error: "Not authenticated" }
  }

  // Get the document
  const { data: document, error: docError } = await supabase
    .from("order_documents")
    .select("id, file_url, order_id")
    .eq("id", invoiceId)
    .single()

  if (docError || !document) {
    return { url: null, error: "Invoice not found" }
  }

  // Verify user has access to the order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id")
    .eq("id", document.order_id)
    .single()

  if (orderError || !order) {
    return { url: null, error: "Order not found" }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === user.id

  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { url: null, error: "Not authorized to download this invoice" }
  }

  // Generate signed URL
  return getInvoiceDownloadUrl(supabase, document.file_url)
}

/**
 * Regenerate an invoice
 * @param invoiceId Order document ID
 * @returns Updated invoice
 */
export async function regenerateInvoice(
  invoiceId: string
): Promise<{ data: Invoice | null; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Get the document
  const { data: document, error: docError } = await supabase
    .from("order_documents")
    .select("id, document_type, file_url, order_id")
    .eq("id", invoiceId)
    .single()

  if (docError || !document) {
    return { data: null, error: "Invoice not found" }
  }

  // Verify user has access to the order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id")
    .eq("id", document.order_id)
    .single()

  if (orderError || !order) {
    return { data: null, error: "Order not found" }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === user.id

  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { data: null, error: "Not authorized to regenerate this invoice" }
  }

  // Map document type to invoice generator
  let invoice: Invoice | null = null
  let error: string | null = null

  switch (document.document_type) {
    case "invoice":
      const buyerResult = await generateBuyerInvoice(supabase, document.order_id)
      invoice = buyerResult.data
      error = buyerResult.error
      break
    // Add other types as needed
    default:
      return { data: null, error: "Cannot regenerate this document type" }
  }

  if (!invoice) {
    return { data: null, error: error || "Failed to regenerate invoice" }
  }

  // Upload new PDF
  const uploadResult = await generateAndUploadInvoicePDF(supabase, invoice)
  
  if (uploadResult.url) {
    // Update document record
    await supabase
      .from("order_documents")
      .update({
        file_url: uploadResult.url,
        generated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)

    invoice.fileUrl = uploadResult.url
  }

  revalidatePath(`/orders/${document.order_id}`)

  return { data: invoice, error: null }
}

/**
 * Get invoice history for the current user
 * @param filters Optional filters
 * @returns Array of invoice summaries
 */
export async function getInvoiceHistory(
  filters?: InvoiceFilters
): Promise<{
  data: InvoiceSummary[]
  error: string | null
  count: number
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", count: 0 }
  }

  // Get provider profile if exists
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()

  // Build query for orders where user is buyer or seller
  let query = supabase
    .from("orders")
    .select("id")

  if (providerProfile) {
    query = query.or(`buyer_id.eq.${user.id},seller_id.eq.${providerProfile.id}`)
  } else {
    query = query.eq("buyer_id", user.id)
  }

  const { data: userOrders, error: ordersError } = await query

  if (ordersError || !userOrders || userOrders.length === 0) {
    return { data: [], error: null, count: 0 }
  }

  const orderIds = userOrders.map(o => o.id)

  // Get documents for those orders
  let docsQuery = supabase
    .from("order_documents")
    .select(`
      id,
      order_id,
      document_type,
      file_url,
      generated_at,
      order:orders (
        order_number,
        total_amount,
        currency
      )
    `, { count: "exact" })
    .in("order_id", orderIds)
    .in("document_type", ["invoice", "receipt", "credit_note"])
    .order("generated_at", { ascending: false })

  // Apply filters
  if (filters?.documentType) {
    docsQuery = docsQuery.eq("document_type", filters.documentType)
  }
  if (filters?.fromDate) {
    docsQuery = docsQuery.gte("generated_at", filters.fromDate)
  }
  if (filters?.toDate) {
    docsQuery = docsQuery.lte("generated_at", filters.toDate)
  }

  // Pagination
  const limit = filters?.limit || 20
  const offset = filters?.offset || 0
  docsQuery = docsQuery.range(offset, offset + limit - 1)

  const { data: documents, error: docsError, count } = await docsQuery

  if (docsError) {
    console.error("Error fetching invoice history:", docsError)
    return { data: [], error: "Failed to fetch invoices", count: 0 }
  }

  // Map to summaries
  const summaries: InvoiceSummary[] = (documents || []).map(doc => ({
    id: doc.id,
    orderId: doc.order_id,
    invoiceNumber: `INV-${doc.order?.order_number?.slice(-8) || doc.id.slice(0, 8)}`,
    documentType: doc.document_type as InvoiceDocumentType,
    status: "generated",
    total: doc.order?.total_amount || 0,
    currency: doc.order?.currency || "GBP",
    issueDate: doc.generated_at,
    fileUrl: doc.file_url,
  }))

  return { data: summaries, error: null, count: count || 0 }
}

/**
 * Preview invoice before generation
 * @param orderId Order ID
 * @param documentType Type of invoice to preview
 * @returns HTML preview
 */
export async function previewInvoice(
  orderId: string,
  documentType: InvoiceDocumentType = "invoice"
): Promise<{ html: string | null; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { html: null, error: "Not authenticated" }
  }

  // Verify user has access to this order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { html: null, error: "Order not found" }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === user.id

  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { html: null, error: "Not authorized to preview invoices for this order" }
  }

  // Generate invoice based on type
  let invoice: Invoice | null = null
  let error: string | null = null

  switch (documentType) {
    case "invoice":
      const buyerResult = await generateBuyerInvoice(supabase, orderId)
      invoice = buyerResult.data
      error = buyerResult.error
      break
    case "self_bill":
      const selfBillResult = await generateSellerSelfBill(supabase, orderId)
      invoice = selfBillResult.data
      error = selfBillResult.error
      break
    case "platform_fee":
      const platformResult = await generatePlatformFeeInvoice(supabase, orderId)
      invoice = platformResult.data
      error = platformResult.error
      break
    default:
      return { html: null, error: "Invalid document type" }
  }

  if (!invoice) {
    return { html: null, error: error || "Failed to generate preview" }
  }

  // Generate HTML preview
  const html = generateInvoicePreview(invoice)
  return { html, error: null }
}
