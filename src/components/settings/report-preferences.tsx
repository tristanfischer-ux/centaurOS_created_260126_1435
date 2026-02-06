'use client'

/**
 * ReportPreferences Component
 * 
 * Allows users to configure their Daily Pulse delivery preferences
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, BarChart3, Check } from 'lucide-react'
import { getReportPreferences, updateReportPreferences } from '@/actions/reports'
import { toast } from 'sonner'
import type { ReportPreferences as ReportPrefsType } from '@/lib/reports/types'

interface ReportPreferencesProps {
    hasTelegramLinked: boolean
}

const TIME_OPTIONS = [
    { value: '06:00:00', label: '6:00 AM' },
    { value: '07:00:00', label: '7:00 AM' },
    { value: '08:00:00', label: '8:00 AM' },
    { value: '09:00:00', label: '9:00 AM' },
    { value: '17:00:00', label: '5:00 PM' },
    { value: '18:00:00', label: '6:00 PM' },
    { value: '19:00:00', label: '7:00 PM' },
    { value: '20:00:00', label: '8:00 PM' },
]

export function ReportPreferences({ hasTelegramLinked }: ReportPreferencesProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [prefs, setPrefs] = useState<ReportPrefsType | null>(null)
    const [hasChanges, setHasChanges] = useState(false)
    
    useEffect(() => {
        async function loadPrefs() {
            const result = await getReportPreferences()
            if (result.success && result.data) {
                setPrefs(result.data)
            }
            setLoading(false)
        }
        loadPrefs()
    }, [])
    
    const handleChange = (key: keyof ReportPrefsType, value: boolean | string) => {
        if (!prefs) return
        setPrefs({ ...prefs, [key]: value })
        setHasChanges(true)
    }
    
    const handleSave = async () => {
        if (!prefs) return
        
        setSaving(true)
        const result = await updateReportPreferences({
            telegram_enabled: prefs.telegram_enabled,
            email_enabled: prefs.email_enabled,
            slack_enabled: prefs.slack_enabled,
            daily_report_time: prefs.daily_report_time,
            include_summary: prefs.include_summary,
            include_trends: prefs.include_trends,
            include_insights: prefs.include_insights,
            include_team_activity: prefs.include_team_activity,
        })
        
        if (result.success) {
            toast.success('Report preferences saved')
            setHasChanges(false)
        } else {
            toast.error(result.error || 'Failed to save preferences')
        }
        setSaving(false)
    }
    
    if (loading) {
        return (
            <Card className="bg-background border-slate-200 shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/60 to-transparent border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                        </div>
                        <CardTitle>Daily Pulse</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }
    
    if (!prefs) {
        return null
    }
    
    return (
        <Card className="bg-background border-slate-200 shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50/60 to-transparent border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle>Daily Pulse</CardTitle>
                        <CardDescription>
                            Configure how and when you receive your daily productivity summary
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Delivery Channels */}
                <div className="space-y-3">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Delivery Channels</Label>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5">
                            <Label htmlFor="telegram-reports" className="font-normal">Telegram</Label>
                            <p className="text-xs text-muted-foreground">
                                {hasTelegramLinked 
                                    ? 'Receive reports via Telegram bot'
                                    : 'Link Telegram above to enable'}
                            </p>
                        </div>
                        <Switch
                            id="telegram-reports"
                            checked={prefs.telegram_enabled}
                            onCheckedChange={(v) => handleChange('telegram_enabled', v)}
                            disabled={!hasTelegramLinked}
                        />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg opacity-50">
                        <div className="space-y-0.5">
                            <Label htmlFor="email-reports" className="font-normal">Email</Label>
                            <p className="text-xs text-muted-foreground">
                                Coming soon
                            </p>
                        </div>
                        <Switch
                            id="email-reports"
                            checked={false}
                            disabled
                        />
                    </div>
                </div>
                
                <div className="border-t border-slate-100" />
                
                {/* Timing */}
                <div className="space-y-2">
                    <Label htmlFor="report-time">Report Time</Label>
                    <Select
                        value={prefs.daily_report_time}
                        onValueChange={(v) => handleChange('daily_report_time', v)}
                    >
                        <SelectTrigger id="report-time" className="w-full">
                            <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        When to receive your daily summary (in your local time)
                    </p>
                </div>
                
                <div className="border-t border-slate-100" />
                
                {/* Content Preferences */}
                <div className="space-y-3">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Include in Report</Label>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5">
                            <Label htmlFor="include-summary" className="font-normal">Summary</Label>
                            <p className="text-xs text-muted-foreground">
                                Natural language overview of your day
                            </p>
                        </div>
                        <Switch
                            id="include-summary"
                            checked={prefs.include_summary}
                            onCheckedChange={(v) => handleChange('include_summary', v)}
                        />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5">
                            <Label htmlFor="include-trends" className="font-normal">Trends</Label>
                            <p className="text-xs text-muted-foreground">
                                Day-over-day productivity comparisons
                            </p>
                        </div>
                        <Switch
                            id="include-trends"
                            checked={prefs.include_trends}
                            onCheckedChange={(v) => handleChange('include_trends', v)}
                        />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5">
                            <Label htmlFor="include-insights" className="font-normal">Insights</Label>
                            <p className="text-xs text-muted-foreground">
                                Actionable suggestions based on your activity
                            </p>
                        </div>
                        <Switch
                            id="include-insights"
                            checked={prefs.include_insights}
                            onCheckedChange={(v) => handleChange('include_insights', v)}
                        />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="space-y-0.5">
                            <Label htmlFor="include-team" className="font-normal">Team Activity</Label>
                            <p className="text-xs text-muted-foreground">
                                Overview of team productivity (for leaders)
                            </p>
                        </div>
                        <Switch
                            id="include-team"
                            checked={prefs.include_team_activity}
                            onCheckedChange={(v) => handleChange('include_team_activity', v)}
                        />
                    </div>
                </div>
                
                {/* Save Button */}
                {hasChanges && (
                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="w-full bg-electric-blue hover:bg-electric-blue-hover"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Save Preferences
                            </>
                        )}
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
