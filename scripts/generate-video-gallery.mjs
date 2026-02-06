#!/usr/bin/env node
/**
 * Scans test-results/ for recorded Playwright videos (.webm)
 * and generates a single HTML page that embeds them all,
 * grouped by persona (Founder, Executive, Apprentice, Supplier).
 *
 * Usage:
 *   node scripts/generate-video-gallery.mjs
 *
 * Output:
 *   test-results/video-walkthroughs.html
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RESULTS_DIR = path.join(ROOT, 'test-results')
const OUTPUT_FILE = path.join(RESULTS_DIR, 'video-walkthroughs.html')

/** Recursively find all .webm files under a directory. */
function findVideos(dir) {
  const videos = []
  if (!fs.existsSync(dir)) return videos

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      videos.push(...findVideos(full))
    } else if (entry.name.endsWith('.webm')) {
      videos.push(full)
    }
  }
  return videos
}

/**
 * Derive a human-readable label and persona from a video path.
 *
 * Playwright puts videos under folders like:
 *   test-results/qa-founder-Founder-Day-in-the-Life-Core-Work-Flow-Home-dashboard-loads-…/video.webm
 */
function parseVideoPath(videoPath) {
  const relative = path.relative(RESULTS_DIR, videoPath)
  const folder = path.dirname(relative)

  // Determine persona from folder name
  let persona = 'Other'
  if (folder.toLowerCase().includes('founder'))     persona = 'Founder'
  else if (folder.toLowerCase().includes('executive'))  persona = 'Executive'
  else if (folder.toLowerCase().includes('apprentice')) persona = 'Apprentice'
  else if (folder.toLowerCase().includes('supplier'))   persona = 'Supplier'
  else if (folder.toLowerCase().includes('auth'))       persona = 'Auth Setup'

  // Clean up folder name into a readable title
  let title = folder
    // Remove project prefix like "qa-founder-" or "auth-setup-"
    .replace(/^(qa-founder|qa-executive|qa-apprentice|qa-supplier|auth-setup)-/i, '')
    // Replace hyphens/underscores with spaces
    .replace(/[-_]+/g, ' ')
    // Remove trailing browser/retry suffixes
    .replace(/\s*(chromium|firefox|webkit|retry\d+)$/i, '')
    .trim()

  // Capitalize first letter of each word
  title = title.replace(/\b\w/g, c => c.toUpperCase())

  if (!title) title = folder

  return { persona, title, relativePath: relative }
}

// ─── Main ──────────────────────────────────────────────────

const allVideos = findVideos(RESULTS_DIR)

if (allVideos.length === 0) {
  console.error('No .webm videos found in test-results/.')
  console.error('Run the walkthrough tests first:')
  console.error('  npm run test:e2e:walkthroughs')
  process.exit(1)
}

// Group by persona
const grouped = {}
for (const videoPath of allVideos) {
  const { persona, title, relativePath } = parseVideoPath(videoPath)
  if (!grouped[persona]) grouped[persona] = []
  grouped[persona].push({ title, relativePath })
}

// Sort personas in desired order
const PERSONA_ORDER = ['Founder', 'Executive', 'Apprentice', 'Supplier', 'Auth Setup', 'Other']
const sortedPersonas = Object.keys(grouped).sort(
  (a, b) => PERSONA_ORDER.indexOf(a) - PERSONA_ORDER.indexOf(b)
)

const totalVideos = allVideos.length
const now = new Date().toLocaleString()

// ─── Generate HTML ─────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CentaurOS — E2E Video Walkthroughs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #1a1a1a;
      line-height: 1.5;
    }

    header {
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      padding: 2rem 2rem 1.5rem;
    }

    header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    header h1 .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #ff4500;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    header p {
      color: #6b7280;
      margin-top: 0.25rem;
      font-size: 0.9rem;
    }

    .stats {
      display: flex;
      gap: 1.5rem;
      margin-top: 1rem;
      font-size: 0.85rem;
    }

    .stats span {
      background: #f3f4f6;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      color: #374151;
    }

    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    .persona-section {
      margin-bottom: 3rem;
    }

    .persona-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #ff4500;
    }

    .persona-badge {
      background: #fff4f0;
      color: #ff4500;
      font-weight: 600;
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .persona-header h2 {
      font-size: 1.35rem;
      font-weight: 600;
    }

    .persona-count {
      color: #9ca3af;
      font-size: 0.85rem;
    }

    .video-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
      gap: 1.5rem;
    }

    .video-card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      transition: box-shadow 0.2s;
    }

    .video-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .video-card video {
      width: 100%;
      display: block;
      background: #000;
    }

    .video-card .label {
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: #374151;
      border-top: 1px solid #f3f4f6;
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    @media (max-width: 640px) {
      .video-grid {
        grid-template-columns: 1fr;
      }
      main { padding: 1rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1>
      ForgeOS <span class="dot"></span> E2E Video Walkthroughs
    </h1>
    <p>Full day-in-the-life recordings for every persona, generated by Playwright.</p>
    <div class="stats">
      <span>${totalVideos} videos</span>
      <span>${sortedPersonas.filter(p => p !== 'Auth Setup' && p !== 'Other').length} personas</span>
      <span>Generated ${now}</span>
    </div>
  </header>

  <main>
${sortedPersonas.map(persona => {
  const videos = grouped[persona]
  return `
    <section class="persona-section">
      <div class="persona-header">
        <span class="persona-badge">${persona}</span>
        <h2>${persona} Walkthrough</h2>
        <span class="persona-count">${videos.length} video${videos.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="video-grid">
${videos.map(v => `
        <div class="video-card">
          <video controls preload="metadata">
            <source src="${v.relativePath}" type="video/webm" />
            Your browser does not support the video tag.
          </video>
          <div class="label">${v.title}</div>
        </div>
`).join('')}
      </div>
    </section>
`
}).join('')}
  </main>

  <footer>
    CentaurOS E2E Walkthroughs &middot; Playwright &middot; ${now}
  </footer>
</body>
</html>
`

fs.writeFileSync(OUTPUT_FILE, html, 'utf-8')
console.log(`\n✅ Video gallery generated: ${OUTPUT_FILE}`)
console.log(`   ${totalVideos} videos across ${sortedPersonas.length} groups`)
console.log(`\n   Open in browser:  open ${OUTPUT_FILE}\n`)
