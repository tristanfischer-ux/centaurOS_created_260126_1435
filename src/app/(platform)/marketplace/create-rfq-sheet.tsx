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
  const router = useRouter()

  const handleSuccess = (rfqId: string) => {
    setOpen(false)
    toast.success('RFQ created successfully', {
      description: 'Suppliers will be notified based on your urgency settings.',
      action: {
        label: 'View RFQ',
        onClick: () => router.push(`/rfq/${rfqId}`),
      },
    })
    router.refresh()
  }

  const handleCancel = () => {
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
        
        <div className="h-[100dvh] overflow-hidden">
          <RFQCreator
            initialCategory={initialCategory}
            initialDescription={initialDescription}
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
