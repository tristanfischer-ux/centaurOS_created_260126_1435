'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { 
  User, Briefcase, DollarSign, MapPin, Clock, Linkedin, Globe, 
  Star, CheckCircle2, AlertCircle, ArrowRight, Eye, Edit3, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { updateMarketplaceProfile, generateBioTemplate } from '@/actions/profile-hub'
import { ListingOptimizer } from './listing-optimizer'

interface ProfileHubData {
  profile: {
    id: string
    email: string
    full_name: string | null
    role: string
    avatar_url: string | null
    account_type: string | null
    onboarding_data: Record<string, unknown> | null
    created_at: string
  } | null
  providerProfile: {
    id: string
    headline: string | null
    bio: string | null
    day_rate: number | null
    hourly_rate: number | null
    currency: string | null
    tier: string | null
    location: string | null
    years_experience: number | null
    specializations: string[] | null
    industries: string[] | null
    company_stages: string[] | null
    profile_slug: string | null
    is_public: boolean | null
    video_url: string | null
    linkedin_url: string | null
    website_url: string | null
    is_active: boolean | null
    listing_id: string | null
    stripe_onboarding_complete: boolean | null
    max_concurrent_orders: number | null
    timezone: string | null
  } | null
  listing: {
    id: string
    title: string | null
    description: string | null
    category: string | null
    subcategory: string | null
    image_url: string | null
    approval_status: string | null
  } | null
  strength: {
    score: number
    sections: Array<{
      name: string
      weight: number
      completed: boolean
      suggestion: string
    }>
  }
  isProvider: boolean
}

