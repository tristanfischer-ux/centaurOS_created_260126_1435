"use client"

/**
 * @file code-editor.tsx — Monaco-based CadQuery code editor with Run/Reset.
 *
 * @description Interactive code editor for viewing and editing generated CadQuery
 * Python code. Includes Run button (Cmd+Enter) to execute on Modal and Reset to
 * restore original generated code.
 */

import { useCallback, useRef, useState, useEffect } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { Play, RotateCcw, Loader2, Send, Undo2, History } from "lucide-react"
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
}: CodeEditorProps): React.ReactNode {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [refinementInput, setRefinementInput] = useState("")
  const [showHistory, setShowHistory] = useState(false)

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
              <><Loader2 className="h-3 w-3 animate-spin" /> Running...</>
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
            {"\u2318"}+Enter to run
          </span>
        </div>
      </div>

      {/* History pills */}
      {showHistory && history && history.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {history.slice().reverse().map((v, i) => (
            <span
              key={v.timestamp}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border cursor-default",
                i === 0
                  ? "bg-international-orange/10 border-international-orange/30 text-international-orange"
                  : "bg-muted border-border text-muted-foreground",
              )}
            >
              {v.instruction || (i === history.length - 1 ? "Original" : `Edit ${history.length - 1 - i}`)}
            </span>
          ))}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="border rounded-lg overflow-hidden">
        <Editor
          height="400px"
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
      </div>

      {/* Refinement chat input */}
      {onRefine && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={refinementInput}
            onChange={(e) => setRefinementInput(e.target.value)}
            onKeyDown={handleRefineKeyDown}
            placeholder="Describe a change... (e.g., &quot;make walls 3mm thick&quot;)"
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
