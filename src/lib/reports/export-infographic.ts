/**
 * @file export-infographic.ts
 *
 * @description Client-side utility to export a rendered infographic DOM element
 * as a PNG image using html2canvas. Dynamically imported in the browser when
 * a user requests an image export.
 *
 * DECISION: Using html2canvas (already available via html2pdf.js transitive dep)
 * rather than adding a new dependency. The DOM-capture approach preserves the
 * exact Tailwind CSS styling visible on screen.
 *
 * @related
 * - src/components/reports/ReportInfographic.tsx — Component being captured
 * - src/lib/reports/export-pdf.ts — Similar DOM-capture pattern for PDF
 */

/**
 * @description Captures a DOM element as a PNG image blob using html2canvas.
 *
 * @param element The DOM element to capture (typically the infographic container)
 * @returns A Blob containing the PNG image data
 */
export async function exportInfographicAsImage(element: HTMLElement): Promise<Blob> {
  const html2canvasModule = await import('html2canvas')
  const html2canvas = html2canvasModule.default

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    allowTaint: false,
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to create image blob from canvas'))
      },
      'image/png',
      1.0
    )
  })
}

/**
 * @description Captures a DOM element as a PNG and triggers a browser download.
 *
 * @param element The DOM element to capture
 * @param filename The download filename (should end in .png)
 */
export async function downloadInfographicAsImage(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const blob = await exportInfographicAsImage(element)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
