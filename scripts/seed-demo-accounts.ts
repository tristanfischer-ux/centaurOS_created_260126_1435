/**
 * Seed Demo Accounts for Testing
 * 
 * Creates demo user accounts for each role type to enable quick testing
 * of the onboarding flows without manually filling forms.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface DemoAccount {
  role: string
  email: string
  password: string
  fullName: string
  additionalData?: Record<string, string>
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'founder',
    email: 'demo.founder@forgeos.io',
    password: 'DemoFounder2026!',
    fullName: 'Alex Founder',
    additionalData: {
      company_name: 'RocketTech Industries',
      industry: 'Hardware, Aerospace',
      stage: 'Seed'
    }
  },
  {
    role: 'executive',
    email: 'demo.executive@forgeos.io',
    password: 'DemoExecutive2026!',
    fullName: 'Jordan Executive'
  },
  {
    role: 'apprentice',
    email: 'demo.apprentice@forgeos.io',
    password: 'DemoApprentice2026!',
    fullName: 'Sam Apprentice'
  },
  {
    role: 'vc',
    email: 'demo.vc@forgeos.io',
    password: 'DemoVC2026!',
    fullName: 'Taylor Venture',
    additionalData: {
      firm: 'Demo Ventures',
      aum: '$50M - $100M'
    }
  },
  {
    role: 'supplier',
    email: 'demo.supplier@forgeos.io',
    password: 'DemoSupplier2026!',
    fullName: 'Morgan Manufacturer',
    additionalData: {
      company_name: 'Precision Parts Co',
      capabilities: '3D Printing, CNC Machining',
      location: 'Austin, TX'
    }
  },
  {
    role: 'university',
    email: 'demo.university@forgeos.io',
    password: 'DemoUniversity2026!',
    fullName: 'Dr. Casey Academic',
    additionalData: {
      institution: 'Demo Tech University',
      department: 'Mechanical Engineering'
    }
  }
]

async function seedDemoAccounts() {
  console.log('🌱 Seeding demo accounts...\n')

  for (const account of DEMO_ACCOUNTS) {
    console.log(`Creating ${account.role} demo account: ${account.email}`)
    
    try {
      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const userExists = existingUsers?.users.some(u => u.email === account.email)

      if (userExists) {
        console.log(`  ⏭️  User ${account.email} already exists, skipping...`)
        continue
      }

      // Create the auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true, // Auto-confirm for demo accounts
        user_metadata: {
          full_name: account.fullName,
          is_demo_account: true,
          demo_role: account.role,
          ...account.additionalData
        }
      })

      if (authError) {
        console.error(`  ❌ Error creating auth user: ${authError.message}`)
        continue
      }

      console.log(`  ✅ Created auth user: ${authData.user.id}`)

      // Determine foundry_id based on role
      // - Founders get their own foundry (created separately)
      // - Executives, Apprentices, VC, University → centaur-guild
      // - Suppliers → centaur-suppliers
      const getFoundryId = (role: string): string => {
        if (role === 'supplier') return 'centaur-suppliers'
        if (role === 'founder') return 'demo-foundry' // Will be updated with actual foundry
        return 'centaur-guild' // executive, apprentice, vc, university
      }

      // Create profile record
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: account.email,
          full_name: account.fullName,
          role: account.role === 'vc' ? 'Executive' : 
                account.role === 'supplier' ? 'Apprentice' :
                account.role === 'university' ? 'Executive' :
                account.role.charAt(0).toUpperCase() + account.role.slice(1),
          foundry_id: getFoundryId(account.role),
          account_type: account.role === 'supplier' ? 'supplier' : 'team_builder',
          is_demo_account: true
        })

      if (profileError) {
        console.error(`  ❌ Error creating profile: ${profileError.message}`)
      } else {
        console.log(`  ✅ Created profile record`)
      }

      console.log('')
    } catch (error) {
      console.error(`  ❌ Unexpected error:`, error)
      console.log('')
    }
  }

  console.log('✨ Demo account seeding complete!\n')
  console.log('📋 Demo Account Credentials:')
  console.log('━'.repeat(60))
  
  DEMO_ACCOUNTS.forEach(account => {
    console.log(`\n${account.role.toUpperCase()}:`)
    console.log(`  Email: ${account.email}`)
    console.log(`  Password: ${account.password}`)
    console.log(`  Name: ${account.fullName}`)
    if (account.additionalData) {
      Object.entries(account.additionalData).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`)
      })
    }
  })
  console.log('\n' + '━'.repeat(60))
}

// Run the seeder
seedDemoAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
