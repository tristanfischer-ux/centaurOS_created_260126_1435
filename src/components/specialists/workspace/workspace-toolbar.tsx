"use client"

import { FileText, Presentation, BarChart3 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type WorkspaceTab = "document" | "presentation" | "chart"

interface WorkspaceToolbarProps {
  activeTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
  className?: string
}

export function WorkspaceToolbar({
  activeTab,
  onTabChange,
  className,
}: WorkspaceToolbarProps): React.ReactElement {
  return (
    <div className={cn("flex items-center border-b bg-background px-2", className)}>
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as WorkspaceTab)}>
        <TabsList className="h-9 gap-0 bg-transparent p-0">
          <TabsTrigger
            value="document"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <FileText className="h-3.5 w-3.5" />
            Document
          </TabsTrigger>
          <TabsTrigger
            value="presentation"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Presentation className="h-3.5 w-3.5" />
            Presentation
          </TabsTrigger>
          <TabsTrigger
            value="chart"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-international-orange data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Chart
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
