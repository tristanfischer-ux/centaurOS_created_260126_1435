'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Plus } from 'lucide-react'
import { RFQCreator } from '@/components/rfq/RFQCreator'
import { RFQTemplatePicker } from '@/components/rfq/RFQTemplatePicker'
import { toast } from 'sonner'

interface CreateRFQSheetProps {
  // Optional pre-fill context
  initialCategory?: string
  initialDescription?: string
  targetSupplierId?: string
  
  // Custom trigger button (if not using default)
  trigger?: React.ReactNode
}

export function CreateRFQSheet({
  initialCategory,
  initialDescription,
  targetSupplierId,
  trigger,
}: CreateRFQSheetProps) {
  const [open, setOpen] = useState(false)
  const [showTemplates, setShowTemplates] = useState(true)
  const [prefillCategory, setPrefillCategory] = useState(initialCategory || '')
  const [prefillDescription, setPrefillDescription] = useState(initialDescription || '')
  const router = useRouter()

  const handleSuccess = (rfqId: string) => {
    setOpen(false)
    setShowTemplates(true)
    toast.success('RFQ created successfully', {
      description: 'Suppliers will be notified based on your urgency settings.',
      action: {
        label: 'View RFQ',
        onClick: () => router.push(`/rfq/${rfqId}`),
      },
    })
  }

  const handleCancel = () => {
    setOpen(false)
    setShowTemplates(true)
  }

  const handleTemplateSelect = (template: { title: string; category: string; description: string; rfqType: string }) => {
    setPrefillCategory(template.category)
    setPrefillDescription(`${template.title}\n\n${template.description}`)
    setShowTemplates(false)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => {
      setOpen(v)
      if (!v) setShowTemplates(true)
    }}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" variant="default" className="shadow-md">
          <Plus className="w-4 h-4 mr-2" />
          Create RFQ
        </Button>
      )}
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[min(95vw,1200px)] p-0 overflow-hidden"
      >
        {/* Visually hidden but accessible title and description */}
        <SheetHeader className="sr-only">
          <SheetTitle>Create Request for Quote</SheetTitle>
          <SheetDescription>
            Create a new RFQ to request quotes from suppliers in the marketplace
          </SheetDescription>
        </SheetHeader>
        
        <div className="h-[100dvh] overflow-y-auto">
          {/* Template picker shown initially */}
          {showTemplates && (
            <div className="p-6 border-b">
              <RFQTemplatePicker
                onSelect={handleTemplateSelect}
              />
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setShowTemplates(false)}
                >
                  Skip templates, start from scratch
                </Button>
              </div>
            </div>
          )}
          <RFQCreator
            initialCategory={prefillCategory}
            initialDescription={prefillDescription}
            targetSupplierId={targetSupplierId}
            defaultPreviewOpen={true}
            showPreviewToggle={true}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
