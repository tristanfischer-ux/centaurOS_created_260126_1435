'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { switchFoundry } from '@/actions/foundry-switching'
import { Building2, Users, ArrowRight, Star } from 'lucide-react'

interface Foundry {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
}

export function WorkspacePickerView({ foundries }: { foundries: Foundry[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSelect(foundryId: string) {
    startTransition(async () => {
      const result = await switchFoundry(foundryId)
      if (result.success) {
        router.push('/updates')
      }
    })
  }

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
          {foundries.map((foundry) => (
            <button
              key={foundry.foundryId}
              onClick={() => handleSelect(foundry.foundryId)}
              disabled={isPending}
              className="w-full group flex items-center gap-4 p-5 rounded-lg border border-slate-200 bg-white hover:border-international-orange/40 hover:shadow-md transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none"
            >
              {/* Icon */}
              <div className="h-12 w-12 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-6 w-6 text-international-orange" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground truncate">
                    {foundry.foundryName}
                  </h3>
                  {foundry.isPrimary && (
                    <Star className="h-3.5 w-3.5 text-international-orange fill-international-orange flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
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
          You can switch workspaces anytime from the sidebar.
        </p>
      </div>
    </div>
  )
}
