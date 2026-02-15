"use client";

import { use, useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ArrowRight, ArrowLeft, TestTube2, Clock, Rocket, Sparkles } from "lucide-react";
import { signup, submitApplication } from "@/actions/signup";
import { getDemoAccountData, type DemoAccountData } from "@/actions/demo-accounts";

/**
 * Roles available during the trial period.
 * All other roles render a "Coming Soon" page instead of the signup form.
 */
const TRIAL_ROLES = ['founder', 'executive', 'apprentice'] as const;

/** Total founding member spots available */
const TOTAL_FOUNDING_SPOTS = 100;
/** Spots already claimed (update periodically or fetch from API) */
const SPOTS_CLAIMED = 53;

/**
 * ErrorMessage — Displays form errors from URL search params.
 */
function ErrorMessage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    
    if (!error) return null;
    
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert" 
            aria-live="polite"
            className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-lg flex items-center gap-3"
        >
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
            {decodeURIComponent(error)}
        </motion.div>
    );
}

interface RoleConfig {
    title: string;
    headline: string;
    subheadline: string;
    description: string;
    benefits: string[];
    heroImage: string;
    ctaText: string;
    isApplication: boolean;
    additionalFields?: { id: string; label: string; placeholder: string; type?: string; required?: boolean }[];
}

