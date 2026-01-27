
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
    console.log('Reading seed file...')
    const sqlPath = path.resolve(process.cwd(), 'supabase/seed_marketplace.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // Regex to match the VALUES tuples.
    // Matches: ('Category', 'Subcategory', 'Title', 'Description', 'AttributesJSON', ImageURL, Verified)
    // Note: This regex is tailored to the specific format of seed_marketplace.sql
    const regex = /\('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', (NULL|'[^']+'), (true|false)\)/g

    let match
    const records = []

    while ((match = regex.exec(sqlContent)) !== null) {
        try {
            records.push({
                category: match[1],
                subcategory: match[2],
                title: match[3],
                description: match[4],
                attributes: JSON.parse(match[5]), // Parse the JSON string from SQL
                image_url: match[6] === 'NULL' ? null : match[6].replace(/'/g, ''),
                is_verified: match[7] === 'true'
            })
        } catch (e) {
            console.error('Failed to parse match:', match[0], e)
        }
    }

    console.log(`Parsed ${records.length} records. Inserting...`)

    if (records.length === 0) {
        console.warn('No records parsed! Check the regex or file content.')
        return
    }

    const { error } = await supabase.from('marketplace_listings').insert(records)

    if (error) {
        console.error('Insert failed:', error)
    } else {
        console.log('✅ Successfully seeded marketplace_listings with ' + records.length + ' items.')
    }
}

seed()
