'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Briefcase,
  GraduationCap,
  Factory,
  ArrowRight,
  Users,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface HireExpertCTAProps {
  /** Whether to show the compact or full version */
  variant?: 'compact' | 'full'
  /** Optional sector to pre-filter marketplace */
  sector?: string
  /** Optional class name */
  className?: string
}

export function HireExpertCTA({
  variant = 'full',
  sector,
  className,
}: HireExpertCTAProps) {
  const sectorParam = sector ? `&sector=${sector}` : ''

  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col sm:flex-row gap-2', className)}>
        <Link href={`/marketplace?tab=People&subcategory=Executive${sectorParam}`} className="flex-1">
          <Card className="group hover:border-chart-5/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-chart-5/10 flex items-center justify-center shrink-0">
                <Briefcase className="h-4 w-4 text-chart-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Hire an Expert</p>
                <p className="text-[10px] text-muted-foreground">
                  Fractional executives & specialists
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-chart-5 transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
        <Link href={`/marketplace?tab=People&subcategory=Apprentice${sectorParam}`} className="flex-1">
          <Card className="group hover:border-status-info/40 transition-colors cursor-pointer h-full">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-status-info-light flex items-center justify-center shrink-0">
                <GraduationCap className="h-4 w-4 text-status-info" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Hire an Apprentice</p>
                <p className="text-[10px] text-muted-foreground">
                  Skilled hands-on project support
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-status-info transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>
    )
  }

  // Full variant - hero cards for marketplace
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', className)}>
      {/* Hire Expert */}
      <Link href={`/marketplace?tab=People&subcategory=Executive${sectorParam}`}>
        <Card className="group hover:border-chart-5/40 transition-all hover:shadow-md cursor-pointer h-full">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-chart-5/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-chart-5" />
              </div>
              <Badge variant="outline" className="text-[10px] text-chart-5 border-chart-5/30">
                <ShieldCheck className="h-2.5 w-2.5 mr-1" />
                Verified
              </Badge>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Hire an Expert</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fractional CTOs, manufacturing engineers, quality experts, and domain specialists ready to review and guide your work.
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs group-hover:bg-chart-5/5">
              Browse Experts
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </Link>

      {/* Hire Apprentice */}
      <Link href={`/marketplace?tab=People&subcategory=Apprentice${sectorParam}`}>
        <Card className="group hover:border-status-info/40 transition-all hover:shadow-md cursor-pointer h-full">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-status-info-light flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-status-info" />
              </div>
              <Badge variant="outline" className="text-[10px] text-status-info border-status-info/30">
                <Users className="h-2.5 w-2.5 mr-1" />
                Talent Pool
              </Badge>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Hire an Apprentice</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Skilled apprentices for CAD, inspection, testing, documentation, and hands-on manufacturing support.
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs group-hover:bg-status-info/5">
              Browse Apprentices
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </Link>

      {/* Manufacturing Services */}
      <Link href={`/marketplace?tab=Services&search=manufacturing${sectorParam}`}>
        <Card className="group hover:border-status-success/40 transition-all hover:shadow-md cursor-pointer h-full">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-xl bg-status-success-light flex items-center justify-center">
                <Factory className="h-5 w-5 text-status-success" />
              </div>
              <Badge variant="outline" className="text-[10px] text-status-success border-status-success/30">
                <Sparkles className="h-2.5 w-2.5 mr-1" />
                Manufacturing
              </Badge>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Manufacturing Services</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                DFM review, production readiness, quality systems, and supplier qualification services.
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full h-8 text-xs group-hover:bg-status-success/5">
              Browse Services
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
