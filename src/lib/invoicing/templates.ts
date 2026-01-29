/**
 * Invoice Templates
 * HTML templates and formatting helpers for invoice generation
 */

import {
  Invoice,
  InvoiceLineItem,
  CompanyDetails,
  VATBreakdown,
  TAX_TREATMENT_LABELS,
  COUNTRY_LABELS,
} from '@/types/invoices'

/**
 * Format currency for display
 * @param amount Amount to format
 * @param currency Currency code
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  const symbols: Record<string, string> = {
    GBP: '£',
    EUR: '€',
    USD: '$',
  }
  
  const symbol = symbols[currency] || currency
  return `${symbol}${amount.toFixed(2)}`
}

/**
 * Format date for invoice display
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format percentage for display
 * @param rate Rate as decimal (e.g., 0.20)
 * @returns Formatted percentage string
 */
export function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

/**
 * Get country name from code
 * @param code ISO country code
 * @returns Country name
 */
export function getCountryName(code: string): string {
  return COUNTRY_LABELS[code.toUpperCase()] || code
}

/**
 * Format company address for display
 * @param company Company details
 * @returns Formatted address string
 */
export function formatCompanyAddress(company: CompanyDetails): string {
  const parts = [
    company.name,
    company.address,
    company.city,
    company.postcode,
    getCountryName(company.country),
  ].filter(Boolean)
  
  return parts.join('\n')
}

/**
 * Render company details section
 * @param company Company details
 * @param title Section title
 * @returns HTML string
 */
function renderCompanySection(company: CompanyDetails, title: string): string {
  return `
    <div class="company-section">
      <h3>${title}</h3>
      <p class="company-name">${company.name}</p>
      ${company.address ? `<p>${company.address}</p>` : ''}
      ${company.city || company.postcode ? `<p>${[company.city, company.postcode].filter(Boolean).join(', ')}</p>` : ''}
      <p>${getCountryName(company.country)}</p>
      ${company.vatNumber ? `<p class="vat-number">VAT: ${company.vatNumber}</p>` : ''}
      ${company.companyNumber ? `<p class="company-number">Company No: ${company.companyNumber}</p>` : ''}
      ${company.email ? `<p class="email">${company.email}</p>` : ''}
    </div>
  `
}

/**
 * Render line items table
 * @param lineItems Array of line items
 * @param currency Currency code
 * @returns HTML string
 */
function renderLineItems(lineItems: InvoiceLineItem[], currency: string): string {
  const rows = lineItems.map(item => `
    <tr>
      <td class="description">${item.description}</td>
      <td class="quantity">${item.quantity}</td>
      <td class="unit-price">${formatCurrency(item.unitPrice, currency)}</td>
      <td class="vat-rate">${formatPercentage(item.vatRate)}</td>
      <td class="amount">${formatCurrency(item.amount, currency)}</td>
    </tr>
  `).join('')

  return `
    <table class="line-items">
      <thead>
        <tr>
          <th class="description">Description</th>
          <th class="quantity">Qty</th>
          <th class="unit-price">Unit Price</th>
          <th class="vat-rate">VAT Rate</th>
          <th class="amount">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `
}

/**
 * Render VAT breakdown section
 * @param breakdown VAT breakdown
 * @param currency Currency code
 * @returns HTML string
 */
function renderVATBreakdown(breakdown: VATBreakdown, currency: string): string {
  return `
    <div class="vat-breakdown">
      <table class="totals">
        <tr>
          <td>Subtotal (excl. VAT)</td>
          <td class="amount">${formatCurrency(breakdown.netAmount, currency)}</td>
        </tr>
        <tr>
          <td>VAT @ ${formatPercentage(breakdown.vatRate)}</td>
          <td class="amount">${formatCurrency(breakdown.vatAmount, currency)}</td>
        </tr>
        <tr class="total">
          <td><strong>Total</strong></td>
          <td class="amount"><strong>${formatCurrency(breakdown.grossAmount, currency)}</strong></td>
        </tr>
      </table>
      <p class="tax-treatment">${breakdown.taxTreatmentLabel}</p>
    </div>
  `
}

/**
 * Get invoice title based on document type
 * @param documentType Document type
 * @returns Title string
 */
function getInvoiceTitle(documentType: Invoice['documentType']): string {
  const titles: Record<Invoice['documentType'], string> = {
    invoice: 'TAX INVOICE',
    receipt: 'RECEIPT',
    statement: 'STATEMENT',
    credit_note: 'CREDIT NOTE',
    self_bill: 'SELF-BILLING INVOICE',
    platform_fee: 'PLATFORM FEE INVOICE',
  }
  return titles[documentType] || 'INVOICE'
}

/**
 * Render full invoice to HTML
 * @param invoice Invoice object
 * @returns HTML string
 */
