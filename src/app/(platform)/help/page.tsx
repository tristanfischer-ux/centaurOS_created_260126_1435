import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  Target, CheckSquare, Users, 
  Keyboard, Mic, ArrowLeft
} from 'lucide-react'

export default function HelpPage() {
  const sections = [
    {
      title: 'Getting Started',
      icon: Target,
      items: [
        { title: 'Create your first objective', description: 'Learn how to set up strategic goals' },
        { title: 'Add and manage tasks', description: 'Break objectives into actionable items' },
        { title: 'Invite team members', description: 'Collaborate with your team' },
        { title: 'Use AI agents', description: 'Leverage AI for task automation' }
      ]
    },
    {
      title: 'Tasks',
      icon: CheckSquare,
      items: [
        { title: 'Task statuses', description: 'Pending → Accepted → Completed flow' },
        { title: 'Forwarding tasks', description: 'Reassign tasks to other team members' },
        { title: 'Task comments', description: 'Collaborate with @mentions' },
        { title: 'File attachments', description: 'Add documents and images to tasks' }
      ]
    },
    {
      title: 'Objectives',
      icon: Target,
      items: [
        { title: 'Manual creation', description: 'Define objectives from scratch' },
        { title: 'Objective packs', description: 'Use pre-configured templates' },
        { title: 'Import from business plan', description: 'AI-powered objective extraction' },
        { title: 'Track progress', description: 'Monitor completion across tasks' }
      ]
    },
    {
      title: 'Teams',
      icon: Users,
      items: [
        { title: 'Create teams', description: 'Group members for collaboration' },
        { title: 'Assign tasks to teams', description: 'Distribute work efficiently' },
        { title: 'Team comparison', description: 'Compare team performance' },
        { title: 'Member roles', description: 'Executive, Apprentice, AI Agent' }
      ]
    }
  ]

  const shortcuts = [
    { key: '⌘K', description: 'Open command palette' },
    { key: 'N', description: 'Quick add new task' },
    { key: 'Shift + ?', description: 'Show all shortcuts' },
    { key: 'Esc', description: 'Close dialogs' }
  ]

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>

      <div className="pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Help Center</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
          Learn how to use CentaurOS effectively
        </p>
      </div>

      {/* Keyboard Shortcuts Card */}
      <Card className="bg-white border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {shortcuts.map(shortcut => (
              <div key={shortcut.key} className="flex items-center gap-3">
                <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono">
                  {shortcut.key}
                </kbd>
                <span className="text-sm text-muted-foreground">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Feature Sections */}
      <div className="grid md:grid-cols-2 gap-6">
        {sections.map(section => {
          const Icon = section.icon
          return (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {section.items.map(item => (
                    <li key={item.title} className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tips */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Mic className="h-5 w-5" />
            Pro Tip: Voice Input
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800">
          <p className="text-sm">
            When creating a task, click the microphone button and speak your task details.
            The AI will automatically extract the title, description, and even suggest an assignee!
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
