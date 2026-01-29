"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select"
import { submitProviderApplication } from "@/actions/provider"
import { 
    Store, 
    ArrowRight, 
    ArrowLeft,
    Loader2, 
    CheckCircle2,
    AlertCircle,
    Users,
    Package,
    Briefcase,
    Bot,
    X
} from "lucide-react"
import { cn } from "@/lib/utils"

const categories = [
    { 
        value: "People", 
        label: "People", 
        icon: Users,
        description: "Offer your skills as a consultant, contractor, or freelancer"
    },
    { 
        value: "Products", 
        label: "Products", 
        icon: Package,
        description: "Sell physical products, hardware, or equipment"
    },
    { 
        value: "Services", 
        label: "Services", 
        icon: Briefcase,
        description: "Provide business services like manufacturing, logistics, etc."
    },
    { 
        value: "AI", 
        label: "AI", 
        icon: Bot,
        description: "Offer AI tools, integrations, or automation services"
    },
]

const availabilityOptions = [
    { value: "full-time", label: "Full-time (40+ hrs/week)" },
    { value: "part-time", label: "Part-time (20-40 hrs/week)" },
    { value: "limited", label: "Limited (< 20 hrs/week)" },
    { value: "project", label: "Project-based only" },
]

const pricingModels = [
    { value: "hourly", label: "Hourly rate" },
    { value: "daily", label: "Day rate" },
    { value: "project", label: "Per project" },
    { value: "retainer", label: "Monthly retainer" },
    { value: "product", label: "Product pricing (fixed)" },
]

