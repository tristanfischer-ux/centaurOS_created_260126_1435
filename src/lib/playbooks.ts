
export interface PlaybookTask {
    title: string
    description: string
    role?: 'Executive' | 'Apprentice' | 'AI_Agent'
}

export interface Playbook {
    id: string
    title: string
    description: string
    tasks: PlaybookTask[]
}

export const OBJECTIVE_PLAYBOOKS: Playbook[] = [
    {
        id: 'company-formation',
        title: 'Company Formation & Governance',
        description: 'Complete setup for a new limited company including registration and core governance documents.',
        tasks: [
            {
                title: 'Register with Companies House',
                description: 'File IN01 form to incorporate the company. Requires company name, address, director details, and initial share capital.',
                role: 'Executive'
            },
            {
                title: 'Draft Articles of Association',
                description: 'Prepare the company\'s written rules for running the company, agreed by the shareholders, directors and the company secretary.',
                role: 'AI_Agent'
            },
            {
                title: 'Prepare Shareholder Agreement',
                description: 'Draft agreement outlining shareholder rights, obligations, and stock transfer rules.',
                role: 'AI_Agent'
            },
            {
                title: 'Appoint Directors and Secretary',
                description: 'Formally appoint initial directors and company secretary (if applicable) and file AP01 forms.',
                role: 'Executive'
            },
            {
                title: 'Issue Share Certificates',
                description: 'Generate and distribute share certificates to initial shareholders.',
                role: 'AI_Agent'
            }
        ]
    },
    {
        id: 'legal-ip',
        title: 'Legal & Intellectual Property',
        description: 'Secure your brand assets, trademarks, and establish core legal compliance.',
        tasks: [
            {
                title: 'Trademark Search & Registration',
                description: 'Conduct search for brand conflicts and file trademark application with IPO for company name and logo.',
                role: 'AI_Agent'
            },
            {
                title: 'IP Assignment Agreements',
                description: 'Execute IP assignment deeds for all founders and early contributors to ensure company owns all IP.',
                role: 'AI_Agent'
            },
            {
                title: 'Privacy Policy & Terms of Service',
                description: 'Draft GDPR-compliant Privacy Policy and standard Terms of Service for the website/app.',
                role: 'AI_Agent'
            },
            {
                title: 'Data Protection Registration',
                description: 'Register with the ICO (Information Commissioner\'s Office) as a data controller.',
                role: 'Executive'
            }
        ]
    },
    {
        id: 'financial-setup',
        title: 'Financial Infrastructure',
        description: 'Setup banking, accounting, and tax registration.',
        tasks: [
            {
                title: 'Open Business Bank Account',
                description: 'Set up primary business banking facilities. Required: Incorporation cert, ID for directors.',
                role: 'Executive'
            },
            {
                title: 'VAT Registration',
                description: 'Register for VAT if taxable turnover is expected to exceed threshold (or voluntary registration).',
                role: 'AI_Agent'
            },
            {
                title: 'Setup Accounting Software',
                description: 'Initialize Xero/Quickbooks account and connect bank feeds.',
                role: 'Apprentice'
            },
            {
                title: 'Appoint Accountants',
                description: 'Engage external accounting firm for annual accounts and tax filing.',
                role: 'Executive'
            },
            {
                title: 'Setup Payroll (PAYE)',
                description: 'Register as an employer with HMRC even if you are the only employee.',
                role: 'AI_Agent'
            }
        ]
    },
    {
        id: 'digital-presence',
        title: 'Digital Presence & Brand',
        description: 'Establish online identity, domains, and basic web presence.',
        tasks: [
            {
                title: 'Domain Name Registration',
                description: 'Purchase primary .com/.co.uk domains and defensive variations.',
                role: 'AI_Agent'
            },
            {
                title: 'Setup Corporate Email (GSuite/O365)',
                description: 'Configure business email accounts for founders/team.',
                role: 'Apprentice'
            },
            {
                title: 'Launch Landing Page',
                description: 'Deploy "Coming Soon" page with email capture.',
                role: 'AI_Agent'
            },
            {
                title: 'Claim Social Handles',
                description: 'Register brand name on Twitter, LinkedIn, Instagram, etc.',
                role: 'Apprentice'
            }
        ]
    }
]
