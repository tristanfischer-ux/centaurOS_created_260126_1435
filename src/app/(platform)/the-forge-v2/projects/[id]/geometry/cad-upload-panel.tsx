/**
 * @file cad-upload-panel.tsx — Drag-drop upload + file list for /geometry.
 *
 * @description Client component. Shows:
 *   - A drag-drop dropzone scoped under `.g2` so the styling stays isolated.
 *   - A "What is it made of?" material dropdown (15 common options, free-text
 *     stored so the taxonomy can evolve without a DB migration).
 *   - A list of already-uploaded files with format / size / parse status /
 *     uploader / timestamp. Failed rows show the parser error verbatim.
 *
 * @security material_hint is rendered as a normal JSX text node — never raw
 * HTML. parse_error is rendered the same way. No XSS surface.
 */

"use client"

import { useRef, useState, useTransition } from "react"
import {
  Upload,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Boxes,
  Info,
} from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Mirrors the DB enum; if the migration changes, update here.
export type CadFormat = "step" | "stl" | "dxf" | "dwg"
export type ParseStatus = "pending" | "parsing" | "parsed" | "failed"

export interface CadUploadedFile {
  id: string
  filename: string
  format: CadFormat
  sizeBytes: number
  parseStatus: ParseStatus
  parseError: string | null
  materialHint: string | null
  uploaderName: string
  createdAt: string
}

interface CadUploadPanelProps {
  projectId: string
  existingFiles: CadUploadedFile[]
}

// V1 material list — founder-facing dropdown. Stored verbatim as free text.
const MATERIAL_OPTIONS = [
  "Aluminium 6061",
  "Aluminium 7075",
  "Steel 1018",
  "Stainless 304",
  "Stainless 316",
  "Titanium Grade 5",
  "CFRP UD",
  "CFRP woven",
  "Nylon 12",
  "PLA",
  "ABS",
  "Delrin",
  "PEEK",
  "Brass",
  "Copper",
] as const

const ACCEPT_EXT = ".step,.stp,.stl,.dxf,.dwg"
const MAX_MB = 50

export function CadUploadPanel({
  projectId,
  existingFiles,
}: CadUploadPanelProps): React.ReactElement {
  const [material, setMaterial] = useState<string>("")
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    setLastError(null)

    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setLastError(`${file.name} exceeds ${MAX_MB} MB.`)
        continue
      }

      setUploading(true)
      try {
        const form = new FormData()
        form.append("file", file)
        if (material) form.append("material_hint", material)

        const res = await fetch(
          `/the-forge-v2/projects/${projectId}/api/cad-upload`,
          { method: "POST", body: form },
        )
        const body: unknown = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = isErr(body) ? body.error : `HTTP ${res.status}`
          setLastError(`${file.name}: ${msg}`)
          continue
        }
        // Uploaded + row persisted; refresh to pick up the new list.
        startTransition(() => router.refresh())
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        setLastError(`${file.name}: ${msg}`)
      } finally {
        setUploading(false)
      }
    }
  }

  return (
    <section className="g2 space-y-4" aria-labelledby="cad-upload-heading">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-international-orange" />
        <FileUp className="h-4 w-4 text-international-orange" />
        <h2
          id="cad-upload-heading"
          className="text-[11.5px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          CAD uploads · {existingFiles.length} file{existingFiles.length === 1 ? "" : "s"}
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,260px]">
        {/* Dropzone */}
        <div
          className={cn(
            "g2-dropzone rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center gap-3 transition-colors",
            dragOver
              ? "border-international-orange bg-international-orange/5"
              : "border-border bg-muted/30",
            uploading && "opacity-70 pointer-events-none",
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFiles(e.dataTransfer.files)
          }}
        >
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-international-orange/10 text-international-orange">
            <Upload className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Drop a STEP, STL, DXF, or DWG file here
            </p>
            <p className="text-[12px] text-muted-foreground">
              Up to {MAX_MB} MB. Parsed on upload — bounding box, volume, part count.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_EXT}
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
          <p className="text-[11px] text-muted-foreground italic">
            DWG parsing is pending a licensing decision — you can upload, but
            we won&apos;t extract geometry yet. Export to DXF or STEP for full parsing.
          </p>
        </div>

        {/* Material picker */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="material-picker" className="text-xs font-semibold">
              What is it made of?
            </Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger id="material-picker" className="h-9">
                <SelectValue placeholder="Pick a material" />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Optional. We use it for material-aware cost + supplier matching
                downstream.
              </span>
            </p>
          </div>
        </div>
      </div>

      {lastError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
        >
          {lastError}
        </div>
      )}

      {/* File list */}
      {existingFiles.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">File</th>
                <th className="text-left px-4 py-2 font-semibold">Format</th>
                <th className="text-right px-4 py-2 font-semibold">Size</th>
                <th className="text-left px-4 py-2 font-semibold">Material</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-left px-4 py-2 font-semibold">Uploader</th>
                <th className="text-left px-4 py-2 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody>
              {existingFiles.map((f) => (
                <FileRow key={f.id} file={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {existingFiles.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-8 flex flex-col items-center text-center gap-2">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-international-orange/10 text-international-orange">
            <Boxes className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground max-w-sm">
            No CAD files yet. Drop a STEP, STL, DXF, or DWG to unlock geometry-aware
            modules, BOM, costing, and supplier matching.
          </p>
        </div>
      )}
    </section>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

function FileRow({ file }: { file: CadUploadedFile }): React.ReactElement {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-2">
        <span className="font-medium text-foreground break-all">{file.filename}</span>
      </td>
      <td className="px-4 py-2">
        <FormatChip format={file.format} />
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
        {formatMb(file.sizeBytes)}
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {/* SECURITY: rendered as a plain text node, never as HTML */}
        {file.materialHint ?? <span className="italic text-muted-foreground/70">—</span>}
      </td>
      <td className="px-4 py-2">
        <StatusChip status={file.parseStatus} />
        {file.parseStatus === "failed" && file.parseError && (
          <p className="mt-1 text-[11px] text-destructive max-w-sm leading-snug">
            {/* SECURITY: parse_error is rendered as a plain text node */}
            {file.parseError}
          </p>
        )}
      </td>
      <td className="px-4 py-2 text-muted-foreground">{file.uploaderName}</td>
      <td className="px-4 py-2 text-muted-foreground tabular-nums">
        {formatDate(file.createdAt)}
      </td>
    </tr>
  )
}

function FormatChip({ format }: { format: CadFormat }): React.ReactElement {
  const tone: Record<CadFormat, string> = {
    step: "bg-international-orange/10 text-international-orange border-international-orange/30",
    stl: "bg-electric-blue/10 text-electric-blue border-electric-blue/30",
    dxf: "bg-status-warning-light text-status-warning border-status-warning/30",
    dwg: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone[format],
      )}
    >
      {format}
    </span>
  )
}

function StatusChip({ status }: { status: ParseStatus }): React.ReactElement {
  if (status === "parsed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-status-success/30 bg-status-success-light px-1.5 py-0.5 text-[10.5px] font-semibold text-status-success">
        <CheckCircle2 className="h-3 w-3" />
        Parsed
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
      <Clock className="h-3 w-3" />
      {status === "pending" ? "Pending" : "Parsing"}
    </span>
  )
}

// ── Utils ────────────────────────────────────────────────────────────────────

function formatMb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function isErr(v: unknown): v is { error: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    typeof (v as { error: unknown }).error === "string"
  )
}
