// @ts-nocheck
'use client'

import { Badge } from '@/components/ui/badge'

interface SkillGap {
  skill: string
  category: string
  current: number
  target: number
  gap: number
}

interface SkillsGapChartProps {
  gaps: SkillGap[]
}

const CATEGORY_COLORS: Record<string, string> = {
  technical: 'bg-primary',
  professional: 'bg-amber-500',
  ai: 'bg-electric-blue',
  functional: 'bg-purple-500',
  leadership: 'bg-emerald-500'
}

const LEVEL_LABELS = ['None', 'Awareness', 'Understanding', 'Application', 'Analysis', 'Mastery']

export function SkillsGapChart({ gaps }: SkillsGapChartProps) {
  if (gaps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>All skills are at target level!</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {gaps.map((gap) => {
        const currentPercent = (gap.current / 5) * 100
        const targetPercent = (gap.target / 5) * 100
        const categoryColor = CATEGORY_COLORS[gap.category] || CATEGORY_COLORS.technical
        
        return (
          <div key={gap.skill} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{gap.skill}</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {gap.category}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {LEVEL_LABELS[gap.current]} → {LEVEL_LABELS[gap.target]}
              </span>
            </div>
            
            {/* Progress bar with target marker */}
            <div className="relative h-3 bg-muted rounded-full overflow-hidden">
              {/* Current level */}
              <div 
                className={`absolute h-full ${categoryColor} rounded-full transition-all`}
                style={{ width: `${currentPercent}%` }}
              />
              
              {/* Target marker */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
                style={{ left: `${targetPercent}%` }}
                title={`Target: Level ${gap.target}`}
              />
              
              {/* Level markers */}
              {[1, 2, 3, 4].map((level) => (
                <div 
                  key={level}
                  className="absolute top-0 bottom-0 w-px bg-background/30"
                  style={{ left: `${(level / 5) * 100}%` }}
                />
              ))}
            </div>
            
            {/* Level scale */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>
        )
      })}
      
      {/* Legend */}
      <div className="flex items-center gap-4 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary rounded" />
          <span>Current Level</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-3 bg-foreground/60" />
          <span>Target Level</span>
        </div>
      </div>
    </div>
  )
}
