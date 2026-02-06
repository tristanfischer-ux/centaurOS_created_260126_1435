'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ChevronsUpDown, Check, Building2 } from 'lucide-react'
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
  const router = useRouter()

  const hasMultipleFoundries = foundries.length > 1

  function handleSwitch(foundryId: string) {
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

  // Single foundry - just show info, no dropdown
  if (!hasMultipleFoundries) {
    return (
      <div className="px-4 pb-4">
        <div className="text-sm font-semibold text-foreground uppercase tracking-wider truncate">
          {currentFoundryName || 'My Foundry'}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-wide">
          {currentFoundryId || 'Loading...'}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="text-sm text-muted-foreground truncate">
            {userName || 'Loading...'}
          </div>
          <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
            {userRole || 'Member'}
          </span>
        </div>
      </div>
    )
  }

  // Multiple foundries - show switcher dropdown
  const activeFoundry = foundries.find(f => f.isActive) || foundries[0]

  return (
    <div className="px-4 pb-4">
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
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mt-3 flex items-center gap-2">
        <div className="text-sm text-muted-foreground truncate">
          {userName || 'Loading...'}
        </div>
        <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
          {activeFoundry?.role || userRole || 'Member'}
        </span>
      </div>
    </div>
  )
}
