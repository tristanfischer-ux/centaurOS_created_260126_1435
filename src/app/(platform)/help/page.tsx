/**
 * Help Center / Academy Page
 *
 * @description Premium Help Center with quick start guide, video library,
 * feature guides, keyboard shortcuts, FAQ, and support contact. Videos are
 * hosted in Supabase Storage and play natively via <video> tag.
 */

import type { Metadata } from "next"
import Link from "next/link"
import {
  Target,
  Users,
  CheckSquare,
  Flame,
  Store,
  UsersRound,
  Keyboard,
  Mail,
  MessageSquare,
  Sparkles,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VideoWalkthrough } from "@/components/ui/video-walkthrough"
import { typography } from "@/lib/design-system/typography"
import { SpecialistBriefingHero } from "@/components/specialists/specialist-briefing-hero"
import { VIDEOS, VIDEO_LIBRARY_ORDER } from "@/lib/video-urls"
import { FORGE_ROUTES } from "@/lib/forge-routes"

export const metadata: Metadata = {
  title: "Help Center | ForgeOS",
  description:
    "Everything you need to get the most out of ForgeOS — quick start, video walkthroughs, feature guides, and support.",
}

const QUICK_START_STEPS = [
  {
    step: 1,
    icon: Target,
    title: "Set Your Direction",
    description: "Create objectives that define what success looks like. Break down big goals into measurable outcomes.",
  },
  {
    step: 2,
    icon: Users,
    title: "Build Your Team",
    description: "Invite team members and assign roles. Founders lead, Executives execute, Apprentices learn.",
  },
  {
    step: 3,
    icon: CheckSquare,
    title: "Execute & Track",
    description: "Break objectives into tasks and track progress. Use Today for your daily focus.",
  },
] as const

const FEATURE_GUIDES = [
  {
    icon: Target,
    title: "Strategy & Objectives",
    description: "Define and track your strategic goals",
    href: "/new-objectives",
  },
  {
    icon: CheckSquare,
    title: "Task Management",
    description: "Organize and execute with clarity",
    href: "/new-tasks",
  },
  {
    icon: Users,
    title: "Team & Collaboration",
    description: "Invite members and work together",
    href: "/team",
  },
  {
    icon: Flame,
    title: "The Forge",
    description: "Product development and manufacturing",
    href: FORGE_ROUTES.cadLab,
  },
  {
    icon: Store,
    title: "Marketplace",
    description: "Find specialists and order services",
    href: "/marketplace",
  },
  {
    icon: UsersRound,
    title: "Specialists",
    description: "AI agents and human experts",
    href: "/agents",
  },
] as const

const KEYBOARD_SHORTCUTS = [
  {
    group: "General",
    shortcuts: [
      { keys: "⌘K", action: "Command palette" },
      { keys: "?", action: "Help" },
      { keys: "N", action: "Quick capture" },
    ],
  },
  {
    group: "Navigation",
    shortcuts: [
      { keys: "G then H", action: "Go to Today" },
      { keys: "G then O", action: "Objectives" },
      { keys: "G then T", action: "Tasks" },
    ],
  },
  {
    group: "Tasks",
    shortcuts: [
      { keys: "Enter", action: "Create new task" },
      { keys: "⇧⌘S", action: "Save task" },
    ],
  },
  {
    group: "Communication",
    shortcuts: [
      { keys: "⇧⌘M", action: "Open messages" },
    ],
  },
] as const

const FAQ_ITEMS = [
  {
    question: "How do I invite team members?",
    answer:
      "Go to Team and click Invite. Enter their email and assign a role (Founder, Executive, or Apprentice). They'll receive an email to join your foundry.",
  },
  {
    question: "What are objectives vs tasks?",
    answer:
      "Objectives are your high-level goals — the 'what' you want to achieve. Tasks are the concrete steps — the 'how' you'll get there. A single objective can have many tasks.",
  },
  {
    question: "How does the marketplace work?",
    answer:
      "The marketplace connects you with specialists who offer services. Browse listings, book consultations, or hire for projects. Specialists can be human experts or AI-powered workflows.",
  },
  {
    question: "Can I use ForgeOS on mobile?",
    answer:
      "ForgeOS is optimized for desktop and tablet. A mobile-responsive experience is available for viewing tasks and updates on the go, with full features best enjoyed on larger screens.",
  },
  {
    question: "How do I get support?",
    answer:
      "Email support@forgeos.ai for personalized help. We typically respond within 24 hours. You can also use the command palette (⌘K) and type 'help' for quick tips.",
  },
  {
    question: "What's the difference between roles?",
    answer:
      "Founders own the foundry and can manage members and settings. Executives can create and manage objectives and tasks. Apprentices can view and contribute to assigned work.",
  },
  {
    question: "Where do I see product updates?",
    answer:
      "Visit What's New for the latest features and improvements. We ship updates frequently and keep you informed about new capabilities.",
  },
] as const

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-input bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
      {children}
    </kbd>
  )
}

