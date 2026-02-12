/**
 * TemplateGallery — Browsable collection of plan templates for quick-start planning.
 *
 * @description Displays a categorized gallery of pre-built plan templates that users
 * can preview and deploy with one click. Templates create objectives with pre-populated
 * tasks, giving users an instant head start.
 *
 * @component
 *
 * @example
 * <TemplateGallery />
 */

"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Rocket,
  Building2,
  Megaphone,
  Users,
  DollarSign,
  Code,
  Calendar,
  ShoppingBag,
  Scale,
  Globe,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  X,
  Target,
  Clock,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { applyGeneratedPlan, type GeneratedPlan } from "@/actions/plan-generator"
import { useCelebration } from "@/hooks/useCelebration"

// ─── Template Types ───────────────────────────────────────────────

interface TemplateTask {
  title: string
  description: string
  durationDays: number
  suggestedRole: string
  riskLevel: "Low" | "Medium" | "High"
}

interface TemplatePhase {
  title: string
  description: string
  tasks: TemplateTask[]
  startWeek: number
  endWeek: number
}

interface PlanTemplate {
  id: string
  title: string
  description: string
  category: TemplateCategory
  icon: React.ElementType
  totalWeeks: number
  phases: TemplatePhase[]
  quickWins: string[]
  keyRisks: string[]
}

type TemplateCategory =
  | "startup"
  | "marketing"
  | "hiring"
  | "finance"
  | "product"
  | "operations"
  | "legal"
  | "growth"

// ─── Category Metadata ───────────────────────────────────────────

const CATEGORIES: Record<TemplateCategory, { label: string; icon: React.ElementType }> = {
  startup: { label: "Startup Launch", icon: Rocket },
  marketing: { label: "Marketing", icon: Megaphone },
  hiring: { label: "Hiring & Team", icon: Users },
  finance: { label: "Finance", icon: DollarSign },
  product: { label: "Product", icon: Code },
  operations: { label: "Operations", icon: Building2 },
  legal: { label: "Legal", icon: Scale },
  growth: { label: "Growth", icon: Globe },
}

