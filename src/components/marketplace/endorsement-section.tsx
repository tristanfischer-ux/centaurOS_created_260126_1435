'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    ThumbsUp,
    Quote,
    Plus,
    Award,
    Star,
    Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { createEndorsement, toggleSkillEndorsement } from '@/actions/endorsements'
import type { Endorsement, SkillEndorsement, EndorsementSummary } from '@/actions/endorsements'

/**
 * EndorsementSection - Displays endorsements and skill validations for a profile.
 *
 * @description Shows general endorsements (testimonials) and skill endorsement
 * counts. Allows authenticated users to endorse the expert. Creates social proof
 * that drives viral growth.
 *
 * @component
 */

interface EndorsementSectionProps {
    /** The user ID being endorsed */
    endorsedUserId: string
    /** Pre-fetched endorsement summary */
    summary: EndorsementSummary
    /** Skills from the expert's profile (for skill endorsement buttons) */
    profileSkills: string[]
    /** Skill endorsement data with current user's status */
    skillEndorsements: SkillEndorsement[]
    /** Whether the current user is the profile owner */
    isOwnProfile?: boolean
    /** Additional CSS classes */
    className?: string
}

export function EndorsementSection({
    endorsedUserId,
    summary,
    profileSkills,
    skillEndorsements,
    isOwnProfile = false,
    className,
}: EndorsementSectionProps) {
    const [showEndorseDialog, setShowEndorseDialog] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [testimonial, setTestimonial] = useState('')
    const [relationship, setRelationship] = useState('')
    const [localSkillEndorsements, setLocalSkillEndorsements] = useState(skillEndorsements)

    const handleSubmitEndorsement = useCallback(async () => {
        if (!testimonial.trim() || testimonial.trim().length < 10) {
            toast.error('Please write at least 10 characters')
            return
        }

        setIsSubmitting(true)
        try {
            const result = await createEndorsement(endorsedUserId, testimonial, relationship)
            if (result.success) {
                toast.success('Endorsement submitted!')
                setShowEndorseDialog(false)
                setTestimonial('')
                setRelationship('')
            } else {
                toast.error(result.error || 'Failed to submit endorsement')
            }
        } catch {
            toast.error('Failed to submit endorsement')
        } finally {
            setIsSubmitting(false)
        }
    }, [endorsedUserId, testimonial, relationship])

    const handleToggleSkill = useCallback(async (skillName: string) => {
        if (isOwnProfile) {
            toast.error('You cannot endorse your own skills')
            return
        }

        // Optimistic update
        setLocalSkillEndorsements(prev => prev.map(s => {
            if (s.skill_name === skillName) {
                return {
                    ...s,
                    count: s.endorsed_by_current_user ? s.count - 1 : s.count + 1,
                    endorsed_by_current_user: !s.endorsed_by_current_user,
                }
            }
            return s
        }))

        try {
            const result = await toggleSkillEndorsement(endorsedUserId, skillName)
            if (!result.success) {
                // Revert optimistic update
                setLocalSkillEndorsements(prev => prev.map(s => {
                    if (s.skill_name === skillName) {
                        return {
                            ...s,
                            count: s.endorsed_by_current_user ? s.count - 1 : s.count + 1,
                            endorsed_by_current_user: !s.endorsed_by_current_user,
                        }
                    }
                    return s
                }))
                toast.error(result.error || 'Failed to update endorsement')
            }
        } catch {
            toast.error('Failed to update endorsement')
        }
    }, [endorsedUserId, isOwnProfile])

    // Merge profile skills with endorsement data
    const allSkills = profileSkills.map(skill => {
        const endorsement = localSkillEndorsements.find(e => e.skill_name === skill)
        return {
            skill_name: skill,
            count: endorsement?.count || 0,
            endorsed_by_current_user: endorsement?.endorsed_by_current_user || false,
        }
    })

    return (
        <div className={cn('space-y-6', className)}>
            {/* Skill endorsements */}
            {allSkills.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Award className="h-4 w-4 text-international-orange" />
                            Skill Endorsements
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {allSkills.map(skill => (
                                <button
                                    key={skill.skill_name}
                                    onClick={() => handleToggleSkill(skill.skill_name)}
                                    disabled={isOwnProfile}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                                        'border hover:shadow-sm',
                                        skill.endorsed_by_current_user
                                            ? 'bg-international-orange/10 border-international-orange/30 text-international-orange font-medium'
                                            : 'bg-background border-border text-muted-foreground hover:border-international-orange/30 hover:text-foreground',
                                        isOwnProfile && 'cursor-default hover:shadow-none'
                                    )}
                                    title={isOwnProfile ? 'Others can endorse your skills' : `Click to ${skill.endorsed_by_current_user ? 'remove' : 'add'} endorsement`}
                                >
                                    <ThumbsUp className={cn(
                                        'w-3 h-3',
                                        skill.endorsed_by_current_user && 'fill-current'
                                    )} />
                                    <span>{skill.skill_name}</span>
                                    {skill.count > 0 && (
                                        <span className={cn(
                                            'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold',
                                            skill.endorsed_by_current_user
                                                ? 'bg-international-orange text-white'
                                                : 'bg-muted text-muted-foreground'
                                        )}>
                                            {skill.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* General endorsements (testimonials) */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Quote className="h-4 w-4 text-international-orange" />
                            Endorsements
                            {summary.generalCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                    {summary.generalCount}
                                </Badge>
                            )}
                        </CardTitle>
                        {!isOwnProfile && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowEndorseDialog(true)}
                                className="gap-1.5"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Endorse
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {summary.recentEndorsements.length > 0 ? (
                        <div className="space-y-4">
                            {summary.recentEndorsements.map(endorsement => (
                                <EndorsementCard key={endorsement.id} endorsement={endorsement} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            {isOwnProfile
                                ? 'No endorsements yet. Share your profile to get endorsed by people you\'ve worked with.'
                                : 'Be the first to endorse this expert.'}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Endorse Dialog */}
            <Dialog open={showEndorseDialog} onOpenChange={setShowEndorseDialog}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>Write an Endorsement</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="testimonial">
                                Your endorsement <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Textarea
                                id="testimonial"
                                value={testimonial}
                                onChange={(e) => setTestimonial(e.target.value)}
                                placeholder="Share your experience working with this person..."
                                maxLength={1000}
                                className="min-h-[120px]"
                                aria-required
                            />
                            <p className="text-xs text-muted-foreground">
                                {testimonial.length} / 1000 characters
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="relationship">
                                Your relationship (optional)
                            </Label>
                            <Input
                                id="relationship"
                                value={relationship}
                                onChange={(e) => setRelationship(e.target.value)}
                                placeholder="e.g., Client, Colleague, Hired via ForgeOS"
                                maxLength={100}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => setShowEndorseDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmitEndorsement}
                            disabled={isSubmitting || testimonial.trim().length < 10}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <ThumbsUp className="w-4 h-4 mr-2" />
                                    Submit Endorsement
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

/** Individual endorsement testimonial card */
function EndorsementCard({ endorsement }: { endorsement: Endorsement }) {
    return (
        <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            <UserAvatar
                name={endorsement.endorser_name || 'Anonymous'}
                role={endorsement.endorser_role as 'Founder' | 'Executive' | 'Apprentice' | undefined}
                size="sm"
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                        {endorsement.endorser_name}
                    </span>
                    {endorsement.relationship && (
                        <Badge variant="secondary" className="text-[10px]">
                            {endorsement.relationship}
                        </Badge>
                    )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    &ldquo;{endorsement.testimonial}&rdquo;
                </p>
            </div>
        </div>
    )
}
