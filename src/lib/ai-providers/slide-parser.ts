/**
 * @file slide-parser.ts
 *
 * @description Pure text parsing utilities for slide decks.
 * Extracted from slide-renderer.ts to avoid pulling pptxgenjs
 * (and its node:https/fs dependencies) into the client webpack bundle.
 */

import type { SlideDeckContent, SlideContent } from "./types"

/**
 * Parse AI-generated text into structured SlideDeckContent.
 * The AI should be prompted to return JSON, but we also handle markdown-like formats.
 *
 * @param text - Raw AI output (JSON or markdown)
 * @returns Parsed slide deck, or null if unparseable
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