const roleConfigs: Record<string, RoleConfig> = {
    founder: {
        title: "FOUNDER",
        headline: "YOUR VISION. OUR OPERATING SYSTEM.",
        subheadline: "Start with an idea. Launch with an army. Keep your equity.",
        description: "Don't burn seed capital on a standing army. Your fractional team\u2014Executives who've built before and Apprentices with 10x output\u2014activates in hours, not months.",
        benefits: [
            "Fractional Execs + high-output Apprentices",
            "Your team scales up and down on demand",
            "Global manufacturing at your fingertips",
            "Legal and IP fortress included"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Begin Induction",
        isApplication: false,
        additionalFields: [
            { id: "company_name", label: "Company Name", placeholder: "Your startup name", required: true },
            { id: "industry", label: "Industry", placeholder: "Hardware, SaaS, DeepTech...", required: false },
            { id: "stage", label: "Stage", placeholder: "Pre-seed, Seed, Series A...", required: false }
        ]
    },
    executive: {
        title: "EXECUTIVE",
        headline: "YOUR EXPERTISE IS UNDERPRICED.",
        subheadline: "Deploy your skills where they matter. Build a portfolio of ventures.",
        description: "Politics steals 60% of your output. We give it back. Work with multiple startups, not one bureaucracy. No admin. Pure strategy. Real upside potential.",
        benefits: [
            "Work with multiple ventures simultaneously",
            "Equity opportunities as relationships develop",
            "No politics, no bureaucracy",
            "Choose your engagement level"
        ],
        heroImage: "/images/join/join-executive-hero.png",
        ctaText: "Join the Cadre",
        isApplication: false
    },
    apprentice: {
        title: "APPRENTICE",
        headline: "YOU'RE NOT JUNIOR.",
        subheadline: "You're Founder-in-Training. Your 10x toolkit awaits.",
        description: "ForgeOS multiplies your output 10x. Ship real hardware in your first month. Learn from executives who've done it.",
        benefits: [
            "10x your output from day one",
            "Ship real hardware in month one",
            "Direct mentorship from fractional execs",
            "Fast-track to the Founder track"
        ],
        heroImage: "/images/join/join-apprentice-hero.png",
        ctaText: "Enter the Guild",
        isApplication: false
    },
    vc: {
        title: "VENTURE CAPITAL",
        headline: "12 MONTHS \u2192 12 WEEKS.",
        subheadline: "Hardware at software speed. More bets. Better returns.",
        description: "Hardware typically has long validation cycles. We're building infrastructure to compress that timeline\u2014helping founders validate faster and VCs deploy capital more efficiently.",
        benefits: [
            "Access to hardware startups moving faster",
            "Transparent milestone tracking system",
            "Infrastructure to reduce validation time",
            "Network of fractional executives and makers"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Apply for Access",
        isApplication: true,
        additionalFields: [
            { id: "firm", label: "Firm Name", placeholder: "Acme Ventures" },
            { id: "aum", label: "AUM Range", placeholder: "\u00a310M - \u00a350M" }
        ]
    },
    factory: {
        title: "MANUFACTURING",
        headline: "CAPACITY IS CURRENCY.",
        subheadline: "Pre-funded orders. Guaranteed payment. Zero invoicing friction.",
        description: "Connect to hardware startups with money already in escrow. Every order is pre-funded\u2014you get paid automatically when you ship. No quotes. No invoicing. No payment risk.",
        benefits: [
            "Every order is pre-funded in escrow",
            "Automatic payment on delivery confirmation",
            "Zero payment risk - money held before you start",
            "No invoicing, no chasing payments"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Connect Facility",
        isApplication: true,
        additionalFields: [
            { id: "facility", label: "Facility Name", placeholder: "Precision Manufacturing Co." },
            { id: "capabilities", label: "Capabilities", placeholder: "CNC, 3D Printing, Sheet Metal..." }
        ]
    },
    supplier: {
        title: "SUPPLIER",
        headline: "SELL ON THE MARKETPLACE.",
        subheadline: "List your products. Get discovered. Grow your business.",
        description: "Join our marketplace to reach hardware startups and builders. List your products, services, or capacity. Respond to RFQs, manage orders, and get paid\u2014all from your dedicated Supplier Portal.",
        benefits: [
            "List unlimited products and services",
            "Respond to qualified RFQ opportunities",
            "Manage orders from one dashboard",
            "Get paid through secure escrow"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Start Selling",
        isApplication: false,
        additionalFields: [
            { id: "business_name", label: "Business Name", placeholder: "Your Company Ltd.", required: true },
            { id: "business_type", label: "What do you sell?", placeholder: "Products, Services, Manufacturing...", required: false }
        ]
    },
    university: {
        title: "ACADEMIA",
        headline: "FROM PAPER TO PRODUCT.",
        subheadline: "Professors become founders. Students become Apprentices. Research becomes revenue.",
        description: "We provide the commercialisation pathway for academic research. Professors can lead their own ventures. Students gain real startup experience or launch companies. Your institution gets the infrastructure to turn IP into thriving businesses.",
        benefits: [
            "Professors lead their own venture-backed companies",
            "Students become Apprentices or post-grad founders",
            "Turn research IP into commercial products",
            "Infrastructure for university venture units"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Partner With Us",
        isApplication: true,
        additionalFields: [
            { id: "institution", label: "Institution", placeholder: "Imperial, Cambridge, UCL...", required: true },
            { id: "department", label: "Department/School", placeholder: "Engineering, Business...", required: false }
        ]
    },
    network: {
        title: "NETWORK PARTNER",
        headline: "JOIN THE GRID.",
        subheadline: "Connect your resources to ForgeOS.",
        description: "Manufacturing, logistics, communications\u2014connect your physical or digital infrastructure to the network. Consistent deal flow. Automated everything.",
        benefits: [
            "Consistent deal flow",
            "Automated contracting",
            "Global reach",
            "Standardised integration"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Apply to Network",
        isApplication: true
    },
    general: {
        title: "FORGE OS",
        headline: "BUILD ATOMS AT THE SPEED OF BITS.",
        subheadline: "The operating system for physical creation.",
        description: "Hardware at software speed. A fraction of the cost. A fraction of the time. A fraction of the headcount.",
        benefits: [
            "High-velocity workflows",
            "Global manufacturing network",
            "Distributed industrial complex",
            "Scale from Day 1"
        ],
        heroImage: "/images/join/join-founder-hero.png",
        ctaText: "Get Started",
        isApplication: false
    }
};

/**
 * FoundingMemberCounter -- Animated progress bar showing remaining spots.
 */
function FoundingMemberCounter() {
    const spotsRemaining = TOTAL_FOUNDING_SPOTS - SPOTS_CLAIMED;
    const percentClaimed = (SPOTS_CLAIMED / TOTAL_FOUNDING_SPOTS) * 100;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-8 p-4 rounded-xl bg-muted/50 border"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-international-orange" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Founding Members
                    </span>
                </div>
                <span className="text-xs font-bold text-international-orange">
                    {spotsRemaining} of {TOTAL_FOUNDING_SPOTS} spots left
                </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentClaimed}%` }}
                    transition={{ duration: 1.2, delay: 1.0, ease: 'easeOut' }}
                    className="h-full bg-international-orange rounded-full"
                />
            </div>
        </motion.div>
    );
}

/**
 * "Coming Soon" page for roles not included in the current trial.
 * Light-first design matching brand aesthetic.
 */
function ComingSoonPage({ roleTitle }: { roleTitle: string }) {
    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Navigation */}
            <nav className="px-4 sm:px-6 py-4 sm:py-6">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="text-muted-foreground hover:text-foreground text-sm font-mono uppercase tracking-widest flex items-center gap-2 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Link>
                    <Link href="/login" className="text-muted-foreground hover:text-international-orange text-sm font-mono uppercase tracking-widest transition-colors">
                        Already a member? Login
                    </Link>
                </div>
            </nav>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="max-w-2xl mx-auto space-y-8"
                >
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-international-orange/30 bg-status-warning-light rounded-full">
                        <Clock className="w-4 h-4 text-international-orange" />
                        <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
                            Coming Soon
                        </span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight text-foreground">
                        {roleTitle} Access Is Coming
                    </h1>
                    <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mx-auto">
                        We&apos;re building something special for {roleTitle.toLowerCase()}s. 
                        In the meantime, you can join ForgeOS as one of our core roles:
                    </p>

                    {/* Available roles */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                        {[
                            { role: 'founder', label: 'Founder', desc: 'Build your venture', icon: Rocket },
                            { role: 'executive', label: 'Executive', desc: 'Deploy your expertise', icon: ArrowRight },
                            { role: 'apprentice', label: 'Apprentice', desc: '10x your output', icon: ArrowRight },
                        ].map(({ role, label, desc, icon: Icon }) => (
                            <Link
                                key={role}
                                href={`/join/${role}`}
                                className="group border hover:border-international-orange rounded-xl p-6 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 bg-card"
                            >
                                <Icon className="w-5 h-5 text-international-orange mb-3" />
                                <h3 className="font-bold text-foreground group-hover:text-international-orange transition-colors">
                                    {label}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                            </Link>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

/**
 * JoinPage -- Role-specific signup with light-first design, cinematic hook,
 * and founding member countdown.
 */
export default function JoinPage({ params }: { params: Promise<{ role: string }> }) {
    const resolvedParams = use(params);
    const roleKey = resolvedParams.role.toLowerCase();
    const config = roleConfigs[roleKey] || roleConfigs["general"];
    const searchParams = useSearchParams();
    const [stage, setStage] = useState<"hook" | "transitioning" | "form">("hook");
    const [fadeToBlack, setFadeToBlack] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Demo mode state
    const isDemoMode = searchParams.get('demo') === 'true';
    const [demoData, setDemoData] = useState<DemoAccountData | null>(null);

    // Gate non-trial roles to "Coming Soon" page
    const isTrialRole = (TRIAL_ROLES as readonly string[]).includes(roleKey);
    if (!isTrialRole) {
        return <ComingSoonPage roleTitle={config.title} />;
    }

    // Check if this role has a video (currently only founder)
    const hasVideo = roleKey === "founder";

    // Handle the cinematic transition
    const handleBeginInduction = () => {
        if (hasVideo) {
            setStage("transitioning");
            
            // After video expands (1s), fade to white
            setTimeout(() => {
                setFadeToBlack(true);
            }, 1000);
            
            // After fade completes (1s more), show form
            setTimeout(() => {
                setStage("form");
                setFadeToBlack(false);
            }, 2000);
        } else {
            setStage("form");
        }
    };

    // Fetch demo data if in demo mode
    useEffect(() => {
        if (isDemoMode) {
            getDemoAccountData(roleKey).then(data => {
                setDemoData(data);
            });
        }
    }, [isDemoMode, roleKey]);

    // Ensure video plays on mount
    useEffect(() => {
        if (videoRef.current && hasVideo) {
            videoRef.current.play().catch(() => {
                // Autoplay might be blocked, that's okay
            });
        }
    }, [hasVideo]);

    return (
        <div className="min-h-screen bg-background text-foreground overflow-hidden">
            {/* Video Transition Overlay - Fades to white instead of black */}
            {hasVideo && stage === "transitioning" && (
                <div className="fixed inset-0 z-[100]">
                    <video
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                    >
                        <source src="/videos/founder-intro.mp4" type="video/mp4" />
                    </video>
                    {/* Fade to white overlay (light-first) */}
                    <div 
                        className={`absolute inset-0 bg-background transition-opacity duration-1000 ${
                            fadeToBlack ? "opacity-100" : "opacity-0"
                        }`}
                    />
                </div>
            )}

            {/* Navigation */}
            <nav className={`absolute top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-6 transition-opacity duration-500 ${
                stage === "transitioning" ? "opacity-0" : "opacity-100"
            }`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="text-muted-foreground hover:text-foreground text-sm font-mono uppercase tracking-widest flex items-center gap-2 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Link>
                    <Link href="/login" className="text-muted-foreground hover:text-international-orange text-sm font-mono uppercase tracking-widest transition-colors">
                        Already a member? Login
                    </Link>
                </div>
            </nav>

            {stage === "hook" || stage === "transitioning" ? (
                /* Stage 1: The Hook -- Light theme with hero image */
                <div className={`min-h-screen flex flex-col justify-center transition-opacity duration-500 ${
                    stage === "transitioning" ? "opacity-0" : "opacity-100"
                }`}>
                    {/* Hero Background */}
                    <div className="absolute inset-0 z-0">
                        {hasVideo ? (
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-cover opacity-30"
                                autoPlay
                                loop
                                muted
                                playsInline
                            >
                                <source src="/videos/founder-intro.mp4" type="video/mp4" />
                            </video>
                        ) : (
                            <Image
                                src={config.heroImage}
                                alt={config.title}
                                fill
                                className="object-cover opacity-20"
                                priority
                            />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/50" />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 text-center pt-20 pb-8">
                        {/* Protocol Badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            className="inline-flex items-center gap-2 mb-4 sm:mb-6 px-3 sm:px-4 py-2 border border-international-orange/30 bg-status-warning-light rounded-full"
                        >
                            <span className="w-2 h-2 rounded-full bg-international-orange animate-pulse" />
                            <span className="text-international-orange text-xs font-mono uppercase tracking-widest">
                                Induction Protocol: {config.title}
                            </span>
                        </motion.div>

                        {/* Main Headline */}
                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black leading-tight mb-3 sm:mb-4 max-w-4xl text-foreground"
                        >
                            {config.headline}
                        </motion.h1>

                        {/* Subheadline */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl leading-relaxed"
                        >
                            {config.subheadline}
                        </motion.p>

                        {/* CTA Button */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <Button
                                onClick={handleBeginInduction}
                                disabled={stage === "transitioning"}
                                className="group bg-international-orange text-white px-8 sm:px-12 py-4 sm:py-5 h-auto text-sm sm:text-base font-bold tracking-widest uppercase hover:bg-international-orange/90 transition-all duration-300 flex items-center gap-3 mb-8 sm:mb-10 disabled:opacity-50 shadow-lg hover:shadow-xl"
                            >
                                {config.ctaText}
                                <ArrowRight className="w-4 sm:w-5 h-4 sm:h-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                            </Button>
                        </motion.div>

                        {/* Founding Member Counter */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="w-full max-w-md"
                        >
                            <FoundingMemberCounter />
                        </motion.div>

                        {/* Benefits */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 1.0 }}
                            className="w-full max-w-4xl border-t mt-8 pt-6 sm:pt-8"
                        >
                            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4 text-center">What You Become</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 md:gap-12 max-w-3xl mx-auto">
                                {config.benefits.map((benefit, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 1.1 + index * 0.1 }}
                                        className="flex items-start gap-3 justify-center sm:justify-start"
                                    >
                                        <div className="mt-0.5 w-5 h-5 rounded-full bg-international-orange/10 flex items-center justify-center shrink-0" aria-hidden="true">
                                            <Check className="w-3 h-3 text-international-orange" />
                                        </div>
                                        <span className="text-muted-foreground text-sm">{benefit}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </div>
            ) : (
                /* Stage 2: The Form -- Light split-screen */
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    className="min-h-screen flex flex-col md:flex-row"
                >
                    {/* Left: Context with Hero Image */}
                    <div className="w-full md:w-1/2 relative overflow-hidden bg-muted">
                        {hasVideo ? (
                            <video
                                className="absolute inset-0 w-full h-full object-cover opacity-40"
                                autoPlay
                                loop
                                muted
                                playsInline
                            >
                                <source src="/videos/founder-intro.mp4" type="video/mp4" />
                            </video>
                        ) : (
                            <Image
                                src={config.heroImage}
                                alt={config.title}
                                fill
                                className="object-cover opacity-30"
                            />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
                        <div className="relative z-10 p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center min-h-[40vh] md:min-h-screen">
                            <Button
                                variant="ghost"
                                onClick={() => setStage("hook")}
                                className="text-muted-foreground hover:text-foreground hover:bg-transparent text-sm font-mono uppercase tracking-widest flex items-center gap-2 mb-6 sm:mb-8 w-fit p-0 h-auto"
                            >
                                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                                Back
                            </Button>
                            <span className="text-xs font-mono text-international-orange tracking-widest mb-3 sm:mb-4 block uppercase">
                                {config.isApplication ? "Application" : "Induction"}: {config.title}
                            </span>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6 leading-tight text-foreground">
                                {config.headline}
                            </h2>
                            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-md">
                                {config.description}
                            </p>

                            {/* Founding member counter on form stage too */}
                            <FoundingMemberCounter />
                        </div>
                    </div>

                    {/* Right: Form */}
                    <div className="w-full md:w-1/2 bg-background text-foreground p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="w-full max-w-md mx-auto space-y-6 sm:space-y-8"
                        >
                            {/* Error Message */}
                            <Suspense fallback={null}>
                                <ErrorMessage />
                            </Suspense>
                            
                            {/* Demo Mode Banner */}
                            {isDemoMode && demoData && (
                                <div className="bg-status-info-light border border-status-info rounded-lg p-4 flex items-start gap-3">
                                    <TestTube2 className="h-5 w-5 text-status-info mt-0.5 shrink-0" aria-hidden="true" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground mb-1">Demo Mode Active</h3>
                                        <p className="text-xs text-muted-foreground">
                                            All fields are pre-populated with demo data. Just click &quot;{config.ctaText}&quot; to test the flow!
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                                    {config.isApplication ? "Apply for consideration" : "Create your account"}
                                </h2>
                                <p className="text-muted-foreground mt-2 text-sm">
                                    {config.isApplication 
                                        ? "We review every application personally." 
                                        : "Enter your details to begin the induction."}
                                </p>
                            </div>

                            <form action={config.isApplication ? submitApplication : signup} className="space-y-4 sm:space-y-5">
                                <input type="hidden" name="role" value={roleKey} />
                                
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-sm font-medium text-foreground">
                                        Full Name
                                        <span className="text-destructive ml-1" aria-label="required">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="John Doe"
                                        defaultValue={demoData?.fullName || ""}
                                        className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                                        required
                                        aria-required="true"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm font-medium text-foreground">
                                        Email
                                        <span className="text-destructive ml-1" aria-label="required">*</span>
                                    </Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        defaultValue={demoData?.email || ""}
                                        className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                                        required
                                        aria-required="true"
                                    />
                                </div>

                                {/* Additional fields */}
                                {config.additionalFields?.map((field) => {
                                    const demoValue = demoData ? (() => {
                                        switch(field.id) {
                                            case 'company_name': return demoData.companyName;
                                            case 'industry': return demoData.industry;
                                            case 'stage': return demoData.stage;
                                            case 'firm': return demoData.firm;
                                            case 'aum': return demoData.aum;
                                            case 'capabilities': return demoData.capabilities;
                                            case 'location': return demoData.location;
                                            case 'institution': return demoData.institution;
                                            case 'department': return demoData.department;
                                            default: return '';
                                        }
                                    })() : '';
                                    
                                    return (
                                        <div key={field.id} className="space-y-2">
                                            <Label htmlFor={field.id} className="text-sm font-medium text-foreground">
                                                {field.label}
                                                {field.required && <span className="text-destructive ml-1" aria-label="required">*</span>}
                                            </Label>
                                            <Input
                                                id={field.id}
                                                name={field.id}
                                                type={field.type || "text"}
                                                placeholder={field.placeholder}
                                                defaultValue={demoValue}
                                                className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                                                required={field.required}
                                                aria-required={field.required}
                                            />
                                        </div>
                                    );
                                })}

                                {!config.isApplication && (
                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="text-sm font-medium text-foreground">
                                            Password
                                            <span className="text-destructive ml-1" aria-label="required">*</span>
                                        </Label>
                                        <Input
                                            id="password"
                                            name="password"
                                            type="password"
                                            placeholder="Create a strong password"
                                            defaultValue={demoData?.password || ""}
                                            className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                                            required
                                            aria-required="true"
                                            minLength={6}
                                            aria-describedby="password-hint"
                                        />
                                        <p id="password-hint" className="text-xs text-muted-foreground">
                                            Minimum 6 characters
                                        </p>
                                    </div>
                                )}

                                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                                    <Button 
                                        type="submit"
                                        className="w-full bg-international-orange hover:bg-international-orange/90 text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors shadow-lg hover:shadow-xl"
                                    >
                                        {config.ctaText}
                                    </Button>
                                </motion.div>
                            </form>

                            <p className="text-xs text-center text-muted-foreground">
                                By {config.isApplication ? "applying" : "joining"}, you agree to our{" "}
                                <Link href="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>{" "}
                                and{" "}
                                <Link href="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
                            </p>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
