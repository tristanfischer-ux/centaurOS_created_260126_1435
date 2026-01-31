'use client'

import { useState, useMemo, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select'
import { 
    AlertCircle,
    Check, 
    DollarSign, 
    Eye,
    Info,
    Loader2, 
    Repeat,
    Users
} from 'lucide-react'
import { toast } from 'sonner'
import {
    updatePricing,
    type Currency
} from '@/actions/pricing'

// ==========================================
// TYPES
// ==========================================

interface PricingFormProps {
    initialValues?: {
        dayRate: number | null
        currency: Currency
        minimumDays: number
        retainerEnabled: boolean
        retainerHoursPerWeek: number | null
        retainerHourlyRate: number | null
        retainerDiscountPercent: number
    }
    onSaved?: () => void
    showPreview?: boolean
}

// ==========================================
// CONSTANTS
// ==========================================

const CURRENCIES: { value: Currency; label: string; symbol: string }[] = [
    { value: 'GBP', label: 'British Pound', symbol: '£' },
    { value: 'EUR', label: 'Euro', symbol: '€' },
    { value: 'USD', label: 'US Dollar', symbol: '$' },
]

const MINIMUM_DAYS_OPTIONS = [
    { value: 1, label: '1 day (no minimum)' },
    { value: 2, label: '2 days' },
    { value: 3, label: '3 days' },
    { value: 5, label: '5 days (1 week)' },
    { value: 10, label: '10 days (2 weeks)' },
]

// ==========================================
// HELPERS
// ==========================================

function getCurrencySymbol(currency: string): string {
    return CURRENCIES.find(c => c.value === currency)?.symbol || '£'
}

function formatPrice(amount: number | null, currency: string): string {
    if (amount === null || isNaN(amount)) return '—'
    const symbol = getCurrencySymbol(currency)
    return `${symbol}${amount.toLocaleString('en-GB', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
    })}`
}

// ==========================================
// COMPONENT
// ==========================================

export function PricingForm({ 
    initialValues,
    onSaved,
    showPreview = true
}: PricingFormProps) {
    const [isSaving, startTransition] = useTransition()

    // Form state
    const [dayRate, setDayRate] = useState<string>(initialValues?.dayRate?.toString() || '')
    const [currency, setCurrency] = useState<Currency>(initialValues?.currency || 'GBP')
    const [minimumDays, setMinimumDays] = useState<number>(initialValues?.minimumDays || 1)
    
    // Retainer state
    const [retainerEnabled, setRetainerEnabled] = useState(initialValues?.retainerEnabled || false)
    const [retainerHourlyRate, setRetainerHourlyRate] = useState<string>(
        initialValues?.retainerHourlyRate?.toString() || ''
    )
    const [retainerHoursPerWeek, setRetainerHoursPerWeek] = useState<string>(
        initialValues?.retainerHoursPerWeek?.toString() || '20'
    )
    const [retainerDiscountPercent, setRetainerDiscountPercent] = useState<number>(
        initialValues?.retainerDiscountPercent || 15
    )

    // Track changes using useMemo for derived state
    const hasChanges = useMemo(() => {
        const currentRate = dayRate ? parseFloat(dayRate) : null
        const initialRate = initialValues?.dayRate || null
        
        return (
            currentRate !== initialRate ||
            currency !== (initialValues?.currency || 'GBP') ||
            minimumDays !== (initialValues?.minimumDays || 1) ||
            retainerEnabled !== (initialValues?.retainerEnabled || false) ||
            (retainerHourlyRate ? parseFloat(retainerHourlyRate) : null) !== (initialValues?.retainerHourlyRate || null) ||
            (retainerHoursPerWeek ? parseInt(retainerHoursPerWeek) : null) !== (initialValues?.retainerHoursPerWeek || null) ||
            retainerDiscountPercent !== (initialValues?.retainerDiscountPercent || 15)
        )
    }, [dayRate, currency, minimumDays, retainerEnabled, retainerHourlyRate, retainerHoursPerWeek, retainerDiscountPercent, initialValues])

    // Calculate suggested retainer rate based on day rate
    const suggestedRetainerRate = dayRate ? 
        Math.round((parseFloat(dayRate) / 8) * (1 - retainerDiscountPercent / 100) * 100) / 100 : 
        null

    const handleSave = async () => {
        const rate = dayRate ? parseFloat(dayRate) : null
        const retainerRate = retainerHourlyRate ? parseFloat(retainerHourlyRate) : null
        const retainerHours = retainerHoursPerWeek ? parseInt(retainerHoursPerWeek) : null
        
        // Validation
        if (rate !== null && (isNaN(rate) || rate < 0)) {
            toast.error('Please enter a valid day rate')
            return
        }

        if (retainerEnabled && retainerRate !== null && (isNaN(retainerRate) || retainerRate < 0)) {
            toast.error('Please enter a valid retainer hourly rate')
            return
        }

        startTransition(async () => {
            const result = await updatePricing({
                dayRate: rate,
                currency,
                minimumDays,
                retainerEnabled,
                retainerHourlyRate: retainerEnabled ? retainerRate : null,
                retainerHoursPerWeek: retainerEnabled ? retainerHours : null,
                retainerDiscountPercent: retainerEnabled ? retainerDiscountPercent : 0
            })
            
            if (result.success) {
                toast.success('Pricing updated successfully')
                onSaved?.()
            } else {
                toast.error(result.error || 'Failed to update pricing')
            }
        })
    }

    // Calculate preview values
    const parsedDayRate = dayRate ? parseFloat(dayRate) : null
    const parsedRetainerRate = retainerHourlyRate ? parseFloat(retainerHourlyRate) : null
    const parsedRetainerHours = retainerHoursPerWeek ? parseInt(retainerHoursPerWeek) : 20
    const weeklyRetainer = parsedRetainerRate ? parsedRetainerRate * parsedRetainerHours : null
    const monthlyRetainer = weeklyRetainer ? weeklyRetainer * 4.33 : null

    return (
        <div className="space-y-6">
            {/* Day Rate Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                        Day Rate Pricing
                    </CardTitle>
                    <CardDescription>
                        Set your standard daily rate for project engagements
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Day Rate */}
                        <div className="space-y-2">
                            <Label htmlFor="dayRate">Day Rate</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        {getCurrencySymbol(currency)}
                                    </span>
                                    <Input
                                        id="dayRate"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="500.00"
                                        value={dayRate}
                                        onChange={(e) => setDayRate(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                                <Select 
                                    value={currency} 
                                    onValueChange={(v) => setCurrency(v as Currency)}
                                >
                                    <SelectTrigger className="w-[110px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CURRENCIES.map(c => (
                                            <SelectItem key={c.value} value={c.value}>
                                                {c.value} ({c.symbol})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Minimum Engagement */}
                        <div className="space-y-2">
                            <Label htmlFor="minimumDays">Minimum Engagement</Label>
                            <Select 
                                value={minimumDays.toString()} 
                                onValueChange={(v) => setMinimumDays(parseInt(v))}
                            >
                                <SelectTrigger id="minimumDays">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {MINIMUM_DAYS_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value.toString()}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Clients must book at least this many days
                            </p>
                        </div>
                    </div>

                    {parsedDayRate !== null && parsedDayRate > 0 && (
                        <div className="p-3 bg-muted rounded-lg text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Info className="h-4 w-4" />
                                Effective hourly rate: {formatPrice(parsedDayRate / 8, currency)}/hour
                                (based on 8-hour day)
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Retainer Section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Repeat className="h-5 w-5 text-muted-foreground" />
                                Retainer Pricing
                            </CardTitle>
                            <CardDescription>
                                Offer discounted rates for ongoing commitments
                            </CardDescription>
                        </div>
                        <Switch
                            checked={retainerEnabled}
                            onCheckedChange={setRetainerEnabled}
                        />
                    </div>
                </CardHeader>
                
                {retainerEnabled && (
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Retainer Hourly Rate */}
                            <div className="space-y-2">
                                <Label htmlFor="retainerRate">Retainer Hourly Rate</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                        {getCurrencySymbol(currency)}
                                    </span>
                                    <Input
                                        id="retainerRate"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder={suggestedRetainerRate?.toString() || '50.00'}
                                        value={retainerHourlyRate}
                                        onChange={(e) => setRetainerHourlyRate(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                                {suggestedRetainerRate && (
                                    <p className="text-xs text-emerald-600">
                                        Suggested: {formatPrice(suggestedRetainerRate, currency)}/hr 
                                        ({retainerDiscountPercent}% discount)
                                    </p>
                                )}
                            </div>

                            {/* Weekly Hours */}
                            <div className="space-y-2">
                                <Label htmlFor="retainerHours">Default Weekly Hours</Label>
                                <Select 
                                    value={retainerHoursPerWeek} 
                                    onValueChange={setRetainerHoursPerWeek}
                                >
                                    <SelectTrigger id="retainerHours">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="8">8 hours (1 day/week)</SelectItem>
                                        <SelectItem value="16">16 hours (2 days/week)</SelectItem>
                                        <SelectItem value="20">20 hours (half-time)</SelectItem>
                                        <SelectItem value="24">24 hours (3 days/week)</SelectItem>
                                        <SelectItem value="32">32 hours (4 days/week)</SelectItem>
                                        <SelectItem value="40">40 hours (full-time)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Discount Slider */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Retainer Discount</Label>
                                <Badge variant="secondary">{retainerDiscountPercent}% off</Badge>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="30"
                                step="5"
                                value={retainerDiscountPercent}
                                onChange={(e) => setRetainerDiscountPercent(parseInt(e.target.value))}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>0%</span>
                                <span>15%</span>
                                <span>30%</span>
                            </div>
                        </div>

                        {weeklyRetainer !== null && (
                            <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
                                <p className="text-sm font-medium text-foreground mb-2">
                                    Retainer Summary
                                </p>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Weekly</p>
                                        <p className="font-semibold text-foreground">
                                            {formatPrice(weeklyRetainer, currency)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Monthly (avg)</p>
                                        <p className="font-semibold text-foreground">
                                            {formatPrice(monthlyRetainer, currency)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                )}
            </Card>

            {/* Live Preview */}
            {showPreview && (
                <Card className="border-dashed">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                            How Buyers See Your Pricing
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="p-4 bg-background border rounded-lg">
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-3xl font-bold text-foreground">
                                    {parsedDayRate ? formatPrice(parsedDayRate, currency) : '—'}
                                </span>
                                <span className="text-muted-foreground">/day</span>
                            </div>
                            
                            {minimumDays > 1 && (
                                <Badge variant="secondary" className="mb-3">
                                    {minimumDays} day minimum
                                </Badge>
                            )}
                            
                            {retainerEnabled && parsedRetainerRate && (
                                <>
                                    <Separator className="my-3" />
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-blue-600" />
                                        <span className="text-sm text-muted-foreground">
                                            Retainer available at{' '}
                                            <span className="font-semibold text-blue-600">
                                                {formatPrice(parsedRetainerRate, currency)}/hr
                                            </span>
                                        </span>
                                        {retainerDiscountPercent > 0 && (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                                Save {retainerDiscountPercent}%
                                            </Badge>
                                        )}
                                    </div>
                                </>
                            )}
                            
                            {!parsedDayRate && !retainerEnabled && (
                                <div className="flex items-center gap-2 text-amber-600">
                                    <AlertCircle className="h-4 w-4" />
                                    <span className="text-sm">Set your pricing to appear in the marketplace</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-between">
                <div>
                    {hasChanges && (
                        <Badge variant="secondary" className="text-status-warning-dark border-status-warning">
                            Unsaved changes
                        </Badge>
                    )}
                </div>
                <Button 
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    size="lg"
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <Check className="h-4 w-4 mr-2" />
                    )}
                    Save Pricing
                </Button>
            </div>
        </div>
    )
}

export default PricingForm