export default function ProviderApplicationPage() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [step, setStep] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)

    // Form state
    const [category, setCategory] = useState("")
    const [companyName, setCompanyName] = useState("")
    const [experience, setExperience] = useState("")
    const [capabilities, setCapabilities] = useState<string[]>([])
    const [newCapability, setNewCapability] = useState("")
    const [pricingModel, setPricingModel] = useState("")
    const [availability, setAvailability] = useState("")
    const [portfolioUrl, setPortfolioUrl] = useState("")
    const [linkedinUrl, setLinkedinUrl] = useState("")

    const addCapability = () => {
        if (newCapability.trim() && capabilities.length < 10) {
            setCapabilities([...capabilities, newCapability.trim()])
            setNewCapability("")
        }
    }

    const removeCapability = (index: number) => {
        setCapabilities(capabilities.filter((_, i) => i !== index))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            addCapability()
        }
    }

    const handleSubmit = () => {
        setError(null)
        
        startTransition(async () => {
            const result = await submitProviderApplication({
                category,
                company_name: companyName || undefined,
                experience,
                capabilities,
                pricing_model: pricingModel,
                availability,
                portfolio_url: portfolioUrl || undefined,
                linkedin_url: linkedinUrl || undefined,
            })

            if (result.error) {
                setError(result.error)
            } else {
                setSubmitted(true)
            }
        })
    }

    const canProceed = () => {
        switch (step) {
            case 1:
                return category !== ""
            case 2:
                return experience.length >= 50 && capabilities.length >= 1
            case 3:
                return pricingModel !== "" && availability !== ""
            default:
                return false
        }
    }

    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <Card className="text-center">
                    <CardContent className="pt-12 pb-8">
                        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold mb-2">Application Submitted!</h1>
                        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            Thank you for applying to become a provider on CentaurOS Marketplace.
                            We&apos;ll review your application and get back to you within 2-3 business days.
                        </p>
                        <div className="space-y-3">
                            <Button onClick={() => router.push("/marketplace")}>
                                Browse Marketplace
                            </Button>
                            <p className="text-sm text-muted-foreground">
                                You&apos;ll receive an email notification when your application is reviewed.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-8">
            {/* Progress indicator */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Step {step} of 3</span>
                    <span className="text-sm text-muted-foreground">
                        {step === 1 && "Category Selection"}
                        {step === 2 && "About You"}
                        {step === 3 && "Pricing & Availability"}
                    </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-international-orange transition-all duration-300 rounded-full"
                        style={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>
            </div>

            <Card>
                <CardHeader className="text-center">
                    <div className="mx-auto w-14 h-14 bg-international-orange/10 rounded-full flex items-center justify-center mb-4">
                        <Store className="h-7 w-7 text-international-orange" />
                    </div>
                    <CardTitle className="text-2xl">Become a Provider</CardTitle>
                    <CardDescription>
                        Join the CentaurOS Marketplace and connect with innovative foundries
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200">
                            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Step 1: Category Selection */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <Label className="text-base">What type of provider are you?</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {categories.map((cat) => {
                                    const Icon = cat.icon
                                    return (
                                        <button
                                            key={cat.value}
                                            onClick={() => setCategory(cat.value)}
                                            className={cn(
                                                "p-4 rounded-lg border-2 text-left transition-all",
                                                "hover:border-international-orange/50 hover:bg-slate-50",
                                                category === cat.value 
                                                    ? "border-international-orange bg-international-orange/5" 
                                                    : "border-slate-200"
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    "p-2 rounded-lg",
                                                    category === cat.value 
                                                        ? "bg-international-orange/10" 
                                                        : "bg-slate-100"
                                                )}>
                                                    <Icon className={cn(
                                                        "h-5 w-5",
                                                        category === cat.value 
                                                            ? "text-international-orange" 
                                                            : "text-slate-600"
                                                    )} />
                                                </div>
                                                <div>
                                                    <p className="font-medium">{cat.label}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {cat.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 2: About You */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="companyName">Company Name (optional)</Label>
                                <Input
                                    id="companyName"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    placeholder="Leave blank if operating as individual"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="experience">
                                    Experience & Background <span className="text-red-500">*</span>
                                </Label>
                                <Textarea
                                    id="experience"
                                    value={experience}
                                    onChange={(e) => setExperience(e.target.value)}
                                    placeholder="Tell us about your experience, background, and what makes you a great provider..."
                                    className="min-h-[150px]"
                                    maxLength={2000}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {experience.length}/2000 characters (minimum 50)
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>
                                    Key Capabilities <span className="text-red-500">*</span>
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={newCapability}
                                        onChange={(e) => setNewCapability(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Add a capability and press Enter"
                                        maxLength={50}
                                    />
                                    <Button 
                                        type="button" 
                                        variant="outline"
                                        onClick={addCapability}
                                        disabled={!newCapability.trim() || capabilities.length >= 10}
                                    >
                                        Add
                                    </Button>
                                </div>
                                {capabilities.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {capabilities.map((cap, index) => (
                                            <Badge 
                                                key={index} 
                                                variant="secondary"
                                                className="pl-3 pr-1.5 py-1.5"
                                            >
                                                {cap}
                                                <button
                                                    onClick={() => removeCapability(index)}
                                                    className="ml-2 hover:bg-slate-200 rounded-full p-0.5"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Add up to 10 capabilities (at least 1 required)
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="portfolioUrl">Portfolio URL (optional)</Label>
                                    <Input
                                        id="portfolioUrl"
                                        type="url"
                                        value={portfolioUrl}
                                        onChange={(e) => setPortfolioUrl(e.target.value)}
                                        placeholder="https://yourportfolio.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="linkedinUrl">LinkedIn URL (optional)</Label>
                                    <Input
                                        id="linkedinUrl"
                                        type="url"
                                        value={linkedinUrl}
                                        onChange={(e) => setLinkedinUrl(e.target.value)}
                                        placeholder="https://linkedin.com/in/..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Pricing & Availability */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>
                                    Pricing Model <span className="text-red-500">*</span>
                                </Label>
                                <Select value={pricingModel} onValueChange={setPricingModel}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select your pricing model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {pricingModels.map((model) => (
                                            <SelectItem key={model.value} value={model.value}>
                                                {model.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>
                                    Availability <span className="text-red-500">*</span>
                                </Label>
                                <Select value={availability} onValueChange={setAvailability}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select your availability" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availabilityOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                                <p className="text-sm text-blue-800">
                                    <strong>What happens next?</strong>
                                </p>
                                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                                    <li>• Our team will review your application within 2-3 business days</li>
                                    <li>• You&apos;ll receive an email with the decision</li>
                                    <li>• Once approved, you can set up your full profile and start receiving orders</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex justify-between pt-4">
                        {step > 1 ? (
                            <Button 
                                variant="outline" 
                                onClick={() => setStep(step - 1)}
                                disabled={isPending}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                        ) : (
                            <Button 
                                variant="ghost" 
                                onClick={() => router.push("/marketplace")}
                            >
                                Cancel
                            </Button>
                        )}

                        {step < 3 ? (
                            <Button 
                                onClick={() => setStep(step + 1)}
                                disabled={!canProceed()}
                            >
                                Continue
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        ) : (
                            <Button 
                                onClick={handleSubmit}
                                disabled={!canProceed() || isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Submit Application
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
