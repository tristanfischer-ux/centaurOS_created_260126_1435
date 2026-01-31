'use client'

import { ShieldX, LogOut, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AccessRevokedPage() {
    const router = useRouter()
    
    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }
    
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-md w-full bg-card border shadow-lg">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-16 h-16 rounded-full bg-status-error-light flex items-center justify-center mb-4">
                        <ShieldX className="h-8 w-8 text-destructive" />
                    </div>
                    <CardTitle className="text-2xl font-display text-foreground">
                        Access Revoked
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Your access to this organization has been revoked
                    </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6 pt-4">
                    <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground space-y-2">
                        <p>
                            This may have happened because:
                        </p>
                        <ul className="list-disc list-inside space-y-1 pl-2">
                            <li>You have been removed from the organization</li>
                            <li>Your account has been deactivated</li>
                            <li>Your role or permissions have changed</li>
                        </ul>
                    </div>
                    
                    <p className="text-sm text-muted-foreground text-center">
                        If you believe this is an error, please contact your organization administrator 
                        or our support team.
                    </p>
                    
                    <div className="flex flex-col gap-3">
                        <Button
                            variant="secondary"
                            onClick={handleLogout}
                            className="w-full"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            Sign Out
                        </Button>
                        
                        <Button
                            variant="ghost"
                            asChild
                            className="w-full"
                        >
                            <a href="mailto:support@centauros.io">
                                <Mail className="h-4 w-4 mr-2" />
                                Contact Support
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
