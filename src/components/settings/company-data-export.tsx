import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Clock } from 'lucide-react'

/**
 * INTENT: Placeholder for company data export. Previously faked a success toast
 * with setTimeout which was deceptive. Now shows an honest "coming soon" state
 * until the export action is actually implemented.
 */
export function CompanyDataExport() {
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
            <CardContent>
                <div className="flex flex-col items-center justify-center py-6 text-center rounded-lg bg-muted/30">
                    <Clock className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground">Coming soon</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        Full company data export is being built. In the meantime, contact{' '}
                        <a href="mailto:support@forgeos.ai" className="text-international-orange hover:underline">
                            support@forgeos.ai
                        </a>{' '}
                        to request your data.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
