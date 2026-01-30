'use client'

import { useState, useTransition } from 'react'
import { 
    Download, 
    FileSpreadsheet, 
    FileText,
    Loader2,
    CheckCircle2,
    Sheet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { exportFoundryData, type ExportFormat, type ExportableTable } from '@/actions/data-export'

interface DataExportTabProps {
    foundryId: string
}

const EXPORTABLE_TABLES: { id: ExportableTable; label: string; description: string }[] = [
    { id: 'profiles', label: 'Team Members', description: 'Names, emails, roles' },
    { id: 'tasks', label: 'Tasks', description: 'All tasks with status and assignments' },
    { id: 'objectives', label: 'Objectives', description: 'Strategic objectives and progress' },
    { id: 'standups', label: 'Standups', description: 'Daily standup reports' },
    { id: 'teams', label: 'Teams', description: 'Team structure and membership' },
    { id: 'orders', label: 'Orders', description: 'Marketplace orders (if applicable)' },
]

type ExtendedExportFormat = ExportFormat | 'sheets'

export function DataExportTab({ foundryId }: DataExportTabProps) {
    const [isPending, startTransition] = useTransition()
    const [selectedTables, setSelectedTables] = useState<ExportableTable[]>(['profiles', 'tasks', 'objectives'])
    const [format, setFormat] = useState<ExtendedExportFormat>('csv')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    const toggleTable = (tableId: ExportableTable) => {
        setSelectedTables(prev => 
            prev.includes(tableId)
                ? prev.filter(t => t !== tableId)
                : [...prev, tableId]
        )
    }
    
    const selectAll = () => {
        setSelectedTables(EXPORTABLE_TABLES.map(t => t.id))
    }
    
    const handleExport = async () => {
        if (selectedTables.length === 0) {
            setError('Please select at least one data type to export')
            return
        }
        
        setError(null)
        setSuccess(false)
        
        startTransition(async () => {
            // Google Sheets uses CSV format for import
            const exportFormat: ExportFormat = format === 'sheets' ? 'csv' : format
            
            const result = await exportFoundryData(
                exportFormat,
                selectedTables,
                dateFrom ? { from: dateFrom, to: dateTo || undefined } : undefined
            )
            
            if (result.error) {
                setError(result.error)
            } else if (result.data) {
                if (format === 'sheets') {
                    // For Google Sheets, open in a new tab with the data
                    const blob = new Blob([result.data], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `foundry-export-${new Date().toISOString().split('T')[0]}.csv`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    
                    // Open Google Sheets import page
                    window.open('https://sheets.google.com/create', '_blank')
                    
                    setSuccess(true)
                    setTimeout(() => setSuccess(false), 3000)
                } else {
                    const blob = new Blob([result.data], { 
                        type: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `foundry-export-${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'xlsx'}`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    
                    setSuccess(true)
                    setTimeout(() => setSuccess(false), 3000)
                }
            }
        })
    }
    
    return (
        <div className="space-y-4">
            {/* Format selection - optimized toggle buttons */}
            <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Export Format</Label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg">
                    <button
                        type="button"
                        onClick={() => setFormat('csv')}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors",
                            format === 'csv'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <FileText className="h-3.5 w-3.5" />
                        CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormat('excel')}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors",
                            format === 'excel'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormat('sheets')}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors",
                            format === 'sheets'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Sheet className="h-3.5 w-3.5" />
                        Sheets
                    </button>
                </div>
            </div>
            
            {/* Date range filter */}
            <div className="space-y-2">
                <Label className="text-xs font-medium text-foundry-700">Date Range (optional)</Label>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-9 text-xs"
                            placeholder="From"
                        />
                    </div>
                    <div className="flex-1">
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9 text-xs"
                            placeholder="To"
                        />
                    </div>
                </div>
            </div>
            
            {/* Data selection */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foundry-700">Data to Export</Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAll}
                        className="h-6 text-xs px-2"
                    >
                        Select All
                    </Button>
                </div>
                
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {EXPORTABLE_TABLES.map((table) => (
                        <div
                            key={table.id}
                            className="flex items-start space-x-2 p-2 rounded-lg bg-foundry-50 hover:bg-foundry-100 transition-colors"
                        >
                            <Checkbox
                                id={table.id}
                                checked={selectedTables.includes(table.id)}
                                onCheckedChange={() => toggleTable(table.id)}
                                className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                                <Label 
                                    htmlFor={table.id} 
                                    className="text-sm font-medium text-foundry-900 cursor-pointer"
                                >
                                    {table.label}
                                </Label>
                                <p className="text-xs text-foundry-500">{table.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            {error && (
                <div className="p-2 text-xs bg-status-error-light text-status-error-dark rounded-md">
                    {error}
                </div>
            )}
            
            {success && (
                <div className="flex items-center gap-2 p-2 text-xs bg-status-success-light text-status-success-dark rounded-md">
                    <CheckCircle2 className="h-4 w-4" />
                    {format === 'sheets' 
                        ? 'CSV downloaded! Import it in the new Google Sheets tab'
                        : 'Export downloaded successfully'
                    }
                </div>
            )}
            
            <Button
                onClick={handleExport}
                disabled={isPending || selectedTables.length === 0}
                className="w-full"
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <Download className="h-4 w-4 mr-2" />
                )}
                Export {selectedTables.length} Data Type{selectedTables.length !== 1 ? 's' : ''}
            </Button>
        </div>
    )
}
