import { Skeleton } from '@/components/ui/skeleton'

export default function MessagesLoading() {
  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 border rounded-xl overflow-hidden">
      {/* Conversation list */}
      <div className="w-80 border-r bg-card">
        <div className="p-4 border-b">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="divide-y">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="p-4 flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <Skeleton className={`h-16 ${i % 2 === 0 ? 'w-2/5' : 'w-3/5'} rounded-xl`} />
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