// ─── Templates Data ──────────────────────────────────────────────

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "startup-launch",
    title: "Startup Launch Playbook",
    description:
      "Everything you need to go from idea to launched startup — company formation, branding, MVP, and first customers.",
    category: "startup",
    icon: Rocket,
    totalWeeks: 12,
    phases: [
      {
        title: "Foundation",
        description: "Legal setup, branding, and core infrastructure",
        startWeek: 1,
        endWeek: 3,
        tasks: [
          { title: "Register company", description: "File incorporation documents and get your legal entity set up", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Set up business bank account", description: "Open a dedicated business account for financial separation", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Design brand identity", description: "Create logo, color palette, and brand guidelines", durationDays: 7, suggestedRole: "Designer", riskLevel: "Low" },
          { title: "Purchase domain and set up email", description: "Secure your primary domain and configure business email", durationDays: 1, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
      {
        title: "Build MVP",
        description: "Design and build the minimum viable product",
        startWeek: 3,
        endWeek: 8,
        tasks: [
          { title: "Define MVP scope", description: "Identify the core features that solve the primary user problem", durationDays: 3, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Create wireframes and user flows", description: "Map out the user experience before building", durationDays: 5, suggestedRole: "Designer", riskLevel: "Low" },
          { title: "Build core features", description: "Develop the essential functionality for launch", durationDays: 21, suggestedRole: "Developer", riskLevel: "High" },
          { title: "Set up analytics and monitoring", description: "Implement tracking to measure user behavior from day one", durationDays: 2, suggestedRole: "Developer", riskLevel: "Low" },
        ],
      },
      {
        title: "Launch & First Customers",
        description: "Go to market and acquire initial users",
        startWeek: 8,
        endWeek: 12,
        tasks: [
          { title: "Build landing page", description: "Create a compelling landing page that converts visitors", durationDays: 5, suggestedRole: "Designer", riskLevel: "Low" },
          { title: "Set up customer support", description: "Create help desk, FAQ, and support email", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Execute launch campaign", description: "Announce on social media, ProductHunt, and to your network", durationDays: 7, suggestedRole: "Marketing Lead", riskLevel: "Medium" },
          { title: "Onboard first 10 customers", description: "Personally onboard early users and gather feedback", durationDays: 14, suggestedRole: "Founder", riskLevel: "Medium" },
        ],
      },
    ],
    quickWins: [
      "Buy your domain name today",
      "Set up a simple landing page with email capture",
      "Talk to 3 potential customers this week",
    ],
    keyRisks: [
      "MVP scope creep — stay disciplined on core features",
      "Running out of runway before product-market fit",
      "Building what you think users want vs. what they actually need",
    ],
  },
  {
    id: "fundraising",
    title: "Fundraising Round",
    description:
      "Prepare and execute a seed or Series A fundraising round with investor materials, pipeline, and due diligence.",
    category: "finance",
    icon: DollarSign,
    totalWeeks: 10,
    phases: [
      {
        title: "Preparation",
        description: "Build your fundraising materials and story",
        startWeek: 1,
        endWeek: 3,
        tasks: [
          { title: "Build pitch deck", description: "Create a compelling 12-15 slide pitch deck", durationDays: 7, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Prepare financial model", description: "Build 3-year projections with clear assumptions", durationDays: 5, suggestedRole: "CFO", riskLevel: "Medium" },
          { title: "Write executive summary", description: "1-page overview for cold outreach", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Organize data room", description: "Prepare all documents investors will request during due diligence", durationDays: 5, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
      {
        title: "Outreach & Meetings",
        description: "Build pipeline and take meetings",
        startWeek: 3,
        endWeek: 7,
        tasks: [
          { title: "Build investor target list", description: "Research 50-100 relevant investors by stage, sector, and thesis fit", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Warm introductions campaign", description: "Ask advisors and network for introductions to target investors", durationDays: 14, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Investor meetings (initial)", description: "Take 15-20 first meetings and gather feedback", durationDays: 21, suggestedRole: "Founder", riskLevel: "High" },
          { title: "Iterate on pitch based on feedback", description: "Refine deck and story based on common investor questions", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
      {
        title: "Close",
        description: "Term sheet negotiation and closing",
        startWeek: 7,
        endWeek: 10,
        tasks: [
          { title: "Negotiate term sheet", description: "Review and negotiate key terms with lead investor", durationDays: 7, suggestedRole: "Founder", riskLevel: "High" },
          { title: "Legal review and documentation", description: "Engage lawyer to review investment documents", durationDays: 10, suggestedRole: "Legal Advisor", riskLevel: "Medium" },
          { title: "Complete due diligence", description: "Respond to all investor DD requests promptly", durationDays: 14, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Wire transfer and close", description: "Execute final documents and receive funds", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Update your LinkedIn profile and company page",
      "Draft a 1-paragraph company description",
      "List 10 investors you already know or have warm paths to",
    ],
    keyRisks: [
      "Fundraising takes longer than expected — plan for 3-6 months",
      "Key metrics not strong enough — focus on traction before raising",
      "Dilution and unfavorable terms if negotiating from weakness",
    ],
  },
  {
    id: "hiring-plan",
    title: "First 5 Hires",
    description:
      "Recruit, interview, and onboard your first team members with proper HR infrastructure.",
    category: "hiring",
    icon: Users,
    totalWeeks: 8,
    phases: [
      {
        title: "HR Foundation",
        description: "Set up hiring infrastructure and compliance",
        startWeek: 1,
        endWeek: 2,
        tasks: [
          { title: "Create job descriptions", description: "Write clear, compelling JDs for each role", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Set up ATS or hiring tracker", description: "Choose and configure applicant tracking system", durationDays: 2, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Define compensation bands", description: "Research market rates and set salary ranges", durationDays: 2, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Prepare employment contracts", description: "Draft standard employment agreements with legal review", durationDays: 5, suggestedRole: "Legal Advisor", riskLevel: "Medium" },
        ],
      },
      {
        title: "Recruit & Interview",
        description: "Source, screen, and interview candidates",
        startWeek: 2,
        endWeek: 6,
        tasks: [
          { title: "Post jobs on key platforms", description: "List roles on LinkedIn, Indeed, and niche job boards", durationDays: 2, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Source candidates actively", description: "Reach out to potential candidates via LinkedIn and referrals", durationDays: 21, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Conduct interviews", description: "Run structured interviews with consistent evaluation criteria", durationDays: 21, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Check references", description: "Verify work history and capabilities with references", durationDays: 5, suggestedRole: "Operations", riskLevel: "Low" },
        ],
      },
      {
        title: "Offer & Onboard",
        description: "Close offers and set up new hires for success",
        startWeek: 6,
        endWeek: 8,
        tasks: [
          { title: "Extend offers", description: "Present compensation packages and negotiate", durationDays: 5, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Set up payroll", description: "Register as employer and configure payroll system", durationDays: 3, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Create onboarding checklist", description: "Prepare first-week schedule, equipment, and access", durationDays: 2, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Conduct first-day onboarding", description: "Welcome new hires with orientation and team introductions", durationDays: 1, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Write down the 3 most critical roles you need to fill",
      "Post in your personal network that you are hiring",
      "Set up a simple interview rubric with 5 evaluation criteria",
    ],
    keyRisks: [
      "Hiring too slowly and burning out existing team",
      "Making a bad hire that damages culture",
      "Not having clear role expectations leading to misalignment",
    ],
  },
  {
    id: "marketing-launch",
    title: "Marketing Campaign Launch",
    description:
      "Plan and execute a marketing campaign from strategy to measurement, including content, ads, and PR.",
    category: "marketing",
    icon: Megaphone,
    totalWeeks: 6,
    phases: [
      {
        title: "Strategy & Planning",
        description: "Define audience, messaging, and channels",
        startWeek: 1,
        endWeek: 2,
        tasks: [
          { title: "Define target audience personas", description: "Create 2-3 detailed buyer personas with pain points", durationDays: 3, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Craft key messaging framework", description: "Define value proposition, tagline, and key messages", durationDays: 3, suggestedRole: "Marketing Lead", riskLevel: "Medium" },
          { title: "Select marketing channels", description: "Choose 2-3 primary channels based on audience behavior", durationDays: 2, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Set campaign budget and KPIs", description: "Allocate budget and define measurable success criteria", durationDays: 1, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
      {
        title: "Content Creation",
        description: "Produce all campaign assets",
        startWeek: 2,
        endWeek: 4,
        tasks: [
          { title: "Create content calendar", description: "Plan 4-6 weeks of content across all channels", durationDays: 2, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Design visual assets", description: "Create social graphics, ad creatives, and email templates", durationDays: 7, suggestedRole: "Designer", riskLevel: "Low" },
          { title: "Write copy for all channels", description: "Draft social posts, email sequences, and ad copy", durationDays: 5, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Set up tracking and UTMs", description: "Configure analytics to measure campaign performance", durationDays: 1, suggestedRole: "Marketing Lead", riskLevel: "Low" },
        ],
      },
      {
        title: "Launch & Optimize",
        description: "Go live and iterate based on data",
        startWeek: 4,
        endWeek: 6,
        tasks: [
          { title: "Launch campaign", description: "Activate all channels simultaneously for maximum impact", durationDays: 1, suggestedRole: "Marketing Lead", riskLevel: "Medium" },
          { title: "Monitor and respond daily", description: "Track metrics, respond to engagement, adjust targeting", durationDays: 14, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "A/B test and optimize", description: "Test different creatives and messaging, double down on winners", durationDays: 10, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Create campaign report", description: "Analyze results, document learnings, plan next campaign", durationDays: 2, suggestedRole: "Marketing Lead", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Google your competitors and note what messaging they use",
      "Set up Google Analytics on your website today",
      "Draft a social media post about your product value prop",
    ],
    keyRisks: [
      "Weak messaging that does not resonate with target audience",
      "Spreading too thin across too many channels",
      "Not tracking results properly — no data means no improvement",
    ],
  },
  {
    id: "product-mvp",
    title: "Build & Ship MVP",
    description:
      "Take a product idea from spec to shipped MVP with user testing and iteration.",
    category: "product",
    icon: Code,
    totalWeeks: 8,
    phases: [
      {
        title: "Discovery & Design",
        description: "Validate the idea and design the solution",
        startWeek: 1,
        endWeek: 2,
        tasks: [
          { title: "Customer interviews (5-10)", description: "Talk to potential users to validate the problem", durationDays: 7, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Define MVP feature set", description: "Decide the minimum set of features for launch", durationDays: 2, suggestedRole: "Product Lead", riskLevel: "Medium" },
          { title: "Create user flow diagrams", description: "Map out the critical user journey", durationDays: 2, suggestedRole: "Designer", riskLevel: "Low" },
          { title: "Design UI mockups", description: "Create high-fidelity mockups for core screens", durationDays: 5, suggestedRole: "Designer", riskLevel: "Low" },
        ],
      },
      {
        title: "Development Sprint",
        description: "Build the core product",
        startWeek: 3,
        endWeek: 6,
        tasks: [
          { title: "Set up development environment", description: "Configure repo, CI/CD, and staging environment", durationDays: 2, suggestedRole: "Developer", riskLevel: "Low" },
          { title: "Build core features", description: "Implement the primary user-facing functionality", durationDays: 21, suggestedRole: "Developer", riskLevel: "High" },
          { title: "Build backend and API", description: "Create the server-side logic and data layer", durationDays: 14, suggestedRole: "Developer", riskLevel: "Medium" },
          { title: "Internal QA testing", description: "Test all features and fix critical bugs", durationDays: 5, suggestedRole: "Developer", riskLevel: "Medium" },
        ],
      },
      {
        title: "Beta & Launch",
        description: "User testing and public release",
        startWeek: 6,
        endWeek: 8,
        tasks: [
          { title: "Recruit beta testers (10-20)", description: "Find engaged early users willing to test and give feedback", durationDays: 5, suggestedRole: "Product Lead", riskLevel: "Low" },
          { title: "Run beta test", description: "Onboard beta users, collect feedback, track usage", durationDays: 10, suggestedRole: "Product Lead", riskLevel: "Medium" },
          { title: "Fix critical bugs from beta", description: "Address the most impactful issues found in testing", durationDays: 5, suggestedRole: "Developer", riskLevel: "Medium" },
          { title: "Public launch", description: "Deploy production version and announce to the world", durationDays: 2, suggestedRole: "Founder", riskLevel: "Medium" },
        ],
      },
    ],
    quickWins: [
      "Write a 1-page product spec describing the core problem and solution",
      "Create a Figma file and sketch the main screen",
      "Message 3 potential users and ask about their current workflow",
    ],
    keyRisks: [
      "Feature creep — resist adding anything not in the MVP spec",
      "Technical debt accumulating — keep the codebase maintainable",
      "Building in isolation without user feedback",
    ],
  },
  {
    id: "event-planning",
    title: "Event Planning",
    description:
      "Organize a successful business event — from venue booking to post-event follow-up.",
    category: "operations",
    icon: Calendar,
    totalWeeks: 8,
    phases: [
      {
        title: "Planning",
        description: "Define the event and secure logistics",
        startWeek: 1,
        endWeek: 3,
        tasks: [
          { title: "Define event goals and format", description: "Decide the purpose, target attendance, and event type", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Book venue", description: "Research and secure a venue with the right capacity and location", durationDays: 7, suggestedRole: "Operations", riskLevel: "Medium" },
          { title: "Set budget", description: "Create a detailed budget covering all expenses", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Secure speakers or entertainment", description: "Confirm keynote speakers, panelists, or performers", durationDays: 14, suggestedRole: "Founder", riskLevel: "High" },
        ],
      },
      {
        title: "Promotion",
        description: "Drive registrations and awareness",
        startWeek: 3,
        endWeek: 6,
        tasks: [
          { title: "Create event page", description: "Build registration page with event details", durationDays: 3, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Email campaign", description: "Send invitations to your mailing list", durationDays: 2, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Social media promotion", description: "Create and schedule social content leading up to the event", durationDays: 14, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Partner outreach", description: "Get sponsors and partners to help promote", durationDays: 14, suggestedRole: "Founder", riskLevel: "Medium" },
        ],
      },
      {
        title: "Execute & Follow Up",
        description: "Run the event and capitalize on momentum",
        startWeek: 7,
        endWeek: 8,
        tasks: [
          { title: "Final logistics check", description: "Confirm all vendors, setup, and AV requirements", durationDays: 2, suggestedRole: "Operations", riskLevel: "Medium" },
          { title: "Run the event", description: "Manage day-of operations and troubleshoot issues", durationDays: 1, suggestedRole: "Operations", riskLevel: "High" },
          { title: "Send thank-you and follow-up emails", description: "Thank attendees and share recordings or materials", durationDays: 2, suggestedRole: "Marketing Lead", riskLevel: "Low" },
          { title: "Analyze results and ROI", description: "Review attendance, feedback, and business outcomes", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Pick 3 potential dates and check venue availability",
      "Create a draft attendee list of your ideal 50 guests",
      "Set up a simple registration form on Typeform or Google Forms",
    ],
    keyRisks: [
      "Low attendance — promote early and consistently",
      "Budget overrun — track expenses weekly",
      "Technical issues on event day — always have a backup plan",
    ],
  },
  {
    id: "ecommerce-launch",
    title: "E-Commerce Store Launch",
    description:
      "Launch an online store from product sourcing to first sales, including logistics and marketing.",
    category: "growth",
    icon: ShoppingBag,
    totalWeeks: 10,
    phases: [
      {
        title: "Product & Supply Chain",
        description: "Source products and set up fulfillment",
        startWeek: 1,
        endWeek: 4,
        tasks: [
          { title: "Finalize product catalog", description: "Decide which products to sell at launch", durationDays: 3, suggestedRole: "Founder", riskLevel: "Medium" },
          { title: "Source suppliers", description: "Find and vet reliable suppliers with good margins", durationDays: 14, suggestedRole: "Founder", riskLevel: "High" },
          { title: "Set up inventory management", description: "Choose and configure inventory tracking system", durationDays: 3, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Arrange fulfillment and shipping", description: "Set up shipping accounts and fulfillment workflow", durationDays: 7, suggestedRole: "Operations", riskLevel: "Medium" },
        ],
      },
      {
        title: "Build Store",
        description: "Create the online store and payment processing",
        startWeek: 3,
        endWeek: 7,
        tasks: [
          { title: "Choose e-commerce platform", description: "Select Shopify, WooCommerce, or custom solution", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Design and build store", description: "Create product pages, checkout flow, and homepage", durationDays: 14, suggestedRole: "Designer", riskLevel: "Medium" },
          { title: "Set up payment processing", description: "Configure Stripe/PayPal and test checkout flow", durationDays: 3, suggestedRole: "Developer", riskLevel: "Low" },
          { title: "Write product descriptions and photograph products", description: "Create compelling copy and professional product images", durationDays: 10, suggestedRole: "Marketing Lead", riskLevel: "Low" },
        ],
      },
      {
        title: "Launch & Scale",
        description: "Go live and drive first sales",
        startWeek: 7,
        endWeek: 10,
        tasks: [
          { title: "Soft launch to friends and family", description: "Test the full purchase flow with real orders", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Launch marketing campaign", description: "Run ads, social media, and email campaigns", durationDays: 7, suggestedRole: "Marketing Lead", riskLevel: "Medium" },
          { title: "Set up customer service", description: "Create FAQ, returns policy, and support email", durationDays: 3, suggestedRole: "Operations", riskLevel: "Low" },
          { title: "Analyze first-month performance", description: "Review sales, conversion rates, and customer feedback", durationDays: 5, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Register your store domain name today",
      "Create a Shopify trial account and explore themes",
      "Photograph your first 3 products with good lighting",
    ],
    keyRisks: [
      "Supplier reliability — always have a backup supplier",
      "Low conversion rates — optimize product pages and checkout",
      "Cash flow — manage inventory carefully to avoid overstock",
    ],
  },
  {
    id: "compliance-setup",
    title: "Compliance & Legal Foundation",
    description:
      "Get your legal house in order — contracts, IP, data protection, and regulatory compliance.",
    category: "legal",
    icon: Scale,
    totalWeeks: 6,
    phases: [
      {
        title: "Core Legal",
        description: "Essential legal documents and registrations",
        startWeek: 1,
        endWeek: 2,
        tasks: [
          { title: "Draft employment contract templates", description: "Create standard agreements for full-time and contract workers", durationDays: 5, suggestedRole: "Legal Advisor", riskLevel: "Medium" },
          { title: "Create NDA template", description: "Prepare non-disclosure agreements for partners and contractors", durationDays: 2, suggestedRole: "Legal Advisor", riskLevel: "Low" },
          { title: "Review and update terms of service", description: "Ensure ToS covers current business model and offerings", durationDays: 3, suggestedRole: "Legal Advisor", riskLevel: "Medium" },
          { title: "IP assignment agreements", description: "Ensure all IP created by team is assigned to the company", durationDays: 3, suggestedRole: "Legal Advisor", riskLevel: "High" },
        ],
      },
      {
        title: "Data & Privacy",
        description: "Data protection and privacy compliance",
        startWeek: 2,
        endWeek: 4,
        tasks: [
          { title: "Draft privacy policy", description: "Create GDPR/CCPA-compliant privacy policy for your product", durationDays: 3, suggestedRole: "Legal Advisor", riskLevel: "Medium" },
          { title: "Data processing audit", description: "Map all personal data flows through your systems", durationDays: 5, suggestedRole: "Operations", riskLevel: "Medium" },
          { title: "Set up cookie consent", description: "Implement cookie banner and consent management", durationDays: 2, suggestedRole: "Developer", riskLevel: "Low" },
          { title: "Register with data protection authority", description: "Complete registration as a data controller", durationDays: 2, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
      {
        title: "Insurance & Risk",
        description: "Protect the business with proper coverage",
        startWeek: 4,
        endWeek: 6,
        tasks: [
          { title: "Get business insurance quotes", description: "Compare professional indemnity and public liability policies", durationDays: 5, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Purchase required insurance", description: "Buy the essential policies for your industry", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
          { title: "Create risk register", description: "Document key business risks and mitigation strategies", durationDays: 3, suggestedRole: "Founder", riskLevel: "Low" },
        ],
      },
    ],
    quickWins: [
      "Check if you have signed IP assignment agreements with all team members",
      "Google your industry and check for any required licenses or registrations",
      "Review your website footer — do you have links to Privacy Policy and Terms?",
    ],
    keyRisks: [
      "IP owned by contractors instead of the company — fix this immediately",
      "Non-compliance with data protection laws — fines can be severe",
      "Operating without required insurance or licenses",
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────

export function TemplateGallery(): React.ReactElement {
  const router = useRouter()
  const { fireConfetti } = useCelebration()
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all")

  const filteredTemplates =
    activeCategory === "all"
      ? PLAN_TEMPLATES
      : PLAN_TEMPLATES.filter((t) => t.category === activeCategory)

  /**
   * Applies a template by converting it to GeneratedPlan and saving.
   */
  const handleApplyTemplate = useCallback(
    async (template: PlanTemplate) => {
      setIsApplying(true)

      const plan: GeneratedPlan = {
        title: template.title,
        description: template.description,
        suggestedDeadline: new Date(
          Date.now() + template.totalWeeks * 7 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0],
        totalWeeks: template.totalWeeks,
        phases: template.phases,
        keyRisks: template.keyRisks,
        quickWins: template.quickWins,
      }

      const result = await applyGeneratedPlan(plan)
      setIsApplying(false)

      if (result.error) {
        toast.error(result.error)
        return
      }

      fireConfetti()
      setSelectedTemplate(null)
      toast.success(`"${template.title}" plan created!`, {
        duration: 3000,
        description: "Redirecting to your objectives...",
      })

      setTimeout(() => {
        router.push("/new-objectives")
      }, 1500)
    },
    [fireConfetti, router]
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-electric-blue/10">
          <LayoutGrid className="h-4 w-4 text-electric-blue" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Plan Templates
          </h3>
          <p className="text-xs text-muted-foreground">
            Deploy a full plan in one click
          </p>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-full border transition-colors",
            activeCategory === "all"
              ? "bg-international-orange text-background border-international-orange"
              : "text-muted-foreground hover:text-foreground hover:border-foreground/20"
          )}
        >
          All
        </button>
        {Object.entries(CATEGORIES).map(([key, cat]) => {
          const hasTemplates = PLAN_TEMPLATES.some((t) => t.category === key)
          if (!hasTemplates) return null
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key as TemplateCategory)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                activeCategory === key
                  ? "bg-international-orange text-background border-international-orange"
                  : "text-muted-foreground hover:text-foreground hover:border-foreground/20"
              )}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredTemplates.map((template) => {
          const Icon = template.icon
          const totalTasks = template.phases.reduce(
            (s, p) => s + p.tasks.length,
            0
          )

          return (
            <Card
              key={template.id}
              className="group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border"
              onClick={() => setSelectedTemplate(template)}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-international-orange/10 mb-3 group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5 text-international-orange" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1 group-hover:text-international-orange transition-colors">
                  {template.title}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {template.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{template.phases.length} phases</span>
                  <span>&middot;</span>
                  <span>{totalTasks} tasks</span>
                  <span>&middot;</span>
                  <span>{template.totalWeeks}w</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Template Preview Dialog */}
      <TemplatePreviewDialog
        template={selectedTemplate}
        isOpen={!!selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onApply={handleApplyTemplate}
        isApplying={isApplying}
      />
    </div>
  )
}

// ─── Template Preview Dialog ──────────────────────────────────────

interface TemplatePreviewDialogProps {
  template: PlanTemplate | null
  isOpen: boolean
  onClose: () => void
  onApply: (template: PlanTemplate) => Promise<void>
  isApplying: boolean
}

function TemplatePreviewDialog({
  template,
  isOpen,
  onClose,
  onApply,
  isApplying,
}: TemplatePreviewDialogProps): React.ReactElement | null {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0)

  if (!template) return null

  const totalTasks = template.phases.reduce(
    (s, p) => s + p.tasks.length,
    0
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(() => {
              const Icon = template.icon
              return (
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-international-orange/10 shrink-0">
                  <Icon className="h-4 w-4 text-international-orange" />
                </div>
              )
            })()}
            {template.title}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {template.description}
            </p>

            {/* Stats */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1">
                <Target className="h-3 w-3" />
                {template.phases.length} phases
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {totalTasks} tasks
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {template.totalWeeks} weeks
              </Badge>
            </div>

            {/* Phases */}
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Phases
              </p>
              {template.phases.map((phase, index) => (
                <div
                  key={phase.title}
                  className="rounded-lg border overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedPhase(
                        expandedPhase === index ? null : index
                      )
                    }
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    aria-expanded={expandedPhase === index}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-international-orange/10 text-international-orange text-xs font-bold shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {phase.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {phase.tasks.length} tasks &middot; Weeks{" "}
                        {phase.startWeek}–{phase.endWeek}
                      </p>
                    </div>
                    {expandedPhase === index ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedPhase === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
                          {phase.tasks.map((task, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <span className="text-foreground">
                                  {task.title}
                                </span>
                                <span className="text-muted-foreground ml-1">
                                  &middot; {task.durationDays}d &middot;{" "}
                                  {task.suggestedRole}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Quick Wins */}
            {template.quickWins.length > 0 && (
              <div className="bg-status-success-light/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="h-3.5 w-3.5 text-status-success" />
                  <span className="text-xs font-semibold text-status-success">
                    Quick wins — start today
                  </span>
                </div>
                <ul className="space-y-1">
                  {template.quickWins.map((win, i) => (
                    <li
                      key={i}
                      className="text-xs text-foreground flex items-start gap-2"
                    >
                      <span className="text-status-success mt-0.5">
                        &bull;
                      </span>
                      {win}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onApply(template)}
            disabled={isApplying}
            className="bg-international-orange hover:bg-international-orange/90 text-background"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Deploy this plan
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
