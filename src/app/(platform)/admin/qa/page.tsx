import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
    FlaskConical,
    AlertCircle
} from "lucide-react"
import { QATestPanel } from "./qa-test-panel"

export default async function QATestsPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="h-5 w-5 text-international-orange" />
                    <h2 className="text-xl font-semibold text-foreground">
                        QA Testing
                    </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Run &quot;Day in the Life&quot; E2E tests for Executive, Founder, and Apprentice personas
                </p>
            </div>
            
            {/* Info Banner */}
            <Card className="border-status-info bg-status-info-light">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-status-info shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-status-info-dark mb-1">
                                About Day in the Life Tests
                            </p>
                            <p className="text-status-info-dark/80">
                                These tests simulate real user journeys for each persona, verifying login, 
                                dashboard access, messaging, task creation, and role-specific features. 
                                Tests run via GitHub Actions against your selected environment.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            {/* Main Test Panel */}
            <QATestPanel />
        </div>
    )
}
