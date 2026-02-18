"use client"

/**
 * Public read-only view of a shared artifact.
 * No authentication required; access is by share token only.
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Markdown } from "@/components/ui/markdown"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"

interface SharedContent {
  title: string
  content: string
  contentType: string
}

export default function SharedArtifactPage(): React.ReactElement {
  const params = useParams()
  const token = typeof params.token === "string" ? params.token : ""
  const [data, setData] = useState<SharedContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError("Invalid link")
      setLoading(false)
      return
    }
    fetch(`/api/shared/${token}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Not found")
          if (res.status === 410) throw new Error("This link has expired.")
          throw new Error("Failed to load")
        }
        return res.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-display font-semibold text-foreground mb-6">
          {data.title}
        </h1>
        <div className="prose prose-sm max-w-none">
          <Markdown content={data.content} />
        </div>
      </div>
    </div>
  )
}
