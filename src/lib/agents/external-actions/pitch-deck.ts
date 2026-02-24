/**
 * @file pitch-deck.ts — Pitch deck generation external action handler.
 *
 * @description Generates a PowerPoint pitch deck from specialist-proposed data
 * using pptxgenjs. Called from external-integrations.ts after founder approval.
 *
 * @security Requires founder approval. Never auto-executed.
 */

import PptxGenJS from "pptxgenjs"

export interface PitchDeckPayload {
    title: string
    subtitle?: string
    slides: Array<{
        title: string
        bullets?: string[]
        content?: string
    }>
    companyName?: string
}

/**
 * Generate a PowerPoint pitch deck and return it as base64.
 *
 * @param payload - Deck structure from the specialist proposal
 * @returns Base64-encoded PPTX or error
 */
export async function generatePitchDeck(
    payload: PitchDeckPayload,
): Promise<{ base64: string | null; filename: string; error: string | null }> {
    const filename = `${payload.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "-")}.pptx`

    try {
        const pptx = new PptxGenJS()
        pptx.layout = "LAYOUT_WIDE"
        pptx.author = payload.companyName ?? "ForgeOS"
        pptx.title = payload.title

        // Title slide
        const titleSlide = pptx.addSlide()
        titleSlide.addText(payload.title, {
            x: 0.5,
            y: 1.5,
            w: "90%",
            fontSize: 36,
            bold: true,
            color: "333333",
            align: "center",
        })
        if (payload.subtitle) {
            titleSlide.addText(payload.subtitle, {
                x: 0.5,
                y: 3,
                w: "90%",
                fontSize: 18,
                color: "666666",
                align: "center",
            })
        }

        // Content slides
        for (const slide of payload.slides) {
            const s = pptx.addSlide()

            s.addText(slide.title, {
                x: 0.5,
                y: 0.3,
                w: "90%",
                fontSize: 28,
                bold: true,
                color: "333333",
            })

            if (slide.bullets && slide.bullets.length > 0) {
                const textRows = slide.bullets.map((b) => ({
                    text: b,
                    options: { fontSize: 16, color: "444444", bullet: true as const, breakLine: true as const },
                }))
                s.addText(textRows, {
                    x: 0.5,
                    y: 1.2,
                    w: "90%",
                    h: 4,
                    valign: "top" as const,
                })
            } else if (slide.content) {
                s.addText(slide.content, {
                    x: 0.5,
                    y: 1.2,
                    w: "90%",
                    h: 4,
                    fontSize: 16,
                    color: "444444",
                    valign: "top" as const,
                })
            }
        }

        // Generate base64
        const base64 = (await pptx.write({ outputType: "base64" })) as string
        return { base64, filename, error: null }
    } catch (err) {
        return { base64: null, filename, error: err instanceof Error ? err.message : "Failed to generate pitch deck" }
    }
}
