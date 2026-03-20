/**
 * @file InvestorExportMenu.tsx
 *
 * @description Dropdown button for exporting investor data.
 * CSV (starter+), PPTX (professional+). Locked options show lock icon + tier label.
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileSpreadsheet, Presentation, Lock, Loader2 } from 'lucide-react'
import { exportInvestorsCSV, exportInvestorsPPTX } from '@/lib/investor-export'
import { toast } from 'sonner'
import type { InvestorFirm, InvestorTierAccess } from '@/actions/investors'

interface InvestorExportMenuProps {
  firms: InvestorFirm[]
  matchScores?: Record<string, number>
  access: InvestorTierAccess
  companyName?: string
}

export function InvestorExportMenu({
  firms,
  matchScores,
  access,
  companyName = 'My Company',
}: InvestorExportMenuProps) {
  const [exporting, setExporting] = useState(false)

  const handleCSV = () => {
    if (!access.detailAccess) {
      toast.error('Upgrade to Starter to export CSV')
      return
    }
    try {
      exportInvestorsCSV(firms, matchScores)
      toast.success('CSV downloaded')
    } catch (err) {
      console.error('[InvestorExportMenu] CSV export failed:', err)
      toast.error('Export failed')
    }
  }

  const handlePPTX = async () => {
    if (exporting) return
    if (!access.intelligenceAccess) {
      toast.error('Upgrade to Professional to export PPTX')
      return
    }
    setExporting(true)
    try {
      await exportInvestorsPPTX(firms, companyName, matchScores)
      toast.success('PPTX downloaded')
    } catch (err) {
      console.error('[InvestorExportMenu] PPTX export failed:', err)
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="text-xs gap-1.5" disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCSV} className="text-xs gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export CSV
          {!access.detailAccess && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePPTX} className="text-xs gap-2">
          <Presentation className="h-3.5 w-3.5" />
          Export PPTX
          {!access.intelligenceAccess && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
