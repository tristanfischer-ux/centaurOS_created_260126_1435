"use client"

import React, { useState, useCallback, useRef } from "react"
import { Upload, FileText, X, Paperclip } from "lucide-react"
import type { AttachedFile } from "../lib/agent-types"

const ACCEPTED_TYPES = [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "text/html",
    "text/xml",
    "application/xml",
]

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".html", ".xml", ".yml", ".yaml", ".tsv"]

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

interface FileDropZoneProps {
    onFilesAdded: (files: AttachedFile[]) => void
    attachedFiles?: AttachedFile[]
    onRemoveFile?: (name: string) => void
    compact?: boolean
}

export function FileDropZone({ onFilesAdded, attachedFiles = [], onRemoveFile, compact = false }: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const readFileAsText = useCallback((file: File): Promise<AttachedFile> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                resolve({
                    name: file.name,
                    content: reader.result as string,
                    type: file.type || "text/plain",
                    size: file.size,
                })
            }
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
            reader.readAsText(file)
        })
    }, [])

    const validateAndRead = useCallback(
        async (files: FileList | File[]) => {
            setError(null)
            const validFiles: File[] = []

            for (const file of Array.from(files)) {
                if (file.size > MAX_FILE_SIZE) {
                    setError(`${file.name} is too large (max 2MB)`)
                    continue
                }

                const ext = "." + file.name.split(".").pop()?.toLowerCase()
                const isValidType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)

                if (!isValidType) {
                    setError(`${file.name} is not a supported text file`)
                    continue
                }

                validFiles.push(file)
            }

            if (validFiles.length === 0) return

            try {
                const results = await Promise.all(validFiles.map(readFileAsText))
                onFilesAdded(results)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to read files")
            }
        },
        [onFilesAdded, readFileAsText]
    )

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragging(false)
            if (e.dataTransfer.files.length > 0) {
                validateAndRead(e.dataTransfer.files)
            }
        },
        [validateAndRead]
    )

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files && e.target.files.length > 0) {
                validateAndRead(e.target.files)
            }
        },
        [validateAndRead]
    )

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    }

    return (
        <div className="space-y-2">
            {/* Drop zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                    relative border-2 border-dashed rounded-lg transition-all cursor-pointer
                    ${compact ? "p-2" : "p-4"}
                    ${isDragging
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <div className={`flex items-center gap-2 ${compact ? "" : "flex-col text-center"}`}>
                    {compact ? (
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                        <Upload className={`text-muted-foreground ${compact ? "w-4 h-4" : "w-6 h-6"}`} />
                    )}
                    <div>
                        <p className={`font-medium text-muted-foreground ${compact ? "text-[11px]" : "text-xs"}`}>
                            {compact ? "Attach files" : "Drop files here or click to browse"}
                        </p>
                        {!compact && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                .txt, .md, .csv, .json, .html, .xml (max 2MB)
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <p className="text-[11px] text-destructive">{error}</p>
            )}

            {/* Attached files list */}
            {attachedFiles.length > 0 && (
                <div className="space-y-1">
                    {attachedFiles.map((file) => (
                        <div
                            key={file.name}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-100 group"
                        >
                            <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-[11px] font-medium text-foreground truncate flex-1">
                                {file.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {formatSize(file.size)}
                            </span>
                            {onRemoveFile && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveFile(file.name)
                                    }}
                                    className="p-0.5 rounded hover:bg-slate-200 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
