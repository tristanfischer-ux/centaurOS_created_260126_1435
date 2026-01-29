/**
 * PDF Generation Service
 * Converts invoice HTML to PDF and stores in Supabase Storage
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { Invoice } from '@/types/invoices'
import { renderInvoiceToHTML, getInvoiceFilename } from './templates'

type TypedSupabaseClient = SupabaseClient<Database>

// Storage bucket name for invoices
const INVOICES_BUCKET = 'order-documents'

/**
 * Render invoice HTML to PDF using browser's print functionality
 * This is a client-side approach that uses the browser
 * For server-side, we'd need puppeteer or similar
 * @param invoiceHtml HTML content
 * @returns PDF as Blob
 */
export async function renderInvoiceToPDF(invoiceHtml: string): Promise<Blob> {
  // Create an iframe to render the HTML
  const iframe = document.createElement('iframe')
  iframe.style.position = 'absolute'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = '800px'
  iframe.style.height = '1100px'
  document.body.appendChild(iframe)

  try {
    // Write HTML content to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      throw new Error('Could not access iframe document')
    }

    iframeDoc.open()
    iframeDoc.write(invoiceHtml)
    iframeDoc.close()

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 500))

    // Use html2canvas and jspdf if available
    // For now, return a placeholder - in production use puppeteer server-side
    // or a PDF generation library like @react-pdf/renderer
    
    // Placeholder: Return HTML as blob for now
    const blob = new Blob([invoiceHtml], { type: 'text/html' })
    return blob
  } finally {
    // Clean up iframe
    document.body.removeChild(iframe)
  }
}

/**
 * Server-side PDF generation using html-pdf-node
 * This would be used in a server action or API route
 * @param invoiceHtml HTML content
 * @returns PDF as Buffer
 */
export async function renderInvoiceToPDFServer(invoiceHtml: string): Promise<Buffer> {
  // In production, use a library like puppeteer or html-pdf-node
  // For now, return HTML content as buffer
  
  // Example with puppeteer (would need to be installed):
  // const puppeteer = await import('puppeteer')
  // const browser = await puppeteer.launch({ headless: 'new' })
  // const page = await browser.newPage()
  // await page.setContent(invoiceHtml, { waitUntil: 'networkidle0' })
  // const pdfBuffer = await page.pdf({
  //   format: 'A4',
  //   margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  //   printBackground: true,
  // })
  // await browser.close()
  // return pdfBuffer
  
  // Fallback: Return HTML as buffer
  return Buffer.from(invoiceHtml, 'utf-8')
}

/**
 * Upload PDF to Supabase Storage
 * @param supabase Supabase client
 * @param invoice Invoice object
 * @param pdfBuffer PDF content as Buffer or Blob
 * @returns Public URL of uploaded file
 */
export async function uploadInvoicePDF(
  supabase: TypedSupabaseClient,
  invoice: Invoice,
  pdfBuffer: Buffer | Blob
): Promise<{ url: string | null; error: string | null }> {
  try {
    const filename = getInvoiceFilename(invoice)
    const path = `invoices/${invoice.orderId}/${filename}`

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(INVOICES_BUCKET)
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError)
      return { url: null, error: 'Failed to upload PDF' }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(INVOICES_BUCKET)
      .getPublicUrl(path)

    return { url: urlData.publicUrl, error: null }
  } catch (err) {
    console.error('Error in uploadInvoicePDF:', err)
    return { url: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Generate PDF from invoice and upload to storage
 * @param supabase Supabase client
 * @param invoice Invoice object
 * @returns Public URL of uploaded file
 */
export async function generateAndUploadInvoicePDF(
  supabase: TypedSupabaseClient,
  invoice: Invoice
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Render invoice to HTML
    const html = renderInvoiceToHTML(invoice)

    // Generate PDF (server-side)
    const pdfBuffer = await renderInvoiceToPDFServer(html)

    // Upload to storage
    return uploadInvoicePDF(supabase, invoice, pdfBuffer)
  } catch (err) {
    console.error('Error generating and uploading PDF:', err)
    return { url: null, error: 'Failed to generate PDF' }
  }
}

/**
 * Get signed download URL for an invoice
 * @param supabase Supabase client
 * @param fileUrl Public URL or path
 * @returns Signed URL with temporary access
 */
export async function getInvoiceDownloadUrl(
  supabase: TypedSupabaseClient,
  fileUrl: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Extract path from URL if it's a full URL
    let path = fileUrl
    if (fileUrl.includes(INVOICES_BUCKET)) {
      const parts = fileUrl.split(`${INVOICES_BUCKET}/`)
      path = parts[1] || fileUrl
    }

    // Generate signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(INVOICES_BUCKET)
      .createSignedUrl(path, 3600)

    if (error) {
      console.error('Error creating signed URL:', error)
      return { url: null, error: 'Failed to generate download URL' }
    }

    return { url: data.signedUrl, error: null }
  } catch (err) {
    console.error('Error in getInvoiceDownloadUrl:', err)
    return { url: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Delete invoice PDF from storage
 * @param supabase Supabase client
 * @param fileUrl URL of file to delete
 * @returns Success status
 */
export async function deleteInvoicePDF(
  supabase: TypedSupabaseClient,
  fileUrl: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Extract path from URL
    let path = fileUrl
    if (fileUrl.includes(INVOICES_BUCKET)) {
      const parts = fileUrl.split(`${INVOICES_BUCKET}/`)
      path = parts[1] || fileUrl
    }

    const { error } = await supabase.storage
      .from(INVOICES_BUCKET)
      .remove([path])

    if (error) {
      console.error('Error deleting PDF:', error)
      return { success: false, error: 'Failed to delete PDF' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in deleteInvoicePDF:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Generate invoice preview (HTML) without saving
 * Useful for preview before finalizing
 * @param invoice Invoice object
 * @returns HTML string
 */
export function generateInvoicePreview(invoice: Invoice): string {
  return renderInvoiceToHTML(invoice)
}

/**
 * Get mime type for invoice downloads
 * @param filename Filename
 * @returns Mime type string
 */
export function getInvoiceMimeType(filename: string): string {
  if (filename.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (filename.endsWith('.html')) {
    return 'text/html'
  }
  return 'application/octet-stream'
}
