'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createScenario } from '@/actions/money-scenarios'
import { toast } from 'sonner'

const TEMPLATE_OPTIONS = [
  { v: 'custom', label: 'Custom — start blank' },
  { v: 'worst_case', label: 'Worst case — pilot slips' },
  { v: 'best_case', label: 'Best case — sales accelerate' },
  { v: 'hiring', label: 'Hiring — ramp the team' },
] as const

export function NewScenarioView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [templateSource, setTemplateSource] = useState<string>('custom')

  const onSubmit = () => {
    if (!name.trim()) {
      toast.error('Scenario name is required')
      return
    }
    startTransition(async () => {
      const result = await createScenario({
        name: name.trim(),
        question: question.trim() || undefined,
        template_source: templateSource,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Scenario created')
      router.push(`/money/plan/scenario/${result.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New scenario</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Scenarios let you stress-test the plan without changing the live numbers.
          </p>
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Scenario details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="e.g. Worst case · pilot slips"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select value={templateSource} onValueChange={setTemplateSource} disabled={pending}>
              <SelectTrigger id="template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="question">Question (optional)</Label>
            <Textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="What question is this scenario answering? e.g. 'What if our biggest customer doesn't sign?'"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Creating...' : 'Create scenario'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
