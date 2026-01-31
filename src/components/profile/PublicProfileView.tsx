// @ts-nocheck
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PublicProfile } from '@/actions/public-profile'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
    Star, 
    MapPin, 
    Clock, 
    Briefcase,
    Award,
    ExternalLink,
    Linkedin,
    Globe,
    Play,
    Calendar,
    MessageCircle,
    CheckCircle2,
    TrendingUp,
    Quote,
    ChevronRight,
    Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeHref, sanitizeVideoEmbedUrl } from '@/lib/security/url-validation'

interface PublicProfileViewProps {
    profile: PublicProfile
}

const tierColors = {
    premium: 'bg-status-warning-light text-status-warning-dark border-status-warning',
    verified: 'bg-status-info-light text-status-info-dark border-status-info',
    standard: 'bg-muted text-muted-foreground border-muted',
    pending: 'bg-muted text-muted-foreground border-muted',
}

const tierLabels = {
    premium: 'Premium Partner',
    verified: 'Verified',
    standard: 'Provider',
    pending: 'New',
    verified_partner: 'Verified Partner',
    approved: 'Approved',
    suspended: 'Suspended',
}

export function PublicProfileView({ profile }: PublicProfileViewProps) {
    const [showVideo, setShowVideo] = useState(false)
    
    const formatCurrency = (amount: number | null) => {
        if (!amount) return null
        const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }
        return `${symbols[profile.currency] || ''}${amount.toLocaleString()}`
    }
    
    const initials = profile.user_name
        ?.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'EX'
    
    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row gap-8 mb-8">
                {/* Profile Card */}
                <div className="lg:w-1/3">
                    <Card className="sticky top-8">
                        <CardContent className="pt-6">
                            {/* Avatar and Basic Info */}
                            <div className="text-center mb-6">
                                <Avatar className="w-28 h-28 mx-auto mb-4 border-4 border-background shadow-lg">
                                    <AvatarImage src={profile.user_avatar || undefined} />
                                    <AvatarFallback className="text-2xl font-semibold bg-international-orange/10 text-international-orange">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                                
                                <h1 className="text-2xl font-bold text-foreground mb-1">
                                    {profile.user_name || 'Executive'}
                                </h1>
                                
                                {profile.headline && (
                                    <p className="text-muted-foreground text-sm mb-3">
                                        {profile.headline}
                                    </p>
                                )}
                                
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Badge 
                                        variant="outline" 
                                        className={cn(
                                            'text-xs',
                                            tierColors[profile.tier as keyof typeof tierColors] || tierColors.standard
                                        )}
                                    >
                                        {profile.tier === 'verified' || profile.tier === 'verified_partner' ? (
                                            <Shield className="w-3 h-3 mr-1" />
                                        ) : null}
                                        {tierLabels[profile.tier as keyof typeof tierLabels] || profile.tier}
                                    </Badge>
                                    
                                    {profile.average_rating && (
                                        <Badge variant="secondary" className="text-xs">
                                            <Star className="w-3 h-3 mr-1 fill-status-warning text-status-warning" />
                                            {profile.average_rating.toFixed(1)}
                                            <span className="text-muted-foreground ml-1">
                                                ({profile.total_reviews})
                                            </span>
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            
                            {/* Quick Stats */}
                            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
                                {profile.location && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <MapPin className="w-4 h-4" />
                                        <span>{profile.location}</span>
                                    </div>
                                )}
                                {profile.years_experience && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Briefcase className="w-4 h-4" />
                                        <span>{profile.years_experience}+ years</span>
                                    </div>
                                )}
                                {profile.timezone && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="w-4 h-4" />
                                        <span>{profile.timezone.replace('_', ' ')}</span>
                                    </div>
                                )}
                                {profile.total_transactions > 0 && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>{profile.total_transactions} completed</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Pricing */}
                            {(profile.day_rate || profile.hourly_rate) && (
                                <div className="bg-muted rounded-lg p-4 mb-6">
                                    <p className="text-xs text-muted-foreground mb-1">Starting from</p>
                                    {profile.day_rate && (
                                        <p className="text-2xl font-bold text-foreground">
                                            {formatCurrency(profile.day_rate)}
                                            <span className="text-sm font-normal text-muted-foreground">/day</span>
                                        </p>
                                    )}
                                    {profile.hourly_rate && (
                                        <p className="text-sm text-muted-foreground">
                                            or {formatCurrency(profile.hourly_rate)}/hour
                                        </p>
                                    )}
                                    {profile.accepts_trial && profile.trial_rate_discount > 0 && (
                                        <Badge variant="secondary" className="mt-2 text-xs">
                                            {profile.trial_rate_discount}% off trial engagements
                                        </Badge>
                                    )}
                                </div>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="space-y-2">
                                <Button className="w-full" asChild>
                                    <Link href={`/marketplace?provider=${profile.profile_slug}`}>
                                        <Calendar className="w-4 h-4 mr-2" />
                                        Book Discovery Call
                                    </Link>
                                </Button>
                                <Button variant="outline" className="w-full" asChild>
                                    <Link href={`/marketplace?provider=${profile.profile_slug}&action=message`}>
                                        <MessageCircle className="w-4 h-4 mr-2" />
                                        Send Message
                                    </Link>
                                </Button>
                            </div>
                            
                            {/* Social Links */}
                            {(profile.linkedin_url || profile.website_url) && (
                                <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t">
                                    {profile.linkedin_url && sanitizeHref(profile.linkedin_url) !== '#' && (
                                        <a 
                                            href={sanitizeHref(profile.linkedin_url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <Linkedin className="w-5 h-5" />
                                        </a>
                                    )}
                                    {profile.website_url && sanitizeHref(profile.website_url) !== '#' && (
                                        <a 
                                            href={sanitizeHref(profile.website_url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <Globe className="w-5 h-5" />
                                        </a>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                
                {/* Main Content */}
                <div className="lg:w-2/3 space-y-6">
                    {/* Video Introduction */}
                    {/* SECURITY: Only render video if URL is from allowed platforms */}
                    {profile.video_url && sanitizeVideoEmbedUrl(profile.video_url) && (
                        <Card>
                            <CardContent className="p-0">
                                {showVideo ? (
                                    <div className="aspect-video">
                                        <iframe
                                            src={sanitizeVideoEmbedUrl(profile.video_url)!}
                                            className="w-full h-full rounded-lg"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowVideo(true)}
                                        className="relative w-full aspect-video bg-foreground rounded-lg overflow-hidden group"
                                    >
                                        {profile.video_thumbnail_url ? (
                                            <img 
                                                src={profile.video_thumbnail_url} 
                                                alt="Video thumbnail"
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-foreground/90 to-foreground">
                                                <span className="text-muted-foreground">Video Introduction</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-background/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Play className="w-8 h-8 text-foreground ml-1" />
                                            </div>
                                        </div>
                                    </button>
                                )}
                            </CardContent>
                        </Card>
                    )}
                    
                    {/* Tabs */}
                    <Tabs defaultValue="about" className="w-full">
                        <TabsList className="w-full justify-start">
                            <TabsTrigger value="about">About</TabsTrigger>
                            {profile.case_studies.length > 0 && (
                                <TabsTrigger value="case-studies">
                                    Case Studies ({profile.case_studies.length})
                                </TabsTrigger>
                            )}
                            {profile.portfolio_items.length > 0 && (
                                <TabsTrigger value="portfolio">
                                    Portfolio ({profile.portfolio_items.length})
                                </TabsTrigger>
                            )}
                            {profile.certifications.length > 0 && (
                                <TabsTrigger value="credentials">Credentials</TabsTrigger>
                            )}
                        </TabsList>
                        
                        {/* About Tab */}
                        <TabsContent value="about" className="space-y-6 mt-6">
                            {profile.bio && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">About</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground whitespace-pre-wrap">
                                            {profile.bio}
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {profile.specializations.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Specializations</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.specializations.map((spec, i) => (
                                                <Badge key={i} variant="secondary">{spec}</Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {profile.industries.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Industries</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.industries.map((ind, i) => (
                                                <Badge key={i} variant="outline">{ind}</Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {profile.company_stages.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Company Stages</CardTitle>
                                        <CardDescription>Experience working with companies at these stages</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.company_stages.map((stage, i) => (
                                                <Badge key={i} variant="outline">{stage}</Badge>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {/* Badges */}
                            {profile.badges.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Achievements</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-3">
                                            {profile.badges.map((badge, i) => (
                                                <div 
                                                    key={i}
                                                    className="flex items-center gap-2 px-3 py-2 bg-status-warning-light border border-status-warning rounded-lg"
                                                >
                                                    <Award className="w-4 h-4 text-status-warning" />
                                                    <span className="text-sm font-medium text-status-warning-dark">
                                                        {badge.badge_type.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                        
                        {/* Case Studies Tab */}
                        <TabsContent value="case-studies" className="space-y-6 mt-6">
                            {profile.case_studies.map((cs) => (
                                <Card key={cs.id} className={cn(cs.is_featured && 'border-status-warning bg-status-warning-light/30')}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                {cs.is_featured && (
                                                    <Badge variant="secondary" className="mb-2 bg-status-warning-light text-status-warning-dark">
                                                        Featured
                                                    </Badge>
                                                )}
                                                <CardTitle className="text-lg">{cs.title}</CardTitle>
                                                <CardDescription className="flex items-center gap-2 mt-1">
                                                    {cs.client_name && <span>{cs.client_name}</span>}
                                                    {cs.client_industry && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{cs.client_industry}</span>
                                                        </>
                                                    )}
                                                    {cs.engagement_type && (
                                                        <>
                                                            <span>•</span>
                                                            <Badge variant="outline" className="text-xs capitalize">
                                                                {cs.engagement_type}
                                                            </Badge>
                                                        </>
                                                    )}
                                                </CardDescription>
                                            </div>
                                            {cs.client_logo_url && (
                                                <img 
                                                    src={cs.client_logo_url} 
                                                    alt={cs.client_name || 'Client'}
                                                    className="h-10 object-contain"
                                                />
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-1">Challenge</h4>
                                            <p className="text-sm">{cs.challenge}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-1">Approach</h4>
                                            <p className="text-sm">{cs.approach}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-1">Outcome</h4>
                                            <p className="text-sm">{cs.outcome}</p>
                                        </div>
                                        
                                        {/* Metrics */}
                                        {cs.metrics && cs.metrics.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t">
                                                {cs.metrics.map((metric, i) => (
                                                    <div key={i} className="text-center p-3 bg-muted rounded-lg">
                                                        <p className="text-2xl font-bold text-foreground">
                                                            {metric.value}
                                                            {metric.change_percent && (
                                                                <span className="text-sm text-status-success ml-1">
                                                                    <TrendingUp className="w-3 h-3 inline" />
                                                                    {metric.change_percent}%
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Testimonial */}
                                        {cs.testimonial_quote && (
                                            <div className="bg-muted rounded-lg p-4 mt-4">
                                                <Quote className="w-5 h-5 text-muted-foreground mb-2" />
                                                <p className="text-sm italic mb-2">"{cs.testimonial_quote}"</p>
                                                {cs.testimonial_author && (
                                                    <p className="text-xs text-muted-foreground">
                                                        — {cs.testimonial_author}
                                                        {cs.testimonial_role && `, ${cs.testimonial_role}`}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </TabsContent>
                        
                        {/* Portfolio Tab */}
                        <TabsContent value="portfolio" className="mt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {profile.portfolio_items.map((item) => (
                                    <Card key={item.id} className={cn(item.is_featured && 'border-status-warning')}>
                                        {item.image_urls[0] && (
                                            <div className="aspect-video overflow-hidden rounded-t-lg">
                                                <img 
                                                    src={item.image_urls[0]} 
                                                    alt={item.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        <CardContent className="pt-4">
                                            <h3 className="font-semibold mb-1">{item.title}</h3>
                                            {item.description && (
                                                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                {item.client_name && <span>{item.client_name}</span>}
                                                {item.project_url && (
                                                    <a 
                                                        href={item.project_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 hover:text-foreground"
                                                    >
                                                        View <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                        
                        {/* Credentials Tab */}
                        <TabsContent value="credentials" className="space-y-4 mt-6">
                            {profile.certifications.map((cert) => (
                                <Card key={cert.id}>
                                    <CardContent className="flex items-center gap-4 py-4">
                                        <div className={cn(
                                            'w-12 h-12 rounded-lg flex items-center justify-center',
                                            cert.is_verified ? 'bg-status-success-light' : 'bg-muted'
                                        )}>
                                            <Award className={cn(
                                                'w-6 h-6',
                                                cert.is_verified ? 'text-status-success' : 'text-muted-foreground'
                                            )} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{cert.certification_name}</h3>
                                                {cert.is_verified && (
                                                    <Badge variant="secondary" className="text-xs bg-status-success-light text-status-success-dark">
                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                        Verified
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{cert.issuing_body}</p>
                                            {cert.expiry_date && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Expires: {new Date(cert.expiry_date).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                        {cert.verification_url && (
                                            <a
                                                href={cert.verification_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}
