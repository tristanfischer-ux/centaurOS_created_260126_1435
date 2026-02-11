import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpCircle, Keyboard } from 'lucide-react'
import Link from 'next/link'

/**
 * Help & Support Page
 * 
 * @description Keyboard shortcuts, tips, and support contact information.
 * Accessible to all users.
 */
export default function HelpPage() {
    return (
        <div className="space-y-6">
            <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-international-orange" />
                        <CardTitle>Help & Support</CardTitle>
                    </div>
                    <CardDescription>Tips and support to help you get the most out of ForgeOS.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Quick Tips */}
                    <div className="p-4 bg-international-orange-light rounded-lg border border-international-orange/20">
                        <div className="flex items-start gap-3">
                            <Keyboard className="h-5 w-5 text-international-orange mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Pro Tip: Command Palette</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Press <kbd className="px-1.5 py-0.5 bg-background rounded border border-muted font-mono text-xs">⌘K</kbd> (Mac) or <kbd className="px-1.5 py-0.5 bg-background rounded border border-muted font-mono text-xs">Ctrl+K</kbd> (Windows) to quickly navigate, search, or perform actions from anywhere in the app.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Support Contact */}
                    <div className="pt-4 border-t border-muted">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Need help?</p>
                                <p className="text-sm text-muted-foreground">Contact our support team for personalized assistance.</p>
                            </div>
                            <Link 
                                href="mailto:support@forgeos.ai" 
                                className="text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors"
                            >
                                support@forgeos.ai
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
