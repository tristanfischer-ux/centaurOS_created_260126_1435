/**
 * Invoice Generator Service
 * Handles generation of invoices, self-bills, and platform fee invoices
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  Invoice,
  InvoiceLineItem,
  InvoiceDocumentType,
  CompanyDetails,
  VATBreakdown,
  TaxTreatment,
  UK_VAT_RATE,
} from '@/types/invoices'
import {
  calculateVAT,
  formatVATBreakdown,
  determineTaxTreatment,
  getVATRateForTreatment,
  calculatePlatformFeeVAT,
  buildCompanyDetails,
} from '@/lib/tax/vat'
import { getTaxProfile } from '@/lib/tax/profiles'
import { renderInvoiceToHTML } from './templates'

type TypedSupabaseClient = SupabaseClient<Database>

// Centaur OS company details (platform operator)
const CENTAUR_COMPANY: CompanyDetails = {
  name: 'Centaur OS Ltd',
  address: '123 Innovation Street',
  city: 'London',
  postcode: 'EC1A 1BB',
  country: 'GB',
  vatNumber: 'GB123456789', // Replace with real VAT number
  companyNumber: '12345678',
  email: 'billing@centauros.com',
}

/**
 * Generate a unique invoice number
 * Format: INV-YYYY-NNNNN
 * @param supabase Supabase client
 * @param prefix Prefix for invoice number (INV, SB, PF)
 * @returns Generated invoice number
 */
export async function getInvoiceNumber(
  supabase: TypedSupabaseClient,
  prefix: string = 'INV'
): Promise<string> {
  const year = new Date().getFullYear()
  
  // Get the count of existing documents this year
  const { count } = await supabase
    .from('order_documents')
    .select('*', { count: 'exact', head: true })
    .gte('generated_at', `${year}-01-01`)
  
  const sequence = (count || 0) + 1
  const paddedSequence = sequence.toString().padStart(5, '0')
  
  return `${prefix}-${year}-${paddedSequence}`
}

/**
 * Generate buyer invoice for an order
 * This is the invoice sent to the buyer from the seller
 * @param supabase Supabase client
 * @param orderId Order ID
 * @returns Generated invoice
 */
export async function generateBuyerInvoice(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: Invoice | null; error: string | null }> {
  try {
    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey (
          id, full_name, email
        ),
        seller:provider_profiles!orders_seller_id_fkey (
          id, user_id, display_name, stripe_account_id
        ),
        listing:marketplace_listings (
          id, title, description
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: 'Order not found' }
    }

    // Get seller's profile and tax info
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.seller?.user_id)
      .single()

    const { data: sellerTaxProfile } = await getTaxProfile(supabase, order.seller?.id)

    // Build company details
    const sellerDetails = buildCompanyDetails(sellerTaxProfile, {
      full_name: sellerProfile?.full_name,
      email: sellerProfile?.email || '',
    })

    const buyerDetails: CompanyDetails = {
      name: order.buyer?.full_name || 'Unknown',
      address: '', // Would need to fetch from buyer profile
      city: '',
      postcode: '',
      country: 'GB', // Default - would need buyer country
      email: order.buyer?.email || '',
    }

    // Generate invoice number
    const invoiceNumber = await getInvoiceNumber(supabase, 'INV')

    // Build line items
    const netAmount = order.total_amount - order.vat_amount
    const lineItems: InvoiceLineItem[] = [
      {
        id: '1',
        description: order.listing?.title || 'Professional Services',
        quantity: 1,
        unitPrice: netAmount,
        amount: netAmount,
        vatRate: order.vat_rate,
        vatAmount: order.vat_amount,
      },
    ]

    // Build VAT breakdown
    const vatBreakdown = formatVATBreakdown({
      totalAmount: order.total_amount,
      vatAmount: order.vat_amount,
      vatRate: order.vat_rate,
      taxTreatment: order.tax_treatment as TaxTreatment,
    })

    // Create invoice object
    const invoice: Invoice = {
      id: crypto.randomUUID(),
      orderId,
      invoiceNumber,
      documentType: 'invoice',
      status: 'generated',
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      seller: sellerDetails,
      buyer: buyerDetails,
      lineItems,
      subtotal: netAmount,
      vatBreakdown,
      total: order.total_amount,
      currency: order.currency,
      taxTreatment: order.tax_treatment as TaxTreatment,
      reverseChargeApplies: order.tax_treatment === 'reverse_charge',
      notes: order.tax_treatment === 'reverse_charge' 
        ? 'Reverse charge: Customer to account for VAT to their local tax authority'
        : undefined,
      paymentTerms: 'Payment due within 30 days',
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    }

    return { data: invoice, error: null }
  } catch (err) {
    console.error('Error generating buyer invoice:', err)
    return { data: null, error: 'Failed to generate invoice' }
  }
}

