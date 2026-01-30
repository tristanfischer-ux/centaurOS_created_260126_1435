'use client';

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ShieldCheck, MapPin, Briefcase, Clock, DollarSign } from "lucide-react";

interface MarketplaceListing {
    id: string;
    title: string;
    description: string;
    category: string;
    subcategory: string;
    is_verified: boolean;
    attributes: Record<string, any>;
}

interface MarketplacePreviewSectionProps {
    listings: MarketplaceListing[];
    onBookClick?: (listingId: string) => void;
}

export function MarketplacePreviewSection({ listings, onBookClick }: MarketplacePreviewSectionProps) {
    if (!listings || listings.length === 0) {
        return null;
    }

    return (
        <div className="w-full max-w-4xl border-t border-white/10 pt-8 mt-8">
            <div className="mb-6 text-center">
                <h2 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">
                    Available Now
                </h2>
                <p className="text-white/60 text-sm max-w-2xl mx-auto">
                    Your network is ready. Browse talent, tools, and capacity waiting to amplify your work.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {listings.map((listing) => (
                    <Card 
                        key={listing.id} 
                        className="bg-muted/50 border-white/10 hover:border-blue-500/30 transition-all duration-300 group"
                    >
                        <CardContent className="p-4">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-3">
                                <Badge 
                                    variant="secondary" 
                                    className="uppercase text-[10px] tracking-wider font-semibold border-blue-500/30 bg-blue-500/10 text-blue-400"
                                >
                                    {listing.subcategory}
                                </Badge>
                                {listing.is_verified && (
                                    <ShieldCheck className="w-4 h-4 text-emerald-400" aria-label="Verified" />
                                )}
                            </div>

                            {/* Title */}
                            <h3 className="text-base font-bold text-white mb-2 line-clamp-1">
                                {listing.title}
                            </h3>

                            {/* Role for People */}
                            {listing.category === 'People' && listing.attributes?.role && (
                                <p className="text-sm text-white/60 mb-2 line-clamp-1">
                                    {listing.attributes.role}
                                </p>
                            )}

                            {/* Description */}
                            <p className="text-sm text-white/50 mb-4 line-clamp-2">
                                {listing.description}
                            </p>

                            {/* Quick Info */}
                            <div className="flex flex-wrap gap-2 text-xs text-white/40 mb-4">
                                {listing.attributes?.location && (
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        <span>{listing.attributes.location}</span>
                                    </div>
                                )}
                                {listing.attributes?.years_experience && (
                                    <div className="flex items-center gap-1">
                                        <Briefcase className="w-3 h-3" />
                                        <span>{listing.attributes.years_experience} yrs</span>
                                    </div>
                                )}
                                {listing.attributes?.lead_time && (
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{listing.attributes.lead_time}</span>
                                    </div>
                                )}
                            </div>

                            {/* Rate */}
                            {(listing.attributes?.rate || listing.attributes?.cost) && (
                                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                    <span className="text-xs text-white/40">Rate</span>
                                    <span className="text-sm font-bold text-white">
                                        {listing.attributes.rate || listing.attributes.cost}
                                    </span>
                                </div>
                            )}

                            {/* Book button */}
                            {onBookClick && (
                                <Button
                                    onClick={() => onBookClick(listing.id)}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-3 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 group-hover:bg-blue-500/10"
                                >
                                    Book Now
                                    <ArrowRight className="w-3 h-3 ml-2" />
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {listings.length > 0 && (
                <div className="text-center mt-6">
                    <Button
                        variant="ghost"
                        className="text-white/60 hover:text-white text-sm font-mono uppercase tracking-widest"
                        asChild
                    >
                        <a href="/marketplace">
                            View Full Marketplace
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </a>
                    </Button>
                </div>
            )}
        </div>
    );
}

export function PreviewSkeleton() {
    return (
        <div className="w-full max-w-4xl border-t border-white/10 pt-8 mt-8">
            <div className="mb-6 text-center">
                <div className="h-4 w-32 bg-white/5 rounded mx-auto mb-2 animate-pulse" />
                <div className="h-4 w-64 bg-white/5 rounded mx-auto animate-pulse" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="bg-muted/50 border-white/10">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-3">
                                <div className="h-5 w-20 bg-white/5 rounded animate-pulse" />
                                <div className="h-4 w-4 bg-white/5 rounded animate-pulse" />
                            </div>
                            <div className="h-5 w-full bg-white/5 rounded mb-2 animate-pulse" />
                            <div className="h-4 w-3/4 bg-white/5 rounded mb-2 animate-pulse" />
                            <div className="h-4 w-full bg-white/5 rounded mb-4 animate-pulse" />
                            <div className="flex gap-2 mb-4">
                                <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                                <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                            </div>
                            <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
