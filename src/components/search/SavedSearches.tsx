"use client"

import { useState } from "react"
import {
  Bookmark,
  Bell,
  BellOff,
  Trash2,
  Play,
  MoreVertical,
  Calendar,
  Search,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { SavedSearch, AppliedFilters } from "@/types/search"
import { getFilterSummary } from "@/lib/search/filters"

interface SavedSearchesProps {
  searches: SavedSearch[]
  onRun: (search: SavedSearch) => void
  onDelete: (searchId: string) => Promise<{ success: boolean }>
  onToggleAlert?: (searchId: string, enabled: boolean, frequency?: string) => Promise<{ success: boolean }>
  className?: string
}

export function SavedSearches({
  searches,
  onRun,
  onDelete,
  onToggleAlert,
  className,
}: SavedSearchesProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (searchId: string) => {
    setDeletingId(searchId)
    await onDelete(searchId)
    setDeletingId(null)
  }

  if (searches.length === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <Bookmark className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No saved searches yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Save your searches to quickly re-run them later
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {searches.map((search) => (
        <SavedSearchCard
          key={search.id}
          search={search}
          onRun={() => onRun(search)}
          onDelete={() => handleDelete(search.id)}
          onToggleAlert={onToggleAlert}
          isDeleting={deletingId === search.id}
        />
      ))}
    </div>
  )
}

// ==========================================
// SAVED SEARCH CARD
// ==========================================

interface SavedSearchCardProps {
  search: SavedSearch
  onRun: () => void
  onDelete: () => void
  onToggleAlert?: (searchId: string, enabled: boolean, frequency?: string) => Promise<{ success: boolean }>
  isDeleting?: boolean
}

function SavedSearchCard({
  search,
  onRun,
  onDelete,
  onToggleAlert,
  isDeleting,
}: SavedSearchCardProps) {
  const [isUpdatingAlert, setIsUpdatingAlert] = useState(false)

  const filterSummary = getFilterSummary(search.filters)

  const handleToggleAlert = async () => {
    if (!onToggleAlert) return
    setIsUpdatingAlert(true)
    await onToggleAlert(search.id, !search.is_alert_enabled, search.alert_frequency)
    setIsUpdatingAlert(false)
  }

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{search.name}</h4>
            {search.is_alert_enabled && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                <Bell className="h-3 w-3 mr-1" />
                {search.alert_frequency}
              </Badge>
            )}
          </div>

          {/* Query */}
          {search.query && (
            <p className="text-sm text-muted-foreground">
              <Search className="h-3 w-3 inline mr-1" />
              &quot;{search.query}&quot;
            </p>
          )}

          {/* Filter summary */}
          {filterSummary.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filterSummary.slice(0, 3).map((filter, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-[10px] font-normal"
                >
                  {filter}
                </Badge>
              ))}
              {filterSummary.length > 3 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{filterSummary.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* Date */}
          <p className="text-xs text-muted-foreground mt-2">
            <Calendar className="h-3 w-3 inline mr-1" />
            Created {new Date(search.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRun}
            className="h-8"
          >
            <Play className="h-4 w-4 mr-1" />
            Run
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRun}>
                <Play className="h-4 w-4 mr-2" />
                Run search
              </DropdownMenuItem>
              {onToggleAlert && (
                <DropdownMenuItem
                  onClick={handleToggleAlert}
                  disabled={isUpdatingAlert}
                >
                  {isUpdatingAlert ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : search.is_alert_enabled ? (
                    <BellOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  {search.is_alert_enabled ? "Disable alerts" : "Enable alerts"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  )
}

// ==========================================
// SAVE SEARCH DIALOG
// ==========================================

interface SaveSearchDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string, alertEnabled: boolean, alertFrequency?: string) => Promise<{ success: boolean; error?: string | null }>
  query?: string
  filters?: AppliedFilters
  children?: React.ReactNode
}

export function SaveSearchDialog({
  isOpen,
  onOpenChange,
  onSave,
  query,
  filters,
  children,
}: SaveSearchDialogProps) {
  const [name, setName] = useState("")
  const [alertEnabled, setAlertEnabled] = useState(false)
  const [alertFrequency, setAlertFrequency] = useState<string>("weekly")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter a name")
      return
    }

    setIsSaving(true)
    setError(null)

    const result = await onSave(
      name.trim(),
      alertEnabled,
      alertEnabled ? alertFrequency : undefined
    )

    setIsSaving(false)

    if (result.success) {
      setName("")
      setAlertEnabled(false)
      setAlertFrequency("weekly")
      onOpenChange(false)
    } else {
      setError(result.error || "Failed to save search")
    }
  }

  const filterSummary = filters ? getFilterSummary(filters) : []

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Search</DialogTitle>
          <DialogDescription>
            Save this search to quickly run it again later
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search preview */}
          <div className="bg-muted rounded-lg p-3">
            {query && (
              <p className="text-sm mb-2">
                <Search className="h-3.5 w-3.5 inline mr-1.5" />
                <span className="font-medium">&quot;{query}&quot;</span>
              </p>
            )}
            {filterSummary.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterSummary.map((filter, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {filter}
                  </Badge>
                ))}
              </div>
            )}
            {!query && filterSummary.length === 0 && (
              <p className="text-sm text-muted-foreground">All listings</p>
            )}
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="search-name">Name</Label>
            <Input
              id="search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., AI Tools for Marketing"
            />
          </div>

          {/* Alert settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Get alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Notify me when new matches are found
                </p>
              </div>
              <Button
                variant={alertEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAlertEnabled(!alertEnabled)}
              >
                {alertEnabled ? (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    On
                  </>
                ) : (
                  <>
                    <BellOff className="h-4 w-4 mr-1" />
                    Off
                  </>
                )}
              </Button>
            </div>

            {alertEnabled && (
              <div className="space-y-2">
                <Label className="text-xs">Alert frequency</Label>
                <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="daily">Daily digest</SelectItem>
                    <SelectItem value="weekly">Weekly digest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4 mr-2" />
                Save Search
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
