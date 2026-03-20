/**
 * @file OutreachDraftDialog.tsx
 *
 * @description Dialog for generating and viewing AI-powered outreach drafts.
 * Shows email subject/body and LinkedIn message with copy buttons.
 * Professional+ only.
 */

'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Copy, Loader2, RefreshCw, Mail, Linkedin } from 'lucide-react'
import { generateOutreachDraft } from '@/actions/investor-outreach'
import { toast } from 'sonner'
import type { OutreachDraft } from '@/actions/investor-outreach'

interface OutreachDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listingId: string
  firmName: string
}

export function OutreachDraftDialog({
  open,
  onOpenChange,
  listingId,
  firmName,
}: OutreachDraftDialogProps) {
  const [draft, setDraft] = useState<OutreachDraft | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    setError(null)
    startTransition(async () => {
      const result = await generateOutreachDraft(listingId)
      if (result.error) {
        setError(result.error)
      } else if (result.draft) {
        setDraft(result.draft)
      }
    })
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error('Failed to copy — try selecting the text manually'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Draft Outreach — {firmName}
          </DialogTitle>
        </DialogHeader>

        {!draft && !isPending && !error && (
          <div className="text-center py-8 space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a personalized cold email and LinkedIn message for {firmName}.
            </p>
            <Button onClick={handleGenerate} className="bg-international-orange hover:bg-international-orange-hover">
              Generate Draft
            </Button>
          </div>
        )}

        {isPending && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-international-orange" />
            <p className="text-sm text-muted-foreground">Crafting your outreach…</p>
          </div>
        )}

        {error && (
          <div className="text-center py-8 space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="secondary" onClick={handleGenerate}>
              Try again
            </Button>
          </div>
        )}

        {draft && !isPending && (
          <div className="space-y-4">
            <Tabs defaultValue="email">
              <TabsList className="w-full">
                <TabsTrigger value="email" className="flex-1 gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="linkedin" className="flex-1 gap-1.5 text-xs">
                  <Linkedin className="h-3.5 w-3.5" />
                  LinkedIn
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-3 mt-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Subject</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => copyToClipboard(draft.subject, 'Subject')}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium text-foreground">{draft.subject}</p>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Body</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => copyToClipboard(draft.body, 'Email body')}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {draft.body}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="linkedin" className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Connection Note</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => copyToClipboard(draft.linkedinMessage, 'LinkedIn message')}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{draft.linkedinMessage}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {draft.linkedinMessage.length}/300 characters
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleGenerate} className="text-xs gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