export function renderInvoiceToHTML(invoice: Invoice): string {
  const title = getInvoiceTitle(invoice.documentType)
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${invoice.invoiceNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    /* Header */
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .invoice-number {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
    
    .invoice-meta {
      text-align: right;
    }
    
    .invoice-meta p {
      margin-bottom: 4px;
    }
    
    .invoice-meta .label {
      color: #6b7280;
    }
    
    .invoice-meta .value {
      font-weight: 600;
    }
    
    /* Parties */
    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    
    .company-section {
      flex: 1;
    }
    
    .company-section h3 {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .company-section .company-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .company-section p {
      margin-bottom: 2px;
    }
    
    .company-section .vat-number,
    .company-section .company-number {
      color: #6b7280;
      font-size: 11px;
      margin-top: 8px;
    }
    
    /* Line Items */
    .line-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    .line-items th {
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
      padding: 12px 8px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
    }
    
    .line-items td {
      padding: 12px 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .line-items .description {
      width: 40%;
    }
    
    .line-items .quantity,
    .line-items .vat-rate {
      width: 10%;
      text-align: center;
    }
    
    .line-items .unit-price,
    .line-items .amount {
      width: 20%;
      text-align: right;
    }
    
    .line-items th.quantity,
    .line-items th.vat-rate,
    .line-items th.unit-price,
    .line-items th.amount {
      text-align: right;
    }
    
    .line-items th.quantity,
    .line-items th.vat-rate {
      text-align: center;
    }
    
    /* VAT Breakdown */
    .vat-breakdown {
      margin-left: auto;
      width: 300px;
    }
    
    .totals {
      width: 100%;
      border-collapse: collapse;
    }
    
    .totals td {
      padding: 8px 0;
    }
    
    .totals .amount {
      text-align: right;
    }
    
    .totals .total {
      border-top: 2px solid #e5e7eb;
    }
    
    .totals .total td {
      padding-top: 12px;
      font-size: 14px;
    }
    
    .tax-treatment {
      margin-top: 12px;
      font-size: 11px;
      color: #6b7280;
      text-align: right;
    }
    
    /* Notes */
    .notes {
      margin-top: 40px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 4px;
    }
    
    .notes h4 {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .notes p {
      font-size: 11px;
      color: #374151;
    }
    
    /* Reverse Charge Notice */
    .reverse-charge-notice {
      margin-top: 20px;
      padding: 12px 16px;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 4px;
      font-size: 11px;
      color: #92400e;
    }
    
    /* Footer */
    .invoice-footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 10px;
      color: #9ca3af;
    }
    
    /* Payment Terms */
    .payment-terms {
      margin-top: 30px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    
    .payment-terms h4 {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .payment-terms p {
      font-size: 11px;
    }
    
    /* Print styles */
    @media print {
      body {
        padding: 0;
      }
      
      .invoice-container {
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <header class="invoice-header">
      <div>
        <h1 class="invoice-title">${title}</h1>
        <p class="invoice-number">${invoice.invoiceNumber}</p>
      </div>
      <div class="invoice-meta">
        <p><span class="label">Date:</span> <span class="value">${formatDate(invoice.issueDate)}</span></p>
        <p><span class="label">Due:</span> <span class="value">${formatDate(invoice.dueDate)}</span></p>
      </div>
    </header>
    
    <section class="parties">
      ${renderCompanySection(invoice.seller, 'From')}
      ${renderCompanySection(invoice.buyer, 'To')}
    </section>
    
    ${renderLineItems(invoice.lineItems, invoice.currency)}
    
    ${renderVATBreakdown(invoice.vatBreakdown, invoice.currency)}
    
    ${invoice.reverseChargeApplies ? `
      <div class="reverse-charge-notice">
        <strong>Reverse Charge:</strong> Customer to account for VAT to their local tax authority
      </div>
    ` : ''}
    
    ${invoice.notes ? `
      <div class="notes">
        <h4>Notes</h4>
        <p>${invoice.notes}</p>
      </div>
    ` : ''}
    
    ${invoice.paymentTerms ? `
      <div class="payment-terms">
        <h4>Payment Terms</h4>
        <p>${invoice.paymentTerms}</p>
      </div>
    ` : ''}
    
    <footer class="invoice-footer">
      <p>Generated by Centaur OS - ${formatDate(new Date().toISOString())}</p>
    </footer>
  </div>
</body>
</html>
  `
}

/**
 * Generate simplified invoice summary for email
 * @param invoice Invoice object
 * @returns Plain text summary
 */
export function renderInvoiceSummary(invoice: Invoice): string {
  return `
Invoice ${invoice.invoiceNumber}
================================

From: ${invoice.seller.name}
To: ${invoice.buyer.name}

Date: ${formatDate(invoice.issueDate)}
Due: ${formatDate(invoice.dueDate)}

Items:
${invoice.lineItems.map(item => `  - ${item.description}: ${formatCurrency(item.amount, invoice.currency)}`).join('\n')}

Subtotal: ${formatCurrency(invoice.vatBreakdown.netAmount, invoice.currency)}
VAT (${formatPercentage(invoice.vatBreakdown.vatRate)}): ${formatCurrency(invoice.vatBreakdown.vatAmount, invoice.currency)}
Total: ${formatCurrency(invoice.total, invoice.currency)}

${invoice.notes ? `Notes: ${invoice.notes}` : ''}
  `.trim()
}

/**
 * Get invoice filename
 * @param invoice Invoice object
 * @returns Filename string
 */
export function getInvoiceFilename(invoice: Invoice): string {
  const prefix = invoice.documentType.replace('_', '-')
  return `${prefix}-${invoice.invoiceNumber}.pdf`
}
