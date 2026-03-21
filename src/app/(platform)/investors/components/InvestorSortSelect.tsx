/**
 * @file InvestorSortSelect.tsx
 *
 * @description Dropdown for sorting the investor directory grid.
 */

'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowUpDown } from 'lucide-react'

export type SortOption = 'match' | 'fund_size' | 'quality' | 'hardware_fit' | 'cheque' | 'priority' | 'name'

const SORT_LABELS: Record<SortOption, string> = {
  match: 'Best match',
  fund_size: 'Fund size',
  cheque: 'Cheque size',
  quality: 'Quality score',
  hardware_fit: 'Hardware fit',
  priority: 'Priority',
  name: 'Name A-Z',
}

interface InvestorSortSelectProps {
  value: SortOption
  onChange: (value: SortOption) => void
}

export function InvestorSortSelect({ value, onChange }: InvestorSortSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select value={value} onValueChange={v => onChange(v as SortOption)}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SORT_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key} className="text-xs">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
