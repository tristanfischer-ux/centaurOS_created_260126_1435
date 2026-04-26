#!/usr/bin/env node
/**
 * patch-react-pdf.js — postinstall patch for the Yoga "unsupported number"
 * crash in @react-pdf/pdfkit + @react-pdf/render.
 *
 * Replaces the throw-on-out-of-range guard with a clamp to ±1e7. PDF
 * coords for A4 max ~842pt; anything bigger is sentinel garbage from
 * Yoga's layout solver hitting an undefined-dimension corner case
 * (verified 2026-04-26 NIGHT after ~6 hours of failed userland
 * approaches).
 *
 * Why not patch-package: the patch-package generator produces hunks
 * that fail to apply on Vercel's pnpm/yarn install (file context
 * mismatch). This script is content-aware — finds the throw line by
 * regex, replaces with the clamp body. Robust against minor whitespace
 * + version drift.
 *
 * Failure mode: if the file format changes upstream and the regex
 * doesn't match, the script logs a warning and exits 0 — does NOT fail
 * the build. Visible warning surfaces in Vercel build logs so we know
 * to re-write the patch. Build still ships; PDFs just continue to
 * crash on Yoga overflow until we fix.
 */

const fs = require('fs')
const path = require('path')

const TARGETS = [
    {
        path: 'node_modules/@react-pdf/pdfkit/lib/pdfkit.js',
        // The exact original block (cleanly indented under `class PDFObject`).
        // Match by the throw line's content; replace the entire if/throw.
        find: /if \(n > -1e21 && n < 1e21\) \{\s*\n\s*return Math\.round\(n \* 1e6\) \/ 1e6;\s*\n\s*\}\s*\n\s*throw new Error\(`unsupported number: \$\{n\}`\);/,
    },
    {
        path: 'node_modules/@react-pdf/render/lib/index.js',
        find: /if \(n > -1e21 && n < 1e21\) \{\s*\n\s*return Math\.round\(n \* 1e6\) \/ 1e6;\s*\n\s*\}\s*\n\s*throw new Error\(`unsupported number: \$\{n\}`\);/,
    },
]

const REPLACEMENT = `// Forge patch (scripts/patch-react-pdf.js): clamp Yoga overflow to ±1e7
    // — PDF coords for A4 max ~842pt, so >1e7 is sentinel garbage. Clamp
    // instead of throwing so PDFs emit even when Yoga produces nonsense.
    if (!isFinite(n)) n = 0;
    if (n > 1e7) n = 1e7;
    else if (n < -1e7) n = -1e7;
    return Math.round(n * 1e6) / 1e6;`

let allPatched = true

for (const target of TARGETS) {
    const fullPath = path.resolve(target.path)
    if (!fs.existsSync(fullPath)) {
        console.warn(`[patch-react-pdf] WARN: ${target.path} not found — skipping`)
        allPatched = false
        continue
    }
    const original = fs.readFileSync(fullPath, 'utf8')

    // Already patched? Idempotency check.
    if (original.includes('Forge patch (scripts/patch-react-pdf.js)')) {
        console.log(`[patch-react-pdf] OK: ${target.path} already patched`)
        continue
    }

    if (!target.find.test(original)) {
        console.warn(
            `[patch-react-pdf] WARN: ${target.path} — pattern not found. ` +
            `File may have been updated upstream. PDFs will continue to crash on Yoga overflow until this script is updated.`
        )
        allPatched = false
        continue
    }

    const patched = original.replace(target.find, REPLACEMENT)
    fs.writeFileSync(fullPath, patched, 'utf8')
    console.log(`[patch-react-pdf] PATCHED: ${target.path}`)
}

if (allPatched) {
    console.log('[patch-react-pdf] all targets patched')
}
// Always exit 0 — never fail the build over a patch warning.
process.exit(0)
