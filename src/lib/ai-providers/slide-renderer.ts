/**
 * Slide Deck Renderer — takes structured JSON and generates a PPTX file.
 * Uses pptxgenjs for client-side generation.
 * This is client-only code (browser environment).
 */

import type { SlideDeckContent, SlideContent } from "./types"

const DEFAULT_THEME = {
    primaryColor: "EA580C", // international-orange
    secondaryColor: "1E293B", // slate-800
    fontFamily: "Inter",
    backgroundColor: "FFFFFF",
}

/**
 * Generate a PPTX file from structured slide content.
 * Returns a Blob that can be downloaded.
 */
export async function generatePptx(deck: SlideDeckContent): Promise<Blob> {
    // Dynamic import to avoid SSR issues
    const PptxGenJS = (await import("pptxgenjs")).default
    const pptx = new PptxGenJS()

    const theme = {
        ...DEFAULT_THEME,
        ...deck.theme,
    }

    // Configure presentation
    pptx.layout = "LAYOUT_WIDE" // 13.33 x 7.5 inches
    pptx.author = "CentaurOS"
    pptx.title = deck.title

    for (let i = 0; i < deck.slides.length; i++) {
        const slideData = deck.slides[i]
        const slide = pptx.addSlide()

        // Background
        slide.background = { color: theme.backgroundColor }

        // Add content based on layout
        const layout = slideData.layout ?? (i === 0 ? "title" : "content")

        switch (layout) {
            case "title":
                addTitleSlide(slide, slideData, theme)
                break
            case "closing":
                addClosingSlide(slide, slideData, theme)
                break
            case "two-column":
                addTwoColumnSlide(slide, slideData, theme)
                break
            default:
                addContentSlide(slide, slideData, theme)
                break
        }

        // Speaker notes
        if (slideData.notes) {
            slide.addNotes(slideData.notes)
        }
    }

    // Generate blob
    const data = await pptx.write({ outputType: "blob" })
    return data as Blob
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addTitleSlide(
    slide: any,
    data: SlideContent,
    theme: typeof DEFAULT_THEME
) {
    // Title
    slide.addText(data.title, {
        x: 0.5,
        y: 2.0,
        w: 12.33,
        h: 1.5,
        fontSize: 44,
        fontFace: theme.fontFamily,
        color: theme.secondaryColor,
        bold: true,
        align: "center",
    })

    // Subtitle
    if (data.subtitle) {
        slide.addText(data.subtitle, {
            x: 1.5,
            y: 3.8,
            w: 10.33,
            h: 1.0,
            fontSize: 20,
            fontFace: theme.fontFamily,
            color: "64748B", // slate-500
            align: "center",
        })
    }

    // Accent bar
    slide.addShape("rect" as unknown as string, {
        x: 5.66,
        y: 3.5,
        w: 2.0,
        h: 0.06,
        fill: { color: theme.primaryColor },
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addContentSlide(
    slide: any,
    data: SlideContent,
    theme: typeof DEFAULT_THEME
) {
    // Title bar background
    slide.addShape("rect" as unknown as string, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 1.2,
        fill: { color: theme.primaryColor },
    })

    // Title text
    slide.addText(data.title, {
        x: 0.5,
        y: 0.2,
        w: 12.33,
        h: 0.8,
        fontSize: 24,
        fontFace: theme.fontFamily,
        color: "FFFFFF",
        bold: true,
    })

    // Subtitle
    if (data.subtitle) {
        slide.addText(data.subtitle, {
            x: 0.5,
            y: 1.5,
            w: 12.33,
            h: 0.6,
            fontSize: 16,
            fontFace: theme.fontFamily,
            color: "64748B",
            italic: true,
        })
    }

    // Bullet points
    if (data.bullets && data.bullets.length > 0) {
        const startY = data.subtitle ? 2.3 : 1.6
        const bulletText = data.bullets.map(b => ({
            text: b,
            options: {
                bullet: { type: "number" as const },
                fontSize: 16,
                fontFace: theme.fontFamily,
                color: theme.secondaryColor,
                paraSpaceAfter: 8,
            },
        }))

        slide.addText(bulletText, {
            x: 0.8,
            y: startY,
            w: 11.53,
            h: 7.5 - startY - 0.5,
            valign: "top",
        })
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addTwoColumnSlide(
    slide: any,
    data: SlideContent,
    theme: typeof DEFAULT_THEME
) {
    // Title bar
    slide.addShape("rect" as unknown as string, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 1.2,
        fill: { color: theme.primaryColor },
    })

    slide.addText(data.title, {
        x: 0.5,
        y: 0.2,
        w: 12.33,
        h: 0.8,
        fontSize: 24,
        fontFace: theme.fontFamily,
        color: "FFFFFF",
        bold: true,
    })

    // Split bullets into two columns
    const bullets = data.bullets ?? []
    const mid = Math.ceil(bullets.length / 2)
    const leftBullets = bullets.slice(0, mid)
    const rightBullets = bullets.slice(mid)

    const bulletOpts = (b: string) => ({
        text: b,
        options: {
            bullet: true as const,
            fontSize: 14,
            fontFace: theme.fontFamily,
            color: theme.secondaryColor,
            paraSpaceAfter: 6,
        },
    })

    if (leftBullets.length > 0) {
        slide.addText(leftBullets.map(bulletOpts), {
            x: 0.5,
            y: 1.6,
            w: 5.9,
            h: 5.4,
            valign: "top",
        })
    }

    if (rightBullets.length > 0) {
        slide.addText(rightBullets.map(bulletOpts), {
            x: 6.93,
            y: 1.6,
            w: 5.9,
            h: 5.4,
            valign: "top",
        })
    }

    // Divider line
    slide.addShape("rect" as unknown as string, {
        x: 6.56,
        y: 1.8,
        w: 0.02,
        h: 4.8,
        fill: { color: "E2E8F0" },
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addClosingSlide(
    slide: any,
    data: SlideContent,
    theme: typeof DEFAULT_THEME
) {
    // Accent bar
    slide.addShape("rect" as unknown as string, {
        x: 5.66,
        y: 2.8,
        w: 2.0,
        h: 0.06,
        fill: { color: theme.primaryColor },
    })

    slide.addText(data.title, {
        x: 0.5,
        y: 3.2,
        w: 12.33,
        h: 1.2,
        fontSize: 36,
        fontFace: theme.fontFamily,
        color: theme.secondaryColor,
        bold: true,
        align: "center",
    })

    if (data.subtitle) {
        slide.addText(data.subtitle, {
            x: 1.5,
            y: 4.6,
            w: 10.33,
            h: 0.8,
            fontSize: 18,
            fontFace: theme.fontFamily,
            color: "64748B",
            align: "center",
        })
    }
}

/**
 * Parse AI-generated text into structured SlideDeckContent.
 * The AI should be prompted to return JSON, but we also handle markdown-like formats.
 */
export function parseSlideDeckFromText(text: string): SlideDeckContent | null {
    // Try JSON first
    try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
        const jsonStr = jsonMatch ? jsonMatch[1] : text
        const parsed = JSON.parse(jsonStr)

        if (parsed.title && Array.isArray(parsed.slides)) {
            return parsed as SlideDeckContent
        }
    } catch {
        // Not valid JSON — fall through to text parsing
    }

    // Parse markdown-ish text format
    const lines = text.split("\n").filter(l => l.trim())
    if (lines.length < 2) return null

    const slides: SlideContent[] = []
    let currentSlide: SlideContent | null = null

    for (const line of lines) {
        const trimmed = line.trim()

        // Heading = new slide
        if (trimmed.startsWith("# ") || trimmed.startsWith("## ")) {
            if (currentSlide) slides.push(currentSlide)
            currentSlide = {
                title: trimmed.replace(/^#+\s*/, ""),
                bullets: [],
            }
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.match(/^\d+\.\s/)) {
            // Bullet point
            if (currentSlide) {
                currentSlide.bullets = currentSlide.bullets ?? []
                currentSlide.bullets.push(trimmed.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, ""))
            }
        } else if (trimmed.startsWith("> ")) {
            // Notes
            if (currentSlide) {
                currentSlide.notes = (currentSlide.notes ?? "") + trimmed.slice(2) + "\n"
            }
        } else if (currentSlide && !currentSlide.subtitle && !currentSlide.bullets?.length) {
            // First non-heading, non-bullet line after title = subtitle
            currentSlide.subtitle = trimmed
        }
    }

    if (currentSlide) slides.push(currentSlide)

    if (slides.length === 0) return null

    // Set layout hints
    if (slides.length > 0) slides[0].layout = "title"
    if (slides.length > 1) slides[slides.length - 1].layout = "closing"

    return {
        title: slides[0].title,
        slides,
    }
}

/**
 * Download a slide deck as PPTX.
 */
export async function downloadSlideDeck(deck: SlideDeckContent, filename?: string): Promise<void> {
    const blob = await generatePptx(deck)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename ?? `${deck.title.replace(/[^a-zA-Z0-9]/g, "_")}.pptx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
