'use client'

import { useState } from 'react'
import { 
    Settings, 
    ChevronUp, 
    RefreshCw,
    Download,
    Users,
    X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { DataSyncTab } from './DataSyncTab'
import { DataExportTab } from './DataExportTab'
import { UserManagementTab } from './UserManagementTab'

interface FloatingAdminBoxProps {
    foundryId: string
    isFounder: boolean
    hasAdminAccess: boolean
}

export function FloatingAdminBox({ foundryId, isFounder, hasAdminAccess }: FloatingAdminBoxProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [activeTab, setActiveTab] = useState('users')
    
    // Don't render if user doesn't have admin access
    if (!isFounder && !hasAdminAccess) {
        return null
    }
    
    return (
        <>
            {/* Collapsed state - just a floating button */}
            {!isExpanded && (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-white border border-foundry-200 rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all hover:bg-foundry-50 group"
                    aria-label="Open admin panel"
                >
                    <Settings className="h-5 w-5 text-foundry-600 group-hover:text-international-orange transition-colors" />
                    <span className="text-sm font-medium text-foundry-700">Admin</span>
                    <ChevronUp className="h-4 w-4 text-foundry-400" />
                </button>
            )}
            
            {/* Expanded state - full panel */}
            {isExpanded && (
                <Card className="fixed bottom-4 left-4 z-50 w-[420px] max-h-[600px] bg-white border-foundry-200 shadow-2xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-foundry-100 bg-foundry-50">
                        <div className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-international-orange" />
                            <h2 className="font-semibold text-foundry-900">Admin Panel</h2>
                            {isFounder && (
                                <Badge variant="secondary" className="text-xs bg-international-orange/10 text-international-orange border-0">
                                    Founder
                                </Badge>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(false)}
                            className="h-8 w-8 p-0"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close admin panel</span>
                        </Button>
                    </div>
                    
                    {/* Tabs */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                            <TabsList className="mx-4 mt-4 grid grid-cols-3 bg-foundry-100">
                                <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs">
                                    <Users className="h-3.5 w-3.5" />
                                    Users
                                </TabsTrigger>
                                <TabsTrigger value="export" className="flex items-center gap-1.5 text-xs">
                                    <Download className="h-3.5 w-3.5" />
                                    Export
                                </TabsTrigger>
                                <TabsTrigger value="sync" className="flex items-center gap-1.5 text-xs">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Sync
                                </TabsTrigger>
                            </TabsList>
                            
                            <div className="flex-1 overflow-y-auto p-4">
                                <TabsContent value="users" className="mt-0 h-full">
                                    <UserManagementTab foundryId={foundryId} isFounder={isFounder} />
                                </TabsContent>
                                
                                <TabsContent value="export" className="mt-0 h-full">
                                    <DataExportTab foundryId={foundryId} />
                                </TabsContent>
                                
                                <TabsContent value="sync" className="mt-0 h-full">
                                    <DataSyncTab foundryId={foundryId} isFounder={isFounder} />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                </Card>
            )}
        </>
    )
}
