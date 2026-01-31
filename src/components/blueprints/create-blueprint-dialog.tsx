'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createBlueprint } from '@/actions/blueprints'
import type { BlueprintTemplate, ProjectStage } from '@/types/blueprints'
import { PROJECT_STAGES } from '@/types/blueprints'
import {
  Loader2,
  Sparkles,
  FileText,
  Cpu,
  Server,
  Bot,
  Smartphone,
  Stethoscope,
  Package,
  ChevronRight,
} from 'lucide-react'

// Template icons
const templateIcons: Record<string, React.ElementType> = {
  'consumer-electronics': Smartphone,
  electronics: Cpu,
  saas: Server,
  robotics: Bot,
  medical: Stethoscope,
  default: Package,
}

interface CreateBlueprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: BlueprintTemplate[]
}

export function CreateBlueprintDialog({
  open,
  onOpenChange,
  templates,
}: CreateBlueprintDialogProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'describe' | 'template'>('describe')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiDescription, setAiDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [stage, setStage] = useState<ProjectStage>('concept')

  const resetForm = () => {
    setName('')
    setDescription('')
    setAiDescription('')
    setSelectedTemplate(null)
    setStage('concept')
    setError(null)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter a name for your blueprint')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { data, error } = await createBlueprint({
        name: name.trim(),
        description: description.trim() || undefined,
        template_id: selectedTemplate || undefined,
        project_stage: stage,
        ai_description: tab === 'describe' ? aiDescription.trim() : undefined,
      })

      if (error) {
        setError(error)
        return
      }

      if (data) {
        resetForm()
        onOpenChange(false)
        router.push(`/blueprints/${data.id}`)
      }
    } catch (err) {
      setError('Failed to create blueprint')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Create New Blueprint</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'describe' | 'template')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="describe" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Describe Your Product
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-2">
              <FileText className="h-4 w-4" />
              Choose Template
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 space-y-4">
            {/* Common fields */}
            <div className="space-y-2">
              <Label htmlFor="name">Blueprint Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Smart Thermostat v2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage">Project Stage</Label>
              <div className="grid grid-cols-3 gap-2">
                {PROJECT_STAGES.slice(0, 6).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStage(s.value)}
                    className={cn(
                      "h-9 px-3 rounded-md text-sm font-medium transition-all duration-200",
                      "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      stage === s.value
                        ? "bg-international-orange text-white border-international-orange hover:bg-international-orange/90"
                        : "bg-background text-foreground border-input hover:bg-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <TabsContent value="describe" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-description">
                  What are you building?
                </Label>
                <p className="text-sm text-muted-foreground">
                  Describe your product in detail. AI will identify the knowledge domains you need.
                </p>
                <Textarea
                  id="ai-description"
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="e.g., A smart thermostat that senses room temperature and humidity, connects via WiFi, has a color touchscreen display, runs on C-wire power with battery backup, and integrates with major smart home platforms. We'll sell it retail in the US and EU."
                  rows={5}
                />
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-international-orange mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">AI will:</p>
                    <ul className="mt-1 space-y-1 text-muted-foreground">
                      <li>• Identify relevant knowledge domains for your product</li>
                      <li>• Flag likely gaps based on common patterns</li>
                      <li>• Suggest suppliers appropriate for your requirements</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="template" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Select a Template</Label>
                <p className="text-sm text-muted-foreground">
                  Start with a pre-built template for your product category.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                {templates.map((template) => {
                  const Icon = templateIcons[template.product_category.toLowerCase()] || templateIcons.default
                  const isSelected = selectedTemplate === template.id

                  return (
                    <Card
                      key={template.id}
                      className={cn(
                        'cursor-pointer transition-all hover:shadow-md',
                        isSelected && 'ring-2 ring-international-orange'
                      )}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-lg',
                            isSelected ? 'bg-international-orange text-white' : 'bg-muted'
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{template.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {template.estimated_domains} domains
                              </Badge>
                              {template.use_count > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Used {template.use_count}x
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {templates.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No templates available. Use &quot;Describe Your Product&quot; instead.
                </div>
              )}
            </TabsContent>

            {/* Optional description for template mode */}
            {tab === 'template' && (
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of your specific project..."
                  rows={2}
                />
              </div>
            )}
          </div>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isLoading || !name.trim() || (tab === 'template' && !selectedTemplate)}
            className="bg-international-orange hover:bg-international-orange/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create Blueprint
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
