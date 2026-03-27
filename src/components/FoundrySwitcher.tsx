/**
 * @file FoundrySwitcher.tsx — Company identity block with logo and foundry switcher.
 *
 * @description Displays the active foundry/company name with an optional logo.
 * When the user belongs to multiple foundries, renders a dropdown to switch
 * between workspaces. When only one foundry exists, shows a static display.
 *
 * @related
 * - Sidebar: src/components/Sidebar.tsx (renders this component)
 * - Foundry switching action: src/actions/foundry-switching.ts
 * - Platform layout: src/app/(platform)/layout.tsx (passes foundry data)
 */

'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ChevronsUpDown, Check, Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
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
import { CreateCompanyDialog } from '@/components/create-company-dialog'

interface Foundry {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  /** URL to the foundry's logo image, if uploaded */
  logoUrl?: string | null
  /** Whether this is a personal sandbox workspace */
  isSandbox?: boolean
}

interface FoundrySwitcherProps {
  foundries: Foundry[]
  currentFoundryId?: string
  currentFoundryName?: string
  /** URL to the active foundry's logo image */
  currentFoundryLogoUrl?: string | null
  /** Whether the active foundry is a personal sandbox */
  currentFoundryIsSandbox?: boolean
  userName?: string
  userRole?: string
}

/**
 * Renders a circular logo or Building2 fallback icon.
 *
 * @param logoUrl - URL to the logo image, or null/undefined for fallback
 * @param name - Company name used for alt text
 * @param size - Pixel size of the circle (default 32)
 */
function FoundryLogo({ logoUrl, name, size = 32 }: { logoUrl?: string | null; name: string; size?: number }): React.ReactElement {
  if (logoUrl) {
    return (
      <div
        className="relative flex-shrink-0 rounded-full overflow-hidden bg-muted"
        style={{ width: size, height: size }}
      >
        <Image
          src={logoUrl}
          alt={`${name} logo`}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      </div>
    )
  }

  return (
    <div
      className="flex items-center justify-center flex-shrink-0 rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </div>
  )
}

export function FoundrySwitcher({
  foundries,
  currentFoundryId,
  currentFoundryName,
  currentFoundryLogoUrl,
  currentFoundryIsSandbox,
  userName,
  userRole,
}: FoundrySwitcherProps): React.ReactElement {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const [isCreateOpen, setIsCreateOpen] = useState(false)

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
      } else {
        toast.error(result.error || 'Failed to switch workspace')
      }
    })
  }

  // DECISION: Always show the dropdown — even for single-foundry users.
  // This surfaces the "Create a Company" CTA for executives who haven't
  // created a company workspace yet.
  const activeFoundry = foundries.find(f => f.isActive) || foundries[0]
  const activeName = activeFoundry?.foundryName || currentFoundryName || 'My Foundry'
  const activeLogo = activeFoundry?.logoUrl || currentFoundryLogoUrl

  return (
    <div className="px-1 pb-1">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-3 rounded-md px-2 py-2 -mx-2',
              'hover:bg-muted transition-colors text-left',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange',
              isPending && 'opacity-50 pointer-events-none'
            )}
            disabled={isPending}
          >
            <FoundryLogo logoUrl={activeLogo} name={activeName} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground uppercase tracking-wider truncate">
                {activeName}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-wide">
                {isPending ? 'Switching...' : (activeFoundry?.isSandbox || currentFoundryIsSandbox) ? 'Personal Workspace' : (activeFoundry?.foundryId || currentFoundryId)}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
              <FoundryLogo logoUrl={foundry.logoUrl} name={foundry.foundryName} size={24} />
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { setOpen(false); setIsCreateOpen(true) }}
            className="flex items-center gap-3 py-3 cursor-pointer text-international-orange"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-international-orange/10 flex-shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-medium">Create a Company</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateCompanyDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  )
}
