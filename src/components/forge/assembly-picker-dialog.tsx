'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Blocks, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  getUserDraftAssemblies,
  createDraftAssembly,
  addComponentToAssembly,
  type DraftAssembly,
} from '@/actions/component-assembly'

interface AssemblyPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId: string
  componentName: string
  onSuccess?: () => void
}

/**
 * AssemblyPickerDialog — Choose an assembly to add the current component to.
 *
 * @description Lists the user's draft assemblies and a "Create New Assembly"
 * option. On select, adds the component via addComponentToAssembly and shows
 * a success toast with a link to the assembly workbench.
 */
export function AssemblyPickerDialog({
  open,
  onOpenChange,
  componentId,
  componentName,
  onSuccess,
}: AssemblyPickerDialogProps) {
  const router = useRouter()
  const [assemblies, setAssemblies] = useState<DraftAssembly[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  const loadAssemblies = useCallback(async () => {
    setLoading(true)
    const result = await getUserDraftAssemblies()
    setLoading(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setAssemblies(result)
  }, [])

  useEffect(() => {
    if (open) {
      loadAssemblies()
    }
  }, [open, loadAssemblies])

  const handleSelect = async (assemblyId: string) => {
    setAdding(assemblyId)
    const result = await addComponentToAssembly(assemblyId, componentId)
    setAdding(null)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success('Component added', {
      description: `${componentName} was added to the assembly.`,
      action: {
        label: 'Open assembly',
        onClick: () => router.push(`/the-forge/assembly-builder/${assemblyId}`),
      },
    })
    onOpenChange(false)
    onSuccess?.()
  }

  const handleCreateNew = async () => {
    setAdding('new')
    const created = await createDraftAssembly()
    if ('error' in created) {
      setAdding(null)
      toast.error(created.error)
      return
    }
    const result = await addComponentToAssembly(created.assemblyId, componentId)
    setAdding(null)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success('Assembly created', {
      description: `${componentName} was added to a new assembly.`,
      action: {
        label: 'Open assembly',
        onClick: () => router.push(`/the-forge/assembly-builder/${created.assemblyId}`),
      },
    })
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blocks className="h-5 w-5 text-international-orange" />
            Add to Assembly
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose an assembly to add &quot;{componentName}&quot; to, or create a new one.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleCreateNew}
              disabled={adding !== null}
            >
              {adding === 'new' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create New Assembly
            </Button>

            {assemblies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No draft assemblies yet. Create one above.
              </p>
            ) : (
              <ul className="space-y-1">
                {assemblies.map((a) => (
                  <li key={a.id}>
                    <Button
                      variant="ghost"
                      className="w-full justify-between font-normal h-auto py-2"
                      onClick={() => handleSelect(a.id)}
                      disabled={adding !== null}
                    >
                      <span className="truncate">{a.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0 ml-2">
                        {a.componentCount} component{a.componentCount !== 1 ? 's' : ''}
                      </span>
                      {adding === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0 ml-2" />
                      ) : null}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
