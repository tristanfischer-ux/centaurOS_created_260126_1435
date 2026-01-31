'use client'

/**
 * Currency Selector
 * Allows users to change their preferred display currency
 */

import { useState, useEffect } from 'react'
import { Globe, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/billing'
import { getPreferredCurrency, updatePreferredCurrency } from '@/actions/billing'
import { toast } from 'sonner'

interface CurrencySelectorProps {
  className?: string
  compact?: boolean
}

const CURRENCIES: { value: SupportedCurrency; label: string; symbol: string }[] = [
  { value: 'GBP', label: 'British Pound', symbol: '£' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'USD', label: 'US Dollar', symbol: '$' },
]

export function CurrencySelector({ className, compact = false }: CurrencySelectorProps) {
  const { toast } = useToast()
  const [currency, setCurrency] = useState<SupportedCurrency>('GBP')
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    loadCurrency()
  }, [])

  const loadCurrency = async () => {
    const { currency: pref } = await getPreferredCurrency()
    setCurrency(pref)
    setIsLoading(false)
  }

  const handleChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === currency) return

    setIsUpdating(true)
    const { success, error } = await updatePreferredCurrency(newCurrency)

    if (success) {
      setCurrency(newCurrency)
      toast.success('Currency Updated', {
        description: `Display currency changed to ${CURRENCIES.find(c => c.value === newCurrency)?.label}`,
      })
    } else {
      toast.error('Error', {
        description: error || 'Failed to update currency',
      })
    }

    setIsUpdating(false)
  }

  const currentCurrency = CURRENCIES.find(c => c.value === currency)

  if (isLoading) {
    return (
      <Button variant="outline" size={compact ? 'sm' : 'default'} disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'sm' : 'default'}
          className={className}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Globe className="h-4 w-4 mr-2" />
              {compact ? currentCurrency?.value : currentCurrency?.symbol} {!compact && currentCurrency?.value}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CURRENCIES.map(curr => (
          <DropdownMenuItem
            key={curr.value}
            onClick={() => handleChange(curr.value)}
            className="flex items-center justify-between"
          >
            <span>
              {curr.symbol} {curr.label}
            </span>
            {curr.value === currency && (
              <Check className="h-4 w-4 ml-2 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
