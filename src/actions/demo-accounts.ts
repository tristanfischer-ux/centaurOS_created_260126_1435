'use server'

/**
 * Demo Account Data Provider
 *
 * @description Returns pre-populated form data for demo accounts
 * to enable quick testing of onboarding flows.
 *
 * @security Credentials come from DEMO_ACCOUNTS_PASSWORD env var.
 * Never hardcoded in source. Only works when env var is explicitly set.
 */

export interface DemoAccountData {
  email: string
  password: string
  fullName: string
  companyName?: string
  industry?: string
  stage?: string
  firm?: string
  aum?: string
  capabilities?: string
  location?: string
  institution?: string
  department?: string
}

// SECURITY: Passwords read from env var, never hardcoded in source
const DEMO_PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD

const DEMO_ACCOUNTS: Record<string, Omit<DemoAccountData, 'password'>> = {
  founder: {
    email: 'demo.founder@fractionalforge.app',
    fullName: 'Alex Founder',
    companyName: 'RocketTech Industries',
    industry: 'Hardware, Aerospace',
    stage: 'Seed'
  },
  executive: {
    email: 'demo.executive@fractionalforge.app',
    fullName: 'Jordan Executive'
  },
  apprentice: {
    email: 'demo.apprentice@fractionalforge.app',
    fullName: 'Sam Apprentice'
  },
  vc: {
    email: 'demo.vc@fractionalforge.app',
    fullName: 'Taylor Venture',
    firm: 'Demo Ventures',
    aum: '£50M - £100M'
  },
  supplier: {
    email: 'demo.supplier@fractionalforge.app',
    fullName: 'Morgan Manufacturer',
    companyName: 'Precision Parts Co',
    capabilities: '3D Printing, CNC Machining',
    location: 'Austin, TX'
  },
  factory: {
    email: 'demo.supplier@fractionalforge.app',
    fullName: 'Morgan Manufacturer',
    companyName: 'Precision Parts Co',
    capabilities: '3D Printing, CNC Machining',
    location: 'Austin, TX'
  },
  university: {
    email: 'demo.university@fractionalforge.app',
    fullName: 'Dr. Casey Academic',
    institution: 'Demo Tech University',
    department: 'Mechanical Engineering'
  },
  network: {
    email: 'demo.network@fractionalforge.app',
    fullName: 'River Network',
    companyName: 'Global Logistics Partners'
  },
  general: {
    email: 'demo.general@fractionalforge.app',
    fullName: 'Jamie General'
  }
}

/**
 * Get demo account data for a specific role (without password)
 *
 * @param role - The role type (founder, executive, apprentice, etc.)
 * @returns Demo account data if available, null otherwise
 */
export async function getDemoAccountData(role: string): Promise<Omit<DemoAccountData, 'password'> | null> {
  if (!DEMO_PASSWORD) return null
  const normalizedRole = role.toLowerCase()
  const account = DEMO_ACCOUNTS[normalizedRole]
  if (!account) return null
  return account
}

/**
 * Get demo account credentials for a specific role (includes password)
 *
 * @security Only returns credentials when DEMO_ACCOUNTS_PASSWORD env var is set.
 * @param role - The role type
 * @returns Full account data including password, or null
 */
export async function getDemoAccountCredentials(role: string): Promise<{ email: string; password: string } | null> {
  if (!DEMO_PASSWORD) return null
  const normalizedRole = role.toLowerCase()
  const account = DEMO_ACCOUNTS[normalizedRole]
  if (!account) return null
  return { email: account.email, password: DEMO_PASSWORD }
}

/**
 * Get all available demo roles
 *
 * @returns Array of available demo role names
 */
export async function getAvailableDemoRoles(): Promise<string[]> {
  if (!DEMO_PASSWORD) return []
  return Object.keys(DEMO_ACCOUNTS)
}
