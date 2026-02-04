'use server'

/**
 * Demo Account Data Provider
 * 
 * @description Returns pre-populated form data for demo accounts
 * to enable quick testing of onboarding flows.
 * 
 * @security This only returns form data, not actual credentials.
 * The credentials are used during signup but never exposed to client.
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

const DEMO_ACCOUNTS: Record<string, DemoAccountData> = {
  founder: {
    email: 'demo.founder@forgeos.io',
    password: 'DemoFounder2026!',
    fullName: 'Alex Founder',
    companyName: 'RocketTech Industries',
    industry: 'Hardware, Aerospace',
    stage: 'Seed'
  },
  executive: {
    email: 'demo.executive@forgeos.io',
    password: 'DemoExecutive2026!',
    fullName: 'Jordan Executive'
  },
  apprentice: {
    email: 'demo.apprentice@forgeos.io',
    password: 'DemoApprentice2026!',
    fullName: 'Sam Apprentice'
  },
  vc: {
    email: 'demo.vc@forgeos.io',
    password: 'DemoVC2026!',
    fullName: 'Taylor Venture',
    firm: 'Demo Ventures',
    aum: '$50M - $100M'
  },
  supplier: {
    email: 'demo.supplier@forgeos.io',
    password: 'DemoSupplier2026!',
    fullName: 'Morgan Manufacturer',
    companyName: 'Precision Parts Co',
    capabilities: '3D Printing, CNC Machining',
    location: 'Austin, TX'
  },
  factory: {
    email: 'demo.supplier@forgeos.io',
    password: 'DemoSupplier2026!',
    fullName: 'Morgan Manufacturer',
    companyName: 'Precision Parts Co',
    capabilities: '3D Printing, CNC Machining',
    location: 'Austin, TX'
  },
  university: {
    email: 'demo.university@forgeos.io',
    password: 'DemoUniversity2026!',
    fullName: 'Dr. Casey Academic',
    institution: 'Demo Tech University',
    department: 'Mechanical Engineering'
  },
  network: {
    email: 'demo.network@forgeos.io',
    password: 'DemoNetwork2026!',
    fullName: 'River Network',
    companyName: 'Global Logistics Partners'
  },
  general: {
    email: 'demo.general@forgeos.io',
    password: 'DemoGeneral2026!',
    fullName: 'Jamie General'
  }
}

/**
 * Get demo account data for a specific role
 * 
 * @param role - The role type (founder, executive, apprentice, etc.)
 * @returns Demo account data if available, null otherwise
 */
export async function getDemoAccountData(role: string): Promise<DemoAccountData | null> {
  const normalizedRole = role.toLowerCase()
  return DEMO_ACCOUNTS[normalizedRole] || null
}

/**
 * Get all available demo roles
 * 
 * @returns Array of available demo role names
 */
export async function getAvailableDemoRoles(): Promise<string[]> {
  return Object.keys(DEMO_ACCOUNTS)
}
