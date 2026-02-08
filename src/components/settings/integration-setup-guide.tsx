/**
 * IntegrationSetupGuide - In-app setup instructions for Google Workspace integration.
 *
 * @description Shows administrators clear, step-by-step instructions for
 * configuring the Google Workspace integration. Only visible when the
 * integration is not yet configured (missing env vars).
 *
 * @component
 *
 * @example
 * <IntegrationSetupGuide
 *   isGoogleConfigured={false}
 *   isResendConfigured={false}
 * />
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Copy,
    CheckCircle2,
    Wrench,
    Mail,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface IntegrationSetupGuideProps {
    /** Whether GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set */
    isGoogleConfigured: boolean
    /** Whether RESEND_API_KEY is set */
    isResendConfigured: boolean
}

function CopyButton({ text }: { text: string }) {
    function handleCopy(): void {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCopy}
            aria-label="Copy to clipboard"
        >
            <Copy className="h-3 w-3" />
        </Button>
    )
}

function CodeBlock({ children }: { children: string }) {
    return (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 font-mono text-xs">
            <code className="break-all">{children}</code>
            <CopyButton text={children} />
        </div>
    )
}

function SetupSection({
    title,
    icon: Icon,
    isConfigured,
    children,
    defaultOpen = false,
}: {
    title: string
    icon: typeof Wrench
    isConfigured: boolean
    children: React.ReactNode
    defaultOpen?: boolean
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen || !isConfigured)

    return (
        <div className="rounded-lg border">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md',
                        isConfigured ? 'bg-status-success-light' : 'bg-muted'
                    )}>
                        {isConfigured ? (
                            <CheckCircle2 className="h-4 w-4 text-status-success" />
                        ) : (
                            <Icon className="h-4 w-4 text-muted-foreground" />
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">
                            {isConfigured ? 'Configured' : 'Setup required'}
                        </p>
                    </div>
                </div>
                {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
            </button>
            {isOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                    {children}
                </div>
            )}
        </div>
    )
}

