'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Check, Clock, Loader2 } from 'lucide-react'
import {
  toggleChannel,
  unsubscribeEverything,
  resumeEmails,
  pauseForNDays,
} from '@/actions/email-preferences'
import type { EmailChannel } from '@/lib/email/preferences'

interface ChannelRow {
  channel: EmailChannel
  title: string
  description: string
  enabled: boolean
}

interface Props {
  channels: ChannelRow[]
  unsubscribedAllAt: string | null
  pausedAllUntil: string | null
}

export function EmailPreferencesForm(props: Props) {
  const [channels, setChannels] = useState(props.channels)
  const [unsubscribedAllAt, setUnsubscribedAllAt] = useState(props.unsubscribedAllAt)
  const [pausedAllUntil, setPausedAllUntil] = useState(props.pausedAllUntil)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const isHardStopped = !!unsubscribedAllAt
  const isPausedNow =
    !!pausedAllUntil && new Date(pausedAllUntil).getTime() > Date.now()

  function handleToggle(channel: EmailChannel, enabled: boolean) {
    const prev = channels
    setChannels((rows) =>
      rows.map((r) => (r.channel === channel ? { ...r, enabled } : r)),
    )

    startTransition(async () => {
      const result = await toggleChannel(channel, enabled)
      if (!result.ok) {
        setChannels(prev)
        setToast({ kind: 'err', message: result.error || 'Could not save' })
      } else {
        setToast({ kind: 'ok', message: 'Saved' })
      }
    })
  }

  function handleUnsubscribeAll() {
    startTransition(async () => {
      const result = await unsubscribeEverything()
      if (!result.ok) {
        setToast({ kind: 'err', message: result.error || 'Could not unsubscribe' })
      } else {
        setUnsubscribedAllAt(new Date().toISOString())
        setToast({ kind: 'ok', message: 'Unsubscribed from all marketing email' })
      }
    })
  }

  function handleResume() {
    startTransition(async () => {
      const result = await resumeEmails()
      if (!result.ok) {
        setToast({ kind: 'err', message: result.error || 'Could not resume' })
      } else {
        setUnsubscribedAllAt(null)
        setPausedAllUntil(null)
        setToast({ kind: 'ok', message: 'Marketing email resumed' })
      }
    })
  }

  function handlePause90() {
    startTransition(async () => {
      const result = await pauseForNDays(90)
      if (!result.ok) {
        setToast({ kind: 'err', message: result.error || 'Could not pause' })
      } else {
        const until = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        setPausedAllUntil(until)
        setToast({ kind: 'ok', message: 'Paused for 90 days' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Alert variant={toast.kind === 'err' ? 'destructive' : 'default'}>
          {toast.kind === 'ok' ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertDescription>{toast.message}</AlertDescription>
        </Alert>
      )}

      {isHardStopped && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You are currently unsubscribed from all marketing email. Use the Resume
            button below to re-enable.
          </AlertDescription>
        </Alert>
      )}

      {!isHardStopped && isPausedNow && pausedAllUntil && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Marketing email is paused until{' '}
            {new Date(pausedAllUntil).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            . Use the Resume button below to re-enable sooner.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Toggle individual categories on or off. These settings only apply to
            marketing emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {channels.map((row) => (
            <div
              key={row.channel}
              className="flex items-start justify-between gap-4 py-2"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{row.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {row.description}
                </div>
              </div>
              <Switch
                checked={row.enabled && !isHardStopped}
                disabled={isHardStopped || isPending}
                onCheckedChange={(checked) => handleToggle(row.channel, checked)}
                aria-label={`Toggle ${row.title}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pause or stop everything</CardTitle>
          <CardDescription>
            Useful if you are heads-down on something and want a break.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {(isHardStopped || isPausedNow) ? (
              <Button onClick={handleResume} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Resume marketing email
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={handlePause90}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Pause for 90 days
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleUnsubscribeAll}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Unsubscribe from everything
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
