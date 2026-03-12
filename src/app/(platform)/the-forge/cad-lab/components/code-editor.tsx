"use client"

/**
 * @file code-editor.tsx — Monaco-based CadQuery code editor with Run/Reset.
 *
 * @description Interactive code editor for viewing and editing generated CadQuery
 * Python code. Includes Run button (Cmd+Enter) to execute on Modal and Reset to
 * restore original generated code.
 */

import { useCallback, useRef, useState, useEffect, useMemo } from "react"
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react"
import { Play, RotateCcw, Loader2, Send, Undo2, History, GitCompareArrows } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────

export interface CodeVersion {
  code: string
  instruction?: string
  timestamp: number
}

interface CodeEditorProps {
  code: string
  onChange: (code: string) => void
  onRun: () => void
  isRunning: boolean
  onReset: () => void
  /** Refinement: send a natural language instruction to modify the code */
  onRefine?: (instruction: string) => Promise<void>
  isRefining?: boolean
  /** History of code versions for undo */
  history?: CodeVersion[]
  onUndo?: () => void
  canUndo?: boolean
  /** Restore a specific version from history (#9) */
  onRestoreVersion?: (index: number) => void
  /** Previous code for diff view (#15) */
  previousCode?: string | null
}

// ─── Component ──────────────────────────────────────────────────────

export function CodeEditor({
  code,
  onChange,
  onRun,
  isRunning,
  onReset,
  onRefine,
  isRefining,
  history,
  onUndo,
  canUndo,
  onRestoreVersion,
  previousCode,
}: CodeEditorProps): React.ReactNode {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [refinementInput, setRefinementInput] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  // Platform-aware shortcut hint (#12) — initialized in effect to avoid SSR mismatch
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(typeof navigator !== "undefined" && /Mac/.test(navigator.platform))
  }, [])

  // Dynamic editor height based on line count (#13)
  // GOTCHA: window.innerHeight in useMemo causes SSR hydration mismatch.
  // Use state + effect pattern (same as isMac above) to read viewport safely.
  const [maxEditorH, setMaxEditorH] = useState(400)
  useEffect(() => {
    const update = () => setMaxEditorH(Math.min(600, window.innerHeight * 0.5))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const editorHeight = useMemo(() => {
    const lineCount = code.split("\n").length
    return Math.max(200, Math.min(maxEditorH, lineCount * 19 + 20))
  }, [code, maxEditorH])

  // GOTCHA: Monaco's addAction fires once at mount — a useCallback dependency on
  // onRun won't re-register the action. Use a ref to always call the latest onRun.
  const onRunRef = useRef(onRun)
  useEffect(() => { onRunRef.current = onRun }, [onRun])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor

    // Cmd+Enter / Ctrl+Enter to run
    editor.addAction({
      id: "run-cadquery",
      label: "Run CadQuery Code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRunRef.current(),
    })
  }, [])

  const handleRefineSubmit = useCallback(async () => {
    if (!refinementInput.trim() || !onRefine) return
    const instruction = refinementInput.trim()
    try {
      await onRefine(instruction)
      // Only clear input on success — preserve on failure so user can retry
      setRefinementInput("")
    } catch {
      // Parent handles error display via toast
    }
  }, [refinementInput, onRefine])

  const handleRefineKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleRefineSubmit()
    }
  }, [handleRefineSubmit])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="default"
            size="sm"
            onClick={onRun}
            disabled={isRunning || isRefining}
            className="gap-1.5 text-xs h-7"
          >
            {isRunning ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> {isRefining === false ? "Executing..." : "Running..."}</>
            ) : (
              <><Play className="h-3 w-3" /> Run</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isRunning || isRefining}
            className="gap-1 text-xs h-7"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          {canUndo && onUndo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndo}
              disabled={isRunning || isRefining}
              className="gap-1 text-xs h-7"
            >
              <Undo2 className="h-3 w-3" /> Undo
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Diff toggle (#15) */}
          {previousCode && (
            <Button
              variant={showDiff ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowDiff(!showDiff)}
              className="gap-1 text-xs h-7"
            >
              <GitCompareArrows className="h-3 w-3" /> {showDiff ? "Editor" : "Diff"}
            </Button>
          )}
          {history && history.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-1 text-xs h-7"
            >
              <History className="h-3 w-3" /> History ({history.length})
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground">
            {isMac ? "\u2318" : "Ctrl"}+Enter to run
          </span>
        </div>
      </div>

      {/* Refinement feedback (#11) */}
      {isRefining && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Refining code...
        </p>
      )}

      {/* History pills (#9: clickable to restore) */}
      {showHistory && history && history.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {history.slice().reverse().map((v, i) => {
            // Map reversed index back to original history index
            const originalIndex = history.length - 1 - i
            const isCurrent = i === 0
            return (
              <button
                type="button"
                key={v.timestamp}
                onClick={() => {
                  if (!isCurrent && onRestoreVersion) onRestoreVersion(originalIndex)
                }}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  isCurrent
                    ? "bg-international-orange/10 border-international-orange/30 text-international-orange cursor-default"
                    : "bg-muted border-border text-muted-foreground cursor-pointer hover:border-international-orange/40 hover:text-foreground",
                )}
              >
                {v.instruction || (originalIndex === 0 ? "Original" : `Edit ${originalIndex}`)}
              </button>
            )
          })}
        </div>
      )}

      {/* Monaco Editor / Diff Editor (#15) */}
      <div className="border rounded-lg overflow-hidden">
        {showDiff && previousCode ? (
          <DiffEditor
            height={`${editorHeight}px`}
            language="python"
            theme="light"
            original={previousCode}
            modified={code}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              readOnly: true,
              renderSideBySide: true,
            }}
          />
        ) : (
          <Editor
            height={`${editorHeight}px`}
            language="python"
            theme="light"
            value={code}
            onChange={(value) => onChange(value ?? "")}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              fontSize: 12,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 4,
              insertSpaces: true,
              automaticLayout: true,
              readOnly: isRunning || isRefining,
            }}
          />
        )}
      </div>

      {/* Refinement chat input (#10: fix placeholder) */}
      {onRefine && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={refinementInput}
            onChange={(e) => setRefinementInput(e.target.value)}
            onKeyDown={handleRefineKeyDown}
            placeholder={'Describe a change... (e.g., "make walls 3mm thick")'}
            disabled={isRunning || isRefining}
            className="flex-1 h-8 px-3 text-xs border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-international-orange disabled:opacity-50"
          />
          <Button
            variant="default"
            size="sm"
            onClick={handleRefineSubmit}
            disabled={!refinementInput.trim() || isRunning || isRefining}
            className="gap-1 text-xs h-8"
          >
            {isRefining ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
