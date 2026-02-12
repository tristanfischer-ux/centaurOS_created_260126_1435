/**
 * @file export-utils.ts
 *
 * @description Client-side export utilities for converting text/markdown content
 * to downloadable PDF and DOCX files. Markdown export is handled by the
 * existing downloadAsFile() in agents/lib/export-markdown.ts. These functions
 * dynamically import their dependencies to avoid bundle size impact.
 *
 * @dependencies
 * - html2pdf.js — Client-side PDF generation (~50KB, no server needed)
 * - docx — Word document generation (~100KB, well-maintained)
 *
 * @related
 * - src/app/(platform)/agents/lib/export-markdown.ts — Markdown export
 * - src/app/(platform)/agents/components/node-inspector.tsx — Per-node export
 * - src/app/(platform)/agents/components/workflow-toolbar.tsx — Full-chain export
 */

/**
 * Converts basic markdown to HTML for PDF rendering.
 *
 * @description Handles headings, bold, italic, code blocks, inline code,
 * horizontal rules, unordered/ordered lists, blockquotes, and tables.
 * Not a full markdown parser — covers the output patterns from our AI prompts.
 *
 * @param markdown - Raw markdown string
 * @returns HTML string
 */
function markdownToHtml(markdown: string): string {
    let html = markdown
        // Escape HTML entities first (except our own tags)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

    // Code blocks (fenced ```...```) — must come before other transformations
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
        return `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;line-height:1.5;"><code>${code.trim()}</code></pre>`
    })

    // Tables
    html = html.replace(
        /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g,
        (_match, headerRow: string, _separator: string, bodyRows: string) => {
            const headers = headerRow
                .split("|")
                .filter((c: string) => c.trim())
                .map(
                    (c: string) =>
                        `<th style="border:1px solid #e2e8f0;padding:6px 10px;text-align:left;background:#f8fafc;font-size:12px;">${c.trim()}</th>`
                )
                .join("")
            const rows = bodyRows
                .trim()
                .split("\n")
                .map((row: string) => {
                    const cells = row
                        .split("|")
                        .filter((c: string) => c.trim())
                        .map(
                            (c: string) =>
                                `<td style="border:1px solid #e2e8f0;padding:6px 10px;font-size:12px;">${c.trim()}</td>`
                        )
                        .join("")
                    return `<tr>${cells}</tr>`
                })
                .join("")
            return `<table style="border-collapse:collapse;width:100%;margin:12px 0;"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
        }
    )

    // Headings
    html = html.replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;font-weight:600;margin:16px 0 8px;">$1</h4>')
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:20px 0 8px;">$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:600;margin:24px 0 8px;">$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:22px;font-weight:700;margin:28px 0 12px;">$1</h1>')

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

    // Inline code
    html = html.replace(
        /`([^`]+)`/g,
        '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>'
    )

    // Blockquotes
    html = html.replace(
        /^&gt; (.+)$/gm,
        '<blockquote style="border-left:3px solid #e2e8f0;padding-left:12px;color:#64748b;margin:8px 0;">$1</blockquote>'
    )

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />')

    // Unordered lists
    html = html.replace(
        /^- (.+)$/gm,
        '<li style="margin:2px 0;font-size:13px;">$1</li>'
    )
    html = html.replace(
        /(<li[^>]*>.*<\/li>\n?)+/g,
        (match) => `<ul style="padding-left:20px;margin:8px 0;">${match}</ul>`
    )

    // Ordered lists (numbered)
    html = html.replace(
        /^\d+\. (.+)$/gm,
        '<li style="margin:2px 0;font-size:13px;">$1</li>'
    )

    // Paragraphs — wrap remaining text lines
    html = html.replace(
        /^(?!<[hupltbod]|<\/|<hr|<br|<li|<code|<pre|<strong|<em|<blockquote)(.+)$/gm,
        '<p style="margin:6px 0;font-size:13px;line-height:1.6;">$1</p>'
    )

    return html
}

/**
 * Maximum content length (in characters) that html2pdf.js can reliably handle.
 * Content exceeding this is truncated with a notice.
 */
const PDF_MAX_CONTENT_LENGTH = 200_000

/**
 * Timeout (ms) for the html2pdf conversion. If it takes longer, we surface
 * an error instead of silently hanging.
 */
const PDF_GENERATION_TIMEOUT_MS = 30_000

/**
 * Strips base64 data URIs from content that would cause html2pdf.js to choke.
 * Replaces them with a placeholder note so the user knows images were removed.
 *
 * @param content - Raw markdown/text content
 * @returns Cleaned content with base64 images replaced
 */
function stripBase64Images(content: string): string {
    return content.replace(
        /!\[([^\]]*)\]\(data:[^;]+;base64,[A-Za-z0-9+/=]+\)/g,
        '[Image: $1 — see original for full image]'
    ).replace(
        /data:[^;]+;base64,[A-Za-z0-9+/=]+/g,
        '[Image removed for PDF export]'
    )
}

/**
 * Exports content as a PDF file using html2pdf.js (dynamic import).
 *
 * @description Renders markdown content as styled HTML, then converts to PDF
 * using html2pdf.js. Base64 images are stripped before conversion because
 * html2pdf.js (which uses html2canvas internally) silently fails on very
 * large HTML payloads. Content exceeding 200K characters is truncated.
 *
 * @param content - Markdown or plain text content
 * @param filename - Download filename (should end in .pdf)
 *
 * @throws {Error} If PDF generation times out or fails
 */
export async function exportAsPDF(
    content: string,
    filename: string
): Promise<void> {
    // VALIDATION: Strip base64 images that cause html2pdf.js to silently fail
    let cleanContent = stripBase64Images(content)

    // VALIDATION: Truncate very large content to prevent memory issues
    if (cleanContent.length > PDF_MAX_CONTENT_LENGTH) {
        console.warn(
            `[ExportUtils] Content too large for PDF (${cleanContent.length} chars), truncating to ${PDF_MAX_CONTENT_LENGTH}`
        )
        cleanContent =
            cleanContent.substring(0, PDF_MAX_CONTENT_LENGTH) +
            '\n\n---\n\n*[Content truncated for PDF export. Download as Markdown for the full document.]*'
    }

    // Dynamic import to avoid bundle size impact
    const html2pdfModule = await import("html2pdf.js")
    const html2pdf = html2pdfModule.default

    const htmlContent = markdownToHtml(cleanContent)

    const wrapper = document.createElement("div")
    wrapper.innerHTML = htmlContent
    wrapper.style.fontFamily =
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    wrapper.style.padding = "20px"
    wrapper.style.color = "#0f172a"
    wrapper.style.maxWidth = "100%"

    const options = {
        margin: [10, 15, 10, 15],
        filename: filename,
        image: { type: "jpeg", quality: 0.85 },
        html2canvas: { scale: 1.5, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
    }

    // Wrap in a timeout so silent failures are surfaced to the caller
    const pdfPromise = html2pdf().set(options).from(wrapper).save()
    const timeoutPromise = new Promise<never>((_resolve, reject) =>
        setTimeout(
            () => reject(new Error('PDF generation timed out. Try downloading as Markdown instead.')),
            PDF_GENERATION_TIMEOUT_MS
        )
    )

    await Promise.race([pdfPromise, timeoutPromise])
}

/**
 * Exports content as a DOCX (Word) file using the docx library (dynamic import).
 *
 * @description Parses markdown content into structured DOCX paragraphs with
 * headings, lists, and text formatting. The library is dynamically imported
 * to avoid bundling at compile time.
 *
 * @param content - Markdown or plain text content
 * @param filename - Download filename (should end in .docx)
 */
export async function exportAsDOCX(
    content: string,
    filename: string
): Promise<void> {
    // Dynamic import to avoid bundle size impact
    const docxModule = await import("docx")
    const {
        Document,
        Paragraph,
        TextRun,
        HeadingLevel,
        Packer,
        AlignmentType,
    } = docxModule

    const lines = content.split("\n")
    const children: InstanceType<typeof Paragraph>[] = []

    for (const line of lines) {
        const trimmed = line.trim()

        // Skip empty lines (add spacing)
        if (!trimmed) {
            children.push(new Paragraph({ text: "" }))
            continue
        }

        // Horizontal rule
        if (trimmed === "---") {
            children.push(
                new Paragraph({
                    text: "─".repeat(60),
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                })
            )
            continue
        }

        // Headings
        if (trimmed.startsWith("#### ")) {
            children.push(
                new Paragraph({
                    text: trimmed.slice(5),
                    heading: HeadingLevel.HEADING_4,
                })
            )
            continue
        }
        if (trimmed.startsWith("### ")) {
            children.push(
                new Paragraph({
                    text: trimmed.slice(4),
                    heading: HeadingLevel.HEADING_3,
                })
            )
            continue
        }
        if (trimmed.startsWith("## ")) {
            children.push(
                new Paragraph({
                    text: trimmed.slice(3),
                    heading: HeadingLevel.HEADING_2,
                })
            )
            continue
        }
        if (trimmed.startsWith("# ")) {
            children.push(
                new Paragraph({
                    text: trimmed.slice(2),
                    heading: HeadingLevel.HEADING_1,
                })
            )
            continue
        }

        // Bullet list items
        if (trimmed.startsWith("- ")) {
            children.push(
                new Paragraph({
                    text: trimmed.slice(2),
                    bullet: { level: 0 },
                })
            )
            continue
        }

        // Numbered list items
        const numberedMatch = trimmed.match(/^\d+\.\s(.+)$/)
        if (numberedMatch) {
            children.push(
                new Paragraph({
                    text: numberedMatch[1],
                    numbering: { reference: "default-numbering", level: 0 },
                })
            )
            continue
        }

        // Blockquote
        if (trimmed.startsWith("> ")) {
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: trimmed.slice(2),
                            italics: true,
                            color: "64748B",
                        }),
                    ],
                    indent: { left: 720 },
                })
            )
            continue
        }

        // Regular paragraph — parse bold/italic inline
        const runs: InstanceType<typeof TextRun>[] = []
        // Split on **bold** and *italic* markers
        const parts = trimmed.split(/(\*\*.*?\*\*|\*.*?\*)/g)
        for (const part of parts) {
            if (part.startsWith("**") && part.endsWith("**")) {
                runs.push(
                    new TextRun({
                        text: part.slice(2, -2),
                        bold: true,
                    })
                )
            } else if (
                part.startsWith("*") &&
                part.endsWith("*") &&
                part.length > 2
            ) {
                runs.push(
                    new TextRun({
                        text: part.slice(1, -1),
                        italics: true,
                    })
                )
            } else if (part) {
                runs.push(new TextRun({ text: part }))
            }
        }

        if (runs.length > 0) {
            children.push(new Paragraph({ children: runs }))
        }
    }

    const doc = new Document({
        numbering: {
            config: [
                {
                    reference: "default-numbering",
                    levels: [
                        {
                            level: 0,
                            format: docxModule.LevelFormat.DECIMAL,
                            text: "%1.",
                            alignment: AlignmentType.START,
                        },
                    ],
                },
            ],
        },
        sections: [
            {
                children,
            },
        ],
    })

    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
