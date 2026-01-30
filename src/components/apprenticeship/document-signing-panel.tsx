// @ts-nocheck
'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  FileSignature, 
  FileCheck, 
  BookOpen, 
  ClipboardList,
  FolderOpen,
  Shield,
  Award,
  Medal,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
  Download
} from 'lucide-react'
import { 
  getEnrollmentDocuments,
  signDocument
} from '@/actions/apprenticeship-documents'
import { 
  DOCUMENT_TYPE_INFO,
  type ApprenticeshipDocument,
  type DocumentType,
  type Signature,
  type RequiredSignature
} from '@/types/apprenticeship'

interface DocumentSigningPanelProps {
  enrollmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: 'apprentice' | 'mentor'
}

const iconMap: Record<string, typeof File> = {
  FileSignature,
  FileCheck,
  BookOpen,
  ClipboardList,
  FolderOpen,
  Shield,
  Award,
  Medal,
  File
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary"><File className="h-3 w-3 mr-1" />Draft</Badge>
    case 'pending_signatures':
      return <Badge variant="warning"><Clock className="h-3 w-3 mr-1" />Awaiting Signatures</Badge>
    case 'partially_signed':
      return <Badge variant="info"><FileCheck className="h-3 w-3 mr-1" />Partially Signed</Badge>
    case 'signed':
      return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Signed</Badge>
    case 'expired':
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Expired</Badge>
    case 'superseded':
      return <Badge variant="secondary"><File className="h-3 w-3 mr-1" />Superseded</Badge>
    default:
      return <Badge>{status}</Badge>
  }
}

