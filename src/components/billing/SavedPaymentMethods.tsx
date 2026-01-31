'use client'

/**
 * Saved Payment Methods Manager
 * Allows users to view, add, set default, and delete payment methods
 */

import { useState, useEffect } from 'react'
import { CreditCard, Plus, Trash2, Star, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  SavedPaymentMethod,
  formatCardDisplay,
  isCardExpiringSoon,
  isCardExpired,
} from '@/types/billing'
import {
  getSavedPaymentMethods,
  setDefaultPaymentMethod,
  deletePaymentMethod,
} from '@/actions/billing'
import { AddPaymentMethodDialog } from './AddPaymentMethodDialog'

interface SavedPaymentMethodsProps {
  className?: string
  onSelect?: (method: SavedPaymentMethod) => void
  selectable?: boolean
  selectedMethodId?: string
}

export function SavedPaymentMethods({
  className,
  onSelect,
  selectable = false,
  selectedMethodId,
}: SavedPaymentMethodsProps) {
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadMethods = async () => {
    setIsLoading(true)
    setError(null)
    const { methods: data, error: err } = await getSavedPaymentMethods()
    if (err) {
      setError(err)
    } else {
      setMethods(data)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadMethods()
  }, [])

  const handleSetDefault = async (methodId: string) => {
    setActionLoading(methodId)
    const { error: err } = await setDefaultPaymentMethod(methodId)
    if (!err) {
      // Update local state
      setMethods(prev =>
        prev.map(m => ({
          ...m,
          isDefault: m.id === methodId,
        }))
      )
    }
    setActionLoading(null)
  }

  const handleDelete = async (methodId: string) => {
    setActionLoading(methodId)
    const { error: err } = await deletePaymentMethod(methodId)
    if (!err) {
      setMethods(prev => prev.filter(m => m.id !== methodId))
    }
    setDeleteConfirmId(null)
    setActionLoading(null)
  }

  const handleMethodAdded = (method: SavedPaymentMethod) => {
    setMethods(prev => {
      // If this is the new default, update others
      if (method.isDefault) {
        return [method, ...prev.map(m => ({ ...m, isDefault: false }))]
      }
      return [method, ...prev]
    })
    setIsAddDialogOpen(false)
  }

  const getCardIcon = (brand: string | null) => {
    // Could be extended to show brand-specific icons
    return <CreditCard className="h-5 w-5 text-muted-foreground" />
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Payment Methods</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Payment Methods</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Card
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm mb-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {methods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No payment methods saved yet
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Card
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {methods.map(method => {
                const expired = isCardExpired(method)
                const expiringSoon = isCardExpiringSoon(method)
                const isSelected = selectable && selectedMethodId === method.id

                return (
                  <div
                    key={method.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border transition-colors',
                      selectable && 'cursor-pointer hover:bg-muted/50',
                      isSelected && 'border-primary bg-primary/5',
                      expired && 'opacity-60'
                    )}
                    onClick={
                      selectable && !expired
                        ? () => onSelect?.(method)
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-4">
                      {getCardIcon(method.cardBrand)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {formatCardDisplay(method)}
                          </span>
                          {method.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                          {expired && (
                            <Badge variant="destructive" className="text-xs">
                              Expired
                            </Badge>
                          )}
                          {expiringSoon && !expired && (
                            <Badge variant="warning" className="text-xs">
                              Expiring Soon
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Expires {method.cardExpMonth}/{method.cardExpYear}
                        </p>
                      </div>
                    </div>

                    {!selectable && (
                      <div className="flex items-center gap-2">
                        {!method.isDefault && !expired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(method.id)}
                            disabled={actionLoading === method.id}
                          >
                            {actionLoading === method.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Star className="h-4 w-4" />
                            )}
                            <span className="sr-only">Set as default</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(method.id)}
                          disabled={actionLoading === method.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddPaymentMethodDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={handleMethodAdded}
      />

      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={open => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Method?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this card from your account. You can always add it
              back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === deleteConfirmId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
