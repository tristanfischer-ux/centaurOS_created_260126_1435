"use client"

import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Circle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingStep {
    id: string
    label: string
    completed: boolean
    required: boolean
}

interface ProviderOnboardingProgressProps {
    steps?: OnboardingStep[]
    completionPercent?: number
    className?: string
}

const defaultSteps: OnboardingStep[] = [
    { id: 'headline', label: 'Add a headline', completed: false, required: true },
    { id: 'bio', label: 'Write your bio', completed: false, required: true },
    { id: 'stripe', label: 'Connect Stripe account', completed: false, required: true },
    { id: 'rates', label: 'Set your day rate', completed: false, required: true },
]

export function ProviderOnboardingProgress({ 
    steps = defaultSteps,
    completionPercent,
    className 
}: ProviderOnboardingProgressProps) {
    const completedCount = steps.filter(s => s.completed).length
    const percent = completionPercent ?? Math.round((completedCount / steps.length) * 100)

    return (
        <Card className={cn("", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Profile Completion</CardTitle>
                    <span className={cn(
                        "text-2xl font-bold",
                        percent === 100 ? "text-green-600" : "text-amber-600"
                    )}>
                        {percent}%
                    </span>
                </div>
                <CardDescription>
                    {percent === 100 
                        ? "Your profile is complete!" 
                        : "Complete your profile to start receiving orders"
                    }
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Progress value={percent} className="h-2" />
                
                <div className="space-y-2">
                    {steps.map((step) => (
                        <div 
                            key={step.id}
                            className={cn(
                                "flex items-center gap-3 text-sm",
                                step.completed ? "text-muted-foreground" : "text-foreground"
                            )}
                        >
                            {step.completed ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : step.required ? (
                                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            ) : (
                                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className={cn(step.completed && "line-through")}>
                                {step.label}
                            </span>
                            {!step.completed && step.required && (
                                <span className="text-xs text-amber-600 font-medium">Required</span>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
