'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { 
    CheckCircle2, 
    Circle, 
    ArrowRight,
    User,
    FileText,
    CreditCard,
    Video,
    Briefcase,
    Award,
    Linkedin,
    MapPin
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfileField {
    key: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    isComplete: boolean
    weight: number
    editPath: string
    required: boolean
}

interface ProfileCompletenessCardProps {
    profile: {
        headline: string | null
        bio: string | null
        day_rate: number | null
        stripe_onboarding_complete: boolean
        video_url: string | null
        linkedin_url: string | null
        location: string | null
        years_experience: number | null
        specializations: string[]
        profile_completeness: number
    }
    caseStudyCount: number
    portfolioCount: number
}

export function ProfileCompletenessCard({ profile, caseStudyCount, portfolioCount }: ProfileCompletenessCardProps) {
    const fields: ProfileField[] = [
        {
            key: 'headline',
            label: 'Add a headline',
            icon: User,
            isComplete: !!profile.headline && profile.headline.length > 10,
            weight: 10,
            editPath: '/provider-portal/profile',
            required: true
        },
        {
            key: 'bio',
            label: 'Write your bio',
            icon: FileText,
            isComplete: !!profile.bio && profile.bio.length > 50,
            weight: 15,
            editPath: '/provider-portal/profile',
            required: true
        },
        {
            key: 'day_rate',
            label: 'Set your day rate',
            icon: CreditCard,
            isComplete: !!profile.day_rate && profile.day_rate > 0,
            weight: 10,
            editPath: '/provider-portal/pricing',
            required: true
        },
        {
            key: 'stripe',
            label: 'Connect Stripe account',
            icon: CreditCard,
            isComplete: profile.stripe_onboarding_complete,
            weight: 15,
            editPath: '/provider-portal/payments',
            required: true
        },
        {
            key: 'video',
            label: 'Add video introduction',
            icon: Video,
            isComplete: !!profile.video_url,
            weight: 10,
            editPath: '/provider-portal/profile',
            required: false
        },
        {
            key: 'linkedin',
            label: 'Link your LinkedIn',
            icon: Linkedin,
            isComplete: !!profile.linkedin_url,
            weight: 5,
            editPath: '/provider-portal/profile',
            required: false
        },
        {
            key: 'location',
            label: 'Add your location',
            icon: MapPin,
            isComplete: !!profile.location,
            weight: 5,
            editPath: '/provider-portal/profile',
            required: false
        },
        {
            key: 'experience',
            label: 'Add years of experience',
            icon: Briefcase,
            isComplete: !!profile.years_experience,
            weight: 5,
            editPath: '/provider-portal/profile',
            required: false
        },
        {
            key: 'specializations',
            label: 'Add specializations',
            icon: Award,
            isComplete: profile.specializations && profile.specializations.length > 0,
            weight: 5,
            editPath: '/provider-portal/profile',
            required: false
        },
        {
            key: 'case_studies',
            label: 'Add a case study',
            icon: FileText,
            isComplete: caseStudyCount > 0,
            weight: 10,
            editPath: '/provider-portal/case-studies',
            required: false
        },
        {
            key: 'portfolio',
            label: 'Add portfolio items',
            icon: Briefcase,
            isComplete: portfolioCount > 0,
            weight: 10,
            editPath: '/provider-portal/portfolio',
            required: false
        }
    ]
    
    const completedCount = fields.filter(f => f.isComplete).length
    const requiredFields = fields.filter(f => f.required)
    const requiredCompletedCount = requiredFields.filter(f => f.isComplete).length
    const requiredComplete = requiredCompletedCount === requiredFields.length
    
    // Calculate actual completeness percentage
    const completeness = fields.reduce((acc, field) => {
        return acc + (field.isComplete ? field.weight : 0)
    }, 0)
    
    // Find next incomplete field to focus on
    const nextIncomplete = fields.find(f => !f.isComplete && f.required) || fields.find(f => !f.isComplete)
    
    return (
        <Card className={cn(
            requiredComplete ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'
        )}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            {requiredComplete ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : (
                                <Circle className="h-5 w-5 text-amber-600" />
                            )}
                            Profile Completeness
                        </CardTitle>
                        <CardDescription>
                            {requiredComplete 
                                ? 'Great job! Your profile is ready for the marketplace.' 
                                : 'Complete your profile to appear in the marketplace'}
                        </CardDescription>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-bold text-foreground">{completeness}%</p>
                        <p className="text-xs text-muted-foreground">
                            {completedCount} of {fields.length} fields
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Progress value={completeness} className="h-2" />
                
                {/* Status badges */}
                <div className="flex flex-wrap gap-2">
                    {requiredComplete ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Required fields complete
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                            {requiredFields.length - requiredCompletedCount} required field(s) remaining
                        </Badge>
                    )}
                    
                    {completeness >= 80 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            Profile excellence
                        </Badge>
                    )}
                </div>
                
                {/* Incomplete fields list */}
                {!requiredComplete && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Complete these to get started:</p>
                        <div className="space-y-1">
                            {fields.filter(f => !f.isComplete && f.required).map((field) => {
                                const Icon = field.icon
                                return (
                                    <Link
                                        key={field.key}
                                        href={field.editPath}
                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-background transition-colors group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                                            <Icon className="h-4 w-4 text-amber-600" />
                                        </div>
                                        <span className="flex-1 text-sm">{field.label}</span>
                                        <Badge variant="outline" className="text-xs">Required</Badge>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )}
                
                {/* Optional fields for improvement */}
                {requiredComplete && completeness < 100 && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Boost your profile:</p>
                        <div className="space-y-1">
                            {fields.filter(f => !f.isComplete && !f.required).slice(0, 3).map((field) => {
                                const Icon = field.icon
                                return (
                                    <Link
                                        key={field.key}
                                        href={field.editPath}
                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-background transition-colors group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <span className="flex-1 text-sm">{field.label}</span>
                                        <Badge variant="outline" className="text-xs">+{field.weight}%</Badge>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )}
                
                {/* All complete */}
                {completeness >= 100 && (
                    <div className="text-center py-4">
                        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-green-800">Profile 100% complete!</p>
                        <p className="text-xs text-green-600">Your profile is fully optimized for the marketplace</p>
                    </div>
                )}
                
                {/* Quick action button */}
                {nextIncomplete && completeness < 100 && (
                    <Button asChild className="w-full mt-4">
                        <Link href={nextIncomplete.editPath}>
                            Complete: {nextIncomplete.label}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