function SectionHeader({
  accent,
  title,
  description,
}: {
  accent?: boolean
  title: string
  description?: string
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        {accent && <div className={typography.pageHeaderAccent} />}
        <h2 className={typography.h2}>{title}</h2>
      </div>
      {description && (
        <p className={`text-muted-foreground text-sm ${accent ? "pl-4" : ""}`}>{description}</p>
      )}
    </div>
  )
}

export default function HelpCenterPage() {
  return (
    <div className="space-y-16 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Help Center</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Everything you need to get the most out of ForgeOS
          </p>
        </div>
      </div>

      <SpecialistBriefingHero
        specialistId="chief-of-staff"
        specialistName="Cal"
        specialistTitle="Chief of Staff"
        narrative={null}
        fallbackMessage="Need help? Start with the video walkthroughs below, or ask any specialist directly — just click their avatar in the sidebar."
        isLoading={false}
        severity="success"
        context={{ type: 'general', title: 'Help', description: 'Cal on getting help.', metadata: {} }}
        storageKey="help"
      />

      {/* Quick Start Guide */}
      <section>
        <SectionHeader
          accent
          title="Quick Start Guide"
          description="Get up and running in three steps"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {QUICK_START_STEPS.map(({ step, icon: Icon, title, description }) => (
            <Card
              key={step}
              className="group border bg-card overflow-hidden transition-shadow hover:shadow-lg"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-international-orange/10 text-international-orange">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-3xl font-display font-bold text-muted-foreground/50">
                      {step}
                    </span>
                    <CardTitle className="mt-2 text-lg">{title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Video Library */}
      <section>
        <SectionHeader
          accent
          title="Video Walkthroughs"
          description="Learn by watching — short, focused tutorials"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {VIDEO_LIBRARY_ORDER.map((key) => {
            const video = VIDEOS[key]
            return (
              <VideoWalkthrough
                key={video.id}
                title={video.title}
                description={video.description}
                duration={video.duration}
                videoUrl={video.videoUrl}
                thumbnailUrl={video.thumbnailUrl}
                mode="modal"
              />
            )
          })}
        </div>
      </section>

      {/* Feature Guides */}
      <section>
        <SectionHeader
          accent
          title="Feature Guides"
          description="Deep dives into key areas of the platform"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_GUIDES.map(({ icon: Icon, title, description, href }) => (
            <Link key={href} href={href}>
              <Card className="h-full border bg-card transition-all hover:border-international-orange/30 hover:shadow-md group">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-international-orange/10 text-international-orange group-hover:bg-international-orange/20 transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base group-hover:text-international-orange transition-colors">
                        {title}
                      </CardTitle>
                      <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <SectionHeader
          accent
          title="Keyboard Shortcuts"
          description="Navigate faster with these shortcuts"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {KEYBOARD_SHORTCUTS.map(({ group, shortcuts }) => (
            <Card key={group} className="border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                  {group}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {shortcuts.map(({ keys, action }) => (
                  <div key={action} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{action}</span>
                    <Kbd>{keys}</Kbd>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <SectionHeader
          accent
          title="Frequently Asked Questions"
          description="Quick answers to common questions"
        />
        <div className="space-y-4 max-w-3xl">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <Card key={question} className="border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-international-orange shrink-0" />
                  {question}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                  {answer}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact Support */}
      <section>
        <SectionHeader
          accent
          title="Need More Help?"
          description="We're here for you"
        />
        <Card className="border bg-card max-w-xl">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-international-orange/10 text-international-orange">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Contact Support</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Email us at{" "}
                  <a
                    href="mailto:support@forgeos.ai"
                    className="text-international-orange hover:underline font-medium"
                  >
                    support@forgeos.ai
                  </a>{" "}
                  and we&apos;ll get back to you within 24 hours.
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Pro tip: Use ⌘K and type your question for instant help</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
