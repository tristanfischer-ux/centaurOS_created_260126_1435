'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LogOut } from 'lucide-react'
import { signOut } from '@/actions/auth'

export function SignOutCard() {
    return (
        <Card className="border bg-muted/30">
            <CardContent className="p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-foreground">Sign Out</p>
                    <p className="text-xs text-muted-foreground">Securely sign out of your account on this device.</p>
                </div>
                <form action={signOut}>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
