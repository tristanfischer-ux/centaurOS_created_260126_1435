import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface TeamManagementCardProps {
    memberCount: number
}

export function TeamManagementCard({ memberCount }: TeamManagementCardProps) {
    return (
        <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-international-orange" />
                        <CardTitle>Team Management</CardTitle>
                    </div>
                    <Badge variant="secondary">{memberCount} {memberCount === 1 ? 'member' : 'members'}</Badge>
                </div>
                <CardDescription>
                    Manage team members, roles, and permissions for your company.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg border border-muted hover:border-international-orange/40 transition-colors">
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            Invite members, assign roles, manage access
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Control who can access your company's data and features
                        </p>
                    </div>
                    <Link href="/team">
                        <Button variant="outline" size="sm">
                            Manage Team
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
