import { Clock } from 'lucide-react'

interface ComingSoonProps {
  title: string
  description?: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
        <Clock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground max-w-md">
        {description || 'This feature is coming soon. We\'re working on it and will let you know when it\'s ready.'}
      </p>
    </div>
  )
}