/**
 * Generate self-billing invoice for the seller
 * Used when the platform generates invoices on behalf of sellers
 * @param supabase Supabase client
 * @param orderId Order ID
 * @returns Generated self-bill invoice
 */
export async function generateSellerSelfBill(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: Invoice | null; error: string | null }> {
  try {
    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey (
          id, full_name, email
        ),
        seller:provider_profiles!orders_seller_id_fkey (
          id, user_id, display_name
        ),
        listing:marketplace_listings (
          id, title, description
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: 'Order not found' }
    }

    // Get seller's profile
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.seller?.user_id)
      .single()

    const { data: sellerTaxProfile } = await getTaxProfile(supabase, order.seller?.id)

    // Build seller details (they receive this invoice)
    const sellerDetails = buildCompanyDetails(sellerTaxProfile, {
      full_name: sellerProfile?.full_name,
      email: sellerProfile?.email || '',
    })

    // Generate invoice number with SB prefix (Self-Bill)
    const invoiceNumber = await getInvoiceNumber(supabase, 'SB')

    // Calculate seller's net payment (total - platform fee)
    const netToSeller = order.total_amount - order.platform_fee
    const sellerVAT = order.vat_amount // VAT passed through

    // Build line items
    const lineItems: InvoiceLineItem[] = [
      {
        id: '1',
        description: `Services rendered for order ${order.order_number}`,
        quantity: 1,
        unitPrice: netToSeller - sellerVAT,
        amount: netToSeller - sellerVAT,
        vatRate: order.vat_rate,
        vatAmount: sellerVAT,
      },
    ]

    // Build VAT breakdown
    const vatBreakdown: VATBreakdown = {
      netAmount: netToSeller - sellerVAT,
      vatRate: order.vat_rate,
      vatAmount: sellerVAT,
      grossAmount: netToSeller,
      taxTreatment: order.tax_treatment as TaxTreatment,
      taxTreatmentLabel: 'Self-Billing Invoice',
    }

    // Create self-bill invoice
    const invoice: Invoice = {
      id: crypto.randomUUID(),
      orderId,
      invoiceNumber,
      documentType: 'self_bill',
      status: 'generated',
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(), // Immediate - funds held in escrow
      seller: CENTAUR_COMPANY, // Platform is the "buyer" issuing self-bill
      buyer: sellerDetails, // Seller receives this
      lineItems,
      subtotal: netToSeller - sellerVAT,
      vatBreakdown,
      total: netToSeller,
      currency: order.currency,
      taxTreatment: order.tax_treatment as TaxTreatment,
      reverseChargeApplies: false,
      notes: 'Self-billing invoice issued by Centaur OS on your behalf.',
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    }

    return { data: invoice, error: null }
  } catch (err) {
    console.error('Error generating seller self-bill:', err)
    return { data: null, error: 'Failed to generate self-bill' }
  }
}

/**
 * Generate platform fee invoice
 * Invoice from Centaur OS to the seller for platform fees
 * @param supabase Supabase client
 * @param orderId Order ID
 * @returns Generated platform fee invoice
 */
