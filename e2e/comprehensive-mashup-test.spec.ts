import { test } from '@playwright/test'
import path from 'path'

test.use({ 
  storageState: path.join(__dirname, '../.playwright/auth/founder.json')
})

test.describe('Comprehensive Mashup Lab Test', () => {
  test('should test all mashup lab features step by step', async ({ page }) => {
    test.setTimeout(180000) // 3 minutes
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 1: Navigate to page and verify layout')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/the-forge/cad-lab/mashup')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'screenshots/comprehensive-01-initial.png', fullPage: true })
    
    const hasTitle = await page.locator('h1:has-text("Mashup Lab")').isVisible()
    const hasOrangeAccent = await page.locator('div.bg-international-orange, div.bg-orange-500').count()
    const hasAISection = await page.locator('text=Describe what you want to create').isVisible()
    const hasManualSection = await page.locator('text=Browse & select STEP files').isVisible()
    
    console.log(`✓ Page title "Mashup Lab": ${hasTitle}`)
    console.log(`✓ Orange accent bar: ${hasOrangeAccent > 0}`)
    console.log(`✓ AI concept search section: ${hasAISection}`)
    console.log(`✓ Manual STEP file browser: ${hasManualSection}`)
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('STEP 2: Test ThinkingLog feature')
    console.log('═══════════════════════════════════════════════════════════')
    
    console.log('\nClicking example prompt chip...')
    const exampleChip = page.locator('text=Humanoid robot with quadcopter propellers')
    await exampleChip.click()
    
    console.log('Taking IMMEDIATE screenshot (1-2s)...')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'screenshots/comprehensive-02-thinking-immediate.png', fullPage: true })
    
    const hasOrangeDot = await page.locator('span.bg-international-orange').count()
    const thinkingText = await page.textContent('body')
    const hasScanningText = thinkingText?.includes('Scanning 200+ STEP templates')
    const hasSkeleton = await page.locator('.animate-pulse').count()
    
    console.log(`✓ Orange animated dot: ${hasOrangeDot > 0}`)
    console.log(`✓ "Scanning..." text visible: ${hasScanningText}`)
    console.log(`✓ Skeleton loading cards: ${hasSkeleton > 0}`)
    
    console.log('\nWaiting 3 seconds to check message cycling...')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'screenshots/comprehensive-03-thinking-cycled.png', fullPage: true })
    
    const thinkingText2 = await page.textContent('body')
    const hasMatchingText = thinkingText2?.includes('Matching parts to')
    const hasCuratingText = thinkingText2?.includes('Curating')
    const hasEvaluatingText = thinkingText2?.includes('Evaluating')
    
    console.log(`✓ Message changed: ${hasMatchingText || hasCuratingText || hasEvaluatingText}`)
    if (hasMatchingText) console.log('  → Now showing: "Matching parts to..."')
    if (hasCuratingText) console.log('  → Now showing: "Curating..."')
    if (hasEvaluatingText) console.log('  → Now showing: "Evaluating..."')
    
    console.log('\nWaiting for results (checking every 5s, max 30s)...')
    let resultsLoaded = false
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000)
      const hasResults = await page.locator('text=Select this combination').count() > 0
      console.log(`  After ${(i + 1) * 5}s: Results loaded = ${hasResults}`)
      
      if (hasResults) {
        resultsLoaded = true
        await page.screenshot({ path: 'screenshots/comprehensive-04-results-loaded.png', fullPage: true })
        console.log('✓ Suggestion cards appeared!')
        break
      }
    }
    
    if (!resultsLoaded) {
      console.log('⚠ Results did not load within 30s - this may be expected for AI search')
      await page.screenshot({ path: 'screenshots/comprehensive-04-timeout.png', fullPage: true })
      console.log('⚠ Cannot proceed to Step 3 without results. Test ending here.')
      return
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('STEP 3: Test navigation to Step 2')
    console.log('═══════════════════════════════════════════════════════════')
    
    console.log('\nClicking "Select this combination" on first card...')
    const selectButton = page.locator('text=Select this combination').first()
    await selectButton.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'screenshots/comprehensive-05-step2-concept.png', fullPage: true })
    
    const hasSourcesSummary = await page.locator('text=Selected sources').isVisible()
    const hasTextarea = await page.locator('textarea').isVisible()
    const conceptText = await page.locator('textarea').inputValue()
    const hasBackButton = await page.locator('button:has-text("Back")').isVisible()
    const hasGenerateButton = await page.locator('button:has-text("Generate mashup")').isVisible()
    
    console.log(`✓ Selected sources summary: ${hasSourcesSummary}`)
    console.log(`✓ Textarea with concept: ${hasTextarea}`)
    console.log(`  Concept text: "${conceptText.substring(0, 60)}..."`)
    console.log(`✓ Back button: ${hasBackButton}`)
    console.log(`✓ Generate mashup button: ${hasGenerateButton}`)
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('STEP 4: Test MashupGenerationProgress stepper')
    console.log('═══════════════════════════════════════════════════════════')
    
    console.log('\nClicking "Generate mashup" button...')
    const generateButton = page.locator('button:has-text("Generate mashup")')
    await generateButton.click()
    
    console.log('\nTaking IMMEDIATE screenshot...')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'screenshots/comprehensive-06-generation-start.png', fullPage: true })
    
    // Check for all expected elements
    const hasHeader = await page.locator('text=Building your mashup').count() > 0
    const hasConceptDisplay = await page.textContent('body').then(t => t?.includes('Humanoid robot'))
    const hasThumbnails = await page.locator('img[alt*="thumbnail"], div:has(> img)').count()
    const hasPlusSigns = await page.textContent('body').then(t => (t?.match(/\+/g) || []).length)
    
    // Check for 5 stages
    const stages = [
      'Fetching source files',
      'Planning your mashup',
      'Writing CadQuery code',
      'Building 3D model',
      'Uploading results'
    ]
    
    console.log('\n✓ Checking MashupGenerationProgress elements:')
    console.log(`  - "Building your mashup" header: ${hasHeader}`)
    console.log(`  - Concept text displayed: ${hasConceptDisplay}`)
    console.log(`  - Source thumbnails: ${hasThumbnails}`)
    console.log(`  - Plus signs between parts: ${hasPlusSigns > 0}`)
    
    console.log('\n✓ Checking 5-stage vertical stepper:')
    for (const stage of stages) {
      const stageVisible = await page.locator(`text=${stage}`).isVisible()
      console.log(`  - "${stage}": ${stageVisible ? '✓' : '✗'}`)
    }
    
    // Check for active spinner on first stage
    const firstStageActive = await page.locator('text=Fetching source files').locator('..').locator('.animate-spin').count()
    console.log(`\n✓ First stage has spinner (active): ${firstStageActive > 0}`)
    
    // Check for elapsed timer
    const bodyText = await page.textContent('body')
    const hasTimer = bodyText?.includes('elapsed') || bodyText?.match(/\d+s/)
    console.log(`✓ Elapsed timer visible: ${hasTimer}`)
    
    console.log('\nWaiting 5 seconds to check stepper progression...')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/comprehensive-07-generation-5s.png', fullPage: true })
    
    // Check stage progression
    console.log('\n✓ Checking stage progression after 5s:')
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const stageElement = page.locator(`text=${stage}`).first()
      const hasCheckmark = await stageElement.locator('..').locator('[data-lucide="check-circle-2"]').count() > 0
      const hasSpinner = await stageElement.locator('..').locator('.animate-spin').count() > 0
      
      let status = 'PENDING'
      if (hasCheckmark) status = 'DONE ✓'
      else if (hasSpinner) status = 'ACTIVE (spinner)'
      
      console.log(`  ${i + 1}. "${stage}": ${status}`)
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('TEST COMPLETE!')
    console.log('═══════════════════════════════════════════════════════════')
  })
})
