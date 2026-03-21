"use client"

/**
 * @file create-company-dialog.tsx
 *
 * @description 2-step wizard dialog for creating a company workspace.
 * Step 1: Company Name (required). Step 2: Industry + Stage (optional).
 * Calls createCompanyFoundry on submit, which creates a new foundry,
 * upgrades the user to Founder role, and switches active workspace.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, ArrowRight, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCompanyFoundry } from "@/actions/create-company"

interface CreateCompanyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateCompanyDialog({ open, onOpenChange }: CreateCompanyDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [companyName, setCompanyName] = useState("")
  const [industry, setIndustry] = useState("")
  const [stage, setStage] = useState("")
  const [isPending, startTransition] = useTransition()

  function reset() {
    setStep(1)
    setCompanyName("")
    setIndustry("")
    setStage("")
  }

  function handleNext() {
    if (!companyName.trim() || companyName.trim().length < 2) return
    setStep(2)
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createCompanyFoundry({
        companyName: companyName.trim(),
        industry: industry.trim() || undefined,
        stage: stage.trim() || undefined,
      })

      if (result.success) {
        toast.success(`${result.foundryName} created! Switching to your new workspace.`)
        reset()
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-international-orange/10">
              <Building2 className="w-5 h-5 text-international-orange" />
            </div>
            <div>
              <DialogTitle>Create a Company</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {step === 1 ? "Step 1 of 2 — Name your workspace" : "Step 2 of 2 — Optional details"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="create-company-name" className="text-sm font-medium">
                Company Name
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="create-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company name"
                maxLength={100}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleNext() }}
              />
              <p className="text-xs text-muted-foreground">
                You can change this later in Settings.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleNext}
                disabled={!companyName.trim() || companyName.trim().length < 2}
                className="bg-international-orange hover:bg-international-orange/90 text-white"
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-company-industry" className="text-sm font-medium">
                  Industry
                </Label>
                <Input
                  id="create-company-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Hardware, DeepTech..."
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-company-stage" className="text-sm font-medium">
                  Stage
                </Label>
                <Input
                  id="create-company-stage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  placeholder="Pre-seed, Seed..."
                  maxLength={100}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Both optional — you can fill these in later.
            </p>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={isPending}>
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-international-orange hover:bg-international-orange/90 text-white"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  "Create Company"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
