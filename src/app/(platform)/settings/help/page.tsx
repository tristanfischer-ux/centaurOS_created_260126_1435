import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    HelpCircle,
    Keyboard,
    MessageSquare,
    BookOpen,
    Lightbulb,
    Command,
    Search,
    ArrowUpDown,
    CornerDownLeft,
} from 'lucide-react'
import Link from 'next/link'

/**
 * Help & Support Page
 *
 * @description Keyboard shortcuts, tips, FAQ, and support contact information.
 * Accessible to all users.
 */
export default function HelpPage() {
    return (
        <div className="space-y-6 max-w-4xl">
            {/* Keyboard Shortcuts */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Keyboard className="h-5 w-5 text-international-orange" />
                        <CardTitle>Keyboard Shortcuts</CardTitle>
                    </div>
                    <CardDescription>Navigate faster with these shortcuts.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ShortcutRow
                            keys={['⌘', 'K']}
                            description="Open Command Palette"
                            icon={Command}
                        />
                        <ShortcutRow
                            keys={['⌘', '/']}
                            description="Search anything"
                            icon={Search}
                        />
                        <ShortcutRow
                            keys={['↑', '↓']}
                            description="Navigate lists and menus"
                            icon={ArrowUpDown}
                        />
                        <ShortcutRow
                            keys={['Enter']}
                            description="Select or confirm"
                            icon={CornerDownLeft}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        On Windows/Linux, use <Kbd>Ctrl</Kbd> instead of <Kbd>⌘</Kbd>.
                    </p>
                </CardContent>
            </Card>

            {/* Quick Tips */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-international-orange" />
                        <CardTitle>Tips & Tricks</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <TipCard
                            title="Command Palette"
                            description="Press ⌘K to quickly navigate, search tasks, or run actions from anywhere."
                        />
                        <TipCard
                            title="Talk to Specialists"
                            description="Use the chat panel to ask specialists for advice tailored to your company context."
                        />
                        <TipCard
                            title="Company Intelligence"
                            description="Add your website and competitors in Company settings to get more personalised advice."
                        />
                        <TipCard
                            title="Specialist Tasks"
                            description="Specialist tasks use your plan's monthly allowance. Track usage in Billing & Usage."
                        />
                    </div>
                </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-international-orange" />
                        <CardTitle>Frequently Asked Questions</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FaqItem
                        question="How do I invite team members?"
                        answer="Go to Settings > Company > Team Management, then click 'Manage Team'. From there you can send invitations via email."
                    />
                    <FaqItem
                        question="What are specialist tasks?"
                        answer="A specialist task is one specialist doing one thing for you — generating a task breakdown, drafting an investor email, scoring a supplier shortlist, reviewing a brief. Each plan includes a monthly allowance."
                    />
                    <FaqItem
                        question="How do I export my data?"
                        answer="Go to Settings > Privacy & Data to submit a data export request. Your data will be prepared as a downloadable file."
                    />
                    <FaqItem
                        question="Can I change my subscription plan?"
                        answer="Yes, go to Settings > Billing & Usage to view available plans and upgrade. You can also manage payment methods through the Stripe billing portal."
                    />
                    <FaqItem
                        question="How do I connect Google Workspace?"
                        answer="Founders can connect Google Workspace in Settings > Company. This enables calendar sync, Drive file attachments, and Google Meet integration."
                    />
                </CardContent>
            </Card>

            {/* Support Contact */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-international-orange" />
                        <CardTitle>Get in Touch</CardTitle>
                    </div>
                    <CardDescription>
                        Can't find what you're looking for? Our support team is here to help.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-lg border hover:border-international-orange/40 transition-colors">
                        <div>
                            <p className="text-sm font-medium text-foreground">Email Support</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                We typically respond within 24 hours on business days.
                            </p>
                        </div>
                        <Link
                            href="mailto:support@forgeos.ai"
                            className="text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors"
                        >
                            support@forgeos.ai
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function ShortcutRow({
    keys,
    description,
    icon: Icon,
}: {
    keys: string[]
    description: string
    icon: React.ComponentType<{ className?: string }>
}) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{description}</span>
            </div>
            <div className="flex items-center gap-1">
                {keys.map((key, i) => (
                    <span key={i}>
                        <Kbd>{key}</Kbd>
                        {i < keys.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
                    </span>
                ))}
            </div>
        </div>
    )
}

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-muted rounded border text-xs font-mono text-muted-foreground">
            {children}
        </kbd>
    )
}

function TipCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="p-4 rounded-lg bg-muted/30 space-y-1.5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
    )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
    return (
        <div className="pb-4 border-b last:border-b-0 last:pb-0">
            <p className="text-sm font-medium text-foreground">{question}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{answer}</p>
        </div>
    )
}
