import {
  Target,
  Boxes,
  Rocket,
  Users,
  BarChart3,
  FileText,
  CheckSquare,
  Bot,
  Radio,
  Cpu,
  Pill,
  Smartphone,
  Server,
  Layers,
  CircuitBoard,
  Shield,
  Briefcase,
  Megaphone,
  Scale,
  Heart,
  Settings,
  Code,
  Lock,
  Globe,
  Lightbulb,
  DollarSign,
  Clipboard,
  Zap,
  BookOpen,
  Award,
  PieChart,
  GitBranch,
  Database,
  Cloud,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Category filters – maps tab IDs to the pack.category values they contain
// ---------------------------------------------------------------------------

export const CATEGORY_FILTERS = {
  business: [
    'sales', 'legal', 'compliance', 'hr', 'operations',
    'finance', 'growth', 'startup', 'product', 'marketing', 'fundraising',
  ],
  subsystems: ['engineering', 'security', 'infrastructure'],
} as const

// ---------------------------------------------------------------------------
// Industry product categories (used to filter blueprint templates)
// ---------------------------------------------------------------------------

export const INDUSTRY_CATEGORIES = new Set([
  'robotics', 'rockets', 'satellites', 'ai-datacentre',
  'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile',
])

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export function getDifficultyColor(difficulty: string | null): string {
  switch (difficulty) {
    case 'Easy':
      return 'bg-status-success-light text-status-success-dark'
    case 'Medium':
      return 'bg-status-warning-light text-status-warning-dark'
    case 'Hard':
      return 'bg-status-error-light text-status-error-dark'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

export function getPackIcon(iconName: string | null): React.ComponentType<{ className?: string }> {
  const map: Record<string, React.ComponentType<{ className?: string }>> = {
    users: Users,
    rocket: Rocket,
    target: Target,
    chart: BarChart3,
    file: FileText,
    boxes: Boxes,
    check: CheckSquare,
    shield: Shield,
    briefcase: Briefcase,
    megaphone: Megaphone,
    scale: Scale,
    heart: Heart,
    cog: Settings,
    code: Code,
    lock: Lock,
    globe: Globe,
    lightbulb: Lightbulb,
    'dollar-sign': DollarSign,
    clipboard: Clipboard,
    zap: Zap,
    settings: Settings,
    book: BookOpen,
    award: Award,
    'pie-chart': PieChart,
    'git-branch': GitBranch,
    database: Database,
    cloud: Cloud,
    layers: Layers,
  }
  return map[iconName || 'target'] || Target
}

export function getTemplateIcon(iconName: string): React.ComponentType<{ className?: string }> {
  const map: Record<string, React.ComponentType<{ className?: string }>> = {
    rocket: Rocket,
    bot: Bot,
    satellite: Radio,
    cpu: Cpu,
    pill: Pill,
    smartphone: Smartphone,
    server: Server,
    layers: Layers,
  }
  return map[iconName] || CircuitBoard
}

// ---------------------------------------------------------------------------
// Pack → tab matching
// ---------------------------------------------------------------------------

export function packMatchesCategory(
  pack: { category: string | null },
  tab: 'business' | 'subsystems',
): boolean {
  const cat = pack.category?.toLowerCase() || ''
  return CATEGORY_FILTERS[tab].some(f => cat === f)
}
