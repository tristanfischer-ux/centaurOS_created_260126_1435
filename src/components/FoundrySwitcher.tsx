'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ChevronsUpDown, Check, Building2, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { switchFoundry } from '@/actions/foundry-switching'
import { useRouter } from 'next/navigation'
import { CreateFoundryDialog } from '@/components/foundry/create-foundry-dialog'

interface Foundry {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
}

interface FoundrySwitcherProps {
  foundries: Foundry[]
  currentFoundryId?: string
  currentFoundryName?: string
  userName?: string
  userRole?: string
}

export function FoundrySwitcher({
  foundries,
  currentFoundryId,
  currentFoundryName,
  userName,
  userRole,
}: FoundrySwitcherProps) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const router = useRouter()

  const hasMultipleFoundries = foundries.length > 1

  function handleSwitch(foundryId: string): void {
    if (foundryId === currentFoundryId) {
      setOpen(false)
      return
    }
    
    startTransition(async () => {
      const result = await switchFoundry(foundryId)
      if (result.success) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  function handleStartBusiness(): void {
    setOpen(false)
    setIsCreateOpen(true)
  }

  // Single foundry - show info with "Start Your Business" CTA
  if (!hasMultipleFoundries) {
    return (
      <div className="px-4 pb-2">
        <div className="text-sm font-semibold text-foreground uppercase tracking-wider truncate">
          {currentFoundryName || 'My Foundry'}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-wide">
          {currentFoundryId || 'Loading...'}
        </div>
        {/* Start Your Business CTA for single-foundry users */}
        <button
          onClick={handleStartBusiness}
          className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-international-orange hover:bg-orange-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Start your own business
        </button>
        <CreateFoundryDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      </div>
    )
  }

  // Multiple foundries - show switcher dropdown with "Start Your Business" option
  const activeFoundry = foundries.find(f => f.isActive) || foundries[0]

  return (
    <div className="px-4 pb-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between rounded-md px-2 py-2 -mx-2',
              'hover:bg-muted transition-colors text-left',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange',
              isPending && 'opacity-50 pointer-events-none'
            )}
            disabled={isPending}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground uppercase tracking-wider truncate">
                {activeFoundry?.foundryName || currentFoundryName || 'My Foundry'}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-wide">
                {isPending ? 'Switching...' : (activeFoundry?.foundryId || currentFoundryId)}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Your Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {foundries.map((foundry) => (
            <DropdownMenuItem
              key={foundry.foundryId}
              onClick={() => handleSwitch(foundry.foundryId)}
              className="flex items-center gap-3 py-3 cursor-pointer"
            >
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{foundry.foundryName}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-international-orange font-mono uppercase px-1 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
                    {foundry.role}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {foundry.memberCount} {foundry.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>
              {foundry.isActive && (
                <Check className="h-4 w-4 text-international-orange flex-shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          {/* Start Your Business CTA */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleStartBusiness}
            className="flex items-center gap-3 py-3 cursor-pointer text-international-orange"
          >
            <Plus className="h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Start your own business</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Create a new workspace
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateFoundryDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  )
}
