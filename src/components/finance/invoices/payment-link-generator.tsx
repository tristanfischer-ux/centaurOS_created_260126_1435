/**
 * @file payment-link-generator.tsx — Payment link display with QR code and share options
 *
 * @description Shows a generated payment link with a QR code, copy button,
 * and share options. Used on the invoice detail page after a payment link
 * has been created.
 */

'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, ExternalLink, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/types/payments'
import type { PaymentLink } from '@/types/finance'

interface PaymentLinkGeneratorProps {
  link: PaymentLink
  className?: string
}

function getPaymentUrl(shortCode: string): string {
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? 'https://fractionalforge.app'
  return `${base}/pay/${shortCode}`
}

export function PaymentLinkGenerator({ link, className }: PaymentLinkGeneratorProps) {
  const [copied, setCopied] = useState(false)
  const paymentUrl = getPaymentUrl(link.shortCode)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Payment Request — ${link.description}`)
    const body = encodeURIComponent(
      `Hi,\n\nPlease find the payment link below:\n\n${paymentUrl}\n\nAmount: ${formatCurrency(link.amount, link.currency)}\n\nThank you.`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Payment Link</CardTitle>
        <CardDescription>
          {link.status === 'active'
            ? 'Share this link with your client to collect payment.'
            : link.status === 'paid'
              ? 'This payment has been received.'
              : `This link is ${link.status}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Amount */}
        <div className="text-center">
          <p className="text-3xl font-display font-bold text-foreground">
            {formatCurrency(link.amount, link.currency)}
          </p>
          {link.description && (
            <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
          )}
        </div>

        {/* QR Code */}
        {link.status === 'active' && (
          <div className="flex justify-center">
            <div className="rounded-lg border border-border p-4 bg-card">
              <QRCodeSVG
                value={paymentUrl}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>
          </div>
        )}

        {/* Copy URL */}
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={paymentUrl}
            className="text-xs font-mono"
          />
          <Button variant="outline" size="icon" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-status-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Actions */}
        {link.status === 'active' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleEmailShare}>
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.open(paymentUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Preview
            </Button>
          </div>
        )}

        {/* Status info */}
        {link.paidAt && (
          <p className="text-xs text-muted-foreground text-center">
            Paid on {new Date(link.paidAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
        {link.expiresAt && link.status === 'active' && (
          <p className="text-xs text-muted-foreground text-center">
            Expires {new Date(link.expiresAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
