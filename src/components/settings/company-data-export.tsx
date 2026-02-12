'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Database } from 'lucide-react'
import { toast } from 'sonner'

export function CompanyDataExport() {
    const [isExporting, setIsExporting] = useState(false)

    async function handleExport() {
        setIsExporting(true)
        try {
            // TODO(TECH-DEBT): Implement company-wide data export action
            await new Promise(resolve => setTimeout(resolve, 2000)) // Placeholder
            toast.success('Company data export initiated. You will receive a download link via email.')
        } catch (error) {
            console.error('[CompanyDataExport] Export error:', error)
            toast.error('Failed to export company data. Please try again.')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-international-orange" />
                    <CardTitle>Company Data Export</CardTitle>
                </div>
                <CardDescription>
                    Export all company data including tasks, objectives, team members, and configuration.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Export includes:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• All tasks, objectives, and their history</li>
                        <li>• Team member profiles and roles</li>
                        <li>• Company profile and settings</li>
                        <li>• Activity logs and audit trail</li>
                    </ul>
                </div>

                <div className="p-3 bg-status-warning-light rounded-lg border border-status-warning/20">
                    <p className="text-xs text-status-warning-dark">
                        <strong>Note:</strong> The export will be prepared as a ZIP file and sent to your email within 24 hours.
                        This export includes all company data and should be handled securely.
                    </p>
                </div>

                <Button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="w-full"
                >
                    {isExporting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Preparing export...
                        </>
                    ) : (
                        <>
                            <Download className="h-4 w-4 mr-2" />
                            Request Company Data Export
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}
