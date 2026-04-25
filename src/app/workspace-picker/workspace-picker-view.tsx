'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { switchFoundry } from '@/actions/foundry-switching'
import { Building2, Users, ArrowRight, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Foundry {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
  logoUrl: string | null
}

export function WorkspacePickerView({ foundries }: { foundries: Foundry[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSelect(foundryId: string) {
    startTransition(async () => {
      const result = await switchFoundry(foundryId)
      if (result.success) {
        router.push('/investors')
      }
    })
  }

  // Keyboard shortcuts: press 1-9 to quick-select a workspace
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const index = parseInt(e.key) - 1
      if (index >= 0 && index < foundries.length && !isPending) {
        handleSelect(foundries[index].foundryId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundries, isPending])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="font-display text-2xl font-bold tracking-[0.05em] text-foreground">
              ForgeOS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse shadow-[0_0_8px_rgba(255,69,0,0.6)]" />
          </div>
          <h1 className="text-3xl font-display font-semibold text-foreground tracking-tight mb-2">
            Choose a Workspace
          </h1>
          <p className="text-muted-foreground text-sm">
            You belong to {foundries.length} workspaces. Select one to continue.
          </p>
        </div>

        {/* Foundry Cards */}
        <div className="space-y-3">
          {foundries.map((foundry, index) => (
            <button
              key={foundry.foundryId}
              onClick={() => handleSelect(foundry.foundryId)}
              disabled={isPending}
              className={cn(
                "w-full group flex items-center gap-4 p-5 rounded-lg border bg-card hover:border-international-orange/40 hover:shadow-md transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none",
                foundry.isActive && "border-international-orange/30 ring-1 ring-international-orange/20"
              )}
            >
              {/* Keyboard hint */}
              <span className="text-xs text-muted-foreground font-mono opacity-50 group-hover:opacity-100 transition-opacity w-4 text-center flex-shrink-0">
                {index + 1}
              </span>

              {/* Logo / Icon */}
              {foundry.logoUrl ? (
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <Image
                    src={foundry.logoUrl}
                    alt={`${foundry.foundryName} logo`}
                    width={48}
                    height={48}
                    className="object-cover h-full w-full"
                  />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-lg bg-international-orange-light border border-international-orange/20 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6 text-international-orange" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground truncate">
                    {foundry.foundryName}
                  </h3>
                  {foundry.isPrimary && (
                    <Star className="h-3.5 w-3.5 text-international-orange fill-international-orange flex-shrink-0" />
                  )}
                  {foundry.isActive && (
                    <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-international-orange-light border border-international-orange/20 font-semibold tracking-wide flex-shrink-0">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-international-orange-light border border-international-orange/20 font-semibold tracking-wide">
                    {foundry.role}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {foundry.memberCount} {foundry.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">1</kbd>–<kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">{foundries.length}</kbd> to quick-select, or switch anytime from the sidebar.
        </p>
      </div>
    </div>
  )
}