export function ProfileHubView({ data }: { data: ProfileHubData }) {
  const { profile, providerProfile, strength } = data
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [bioTemplate, setBioTemplate] = useState('')
  const router = useRouter()

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await updateMarketplaceProfile(formData)
      if (result.success) {
        setIsEditing(false)
        router.refresh()
      }
    })
  }

  async function handleGenerateBioTemplate() {
    const template = await generateBioTemplate(profile?.role || 'Executive')
    setBioTemplate(template)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage how you appear on the marketplace. A complete profile gets more opportunities.
          </p>
        </div>
        <div className="flex gap-2">
          {data.isProvider && providerProfile?.profile_slug && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/profile/${providerProfile.profile_slug}`} target="_blank" rel="noopener">
                <Eye className="h-4 w-4 mr-2" />
                View Public Profile
              </a>
            </Button>
          )}
          <Button 
            size="sm" 
            onClick={() => setIsEditing(!isEditing)}
            variant={isEditing ? 'outline' : 'default'}
            className={!isEditing ? 'bg-international-orange hover:bg-international-orange/90' : ''}
          >
            <Edit3 className="h-4 w-4 mr-2" />
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </Button>
        </div>
      </div>

      {/* Profile Strength */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Star className="h-5 w-5 text-international-orange" />
            Profile Strength
          </h2>
          <span className={cn(
            "text-2xl font-bold",
            strength.score >= 80 ? "text-emerald-600" :
            strength.score >= 50 ? "text-amber-600" :
            "text-red-600"
          )}>
            {strength.score}%
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full mb-6 overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              strength.score >= 80 ? "bg-emerald-500" :
              strength.score >= 50 ? "bg-amber-500" :
              "bg-red-500"
            )}
            style={{ width: `${strength.score}%` }}
          />
        </div>

        {/* Section checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {strength.sections.map((section) => (
            <div 
              key={section.name}
              className={cn(
                "flex items-start gap-3 p-3 rounded-md",
                section.completed ? "bg-emerald-50" : "bg-amber-50"
              )}
            >
              {section.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-sm font-medium text-foreground">{section.name}</div>
                {!section.completed && (
                  <p className="text-xs text-muted-foreground mt-0.5">{section.suggestion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Profile Editor */}
      {isEditing ? (
        <form action={handleSave} className="space-y-6">
          {/* Headline */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-international-orange" />
              Professional Headline
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Your headline is the first thing buyers see. Make it specific and compelling.
            </p>
            <Input
              name="headline"
              defaultValue={providerProfile?.headline || ''}
              placeholder='e.g., "Fractional CFO | Helping hardware startups scale from seed to Series B"'
              maxLength={100}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground mt-1">Max 100 characters</p>
          </div>

          {/* Bio */}
          <div className="rounded-lg border bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-international-orange" />
                About You
              </h3>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleGenerateBioTemplate}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Get Template
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Tell your story. What problems do you solve? What makes you different?
              Aim for 150-300 words.
            </p>
            <Textarea
              name="bio"
              defaultValue={bioTemplate || providerProfile?.bio || ''}
              placeholder="I help [type of company] achieve [outcome] by [method]..."
              rows={8}
              maxLength={2000}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Max 2000 characters</p>
          </div>

          {/* Rates & Availability */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-international-orange" />
              Rates & Availability
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Setting rates helps buyers filter and find you quickly.
              Executives in your category typically charge GBP 800-1,500/day.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Day Rate</Label>
                <Input
                  name="dayRate"
                  type="number"
                  defaultValue={providerProfile?.day_rate || ''}
                  placeholder="1000"
                  min={0}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Currency</Label>
                <select
                  name="currency"
                  defaultValue={providerProfile?.currency || 'GBP'}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="GBP">GBP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Years Experience</Label>
                <Input
                  name="yearsExperience"
                  type="number"
                  defaultValue={providerProfile?.years_experience || ''}
                  placeholder="10"
                  min={0}
                  max={50}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Location & Links */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-international-orange" />
              Location & Links
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location
                </Label>
                <Input
                  name="location"
                  defaultValue={providerProfile?.location || ''}
                  placeholder="London, UK"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Timezone
                </Label>
                <Input
                  name="timezone"
                  defaultValue={providerProfile?.timezone || ''}
                  placeholder="Europe/London"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Linkedin className="h-3 w-3" /> LinkedIn URL
                </Label>
                <Input
                  name="linkedinUrl"
                  type="url"
                  defaultValue={providerProfile?.linkedin_url || ''}
                  placeholder="https://linkedin.com/in/yourname"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Website
                </Label>
                <Input
                  name="websiteUrl"
                  type="url"
                  defaultValue={providerProfile?.website_url || ''}
                  placeholder="https://yoursite.com"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Skills & Specializations */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-international-orange" />
              Skills & Specializations
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Add skills separated by commas. These help buyers find you when searching.
            </p>
            <Input
              name="specializations"
              defaultValue={providerProfile?.specializations?.join(', ') || ''}
              placeholder="Financial Planning, Fundraising, Board Management, M&A"
            />
          </div>

          {/* Save */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isPending}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              {isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      ) : (
        /* Profile Display (Read Mode) */
        <div className="space-y-6">
          {/* Current Profile Summary */}
          <div className="rounded-lg border bg-white p-6">
            <div className="flex items-start gap-4">
              {/* Avatar placeholder */}
              <div className="h-16 w-16 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                <User className="h-8 w-8 text-international-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-foreground">
                  {profile?.full_name || 'Your Name'}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {providerProfile?.headline || 'No headline set — add one to stand out'}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
                    {profile?.role}
                  </span>
                  {providerProfile?.location && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {providerProfile.location}
                    </span>
                  )}
                  {providerProfile?.day_rate && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      {providerProfile.currency || 'GBP'} {providerProfile.day_rate}/day
                    </span>
                  )}
                </div>
              </div>
            </div>

            {providerProfile?.bio && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-sm font-semibold text-foreground mb-2">About</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{providerProfile.bio}</p>
              </div>
            )}

            {providerProfile?.specializations && providerProfile.specializations.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-foreground mb-2">Specializations</h3>
                <div className="flex flex-wrap gap-1.5">
                  {providerProfile.specializations.map((skill) => (
                    <span
                      key={skill}
                      className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-md"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Listing Optimizer (for providers and suppliers) */}
          {(data.isProvider || profile?.account_type === 'supplier') && (
            <ListingOptimizer listing={data.listing} />
          )}

          {/* Quick Actions */}
          {strength.score < 80 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
              <h3 className="text-base font-semibold text-foreground mb-2">
                Complete your profile to get discovered
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Profiles with 80%+ completion get significantly more views and opportunities.
              </p>
              <Button 
                onClick={() => setIsEditing(true)}
                className="bg-international-orange hover:bg-international-orange/90"
                size="sm"
              >
                Complete Profile
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