export function IntegrationSetupGuide({
    isGoogleConfigured,
    isResendConfigured,
}: IntegrationSetupGuideProps) {
    const allConfigured = isGoogleConfigured && isResendConfigured

    if (allConfigured) return null

    return (
        <Card className="bg-background border shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-international-orange-light">
                        <Wrench className="h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <CardTitle className="text-base">Setup Required</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Complete these steps to enable integrations.
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Google Workspace Setup */}
                {!isGoogleConfigured && (
                    <SetupSection
                        title="Google Workspace (Calendar, Drive, Meet)"
                        icon={Wrench}
                        isConfigured={isGoogleConfigured}
                        defaultOpen
                    >
                        <div className="space-y-4 text-sm text-muted-foreground">
                            <div>
                                <p className="font-medium text-foreground mb-2">Step 1: Create a Google Cloud project</p>
                                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                                    <li>
                                        Go to{' '}
                                        <a
                                            href="https://console.cloud.google.com/projectcreate"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            Google Cloud Console
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </li>
                                    <li>Create a new project (any name works, e.g. &quot;ForgeOS&quot;)</li>
                                    <li>
                                        Enable these APIs in{' '}
                                        <a
                                            href="https://console.cloud.google.com/apis/library"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            API Library
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                        :
                                        <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                                            <li>Google Calendar API</li>
                                            <li>Google Drive API</li>
                                        </ul>
                                    </li>
                                </ol>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 2: Create OAuth credentials</p>
                                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                                    <li>
                                        Go to{' '}
                                        <a
                                            href="https://console.cloud.google.com/apis/credentials"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            Credentials page
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </li>
                                    <li>Click <strong>Create Credentials</strong> &rarr; <strong>OAuth client ID</strong></li>
                                    <li>Choose <strong>Web application</strong></li>
                                    <li>Add this as an <strong>Authorized redirect URI</strong>:</li>
                                </ol>
                                <div className="mt-2">
                                    <CodeBlock>{`${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/google/callback`}</CodeBlock>
                                </div>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 3: Configure the OAuth consent screen</p>
                                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                                    <li>
                                        Go to{' '}
                                        <a
                                            href="https://console.cloud.google.com/apis/credentials/consent"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            OAuth consent screen
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </li>
                                    <li>Choose <strong>External</strong> user type</li>
                                    <li>Fill in app name, support email, and developer email</li>
                                    <li>Add scopes: <code className="text-xs bg-muted px-1 rounded">calendar</code>, <code className="text-xs bg-muted px-1 rounded">calendar.events</code>, <code className="text-xs bg-muted px-1 rounded">drive.readonly</code></li>
                                    <li>Add test users (your Google email) while in testing mode</li>
                                </ol>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 4: Add environment variables</p>
                                <p className="mb-2">
                                    Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Step 2, then add to your <code className="text-xs bg-muted px-1 rounded">.env.local</code>:
                                </p>
                                <div className="space-y-2">
                                    <CodeBlock>GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com</CodeBlock>
                                    <CodeBlock>GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret</CodeBlock>
                                    <CodeBlock>GOOGLE_CALENDAR_WEBHOOK_SECRET=any-random-string</CodeBlock>
                                </div>
                                <p className="mt-2 text-xs">
                                    Generate the webhook secret with: <code className="bg-muted px-1 rounded">openssl rand -hex 32</code>
                                </p>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 5: Apply the database migration</p>
                                <p className="mb-2">
                                    The integration needs two new tables. Run this from your project root:
                                </p>
                                <CodeBlock>npx supabase db push</CodeBlock>
                                <p className="mt-2 text-xs">
                                    This creates <code className="bg-muted px-1 rounded">google_oauth_tokens</code> and <code className="bg-muted px-1 rounded">calendar_sync_mappings</code> tables with RLS policies.
                                </p>
                            </div>

                            <div className="rounded-md bg-muted/50 p-3 text-xs">
                                <p className="font-medium text-foreground">After adding the env vars and running the migration, restart your dev server and refresh this page. The &quot;Connect Google Account&quot; button will appear below.</p>
                            </div>
                        </div>
                    </SetupSection>
                )}

                {/* Resend (Email) Setup */}
                {!isResendConfigured && (
                    <SetupSection
                        title="Email Notifications (Resend)"
                        icon={Mail}
                        isConfigured={isResendConfigured}
                    >
                        <div className="space-y-4 text-sm text-muted-foreground">
                            <div>
                                <p className="font-medium text-foreground mb-2">Step 1: Create a Resend account</p>
                                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                                    <li>
                                        Sign up at{' '}
                                        <a
                                            href="https://resend.com/signup"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            resend.com
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </li>
                                    <li>
                                        Go to{' '}
                                        <a
                                            href="https://resend.com/api-keys"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                        >
                                            API Keys
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                        {' '}and create a new key
                                    </li>
                                </ol>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 2: (Optional) Verify your domain</p>
                                <p className="ml-1">
                                    For production, add your sending domain in Resend&apos;s{' '}
                                    <a
                                        href="https://resend.com/domains"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-electric-blue hover:underline inline-flex items-center gap-1"
                                    >
                                        Domains
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {' '}page. For development, Resend lets you send to your own email from <code className="text-xs bg-muted px-1 rounded">onboarding@resend.dev</code>.
                                </p>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 3: Add environment variables</p>
                                <div className="space-y-2">
                                    <CodeBlock>RESEND_API_KEY=re_your-api-key</CodeBlock>
                                    <CodeBlock>EMAIL_FROM_ADDRESS=ForgeOS &lt;noreply@yourdomain.com&gt;</CodeBlock>
                                </div>
                            </div>

                            <div>
                                <p className="font-medium text-foreground mb-2">Step 4: (Optional) Enable email-to-task</p>
                                <p className="mb-2">
                                    To let users create tasks by emailing <code className="text-xs bg-muted px-1 rounded">tasks+token@yourdomain.com</code>:
                                </p>
                                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                                    <li>In Resend Dashboard, go to <strong>Inbound</strong> and add your domain</li>
                                    <li>Add the MX/TXT DNS records Resend provides</li>
                                    <li>Set webhook URL to <code className="text-xs bg-muted px-1 rounded">https://your-domain.com/api/email/inbound</code></li>
                                    <li>Add the webhook secret to your env:</li>
                                </ol>
                                <div className="mt-2">
                                    <CodeBlock>EMAIL_INBOUND_WEBHOOK_SECRET=any-random-string</CodeBlock>
                                </div>
                            </div>

                            <div className="rounded-md bg-muted/50 p-3 text-xs">
                                <p className="font-medium text-foreground">Outbound email notifications work immediately after adding the API key. Inbound email-to-task requires the DNS setup in Step 4.</p>
                            </div>
                        </div>
                    </SetupSection>
                )}
            </CardContent>
        </Card>
    )
}