export function DocumentSigningPanel({ enrollmentId, open, onOpenChange, userRole }: DocumentSigningPanelProps) {
  const [documents, setDocuments] = useState<ApprenticeshipDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<ApprenticeshipDocument | null>(null)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open && enrollmentId) {
      loadDocuments()
    }
  }, [open, enrollmentId])

  async function loadDocuments() {
    setLoading(true)
    const result = await getEnrollmentDocuments(enrollmentId)
    if (result.documents) {
      setDocuments(result.documents)
    }
    setLoading(false)
  }

  function openSignDialog(doc: ApprenticeshipDocument) {
    setSelectedDocument(doc)
    setConfirmChecked(false)
    setSignDialogOpen(true)
  }

  async function handleSign() {
    if (!selectedDocument || !confirmChecked) return
    
    startTransition(async () => {
      const result = await signDocument(selectedDocument.id)
      if (result.success) {
        await loadDocuments()
        setSignDialogOpen(false)
        setSelectedDocument(null)
      }
    })
  }

  // Separate documents by status
  const pendingDocs = documents.filter(d => 
    d.status === 'pending_signatures' || d.status === 'partially_signed'
  )
  const completedDocs = documents.filter(d => d.status === 'signed')
  const otherDocs = documents.filter(d => 
    !['pending_signatures', 'partially_signed', 'signed'].includes(d.status)
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-full overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1 w-8 bg-international-orange rounded-full" />
            </div>
            <SheetTitle className="text-xl">Apprenticeship Documents</SheetTitle>
            <p className="text-sm text-muted-foreground">
              View, download, and sign your apprenticeship documents
            </p>
          </SheetHeader>

          <div className="py-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <File className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Documents Yet</h3>
                <p className="text-muted-foreground">
                  Your apprenticeship documents will appear here once created.
                </p>
              </div>
            ) : (
              <>
                {/* Pending Signatures */}
                {pendingDocs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4 text-status-warning" />
                      Requires Your Attention ({pendingDocs.length})
                    </h3>
                    {pendingDocs.map((doc) => (
                      <DocumentCard 
                        key={doc.id} 
                        document={doc} 
                        onSign={() => openSignDialog(doc)}
                        showSignButton={true}
                      />
                    ))}
                  </div>
                )}

                {/* Completed Documents */}
                {completedDocs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-status-success" />
                      Completed Documents ({completedDocs.length})
                    </h3>
                    {completedDocs.map((doc) => (
                      <DocumentCard 
                        key={doc.id} 
                        document={doc}
                        showSignButton={false}
                      />
                    ))}
                  </div>
                )}

                {/* Other Documents */}
                {otherDocs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Other Documents ({otherDocs.length})
                    </h3>
                    {otherDocs.map((doc) => (
                      <DocumentCard 
                        key={doc.id} 
                        document={doc}
                        showSignButton={false}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sign Confirmation Dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-international-orange" />
              Sign Document
            </DialogTitle>
            <DialogDescription>
              Please review the document before signing
            </DialogDescription>
          </DialogHeader>
          
          {selectedDocument && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      {(() => {
                        const info = DOCUMENT_TYPE_INFO[selectedDocument.document_type]
                        const IconComponent = iconMap[info?.icon || 'File'] || File
                        return <IconComponent className="h-5 w-5 text-foreground" />
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium">{selectedDocument.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {DOCUMENT_TYPE_INFO[selectedDocument.document_type]?.label || selectedDocument.document_type}
                      </p>
                      {selectedDocument.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedDocument.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Signatures Status */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Signatures</p>
                <div className="space-y-2">
                  {(selectedDocument.requires_signatures || []).map((req: RequiredSignature) => {
                    const signed = (selectedDocument.signatures || []).find(
                      (s: Signature) => s.user_id === req.user_id
                    )
                    return (
                      <div 
                        key={req.user_id} 
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <UserAvatar 
                            name={req.full_name || 'Unknown'} 
                            size="sm"
                            role={req.role}
                          />
                          <div>
                            <p className="text-sm font-medium">{req.full_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{req.role}</p>
                          </div>
                        </div>
                        {signed ? (
                          <Badge variant="success" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Signed {new Date(signed.signed_at).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* View Document Link */}
              {selectedDocument.file_url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedDocument.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full Document
                  </a>
                </Button>
              )}

              {/* Confirmation Checkbox */}
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <Checkbox 
                  id="confirm-sign"
                  checked={confirmChecked}
                  onCheckedChange={(checked) => setConfirmChecked(checked === true)}
                />
                <label htmlFor="confirm-sign" className="text-sm leading-tight cursor-pointer">
                  I have read and understood this document. I confirm that by clicking "Sign Document" 
                  below, I am electronically signing this document and agree to its terms.
                </label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSignDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSign}
              disabled={!confirmChecked || isPending}
              className="bg-international-orange hover:bg-international-orange-hover"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <FileSignature className="h-4 w-4 mr-1" />
              Sign Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface DocumentCardProps {
  document: ApprenticeshipDocument
  onSign?: () => void
  showSignButton: boolean
}

function DocumentCard({ document, onSign, showSignButton }: DocumentCardProps) {
  const info = DOCUMENT_TYPE_INFO[document.document_type]
  const IconComponent = iconMap[info?.icon || 'File'] || File
  
  const signedCount = (document.signatures || []).length
  const requiredCount = (document.requires_signatures || []).length
  
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-muted rounded-lg shrink-0">
            <IconComponent className="h-5 w-5 text-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-medium text-foreground">{document.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {info?.label || document.document_type}
                </p>
              </div>
              {getStatusBadge(document.status)}
            </div>
            
            {document.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {document.description}
              </p>
            )}
            
            {requiredCount > 0 && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <FileSignature className="h-3 w-3" />
                {signedCount} of {requiredCount} signatures
              </div>
            )}
            
            <div className="flex items-center gap-2 mt-3">
              {document.file_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={document.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </a>
                </Button>
              )}
              {showSignButton && onSign && (
                <Button size="sm" onClick={onSign}>
                  <FileSignature className="h-3 w-3 mr-1" />
                  Review & Sign
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
