/**
 * Domain Primer Generation Script
 * 
 * Generates AI-assisted primers for knowledge domains based on their
 * name, description, and key questions.
 * 
 * Usage:
 *   npx tsx scripts/generate-domain-primers.ts
 *   npx tsx scripts/generate-domain-primers.ts --template <template-id>
 *   npx tsx scripts/generate-domain-primers.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface KeyQuestion {
  id: string
  question: string
  context?: string
}

interface KnowledgeDomain {
  id: string
  name: string
  description: string | null
  category: string | null
  key_questions: KeyQuestion[] | null
  parent_id: string | null
  template_id: string
}

interface DomainPrimer {
  overview: string
  key_concepts: string[]
  decision_points: string[]
  terminology?: Record<string, string>
  ai_generated: boolean
  last_updated: string
}

/**
 * Generate a primer from domain data without using external AI
 * This creates a structured primer from the existing domain metadata
 */
function generatePrimerFromDomain(domain: KnowledgeDomain, parentName?: string): DomainPrimer {
  const keyQuestions = domain.key_questions || []
  
  // Generate overview from description or from name/context
  let overview: string
  if (domain.description) {
    overview = domain.description
  } else if (parentName) {
    overview = `${domain.name} is a specialized area within ${parentName} that covers essential knowledge and decisions for this domain.`
  } else {
    overview = `${domain.name} encompasses the key knowledge areas and technical decisions required for this aspect of your project.`
  }
  
  // Extract key concepts from questions
  const keyConcepts: string[] = []
  const decisionPoints: string[] = []
  const terminology: Record<string, string> = {}
  
  for (const q of keyQuestions) {
    // Extract decision points - questions that start with "What" about choices
    if (q.question.toLowerCase().includes('what') && 
        (q.question.includes('?') || q.question.includes('or '))) {
      // Clean up the question for a decision point
      const decisionPoint = q.question
        .replace(/^\s*What\s+(is\s+your\s+|are\s+your\s+)?/i, '')
        .replace(/\?.*$/, '')
        .trim()
      
      if (decisionPoint.length > 10 && decisionPoint.length < 100) {
        decisionPoints.push(capitalizeFirst(decisionPoint))
      }
    }
    
    // Extract key concepts from question context or parenthetical options
    const optionsMatch = q.question.match(/\(([^)]+)\)/)
    if (optionsMatch) {
      const options = optionsMatch[1].split(/,\s*|\//)
      for (const opt of options) {
        const trimmed = opt.trim()
        if (trimmed.length > 2 && trimmed.length < 40 && !keyConcepts.includes(trimmed)) {
          keyConcepts.push(trimmed)
        }
      }
    }
    
    // Extract terminology from question context
    if (q.context) {
      // Look for acronyms or technical terms
      const acronymMatch = q.context.match(/\b([A-Z]{2,})\b/)
      if (acronymMatch && !terminology[acronymMatch[1]]) {
        terminology[acronymMatch[1]] = q.context.slice(0, 100)
      }
    }
  }
  
  // If we didn't get enough key concepts, generate from domain category
  if (keyConcepts.length < 2) {
    keyConcepts.push(`${domain.name} fundamentals`)
    keyConcepts.push('Technical requirements')
    if (domain.category) {
      keyConcepts.push(`${domain.category} integration`)
    }
  }
  
  // If we didn't get decision points, generate from domain name
  if (decisionPoints.length < 1) {
    decisionPoints.push(`${domain.name} approach selection`)
    decisionPoints.push('Requirements definition')
  }
  
  // Limit and dedupe
  const uniqueConcepts = [...new Set(keyConcepts)].slice(0, 5)
  const uniqueDecisions = [...new Set(decisionPoints)].slice(0, 4)
  
  return {
    overview,
    key_concepts: uniqueConcepts,
    decision_points: uniqueDecisions,
    terminology: Object.keys(terminology).length > 0 ? terminology : undefined,
    ai_generated: true,
    last_updated: new Date().toISOString().split('T')[0],
  }
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

async function getDomainParents(): Promise<Map<string, string>> {
  const { data: domains } = await supabase
    .from('knowledge_domains')
    .select('id, name, parent_id')
  
  const parentMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  
  if (domains) {
    for (const d of domains) {
      nameMap.set(d.id, d.name)
    }
    for (const d of domains) {
      if (d.parent_id && nameMap.has(d.parent_id)) {
        parentMap.set(d.id, nameMap.get(d.parent_id)!)
      }
    }
  }
  
  return parentMap
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const templateIdArg = args.find(a => a !== '--dry-run' && !a.startsWith('--'))
  
  console.log('Domain Primer Generator')
  console.log('=======================')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  
  // Get parent names map
  const parentMap = await getDomainParents()
  
  // Fetch domains that need primers
  let query = supabase
    .from('knowledge_domains')
    .select('id, name, description, category, key_questions, parent_id, template_id')
    .or('primer.is.null,primer.eq.{}')
  
  if (templateIdArg) {
    query = query.eq('template_id', templateIdArg)
    console.log(`Filtering to template: ${templateIdArg}`)
  }
  
  const { data: domains, error } = await query
  
  if (error) {
    console.error('Error fetching domains:', error)
    process.exit(1)
  }
  
  if (!domains || domains.length === 0) {
    console.log('No domains need primers generated')
    return
  }
  
  console.log(`Found ${domains.length} domains needing primers`)
  console.log('')
  
  let successCount = 0
  let errorCount = 0
  
  for (const domain of domains as KnowledgeDomain[]) {
    const parentName = domain.parent_id ? parentMap.get(domain.id) : undefined
    const primer = generatePrimerFromDomain(domain, parentName)
    
    console.log(`\n📖 ${domain.name}`)
    console.log(`   Overview: ${primer.overview.slice(0, 80)}...`)
    console.log(`   Concepts: ${primer.key_concepts.join(', ')}`)
    console.log(`   Decisions: ${primer.decision_points.slice(0, 2).join(', ')}`)
    
    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('knowledge_domains')
        .update({ primer })
        .eq('id', domain.id)
      
      if (updateError) {
        console.log(`   ❌ Error: ${updateError.message}`)
        errorCount++
      } else {
        console.log(`   ✅ Saved`)
        successCount++
      }
    } else {
      console.log(`   ⏭️  Skipped (dry run)`)
      successCount++
    }
  }
  
  console.log('\n=======================')
  console.log(`Summary: ${successCount} success, ${errorCount} errors`)
  
  if (dryRun) {
    console.log('\nRun without --dry-run to save changes')
  }
}

main().catch(console.error)
