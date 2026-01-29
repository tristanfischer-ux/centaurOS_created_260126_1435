/**
 * Invoice Types
 * Type definitions for the invoicing system
 */

// Invoice status tracking
export type InvoiceStatus = 'draft' | 'generated' | 'sent' | 'paid' | 'void' | 'cancelled'

// Document types that can be generated
export type InvoiceDocumentType = 'invoice' | 'receipt' | 'statement' | 'credit_note' | 'self_bill' | 'platform_fee'

// Tax treatment classification
export type TaxTreatment = 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated'

// VAT breakdown for display
export interface VATBreakdown {
  netAmount: number
  vatRate: number
  vatAmount: number
  grossAmount: number
  taxTreatment: TaxTreatment
  taxTreatmentLabel: string
}

// Line item on an invoice
export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatRate: number
  vatAmount: number
}

// Company details for invoices
export interface CompanyDetails {
  name: string
  address: string
  city: string
  postcode: string
  country: string
  vatNumber?: string
  companyNumber?: string
  email?: string
  phone?: string
}

// Invoice document
export interface Invoice {
  id: string
  orderId: string
  invoiceNumber: string
  documentType: InvoiceDocumentType
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  
  // Parties
  seller: CompanyDetails
  buyer: CompanyDetails
  
  // Line items
  lineItems: InvoiceLineItem[]
  
  // Totals
  subtotal: number
  vatBreakdown: VATBreakdown
  total: number
  currency: string
  
  // Tax info
  taxTreatment: TaxTreatment
  reverseChargeApplies: boolean
  
  // Meta
  notes?: string
  paymentTerms?: string
  bankDetails?: BankDetails
  
  // Storage
  fileUrl?: string
  generatedAt?: string
  createdAt: string
}

// Bank details for payment
export interface BankDetails {
  accountName: string
  accountNumber: string
  sortCode: string
  iban?: string
  swift?: string
  bankName?: string
}

// Tax profile for a provider
export interface TaxProfile {
  id: string
  providerId: string
  countryCode: string
  vatNumber: string | null
  vatVerified: boolean
  taxExempt: boolean
  
  // Extended fields for forms
  companyName?: string
  tradingName?: string
  registeredAddress?: string
  city?: string
  postcode?: string
  createdAt: string
}

// Input for creating/updating tax profile
export interface TaxProfileInput {
  countryCode: string
  vatNumber?: string | null
  taxExempt?: boolean
  companyName?: string
  tradingName?: string
  registeredAddress?: string
  city?: string
  postcode?: string
}

// VAT validation result
export interface VATValidationResult {
  valid: boolean
  formatted?: string
  countryCode?: string
  errors?: string[]
}

// VIES verification result (EU VAT validation)
export interface VIESVerificationResult {
  valid: boolean
  name?: string
  address?: string
  requestDate: string
  countryCode: string
  vatNumber: string
}

// Order invoice generation input
export interface GenerateInvoiceInput {
  orderId: string
  documentType: InvoiceDocumentType
}

// Invoice list filters
export interface InvoiceFilters {
  documentType?: InvoiceDocumentType
  status?: InvoiceStatus
  orderId?: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

// Invoice summary for list views
export interface InvoiceSummary {
  id: string
  orderId: string
  invoiceNumber: string
  documentType: InvoiceDocumentType
  status: InvoiceStatus
  total: number
  currency: string
  issueDate: string
  fileUrl?: string
}

// EU country list for VAT purposes
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
] as const

export type EUCountry = typeof EU_COUNTRIES[number]

// Standard UK VAT rate
export const UK_VAT_RATE = 0.20

// Country labels for display
export const COUNTRY_LABELS: Record<string, string> = {
  GB: 'United Kingdom',
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czech Republic',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  CH: 'Switzerland',
  NO: 'Norway',
}

// Tax treatment labels
export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  standard: 'Standard Rate (20%)',
  reverse_charge: 'Reverse Charge',
  exempt: 'VAT Exempt',
  zero_rated: 'Zero Rated (Export)',
}
