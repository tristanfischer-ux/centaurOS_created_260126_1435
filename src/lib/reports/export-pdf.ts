/**
 * @file export-pdf.ts
 *
 * @description Client-side PDF export for report documents. Rather than
 * converting markdown to HTML, this captures the actual React-rendered DOM
 * (including SVG charts from Recharts) and converts it to a PDF.
 *
 * DECISION: Using html2pdf.js on the live DOM element instead of server-side
 * Playwright because Playwright is only a dev dependency (E2E tests) and isn't
 * available in Vercel serverless functions. The DOM approach preserves SVG
 * chart rendering and uses the exact same CSS as the preview.
 *
 * @related
 * - src/lib/export-utils.ts — Generic markdown-to-PDF export
 * - src/components/reports/ReportDocument.tsx — The component being captured
 */

const PDF_GENERATION_TIMEOUT_MS = 30_000

/**
 * Export a report document to PDF by capturing a DOM element.
 *
 * @description Dynamically imports html2pdf.js and generates a PDF from
 * the provided DOM element. Optimized for A4 output with generous margins
 * and high-quality image settings for chart SVGs.
 *
 * @param element - The DOM element containing the rendered report
 * @param filename - Output filename (should end in .pdf)
 * @throws {Error} If PDF generation times out or fails
 */
export async function exportReportAsPDF(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const html2pdfModule = await import('html2pdf.js')
  const html2pdf = html2pdfModule.default

  const options = {
    margin: [15, 18, 15, 18] as [number, number, number, number],
    filename,
    image: { type: 'jpeg' as const, quality: 0.92 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      // INTENT: letterRendering improves text quality in the PDF
      letterRendering: true,
      // Capture SVG charts properly
      allowTaint: false,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait' as const,
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'] as string[],
    },
  }

  const pdfPromise = html2pdf().set(options).from(element).save()
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('PDF generation timed out. Try using your browser\'s Print function instead.')),
      PDF_GENERATION_TIMEOUT_MS
    )
  })

  try {
    await Promise.race([pdfPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

/**
 * Trigger the browser's native print dialog for the report.
 *
 * @description Opens a new window with just the report content and triggers
 * print. The browser's Save as PDF option produces pixel-perfect output
 * because it uses the actual CSS rendering engine. This is the recommended
 * approach for the highest quality PDF output.
 *
 * @param element - The DOM element containing the rendered report
 * @param title - The document title for the print dialog
 */
export function printReport(element: HTMLElement, title: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('Pop-up blocked. Please allow pop-ups for this site.')
  }

  // SECURITY: Escape title to prevent XSS via document.write()
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const safeTitle = escapeHtml(title)

  // Collect stylesheets from the current document
  const styleSheets = Array.from(document.styleSheets)
    .map(sheet => {
      try {
        return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
      } catch {
        // Cross-origin stylesheets can't be read
        return sheet.href ? `@import url("${sheet.href}");` : ''
      }
    })
    .join('\n')

  // INTENT: Assign onload BEFORE document.close() so it fires reliably.
  // Some browsers fire onload synchronously during close().
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${safeTitle}</title>
      <style>
        ${styleSheets}
        @media print {
          body { margin: 0; padding: 20mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page {
          size: A4 portrait;
          margin: 20mm;
        }
      </style>
    </head>
    <body>
      ${element.outerHTML}
    </body>
    </html>
  `)

  printWindow.document.close()
}