export async function generatePlatformFeeInvoice(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: Invoice | null; error: string | null }> {
  try {
    // Fetch order with related data
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        seller:provider_profiles!orders_seller_id_fkey (
          id, user_id, display_name
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: 'Order not found' }
    }

    // Get seller's profile and tax info
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', order.seller?.user_id)
      .single()

    const { data: sellerTaxProfile } = await getTaxProfile(supabase, order.seller?.id)

    // Build seller details (they pay this invoice)
    const sellerDetails = buildCompanyDetails(sellerTaxProfile, {
      full_name: sellerProfile?.full_name,
      email: sellerProfile?.email || '',
    })

    // Generate invoice number with PF prefix (Platform Fee)
    const invoiceNumber = await getInvoiceNumber(supabase, 'PF')

    // Calculate platform fee with VAT
    const feeVAT = calculatePlatformFeeVAT(order.platform_fee, true)

    // Build line items
    const lineItems: InvoiceLineItem[] = [
      {
        id: '1',
        description: `Platform commission for order ${order.order_number}`,
        quantity: 1,
        unitPrice: feeVAT.netFee,
        amount: feeVAT.netFee,
        vatRate: UK_VAT_RATE,
        vatAmount: feeVAT.vatAmount,
      },
    ]

    // Build VAT breakdown
    const vatBreakdown: VATBreakdown = {
      netAmount: feeVAT.netFee,
      vatRate: UK_VAT_RATE,
      vatAmount: feeVAT.vatAmount,
      grossAmount: feeVAT.grossFee,
      taxTreatment: 'standard',
      taxTreatmentLabel: 'Standard Rate (20%)',
    }

    // Create platform fee invoice
    const invoice: Invoice = {
      id: crypto.randomUUID(),
      orderId,
      invoiceNumber,
      documentType: 'platform_fee',
      status: 'generated',
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(), // Deducted at source
      seller: CENTAUR_COMPANY, // Platform is the seller of services
      buyer: sellerDetails, // Seller is billed for fees
      lineItems,
      subtotal: feeVAT.netFee,
      vatBreakdown,
      total: feeVAT.grossFee,
      currency: order.currency,
      taxTreatment: 'standard',
      reverseChargeApplies: false,
      notes: 'Platform fee automatically deducted from order payment.',
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    }

    return { data: invoice, error: null }
  } catch (err) {
    console.error('Error generating platform fee invoice:', err)
    return { data: null, error: 'Failed to generate platform fee invoice' }
  }
}

/**
 * Generate all invoices for a completed order
 * @param supabase Supabase client
 * @param orderId Order ID
 * @returns Array of generated invoices
 */
export async function generateAllOrderInvoices(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: Invoice[]; errors: string[] }> {
  const invoices: Invoice[] = []
  const errors: string[] = []

  // Generate buyer invoice
  const buyerResult = await generateBuyerInvoice(supabase, orderId)
  if (buyerResult.data) {
    invoices.push(buyerResult.data)
  } else if (buyerResult.error) {
    errors.push(`Buyer invoice: ${buyerResult.error}`)
  }

  // Generate seller self-bill
  const selfBillResult = await generateSellerSelfBill(supabase, orderId)
  if (selfBillResult.data) {
    invoices.push(selfBillResult.data)
  } else if (selfBillResult.error) {
    errors.push(`Seller self-bill: ${selfBillResult.error}`)
  }

  // Generate platform fee invoice
  const platformFeeResult = await generatePlatformFeeInvoice(supabase, orderId)
  if (platformFeeResult.data) {
    invoices.push(platformFeeResult.data)
  } else if (platformFeeResult.error) {
    errors.push(`Platform fee invoice: ${platformFeeResult.error}`)
  }

  return { data: invoices, errors }
}

/**
 * Store invoice in order_documents table
 * @param supabase Supabase client
 * @param invoice Invoice to store
 * @param fileUrl URL to stored PDF file
 * @returns Success status
 */
export async function storeInvoiceDocument(
  supabase: TypedSupabaseClient,
  invoice: Invoice,
  fileUrl: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Map invoice document type to database document type
    const documentTypeMap: Record<InvoiceDocumentType, string> = {
      invoice: 'invoice',
      receipt: 'receipt',
      statement: 'statement',
      credit_note: 'credit_note',
      self_bill: 'invoice', // Store as invoice type
      platform_fee: 'invoice', // Store as invoice type
    }

    const { error } = await supabase
      .from('order_documents')
      .insert({
        order_id: invoice.orderId,
        document_type: documentTypeMap[invoice.documentType] || 'other',
        file_url: fileUrl,
      })

    if (error) {
      console.error('Error storing invoice document:', error)
      return { success: false, error: 'Failed to store invoice' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in storeInvoiceDocument:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get invoices for an order
 * @param supabase Supabase client
 * @param orderId Order ID
 * @returns Array of invoice documents
 */
export async function getOrderInvoices(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: Array<{ id: string; documentType: string; fileUrl: string; generatedAt: string }>; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('order_documents')
      .select('id, document_type, file_url, generated_at')
      .eq('order_id', orderId)
      .in('document_type', ['invoice', 'receipt', 'credit_note'])
      .order('generated_at', { ascending: false })

    if (error) {
      console.error('Error fetching order invoices:', error)
      return { data: [], error: 'Failed to fetch invoices' }
    }

    const documents = (data || []).map(doc => ({
      id: doc.id,
      documentType: doc.document_type,
      fileUrl: doc.file_url,
      generatedAt: doc.generated_at,
    }))

    return { data: documents, error: null }
  } catch (err) {
    console.error('Error in getOrderInvoices:', err)
    return { data: [], error: 'An unexpected error occurred' }
  }
}
