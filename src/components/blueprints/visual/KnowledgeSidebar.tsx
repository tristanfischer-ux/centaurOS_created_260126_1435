'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X,
  Zap,
  ShoppingCart,
  Users,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Star,
  Clock,
  MapPin,
  Sparkles,
  BookOpen,
  Target,
  Send,
  Copy,
  Check,
  HelpCircle,
  Lightbulb,
  GraduationCap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { BlueprintNode, SkillNode, ExpertMatch, SupplierMatch } from './types'
import { STATUS_COLORS, NODE_TYPE_STYLES } from './types'
import { ENGINE_SKILLS, ENGINE_EXPERTS, ENGINE_SUPPLIERS } from './data/rocket-archetype'

interface KnowledgeSidebarProps {
  node: BlueprintNode | null
  onClose: () => void
  onCreateObjective?: (title: string, description: string) => void
  className?: string
}

// Recursive skill tree component
function SkillTreeNode({ 
  skill, 
  depth = 0,
  onToggle,
  onNeedsExpert,
}: { 
  skill: SkillNode
  depth?: number
  onToggle?: (id: string) => void
  onNeedsExpert?: (skill: SkillNode) => void
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2)
  const hasChildren = skill.children && skill.children.length > 0
  
  const statusConfig = {
    mastered: { 
      icon: CheckCircle2, 
      color: 'text-status-success', 
      bg: 'bg-status-success',
      label: 'Mastered' 
    },
    learning: { 
      icon: BookOpen, 
      color: 'text-status-info', 
      bg: 'bg-status-info',
      label: 'Learning' 
    },
    unknown: { 
      icon: HelpCircle, 
      color: 'text-muted-foreground', 
      bg: 'bg-muted-foreground',
      label: 'Unknown' 
    },
    needs_expert: { 
      icon: Sparkles, 
      color: 'text-international-orange', 
      bg: 'bg-international-orange',
      label: 'Needs Expert' 
    },
  }
  
  const config = statusConfig[skill.status]
  const StatusIcon = config.icon
  
  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors",
          "hover:bg-muted cursor-pointer group",
          skill.status === 'needs_expert' && "bg-orange-50/50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-4" />
        )}
        
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", config.bg)} />
        
        <span className={cn(
          "text-sm flex-1",
          skill.status === 'mastered' ? 'text-muted-foreground' : 'text-foreground font-medium'
        )}>
          {skill.name}
        </span>
        
        {skill.status === 'needs_expert' && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 text-international-orange hover:text-international-orange hover:bg-orange-100"
            onClick={() => onNeedsExpert?.(skill)}
          >
            Find Expert
          </Button>
        )}
        
        {skill.status === 'unknown' && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100"
            onClick={() => onToggle?.(skill.id)}
          >
            I know this
          </Button>
        )}
      </div>
      
      {/* Questions for this skill */}
      {skill.questions && skill.questions.length > 0 && isExpanded && (
        <div 
          className="mb-2 space-y-1"
          style={{ paddingLeft: `${depth * 16 + 40}px` }}
        >
          {skill.questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground py-0.5">
              <Lightbulb className="h-3 w-3 mt-0.5 text-amber-400 flex-shrink-0" />
              <span>{q}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Children */}
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {skill.children!.map(child => (
              <SkillTreeNode 
                key={child.id} 
                skill={child} 
                depth={depth + 1}
                onToggle={onToggle}
                onNeedsExpert={onNeedsExpert}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Expert card component
function ExpertCard({ expert }: { expert: ExpertMatch }) {
  return (
    <div className="p-3 border rounded-lg hover:shadow-sm transition-all group">
      <div className="flex items-start gap-3">
        <UserAvatar 
          name={expert.name}
          role={undefined}
          size="md"
          className="border"
          src={expert.avatar}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{expert.name}</span>
            {expert.availability === 'available' && (
              <span className="w-2 h-2 bg-status-success rounded-full" />
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{expert.title}</div>
          
          <div className="flex items-center gap-3 mt-1.5">
            {expert.rating && (
              <div className="flex items-center gap-1 text-xs">
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                <span className="font-medium">{expert.rating}</span>
                <span className="text-muted-foreground">({expert.reviewCount})</span>
              </div>
            )}
            {expert.hourlyRate && (
              <span className="text-xs text-muted-foreground">
                ${expert.hourlyRate}/hr
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap gap-1 mt-2">
            {expert.relevantSkills.slice(0, 3).map(skill => (
              <Badge 
                key={skill} 
                variant="secondary" 
                className="text-[10px] px-1.5 py-0 bg-status-info-light text-status-info-dark"
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex gap-2 mt-3">
        <Button size="sm" className="flex-1 h-8 text-xs bg-international-orange hover:bg-international-orange/90">
          <MessageSquare className="h-3 w-3 mr-1.5" />
          Message
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// Supplier card component
function SupplierCard({ supplier }: { supplier: SupplierMatch }) {
  return (
    <div className="p-3 border rounded-lg hover:shadow-sm transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-sm text-foreground">{supplier.name}</div>
          {supplier.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3" />
              {supplier.location}
            </div>
          )}
        </div>
        {supplier.rating && (
          <div className="flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            <span className="font-medium">{supplier.rating}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        {supplier.leadTime && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {supplier.leadTime}
          </div>
        )}
        {supplier.priceRange && (
          <div className="font-medium text-foreground">
            {supplier.priceRange}
          </div>
        )}
      </div>
      
      <div className="flex flex-wrap gap-1 mt-2">
        {supplier.capabilities.slice(0, 3).map(cap => (
          <Badge 
            key={cap} 
            variant="secondary" 
            className="text-[10px] px-1.5 py-0"
          >
            {cap}
          </Badge>
        ))}
      </div>
      
      <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs">
        <ShoppingCart className="h-3 w-3 mr-1.5" />
        Request Quote
      </Button>
    </div>
  )
}

// Smart inquiry generator
function SmartInquiryGenerator({ node, gaps }: { node: BlueprintNode; gaps: string[] }) {
  const [copied, setCopied] = useState(false)
  
  const inquiry = `Hi,

I'm working on a ${node.title.toLowerCase()} for a rocket project and could use expert guidance.

**Areas where I need help:**
${gaps.map(g => `• ${g}`).join('\n')}

**Context:**
I'm currently at the design phase and need to make informed decisions about the technical approach. My goal is to understand the tradeoffs and best practices before proceeding.

**Specific questions:**
1. What are the key considerations I should prioritize?
2. What common mistakes should I avoid?
3. Can you recommend any resources or references?

I'd appreciate a 30-60 minute consultation to discuss these topics. Please let me know your availability.

Thank you!`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inquiry)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-muted rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-international-orange" />
          Smart Inquiry
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground bg-background p-2 rounded border max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
        {inquiry}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Pre-filled message based on your knowledge gaps. Edit before sending.
      </p>
    </div>
  )
}

export function KnowledgeSidebar({ 
  node, 
  onClose,
  onCreateObjective,
  className,
}: KnowledgeSidebarProps) {
  const [activeTab, setActiveTab] = useState('knowledge')
  
  if (!node) return null
  
  const statusColors = STATUS_COLORS[node.status]
  const typeStyles = NODE_TYPE_STYLES[node.type]
  
  // Get skills for this node (using engine skills as example)
  const skills = node.id === 'engine' ? ENGINE_SKILLS : []
  const experts = ENGINE_EXPERTS
  const suppliers = ENGINE_SUPPLIERS
  
  // Count gaps in skills tree
  const countGaps = (skills: SkillNode[]): number => {
    return skills.reduce((count, skill) => {
      const childGaps = skill.children ? countGaps(skill.children) : 0
      return count + (skill.status === 'needs_expert' || skill.status === 'unknown' ? 1 : 0) + childGaps
    }, 0)
  }
  
  const gapCount = skills.length > 0 ? countGaps(skills) : 0
  const gapNames = ['Regenerative Cooling', 'Turbopump Design', 'Injector Design']

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "w-[420px] bg-background border-l shadow-2xl flex flex-col h-full",
          className
        )}
      >
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-muted to-white">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge 
                  variant="secondary" 
                  className={cn("text-[10px] font-bold uppercase", typeStyles.badge)}
                >
                  {node.type}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px]", statusColors.text, statusColors.border)}
                >
                  {statusColors.label}
                </Badge>
              </div>
              <h2 className="font-display text-lg font-bold text-foreground">
                {node.title}
              </h2>
              {node.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {node.description}
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 -mr-2 -mt-1"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Gap alert */}
          {node.status === 'gap' && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-international-orange mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-orange-800">
                    Critical Knowledge Gap
                  </div>
                  <p className="text-xs text-orange-700 mt-0.5">
                    This area requires expert consultation before proceeding.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger 
              value="knowledge" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent py-3 text-sm"
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              Knowledge
              {gapCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1.5 bg-orange-100 text-orange-700">
                  {gapCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="experts" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent py-3 text-sm"
            >
              <Users className="h-4 w-4 mr-2" />
              Experts
            </TabsTrigger>
            <TabsTrigger 
              value="suppliers" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent py-3 text-sm"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Suppliers
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1">
            {/* Knowledge Tab */}
            <TabsContent value="knowledge" className="m-0 p-4 space-y-4">
              {skills.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Skills Tree</h3>
                    <span className="text-xs text-muted-foreground">
                      Click to expand • Hover for actions
                    </span>
                  </div>
                  
                  <div className="border rounded-lg bg-background">
                    {skills.map(skill => (
                      <SkillTreeNode 
                        key={skill.id} 
                        skill={skill}
                        onNeedsExpert={() => setActiveTab('experts')}
                      />
                    ))}
                  </div>
                  
                  {gapCount > 0 && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => onCreateObjective?.(
                        `Learn ${node.title}`,
                        `Fill knowledge gaps in: ${gapNames.join(', ')}`
                      )}
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Create Learning Objective
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No skills tree available yet.</p>
                  <p className="text-xs mt-1">Click "Assess Knowledge" to build one.</p>
                  <Button variant="outline" size="sm" className="mt-4">
                    Start Assessment
                  </Button>
                </div>
              )}
            </TabsContent>
            
            {/* Experts Tab */}
            <TabsContent value="experts" className="m-0 p-4 space-y-4">
              {node.status === 'gap' && (
                <SmartInquiryGenerator node={node} gaps={gapNames} />
              )}
              
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Recommended Experts
                </h3>
                <Button variant="link" size="sm" className="text-xs h-auto p-0">
                  View all in Marketplace
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              
              <div className="space-y-3">
                {experts.map(expert => (
                  <ExpertCard key={expert.id} expert={expert} />
                ))}
              </div>
            </TabsContent>
            
            {/* Suppliers Tab */}
            <TabsContent value="suppliers" className="m-0 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Component Suppliers
                </h3>
                <Button variant="link" size="sm" className="text-xs h-auto p-0">
                  View all
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              
              <div className="space-y-3">
                {suppliers.map(supplier => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
              </div>
              
              <Separator />
              
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Need custom components?
                </p>
                <Button variant="outline" size="sm">
                  Post RFQ to Suppliers
                </Button>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </motion.div>
    </AnimatePresence>
  )
}
